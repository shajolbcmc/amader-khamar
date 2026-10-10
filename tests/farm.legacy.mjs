import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,addDays,today} from '../src/lib/database.mjs';
import * as f from '../src/lib/service.mjs';
import {passwordHash,verifyPassword,makeSession,lookupSession,revokeSession} from '../src/lib/auth.mjs';

const newDb=()=>createDb(':memory:');
const expectError=(fn,message)=>assert.throws(fn,err=>Boolean(err.message.includes(message)));
function readyLot(db,kg=600){const l=f.addSlotLot(db,{slot_id:1,received_on:'2026-06-01',quantity_kg:kg,cost_bdt:200});f.approveSlotLot(db,l.id,{approved_on:'2026-06-18'});return l;}
function existingBatch(db){const l=readyLot(db);return f.startBatch(db,{bed_id:1,slot_lot_id:l.id,started_on:'2026-07-01',quantity_kg:500,expected_output_kg:230});}

test('schema creates exactly 8 beds + 5 slots, no fabricated stock, income, or orders',()=>{
 const db=newDb();const s=f.summary(db);
 assert.equal(s.beds_total,8);assert.equal(s.slots_total,5);assert.equal(s.beds_active,0);
 assert.equal(s.raw_stock_kg,0);assert.equal(s.report.sales,0);assert.equal(s.report.expenses,0);
 assert.equal(f.publicState(db).products.length,0);
 db.close();
});
test('slot maturation and manager approval are both required',()=>{
 const db=newDb();const lot=f.addSlotLot(db,{slot_id:2,quantity_kg:350,received_on:'2026-08-01'});
 expectError(()=>f.approveSlotLot(db,lot.id,{approved_on:'2026-08-10'}),'ন্যূনতম সময়');
 expectError(()=>f.startBatch(db,{bed_id:1,slot_lot_id:lot.id,started_on:'2026-08-22',quantity_kg:100}),'পরীক্ষিত');
 f.approveSlotLot(db,lot.id,{approved_on:'2026-08-18'});
 expectError(()=>f.startBatch(db,{bed_id:1,slot_lot_id:lot.id,started_on:'2026-08-17',quantity_kg:100}),'পরীক্ষিত');
 const b=f.startBatch(db,{bed_id:1,slot_lot_id:lot.id,started_on:'2026-08-20',quantity_kg:100});
 assert.equal(b.min_ready_on,'2026-10-04');
 assert.equal(f.slots(db).rows[1].stock_kg,250);
 db.close();
});
test('staggered cycle protects the same bed, overuse of dung, and immature harvest',()=>{
 const db=newDb();const batch=existingBatch(db);
 assert.equal(batch.min_ready_on,'2026-08-15');
 expectError(()=>f.startBatch(db,{bed_id:1,slot_lot_id:1,started_on:'2026-07-02',quantity_kg:50}),'সক্রিয়');
 expectError(()=>f.startBatch(db,{bed_id:2,slot_lot_id:1,started_on:'2026-07-02',quantity_kg:150}),'মাত্র');
 expectError(()=>f.harvestBatch(db,batch.id,{harvested_on:'2026-08-08',quantity_kg:250}),'৪৫ দিনের');
 assert.equal(f.beds(db).filter(x=>x.batch_id).length,1);
 const h=f.harvestBatch(db,batch.id,{harvested_on:'2026-08-22',quantity_kg:218});
 assert.equal(f.stocks(db).find(x=>x.sku==='BULK-COMPOST').stock,218);
 assert.equal(f.beds(db).find(x=>x.id===1).batch_id,null);
 expectError(()=>f.harvestBatch(db,batch.id,{harvested_on:'2026-08-22',quantity_kg:20}),'সক্রিয় ব্যাচ নেই');
 const b=f.startBatch(db,{bed_id:1,slot_lot_id:1,started_on:'2026-08-23',quantity_kg:50});
 assert.equal(b.min_ready_on,'2026-10-07');
 db.close();
});
test('packaging is atomic: raw compost decreases, packed stock increases',()=>{
 const db=newDb();const batch=existingBatch(db);f.harvestBatch(db,batch.id,{harvested_on:'2026-08-22',quantity_kg:205});
 const p=f.stocks(db).find(x=>x.sku==='BAG-50');
 f.packageStock(db,{product_id:p.id,quantity:3});
 const items=f.stocks(db);assert.equal(items.find(x=>x.sku==='BULK-COMPOST').stock,55);assert.equal(items.find(x=>x.sku==='BAG-50').stock,3);
 expectError(()=>f.packageStock(db,{product_id:p.id,quantity:2}),'প্রয়োজন');
 assert.equal(f.stocks(db).find(x=>x.sku==='BAG-50').stock,3);
 db.close();
});
test('orders reserve actual stock, reject overselling, and cancel only once',()=>{
 const db=newDb();f.adjustStock(db,{product_id:2,delta:6,notes:'Opening pack stock count'});
 const p=f.stocks(db).find(x=>x.id===2);f.addProduct(db,{...p,price_bdt:1250,published:true});
 const order=f.placeOrder(db,{customer_name:'Rahim',phone:'01710000000',address:'Dhaka District',items:[{product_id:p.id,qty:2},{product_id:p.id,qty:2}]});
 assert.equal(order.total,5000);assert.equal(f.stocks(db).find(x=>x.id===p.id).stock,2);
 expectError(()=>f.placeOrder(db,{customer_name:'A',phone:'01710000000',address:'Dhaka',items:[{product_id:p.id,qty:3}]}),'মাত্র');
 f.changeOrder(db,order.id,{status:'cancelled'});
 assert.equal(f.stocks(db).find(x=>x.id===p.id).stock,6);
 f.changeOrder(db,order.id,{status:'cancelled'}); // idempotent: does not release stock twice
 assert.equal(f.stocks(db).find(x=>x.id===p.id).stock,6);
 db.close();
});
test('monthly report counts only received payments and recorded expenses',()=>{
 const db=newDb();f.adjustStock(db,{product_id:2,delta:2,notes:'Starting inventory'});
 const p=f.stocks(db).find(x=>x.id===2);f.addProduct(db,{...p,price_bdt:1000,published:true});
 const order=f.placeOrder(db,{customer_name:'Buyer',phone:'01710000000',address:'Dhaka',items:[{product_id:2,qty:1}]});
 f.addExpense(db,{spent_on:today(),category:'শ্রমিক',amount_bdt:200});
 let report=f.report(db);assert.equal(report.sales,0);assert.equal(report.expenses,200);assert.equal(report.net_profit,-200);
 f.changeOrder(db,order.id,{status:'confirmed'});f.changeOrder(db,order.id,{status:'packed'});f.changeOrder(db,order.id,{status:'delivered',payment_status:'paid'});
 report=f.report(db);assert.equal(report.sales,1000);assert.equal(report.net_profit,800);
 db.close();
});
test('editable content stays unpublished until explicitly published; settings feed public site',()=>{
 const db=newDb();f.addPost(db,{slug:'soil-care',title:'মাটির যত্ন',excerpt:'Organic',body:'যত্নের কথা',published:false,category:'knowledge'});
 assert.equal(f.publicState(db).posts.length,0);
 const post=db.prepare('SELECT * FROM posts').get();f.addPost(db,{...post,published:true,category:'knowledge'});
 assert.equal(f.publicState(db).posts[0].category,'knowledge');
 f.saveSettings(db,{farm_name:'পরীক্ষামূলক খামার',address:'Test Farm',cycle_min_days:'45',cycle_max_days:'60',team_info:'Team description'});
 assert.equal(f.publicState(db).settings.farm_name,'পরীক্ষামূলক খামার');
 assert.equal(f.publicState(db).settings.team_info,'Team description');
 db.close();
});
test('login uses salted scrypt, expiring revocable session (not default password)',()=>{
 const db=newDb();const secret='long-secure-password-123';const hash=passwordHash(secret);
 assert.ok(verifyPassword(secret,hash));assert.equal(verifyPassword('bad',hash),false);
 db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES (?,?,?,?)').run('admin@test.com','Admin',hash,'admin');
 const token=makeSession(db,1);assert.equal(lookupSession(db,token)?.email,'admin@test.com');
 revokeSession(db,token);assert.equal(lookupSession(db,token),null);
 db.close();
});
test('date helper advances across month/year and rejects impossible dates',()=>{
 assert.equal(addDays('2026-12-20',45),'2027-02-03');
 const db=newDb();expectError(()=>f.addSlotLot(db,{slot_id:1,received_on:'2026-02-31',quantity_kg:30}),'সঠিক YYYY-MM-DD');db.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTestDb} from './fixtures/test-db.mjs';
import * as f from '../src/lib/service.mjs';
import {addDays,today,placeholders} from '../src/lib/database.mjs';
import {passwordHash,verifyPassword,makeSession,lookupSession,revokeSession} from '../src/lib/auth.mjs';

async function rejects(fn,message){await assert.rejects(fn, e=>Boolean(e.message.includes(message)),`Expected error ${message}`);}
const actor={id:999,role:'admin'};
async function readyLot(db,slotId=1,kg=600){
 const l=await f.addSlotLot(db,{slot_id:slotId,received_on:'2026-01-01',quantity_kg:kg,cost_bdt:200},actor);
 await f.approveSlotLot(db,l.id,{approved_on:'2026-01-20'},actor);
 return l;
}
async function activeBatch(db,bedId=1,slotId=1,qty=500){
 const l=await readyLot(db,slotId);
 const b=await f.startBatch(db,{bed_id:bedId,slot_lot_id:l.id,started_on:'2026-02-01',quantity_kg:qty,expected_output_kg:230},actor);
 return {batch:b,lot:l};
}

test('default layout is 8 beds/5 slots, with no fake stock or revenue',async()=>{
 const db=makeTestDb();try{
 const s=await f.summary(db),p=await f.publicState(db);
 assert.equal(s.beds_total,8);assert.equal(s.slots_total,5);
 assert.equal(s.raw_stock_kg,0);assert.equal(s.report.sales,0);assert.equal(s.report.expenses,0);
 assert.equal(p.products.length,0);assert.equal(p.bed_status.length,8);
 }finally{db.close();}
});

test('create, edit, archive and delete facilities without fixed limits',async()=>{
 const db=makeTestDb();try{
 const b=await f.addFacility(db,'bed',{capacity_kg:300},actor);
 const s=await f.addFacility(db,'slot',{code:'New Store',capacity_kg:750},actor);
 assert.equal(b.code,'Bed 9');assert.equal(s.code,'New Store');
 assert.equal((await f.summary(db)).beds_total,9);
 await rejects(()=>f.addFacility(db,'bed',{code:'BED 9'},actor),'আগে থেকেই আছে');
 const changed=await f.updateFacility(db,'bed',b.id,{code:'Bed A',enabled:false},actor);
 assert.equal(changed.enabled,0);
 const pub=await f.publicState(db);assert.equal(pub.bed_status.some(x=>x.id===b.id),false);
 await f.deleteFacility(db,'slot',s.id,actor);
 assert.equal((await f.summary(db)).slots_total,5);
 }finally{db.close();}
});

test('slot maturation, approval and duplicate approval are validated',async()=>{
 const db=makeTestDb();try{
 const lot=await f.addSlotLot(db,{slot_id:1,received_on:'2026-01-01',quantity_kg:500},actor);
 await rejects(()=>f.approveSlotLot(db,lot.id,{approved_on:'2026-01-10'},actor),'ন্যূনতম সময়');
 await rejects(()=>f.startBatch(db,{bed_id:1,slot_lot_id:lot.id,started_on:'2026-02-01',quantity_kg:100},actor),'পরীক্ষিত');
 const approved=await f.approveSlotLot(db,lot.id,{approved_on:'2026-01-18'},actor);
 assert.equal(approved.approved_on,'2026-01-18');
 assert.equal((await f.approveSlotLot(db,lot.id,{approved_on:'2026-01-21'},actor)).already_approved,true);
 assert.equal((await f.slots(db)).lots.find(l=>l.id===lot.id).remaining_kg,500);
 }finally{db.close();}
});

test('batch, care, harvest and refill update actual quantities',async()=>{
 const db=makeTestDb();try{
 const {batch,lot}=await activeBatch(db);
 assert.equal(batch.min_ready_on,'2026-03-18');
 assert.equal((await f.slots(db)).rows[0].stock_kg,100);
 await rejects(()=>f.startBatch(db,{bed_id:1,slot_lot_id:lot.id,started_on:'2026-02-02',quantity_kg:50},actor),'সক্রিয়');
 await rejects(()=>f.startBatch(db,{bed_id:2,slot_lot_id:lot.id,started_on:'2026-02-02',quantity_kg:150},actor),'মাত্র');
 await f.addCare(db,{batch_id:batch.id,logged_on:'2026-02-10',action:'পানি ছিটানো',moisture_pct:65},actor);
 assert.equal((await f.adminState(db)).care[0].action,'পানি ছিটানো');
 await rejects(()=>f.harvestBatch(db,batch.id,{harvested_on:'2026-03-01',quantity_kg:230},actor),'৪৫ দিনের');
 await f.harvestBatch(db,batch.id,{harvested_on:'2026-03-25',quantity_kg:230},actor);
 assert.equal((await f.stocks(db)).find(p=>p.sku==='BULK-COMPOST').stock,230);
 assert.equal((await f.beds(db))[0].batch_id,null);
 await rejects(()=>f.harvestBatch(db,batch.id,{harvested_on:'2026-03-25',quantity_kg:50},actor),'সক্রিয় ব্যাচ নেই');
 const next=await f.startBatch(db,{bed_id:1,slot_lot_id:lot.id,started_on:'2026-04-01',quantity_kg:50},actor);
 assert.ok(next.id>batch.id);
 }finally{db.close();}
});

test('cannot archive active bed or slot holding manure',async()=>{
 const db=makeTestDb();try{
 const l=await readyLot(db);
 const b=await f.startBatch(db,{bed_id:1,slot_lot_id:l.id,started_on:'2026-02-01',quantity_kg:500},actor);
 await rejects(()=>f.updateFacility(db,'bed',1,{enabled:false},actor),'সক্রিয়');
 await rejects(()=>f.updateFacility(db,'slot',1,{enabled:false},actor),'গোবর আছে');
 await rejects(()=>f.deleteFacility(db,'bed',1,actor),'ইতিহাস');
 await f.harvestBatch(db,b.id,{harvested_on:'2026-03-30',quantity_kg:180},actor);
 await f.updateFacility(db,'bed',1,{enabled:false},actor);
 assert.equal((await f.summary(db)).beds_total,7);
 }finally{db.close();}
});

test('packaging reduces bulk and increases packaged inventory atomically',async()=>{
 const db=makeTestDb();try{
 const {batch}=await activeBatch(db);
 await f.harvestBatch(db,batch.id,{harvested_on:'2026-03-20',quantity_kg:205},actor);
 const pack=(await f.stocks(db)).find(p=>p.sku==='BAG-50');
 await f.packageStock(db,{product_id:pack.id,quantity:3},actor);
 const rows=await f.stocks(db);
 assert.equal(rows.find(p=>p.sku==='BULK-COMPOST').stock,55);
 assert.equal(rows.find(p=>p.sku==='BAG-50').stock,3);
 await rejects(()=>f.packageStock(db,{product_id:pack.id,quantity:2},actor),'প্রয়োজন');
 assert.equal((await f.stocks(db)).find(p=>p.sku==='BAG-50').stock,3);
 }finally{db.close();}
});

test('order reservation prevents overselling and cancellation releases inventory exactly once',async()=>{
 const db=makeTestDb();try{
 await f.adjustStock(db,{product_id:2,delta:6,notes:'Opening count'},actor);
 const p=(await f.stocks(db)).find(x=>x.id===2);
 await f.addProduct(db,{...p,price_bdt:1250,published:true},actor);
 const order=await f.placeOrder(db,{customer_name:'Rahim',phone:'01710000000',address:'Dhaka District',items:[{product_id:p.id,qty:2},{product_id:p.id,qty:2}]});
 assert.equal(order.total,5000);
 assert.equal((await f.stocks(db)).find(x=>x.id===2).stock,2);
 await rejects(()=>f.placeOrder(db,{customer_name:'Buyer',phone:'01710000000',address:'Dhaka',items:[{product_id:2,qty:3}]}),'মাত্র');
 await f.changeOrder(db,order.id,{status:'cancelled'},actor);
 await f.changeOrder(db,order.id,{status:'cancelled'},actor);
 assert.equal((await f.stocks(db)).find(x=>x.id===2).stock,6);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE reason='order-cancel-release'").get()).n,1);
 }finally{db.close();}
});

test('monthly reports use paid orders and actual expenses',async()=>{
 const db=makeTestDb();try{
 await f.adjustStock(db,{product_id:2,delta:2,notes:'Opening stock'},actor);
 await f.addProduct(db,{...(await f.stocks(db)).find(p=>p.id===2),price_bdt:1000,published:true},actor);
 const order=await f.placeOrder(db,{customer_name:'Buyer',phone:'01710000000',address:'Dhaka',items:[{product_id:2,qty:1}]});
 await f.addExpense(db,{spent_on:today(),category:'শ্রম',amount_bdt:200},actor);
 assert.equal((await f.report(db)).net_profit,-200);
 await f.changeOrder(db,order.id,{status:'confirmed'},actor);
 await f.changeOrder(db,order.id,{status:'packed'},actor);
 await f.changeOrder(db,order.id,{status:'delivered',payment_status:'paid'},actor);
 assert.equal((await f.report(db)).net_profit,800);
 }finally{db.close();}
});

test('posts, public settings, enquiries and login sessions are persisted',async()=>{
 const db=makeTestDb();try{
 await f.addPost(db,{slug:'farm-care',title:'Care',body:'বাংলা',category:'knowledge',published:false},actor);
 assert.equal((await f.publicState(db)).posts.length,0);
 const post=(await db.prepare('SELECT * FROM posts').get());
 await f.addPost(db,{...post,published:true},actor);
 await f.saveSettings(db,{farm_name:'নতুন নাম',team_info:'Team',cycle_min_days:'45',cycle_max_days:'60'},actor);
 assert.equal((await f.publicState(db)).settings.farm_name,'নতুন নাম');
 assert.equal((await f.publicState(db)).posts[0].slug,'farm-care');
 const inquiry=await f.addInquiry(db,{name:'Azim',phone:'01710000000',subject:'অর্ডার',message:'hello'});
 await f.changeInquiry(db,inquiry.id,{status:'contacted'},actor);
 assert.equal((await db.prepare('SELECT status FROM inquiries WHERE id=?').get(inquiry.id)).status,'contacted');
 const secret='long-secure-password-123',hash=passwordHash(secret);
 assert.equal(verifyPassword(secret,hash),true);
 assert.equal(verifyPassword('wrong',hash),false);
 await db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run('admin@test.com','Admin',hash,'admin');
 const token=await makeSession(db,1);
 assert.equal((await lookupSession(db,token)).email,'admin@test.com');
 await revokeSession(db,token);
 assert.equal(await lookupSession(db,token),null);
 }finally{db.close();}
});

test('parameters avoid replacing question marks inside string literals',()=>{
 assert.equal(placeholders("SELECT '?' AS literal, x FROM t WHERE y=? AND z=?"),"SELECT '?' AS literal, x FROM t WHERE y=$1 AND z=$2");
 assert.equal(placeholders('SELECT "?" FROM t WHERE x=?'), 'SELECT "?" FROM t WHERE x=$1');
 assert.equal(addDays('2026-12-20',45),'2027-02-03');
});

import test from 'node:test';
import assert from 'node:assert/strict';
// IMPORTANT: use a disposable empty Neon test branch (never production).
const url=process.env.TEST_DATABASE_URL;
const allowed=url && url!==process.env.DATABASE_URL;
test('live Neon PostgreSQL: schema, login, bed/slot, care, harvest, order', {skip:!allowed},async()=>{
 const {getDb,closeDb}=await import('../src/lib/database.mjs');
 const {setupSchema,seedInitialData}=await import('../src/lib/setup.mjs');
 const svc=await import('../src/lib/service.mjs');
 const {passwordHash,makeSession,lookupSession}=await import('../src/lib/auth.mjs');
 process.env.DATABASE_URL=url;
 try{
  const db=getDb();
  await setupSchema(db);
  // Refuse to tamper with anything but a brand new test branch.
  const existing=(await db.prepare('SELECT COUNT(*) AS n FROM beds').get()).n;
  if(existing)throw new Error('TEST_DATABASE_URL MUST point at an empty disposable Neon branch');
  await seedInitialData(db);
  const user=await db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run('tester@example.test','Tester',passwordHash('temporary-test-password-123'),'admin');
  const token=await makeSession(db,user.lastInsertRowid);
  assert.equal((await lookupSession(db,token)).role,'admin');
  const actor={id:user.lastInsertRowid};
  const bed=await svc.addFacility(db,'bed',{code:'New PG bed'},actor);
  const slot=await svc.addFacility(db,'slot',{code:'New PG slot'},actor);
  const lot=await svc.addSlotLot(db,{slot_id:slot.id,received_on:'2026-01-01',quantity_kg:400},actor);
  await svc.approveSlotLot(db,lot.id,{approved_on:'2026-01-20'},actor);
  const batch=await svc.startBatch(db,{bed_id:bed.id,slot_lot_id:lot.id,started_on:'2026-02-01',quantity_kg:300},actor);
  await svc.addCare(db,{batch_id:batch.id,logged_on:'2026-02-05',action:'পানি'},actor);
  await svc.harvestBatch(db,batch.id,{harvested_on:'2026-03-30',quantity_kg:130},actor);
  await svc.addProduct(db,{id:1,sku:'BULK-COMPOST',name:'Bulk',unit:'kg',compost_kg_per_unit:1,price_bdt:120,published:true},actor);
  const order=await svc.placeOrder(db,{customer_name:'Customer',phone:'01710000000',address:'Dhaka',items:[{product_id:1,qty:10}]});
  assert.equal(order.total,1200);
  assert.equal((await svc.stocks(db)).find(x=>x.id===1).stock,120);
  assert.equal((await svc.adminState(db)).orders.length,1);
  assert.equal((await svc.publicState(db)).bed_status.length,9);
  const buyers=await Promise.allSettled([
    svc.placeOrder(db,{customer_name:'Buyer A',phone:'01710000000',address:'Dhaka',items:[{product_id:1,qty:100}]}),
    svc.placeOrder(db,{customer_name:'Buyer B',phone:'01710000000',address:'Dhaka',items:[{product_id:1,qty:100}]})
  ]);
  assert.equal(buyers.filter(x=>x.status==='fulfilled').length,1,'concurrent orders must not oversell');
  assert.equal((await svc.stocks(db)).find(x=>x.id===1).stock,20);
  console.log('Live PostgreSQL integration passed on disposable test branch.');
 }finally{await closeDb();}
});

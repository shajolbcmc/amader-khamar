import { getDb, transaction, addDays, isoDate, today, money } from './database.mjs';
import { randomUUID } from 'node:crypto';

export class AppError extends Error { constructor(message, status=400){ super(message); this.status=status; } }
const fail = (message,status=400) => { throw new AppError(message,status); };
const required = (v, label, max=300) => {
  if(typeof v !== 'string' || !v.trim()) fail(`${label} লিখুন`);
  if(v.trim().length>max) fail(`${label} সর্বোচ্চ ${max} অক্ষর`);
  return v.trim();
};
const optional = (v,max=1500) => typeof v==='string' ? v.trim().slice(0,max) : '';
const amount = (v, label, allowZero=false) => {
  if(v==='' || v==null || !Number.isFinite(Number(v))) fail(`${label} সঠিক সংখ্যা হতে হবে`);
  const n = Number(v);
  if(allowZero ? n<0 : n<=0) fail(`${label} ${allowZero?'ঋণাত্মক নয়':'শূন্যের বেশি'} হতে হবে`);
  if(n>100000000) fail(`${label} খুব বেশি`);
  return money(n);
};
const whole = (v,label) => { const n=Number(v); if (!Number.isSafeInteger(n) || n<0 || n>100000000) fail(`${label} পূর্ণসংখ্যা হতে হবে`); return n; };
const id = v => { const n=Number(v); if(!Number.isSafeInteger(n) || n<1) fail('অবৈধ আইডি'); return n; };
const validDate = (v,label='তারিখ') => { try {return isoDate(v,label)}catch(e){fail(e.message)} };
const notFuture = (v) => { if(v>today()) fail('ভবিষ্যতের তারিখে সম্পন্ন কাজ রেকর্ড করা যাবে না'); return v; };
const single = async (db,table,key) => (await db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id(key)));
const getSetting = async (db,k,def) => (await db.prepare('SELECT value FROM settings WHERE key=?').get(k))?.value ?? def;
async function record(db, actor, action, entity, entityId, data={}) { (await db.prepare('INSERT INTO audit(actor_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)').run(actor?.id??null,action,entity,entityId??null,JSON.stringify(data))); }
async function stock(db, productId) { return money((await db.prepare('SELECT COALESCE(SUM(qty),0) AS qty FROM stock_movements WHERE product_id=?').get(productId)).qty); }
export async function stocks(db=getDb()) {
  return (await db.prepare(`SELECT p.*, COALESCE((SELECT ROUND(SUM(m.qty),3) FROM stock_movements m WHERE m.product_id=p.id),0) AS stock FROM products p ORDER BY p.id`).all());
}
export async function beds(db=getDb()) {
  return (await db.prepare(`SELECT b.*, x.id AS batch_id,x.started_on,x.min_ready_on,x.max_ready_on,
   x.input_kg,x.expected_output_kg,x.worm_count,x.status AS batch_status,
   (SELECT COUNT(*) FROM batches h WHERE h.bed_id=b.id) AS history_count,
   (SELECT COUNT(*) FROM care_logs c WHERE c.batch_id=x.id) AS care_count
   FROM beds b LEFT JOIN batches x ON x.bed_id=b.id AND x.status='active' ORDER BY b.id`).all());
}
export async function slots(db=getDb()) {
  const rows = (await db.prepare(`SELECT s.*,COALESCE((SELECT SUM(remaining_kg) FROM slot_lots l WHERE l.slot_id=s.id),0) AS stock_kg,
    (SELECT COUNT(*) FROM slot_lots h WHERE h.slot_id=s.id) AS history_count,
    COALESCE((SELECT SUM(remaining_kg) FROM slot_lots l WHERE l.slot_id=s.id AND l.approved_on IS NOT NULL),0) AS approved_kg
    FROM slots s ORDER BY s.id`).all());
  const lots = (await db.prepare('SELECT l.*,s.code AS slot_code,s.enabled AS slot_enabled FROM slot_lots l JOIN slots s ON s.id=l.slot_id ORDER BY l.received_on DESC,l.id DESC').all());
  return { rows, lots };
}

const facilityType={
  bed:{table:'beds',singular:'বেড',prefix:'Bed',history:'batches',foreignKey:'bed_id'},
  slot:{table:'slots',singular:'স্লট',prefix:'Slot',history:'slot_lots',foreignKey:'slot_id'}
};
function configFacility(kind){const config=facilityType[kind];if(!config)fail('বেড/স্লট ধরন সঠিক নয়');return config;}
function capacityValue(value){return value==='' || value==null ? null : amount(value,'ধারণক্ষমতা');}
async function facilityCode(db,config,value){
  let code=optional(value,70);
  if(!code){
    const last=(await db.prepare(`SELECT COALESCE(MAX(id),0) AS n FROM ${config.table}`).get()).n;
    let number=last+1;
    while((await db.prepare(`SELECT id FROM ${config.table} WHERE code=? COLLATE NOCASE`).get(`${config.prefix} ${number}`)))number++;
    code=`${config.prefix} ${number}`;
  }
  if(!code.trim())fail('নাম লিখুন');
  return code;
}
async function validateFacility(db,config,facilityId,newCapacity,newEnabled){
  if(config===facilityType.bed){
    const active=(await db.prepare("SELECT input_kg FROM batches WHERE bed_id=? AND status='active'").get(facilityId));
    if(!newEnabled && active)fail('সক্রিয় উৎপাদন ব্যাচ সংগ্রহ না করে বেড বন্ধ করা যাবে না');
    if(newCapacity!=null && active && active.input_kg>newCapacity+0.00001)fail('বেডের বর্তমান গোবরের চেয়ে ধারণক্ষমতা কমানো যাবে না');
  } else {
    const remaining=(await db.prepare('SELECT COALESCE(SUM(remaining_kg),0) AS qty FROM slot_lots WHERE slot_id=?').get(facilityId)).qty;
    if(!newEnabled && remaining>0.00001)fail('স্লটে এখনো গোবর আছে। প্রথমে গোবর ব্যবহার/স্থানান্তর করুন, তারপর বন্ধ করুন');
    if(newCapacity!=null && remaining>newCapacity+0.00001)fail('স্লটের বর্তমান মজুতের চেয়ে ধারণক্ষমতা কমানো যাবে না');
  }
}
export async function addFacility(db,kind,data,actor){
  const config=configFacility(kind);
  return transaction(db,async ()=>{
    const code=(await facilityCode(db,config,data.code));
    if((await db.prepare(`SELECT id FROM ${config.table} WHERE code=? COLLATE NOCASE`).get(code)))fail(`এই নামে ${config.singular} আগে থেকেই আছে`,409);
    const cap=capacityValue(data.capacity_kg),notes=optional(data.notes);
    const r=(await db.prepare(`INSERT INTO ${config.table}(code,capacity_kg,notes) VALUES(?,?,?)`).run(code,cap,notes));
    const newId=Number(r.lastInsertRowid);
    (await record(db,actor,'create',kind,newId,{code,capacity_kg:cap}));
    return {id:newId,code,enabled:1};
  });
}
export async function updateFacility(db,kind,facilityId,data,actor){
  const config=configFacility(kind);
  return transaction(db,async ()=>{
    const existing=(await single(db,config.table,facilityId));if(!existing)fail(`${config.singular} পাওয়া যায়নি`,404);
    const code=Object.hasOwn(data,'code') ? required(data.code,`${config.singular} নাম`,70) : existing.code;
    const conflict=(await db.prepare(`SELECT id FROM ${config.table} WHERE code=? COLLATE NOCASE AND id<>?`).get(code,existing.id));
    if(conflict)fail(`এই নামে ${config.singular} আগে থেকেই আছে`,409);
    const cap=Object.hasOwn(data,'capacity_kg')?capacityValue(data.capacity_kg):existing.capacity_kg;
    const notes=Object.hasOwn(data,'notes')?optional(data.notes):existing.notes;
    let enabled=existing.enabled;
    if(Object.hasOwn(data,'enabled')){
      if(![true,false,0,1,'0','1'].includes(data.enabled))fail('সক্রিয়/নিষ্ক্রিয় অবস্থা সঠিক নয়');
      enabled=[true,1,'1'].includes(data.enabled)?1:0;
    }
    (await validateFacility(db,config,existing.id,cap,enabled));
    (await db.prepare(`UPDATE ${config.table} SET code=?,capacity_kg=?,notes=?,enabled=? WHERE id=?`).run(code,cap,notes,enabled,existing.id));
    (await record(db,actor,'update',kind,existing.id,{code,capacity_kg:cap,enabled}));
    return {id:existing.id,code,capacity_kg:cap,enabled};
  });
}
export async function deleteFacility(db,kind,facilityId,actor){
  const config=configFacility(kind);
  return transaction(db,async ()=>{
    const existing=(await single(db,config.table,facilityId));if(!existing)fail(`${config.singular} পাওয়া যায়নি`,404);
    const history=(await db.prepare(`SELECT COUNT(*) AS n FROM ${config.history} WHERE ${config.foreignKey}=?`).get(existing.id)).n;
    if(history)fail(`এই ${config.singular} এর উৎপাদন/মজুত ইতিহাস আছে। মুছে না ফেলে নিষ্ক্রিয় করুন`,409);
    (await db.prepare(`DELETE FROM ${config.table} WHERE id=?`).run(existing.id));
    (await record(db,actor,'delete',kind,existing.id,{code:existing.code}));
    return {id:existing.id,deleted:true};
  });
}
export async function report(db=getDb(), month=today().slice(0,7)) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('মাস YYYY-MM হতে হবে');
  const sales = (await db.prepare(`SELECT COALESCE(SUM(amount_bdt),0) AS value, COUNT(*) AS orders FROM orders
    WHERE payment_status='paid' AND status!='cancelled' AND substring((paid_at::timestamp + interval '6 hours')::text,1,7)=?`).get(month));
  const costs = (await db.prepare('SELECT COALESCE(SUM(amount_bdt),0) AS value FROM expenses WHERE substr(spent_on,1,7)=?').get(month));
  const harvest = (await db.prepare('SELECT COALESCE(SUM(quantity_kg),0) AS kg,COUNT(*) AS batches FROM harvests WHERE substr(harvested_on,1,7)=?').get(month));
  const orderCount = (await db.prepare("SELECT count(*) AS n FROM orders WHERE substring((created_at::timestamp + interval '6 hours')::text,1,7)=?").get(month)).n;
  const expenses = (await db.prepare(`SELECT category,ROUND(SUM(amount_bdt),2) AS total FROM expenses WHERE substr(spent_on,1,7)=? GROUP BY category ORDER BY total DESC`).all(month));
  const plot = (await db.prepare(`SELECT substr(spent_on,1,7) AS period,round(SUM(amount_bdt),2) AS costs FROM expenses
     WHERE spent_on>=to_char((?::date - interval '5 months'),'YYYY-MM-DD') GROUP BY period ORDER BY period`).all(`${month}-01`));
  const revenues = (await db.prepare(`SELECT substring((paid_at::timestamp + interval '6 hours')::text,1,7) AS period,round(SUM(amount_bdt),2) AS sales FROM orders WHERE payment_status='paid' AND status!='cancelled'
      AND (paid_at::timestamp + interval '6 hours') >= (?::date - interval '5 months') GROUP BY period ORDER BY period`).all(`${month}-01`));
  const timeline=[];
  for(let j=5;j>=0;j--){const day=new Date(`${month}-01T00:00:00Z`); day.setUTCMonth(day.getUTCMonth()-j);const k=day.toISOString().slice(0,7);timeline.push({month:k, sales: revenues.find(v=>v.period===k)?.sales||0, expenses: plot.find(v=>v.period===k)?.costs||0});}
  return { month,sales:money(sales.value),expenses:money(costs.value),net_profit:money(sales.value-costs.value),paid_orders:sales.orders,new_orders:orderCount,harvest_kg:money(harvest.kg),harvest_batches:harvest.batches, expense_breakdown: expenses, monthly_trend:timeline };
}
export async function summary(db=getDb()) {
  const allBeds=(await beds(db)), allSlots=(await slots(db));
  const b=allBeds.filter(row=>row.enabled), s={rows:allSlots.rows.filter(row=>row.enabled)};
  const active=b.filter(row=>row.batch_id); const idle=b.filter(row=>!row.batch_id);
  const ready=active.filter(row=>row.min_ready_on<=today());
  const currentMonth=today().slice(0,7);
  const upcoming=active.filter(row=>row.min_ready_on.slice(0,7)===currentMonth);
  const goods=(await stocks(db));
  const pendingOrders=(await db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('pending','confirmed','packed')").get()).n;
  const openTasks=(await db.prepare("SELECT COUNT(*) n FROM tasks WHERE status='pending'").get()).n;
  return {beds_total:b.length,beds_archived:allBeds.length-b.length,beds_active:active.length,beds_idle:idle.length,beds_eligible:ready.length,slots_total:s.rows.length,slots_archived:allSlots.rows.length-s.rows.length,raw_stock_kg:money(s.rows.reduce((a,v)=>a+v.stock_kg,0)),approved_stock_kg:money(s.rows.reduce((a,v)=>a+v.approved_kg,0)),compost_stock_kg:goods.find(x=>x.sku==='BULK-COMPOST')?.stock||0,upcoming_batches:upcoming.length,expected_output_kg: upcoming.every(x=>x.expected_output_kg!=null) ? money(upcoming.reduce((a,v)=>a+v.expected_output_kg,0)) : null,pending_orders:pendingOrders,open_tasks:openTasks,report:(await report(db,currentMonth))};
}
export async function adminState(db=getDb(), month) {
  return {summary:(await summary(db)),beds:(await beds(db)),slots:(await slots(db)),
    batches:(await db.prepare('SELECT x.*,b.code AS bed_code FROM batches x JOIN beds b ON b.id=x.bed_id ORDER BY x.started_on DESC,x.id DESC LIMIT 300').all()),
    care:(await db.prepare('SELECT c.*,b.code bed_code FROM care_logs c JOIN batches x ON c.batch_id=x.id JOIN beds b ON b.id=x.bed_id ORDER BY c.logged_on DESC,c.id DESC LIMIT 70').all()),
    harvests:(await db.prepare('SELECT h.*,b.code bed_code FROM harvests h JOIN batches x ON h.batch_id=x.id JOIN beds b ON b.id=x.bed_id ORDER BY h.harvested_on DESC,h.id DESC LIMIT 100').all()),
    products:(await stocks(db)),orders:(await db.prepare(`SELECT o.*, (SELECT string_agg(i.product_name||' × '||i.qty::text,', ' ORDER BY i.id) FROM order_items i WHERE i.order_id=o.id) AS items_label FROM orders o ORDER BY o.id DESC LIMIT 200`).all()),
    expenses:(await db.prepare('SELECT * FROM expenses ORDER BY spent_on DESC,id DESC LIMIT 200').all()),
    tasks:(await db.prepare(`SELECT * FROM tasks ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, due_on ASC,id DESC LIMIT 250`).all()),
    inquiries:(await db.prepare('SELECT * FROM inquiries ORDER BY id DESC LIMIT 200').all()),
    posts:(await db.prepare('SELECT * FROM posts ORDER BY id DESC').all()),
    settings:Object.fromEntries((await db.prepare('SELECT key,value FROM settings').all()).map(x=>[x.key,x.value])),
    report:(await report(db,month||today().slice(0,7))),
    recent_audit:(await db.prepare('SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 40').all())};
}
export async function publicState(db=getDb()) {
  // Public requests avoid private-order/expense report queries unless the owner
  // explicitly enables financial disclosure. This saves Neon network round trips.
  const [bedRows, slotData, products, publishedPosts, settingRows] = await Promise.all([
    beds(db), slots(db), stocks(db),
    db.prepare('SELECT id,slug,title,excerpt,body,category,created_at FROM posts WHERE published=1 ORDER BY id DESC LIMIT 50').all(),
    db.prepare("SELECT key,value FROM settings WHERE key IN ('farm_name','description','address','phone','email','cycle_min_days','cycle_max_days','precompost_days','about_story','team_info','knowledge_intro','map_url','public_show_financials')").all()
  ]);
  const settings=Object.fromEntries(settingRows.map(r=>[r.key,r.value]));
  const enabledBeds=bedRows.filter(b=>b.enabled);
  const enabledSlots=slotData.rows.filter(s=>s.enabled);
  const summaryData={
    beds_total:enabledBeds.length,
    beds_active:enabledBeds.filter(b=>b.batch_id).length,
    slots_total:enabledSlots.length,
    harvest_ready_beds:enabledBeds.filter(b=>b.batch_id && b.min_ready_on<=today()).length,
    raw_stock_kg:money(enabledSlots.reduce((n,s)=>n+s.stock_kg,0))
  };
  return {
    settings,
    products:products.filter(p=>p.published&&p.enabled),
    posts:publishedPosts,
    public_financials:settings.public_show_financials==='1'?await report(db,today().slice(0,7)):null,
    bed_status:enabledBeds.map(b=>({id:b.id,code:b.code,active:!!b.batch_id,started_on:b.started_on,min_ready_on:b.min_ready_on,max_ready_on:b.max_ready_on})),
    slot_status:enabledSlots.map(s=>({id:s.id,code:s.code,stock_kg:s.stock_kg,approved_kg:s.approved_kg})),
    summary:summaryData,
    upcoming:enabledBeds.filter(b=>b.batch_id).map(b=>({bed_code:b.code,min_ready_on:b.min_ready_on,max_ready_on:b.max_ready_on})).sort((a,b)=>a.min_ready_on.localeCompare(b.min_ready_on))
  };
}
export async function addSlotLot(db, data, actor) {
  const slot = (await single(db,'slots',data.slot_id));
  if(!slot||!slot.enabled) fail('স্লট পাওয়া যায়নি',404);
  const qty=amount(data.quantity_kg,'গোবরের পরিমাণ');
  const received=notFuture(validDate(data.received_on||today()));
  const cost=amount(data.cost_bdt??0,'মজুত খরচ',true);
  const minDays=Number((await getSetting(db,'precompost_days','15')));
  return transaction(db,async ()=>{
    const current= (await db.prepare('SELECT COALESCE(SUM(remaining_kg),0) qty FROM slot_lots WHERE slot_id=?').get(slot.id)).qty;
    if(slot.capacity_kg!=null && current+qty > slot.capacity_kg+0.00001) fail('স্লটের ধারণক্ষমতার বেশি গোবর রাখা যাবে না');
    const r=(await db.prepare('INSERT INTO slot_lots(slot_id,received_on,ready_not_before,initial_kg,remaining_kg,material_cost_bdt,notes) VALUES(?,?,?,?,?,?,?)')
      .run(slot.id,received,addDays(received,minDays),qty,qty,cost,optional(data.notes)));
    if(cost>0) (await db.prepare('INSERT INTO expenses(spent_on,category,amount_bdt,notes) VALUES(?,?,?,?)').run(received,'গোবর সংগ্রহ',cost,`Slot ${slot.id}, Lot ${r.lastInsertRowid}`));
    (await record(db,actor,'receive','slot_lot',Number(r.lastInsertRowid),{slot_id:slot.id,qty}));
    return {id:Number(r.lastInsertRowid),ready_not_before:addDays(received,minDays)};
  });
}
export async function approveSlotLot(db, lotId, data={}, actor) {
  const approved=notFuture(validDate(data.approved_on||today()));
  return transaction(db,async ()=>{
    const lot=(await single(db,'slot_lots',lotId)); if(!lot) fail('গোবরের ব্যাচ নেই',404);
    if(lot.approved_on)return {id:lot.id,approved_on:lot.approved_on,already_approved:true};
    const slot=(await single(db,'slots',lot.slot_id));
    if(!slot?.enabled)fail('নিষ্ক্রিয় স্লটের গোবর অনুমোদন করা যাবে না');
    if(approved < lot.ready_not_before) fail(`গোবর প্রস্তুতির ন্যূনতম সময় শেষ হবে ${lot.ready_not_before}। পরীক্ষা করে তার পরে অনুমোদন করুন`);
    if(lot.remaining_kg<=0) fail('মজুত শেষ');
    (await db.prepare('UPDATE slot_lots SET approved_on=? WHERE id=?').run(approved,lot.id));
    (await record(db,actor,'approve','slot_lot',lot.id,{approved_on:approved}));return {id:lot.id, approved_on:approved};
  });
}
export async function startBatch(db, data, actor) {
  const bed=(await single(db,'beds',data.bed_id)), lot=(await single(db,'slot_lots',data.slot_lot_id));
  if(!bed||!bed.enabled) fail('বেড পাওয়া যায়নি',404);
  if(!lot) fail('মজুত ব্যাচ পাওয়া যায়নি',404);
  if(!(await single(db,'slots',lot.slot_id))?.enabled)fail('নিষ্ক্রিয় স্লটের গোবর ব্যবহার করা যাবে না');
  const date=notFuture(validDate(data.started_on||today()));
  const qty=amount(data.quantity_kg,'গোবরের পরিমাণ');
  if(bed.capacity_kg!=null && qty>bed.capacity_kg+0.00001)fail('বেডের ধারণক্ষমতার বেশি গোবর দেওয়া যাবে না');
  const expected=data.expected_output_kg==null||data.expected_output_kg===''?null:amount(data.expected_output_kg,'সম্ভাব্য উৎপাদন',true);
  const worms=data.worm_count==null||data.worm_count===''?null:whole(data.worm_count,'কেঁচো সংখ্যা');
  if(!lot.approved_on || lot.ready_not_before>date || lot.approved_on>date) fail('শুধু পরীক্ষিত ও প্রস্তুত স্লটের গোবর ব্যবহার করা যাবে');
  const min=Number((await getSetting(db,'cycle_min_days','45'))),max=Number((await getSetting(db,'cycle_max_days','60')));
  return transaction(db,async ()=>{
    if((await db.prepare("SELECT id FROM batches WHERE bed_id=? AND status='active'").get(bed.id))) fail('এই বেডে আগে থেকেই একটি সক্রিয় ব্যাচ আছে');
    const available=(await db.prepare('SELECT remaining_kg FROM slot_lots WHERE id=?').get(lot.id))?.remaining_kg||0;
    if(available+0.00001<qty) fail(`এই স্লটে মাত্র ${available} কেজি গোবর আছে`);
    const r=(await db.prepare('INSERT INTO batches(bed_id,started_on,min_ready_on,max_ready_on,input_kg,expected_output_kg,worm_count,notes) VALUES(?,?,?,?,?,?,?,?)')
      .run(bed.id,date,addDays(date,min),addDays(date,max),qty,expected,worms,optional(data.notes)));
    (await db.prepare('UPDATE slot_lots SET remaining_kg=ROUND(remaining_kg-?,3) WHERE id=?').run(qty,lot.id));
    (await db.prepare('INSERT INTO batch_feed(batch_id,slot_lot_id,quantity_kg,fed_on) VALUES(?,?,?,?)').run(r.lastInsertRowid,lot.id,qty,date));
    (await record(db,actor,'start','batch',Number(r.lastInsertRowid),{bed:bed.code,qty,lot:lot.id}));
    return {id:Number(r.lastInsertRowid),min_ready_on:addDays(date,min),max_ready_on:addDays(date,max)};
  });
}
export async function addCare(db,data,actor){
  const batch=(await single(db,'batches',data.batch_id));if(!batch||batch.status!=='active')fail('সক্রিয় ব্যাচ পাওয়া যায়নি',404);
  const logged=notFuture(validDate(data.logged_on||today()));
  if(logged<batch.started_on)fail('ব্যাচ শুরু হওয়ার আগের পরিচর্যা গ্রহণযোগ্য নয়');
  const moisture=data.moisture_pct==null||data.moisture_pct===''?null:amount(data.moisture_pct,'আর্দ্রতা',true);
  const temp=data.temp_c==null||data.temp_c===''?null:Number(data.temp_c);
  if(moisture!=null && moisture>100)fail('আর্দ্রতা ০-১০০% হতে হবে');
  if(temp!=null && (!Number.isFinite(temp)||temp < -20 ||temp>100))fail('তাপমাত্রা সঠিক নয়');
  const action=required(data.action,'পরিচর্যার কাজ',120);
  const r=(await db.prepare('INSERT INTO care_logs(batch_id,logged_on,moisture_pct,temp_c,action,notes) VALUES(?,?,?,?,?,?)').run(batch.id,logged,moisture,temp,action,optional(data.notes)));
  (await record(db,actor,'care','batch',batch.id,{action}));return {id:Number(r.lastInsertRowid)};
}
export async function harvestBatch(db, batchId,data,actor){
  const batch=(await single(db,'batches',batchId));if(!batch||batch.status!=='active')fail('সক্রিয় ব্যাচ নেই',404);
  const harvested=notFuture(validDate(data.harvested_on||today()));
  if(harvested < batch.min_ready_on)fail(`${batch.min_ready_on} এর আগে ৪৫ দিনের ন্যূনতম চক্র শেষ হবে না`);
  const qty=amount(data.quantity_kg,'সংগ্রহকৃত সার');
  return transaction(db,async ()=>{
    const bulk=(await db.prepare("SELECT id FROM products WHERE sku='BULK-COMPOST'").get());
    if(!bulk)fail('Bulk compost SKU পাওয়া যায়নি');
    const r=(await db.prepare('INSERT INTO harvests(batch_id,harvested_on,quantity_kg,notes) VALUES(?,?,?,?)').run(batch.id,harvested,qty,optional(data.notes)));
    (await db.prepare("UPDATE batches SET status='harvested' WHERE id=? AND status='active'").run(batch.id));
    (await db.prepare('INSERT INTO stock_movements(product_id,qty,reason,ref_type,ref_id) VALUES(?,?,?,?,?)').run(bulk.id,qty,'harvest','harvest',r.lastInsertRowid));
    (await record(db,actor,'harvest','batch',batch.id,{qty,harvested}));return {id:Number(r.lastInsertRowid),qty};
  });
}
export async function addProduct(db,data,actor){
 const name=required(data.name,'পণ্যের নাম',150); const sku=required(data.sku,'SKU',60).toUpperCase();
 if(!/^[A-Z0-9-]+$/.test(sku))fail('SKU শুধু A-Z, 0-9 ও - হতে হবে');
 const price=amount(data.price_bdt??0,'মূল্য',true);
 const conversion=amount(data.compost_kg_per_unit??0,'প্যাক প্রতি সারের কেজি',true);
 const unit=required(data.unit||'pack','ইউনিট',20);
 const product={sku,name,category:optional(data.category,40)||'compost',description:optional(data.description,500),unit,compost:conversion,price,published:data.published?1:0};
 if(data.published && price<=0) fail('প্রকাশের আগে পণ্যের মূল্য দিন');
 return transaction(db,async ()=>{
   if(data.id){const existing=(await single(db,'products',data.id));if(!existing)fail('পণ্য নেই',404);if(existing.sku==='BULK-COMPOST' && sku!==existing.sku)fail('Bulk compost SKU পরিবর্তন করা যায় না');
     (await db.prepare('UPDATE products SET sku=?,name=?,category=?,description=?,unit=?,compost_kg_per_unit=?,price_bdt=?,published=? WHERE id=?').run(product.sku,product.name,product.category,product.description,product.unit,product.compost,product.price,product.published,existing.id));
     (await record(db,actor,'update','product',existing.id,product));return {id:existing.id};
   }
   const r=(await db.prepare('INSERT INTO products(sku,name,category,description,unit,compost_kg_per_unit,price_bdt,published) VALUES(?,?,?,?,?,?,?,?)').run(product.sku,product.name,product.category,product.description,product.unit,product.compost,product.price,product.published));
   (await record(db,actor,'create','product',Number(r.lastInsertRowid),product));return {id:Number(r.lastInsertRowid)};
 });
}
export async function packageStock(db,data,actor){
 const product=(await single(db,'products',data.product_id));if(!product)fail('পণ্য নেই',404);
 if(product.sku==='BULK-COMPOST'||product.compost_kg_per_unit<=0)fail('এটি সার প্যাকেটের SKU নয়');
 const qty=amount(data.quantity,'প্যাক সংখ্যা'); if(!Number.isInteger(qty))fail('প্যাক সংখ্যা পূর্ণসংখ্যা দিন');
 const needed=money(qty*product.compost_kg_per_unit);
 return transaction(db,async ()=>{
   const bulk=(await db.prepare("SELECT id FROM products WHERE sku='BULK-COMPOST'").get());if(!bulk)fail('Bulk compost নেই');
   if((await stock(db,bulk.id))+0.00001<needed)fail(`প্যাকেট বানাতে ${needed} কেজি সার প্রয়োজন`);
   const r=(await db.prepare('INSERT INTO stock_movements(product_id,qty,reason,ref_type,notes) VALUES(?,?,?,?,?)').run(bulk.id,-needed,'packaging','product',`To ${product.sku}`));
   (await db.prepare('INSERT INTO stock_movements(product_id,qty,reason,ref_type,ref_id,notes) VALUES(?,?,?,?,?,?)').run(product.id,qty,'packaging','product',r.lastInsertRowid,`From bulk ${needed} kg`));
   (await record(db,actor,'package','product',product.id,{qty,needed}));return {qty,used_kg:needed};
 });
}
export async function adjustStock(db,data,actor){
 const product=(await single(db,'products',data.product_id));if(!product)fail('পণ্য নেই',404);
 const delta=Number(data.delta);if(!Number.isFinite(delta)||delta===0||Math.abs(delta)>1000000)fail('স্টক পরিবর্তন সঠিক নয়');
 if(product.unit!=='kg' && !Number.isInteger(delta))fail('প্যাক/পিসের সংখ্যা পূর্ণসংখ্যা হতে হবে');
 const notes=required(data.notes,'সমন্বয়ের কারণ',400);
 return transaction(db,async ()=>{
   if((await stock(db,product.id))+delta < -0.00001)fail('নেগেটিভ স্টক অনুমোদিত নয়');
   const r=(await db.prepare('INSERT INTO stock_movements(product_id,qty,reason,notes) VALUES(?,?,?,?)').run(product.id,delta,'manual-adjustment',notes));
   (await record(db,actor,'adjust','product',product.id,{delta,notes}));return {id:Number(r.lastInsertRowid)};
 });
}
export async function placeOrder(db,data){
 const customer=required(data.customer_name,'নাম',100), phone=required(data.phone,'ফোন',40),address=required(data.address,'ঠিকানা',500);
 if(!/^[+0-9()\-\s]{7,40}$/.test(phone))fail('ফোন নম্বর সঠিক নয়');
 if(!Array.isArray(data.items)||!data.items.length||data.items.length>30)fail('অর্ডারের পণ্য যোগ করুন');
 const merged=new Map();for(const item of data.items){const pid=id(item.product_id),qty=amount(item.qty,'পরিমাণ');merged.set(pid,money((merged.get(pid)||0)+qty));}
 return transaction(db,async ()=>{
   let subtotal=0;const selections=[];
   for(const [pid,qty] of merged.entries()){
     const p=(await single(db,'products',pid));if(!p||!p.published||!p.enabled||p.price_bdt<=0)fail('একটি পণ্য এখন অর্ডারের জন্য উপলব্ধ নয়');
     if(p.unit!=='kg'&&!Number.isInteger(qty))fail(`${p.name}: পূর্ণসংখ্যা দিন`);
     const available=(await stock(db,pid));if(available+0.00001<qty)fail(`${p.name}: মাত্র ${available} ${p.unit} স্টকে আছে`);
     subtotal=money(subtotal+qty*p.price_bdt);selections.push({p,qty});
   }
   const delivery=amount((await getSetting(db,'delivery_fee_bdt','0')),'ডেলিভারি চার্জ',true);
   const total=money(subtotal+delivery);
   const r=(await db.prepare('INSERT INTO orders(code,customer_name,phone,address,notes,amount_bdt,delivery_fee_bdt) VALUES(?,?,?,?,?,?,?)')
      .run(`TMP-${randomUUID()}`,customer,phone,address,optional(data.notes),total,delivery));
   const orderId=Number(r.lastInsertRowid);
   const code=`AK-${today().replaceAll('-','')}-${String(orderId).padStart(5,'0')}`;
   (await db.prepare('UPDATE orders SET code=? WHERE id=?').run(code,orderId));
   for(const {p,qty} of selections){
      (await db.prepare('INSERT INTO order_items(order_id,product_id,product_name,qty,unit_price_bdt) VALUES(?,?,?,?,?)').run(orderId,p.id,p.name,qty,p.price_bdt));
      (await db.prepare('INSERT INTO stock_movements(product_id,qty,reason,ref_type,ref_id) VALUES(?,?,?,?,?)').run(p.id,-qty,'order-reservation','order',orderId));
   }
   (await record(db,null,'place','order',orderId,{code,total}));return {id:orderId,code,total};
 });
}
const allowedTransitions={pending:['confirmed','cancelled'],confirmed:['packed','cancelled'],packed:['delivered','cancelled'],delivered:[],cancelled:[]};
export async function changeOrder(db,orderId,data,actor){
 return transaction(db,async ()=>{
 const existing=(await single(db,'orders',orderId));if(!existing)fail('অর্ডার পাওয়া যায়নি',404);
 const status=data.status||existing.status;const payment=data.payment_status||existing.payment_status;
 if(!['paid','unpaid','refunded'].includes(payment))fail('পেমেন্ট স্ট্যাটাস সঠিক নয়');
 if(status!==existing.status && !allowedTransitions[existing.status]?.includes(status))fail(`${existing.status} থেকে ${status} করা যাবে না`);
 if(status==='cancelled' && payment==='paid')fail('টাকা ফেরত/Refund রেকর্ড ছাড়া পরিশোধিত অর্ডার বাতিল করা যাবে না');
 if(existing.status==='cancelled' && payment!==existing.payment_status)fail('বাতিল অর্ডারে পেমেন্ট পরিবর্তন করা যাবে না');
 if(payment==='refunded' && existing.payment_status!=='paid')fail('শুধু Paid অর্ডার Refund করা যায়');
 if(payment==='paid' && existing.payment_status==='refunded')fail('Refund হয়ে যাওয়া অর্ডার পুনরায় paid নয়');
   if(status==='cancelled' && existing.status!=='cancelled'){
      const lines=(await db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(existing.id));
      for(const line of lines)(await db.prepare('INSERT INTO stock_movements(product_id,qty,reason,ref_type,ref_id) VALUES(?,?,?,?,?)').run(line.product_id,line.qty,'order-cancel-release','order',existing.id));
   }
   (await db.prepare('UPDATE orders SET status=?,payment_status=?, paid_at=CASE WHEN ?=\'paid\' AND payment_status!=\'paid\' THEN datetime(\'now\') WHEN ?=\'refunded\' THEN NULL ELSE paid_at END, delivered_at=CASE WHEN ?=\'delivered\' THEN datetime(\'now\') ELSE delivered_at END WHERE id=?').run(status,payment,payment,payment,status,existing.id));
   (await record(db,actor,'status','order',existing.id,{status,payment}));return {id:existing.id,status,payment_status:payment};
 });
}
export async function addExpense(db,data,actor){
 const spent=notFuture(validDate(data.spent_on||today())),category=required(data.category,'খরচের ধরন',100),cost=amount(data.amount_bdt,'খরচের টাকা');
 const r=(await db.prepare('INSERT INTO expenses(spent_on,category,amount_bdt,notes) VALUES(?,?,?,?)').run(spent,category,cost,optional(data.notes)));
 (await record(db,actor,'create','expense',Number(r.lastInsertRowid),{category,cost}));return {id:Number(r.lastInsertRowid)};
}
export async function addTask(db,data,actor){
 const title=required(data.title,'কাজের নাম',200), due=validDate(data.due_on||today());
 const priority=['urgent','normal','low'].includes(data.priority)?data.priority:'normal';
 const r=(await db.prepare('INSERT INTO tasks(title,description,due_on,priority) VALUES(?,?,?,?)').run(title,optional(data.description),due,priority));
 (await record(db,actor,'create','task',Number(r.lastInsertRowid),{title}));return {id:Number(r.lastInsertRowid)};
}
export async function toggleTask(db,taskId,data,actor){
 const task=(await single(db,'tasks',taskId));if(!task)fail('কাজ পাওয়া যায়নি',404);
 const status=data.status==='done'?'done':data.status==='pending'?'pending':null;if(!status)fail('status: done/pending');
 (await db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status,task.id));(await record(db,actor,'status','task',task.id,{status}));return {id:task.id,status};
}
export async function addPost(db,data,actor){
 const title=required(data.title,'পোস্টের নাম',160),slug=required(data.slug,'Slug',150).toLowerCase();
 if(!/^[a-z0-9-]+$/.test(slug))fail('Slug শুধু a-z, 0-9 ও - হবে');
 const excerpt=optional(data.excerpt,400),body=optional(data.body,20000),published=data.published?1:0;
 const category=['blog','knowledge','video'].includes(data.category)?data.category:'blog';
 if(category==='video' && !/^https:\/\//.test(body))fail('ভিডিও লিঙ্ক অবশ্যই https:// হতে হবে');
 return transaction(db,async ()=>{
   if(data.id){const post=(await single(db,'posts',data.id));if(!post)fail('পোস্ট নেই',404);
     (await db.prepare('UPDATE posts SET slug=?,title=?,excerpt=?,body=?,published=?,category=? WHERE id=?').run(slug,title,excerpt,body,published,category,post.id));
     (await record(db,actor,'update','post',post.id,{slug}));return {id:post.id};
   }
   const r=(await db.prepare('INSERT INTO posts(slug,title,excerpt,body,published,category) VALUES(?,?,?,?,?,?)').run(slug,title,excerpt,body,published,category));
   (await record(db,actor,'create','post',Number(r.lastInsertRowid),{slug}));return {id:Number(r.lastInsertRowid)};
 });
}
export async function addInquiry(db,data){
 const name=required(data.name,'নাম',120),phone=required(data.phone,'ফোন',40),subject=required(data.subject,'বিষয়',120);
 if(!/^[+0-9()\-\s]{7,40}$/.test(phone))fail('ফোন নম্বর সঠিক নয়');
 const msg=optional(data.message,2000);
 const r=(await db.prepare('INSERT INTO inquiries(name,phone,subject,message) VALUES(?,?,?,?)').run(name,phone,subject,msg));
 return {id:Number(r.lastInsertRowid)};
}
export async function changeInquiry(db,inqId,data,actor){
 const row=(await single(db,'inquiries',inqId));if(!row)fail('বার্তা নেই',404);
 const status=String(data.status||'');if(!['new','contacted','closed'].includes(status))fail('স্ট্যাটাস সঠিক নয়');
 (await db.prepare('UPDATE inquiries SET status=? WHERE id=?').run(status,row.id));(await record(db,actor,'status','inquiry',row.id,{status}));return {id:row.id,status};
}
export async function saveSettings(db,data,actor){
 const allowed=['farm_name','description','address','phone','email','delivery_fee_bdt','cycle_min_days','cycle_max_days','precompost_days','about_story','team_info','knowledge_intro','map_url','public_show_financials'];
 const out={};for(const key of allowed)if(Object.prototype.hasOwnProperty.call(data,key))out[key]=optional(String(data[key]),1200);
 if(!out.farm_name && Object.prototype.hasOwnProperty.call(out,'farm_name'))fail('খামারের নাম লিখুন');
 if(out.map_url && !/^https:\/\//.test(out.map_url))fail('ম্যাপ URL অবশ্যই https:// হবে');
 if(out.public_show_financials && !['0','1'].includes(out.public_show_financials))fail('পাবলিক আর্থিক রিপোর্ট সেটিং সঠিক নয়');
 if(Object.prototype.hasOwnProperty.call(out,'delivery_fee_bdt'))out.delivery_fee_bdt=String(amount(out.delivery_fee_bdt,'ডেলিভারি চার্জ',true));
 for(const k of ['cycle_min_days','cycle_max_days','precompost_days'])if(Object.prototype.hasOwnProperty.call(out,k))out[k]=String(whole(out[k],k));
 const min=Number(out.cycle_min_days||(await getSetting(db,'cycle_min_days','45')));
 const max=Number(out.cycle_max_days||(await getSetting(db,'cycle_max_days','60')));
 if(min<1||max<min||max>365)fail('চক্রের দিন সঠিক নয়');
 if(Number(out.precompost_days||(await getSetting(db,'precompost_days','15')))<1 || Number(out.precompost_days||(await getSetting(db,'precompost_days','15')))>365)fail('প্রি-কম্পোস্ট ১–৩৬৫ দিন হতে হবে');
 return transaction(db,async ()=>{
   for(const [key,value] of Object.entries(out))(await db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value));
   (await record(db,actor,'update','settings',null,Object.keys(out)));return {updated:Object.keys(out)};
 });
}
export async function inventoryHistory(db=getDb()){
 return (await db.prepare('SELECT m.*,p.name product_name,p.unit FROM stock_movements m JOIN products p ON p.id=m.product_id ORDER BY m.id DESC LIMIT 160').all());
}

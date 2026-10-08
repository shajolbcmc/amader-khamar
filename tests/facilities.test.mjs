import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDb} from '../src/lib/database.mjs';
import * as f from '../src/lib/service.mjs';

const newDb=()=>createDb(':memory:');
const actor={id:101,role:'admin'};
function fails(fn,message){assert.throws(fn,error=>error.message.includes(message));}

// No preloaded quantities: layout is a starting template, not a hard limit.
test('bed/slot count grows dynamically and returns the correct active counts',()=>{
 const db=newDb();
 assert.equal(f.summary(db).beds_total,8);
 assert.equal(f.summary(db).slots_total,5);
 const b=f.addFacility(db,'bed',{code:'',capacity_kg:'350',notes:'বাড়ির পেছনে'},actor);
 const s=f.addFacility(db,'slot',{code:'',capacity_kg:750},actor);
 assert.equal(b.code,'Bed 9');assert.equal(s.code,'Slot 6');
 assert.equal(f.summary(db).beds_total,9);assert.equal(f.summary(db).slots_total,6);
 assert.equal(f.publicState(db).bed_status.length,9);assert.equal(f.publicState(db).slot_status.length,6);
 assert.equal(f.adminState(db).beds.find(x=>x.id===b.id).capacity_kg,350);
 fails(()=>f.addFacility(db,'bed',{code:'BED 9'},actor),'আগে থেকেই আছে');
 assert.equal(f.summary(db).beds_total,9);
 db.close();
});

test('approved lot appears in admin state and is available to start a batch',()=>{
 const db=newDb();
 const slot=f.addFacility(db,'slot',{code:'New Storage'},actor);
 const bed=f.addFacility(db,'bed',{code:'New Production',capacity_kg:300},actor);
 const lot=f.addSlotLot(db,{slot_id:slot.id,quantity_kg:500,received_on:'2026-04-01'},actor);
 fails(()=>f.approveSlotLot(db,lot.id,{approved_on:'2026-04-07'},actor),'ন্যূনতম সময়');
 assert.equal(f.adminState(db).slots.lots.find(x=>x.id===lot.id).approved_on,null);
 const approval=f.approveSlotLot(db,lot.id,{approved_on:'2026-04-18'},actor);
 assert.equal(approval.approved_on,'2026-04-18');
 const lotState=f.adminState(db).slots.lots.find(x=>x.id===lot.id);
 assert.equal(lotState.slot_code,'New Storage');
 assert.equal(lotState.slot_enabled,1);
 assert.equal(lotState.remaining_kg,500);
 const repeat=f.approveSlotLot(db,lot.id,{approved_on:'2026-04-20'},actor);
 assert.equal(repeat.already_approved,true);
 assert.equal(repeat.approved_on,'2026-04-18');
 assert.equal(db.prepare("SELECT count(*) n FROM audit WHERE action='approve' AND entity_id=?").get(lot.id).n,1);
 fails(()=>f.startBatch(db,{bed_id:bed.id,slot_lot_id:lot.id,started_on:'2026-04-16',quantity_kg:100},actor),'পরীক্ষিত');
 const batch=f.startBatch(db,{bed_id:bed.id,slot_lot_id:lot.id,started_on:'2026-04-20',quantity_kg:200},actor);
 assert.ok(batch.id>0);
 assert.equal(f.adminState(db).slots.lots.find(x=>x.id===lot.id).remaining_kg,300);
 db.close();
});

test('can edit and safely archive units; active beds or stocked slots cannot be archived',()=>{
 const db=newDb();
 const bed=f.addFacility(db,'bed',{code:'Bed X',capacity_kg:500},actor);
 const slot=f.addFacility(db,'slot',{code:'Slot X',capacity_kg:350},actor);
 const lot=f.addSlotLot(db,{slot_id:slot.id,quantity_kg:300,received_on:'2026-02-01'},actor);
 fails(()=>f.updateFacility(db,'slot',slot.id,{enabled:false},actor),'গোবর আছে');
 fails(()=>f.updateFacility(db,'slot',slot.id,{capacity_kg:200},actor),'বর্তমান মজুত');
 f.approveSlotLot(db,lot.id,{approved_on:'2026-02-20'},actor);
 const batch=f.startBatch(db,{bed_id:bed.id,slot_lot_id:lot.id,started_on:'2026-02-24',quantity_kg:300},actor);
 fails(()=>f.updateFacility(db,'bed',bed.id,{enabled:0},actor),'সক্রিয়');
 fails(()=>f.updateFacility(db,'bed',bed.id,{capacity_kg:250},actor),'বর্তমান গোবর');
 fails(()=>f.deleteFacility(db,'bed',bed.id,actor),'ইতিহাস');
 fails(()=>f.deleteFacility(db,'slot',slot.id,actor),'ইতিহাস');
 f.harvestBatch(db,batch.id,{harvested_on:'2026-04-18',quantity_kg:155},actor);
 const sb=f.updateFacility(db,'bed',bed.id,{code:'Bed Renamed',enabled:false,notes:'closed'},actor);
 const ss=f.updateFacility(db,'slot',slot.id,{code:'Slot Renamed',enabled:0},actor);
 assert.equal(sb.enabled,0);assert.equal(ss.enabled,0);
 assert.equal(f.publicState(db).bed_status.some(x=>x.id===bed.id),false);
 assert.equal(f.publicState(db).slot_status.some(x=>x.id===slot.id),false);
 assert.equal(f.adminState(db).beds.find(x=>x.id===bed.id).history_count,1);
 assert.equal(f.adminState(db).slots.lots.find(x=>x.id===lot.id).remaining_kg,0);
 fails(()=>f.addSlotLot(db,{slot_id:slot.id,received_on:'2026-03-01',quantity_kg:20},actor),'স্লট পাওয়া যায়নি');
 f.updateFacility(db,'bed',bed.id,{enabled:true,capacity_kg:600},actor);
 f.updateFacility(db,'slot',slot.id,{enabled:1},actor);
 assert.equal(f.adminState(db).beds.find(x=>x.id===bed.id).code,'Bed Renamed');
 assert.equal(f.summary(db).beds_total,9);
 db.close();
});

test('unreferenced units can be deleted without resetting the layout on restart',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ak-dynamic-'));
 const file=path.join(folder,'farm.sqlite');
 try {
   let db=createDb(file);
   const newBed=f.addFacility(db,'bed',{code:'Temporary Bed'},actor);
   const newSlot=f.addFacility(db,'slot',{code:'Temporary Slot'},actor);
   f.deleteFacility(db,'bed',newBed.id,actor);
   f.deleteFacility(db,'slot',newSlot.id,actor);
   assert.equal(f.summary(db).beds_total,8);assert.equal(f.summary(db).slots_total,5);
   for(const bed of f.beds(db))f.deleteFacility(db,'bed',bed.id,actor);
   for(const slot of f.slots(db).rows)f.deleteFacility(db,'slot',slot.id,actor);
   assert.equal(f.summary(db).beds_total,0);assert.equal(f.summary(db).slots_total,0);
   db.close();
   db=createDb(file);
   assert.equal(f.summary(db).beds_total,0);assert.equal(f.summary(db).slots_total,0);
   const b=f.addFacility(db,'bed',{code:'Restart Bed'},actor);
   assert.equal(f.beds(db).find(x=>x.id===b.id).code,'Restart Bed');
   db.close();
 } finally {fs.rmSync(folder,{recursive:true,force:true});}
});

test('legacy database records are preserved and seeded defaults are not duplicated',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ak-upgrade-'));
 const file=path.join(folder,'farm.sqlite');
 try {
   let db=createDb(file);
   db.prepare("DELETE FROM settings WHERE key='layout_initialized'").run();
   const b=f.addFacility(db,'bed',{code:'Older extra bed'},actor);
   const s=f.addFacility(db,'slot',{code:'Older extra slot'},actor);
   const l=f.addSlotLot(db,{slot_id:s.id,received_on:'2026-01-01',quantity_kg:120},actor);
   db.close();
   db=createDb(file);
   assert.equal(f.summary(db).beds_total,9);assert.equal(f.summary(db).slots_total,6);
   assert.equal(f.slots(db).lots.find(x=>x.id===l.id).remaining_kg,120);
   assert.equal(f.beds(db).find(x=>x.id===b.id).code,'Older extra bed');
   db.close();
 } finally {fs.rmSync(folder,{recursive:true,force:true});}
});

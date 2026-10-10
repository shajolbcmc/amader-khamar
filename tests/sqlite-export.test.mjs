import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createDb} from './fixtures/sqlite-v1.2.mjs';

test('SQLite migration dry run accepts a populated v1.2 database without mutating it',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'ak-migrate-'));
 const file=path.join(dir,'farm.sqlite');
 try{
  const db=createDb(file);
  db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run('tester@test.local','Tester','legacy-scrypt-hash','admin');
  const lot=db.prepare("INSERT INTO slot_lots(slot_id,received_on,ready_not_before,initial_kg,remaining_kg,approved_on) VALUES(?,?,?,?,?,?)")
    .run(1,'2026-01-01','2026-01-16',100,50,'2026-01-18');
  db.prepare("INSERT INTO batches(bed_id,started_on,min_ready_on,max_ready_on,input_kg) VALUES(?,?,?,?,?)").run(1,'2026-02-01','2026-03-18','2026-04-02',50);
  db.close();
  const old=readFileSync(file);
  const command=spawnSync(process.execPath,['scripts/migrate-sqlite.mjs','--source',file],{
    cwd:process.cwd(),encoding:'utf8',env:{...process.env,DATABASE_URL:''}
  });
  assert.equal(command.status,0,command.stderr);
  assert.match(command.stdout,/DRY RUN COMPLETE/);
  assert.match(command.stdout,/SQLite source/);
  assert.deepEqual(readFileSync(file),old);
  assert.ok(statSync(file).size>0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

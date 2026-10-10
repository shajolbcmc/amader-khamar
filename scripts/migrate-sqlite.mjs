/** One-time, loss-avoiding SQLite -> Neon migration.
 * Run without --apply to inspect local data; --apply requires an EMPTY Neon DB.
 * Preserves table IDs, password hashes, stock movements, historic batches and orders.
 * Keeps original SQLite file read-only and refuses to overwrite target data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {getDb,closeDb,transaction} from '../src/lib/database.mjs';
import {setupSchema,seedInitialData} from '../src/lib/setup.mjs';

if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
const args=process.argv.slice(2);
const flag=args.indexOf('--source');
const filename=flag>=0?args[flag+1]:'./data/farm.sqlite';
const apply=args.includes('--apply');
if(!filename||filename.startsWith('--')){
  console.error('Usage: npm run db:migrate:sqlite -- --source "PATH_TO_OLD_farm.sqlite" [--apply]');
  process.exit(2);
}
const file=path.resolve(filename);
if(!fs.existsSync(file) || fs.statSync(file).size===0){
 console.error('Source SQLite file not found (or empty):',file);
 process.exit(2);
}
// We never write to the old SQLite file.
const sqlite=new DatabaseSync(file,{readOnly:true});
const tables=[
 'users','beds','slots','products','settings','posts','inquiries','expenses','tasks',
 'slot_lots','batches','batch_feed','care_logs','harvests','orders','order_items',
 'stock_movements','audit'
];
const identities=new Set(tables.filter(t=>t!=='settings'));
let pg;
try{
 const integrity=sqlite.prepare('PRAGMA integrity_check').all();
 if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw new Error('SQLite integrity_check failed. Repair/backup the original first.');
 const foreign=sqlite.prepare('PRAGMA foreign_key_check').all();
 if(foreign.length)throw new Error('SQLite foreign key violations found. Fix them before moving data.');
 const available=new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
 const missing=tables.filter(t=>!available.has(t));
 if(missing.length)throw new Error('Not all v1.2 tables exist: '+missing.join(', '));
 const counts=Object.fromEntries(tables.map(t=>[t,Number(sqlite.prepare(`SELECT count(*) AS n FROM "${t}"`).get().n)]));
 console.log('SQLite source:',file);
 console.table(counts);
 if(!apply){
   console.log('DRY RUN COMPLETE. The SQLite file was only read.');
   console.log('To migrate to a NEW EMPTY Neon DB: npm run db:migrate:sqlite -- --source "'+file+'" --apply');
 }else{
   if(!process.env.DATABASE_URL || !/^(postgres(ql)?):\/\//.test(process.env.DATABASE_URL))throw new Error('Set a real Neon DATABASE_URL in .env.local.');
   pg=getDb();
   await setupSchema(pg);
   await transaction(pg,async()=>{
     // An ordinary init creates demo beds/slots; do not mix these with historic IDs.
     const notEmpty=[];
     for(const t of tables){
       const n=Number((await pg.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get()).n);
       if(n)notEmpty.push(`${t}:${n}`);
     }
     const migrated=await pg.prepare("SELECT value FROM settings WHERE key='sqlite_migrated_at'").get();
     if(notEmpty.length||migrated)throw new Error('Neon target is NOT empty ('+notEmpty.join(', ')+'). Use a NEW Neon database/branch; never overwrite existing production data.');

     for(const t of tables){
       const srcColumns=sqlite.prepare(`PRAGMA table_info("${t}")`).all().map(r=>r.name);
       const destination=await pg.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?").all(t);
       const dstColumns=new Set(destination.map(x=>x.column_name));
       const unknown=srcColumns.filter(c=>!dstColumns.has(c));
       if(unknown.length)throw new Error(`Column mismatch in ${t}: ${unknown.join(', ')}`);
       const cols=srcColumns;
       const quoted=cols.map(c=>'"'+c+'"').join(',');
       const sqlSelect=`SELECT ${quoted} FROM "${t}"`;
       const iterator=sqlite.prepare(sqlSelect).iterate();
       const count=counts[t];
       let copied=0,buffer=[];
       const flush=async()=>{
         if(!buffer.length)return;
         const params=buffer.flatMap(r=>cols.map(c=>r[c]));
         const templates=buffer.map((_,row)=>'('+cols.map((__,col)=>'$'+(row*cols.length+col+1)).join(',')+')').join(',');
         await pg.query(`INSERT INTO "${t}" (${quoted}) VALUES ${templates}`,params);
         copied+=buffer.length;
         buffer=[];
       };
       for(const row of iterator){
         // v1.1-1.2 category exists, but older copies may not have it.
         buffer.push(row);
         if(buffer.length>=100)await flush();
       }
       await flush();
       if(copied!==count)throw new Error(`Row mismatch for ${t}: ${copied} vs ${count}`);
       if(identities.has(t)&&count){
          const max=Number((await pg.prepare(`SELECT MAX(id) AS id FROM "${t}"`).get()).id);
          await pg.query('SELECT setval(pg_get_serial_sequence($1,$2),$3,true)',[`public.${t}`,'id',max]);
       }
       console.log(`${t}: ${copied} rows copied`);
     }
     // Mark only after every record and identity sequence has been imported successfully.
     await pg.prepare("INSERT INTO settings(key,value) VALUES('sqlite_migrated_at',?)").run(new Date().toISOString());
     for(const t of tables){
       const live=Number((await pg.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get()).n);
       // Additional bookkeeping setting changes only the settings table.
       const expected=counts[t]+(t==='settings'?1:0);
       if(live!==expected)throw new Error(`Count verification failed for ${t}: got ${live}, wanted ${expected}`);
     }
   });
   // No default layout is created for a populated migrated farm.
   await seedInitialData(pg);
   console.log('SUCCESS: old IDs, historical production, stock, orders, users, and settings imported.');
   console.log('Existing users keep their passwords. Cookies/sessions must log in again.');
 }
}catch(error){console.error('MIGRATION STOPPED:',error.message);process.exitCode=1;}
finally{sqlite.close();if(pg)await closeDb();}

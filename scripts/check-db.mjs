import fs from 'node:fs';
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
import {getDb,closeDb} from '../src/lib/database.mjs';
try{
 const db=getDb();
 const version=await db.prepare('SELECT version() AS version').get();
 const beds=(await db.prepare('SELECT COUNT(*) AS n FROM beds').get()).n;
 const slots=(await db.prepare('SELECT COUNT(*) AS n FROM slots').get()).n;
 const users=(await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n;
 const batches=(await db.prepare('SELECT COUNT(*) AS n FROM batches').get()).n;
 const orders=(await db.prepare('SELECT COUNT(*) AS n FROM orders').get()).n;
 console.log('Neon/PostgreSQL connection: OK');
 console.log('Engine:',String(version.version).split(' ')[0]);
 console.table({beds,slots,users,batches,orders});
}catch(error){console.error('Database health check failed:',error.message);process.exitCode=1;}
finally{await closeDb();}

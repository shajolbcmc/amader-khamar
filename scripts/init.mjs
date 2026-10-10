import fs from 'node:fs';
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
import {getDb,closeDb} from '../src/lib/database.mjs';
import {setupSchema,seedInitialData} from '../src/lib/setup.mjs';
import {passwordHash} from '../src/lib/auth.mjs';

const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD||'';
if(!email.includes('@')||email==='admin@example.com'||password.length<12||password.includes('CHANGE_THIS')){
 console.error('Use a real ADMIN_EMAIL and unique ADMIN_PASSWORD (12+ chars) in your local .env.local.');
 process.exit(1);
}
try{
 const db=getDb();
 await setupSchema(db);
 await seedInitialData(db);
 const current=await db.prepare('SELECT id FROM users WHERE email=?').get(email);
 if(current){
   if(process.argv.includes('--reset-password')){
     await db.prepare('UPDATE users SET password_hash=?,role=? WHERE id=?').run(passwordHash(password),'admin',current.id);
     console.log('Existing admin password updated by explicit --reset-password.');
   } else console.log('Admin exists. No password changed (use -- --reset-password to reset).');
 } else {
   await db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email,'খামার অ্যাডমিন',passwordHash(password),'admin');
   console.log('Admin created:',email);
 }
 console.log('Neon PostgreSQL initialized; beds and slots are configurable.');
} catch(error){console.error('Initialization failed:',error.message);process.exitCode=1;}
finally{await closeDb();}

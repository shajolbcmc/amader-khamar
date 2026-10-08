import fs from 'node:fs';
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
import { createDb } from '../src/lib/database.mjs';
import { passwordHash } from '../src/lib/auth.mjs';
const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD||'';
if(!email||!email.includes('@')||email==='admin@example.com'||password.length<12||password.includes('CHANGE_THIS')){console.error('Set a real ADMIN_EMAIL and a unique ADMIN_PASSWORD (12+ chars) in .env.local before running npm run init.');process.exit(1)}
const db=createDb();
const current=db.prepare('SELECT id FROM users WHERE email=?').get(email);
if(current){db.prepare('UPDATE users SET password_hash=?, role=\'admin\' WHERE id=?').run(passwordHash(password),current.id);console.log(`Updated admin password: ${email}`)}
else{db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email,'খামার অ্যাডমিন',passwordHash(password),'admin');console.log(`Created admin user: ${email}`)}
console.log(`Database ready. Active beds: ${db.prepare('SELECT COUNT(*) n FROM beds WHERE enabled=1').get().n}; active slots: ${db.prepare('SELECT COUNT(*) n FROM slots WHERE enabled=1').get().n}. Historical data preserved.`);
db.close();

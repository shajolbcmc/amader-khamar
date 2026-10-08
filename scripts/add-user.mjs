import fs from 'node:fs';
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local');
import {createDb} from '../src/lib/database.mjs';
import {passwordHash} from '../src/lib/auth.mjs';
const email=(process.env.NEW_USER_EMAIL||'').trim().toLowerCase();
const name=(process.env.NEW_USER_NAME||'').trim();
const password=process.env.NEW_USER_PASSWORD||'';
const role=process.env.NEW_USER_ROLE||'staff';
if(!email.includes('@')||!name||password.length<12||!['admin','staff'].includes(role)){
 console.error('Required environment variables: NEW_USER_EMAIL, NEW_USER_NAME, NEW_USER_PASSWORD (12+ chars), NEW_USER_ROLE=staff|admin');process.exit(1);
}
const db=createDb();
if(db.prepare('SELECT id FROM users WHERE email=?').get(email)){console.error('User already exists.');process.exit(1);}
db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email,name,passwordHash(password),role);
console.log(`Created ${role}: ${email}`);db.close();

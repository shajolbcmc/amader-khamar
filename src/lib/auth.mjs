import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { getDb } from './database.mjs';

export function passwordHash(password) {
  if(typeof password!=='string'||password.length<12) throw new Error('পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে');
  const salt=randomBytes(16).toString('hex');const hash=scryptSync(password,salt,64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
export function verifyPassword(password, stored){
 try {const [alg,salt,value]=stored.split(':');if(alg!=='scrypt')return false;
 const expected=Buffer.from(value,'hex'),actual=scryptSync(String(password),salt,expected.length);
 return expected.length===actual.length && timingSafeEqual(expected,actual);
 }catch{return false;}
}
const tokenHash = t => createHash('sha256').update(t).digest('hex');
export function makeSession(db, userId){
 const token=randomBytes(32).toString('base64url');
 const until=new Date(Date.now()+7*86400000).toISOString();
 db.prepare('DELETE FROM sessions WHERE expires_at<?').run(new Date().toISOString());
 db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash(token),userId,until);
 return token;
}
export function lookupSession(db=getDb(),token){
 if(!token||typeof token!=='string')return null;
 return db.prepare(`SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON s.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token),new Date().toISOString())||null;
}
export function revokeSession(db=getDb(),token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));}
export function readCookie(req,name='kh_session'){
 const match=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));
 if(!match)return null;try{return decodeURIComponent(match.slice(name.length+1))}catch{return null;}
}
export function sessionCookie(token,req){
 const protocol=req.headers.get('x-forwarded-proto')||new URL(req.url).protocol.replace(':','');
 const secure=protocol==='https' ? '; Secure' : '';
 return `kh_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}
export function clearCookie(req){
 const protocol=req.headers.get('x-forwarded-proto')||new URL(req.url).protocol.replace(':','');
 return `kh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${protocol==='https'?'; Secure':''}`;
}

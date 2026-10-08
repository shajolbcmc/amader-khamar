import { NextResponse } from 'next/server';
import { getDb } from '@/lib/database.mjs';
import { verifyPassword, makeSession,lookupSession,revokeSession,readCookie,sessionCookie,clearCookie } from '@/lib/auth.mjs';
import * as farm from '@/lib/service.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const rateHits=new Map();
function limit(req,prefix,max=8,windowMs=60000){
 const ip=(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'unknown').split(',')[0].trim();
 const key=prefix+':'+ip,now=Date.now(),hit=rateHits.get(key)||{n:0,t:now};
 if(now-hit.t>windowMs){hit.n=0;hit.t=now;}
 hit.n++;rateHits.set(key,hit);
 if(rateHits.size>2000){for(const [k,v] of rateHits)if(now-v.t>windowMs)rateHits.delete(k);}
 if(hit.n>max)throw new farm.AppError('অল্প সময়ের মধ্যে অনেক অনুরোধ এসেছে। কিছুক্ষণ পর চেষ্টা করুন।',429);
}
function csrf(req){
 if(['GET','HEAD','OPTIONS'].includes(req.method))return;
 const origin=req.headers.get('origin');
 if(origin){
   const acceptable=[req.headers.get('host'),req.headers.get('x-forwarded-host'),new URL(req.url).host].filter(Boolean);
   let host;try{host=new URL(origin).host}catch{throw new farm.AppError('Origin ঠিক নয়',403)}
   if(!acceptable.includes(host))throw new farm.AppError('Cross-origin mutation অনুমোদিত নয়',403);
 }
}
function result(obj,status=200,headers={}){return NextResponse.json({ok:true,data:obj},{status,headers:{'Cache-Control':'no-store',...headers}});}
function body(req){return req.json().catch(()=>{throw new farm.AppError('JSON body প্রয়োজন')});}
async function handler(req,context){
 try {
  csrf(req);
  const db=getDb(),parts=(await context.params).parts||[],[first,second,third,fourth]=parts;
  const method=req.method;
  if(first==='health' && method==='GET')return result({status:'ok',beds:db.prepare('SELECT COUNT(*) n FROM beds').get().n});
  if(first==='public' && method==='GET')return result(farm.publicState(db));
  if(first==='public' && second==='order' && method==='POST'){
    limit(req,'order',5);return result(farm.placeOrder(db,await body(req)),201);
  }
  if(first==='public' && second==='inquiry' && method==='POST'){
    limit(req,'inquiry',5);return result(farm.addInquiry(db,await body(req)),201);
  }
  if(first==='auth' && second==='login' && method==='POST'){
    limit(req,'login',8,300000);
    const input=await body(req);
    const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(input.email||'').trim().toLowerCase());
    if(!user || !verifyPassword(input.password||'',user.password_hash))throw new farm.AppError('ইমেইল অথবা পাসওয়ার্ড ভুল',401);
    const token=makeSession(db,user.id);
    return result({id:user.id,name:user.name,email:user.email,role:user.role},200,{'Set-Cookie':sessionCookie(token,req)});
  }
  const token=readCookie(req);const actor=lookupSession(db,token);
  if(first==='auth' && second==='me' && method==='GET'){
    if(!actor)throw new farm.AppError('লগইন করা নেই',401);return result(actor);
  }
  if(first==='auth' && second==='logout' && method==='POST'){
    revokeSession(db,token);return result({logout:true},200,{'Set-Cookie':clearCookie(req)});
  }
  if(first!=='admin')throw new farm.AppError('API পাওয়া যায়নি',404);
  if(!actor)throw new farm.AppError('অনুগ্রহ করে লগইন করুন',401);
  const adminOnly=()=>{if(actor.role!=='admin')throw new farm.AppError('শুধু Admin এটি করতে পারবেন',403);};
  if(second==='state'&&method==='GET')return result({...farm.adminState(db,new URL(req.url).searchParams.get('month')||undefined),user:actor});
  if(second==='inventory-history'&&method==='GET')return result(farm.inventoryHistory(db));
  if(second==='beds'&&method==='POST'){adminOnly();return result(farm.addFacility(db,'bed',await body(req),actor),201);}
  if(second==='beds'&&third&&method==='PATCH'){adminOnly();return result(farm.updateFacility(db,'bed',third,await body(req),actor));}
  if(second==='beds'&&third&&method==='DELETE'){adminOnly();return result(farm.deleteFacility(db,'bed',third,actor));}
  if(second==='slots'&&method==='POST'){adminOnly();return result(farm.addFacility(db,'slot',await body(req),actor),201);}
  if(second==='slots'&&third&&method==='PATCH'){adminOnly();return result(farm.updateFacility(db,'slot',third,await body(req),actor));}
  if(second==='slots'&&third&&method==='DELETE'){adminOnly();return result(farm.deleteFacility(db,'slot',third,actor));}
  if(second==='slot-lots'&&method==='POST')return result(farm.addSlotLot(db,await body(req),actor),201);
  if(second==='slot-lots'&&third&&fourth==='approve'&&method==='POST')return result(farm.approveSlotLot(db,third,await body(req),actor));
  if(second==='batches'&&method==='POST')return result(farm.startBatch(db,await body(req),actor),201);
  if(second==='batches'&&third&&fourth==='harvest'&&method==='POST')return result(farm.harvestBatch(db,third,await body(req),actor));
  if(second==='care'&&method==='POST')return result(farm.addCare(db,await body(req),actor),201);
  if(second==='packaging'&&method==='POST'){adminOnly();return result(farm.packageStock(db,await body(req),actor));}
  if(second==='adjustment'&&method==='POST'){adminOnly();return result(farm.adjustStock(db,await body(req),actor));}
  if(second==='products'&&method==='POST'){adminOnly();return result(farm.addProduct(db,await body(req),actor));}
  if(second==='orders'&&third&&method==='PATCH')return result(farm.changeOrder(db,third,await body(req),actor));
  if(second==='expenses'&&method==='POST'){adminOnly();return result(farm.addExpense(db,await body(req),actor),201);}
  if(second==='tasks'&&method==='POST')return result(farm.addTask(db,await body(req),actor),201);
  if(second==='tasks'&&third&&method==='PATCH')return result(farm.toggleTask(db,third,await body(req),actor));
  if(second==='posts'&&method==='POST'){adminOnly();return result(farm.addPost(db,await body(req),actor));}
  if(second==='inquiries'&&third&&method==='PATCH')return result(farm.changeInquiry(db,third,await body(req),actor));
  if(second==='settings'&&method==='PATCH'){adminOnly();return result(farm.saveSettings(db,await body(req),actor));}
  throw new farm.AppError('API পাওয়া যায়নি',404);
 }catch(error){
  const status=error.status||((error.message||'').includes('UNIQUE constraint')?409:500);
  const msg=error.status?error.message:status===409?'এই রেকর্ডটি আগে থেকেই আছে':'সার্ভার সমস্যা হয়েছে';
  if(status>=500)console.error('[farm api]',error);
  return NextResponse.json({ok:false,error:msg},{status,headers:{'Cache-Control':'no-store'}});
 }
}
export async function GET(req,ctx){return handler(req,ctx)}
export async function POST(req,ctx){return handler(req,ctx)}
export async function PATCH(req,ctx){return handler(req,ctx)}
export async function DELETE(req,ctx){return handler(req,ctx)}

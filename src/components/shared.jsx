'use client';
import {Sprout,ArrowRight,Layers,Warehouse,PackageCheck,CalendarDays,BarChart3,Package,Receipt,ShoppingCart,ClipboardList,BookOpen,Phone,Menu,LogOut,Check,Plus,AlertTriangle,ShieldCheck,ChevronRight,RotateCcw,Truck,Clock3,Leaf,Mail,MapPin,Settings,CheckCircle2} from 'lucide-react';
export {Sprout,ArrowRight,Layers,Warehouse,PackageCheck,CalendarDays,BarChart3,Package,Receipt,ShoppingCart,ClipboardList,BookOpen,Phone,Menu,LogOut,Check,Plus,AlertTriangle,ShieldCheck,ChevronRight,RotateCcw,Truck,Clock3,Leaf,Mail,MapPin,Settings,CheckCircle2};
export const bn=n=>new Intl.NumberFormat('bn-BD',{maximumFractionDigits:2}).format(Number(n)||0);
export const bdt=n=>`৳${bn(n)}`;
export const day=d=>d?new Date(`${d.slice(0,10)}T00:00:00Z`).toLocaleDateString('bn-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'—';
export const dayDiff=(a,b)=>Math.floor((new Date(`${b}T00:00:00Z`)-new Date(`${a}T00:00:00Z`))/86400000);
export const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const initial=()=>localToday();
export async function api(path,options={}){
 const r=await fetch('/api/'+path,{headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',...options});
 let result;try{result=await r.json()}catch{throw new Error('সার্ভারের জবাব পাওয়া যায়নি')}
 if(!r.ok||!result.ok)throw new Error(result.error||'অনুরোধ সফল হয়নি');return result.data;
}
export function Loading(){return <div className="loading-wrap"><span className="loader"/> <span>খামারের তথ্য লোড হচ্ছে...</span></div>}
export function Empty({children='এখনো কোনো রেকর্ড নেই'}){return <div className="empty-state"><Leaf size={30}/><p>{children}</p></div>}
export function Badge({children,tone='neutral'}){return <span className={'status-pill '+tone}>{children}</span>}
export const navItems=[['overview','ড্যাশবোর্ড',BarChart3],['beds','বেডসমূহ',Layers],['slots','মজুত স্লট',Warehouse],['batches','ব্যাচ ও সংগ্রহ',PackageCheck],['inventory','স্টক ও প্যাকেজিং',Package],['orders','অর্ডার',ShoppingCart],['expenses','খরচ',Receipt],['tasks','কাজ ও ক্যালেন্ডার',CalendarDays],['reports','রিপোর্ট',BarChart3],['products','পণ্য',Package],['posts','ব্লগ',BookOpen],['inquiries','যোগাযোগ',Phone],['settings','সেটিংস',Settings]];

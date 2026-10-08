import PublicSite from '@/components/PublicSite';
import {notFound} from 'next/navigation';
const valid=['about','dashboard','process','knowledge','products','blog','contact'];
export async function generateMetadata({params}){const {section}=await params;return {title:({about:'আমাদের সম্পর্কে',dashboard:'লাইভ ড্যাশবোর্ড',process:'উৎপাদন প্রক্রিয়া',knowledge:'জ্ঞানভান্ডার',products:'পণ্য',blog:'ব্লগ',contact:'যোগাযোগ'})[section]||'আমাদের খামার'};}
export default async function SectionPage({params}){const {section}=await params;if(!valid.includes(section))notFound();return <PublicSite section={section}/>}

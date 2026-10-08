import PublicSite from '@/components/PublicSite';
export default async function BlogPostPage({params}){const {slug}=await params;return <PublicSite section="post" slug={slug}/>}

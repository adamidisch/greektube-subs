import {notFound} from "next/navigation";
import SubtitleQualityPanel from "../SubtitleQualityPanel";

/** Preview-only real iframe viewports; never exposes a production QA page. */
export default async function QA({searchParams}:{searchParams:Promise<{page?:string}>}){
  if(process.env.VERCEL_ENV!=="preview")notFound();
  const {page}=await searchParams;
  if(page==="review-panel")return <main style={{maxWidth:850,margin:"auto",padding:16}}><SubtitleQualityPanel videoId="xYB6uYyRjCA"/></main>;
  const src=page==="account"?"/account":page==="settings"?"/?view=settings":page==="review"?"/qa?page=review-panel":"/";
  return <main style={{padding:16,display:"flex",alignItems:"start",gap:24,overflow:"auto",background:"#12151b"}}>{[390,768].map(width=><section key={width}><h1 style={{fontSize:16,color:"#f2f3f6"}}>{width}px</h1><iframe title={`${width}px preview`} src={src} style={{width,height:860,border:"1px solid #5b6170",borderRadius:12}}/></section>)}</main>;
}

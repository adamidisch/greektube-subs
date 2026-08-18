import {NextResponse} from "next/server";
import {database} from "@/db/postgres";

const SHARED_LIBRARY_KEY="greektube-shared-library-v1";
const ADMIN_COOKIE="greektube-admin";
const ADMIN_SESSION_MESSAGE="greektube-edit-authorized";
const DEMO_MODE=true;
const CATEGORIES=new Set(["Medical","Tech","Podcasts","Comedy","Education","Documentaries","Other"]);

type SkipRange={start:number;end:number};
type VideoRecord=Record<string,unknown>&{id?:unknown;metadataVersion?:unknown;skipRanges?:unknown};

async function ensureTable(){
  const db=database();
  await db.query(`CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}
async function adminSecret(){return String(process.env.ADMIN_EDIT_PASSWORD||"");}
async function adminSessionToken(password:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(ADMIN_SESSION_MESSAGE));
  return Array.from(new Uint8Array(signature)).map(value=>value.toString(16).padStart(2,"0")).join("");
}
function safeEqual(left:string,right:string){
  const a=new TextEncoder().encode(left),b=new TextEncoder().encode(right);
  if(a.length!==b.length)return false;
  let difference=0;
  for(let index=0;index<a.length;index+=1)difference|=a[index]^b[index];
  return difference===0;
}
async function isAdminRequest(request:Request){
  const password=await adminSecret();
  if(!password)return false;
  const cookie=request.headers.get("cookie")?.split(";").map(value=>value.trim()).find(value=>value.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length+1)||"";
  return safeEqual(cookie,await adminSessionToken(password));
}
function text(value:unknown,max=500){return typeof value==="string"?value.trim().slice(0,max):"";}
function normalizeRanges(input:unknown,duration:number){
  if(!Array.isArray(input))return {ranges:[] as SkipRange[],errors:[] as string[]};
  const ranges:SkipRange[]=input.map(item=>{
    const value=item as {start?:unknown;end?:unknown};
    return {start:Number(value.start),end:Number(value.end)};
  }).sort((a,b)=>a.start-b.start);
  const errors:string[]=[];
  ranges.forEach((range,index)=>{
    if(!Number.isFinite(range.start)||!Number.isFinite(range.end))errors.push(`Range ${index+1}: μη έγκυρο timestamp.`);
    else if(range.start<0)errors.push(`Range ${index+1}: η αρχή δεν μπορεί να είναι αρνητική.`);
    else if(range.end<=range.start+.15)errors.push(`Range ${index+1}: το τέλος πρέπει να είναι μετά την αρχή.`);
    else if(duration>0&&range.end>duration+.25)errors.push(`Range ${index+1}: το τέλος είναι έξω από τη διάρκεια του βίντεο.`);
    const previous=ranges[index-1];
    if(previous&&Number.isFinite(previous.end)&&range.start<previous.end-.01)errors.push(`Range ${index+1}: επικαλύπτεται με το προηγούμενο range.`);
  });
  return {ranges,errors};
}
async function getSharedVideos(){
  await ensureTable();
  const db=database();
  const rows=await db.query("SELECT value FROM app_state WHERE key = $1 LIMIT 1",[SHARED_LIBRARY_KEY]) as {value:string}[];
  if(!rows[0])return [] as VideoRecord[];
  try{
    const parsed=JSON.parse(rows[0].value) as {videos?:VideoRecord[]};
    return Array.isArray(parsed.videos)?parsed.videos:[];
  }catch{return [] as VideoRecord[];}
}

export async function GET(request:Request){
  const videoId=new URL(request.url).searchParams.get("videoId")||"";
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))return NextResponse.json({error:"Μη έγκυρο video id."},{status:400});
  try{
    const videos=await getSharedVideos();
    const video=videos.find(item=>String(item.id||"")===videoId);
    if(!video)return NextResponse.json({error:"Το βίντεο δεν βρέθηκε."},{status:404});
    return NextResponse.json({video,demo:DEMO_MODE});
  }catch{return NextResponse.json({error:"Δεν ήταν δυνατή η φόρτωση του editor."},{status:500});}
}

export async function PUT(request:Request){
  if(!await isAdminRequest(request))return NextResponse.json({error:"Απαιτείται κωδικός διαχειριστή."},{status:401});
  try{
    const payload=await request.json() as Record<string,unknown>;
    const videoId=text(payload.videoId,32);
    if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))return NextResponse.json({error:"Μη έγκυρο video id."},{status:400});
    const videos=await getSharedVideos();
    const index=videos.findIndex(item=>String(item.id||"")===videoId);
    if(index<0)return NextResponse.json({error:"Το βίντεο δεν βρέθηκε."},{status:404});
    const current=videos[index];
    const expectedVersion=Number(payload.metadataVersion||0);
    const currentVersion=Number(current.metadataVersion||0);
    if(expectedVersion!==currentVersion)return NextResponse.json({error:"Το βίντεο άλλαξε από τότε που άνοιξε ο editor. Κάνε refresh πριν αποθηκεύσεις.",code:"VERSION_CONFLICT"},{status:409});

    const metadata=(payload.metadata&&typeof payload.metadata==="object"?payload.metadata:{}) as Record<string,unknown>;
    const category=text(metadata.category,40);
    if(category&&!CATEGORIES.has(category))return NextResponse.json({error:"Μη έγκυρη κατηγορία."},{status:400});
    const title=text(metadata.title,260);
    if(!title)return NextResponse.json({error:"Ο ελληνικός τίτλος είναι υποχρεωτικός."},{status:400});
    const duration=Number(current.duration||0);
    const {ranges,errors}=normalizeRanges(payload.skipRanges,duration);
    if(errors.length)return NextResponse.json({error:errors[0],errors},{status:400});

    const tags=Array.isArray(metadata.tags)?metadata.tags.map(value=>text(value,60)).filter(Boolean).slice(0,30):[];
    const updated:VideoRecord={
      ...current,
      title,
      originalTitle:text(metadata.originalTitle,260),
      speakerName:text(metadata.speakerName,180),
      speakerRole:text(metadata.speakerRole,220),
      channel:text(metadata.channel,180),
      channelUrl:text(metadata.channelUrl,500),
      originalVideoUrl:text(metadata.originalVideoUrl,500),
      category:category||current.category,
      tags,
      description:text(metadata.description,5000),
      skipRanges:ranges,
      metadataVersion:DEMO_MODE?currentVersion:currentVersion+1,
    };
    if(DEMO_MODE)return NextResponse.json({ok:true,demo:true,video:updated});

    videos[index]=updated;
    const db=database();
    const now=new Date().toISOString();
    const value=JSON.stringify({videos});
    await db.query(`INSERT INTO app_state (key,value,created_at,updated_at) VALUES ($1,$2,$3,$4)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[SHARED_LIBRARY_KEY,value,now,now]);
    return NextResponse.json({ok:true,video:updated});
  }catch{return NextResponse.json({error:"Δεν ήταν δυνατή η αποθήκευση του editor."},{status:500});}
}

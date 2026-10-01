import {NextResponse} from "next/server";
import {database} from "@/db/postgres";

const SHARED_LIBRARY_KEY="greektube-shared-library-v1";
const ADMIN_COOKIE="greektube-admin";
const ADMIN_SESSION_MESSAGE="greektube-edit-authorized";

type VideoRecord=Record<string,unknown>&{id?:unknown;libraryVisible?:unknown};

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

export async function PUT(request:Request){
  if(!await isAdminRequest(request))return NextResponse.json({error:"Απαιτείται κωδικός διαχειριστή."},{status:401});
  try{
    const payload=await request.json() as {videoId?:unknown;libraryVisible?:unknown};
    const videoId=typeof payload.videoId==="string"?payload.videoId.trim():"";
    if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))return NextResponse.json({error:"Μη έγκυρο video id."},{status:400});
    if(typeof payload.libraryVisible!=="boolean")return NextResponse.json({error:"Μη έγκυρη κατάσταση βιβλιοθήκης."},{status:400});

    await ensureTable();
    const db=database();
    const rows=await db.query("SELECT value FROM app_state WHERE key = $1 LIMIT 1",[SHARED_LIBRARY_KEY]) as {value:string}[];
    if(!rows[0])return NextResponse.json({error:"Η βιβλιοθήκη δεν βρέθηκε."},{status:404});
    const parsed=JSON.parse(rows[0].value) as {videos?:VideoRecord[]};
    const videos=Array.isArray(parsed.videos)?parsed.videos:[];
    const index=videos.findIndex(video=>String(video.id||"")===videoId);
    if(index<0)return NextResponse.json({error:"Το βίντεο δεν βρέθηκε."},{status:404});

    videos[index]={...videos[index],libraryVisible:payload.libraryVisible};
    const now=new Date().toISOString();
    await db.query(`INSERT INTO app_state (key,value,created_at,updated_at) VALUES ($1,$2,$3,$4)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[SHARED_LIBRARY_KEY,JSON.stringify({...parsed,videos}),now,now]);

    return NextResponse.json({ok:true,videoId,libraryVisible:payload.libraryVisible});
  }catch{
    return NextResponse.json({error:"Δεν ήταν δυνατή η αλλαγή κατάστασης βιβλιοθήκης."},{status:500});
  }
}

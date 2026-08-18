import {NextResponse} from "next/server";
import {database} from "@/db/postgres";

const ADMIN_COOKIE="greektube-admin";
const ADMIN_SESSION_MESSAGE="greektube-edit-authorized";
type Row=Record<string,unknown>;

async function adminSecret(){return String(process.env.ADMIN_EDIT_PASSWORD||"");}
async function adminSessionToken(password:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(ADMIN_SESSION_MESSAGE));
  return Array.from(new Uint8Array(signature)).map(value=>value.toString(16).padStart(2,"0")).join("");
}
function safeEqual(left:string,right:string){
  const a=new TextEncoder().encode(left),b=new TextEncoder().encode(right);if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i+=1)diff|=a[i]^b[i];return diff===0;
}
async function isAdmin(request:Request){
  const password=await adminSecret();if(!password)return false;
  const cookie=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length+1)||"";
  return safeEqual(cookie,await adminSessionToken(password));
}
async function ensureTable(){
  const db=database();
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), client_ts TIMESTAMPTZ NULL,
    session_id TEXT NOT NULL,event_name TEXT NOT NULL,path TEXT NOT NULL DEFAULT '/',video_id TEXT NOT NULL DEFAULT '',
    referrer_host TEXT NOT NULL DEFAULT 'direct',country TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',device TEXT NOT NULL DEFAULT '',browser TEXT NOT NULL DEFAULT '',properties JSONB NOT NULL DEFAULT '{}'::jsonb)`);
}

export async function GET(request:Request){
  if(!await isAdmin(request))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    await ensureTable();
    const url=new URL(request.url);const rawDays=Number(url.searchParams.get("days")||7);const days=[1,7,30,90].includes(rawDays)?rawDays:7;
    const db=database();
    const results=await Promise.all([
      db.query(`SELECT COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views,
        COUNT(*) FILTER (WHERE event_name='video_open')::int AS video_opens,
        COALESCE(SUM((properties->>'seconds')::numeric) FILTER (WHERE event_name='video_watch'),0)::float AS watch_seconds
        FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval`,[days]),
      db.query(`SELECT video_id,COUNT(*) FILTER (WHERE event_name='video_open')::int AS opens,
        COALESCE(SUM((properties->>'seconds')::numeric) FILTER (WHERE event_name='video_watch'),0)::float AS watch_seconds
        FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval AND video_id<>'' GROUP BY video_id ORDER BY opens DESC,watch_seconds DESC LIMIT 12`,[days]),
      db.query(`SELECT referrer_host AS name,COUNT(DISTINCT session_id)::int AS sessions FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval AND event_name='page_view' GROUP BY referrer_host ORDER BY sessions DESC LIMIT 12`,[days]),
      db.query(`SELECT COALESCE(NULLIF(country,''),'Unknown') AS name,COUNT(DISTINCT session_id)::int AS sessions FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval GROUP BY country ORDER BY sessions DESC LIMIT 12`,[days]),
      db.query(`SELECT device AS name,COUNT(DISTINCT session_id)::int AS sessions FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval GROUP BY device ORDER BY sessions DESC LIMIT 12`,[days]),
      db.query(`SELECT event_name AS name,COUNT(*)::int AS count FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval GROUP BY event_name ORDER BY count DESC LIMIT 20`,[days]),
      db.query(`SELECT created_at,session_id,event_name,path,video_id,referrer_host,country,city,device,browser,properties FROM analytics_events WHERE created_at >= NOW() - ($1 || ' days')::interval ORDER BY created_at DESC LIMIT 100`,[days])
    ]);
    const [summaryRows,topVideos,sources,countries,devices,events,recent]=results.map(result=>result as Row[]);
    return NextResponse.json({days,summary:summaryRows[0]||{},topVideos,sources,countries,devices,events,recent});
  }catch{return NextResponse.json({error:"report_failed"},{status:500});}
}

import {NextResponse} from "next/server";
import {database} from "@/db/postgres";
import crypto from "node:crypto";

const MAX_BATCH=30;
const ALLOWED_EVENTS=new Set([
  "page_view","click","video_open","video_watch","video_progress","search","filter","share","favorite","fullscreen","speed","subtitle","editor_open","editor_save","session_end"
]);

type AnalyticsEvent={
  sessionId?:unknown;
  name?:unknown;
  path?:unknown;
  videoId?:unknown;
  referrer?:unknown;
  properties?:unknown;
  ts?:unknown;
};

function text(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):"";}
function safeProps(value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  const output:Record<string,string|number|boolean|null>={};
  for(const [key,raw] of Object.entries(value as Record<string,unknown>).slice(0,20)){
    const safeKey=text(key,40);
    if(!safeKey)continue;
    if(typeof raw==="string")output[safeKey]=raw.slice(0,160);
    else if(typeof raw==="number"&&Number.isFinite(raw))output[safeKey]=raw;
    else if(typeof raw==="boolean"||raw===null)output[safeKey]=raw;
  }
  return output;
}
function referrerHost(value:unknown){
  const raw=text(value,500);
  if(!raw)return "direct";
  try{return new URL(raw).hostname.replace(/^www\./,"").slice(0,120)||"direct";}catch{return "direct";}
}
function deviceFromUA(ua:string){
  if(/iPad/i.test(ua))return "iPad";
  if(/iPhone/i.test(ua))return "iPhone";
  if(/Android/i.test(ua))return /Mobile/i.test(ua)?"Android phone":"Android tablet";
  if(/Macintosh|Mac OS X/i.test(ua))return "Mac";
  if(/Windows/i.test(ua))return "Windows";
  if(/Linux/i.test(ua))return "Linux";
  return "Other";
}
function browserFromUA(ua:string){
  if(/CriOS|Chrome/i.test(ua)&&!/Edg/i.test(ua))return "Chrome";
  if(/FxiOS|Firefox/i.test(ua))return "Firefox";
  if(/Edg/i.test(ua))return "Edge";
  if(/Safari/i.test(ua)&&!/Chrome|CriOS/i.test(ua))return "Safari";
  return "Other";
}
function countryFromEvent(event:AnalyticsEvent,request:Request){
  const header=text(request.headers.get("x-vercel-ip-country"),8).toUpperCase();
  if(header)return header;
  const timezone=event.properties&&typeof event.properties==="object"&&!Array.isArray(event.properties)?String((event.properties as Record<string,unknown>).timezone||""):"";
  const byTimezone:Record<string,string>={"Europe/Nicosia":"CY","Europe/Athens":"GR","Europe/London":"GB","Europe/Berlin":"DE","Europe/Paris":"FR"};
  return byTimezone[timezone]||"Unknown";
}
function cityFromRequest(request:Request){
  const raw=text(request.headers.get("x-vercel-ip-city"),120);
  if(!raw)return "";
  try{return decodeURIComponent(raw).slice(0,80);}catch{return raw.slice(0,80);}
}

type PlatformEvent={
  event_name:string;
  session_id:string;
  path:string;
  entity_type:string;
  entity_id:string;
  referrer_host:string;
  country:string;
  city:string;
  device:string;
  browser:string;
  client_ts:number;
  properties:Record<string,string|number|boolean|null>;
};

async function forwardToPlatform(events:PlatformEvent[]){
  const base=(process.env.PLATFORM_ANALYTICS_URL||"").trim().replace(/\/$/,"");
  const appId=(process.env.PLATFORM_ANALYTICS_APP_ID||"").trim();
  const secret=(process.env.PLATFORM_ANALYTICS_APP_SECRET||"").trim();
  if(!base||!appId||secret.length<32||!events.length)return;
  const now=Math.floor(Date.now()/1000);
  const envelope={v:1,issued_at:now,expires_at:now+60,app:{id:appId},request:{events}};
  const body=Buffer.from(JSON.stringify(envelope),"utf8").toString("base64");
  const signature=crypto.createHmac("sha256",secret).update(body).digest("hex");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),2500);
  try{
    const response=await fetch(base+"/api/analytics",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({body,signature}),
      signal:controller.signal,
      cache:"no-store",
    });
    if(!response.ok)console.warn("[analytics] platform forward failed",response.status);
  }catch(error){
    if((error as Error)?.name!=="AbortError")console.warn("[analytics] platform forward unavailable");
  }finally{
    clearTimeout(timeout);
  }
}

async function ensureTable(){
  const db=database();
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_ts TIMESTAMPTZ NULL,
    session_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    video_id TEXT NOT NULL DEFAULT '',
    referrer_host TEXT NOT NULL DEFAULT 'direct',
    country TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    browser TEXT NOT NULL DEFAULT '',
    properties JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events(session_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS analytics_events_video_idx ON analytics_events(video_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events(event_name)`);
}

export async function POST(request:Request){
  try{
    const body=await request.json() as {events?:unknown};
    const incoming=Array.isArray(body.events)?body.events.slice(0,MAX_BATCH):[];
    if(!incoming.length)return NextResponse.json({ok:true,accepted:0});
    await ensureTable();
    const ua=request.headers.get("user-agent")||"";
    const edgeCountry=text(request.headers.get("x-vercel-ip-country"),8).toUpperCase();
    const city=cityFromRequest(request);
    const device=deviceFromUA(ua);
    const browser=browserFromUA(ua);
    const db=database();
    let accepted=0;
    const platformEvents:PlatformEvent[]=[];
    for(const raw of incoming){
      const event=raw as AnalyticsEvent;
      const sessionId=text(event.sessionId,80);
      const name=text(event.name,50);
      if(!sessionId||!ALLOWED_EVENTS.has(name))continue;
      const path=text(event.path,220)||"/";
      const videoId=/^[A-Za-z0-9_-]{11}$/.test(text(event.videoId,32))?text(event.videoId,32):"";
      const clientTs=typeof event.ts==="number"&&Number.isFinite(event.ts)?new Date(event.ts).toISOString():null;
      const country=countryFromEvent(event,request);
      const properties={
        ...safeProps(event.properties),
        geoCountrySource:edgeCountry?"vercel-edge":"timezone-fallback",
        geoCitySource:city?"vercel-edge":"unknown",
      };
      const source=referrerHost(event.referrer);
      await db.query(
        `INSERT INTO analytics_events (client_ts,session_id,event_name,path,video_id,referrer_host,country,city,device,browser,properties)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [clientTs,sessionId,name,path,videoId,source,country,city,device,browser,JSON.stringify(properties)]
      );
      platformEvents.push({
        event_name:name,
        session_id:sessionId,
        path,
        entity_type:videoId?"video":"",
        entity_id:videoId,
        referrer_host:source,
        country,
        city,
        device,
        browser,
        client_ts:typeof event.ts==="number"&&Number.isFinite(event.ts)?event.ts:Date.now(),
        properties:{...safeProps(event.properties),source_app:"greektube"},
      });
      accepted+=1;
    }
    if(platformEvents.length)await forwardToPlatform(platformEvents);
    return NextResponse.json({ok:true,accepted,shared:platformEvents.length});
  }catch{
    return NextResponse.json({ok:false},{status:400});
  }
}

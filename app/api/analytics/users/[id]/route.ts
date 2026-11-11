import {NextResponse} from "next/server";
import {database} from "@/db/postgres";
import {verifyAdminSession} from "@/lib/admin-auth";

type Video={id:string;title?:string;originalTitle?:string;lastWatched?:string;lastPosition?:number;watchedSeconds?:number;progress?:number};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await verifyAdminSession(request))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  if(!/^\d{1,15}$/.test(id))return NextResponse.json({error:"not_found"},{status:404});
  try{
    const rows=await database().query(
      `SELECT p.public_id::text AS public_id,p.username,p.created_at,p.updated_at,ps.updated_at AS last_saved,ps.value,p.owner_key
       FROM user_profiles p LEFT JOIN personal_states ps ON ps.owner_key=p.owner_key WHERE p.public_id=$1::bigint LIMIT 1`,[id]) as unknown as Array<{public_id:string;username:string;created_at:string;updated_at:string;last_saved:string|null;value:string|null;owner_key:string}>;
    const row=rows[0];
    if(!row)return NextResponse.json({error:"not_found"},{status:404});
    let state:{videos?:Video[];moments?:unknown[]}={};try{state=JSON.parse(row.value||"{}");}catch{}
    const videos=(Array.isArray(state.videos)?state.videos:[]).filter(v=>Number(v.progress||0)>0||Number(v.lastPosition||0)>0)
      .sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||""))
      .map(v=>({id:v.id,title:v.title||v.originalTitle||v.id,progress:Math.round(Number(v.progress||0)),position:Math.round(Number(v.lastPosition||0)),watchedSeconds:Math.round(Number(v.watchedSeconds||0)),lastWatched:v.lastWatched||null}));
    return NextResponse.json({id:row.public_id,username:row.username,created_at:row.created_at,updated_at:row.updated_at,last_saved:row.last_saved,device_profile:row.owner_key.startsWith("anon:"),moments:Array.isArray(state.moments)?state.moments.length:0,videos},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    console.error("analytics user failed",error);
    return NextResponse.json({error:"user_failed"},{status:500});
  }
}

import {NextResponse} from "next/server";
import {database} from "@/db/postgres";
import {readAnonymousId} from "@/app/profile-domain";

function owner(request:Request){
  const device=readAnonymousId(request);
  return device ? "anon:"+device : null;
}
function noStore(data:unknown,status=200){
  return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
}

/** Detailed telemetry is strictly opt-in. It does not change the existing watch history. */
export async function GET(request:Request){
  const key=owner(request);
  if(!key)return noStore({error:"identity_pending"},409);
  try{
    const result=await database().query("SELECT detailed_activity, updated_at FROM gt_user_privacy_preferences WHERE device_owner_key=$1 LIMIT 1",[key]) as Array<{detailed_activity:boolean;updated_at:string}>;
    return noStore({detailedActivity:result[0]?.detailed_activity===true,updatedAt:result[0]?.updated_at||null,retentionDays:30});
  }catch{return noStore({error:"Δεν φορτώθηκαν οι επιλογές ιδιωτικότητας."},503);}
}
export async function PUT(request:Request){
  if(request.headers.get("origin")!==new URL(request.url).origin)return noStore({error:"Invalid origin"},403);
  const key=owner(request);
  if(!key)return noStore({error:"identity_pending"},409);
  if(!request.headers.get("content-type")?.includes("application/json"))return noStore({error:"Invalid content type"},415);
  const body=await request.json().catch(()=>null) as {detailedActivity?:unknown}|null;
  if(!body||typeof body.detailedActivity!=="boolean")return noStore({error:"Invalid preference"},400);
  try{
    await database().query(`INSERT INTO gt_user_privacy_preferences(device_owner_key,detailed_activity,updated_at)
      VALUES($1,$2,NOW()) ON CONFLICT(device_owner_key) DO UPDATE
      SET detailed_activity=EXCLUDED.detailed_activity,updated_at=NOW()`,[key,body.detailedActivity]);
    return noStore({ok:true,detailedActivity:body.detailedActivity});
  }catch{return noStore({error:"Δεν αποθηκεύτηκε η επιλογή."},503);}
}

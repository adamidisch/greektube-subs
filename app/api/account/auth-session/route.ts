import {createHmac} from "node:crypto";
import {NextResponse} from "next/server";
import {database} from "@/db/postgres";
import {auth} from "@/lib/pro-auth/server";

export const dynamic="force-dynamic";
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
function safeOrigin(request:Request){return request.headers.get("origin")===new URL(request.url).origin}
async function current(){
  const result=await auth.getSession();
  const user=result.data?.user;
  const session=result.data?.session;
  if(!user?.id||user.emailVerified!==true||!session?.id)return null;
  const key=process.env.NEON_AUTH_COOKIE_SECRET;
  if(!key)throw new Error("Missing session hashing key");
  const token=createHmac("sha256",key).update("gt-session:"+session.id).digest("hex");
  return {authUserId:user.id,sessionHash:token};
}
function device(userAgent:string){
  if(/iPhone/i.test(userAgent))return "iPhone";
  if(/iPad/i.test(userAgent))return "iPad";
  if(/Android/i.test(userAgent))return "Android";
  if(/Mac/i.test(userAgent))return "Mac";
  if(/Windows/i.test(userAgent))return "Windows";
  return "Other";
}
export async function POST(request:Request){
  if(!safeOrigin(request))return respond({error:"Invalid origin"},403);
  try{
    const identity=await current();
    if(!identity)return respond({authenticated:false},401);
    await database().query(`INSERT INTO gt_user_sessions(session_id,auth_user_id,device_type,signed_in_at,last_seen_at)
      VALUES($1,$2,$3,NOW(),NOW())
      ON CONFLICT(session_id) DO UPDATE SET last_seen_at=NOW(),signed_out_at=NULL`,
      [identity.sessionHash,identity.authUserId,device(request.headers.get("user-agent")||"")]);
    return respond({authenticated:true,recorded:true});
  }catch{return respond({error:"Δεν καταγράφηκε η συνεδρία."},503);}
}
export async function DELETE(request:Request){
  if(!safeOrigin(request))return respond({error:"Invalid origin"},403);
  try{
    const identity=await current();
    if(!identity)return respond({authenticated:false},401);
    await database().query(`UPDATE gt_user_sessions SET signed_out_at=NOW(),last_seen_at=NOW()
      WHERE session_id=$1 AND auth_user_id=$2`,[identity.sessionHash,identity.authUserId]);
    return respond({ok:true});
  }catch{return respond({error:"Δεν καταγράφηκε η αποσύνδεση."},503);}
}

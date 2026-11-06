import {NextResponse} from "next/server";
import {database} from "@/db/postgres";
import {readAnonymousId} from "@/app/profile-domain";
import {verifiedAuthUser} from "@/lib/pro-auth/identity";

export const dynamic="force-dynamic";
function respond(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}})}
export async function GET(){
  const user=await verifiedAuthUser();
  if(!user)return respond({authenticated:false,linked:false});
  const rows=await database().query("SELECT device_owner_key,linked_at FROM gt_account_links WHERE auth_user_id=$1 LIMIT 1",[user.id])
    as unknown as Array<{device_owner_key:string;linked_at:string}>;
  return respond({authenticated:true,emailVerified:true,email:user.email,linked:Boolean(rows[0]),linkedAt:rows[0]?.linked_at||null});
}
/** Explicit account claim only from the device possessing its HTTP-only legacy cookie.
 * Existing progress and username remain in-place. A verified login grants access
 * from future devices while old unauthenticated cookies lose access to linked data.
 */
export async function POST(request:Request){
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)return respond({error:"Invalid origin"},403);
  const user=await verifiedAuthUser();
  if(!user)return respond({error:"Απαιτείται επαληθευμένος λογαριασμός."},401);
  const device=readAnonymousId(request);
  if(!device)return respond({error:"Δεν υπάρχει προφίλ συσκευής για σύνδεση."},409);
  const owner="anon:"+device;
  try{
    const db=database();
    const existing=await db.query("SELECT device_owner_key FROM gt_account_links WHERE auth_user_id=$1 LIMIT 1",[user.id]) as unknown as Array<{device_owner_key:string}>;
    if(existing.length)return respond({ok:true,linked:true,alreadyLinked:true});
    const sources=await db.query("SELECT owner_key FROM user_profiles WHERE owner_key=$1 LIMIT 1",[owner]) as unknown as Array<{owner_key:string}>;
    if(!sources.length)return respond({error:"Φόρτωσε το υπάρχον προφίλ πριν το συνδέσεις."},409);
    const rows=await db.query(`INSERT INTO gt_account_links(device_owner_key,auth_user_id,linkage_method)
      VALUES($1,$2,'explicit_verified_session')
      ON CONFLICT DO NOTHING RETURNING device_owner_key`,[owner,user.id]) as unknown as Array<{device_owner_key:string}>;
    if(rows[0])return respond({ok:true,linked:true,alreadyLinked:false});
    return respond({error:"Το ιστορικό συσκευής είναι ήδη συνδεδεμένο με άλλον λογαριασμό."},409);
  }catch{
    return respond({error:"Δεν ολοκληρώθηκε η ασφαλής σύνδεση του ιστορικού."},503);
  }
}

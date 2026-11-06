import "server-only";
import {database} from "@/db/postgres";
import {readAnonymousId} from "@/app/profile-domain";

type VerifiedUser={id:string;email:string;emailVerified:boolean};
export async function verifiedAuthUser():Promise<VerifiedUser|null>{
  if(!process.env.NEON_AUTH_BASE_URL||!process.env.NEON_AUTH_COOKIE_SECRET)return null;
  try{
    const {auth}=await import("./server");
    const response=await auth.getSession();
    const user=response.data?.user;
    if(!user?.id||!user.email||user.emailVerified!==true)return null;
    return {id:user.id,email:user.email,emailVerified:true};
  }catch{
    // A failed auth check must never create elevated privileges.
    return null;
  }
}

/** Resolves a device-backed history to a verified account only after an explicit link.
 * Unauthenticated access to a linked legacy device cookie is rejected.
 */
export async function resolveProOwner(request:Request):Promise<{key:string|null;cookie:string|null;locked:boolean;verified:boolean}>{
  const id=readAnonymousId(request);
  const legacy=id?"anon:"+id:null;
  const verified=await verifiedAuthUser();
  if(verified){
    const linked=await database().query(
      "SELECT device_owner_key FROM gt_account_links WHERE auth_user_id=$1 ORDER BY linked_at LIMIT 1",
      [verified.id]) as unknown as Array<{device_owner_key:string}>;
    if(linked[0]?.device_owner_key)return {key:linked[0].device_owner_key,cookie:null,locked:false,verified:true};
  }
  if(!legacy)return {key:null,cookie:null,locked:false,verified:Boolean(verified)};
  const occupied=await database().query(
    "SELECT auth_user_id FROM gt_account_links WHERE device_owner_key=$1 LIMIT 1",[legacy]
  ) as unknown as Array<{auth_user_id:string}>;
  if(occupied.length)return {key:null,cookie:null,locked:true,verified:false};
  return {key:legacy,cookie:null,locked:false,verified:false};
}

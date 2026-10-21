import {NextResponse} from "next/server";
import {PROFILE_COOKIE} from "@/app/profile-domain";

export async function POST(request:Request){
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  for(const name of [PROFILE_COOKIE,"greektube-admin"])response.cookies.set(name,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0,expires:new Date(0)});
  return response;
}

import {NextResponse} from "next/server";
import {verifyAdminSession} from "@/lib/admin-auth";
import {loadAnalyticsReport,normalizeAnalyticsDays} from "@/lib/analytics-report";

export async function GET(request:Request){
  if(!await verifyAdminSession(request))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const days=normalizeAnalyticsDays(new URL(request.url).searchParams.get("days"));
    return NextResponse.json(await loadAnalyticsReport(days),{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    console.error("analytics report failed",error);
    return NextResponse.json({error:"report_failed"},{status:500});
  }
}

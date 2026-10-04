import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {ADMIN_SESSION_COOKIE,adminPassword,adminSessionToken,safeEqual} from "@/lib/admin-auth";
import {loadAnalyticsReport,normalizeAnalyticsDays} from "@/lib/analytics-report";
import AnalyticsDetailClient from "../../AnalyticsDetailClient";

async function authorized(){
  const password=adminPassword();
  if(!password)return false;
  const store=await cookies();
  const token=store.get(ADMIN_SESSION_COOKIE)?.value||"";
  return safeEqual(token,await adminSessionToken(password));
}

export default async function AnalyticsVisitorPage({params,searchParams}:{params:Promise<{sessionId:string}>;searchParams:Promise<{days?:string}>}){
  if(!await authorized())redirect("/admin/analytics");
  const [{sessionId},query]=await Promise.all([params,searchParams]);
  const days=normalizeAnalyticsDays(query.days);
  const report=await loadAnalyticsReport(days);
  return <AnalyticsDetailClient view="visitor" sessionId={decodeURIComponent(sessionId)} report={report} days={days}/>;
}

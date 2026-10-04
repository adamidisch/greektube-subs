import AnalyticsDetailClient from "../../AnalyticsDetailClient";

export default async function AnalyticsVisitorPage({params}:{params:Promise<{sessionId:string}>}){
  const {sessionId}=await params;
  return <AnalyticsDetailClient view="visitor" sessionId={decodeURIComponent(sessionId)}/>;
}

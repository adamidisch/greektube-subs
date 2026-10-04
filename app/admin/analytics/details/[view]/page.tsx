import AnalyticsDetailClient from "../../AnalyticsDetailClient";

export default async function AnalyticsDetailPage({params}:{params:Promise<{view:string}>}){
  const {view}=await params;
  return <AnalyticsDetailClient view={view}/>;
}

"use client";

import "./analytics-dashboard.css";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import type {AnalyticsDaily,AnalyticsReport,AnalyticsVisitor} from "@/lib/analytics-report";
import AnalyticsLogo from "./AnalyticsLogo";
import UsersView from "./UsersView";
import {SortHead,sortRows} from "./sortable";
import type {Sort,SortCol} from "./sortable";

type MetricKey="sessions"|"page_views"|"video_opens"|"watch_seconds";
type Nav={view:string;id:string;country:string;city:string;device:string;browser:string;source:string;bot:string};
type Props={report:AnalyticsReport|null;loading:boolean;error:string;days:number;onDays:(value:number)=>void;onRefresh:()=>void};

const BLANK:Nav={view:"overview",id:"",country:"",city:"",device:"",browser:"",source:"",bot:""};
const PERIODS:Array<[number,string]>=[[1,"Today"],[7,"7 days"],[30,"30 days"],[90,"90 days"]];
const METRICS:Array<[MetricKey,string]>=[["sessions","Visitors"],["page_views","Page views"],["video_opens","Video views"],["watch_seconds","Watch time"]];
const PAGE_SIZE=20;

const ICONS:Record<string,string>={
  overview:"M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z",
  audience:"M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z",
  content:"M8 5v14l11-7L8 5z",
  visitors:"M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z",
  health:"M12 21s-7-4.4-9.3-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.3 12C19 16.6 12 21 12 21z",
  users:"M12 3 4 6v6c0 4.4 3.1 8.4 8 9 4.9-.6 8-4.6 8-9V6l-8-3z",
  site:"M14 3v2h3.6l-9.3 9.3 1.4 1.4L19 6.4V10h2V3h-7zM5 5v14h14v-6h-2v4H7V7h4V5H5z",
};
function Icon({name}:{name:string}){return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={ICONS[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round"/></svg>;}

const num=(value:number|undefined)=>new Intl.NumberFormat("en-US").format(Math.round(Number(value)||0));
function dur(value:number){
  const t=Math.max(0,Math.round(Number(value)||0));const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;
  return h?`${h}h ${String(m).padStart(2,"0")}m`:m?`${m}m ${String(s).padStart(2,"0")}s`:`${s}s`;
}
function when(value:string|undefined){return value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";}
function flag(code:string){const c=(code||"").toUpperCase();return /^[A-Z]{2}$/.test(c)?String.fromCodePoint(...c.split("").map(x=>127397+x.charCodeAt(0))):"🌐";}
function countryName(code:string){const c=(code||"").toUpperCase();if(!c||c==="UNKNOWN")return "Unknown";try{return new Intl.DisplayNames(["en"],{type:"region"}).of(c)||c;}catch{return c;}}
function place(v:{city?:string;country:string}){return [v.city&&v.city!=="Unknown"?v.city:"",countryName(v.country)].filter(Boolean).join(", ");}
// Conservative heuristic: one-page, no-video sessions from Linux/unknown devices are almost always crawlers or scanners.
const isBot=(v:AnalyticsVisitor)=>Number(v.video_opens)===0&&Number(v.watch_seconds)===0&&Number(v.events)<=2&&/^(linux|other|)$/i.test((v.device||"").trim());
function delta(current:number,previous:number){
  if(!previous)return current?{label:"new",tone:"up"}:null;
  const pct=Math.round((current-previous)/previous*100);
  return {label:(pct>0?"+":"")+pct+"%",tone:pct>0?"up":pct<0?"down":"flat"};
}
const metricValue=(key:MetricKey,value:number)=>key==="watch_seconds"?dur(value):num(value);

function readNav():Nav{
  const p=new URLSearchParams(typeof window==="undefined"?"":window.location.search);
  const nav={...BLANK};
  for(const key of Object.keys(BLANK) as Array<keyof Nav>)nav[key]=p.get(key)||BLANK[key];
  return nav;
}
function useNav(){
  const [nav,setNav]=useState<Nav>(readNav);
  useEffect(()=>{
    const onPop=()=>setNav(readNav());
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[]);
  const go=(patch:Partial<Nav>)=>{
    const next={...BLANK,...patch};
    const params=new URLSearchParams();
    for(const key of Object.keys(next) as Array<keyof Nav>)if(next[key]&&next[key]!==BLANK[key])params.set(key,next[key]);
    window.history.pushState(null,"",window.location.pathname+(params.toString()?"?"+params:""));
    setNav(next);
    window.scrollTo({top:0});
  };
  return [nav,go] as const;
}

function Sparkline({values}:{values:number[]}){
  if(values.length<2)return <svg className="ad-spark" viewBox="0 0 100 28" aria-hidden="true"/>;
  const max=Math.max(1,...values);
  const pts=values.map((v,i)=>`${(i/(values.length-1)*100).toFixed(1)},${(26-(v/max)*24).toFixed(1)}`).join(" ");
  return <svg className="ad-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/></svg>;
}

function AreaChart({data,metric,hourly}:{data:AnalyticsDaily[];metric:MetricKey;hourly:boolean}){
  const [hover,setHover]=useState<number|null>(null);
  const W=720,H=230,L=8,R=8,T=14,B=26;
  const values=data.map(d=>Number(d[metric])||0);
  const max=Math.max(1,...values);
  const x=(i:number)=>L+(data.length<2?0:i/(data.length-1))*(W-L-R);
  const y=(v:number)=>T+(1-v/max)*(H-T-B);
  const line=values.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area=line+` L${x(values.length-1).toFixed(1)},${H-B} L${x(0).toFixed(1)},${H-B} Z`;
  const label=(bucket:string)=>{const d=new Date(bucket+":00Z");return hourly?bucket.slice(11,16):d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"UTC"});};
  const ticks=data.length<=4?data.map((_,i)=>i):[0,Math.round((data.length-1)/3),Math.round((data.length-1)*2/3),data.length-1];
  function move(event:React.PointerEvent<HTMLDivElement>){
    const rect=event.currentTarget.getBoundingClientRect();
    setHover(Math.max(0,Math.min(data.length-1,Math.round((event.clientX-rect.left)/rect.width*(data.length-1)))));
  }
  if(!data.length||values.every(v=>v===0))return <p className="ad-empty">No activity in this period yet.</p>;
  return <div className="ad-chart" onPointerMove={move} onPointerLeave={()=>setHover(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${metric} over time`}>
      <defs><linearGradient id="ad-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ad-accent)" stopOpacity=".28"/><stop offset="1" stopColor="var(--ad-accent)" stopOpacity="0"/></linearGradient></defs>
      {[0,.25,.5,.75,1].map(f=><line key={f} x1={L} x2={W-R} y1={T+f*(H-T-B)} y2={T+f*(H-T-B)} className="ad-gridline"/>)}
      <path d={area} fill="url(#ad-fill)"/><path className="ad-line" d={line} fill="none" stroke="var(--ad-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1}/>
      {hover!==null&&<line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} className="ad-cursor"/>}
    </svg>
    <div className="ad-axis">{ticks.map(i=><span key={i} style={{left:`${(x(i)/W)*100}%`}}>{label(data[i].bucket)}</span>)}</div>
    {hover!==null&&<div className="ad-tip" style={{left:`${(x(hover)/W)*100}%`,top:`${(y(values[hover])/H)*100}%`}}><small>{label(data[hover].bucket)}</small><strong>{metricValue(metric,values[hover])}</strong></div>}
  </div>;
}

type BarRow={key:string;label:string;value:number;meta?:string;lead?:string;display?:string;onOpen?:()=>void};
function BarList({rows,empty="No data yet."}:{rows:BarRow[];empty?:string}){
  const max=Math.max(1,...rows.map(r=>r.value));
  if(!rows.length)return <p className="ad-empty">{empty}</p>;
  return <ul className="ad-bars">{rows.map(r=>{
    const inner=<><div><span className="ad-bar-label">{r.lead&&<b aria-hidden="true">{r.lead}</b>}<em>{r.label}</em></span><strong>{r.display??num(r.value)}</strong></div><i style={{width:`${Math.max(3,r.value/max*100)}%`}}/>{r.meta&&<small>{r.meta}</small>}</>;
    return <li key={r.key}>{r.onOpen?<button type="button" className="ad-row-btn" onClick={r.onOpen}>{inner}</button>:inner}</li>;
  })}</ul>;
}

function Card({title,kicker,action,children,className=""}:{title:string;kicker?:string;action?:React.ReactNode;children:React.ReactNode;className?:string}){
  return <section className={"ad-card "+className}><header><div>{kicker&&<small>{kicker}</small>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}
function Stat({label,value,note}:{label:string;value:string;note?:string}){return <article className="ad-stat"><small>{label}</small><strong>{value}</strong>{note&&<p>{note}</p>}</article>;}

function Skeleton(){
  return <div className="ad-skel" aria-busy="true" aria-label="Loading analytics">
    <div className="ad-kpis">{Array.from({length:6},(_,i)=><div key={i} className="ad-kpi sk"><i/><i/><i/></div>)}</div>
    <div className="ad-grid two"><div className="ad-card sk big"><i/><i/></div><div className="ad-card sk big"><i/><i/><i/></div></div>
  </div>;
}

export default function AnalyticsDashboard({report,loading,error,days,onDays,onRefresh}:Props){
  const [nav,go]=useNav();
  const [metric,setMetric]=useState<MetricKey>("sessions");
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(0);
  const [vSort,setVSort]=useState<Sort>(null);
  const [rankSort,setRankSort]=useState<{videos:Sort;pages:Sort}>({videos:null,pages:null});
  const detailBase=nav.view;

  const visitors=useMemo(()=>report?.visitors??[],[report]);
  const botIds=useMemo(()=>new Set(visitors.filter(isBot).map(v=>v.session_id)),[visitors]);
  const humans=Math.max(0,Number(report?.summary.sessions||0)-botIds.size);
  const byId=useMemo(()=>new Map(visitors.map(v=>[v.session_id,v])),[visitors]);
  const title=(id:string)=>report?.videoTitles[id]||id;

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return visitors.filter(v=>{
      const bot=botIds.has(v.session_id);
      if(nav.bot==="1"?!bot:nav.bot==="all"?false:bot)return false;
      if(nav.country&&v.country!==nav.country)return false;
      if(nav.city&&v.city!==nav.city)return false;
      if(nav.device&&v.device!==nav.device)return false;
      if(nav.browser&&v.browser!==nav.browser)return false;
      if(nav.source&&(v.source||"direct")!==nav.source)return false;
      return !q||[place(v),v.device,v.browser,v.source,v.session_id].join(" ").toLowerCase().includes(q);
    });
  },[visitors,botIds,nav,query]);
  const visitorCols=(videoId?:string):SortCol[]=>[{key:"loc",label:"Location"},{key:"device",label:"Device"},{key:"source",label:"Source"},{key:"a",label:videoId?"Opens":"Pages",numeric:true},{key:"b",label:videoId?"Last":"Videos",numeric:!videoId},{key:"watch",label:"Watch",numeric:true},{key:"seen",label:"Last seen",numeric:true}];
  const visitorAcc=(videoId?:string)=>{
    const stats=videoId?new Map((report?.visitorVideoStats??[]).filter(x=>x.video_id===videoId).map(x=>[x.session_id,x])):null;
    return {loc:(v:AnalyticsVisitor)=>place(v),device:(v:AnalyticsVisitor)=>`${v.device} ${v.browser}`,source:(v:AnalyticsVisitor)=>v.source||"direct",
      a:(v:AnalyticsVisitor)=>Number(stats?stats.get(v.session_id)?.views:v.page_views)||0,
      b:(v:AnalyticsVisitor)=>stats?String(stats.get(v.session_id)?.last_seen||""):Number(v.video_opens)||0,
      watch:(v:AnalyticsVisitor)=>Number(stats?stats.get(v.session_id)?.watch_seconds:v.watch_seconds)||0,
      seen:(v:AnalyticsVisitor)=>new Date(v.last_seen).getTime()||0};
  };
  const sortedFiltered=useMemo(()=>sortRows(filtered,vSort,visitorAcc()),[filtered,vSort,report]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages=Math.max(1,Math.ceil(sortedFiltered.length/PAGE_SIZE));
  const cur=Math.min(page,pages-1);
  const shown=sortedFiltered.slice(cur*PAGE_SIZE,(cur+1)*PAGE_SIZE);

  const daily=report?.daily??[];
  const prev=report?.previous;
  const bugsTotal=(report?.bugs??[]).reduce((s,b)=>s+Number(b.count||0),0);
  const okLogins=(report?.logins??[]).filter(l=>l.event_name==="login").length;
  const failedLogins=(report?.logins??[]).length-okLogins;
  const live=Number(report?.summary.recent_events||0)>0;
  const openVisitor=(id:string)=>go({view:"visitor",id});
  const openVideo=(id:string)=>go({view:"video",id});
  const filterBy=(patch:Partial<Nav>)=>{setPage(0);setQuery("");go({view:"visitors",...patch});};

  const NAV:Array<[string,string,number?]>=[["overview","Overview"],["audience","Audience"],["content","Content"],["visitors","Visitors"],["health","Health",report?.bugs.length||0],["users","Users"]];
  const section=nav.view==="video"?"content":nav.view==="visitor"?"visitors":nav.view==="user"?"users":nav.view;
  const heading:Record<string,string>={overview:"Overview",audience:"Audience",content:"Content",visitors:"Visitors",health:"Health",users:"Users",user:"Profile",video:"Video",visitor:"Visitor"};
  const drill=nav.view==="video"||nav.view==="visitor"||nav.view==="user";

  const kpis=report?[
    {key:"visitors",label:"Visitors",value:num(humans),note:botIds.size?`${botIds.size} automated hidden`:"Unique sessions",open:()=>filterBy({}),series:daily.map(d=>d.sessions),d:delta(Number(report.summary.sessions),Number(prev?.sessions))},
    {key:"pages",label:"Page views",value:num(report.summary.page_views),note:"All pages",open:()=>go({view:"content"}),series:daily.map(d=>d.page_views),d:delta(Number(report.summary.page_views),Number(prev?.page_views))},
    {key:"videos",label:"Video views",value:num(report.summary.video_opens),note:`${num(report.summary.unique_videos)} videos watched`,open:()=>go({view:"content"}),series:daily.map(d=>d.video_opens),d:delta(Number(report.summary.video_opens),Number(prev?.video_opens))},
    {key:"watch",label:"Watch time",value:dur(report.summary.watch_seconds||0),note:"Actual viewing",open:()=>go({view:"content"}),series:daily.map(d=>d.watch_seconds),d:delta(Number(report.summary.watch_seconds),Number(prev?.watch_seconds))},
    {key:"bugs",label:"Bugs",value:num(bugsTotal),note:report.bugs.length?`${report.bugs.length} distinct errors`:"No errors seen",open:()=>go({view:"health"}),series:daily.map(d=>d.errors),d:null,bad:bugsTotal>0},
    {key:"logins",label:"Admin logins",value:num(okLogins),note:`${failedLogins} failed attempts`,open:()=>go({view:"health"}),series:[] as number[],d:null,bad:failedLogins>0},
  ]:[];

  const activeFilters=([["country",nav.country?countryName(nav.country):""],["city",nav.city],["device",nav.device],["browser",nav.browser],["source",nav.source]] as const).filter(([,v])=>v);

  function renderTable({rows,videoId}:{rows:AnalyticsVisitor[];videoId?:string}){
    const stats=videoId?new Map((report?.visitorVideoStats??[]).filter(s=>s.video_id===videoId).map(s=>[s.session_id,s])):null;
    return <div className="ad-table" role="table">
      <SortHead cols={visitorCols(videoId)} sort={vSort} onSort={next=>{setVSort(next);setPage(0);}}/>
      {(videoId?sortRows(rows,vSort,visitorAcc(videoId)):rows).map(v=>{const s=stats?.get(v.session_id);return <button type="button" key={v.session_id} className="ad-tr" role="row" onClick={()=>openVisitor(v.session_id)}>
        <span className="loc"><b aria-hidden="true">{flag(v.country)}</b><em>{place(v)||"Unknown"}{botIds.has(v.session_id)&&<i className="ad-chip">automated</i>}</em></span>
        <span data-label="Device">{v.device||"—"} · {v.browser||"—"}</span><span data-label="Source">{v.source||"direct"}</span>
        <span data-label={videoId?"Opens":"Pages"}>{num(s?s.views:v.page_views)}</span><span data-label={videoId?"Last":"Videos"}>{s?when(s.last_seen):num(v.video_opens)}</span><span data-label="Watch">{dur(s?s.watch_seconds:v.watch_seconds)}</span><span data-label="Last seen">{when(v.last_seen)}</span>
      </button>;})}
      {!rows.length&&<p className="ad-empty">No visitors match.</p>}
    </div>;
  }

  function renderBody(){
    if(!report)return null;
    if(nav.view==="users"||nav.view==="user")return <UsersView id={nav.view==="user"?nav.id:""} onOpen={id=>go({view:"user",id})} onOpenVideo={openVideo}/>;
    if(nav.view==="video"){
      const row=report.topVideos.find(v=>v.video_id===nav.id);
      const ids=new Set(report.visitorVideoStats.filter(s=>s.video_id===nav.id).map(s=>s.session_id));
      const rows=[...ids].map(id=>byId.get(id)).filter((v):v is AnalyticsVisitor=>Boolean(v)).sort((a,b)=>b.last_seen.localeCompare(a.last_seen));
      const meta=report.videoMeta[nav.id];
      return <>
        <section className="ad-hero"><div><small>VIDEO</small><h2>{title(nav.id)}</h2><p>{meta?.speakerName||nav.id}</p></div><a className="ad-btn" href={`/?video=${nav.id}`} target="_blank" rel="noreferrer">Open video ↗</a></section>
        <div className="ad-stats"><Stat label="VIEWS" value={num(row?.views)}/><Stat label="VISITORS" value={num(row?.sessions)} note="Who opened it"/><Stat label="WATCH TIME" value={dur(row?.watch_seconds||0)}/><Stat label="LAST VIEWED" value={when(row?.last_seen)}/></div>
        <Card title="Who watched this video" kicker={`${rows.length} VISITORS`} className="flush">{renderTable({rows,videoId:nav.id})}</Card>
      </>;
    }
    if(nav.view==="visitor"){
      const v=byId.get(nav.id);
      if(!v)return <section className="ad-message">This visitor is not in the selected period.</section>;
      const vids=report.visitorVideoStats.filter(s=>s.session_id===v.session_id).sort((a,b)=>b.watch_seconds-a.watch_seconds||b.views-a.views);
      const events=report.recent.filter(e=>e.session_id===v.session_id).slice(0,40);
      return <>
        <section className="ad-hero"><div className="ad-hero-loc"><b>{flag(v.country)}</b><div><small>VISITOR{botIds.has(v.session_id)?" · LIKELY AUTOMATED":""}</small><h2>{place(v)||"Unknown location"}</h2><p>{v.device||"—"} · {v.browser||"—"} · from {v.source||"direct"}</p></div></div></section>
        <div className="ad-stats"><Stat label="FIRST SEEN" value={when(v.first_seen)}/><Stat label="LAST SEEN" value={when(v.last_seen)}/><Stat label="VIDEO VIEWS" value={num(v.video_opens)} note={`${num(v.page_views)} page views`}/><Stat label="WATCH TIME" value={dur(v.watch_seconds)}/></div>
        <div className="ad-grid two even">
          <Card title="Videos watched" kicker="CONTENT">{vids.length?<ul className="ad-events">{vids.map(s=><li key={s.video_id}><button type="button" className="ad-ev" onClick={()=>openVideo(s.video_id)}><span className="ad-chip">{num(s.views)}×</span><div><strong>{title(s.video_id)}</strong><small>{dur(s.watch_seconds)} watched</small></div><time>{when(s.last_seen)}</time></button></li>)}</ul>:<p className="ad-empty">No videos opened.</p>}</Card>
          <Card title="Recent activity" kicker="EVENTS">{events.length?<ul className="ad-events">{events.map((e,i)=><li key={i}><div className="ad-ev static"><span className="ad-chip">{e.event_name}</span><div><strong>{e.video_id?title(e.video_id):e.path}</strong></div><time>{when(e.created_at)}</time></div></li>)}</ul>:<p className="ad-empty">No recent events in the retained window.</p>}</Card>
        </div>
      </>;
    }
    if(nav.view==="audience")return <div className="ad-grid three">
      <Card title="Countries" kicker="LOCATION"><BarList rows={report.countries.slice(0,12).map(c=>({key:c.name,label:countryName(c.name),lead:flag(c.name),value:Number(c.sessions),meta:c.confirmed_sessions?`${c.confirmed_sessions} edge verified`:undefined,onOpen:()=>filterBy({country:c.name})}))}/></Card>
      <Card title="Cities" kicker="LOCATION"><BarList rows={report.cities.slice(0,12).map(c=>({key:c.name+c.country,label:`${c.name}, ${countryName(c.country)}`,value:Number(c.sessions),onOpen:()=>filterBy({city:c.name,country:c.country})}))}/></Card>
      <Card title="Sources" kicker="ACQUISITION"><BarList rows={report.sources.slice(0,12).map(s=>({key:s.name||"direct",label:s.name||"direct",value:Number(s.sessions),onOpen:()=>filterBy({source:s.name||"direct"})}))}/></Card>
      <Card title="Devices" kicker="TECH"><BarList rows={report.devices.map(d=>({key:d.name,label:d.name,value:Number(d.sessions),onOpen:()=>filterBy({device:d.name})}))}/></Card>
      <Card title="Browsers" kicker="TECH"><BarList rows={report.browsers.map(d=>({key:d.name,label:d.name,value:Number(d.sessions),onOpen:()=>filterBy({browser:d.name})}))}/></Card>
      <Card title="Events" kicker="ACTIVITY"><BarList rows={report.events.slice(0,12).map(e=>({key:e.name,label:e.name,value:Number(e.count)}))}/></Card>
    </div>;
    if(nav.view==="content")return <div className="ad-grid two even">
      <Card title="Videos" kicker="PERFORMANCE">
        <SortHead className="rank" cols={[{key:"n",label:"Video"},{key:"views",label:"Views",numeric:true},{key:"sessions",label:"Visitors",numeric:true},{key:"watch",label:"Watch",numeric:true}]} sort={rankSort.videos} onSort={next=>setRankSort(r=>({...r,videos:next}))}/>
        <ol className="ad-rank">{sortRows(report.topVideos,rankSort.videos,{n:v=>title(v.video_id),views:v=>Number(v.views),sessions:v=>Number(v.sessions),watch:v=>Number(v.watch_seconds)}).slice(0,20).map((v,i)=><li key={v.video_id}><button type="button" onClick={()=>openVideo(v.video_id)}><b>{i+1}</b><div><strong>{title(v.video_id)}</strong><small>{report.videoMeta[v.video_id]?.speakerName||v.video_id}</small></div><span><small>VIEWS</small>{num(v.views)}</span><span><small>VISITORS</small>{num(v.sessions)}</span><span><small>WATCH</small>{dur(v.watch_seconds)}</span></button></li>)}</ol>
        {!report.topVideos.length&&<p className="ad-empty">No video activity yet.</p>}
      </Card>
      <Card title="Pages" kicker="TRAFFIC">
        <SortHead className="rank pages" cols={[{key:"n",label:"Page"},{key:"views",label:"Views",numeric:true},{key:"sessions",label:"Visitors",numeric:true}]} sort={rankSort.pages} onSort={next=>setRankSort(r=>({...r,pages:next}))}/>
        <ol className="ad-rank">{sortRows(report.topPages,rankSort.pages,{n:p=>p.name,views:p=>Number(p.views),sessions:p=>Number(p.sessions)}).slice(0,20).map((p,i)=>{const m=/video=([A-Za-z0-9_-]{11})/.exec(p.name);return <li key={p.name}><button type="button" disabled={!m} onClick={()=>m&&openVideo(m[1])}><b>{i+1}</b><div><strong>{m?title(m[1]):p.name==="/"?"Library / Home":p.name}</strong><small>{m?"Video page":"Site page"}</small></div><span><small>VIEWS</small>{num(p.views)}</span><span><small>VISITORS</small>{num(p.sessions)}</span></button></li>;})}</ol>
      </Card>
    </div>;
    if(nav.view==="visitors")return <Card title="Visitors" kicker={`${num(filtered.length)} SESSIONS`} className="flush" action={<div className="ad-filters">
      <input type="search" inputMode="search" placeholder="Search visitors…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} aria-label="Search visitors"/>
      <div className="ad-seg" role="group" aria-label="Filter">{([["","People"],["1","Automated"],["all","All"]] as const).map(([key,label])=><button type="button" key={key} className={nav.bot===key?"active":""} onClick={()=>{setPage(0);go({...nav,view:"visitors",bot:key});}}>{label}</button>)}</div>
    </div>}>
      {activeFilters.length>0&&<div className="ad-chips">{activeFilters.map(([k,v])=><button type="button" key={k} className="ad-fchip" onClick={()=>go({...nav,view:"visitors",[k]:""})}>{k}: {v} <span aria-hidden="true">×</span></button>)}</div>}
      {renderTable({rows:shown})}
      {pages>1&&<footer className="ad-pager"><button type="button" className="ad-btn" disabled={cur<=0} onClick={()=>setPage(cur-1)}>Previous</button><span>Page {cur+1} of {pages}</span><button type="button" className="ad-btn" disabled={cur>=pages-1} onClick={()=>setPage(cur+1)}>Next</button></footer>}
    </Card>;
    if(nav.view==="health")return <div className="ad-grid two even">
      <Card title="Bugs & errors" kicker="RELIABILITY">
        {report.bugs.length?<ul className="ad-events">{report.bugs.slice(0,15).map((b,i)=><li key={i}><button type="button" className="ad-ev" onClick={()=>openVisitor(b.last_session)}><span className="ad-chip bad">{b.kind.replace("_"," ")}</span><div><strong>{b.message}</strong><small>{b.source||b.last_path} · {num(b.count)}× · {num(b.sessions)} visitors</small></div><time>{when(b.last_seen)}</time></button></li>)}</ul>
          :<p className="ad-empty">No errors recorded in this period. Tracking is active — new errors appear here automatically.</p>}
      </Card>
      <Card title="Admin logins" kicker="SECURITY">
        {report.logins.length?<ul className="ad-events">{report.logins.slice(0,15).map((l,i)=><li key={i}><div className="ad-ev static"><span className={"ad-chip "+(l.event_name==="login"?"good":"bad")}>{l.event_name==="login"?"signed in":"failed"}</span><div><strong>{flag(l.country)} {place(l)}</strong><small>{l.device} · {l.browser}{l.ip?` · ${l.ip}`:""}</small></div><time>{when(l.created_at)}</time></div></li>)}</ul>
          :<p className="ad-empty">No admin logins recorded yet. Logging started with this version.</p>}
      </Card>
    </div>;
    return <>
      <section className="ad-kpis">{kpis.map(k=><button type="button" key={k.key} onClick={k.open} className={"ad-kpi"+(k.bad?" bad":"")}>
        <small>{k.label}</small><strong>{k.value}</strong>
        <div className="ad-kpi-foot"><span>{k.note}</span>{k.d&&<em className={"ad-delta "+k.d.tone}>{k.d.label}</em>}</div>
        {k.series.length>1&&<Sparkline values={k.series}/>}
      </button>)}</section>
      <div className="ad-grid two">
        <Card title="Activity over time" kicker={days===1?"LAST 24 HOURS":`LAST ${days} DAYS`} className="wide" action={<div className="ad-seg" role="group" aria-label="Metric">{METRICS.map(([key,label])=><button type="button" key={key} className={metric===key?"active":""} onClick={()=>setMetric(key)}>{label}</button>)}</div>}>
          <AreaChart key={metric+days} data={daily} metric={metric} hourly={days===1}/>
        </Card>
        <Card title="Right now" kicker="HEALTH">
          <ul className="ad-facts">
            <li><span>Events in last 15 min</span><strong>{num(report.summary.recent_events)}</strong></li>
            <li><span>Latest event</span><strong>{when(report.summary.latest_event||undefined)}</strong></li>
            <li><button type="button" onClick={()=>filterBy({bot:"1"})}><span>Likely automated sessions</span><strong>{num(botIds.size)} ›</strong></button></li>
            <li><button type="button" onClick={()=>go({view:"health"})}><span>Bugs this period</span><strong className={bugsTotal?"bad":"good"}>{num(bugsTotal)} ›</strong></button></li>
            <li><button type="button" onClick={()=>go({view:"health"})}><span>Failed admin logins</span><strong className={failedLogins?"bad":"good"}>{num(failedLogins)} ›</strong></button></li>
          </ul>
        </Card>
      </div>
      <div className="ad-grid three">
        <Card title="Top videos" kicker="CONTENT" action={<button type="button" className="ad-link" onClick={()=>go({view:"content"})}>All videos</button>}>
          <BarList rows={report.topVideos.slice(0,6).map(v=>({key:v.video_id,label:title(v.video_id),value:Number(v.views),display:`${num(v.views)} views`,meta:`${dur(v.watch_seconds)} watched · ${num(v.sessions)} visitors`,onOpen:()=>openVideo(v.video_id)}))}/>
        </Card>
        <Card title="Countries" kicker="AUDIENCE" action={<button type="button" className="ad-link" onClick={()=>go({view:"audience"})}>All</button>}>
          <BarList rows={report.countries.slice(0,6).map(c=>({key:c.name,label:countryName(c.name),lead:flag(c.name),value:Number(c.sessions),onOpen:()=>filterBy({country:c.name})}))}/>
        </Card>
        <Card title="Where visitors come from" kicker="ACQUISITION">
          <BarList rows={report.sources.slice(0,6).map(s=>({key:s.name||"direct",label:s.name||"direct",value:Number(s.sessions),onOpen:()=>filterBy({source:s.name||"direct"})}))}/>
        </Card>
      </div>
    </>;
  }

  return <div className="ad">
    <aside className="ad-side">
      <div className="ad-brand"><AnalyticsLogo size={36}/><div><strong>GreekTube</strong><span>Analytics</span></div></div>
      <nav aria-label="Analytics sections">
        {NAV.map(([key,label,badge])=><button type="button" key={key} className={section===key?"active":""} onClick={()=>{setPage(0);go({view:key});}}><Icon name={key}/><span>{label}</span>{badge?<em className="ad-badge">{badge}</em>:null}</button>)}
        <hr/>
        <Link href="/"><Icon name="site"/><span>Open site</span></Link>
      </nav>
      <div className="ad-side-foot"><div className={"ad-live "+(live?"on":"")}><i/>{live?"Live now":"Idle"}</div></div>
    </aside>
    <main className="ad-main">
      <div className={"ad-progress"+(loading?" on":"")} aria-hidden="true"/>
      <header className="ad-top">
        <div className="ad-title">
          {drill&&<button type="button" className="ad-back" onClick={()=>window.history.back()}>← Back</button>}
          <span>GREEKTUBE ANALYTICS</span><h1>{heading[detailBase]||"Overview"}</h1>
        </div>
        <div className="ad-actions">
          <div className="ad-periods" role="group" aria-label="Period">{PERIODS.map(([value,label])=><button type="button" key={value} className={days===value?"active":""} onClick={()=>{onDays(value);setPage(0);}}>{label}</button>)}</div>
          <button type="button" className="ad-btn" onClick={onRefresh} disabled={loading}>{loading?"Loading…":"Refresh"}</button>
        </div>
      </header>
      <div className={"ad-content"+(loading&&report?" stale":"")} key={nav.view+nav.id}>
        {error?<section className="ad-message">{error}</section>:!report?<Skeleton/>:renderBody()}
      </div>
    </main>
  </div>;
}

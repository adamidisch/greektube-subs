"use client";

import "./analytics-dashboard.css";
import Link from "next/link";
import {useMemo,useState} from "react";
import type {AnalyticsDaily,AnalyticsReport,AnalyticsVisitor} from "@/lib/analytics-report";

type Tab="overview"|"audience"|"content"|"visitors"|"health";
type MetricKey="sessions"|"page_views"|"video_opens"|"watch_seconds";
type Props={report:AnalyticsReport|null;error:string;days:number;onDays:(value:number)=>void;onRefresh:()=>void};

const TABS:Array<[Tab,string]>=[["overview","Overview"],["audience","Audience"],["content","Content"],["visitors","Visitors"],["health","Health"]];
const PERIODS:Array<[number,string]>=[[1,"Today"],[7,"7 days"],[30,"30 days"],[90,"90 days"]];
const METRICS:Array<[MetricKey,string]>=[["sessions","Visitors"],["page_views","Page views"],["video_opens","Video views"],["watch_seconds","Watch time"]];
const PAGE_SIZE=20;

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
    const ratio=(event.clientX-rect.left)/rect.width;
    setHover(Math.max(0,Math.min(data.length-1,Math.round(ratio*(data.length-1)))));
  }
  if(!data.length||values.every(v=>v===0))return <p className="ad-empty">No activity in this period yet.</p>;
  return <div className="ad-chart" onPointerMove={move} onPointerLeave={()=>setHover(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${metric} over time`}>
      <defs><linearGradient id="ad-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ad-accent)" stopOpacity=".28"/><stop offset="1" stopColor="var(--ad-accent)" stopOpacity="0"/></linearGradient></defs>
      {[0,.25,.5,.75,1].map(f=><line key={f} x1={L} x2={W-R} y1={T+f*(H-T-B)} y2={T+f*(H-T-B)} className="ad-grid"/>)}
      <path d={area} fill="url(#ad-fill)"/><path d={line} fill="none" stroke="var(--ad-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      {hover!==null&&<line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} className="ad-cursor"/>}
    </svg>
    <div className="ad-axis">{ticks.map(i=><span key={i} style={{left:`${(x(i)/W)*100}%`}}>{label(data[i].bucket)}</span>)}</div>
    {hover!==null&&<div className="ad-tip" style={{left:`${(x(hover)/W)*100}%`,top:`${(y(values[hover])/H)*100}%`}}><small>{label(data[hover].bucket)}</small><strong>{metricValue(metric,values[hover])}</strong></div>}
  </div>;
}

function BarList({rows,empty="No data yet."}:{rows:Array<{key:string;label:string;value:number;meta?:string;lead?:string;display?:string}>;empty?:string}){
  const max=Math.max(1,...rows.map(r=>r.value));
  if(!rows.length)return <p className="ad-empty">{empty}</p>;
  return <ul className="ad-bars">{rows.map(r=><li key={r.key}><div><span className="ad-bar-label">{r.lead&&<b aria-hidden="true">{r.lead}</b>}<em>{r.label}</em></span><strong>{r.display??num(r.value)}</strong></div><i style={{width:`${Math.max(3,r.value/max*100)}%`}}/>{r.meta&&<small>{r.meta}</small>}</li>)}</ul>;
}

function Card({title,kicker,action,children,className=""}:{title:string;kicker?:string;action?:React.ReactNode;children:React.ReactNode;className?:string}){
  return <section className={"ad-card "+className}><header><div>{kicker&&<small>{kicker}</small>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

export default function AnalyticsDashboard({report,error,days,onDays,onRefresh}:Props){
  const [tab,setTab]=useState<Tab>("overview");
  const [metric,setMetric]=useState<MetricKey>("sessions");
  const [filter,setFilter]=useState<"all"|"human"|"bot">("human");
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(0);
  const detail=(view:string)=>`/admin/analytics/details/${view}?days=${days}`;

  const visitors=useMemo(()=>report?.visitors??[],[report]);
  const botIds=useMemo(()=>new Set(visitors.filter(isBot).map(v=>v.session_id)),[visitors]);
  const humans=Math.max(0,Number(report?.summary.sessions||0)-botIds.size);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return visitors.filter(v=>(filter==="all"||(filter==="bot")===botIds.has(v.session_id))&&(!q||[place(v),v.device,v.browser,v.source,v.session_id].join(" ").toLowerCase().includes(q)));
  },[visitors,botIds,filter,query]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const shown=filtered.slice(Math.min(page,pages-1)*PAGE_SIZE,(Math.min(page,pages-1)+1)*PAGE_SIZE);

  const title=(id:string)=>report?.videoTitles[id]||id;
  const daily=report?.daily??[];
  const prev=report?.previous;
  const bugsTotal=(report?.bugs??[]).reduce((s,b)=>s+Number(b.count||0),0);
  const okLogins=(report?.logins??[]).filter(l=>l.event_name==="login").length;
  const failedLogins=(report?.logins??[]).length-okLogins;
  const live=Number(report?.summary.recent_events||0)>0;

  const kpis=report?[
    {key:"visitors",label:"Visitors",value:num(humans),note:botIds.size?`${botIds.size} automated hidden`:"Unique sessions",href:detail("visitors"),series:daily.map(d=>d.sessions),d:delta(Number(report.summary.sessions),Number(prev?.sessions))},
    {key:"pages",label:"Page views",value:num(report.summary.page_views),note:"All pages",href:detail("pages"),series:daily.map(d=>d.page_views),d:delta(Number(report.summary.page_views),Number(prev?.page_views))},
    {key:"videos",label:"Video views",value:num(report.summary.video_opens),note:`${num(report.summary.unique_videos)} videos watched`,href:detail("videos"),series:daily.map(d=>d.video_opens),d:delta(Number(report.summary.video_opens),Number(prev?.video_opens))},
    {key:"watch",label:"Watch time",value:dur(report.summary.watch_seconds||0),note:"Actual viewing",href:detail("watch"),series:daily.map(d=>d.watch_seconds),d:delta(Number(report.summary.watch_seconds),Number(prev?.watch_seconds))},
    {key:"bugs",label:"Bugs",value:num(bugsTotal),note:report.bugs.length?`${report.bugs.length} distinct errors`:"No errors seen",href:detail("bugs"),series:daily.map(d=>d.errors),d:null,bad:bugsTotal>0},
    {key:"logins",label:"Admin logins",value:num(okLogins),note:`${failedLogins} failed attempts`,href:detail("logins"),series:[] as number[],d:null,bad:failedLogins>0},
  ]:[];

  return <main className="ad">
    <div className="ad-shell">
      <header className="ad-top">
        <div className="ad-title"><span>GREEKTUBE SUBS · ADMIN</span><h1>Analytics</h1></div>
        <div className="ad-actions">
          <div className={"ad-live "+(live?"on":"")} title={report?.summary.latest_event?"Latest event: "+new Date(report.summary.latest_event).toLocaleString("el-GR"):""}><i/>{live?"Live":"Idle"}</div>
          <button type="button" className="ad-btn" onClick={onRefresh}>Refresh</button>
          <Link className="ad-btn primary" href="/admin/analytics/users">Users</Link>
        </div>
      </header>

      <div className="ad-bar">
        <nav className="ad-tabs" aria-label="Analytics sections">{TABS.map(([key,label])=><button type="button" key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</nav>
        <div className="ad-periods" role="group" aria-label="Period">{PERIODS.map(([value,label])=><button type="button" key={value} className={days===value?"active":""} onClick={()=>{onDays(value);setPage(0);}}>{label}</button>)}</div>
      </div>

      {error?<section className="ad-message">{error}</section>:!report?<section className="ad-message">Loading analytics…</section>:<>
        {tab==="overview"&&<>
          <section className="ad-kpis">{kpis.map(k=><Link key={k.key} href={k.href} className={"ad-kpi"+(k.bad?" bad":"")}>
            <small>{k.label}</small><strong>{k.value}</strong>
            <div className="ad-kpi-foot"><span>{k.note}</span>{k.d&&<em className={"ad-delta "+k.d.tone}>{k.d.label}</em>}</div>
            {k.series.length>1&&<Sparkline values={k.series}/>}
          </Link>)}</section>
          <div className="ad-grid two">
            <Card title="Activity over time" kicker={days===1?"LAST 24 HOURS":`LAST ${days} DAYS`} className="wide" action={<div className="ad-seg" role="group" aria-label="Metric">{METRICS.map(([key,label])=><button type="button" key={key} className={metric===key?"active":""} onClick={()=>setMetric(key)}>{label}</button>)}</div>}>
              <AreaChart data={daily} metric={metric} hourly={days===1}/>
            </Card>
            <Card title="Right now" kicker="HEALTH">
              <ul className="ad-facts">
                <li><span>Events in last 15 min</span><strong>{num(report.summary.recent_events)}</strong></li>
                <li><span>Latest event</span><strong>{when(report.summary.latest_event||undefined)}</strong></li>
                <li><span>Likely automated sessions</span><strong>{num(botIds.size)}</strong></li>
                <li><span>Bugs this period</span><strong className={bugsTotal?"bad":"good"}>{num(bugsTotal)}</strong></li>
                <li><span>Failed admin logins</span><strong className={failedLogins?"bad":"good"}>{num(failedLogins)}</strong></li>
              </ul>
            </Card>
          </div>
          <div className="ad-grid three">
            <Card title="Top videos" kicker="CONTENT" action={<Link className="ad-link" href={detail("videos")}>All videos</Link>}>
              <BarList rows={report.topVideos.slice(0,6).map(v=>({key:v.video_id,label:title(v.video_id),value:Number(v.views),display:`${num(v.views)} views`,meta:`${dur(v.watch_seconds)} watched · ${num(v.sessions)} visitors`}))}/>
            </Card>
            <Card title="Countries" kicker="AUDIENCE" action={<button type="button" className="ad-link" onClick={()=>setTab("audience")}>All</button>}>
              <BarList rows={report.countries.slice(0,6).map(c=>({key:c.name,label:countryName(c.name),lead:flag(c.name),value:Number(c.sessions)}))}/>
            </Card>
            <Card title="Where visitors come from" kicker="ACQUISITION">
              <BarList rows={report.sources.slice(0,6).map(s=>({key:s.name||"direct",label:s.name||"direct",value:Number(s.sessions)}))}/>
            </Card>
          </div>
        </>}

        {tab==="audience"&&<div className="ad-grid three">
          <Card title="Countries" kicker="LOCATION"><BarList rows={report.countries.slice(0,12).map(c=>({key:c.name,label:countryName(c.name),lead:flag(c.name),value:Number(c.sessions),meta:c.confirmed_sessions?`${c.confirmed_sessions} edge verified`:undefined}))}/></Card>
          <Card title="Cities" kicker="LOCATION"><BarList rows={report.cities.slice(0,12).map(c=>({key:c.name+c.country,label:`${c.name}, ${countryName(c.country)}`,value:Number(c.sessions)}))}/></Card>
          <Card title="Sources" kicker="ACQUISITION"><BarList rows={report.sources.slice(0,12).map(s=>({key:s.name||"direct",label:s.name||"direct",value:Number(s.sessions)}))}/></Card>
          <Card title="Devices" kicker="TECH"><BarList rows={report.devices.map(d=>({key:d.name,label:d.name,value:Number(d.sessions)}))}/></Card>
          <Card title="Browsers" kicker="TECH"><BarList rows={report.browsers.map(d=>({key:d.name,label:d.name,value:Number(d.sessions)}))}/></Card>
          <Card title="Events" kicker="ACTIVITY"><BarList rows={report.events.slice(0,12).map(e=>({key:e.name,label:e.name,value:Number(e.count)}))}/></Card>
        </div>}

        {tab==="content"&&<div className="ad-grid two even">
          <Card title="Videos" kicker="PERFORMANCE" action={<Link className="ad-link" href={detail("videos")}>Details</Link>}>
            <ol className="ad-rank">{report.topVideos.slice(0,15).map((v,i)=><li key={v.video_id}><b>{i+1}</b><div><strong>{title(v.video_id)}</strong><small>{report.videoMeta[v.video_id]?.speakerName||v.video_id}</small></div><span><small>VIEWS</small>{num(v.views)}</span><span><small>WATCH</small>{dur(v.watch_seconds)}</span></li>)}</ol>
            {!report.topVideos.length&&<p className="ad-empty">No video activity yet.</p>}
          </Card>
          <Card title="Pages" kicker="TRAFFIC" action={<Link className="ad-link" href={detail("pages")}>Details</Link>}>
            <ol className="ad-rank">{report.topPages.slice(0,15).map((p,i)=>{const m=/video=([A-Za-z0-9_-]{11})/.exec(p.name);return <li key={p.name}><b>{i+1}</b><div><strong>{m?title(m[1]):p.name==="/"?"Library / Home":p.name}</strong><small>{m?"Video page":"Site page"}</small></div><span><small>VIEWS</small>{num(p.views)}</span><span><small>VISITORS</small>{num(p.sessions)}</span></li>;})}</ol>
          </Card>
        </div>}

        {tab==="visitors"&&<Card title="Visitors" kicker={`${num(filtered.length)} SESSIONS`} className="flush" action={<div className="ad-filters">
          <input type="search" inputMode="search" placeholder="Search visitors…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} aria-label="Search visitors"/>
          <div className="ad-seg" role="group" aria-label="Filter">{([["human","People"],["bot","Automated"],["all","All"]] as const).map(([key,label])=><button type="button" key={key} className={filter===key?"active":""} onClick={()=>{setFilter(key);setPage(0);}}>{label}</button>)}</div>
        </div>}>
          <div className="ad-table" role="table">
            <div className="ad-tr head" role="row"><span>Location</span><span>Device</span><span>Source</span><span>Pages</span><span>Videos</span><span>Watch</span><span>Last seen</span></div>
            {shown.map(v=><Link key={v.session_id} className="ad-tr" role="row" href={`/admin/analytics/visitor/${encodeURIComponent(v.session_id)}`}>
              <span className="loc"><b aria-hidden="true">{flag(v.country)}</b><em>{place(v)||"Unknown"}{botIds.has(v.session_id)&&<i className="ad-chip">automated</i>}</em></span>
              <span data-label="Device">{v.device||"—"} · {v.browser||"—"}</span><span data-label="Source">{v.source||"direct"}</span>
              <span data-label="Pages">{num(v.page_views)}</span><span data-label="Videos">{num(v.video_opens)}</span><span data-label="Watch">{dur(v.watch_seconds)}</span><span data-label="Last seen">{when(v.last_seen)}</span>
            </Link>)}
            {!shown.length&&<p className="ad-empty">No visitors match.</p>}
          </div>
          {pages>1&&<footer className="ad-pager"><button type="button" className="ad-btn" disabled={page<=0} onClick={()=>setPage(page-1)}>Previous</button><span>Page {Math.min(page,pages-1)+1} of {pages}</span><button type="button" className="ad-btn" disabled={page>=pages-1} onClick={()=>setPage(page+1)}>Next</button></footer>}
        </Card>}

        {tab==="health"&&<div className="ad-grid two even">
          <Card title="Bugs & errors" kicker="RELIABILITY" action={<Link className="ad-link" href={detail("bugs")}>All bugs</Link>}>
            {report.bugs.length?<ul className="ad-events">{report.bugs.slice(0,10).map((b,i)=><li key={i}><Link href={`/admin/analytics/visitor/${encodeURIComponent(b.last_session)}`}><span className="ad-chip bad">{b.kind.replace("_"," ")}</span><div><strong>{b.message}</strong><small>{b.source||b.last_path} · {num(b.count)}× · {num(b.sessions)} visitors</small></div><time>{when(b.last_seen)}</time></Link></li>)}</ul>
              :<p className="ad-empty">No errors recorded in this period. Tracking is active — new errors appear here automatically.</p>}
          </Card>
          <Card title="Admin logins" kicker="SECURITY" action={<Link className="ad-link" href={detail("logins")}>All logins</Link>}>
            {report.logins.length?<ul className="ad-events">{report.logins.slice(0,10).map((l,i)=><li key={i}><div className="row"><span className={"ad-chip "+(l.event_name==="login"?"good":"bad")}>{l.event_name==="login"?"signed in":"failed"}</span><div><strong>{flag(l.country)} {place(l)}</strong><small>{l.device} · {l.browser}{l.ip?` · ${l.ip}`:""}</small></div><time>{when(l.created_at)}</time></div></li>)}</ul>
              :<p className="ad-empty">No admin logins recorded yet. Logging started with this version.</p>}
          </Card>
        </div>}
      </>}
    </div>
    <footer className="ad-foot"><span><b>GreekTube</b> Subs · Analytics</span><nav><Link href="/">Open site</Link><Link href="/privacy">Privacy</Link></nav></footer>
  </main>;
}

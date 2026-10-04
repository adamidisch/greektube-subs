"use client";

import {useState} from "react";
import {APP_VERSION} from "../../version";

type Summary={sessions?:number;page_views?:number;video_opens?:number;watch_seconds?:number;unique_videos?:number;latest_event?:string|null;recent_events?:number};
type TopVideo={video_id:string;views:number;sessions:number;watch_seconds:number;last_seen:string};
type TopPage={name:string;views:number;sessions:number;first_seen?:string;last_seen?:string};
type Visitor={session_id:string;first_seen:string;last_seen:string;country:string;city:string;device:string;browser:string;source:string;events:number;page_views:number;video_opens:number;watch_seconds:number;videos:string[];paths:string[];country_confirmed?:boolean};
type VisitorVideoStat={session_id:string;video_id:string;views:number;watch_seconds:number;last_seen:string};
type RecentEvent={created_at:string;session_id:string;event_name:string;path:string;video_id:string;referrer_host:string;country:string;city:string;device:string;browser:string;properties:Record<string,unknown>};
type VideoMeta={title:string;originalTitle:string;speakerName:string};
type Report={days:number;summary:Summary;topVideos:TopVideo[];topPages:TopPage[];visitors:Visitor[];visitorVideoStats:VisitorVideoStat[];recent:RecentEvent[];videoTitles:Record<string,string>;videoMeta:Record<string,VideoMeta>};

function duration(value:number){const t=Math.max(0,Math.round(Number(value)||0));const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return h+"h "+String(m).padStart(2,"0")+"m "+String(s).padStart(2,"0")+"s";}
function num(value:number|undefined){return new Intl.NumberFormat("en-US").format(Number(value)||0);}
function when(value:string|undefined){return value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";}
function shortSession(value:string){return value?value.slice(0,7)+"…"+value.slice(-4):"—";}
function flag(code:string){const clean=(code||"").toUpperCase();if(!/^[A-Z]{2}$/.test(clean))return "◎";return String.fromCodePoint(...clean.split("").map(c=>127397+c.charCodeAt(0)));}
function country(code:string){const clean=(code||"").toUpperCase();if(!clean||clean==="UNKNOWN")return "Unknown";try{return new Intl.DisplayNames(["en"],{type:"region"}).of(clean)||clean;}catch{return clean;}}
function title(report:Report,id:string){return report.videoTitles[id]||id;}
function pageVideoId(path:string){try{const u=new URL(path,"https://greektubesubs.com");return u.searchParams.get("video")||"";}catch{return "";}}
function pageLabel(report:Report,path:string){const id=pageVideoId(path);if(id)return title(report,id);return path==="/"? "Library / Home":path;}
function pageType(path:string){return pageVideoId(path)?"Video page":path==="/"? "Library":"Site page";}

export default function AnalyticsDetailClient({view,sessionId,report,days}:{view:string;sessionId?:string;report:Report;days:number}){
  const meta=pageMeta(view,sessionId,report);
  return <main className="detail-page">
    <div className="detail-shell">
      <header className="detail-header"><div><a className="back" href="/admin/analytics">← Analytics</a><span>{meta.kicker}</span><h1>{meta.title}</h1><p>{meta.subtitle}</p></div><a className="open-site" href="/">Open site ↗</a></header>
      <nav className="detail-nav">
        <a href={"/admin/analytics/details/visitors?days="+days} className={view==="visitors"?"active":""}>Visitors</a>
        <a href={"/admin/analytics/details/pages?days="+days} className={view==="pages"?"active":""}>Pages</a>
        <a href={"/admin/analytics/details/videos?days="+days} className={view==="videos"?"active":""}>Videos</a>
        <a href={"/admin/analytics/details/watch?days="+days} className={view==="watch"?"active":""}>Watch</a>
      </nav>
      <section className="detail-toolbar"><div><small>PERIOD</small><strong>{days===1?"Today":"Last "+days+" days"}</strong></div><div className="periods">{[1,7,30,90].map(value=><a key={value} className={days===value?"active":""} href={"?days="+value}>{value===1?"Today":value+" days"}</a>)}</div></section>
      <DetailBody report={report} view={view} sessionId={sessionId} days={days}/>
    </div>
    <footer className="detail-footer"><div><div><strong>GreekTube <b>Subs</b></strong><span>Analytics · Version {APP_VERSION}</span></div><nav><a href="/admin/analytics">Overview</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a></nav></div></footer>
    <style>{css}</style>
  </main>;
}

function pageMeta(view:string,sessionId:string|undefined,report:Report){
  if(sessionId){const v=report.visitors.find(x=>x.session_id===sessionId);return{kicker:"VISITOR DETAIL",title:v?((v.city&&v.city!=="Unknown"?v.city+", ":"")+country(v.country)):"Visitor session",subtitle:"Session activity, videos and viewing time."};}
  if(view==="pages")return{kicker:"PAGE ANALYTICS",title:"Page views",subtitle:"Clean page-level performance without duplicate time or speed query variants."};
  if(view==="videos")return{kicker:"VIDEO ANALYTICS",title:"Video views",subtitle:"Views, unique visitors and watch time for every video."};
  if(view==="watch")return{kicker:"VIEWING",title:"Watch time",subtitle:"Videos ranked by actual viewing time."};
  if(view==="unique")return{kicker:"CONTENT REACH",title:"Videos reached",subtitle:"All unique videos watched in the selected period."};
  return{kicker:"AUDIENCE",title:"Visitors",subtitle:"Anonymous sessions with location, device, source and video activity."};
}

function DetailBody({report,view,sessionId,days}:{report:Report;view:string;sessionId?:string;days:number}){
  if(sessionId)return <VisitorDetail report={report} sessionId={sessionId}/>;
  if(view==="pages")return <PagesDetail report={report}/>;
  if(view==="videos"||view==="unique")return <VideosDetail report={report} unique={view==="unique"}/>;
  if(view==="watch")return <WatchDetail report={report}/>;
  return <VisitorsDetail report={report} days={days}/>;
}

function VisitorsDetail({report,days}:{report:Report;days:number}){
  const [sort,setSort]=useState<"recent"|"location"|"views"|"watch"|"device">("recent");
  const [dir,setDir]=useState<"desc"|"asc">("desc");
  const factor=dir==="asc"?1:-1;
  const rows=[...report.visitors].sort((a,b)=>{
    if(sort==="location")return factor*((a.city+" "+a.country).localeCompare(b.city+" "+b.country));
    if(sort==="views")return factor*(Number(a.video_opens)-Number(b.video_opens));
    if(sort==="watch")return factor*(Number(a.watch_seconds)-Number(b.watch_seconds));
    if(sort==="device")return factor*((a.device+" "+a.browser).localeCompare(b.device+" "+b.browser));
    return factor*(new Date(a.last_seen).getTime()-new Date(b.last_seen).getTime());
  });
  return <><div className="summary-grid"><Stat label="SESSIONS" value={num(report.summary.sessions)} note="Anonymous visitors"/><Stat label="VIDEO VIEWS" value={num(report.summary.video_opens)} note="Across all sessions"/><Stat label="WATCH TIME" value={duration(report.summary.watch_seconds||0)} note="Total viewing"/></div>
    <section className="table-card"><header><div><small>SESSION DIRECTORY</small><h2>All visitors</h2><p>Open any visitor for complete session activity.</p></div><SortControl value={sort} onChange={value=>setSort(value as typeof sort)} dir={dir} onDir={()=>setDir(current=>current==="desc"?"asc":"desc")} options={[["recent","Last seen"],["location","Location"],["views","Video views"],["watch","Watch time"],["device","Device"]]}/></header><div className="session-list">{rows.map(v=><a className="session-row" key={v.session_id} href={"/admin/analytics/visitor/"+encodeURIComponent(v.session_id)+"?days="+days}><div className="session-place"><b>{flag(v.country)}</b><div><strong>{(v.city&&v.city!=="Unknown"?v.city+", ":"")+country(v.country)}</strong><small>{shortSession(v.session_id)} · {when(v.last_seen)}</small></div></div><span><small>DEVICE</small><b>{v.device||"—"} · {v.browser||"—"}</b></span><span><small>VIDEO VIEWS</small><b>{v.video_opens}</b></span><span><small>WATCH</small><b>{duration(v.watch_seconds)}</b></span><em className={v.country_confirmed?"verified":"estimated"}>{v.country_confirmed?"EDGE VERIFIED":"ESTIMATED"}</em><i>→</i></a>)}</div></section></>;
}

function PagesDetail({report}:{report:Report}){
  const [sort,setSort]=useState<"views"|"visitors"|"name"|"type"|"recent">("views");
  const [dir,setDir]=useState<"desc"|"asc">("desc");
  const factor=dir==="asc"?1:-1;
  const rows=[...report.topPages].sort((a,b)=>{
    if(sort==="visitors")return factor*(Number(a.sessions)-Number(b.sessions));
    if(sort==="name")return factor*(pageLabel(report,a.name).localeCompare(pageLabel(report,b.name)));
    if(sort==="type")return factor*(pageType(a.name).localeCompare(pageType(b.name)));
    if(sort==="recent")return factor*(new Date(a.last_seen||0).getTime()-new Date(b.last_seen||0).getTime());
    return factor*(Number(a.views)-Number(b.views));
  });
  const total=Math.max(1,report.topPages.reduce((sum,row)=>sum+Number(row.views||0),0));
  return <><div className="summary-grid"><Stat label="PAGE VIEWS" value={num(report.summary.page_views)} note="Selected period"/><Stat label="UNIQUE ROUTES" value={num(report.topPages.length)} note="Canonical pages"/><Stat label="TOP PAGE" value={report.topPages[0]?num(report.topPages[0].views):"0"} note={report.topPages[0]?pageLabel(report,report.topPages[0].name):"No data"}/></div>
    <section className="table-card"><header><div><small>PAGE PERFORMANCE</small><h2>Pages</h2><p>Time and speed parameters are grouped into the same video page.</p></div><SortControl value={sort} onChange={value=>setSort(value as typeof sort)} dir={dir} onDir={()=>setDir(current=>current==="desc"?"asc":"desc")} options={[["views","Views"],["visitors","Visitors"],["recent","Last seen"],["name","Name"],["type","Type"]]}/></header><div className="data-table"><div className="data-head"><span>Page</span><span>Type</span><span>Views</span><span>Visitors</span><span>Share</span><span>Last seen</span></div>{rows.map(row=>{const id=pageVideoId(row.name);return <div className="data-row" key={row.name}><div><strong>{pageLabel(report,row.name)}</strong><small>{row.name}</small></div><span>{pageType(row.name)}</span><b>{num(row.views)}</b><span>{num(row.sessions)}</span><span>{Math.round((row.views/total)*100)}%</span><span>{when(row.last_seen)}</span>{id&&<a className="row-open" href={"/?video="+encodeURIComponent(id)} target="_blank" rel="noreferrer">Open ↗</a>}</div>;})}</div></section></>;
}

function VideosDetail({report,unique}:{report:Report;unique:boolean}){
  const [sort,setSort]=useState<"views"|"visitors"|"watch"|"title"|"recent">("views");
  const [dir,setDir]=useState<"desc"|"asc">("desc");
  const factor=dir==="asc"?1:-1;
  const rows=[...report.topVideos].sort((a,b)=>{
    if(sort==="visitors")return factor*(Number(a.sessions)-Number(b.sessions));
    if(sort==="watch")return factor*(Number(a.watch_seconds)-Number(b.watch_seconds));
    if(sort==="title")return factor*(title(report,a.video_id).localeCompare(title(report,b.video_id)));
    if(sort==="recent")return factor*(new Date(a.last_seen).getTime()-new Date(b.last_seen).getTime());
    return factor*(Number(a.views)-Number(b.views));
  });
  return <><div className="summary-grid"><Stat label="VIDEOS" value={num(report.summary.unique_videos)} note="Unique content"/><Stat label="VIDEO VIEWS" value={num(report.summary.video_opens)} note="All opens"/><Stat label="WATCH TIME" value={duration(report.summary.watch_seconds||0)} note="Total viewing"/></div>
    <section className="table-card"><header><div><small>{unique?"CONTENT REACH":"VIDEO PERFORMANCE"}</small><h2>{unique?"Videos reached":"Every video"}</h2></div><SortControl value={sort} onChange={value=>setSort(value as typeof sort)} dir={dir} onDir={()=>setDir(current=>current==="desc"?"asc":"desc")} options={[["views","Views"],["visitors","Visitors"],["watch","Watch time"],["recent","Last seen"],["title","Title"]]}/></header><div className="video-list">{rows.map((v,index)=><article className="video-line" key={v.video_id}><span className="rank">{String(index+1).padStart(2,"0")}</span><div className="video-name"><strong>{title(report,v.video_id)}</strong><small>{report.videoMeta[v.video_id]?.speakerName||v.video_id}</small></div><span><small>VIEWS</small><b>{v.views}</b></span><span><small>VISITORS</small><b>{v.sessions}</b></span><span><small>WATCH</small><b>{duration(v.watch_seconds)}</b></span><a href={"/?video="+encodeURIComponent(v.video_id)} target="_blank" rel="noreferrer">Open ↗</a></article>)}</div></section></>;
}

function WatchDetail({report}:{report:Report}){
  const [sort,setSort]=useState<"watch"|"views"|"visitors"|"title">("watch");
  const [dir,setDir]=useState<"desc"|"asc">("desc");
  const factor=dir==="asc"?1:-1;
  const rows=[...report.topVideos].sort((a,b)=>{
    if(sort==="views")return factor*(Number(a.views)-Number(b.views));
    if(sort==="visitors")return factor*(Number(a.sessions)-Number(b.sessions));
    if(sort==="title")return factor*(title(report,a.video_id).localeCompare(title(report,b.video_id)));
    return factor*(Number(a.watch_seconds)-Number(b.watch_seconds));
  });
  return <><div className="summary-grid"><Stat label="TOTAL WATCH" value={duration(report.summary.watch_seconds||0)} note="Actual viewing"/><Stat label="VIDEOS" value={num(report.summary.unique_videos)} note="With activity"/><Stat label="TOP VIDEO" value={rows[0]?duration(rows[0].watch_seconds):"0h 00m 00s"} note={rows[0]?title(report,rows[0].video_id):"No data"}/></div>
    <section className="table-card"><header><div><small>WATCH LEADERS</small><h2>Viewing time by video</h2></div><SortControl value={sort} onChange={value=>setSort(value as typeof sort)} dir={dir} onDir={()=>setDir(current=>current==="desc"?"asc":"desc")} options={[["watch","Watch time"],["views","Views"],["visitors","Visitors"],["title","Title"]]}/></header><div className="video-list">{rows.map((v,index)=><article className="video-line" key={v.video_id}><span className="rank">{String(index+1).padStart(2,"0")}</span><div className="video-name"><strong>{title(report,v.video_id)}</strong><small>{report.videoMeta[v.video_id]?.speakerName||v.video_id}</small></div><span><small>WATCH</small><b>{duration(v.watch_seconds)}</b></span><span><small>VIEWS</small><b>{v.views}</b></span><span><small>VISITORS</small><b>{v.sessions}</b></span><a href={"/?video="+encodeURIComponent(v.video_id)} target="_blank" rel="noreferrer">Open ↗</a></article>)}</div></section></>;
}

function VisitorDetail({report,sessionId}:{report:Report;sessionId:string}){
  const visitor=report.visitors.find(v=>v.session_id===sessionId);
  if(!visitor)return <section className="state-card"><strong>Visitor not found in this period.</strong><p>Try a longer date range from Analytics.</p></section>;
  const videos=(report.visitorVideoStats||[]).filter(v=>v.session_id===sessionId).sort((a,b)=>b.watch_seconds-a.watch_seconds||b.views-a.views);
  const events=(report.recent||[]).filter(e=>e.session_id===sessionId).slice(0,50);
  return <><section className="visitor-hero"><div className="visitor-location"><span>{flag(visitor.country)}</span><div><small>LOCATION</small><h2>{(visitor.city&&visitor.city!=="Unknown"?visitor.city+", ":"")+country(visitor.country)}</h2><p>{visitor.country_confirmed?"Country confirmed by Vercel Edge":"Historical / estimated location"}</p></div></div><em className={visitor.country_confirmed?"verified":"estimated"}>{visitor.country_confirmed?"EDGE VERIFIED":"LOCATION ESTIMATE"}</em></section>
    <div className="summary-grid four"><Stat label="LAST SEEN" value={when(visitor.last_seen)} note={"Session "+shortSession(visitor.session_id)}/><Stat label="DEVICE" value={visitor.device||"—"} note={visitor.browser||"—"}/><Stat label="VIDEO VIEWS" value={String(visitor.video_opens)} note={String(visitor.page_views)+" page views"}/><Stat label="WATCH TIME" value={duration(visitor.watch_seconds)} note={"Source: "+(visitor.source||"direct")}/></div>
    <section className="table-card"><header><div><small>WATCHED CONTENT</small><h2>Videos viewed</h2></div></header><div className="video-list">{videos.length?videos.map(v=><article className="video-line" key={v.video_id}><span className="rank">▶</span><div className="video-name"><strong>{title(report,v.video_id)}</strong><small>{report.videoMeta[v.video_id]?.speakerName||v.video_id}</small></div><span><small>VIEWS</small><b>{v.views}</b></span><span><small>WATCH</small><b>{duration(v.watch_seconds)}</b></span><span><small>LAST SEEN</small><b>{when(v.last_seen)}</b></span><a href={"/?video="+encodeURIComponent(v.video_id)} target="_blank" rel="noreferrer">Open ↗</a></article>):<p className="empty">No video activity in this period.</p>}</div></section>
    <section className="table-card"><header><div><small>ACTIVITY</small><h2>Recent events</h2></div></header><div className="event-list">{events.length?events.map((e,i)=><div className="event-row" key={e.created_at+"-"+i}><i/><div><strong>{e.event_name}</strong><small>{e.video_id?title(report,e.video_id):e.path}</small></div><time>{when(e.created_at)}</time></div>):<p className="empty">No recent events in the retained feed.</p>}</div></section></>;
}

function SortControl({value,onChange,dir,onDir,options}:{value:string;onChange:(value:string)=>void;dir:"asc"|"desc";onDir:()=>void;options:Array<[string,string]>}){
  return <div className="sort-control"><span>SORT BY</span><select value={value} onChange={event=>onChange(event.target.value)}>{options.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={onDir} title={dir==="desc"?"Descending":"Ascending"}>{dir==="desc"?"↓":"↑"}</button></div>;
}

function Stat({label,value,note}:{label:string;value:string;note:string}){return <article className="stat"><small>{label}</small><strong>{value}</strong><p>{note}</p></article>;}

const css=`
*{box-sizing:border-box}body{margin:0}.detail-page{min-height:100vh;font-family:var(--font-ui),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#232936;background:radial-gradient(circle at 6% 0%,rgba(118,102,221,.11),transparent 28%),linear-gradient(180deg,#f8f9fb,#eef1f5 72%)}
.detail-shell{width:min(1360px,calc(100% - 56px));margin:0 auto;padding:28px 0 72px}.detail-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.back{display:inline-block;margin-bottom:18px;color:#6e7682;text-decoration:none;font-size:12px;font-weight:700}.detail-header span{display:block;color:#7567d7;font-size:10px;font-weight:850;letter-spacing:.13em}.detail-header h1{margin:5px 0;font-size:36px;letter-spacing:-.045em}.detail-header p{margin:0;color:#838b96;font-size:14px}.open-site{height:38px;display:inline-flex;align-items:center;padding:0 12px;border:1px solid #dde1e8;border-radius:10px;background:#fff;color:#5f6772;text-decoration:none;font-size:11px;font-weight:750}
.detail-nav{position:sticky;top:8px;z-index:10;display:flex;gap:5px;width:max-content;margin:24px 0 0;padding:5px;border:1px solid #dde0e8;border-radius:14px;background:rgba(255,255,255,.88);backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(38,43,58,.06)}.detail-nav a{height:33px;display:flex;align-items:center;padding:0 12px;border-radius:9px;color:#727985;text-decoration:none;font-size:11px;font-weight:750}.detail-nav a.active,.detail-nav a:hover{background:#eeeafd;color:#6255ca}
.detail-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:12px;padding:12px 14px;border:1px solid #dfe2e8;border-radius:15px;background:rgba(255,255,255,.84)}.detail-toolbar small,.table-card header small,.visitor-location small,.stat small{display:block;color:#7567d7;font-size:9px;font-weight:850;letter-spacing:.1em}.detail-toolbar strong{display:block;margin-top:3px;font-size:13px}.periods{display:flex;gap:4px}.periods a{height:32px;display:flex;align-items:center;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#78808c;text-decoration:none;font-size:10px;font-weight:750;cursor:pointer}.periods a.active{background:#eeeafd;border-color:#ddd7f5;color:#6255ca}
.summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}.summary-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.stat{min-height:108px;padding:16px 17px;border:1px solid #dfe2e8;border-radius:16px;background:rgba(255,255,255,.91);box-shadow:0 8px 22px rgba(44,50,66,.035)}.stat strong{display:block;margin-top:13px;font-size:23px;letter-spacing:-.04em}.stat p{margin:7px 0 0;color:#9198a2;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.table-card,.visitor-hero{margin-top:10px;border:1px solid #dfe2e8;border-radius:18px;background:rgba(255,255,255,.94);box-shadow:0 10px 28px rgba(44,50,66,.04)}.table-card{overflow:hidden}.table-card>header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:18px}.table-card header h2{margin:4px 0 0;font-size:18px;letter-spacing:-.025em}.table-card header p{margin:6px 0 0;color:#9097a1;font-size:11px}.table-card>header>span{color:#8a919c;font-size:10px}.sort-control{display:flex;align-items:center;gap:6px;flex:0 0 auto}.sort-control>span{color:#9ca3ad;font-size:8px;font-weight:850;letter-spacing:.08em}.sort-control select{height:32px;min-width:120px;padding:0 28px 0 9px;border:1px solid #dde1e8;border-radius:9px;background:#fafbfc;color:#555d69;font-size:10px;font-weight:700;outline:none}.sort-control button{width:32px;height:32px;border:1px solid #dcdfea;border-radius:9px;background:#f2efff;color:#6b5fcb;font-size:14px;font-weight:800;cursor:pointer}
.session-list{border-top:1px solid #eceef2}.session-row{display:grid;grid-template-columns:minmax(250px,1.3fr) 170px 90px 130px 110px 25px;gap:12px;align-items:center;padding:13px 18px;border-bottom:1px solid #eceef2;color:inherit;text-decoration:none}.session-row:hover{background:#faf9ff}.session-place{display:flex;align-items:center;gap:10px;min-width:0}.session-place>b{font-size:20px}.session-place strong{display:block;font-size:12.5px}.session-place small{display:block;margin-top:3px;color:#9299a3;font-size:9.5px}.session-row>span small{display:block;color:#a0a6af;font-size:8px;font-weight:800}.session-row>span b{display:block;margin-top:3px;color:#505762;font-size:10.5px}.session-row em,.visitor-hero>em{display:inline-flex;justify-content:center;padding:6px 8px;border-radius:999px;font-style:normal;font-size:8px;font-weight:850;letter-spacing:.04em}.verified{border:1px solid #cce7d7;background:#eef9f3;color:#3f805e}.estimated{border:1px solid #eadcbd;background:#fff8ea;color:#8d6b35}.session-row>i{font-style:normal;color:#7467d2}
.data-head,.data-row{display:grid;grid-template-columns:minmax(280px,1.5fr) 105px 70px 80px 70px 125px;gap:12px;align-items:center}.data-head{padding:9px 18px;border-top:1px solid #eceef2;border-bottom:1px solid #eceef2;background:#fafbfc;color:#9da4ae;font-size:8.5px;font-weight:850;letter-spacing:.08em}.data-row{position:relative;padding:13px 18px;border-bottom:1px solid #eceef2}.data-row:last-child{border-bottom:0}.data-row strong{display:block;max-width:70ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.data-row small{display:block;margin-top:3px;color:#a0a6af;font-size:9px}.data-row>span,.data-row>b{font-size:10.5px;color:#5f6671}.row-open{position:absolute;right:18px;bottom:5px;color:#7062ce;text-decoration:none;font-size:8.5px;font-weight:800}
.video-list{border-top:1px solid #eceef2}.video-line{display:grid;grid-template-columns:38px minmax(260px,1fr) 92px 92px 140px 58px;gap:12px;align-items:center;padding:13px 18px;border-bottom:1px solid #eceef2}.video-line:last-child{border-bottom:0}.rank{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#f0edff;color:#7264d2;font-size:9px;font-weight:850}.video-name{min-width:0}.video-name strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}.video-name small{display:block;margin-top:3px;color:#9aa1aa;font-size:9.5px}.video-line>span small{display:block;color:#a0a6ae;font-size:8px;font-weight:800}.video-line>span b{display:block;margin-top:3px;font-size:10.5px}.video-line>a{color:#7062ce;text-decoration:none;font-size:9px;font-weight:800}
.visitor-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px}.visitor-location{display:flex;align-items:center;gap:13px}.visitor-location>span{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:#f1eeff;font-size:25px}.visitor-location h2{margin:4px 0;font-size:20px}.visitor-location p{margin:0;color:#8d949f;font-size:10.5px}
.event-list{border-top:1px solid #eceef2}.event-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 18px;border-bottom:1px solid #eceef2}.event-row>i{width:6px;height:6px;border-radius:50%;background:#8779df}.event-row strong{display:block;font-size:11px}.event-row small{display:block;margin-top:3px;color:#9ba2ab;font-size:9.5px}.event-row time{color:#8f96a0;font-size:9.5px}.empty{padding:18px;color:#999fa8;font-size:11px}.state-card{margin-top:28px;padding:24px;border:1px solid #dfe2e8;border-radius:18px;background:#fff}.state-card strong{display:block;font-size:18px}.state-card p{color:#8c939d}.state-card a{display:inline-block;margin-top:12px;color:#6c60c9}
.detail-footer{border-top:1px solid #dfe2e8;background:#202532;color:#cbd0d8}.detail-footer>div{width:min(1360px,calc(100% - 56px));margin:0 auto;display:flex;justify-content:space-between;align-items:center;padding:24px 0}.detail-footer strong{font-size:12px}.detail-footer strong b{color:#a89df0}.detail-footer span{display:block;margin-top:4px;color:#7f8793;font-size:9px}.detail-footer nav{display:flex;gap:16px}.detail-footer a{color:#aeb5bf;text-decoration:none;font-size:10px}
@media(max-width:900px){.summary-grid,.summary-grid.four{grid-template-columns:1fr 1fr}.session-row{grid-template-columns:1fr 1fr}.session-row>em,.session-row>i{display:none}.data-head{display:none}.data-row{grid-template-columns:1fr 1fr}.video-line{grid-template-columns:34px 1fr auto}.video-line>span:nth-of-type(n+3){display:none}.detail-header{align-items:flex-start}.open-site{display:none}}
@media(max-width:620px){.detail-shell,.detail-footer>div{width:calc(100% - 28px)}.detail-shell{padding-top:18px}.detail-header h1{font-size:30px}.detail-nav{width:100%;overflow:auto}.detail-toolbar{align-items:flex-start;flex-wrap:wrap}.periods{width:100%;overflow:auto}.summary-grid,.summary-grid.four{grid-template-columns:1fr}.session-row{grid-template-columns:1fr}.session-row>span{display:none}.visitor-hero{align-items:flex-start}.visitor-hero>em{display:none}.video-line{grid-template-columns:34px 1fr}.video-line>a{grid-column:2}.detail-footer>div{align-items:flex-start;flex-direction:column;gap:14px}}
`;

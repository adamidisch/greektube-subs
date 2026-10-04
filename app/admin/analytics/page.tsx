"use client";

import {useEffect,useState} from "react";
import type {FormEvent,ReactNode} from "react";
import {APP_VERSION} from "../../version";

type Summary={sessions?:number;page_views?:number;video_opens?:number;watch_seconds?:number;unique_videos?:number;latest_event?:string|null;recent_events?:number};
type TopVideo={video_id:string;views:number;sessions:number;watch_seconds:number;last_seen:string};
type TopPage={name:string;views:number;sessions:number};
type CountRow={name:string;sessions:number;confirmed_sessions?:number};
type CityRow={name:string;country:string;sessions:number};
type EventRow={name:string;count:number};
type Visitor={session_id:string;first_seen:string;last_seen:string;country:string;city:string;device:string;browser:string;source:string;events:number;page_views:number;video_opens:number;watch_seconds:number;videos:string[];paths:string[];country_confirmed?:boolean};
type VisitorVideoStat={session_id:string;video_id:string;views:number;watch_seconds:number;last_seen:string};
type RecentEvent={created_at:string;session_id:string;event_name:string;path:string;video_id:string;referrer_host:string;country:string;city:string;device:string;browser:string;properties:Record<string,unknown>};
type VideoMeta={title:string;originalTitle:string;speakerName:string};
type Report={days:number;summary:Summary;topVideos:TopVideo[];topPages:TopPage[];sources:CountRow[];countries:CountRow[];cities:CityRow[];devices:CountRow[];browsers:CountRow[];events:EventRow[];visitors:Visitor[];visitorVideoStats:VisitorVideoStat[];recent:RecentEvent[];videoTitles:Record<string,string>;videoMeta:Record<string,VideoMeta>};
type AuthState="checking"|"yes"|"no";
type DrawerState={kind:"visitors"|"pages"|"videos"|"watch"|"unique"}|{kind:"visitor";visitor:Visitor}|null;

function formatDuration(value:number){
  const total=Math.max(0,Math.round(Number(value)||0));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
}
function formatNumber(value:number|undefined){return new Intl.NumberFormat("en-US").format(Number(value)||0);}
function shortSession(value:string){return value?`${value.slice(0,6)}…${value.slice(-4)}`:"—";}
function when(value:string){return new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
function countryFlag(code:string){const clean=(code||"").toUpperCase();if(!/^[A-Z]{2}$/.test(clean))return "◎";return String.fromCodePoint(...clean.split("").map(char=>127397+char.charCodeAt(0)));}
function countryName(code:string){const clean=(code||"").toUpperCase();if(!clean||clean==="UNKNOWN")return "Unknown";try{return new Intl.DisplayNames(["en"],{type:"region"}).of(clean)||clean;}catch{return clean;}}
function place(visitor:Pick<Visitor,"country"|"city">){const city=visitor.city&&visitor.city!=="Unknown"?visitor.city:"";const country=countryName(visitor.country);return [city,country].filter(Boolean).join(", ")||"Unknown location";}
function videoTitle(report:Report,id:string){return report.videoTitles[id]||id;}

export default function AnalyticsPage(){
  const [days,setDays]=useState(7);
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState("");
  const [auth,setAuth]=useState<AuthState>("checking");
  const [password,setPassword]=useState("");
  const [loginBusy,setLoginBusy]=useState(false);
  const [loginError,setLoginError]=useState("");

  async function loadReport(selectedDays=days){
    setError("");
    try{
      const response=await fetch("/api/analytics/report?days="+selectedDays,{cache:"no-store",credentials:"same-origin"});
      if(response.status===401){setAuth("no");setReport(null);return;}
      if(!response.ok)throw new Error("Δεν φορτώθηκαν τα analytics.");
      setReport(await response.json() as Report);
    }catch(problem){setError(problem instanceof Error?problem.message:"Δεν φορτώθηκαν τα analytics.");}
  }

  useEffect(()=>{
    let active=true;
    void fetch("/api/admin-auth",{cache:"no-store",credentials:"same-origin"}).then(async response=>{
      const result=await response.json().catch(()=>({})) as {authorized?:boolean};
      if(!active)return;
      const ok=response.ok&&result.authorized===true;
      setAuth(ok?"yes":"no");
      if(ok)void loadReport(7);
    }).catch(()=>{if(active)setAuth("no");});
    return()=>{active=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{if(auth==="yes")void loadReport(days);/* eslint-disable-next-line react-hooks/exhaustive-deps */},[days,auth]);

  async function login(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(loginBusy||!password)return;
    setLoginBusy(true);setLoginError("");
    try{
      const response=await fetch("/api/admin-auth",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const result=await response.json().catch(()=>({})) as {authorized?:boolean;error?:string};
      if(!response.ok||result.authorized!==true)throw new Error(result.error||"Ο κωδικός δεν είναι σωστός.");
      setPassword("");setAuth("yes");
    }catch(problem){setLoginError(problem instanceof Error?problem.message:"Δεν έγινε σύνδεση.");}
    finally{setLoginBusy(false);}
  }

  if(auth!=="yes")return <main className="analytics-login-page">
    <section className="analytics-login-card">
      <a className="login-back" href="/">← GreekTube Subs</a>
      <div className="login-mark"><span/></div>
      <small>PRIVATE ANALYTICS</small>
      <h1>{auth==="checking"?"Έλεγχος πρόσβασης":"Analytics"}</h1>
      <p>{auth==="checking"?"Ένα δευτερόλεπτο…":"Χρησιμοποίησε τον ίδιο admin κωδικό του GreekTube."}</p>
      {auth==="no"&&<form onSubmit={login}>
        <label htmlFor="analytics-password">Admin password</label>
        <input id="analytics-password" type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" autoFocus placeholder="••••••••"/>
        {loginError&&<div className="login-error">{loginError}</div>}
        <button type="submit" disabled={loginBusy||!password}>{loginBusy?"Σύνδεση…":"Είσοδος στα analytics"}</button>
      </form>}
    </section>
    <style>{styles}</style>
  </main>;

  const jump=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});

  return <main className="analytics-page">
    <div className="analytics-shell">
      <header className="analytics-header">
        <div className="analytics-identity"><div className="analytics-orb"><i/></div><div><span>GREEKTUBE SUBS · ADMIN</span><h1>Analytics</h1><p>Audience, viewing and product activity in one place.</p></div></div>
        <div className="header-actions"><button onClick={()=>void loadReport(days)}>↻ Refresh</button><a href="/">Open site ↗</a></div>
      </header>

      <nav className="analytics-menu" aria-label="Analytics sections">
        <button onClick={()=>jump("overview")}>Overview</button><button onClick={()=>jump("audience")}>Audience</button><button onClick={()=>jump("content")}>Content</button><button onClick={()=>jump("acquisition")}>Acquisition</button><button onClick={()=>jump("activity")}>Activity</button>
      </nav>

      <section className="analytics-toolbar">
        <div className="period-label"><small>PERIOD</small><strong>{days===1?"Today":"Last "+days+" days"}</strong></div>
        {report&&<div className={"analytics-health "+(Number(report.summary.recent_events||0)>0?"live":"idle")} title={report.summary.latest_event?"Latest event: "+new Date(report.summary.latest_event).toLocaleString("el-GR"):"No events yet"}><i/><span>{Number(report.summary.recent_events||0)>0?"LIVE":"NO RECENT EVENTS"}</span></div>}
        <div className="period-buttons">{[1,7,30,90].map(value=><button key={value} className={days===value?"active":""} onClick={()=>setDays(value)}>{value===1?"Today":value+" days"}</button>)}</div>
      </section>

      {error?<section className="message">{error}</section>:!report?<section className="message">Loading analytics…</section>:<Dashboard report={report}/>}
    </div>
    <AnalyticsFooter/>
    <style>{styles}</style>
  </main>;
}

function Dashboard({report}:{report:Report}){
  const detail=(view:string)=>"/admin/analytics/details/"+view+"?days="+report.days;
  return <>
    <section id="overview" className="metrics">
      <Metric tone="violet" eyebrow="VISITORS" value={formatNumber(report.summary.sessions)} detail="Unique sessions" href={detail("visitors")}/>
      <Metric tone="blue" eyebrow="PAGE VIEWS" value={formatNumber(report.summary.page_views)} detail="Page views" href={detail("pages")}/>
      <Metric tone="cyan" eyebrow="VIDEO VIEWS" value={formatNumber(report.summary.video_opens)} detail="Video opens" href={detail("videos")}/>
      <Metric tone="amber" eyebrow="WATCH TIME" value={formatDuration(report.summary.watch_seconds||0)} detail="Actual viewing time" href={detail("watch")}/>
      <Metric tone="rose" eyebrow="VIDEOS" value={formatNumber(report.summary.unique_videos)} detail="Unique videos watched" href={detail("unique")}/>
    </section>

    <section id="audience" className="section-block">
      <SectionHeading kicker="AUDIENCE" title="Who is watching" subtitle="Anonymous sessions, location verification and devices."/>
      <div className="two-grid">
        <Panel title="Countries" kicker="LOCATION · COUNTRY">
          <p className="panel-note">New sessions are confirmed from Vercel edge geolocation when available.</p>
          {report.countries.length?report.countries.map(v=><BarRow key={v.name} name={countryFlag(v.name)+" "+countryName(v.name)} value={v.sessions} max={report.countries[0]?.sessions||1} meta={v.confirmed_sessions?v.confirmed_sessions+" edge verified":"historical / estimated"}/>):<Empty/>}
        </Panel>
        <Panel title="Cities" kicker="LOCATION · CITY">{report.cities.length?report.cities.map(v=><BarRow key={v.name+"-"+v.country} name={v.name+" · "+countryName(v.country)} value={v.sessions} max={report.cities[0]?.sessions||1}/>):<Empty/>}</Panel>
      </div>

      <section className="visitors-panel">
        <header className="panel-head"><div><small>VISITORS / SESSIONS</small><h2>Recent visitors</h2><p>Click a visitor to see exactly which videos were opened and watch time per video.</p></div><strong>{report.visitors.length}</strong></header>
        {report.visitors.length?<div className="visitor-list">{report.visitors.map(visitor=><a className="visitor-card" key={visitor.session_id} href={"/admin/analytics/visitor/"+encodeURIComponent(visitor.session_id)+"?days="+report.days}>
          <div className="visitor-main"><div className="visitor-avatar">{countryFlag(visitor.country)}</div><div><strong>{place(visitor)}</strong><span>Session {shortSession(visitor.session_id)} · {when(visitor.last_seen)}</span></div></div>
          <div className="visitor-facts"><span><b>DEVICE</b>{[visitor.device,visitor.browser].filter(Boolean).join(" · ")||"—"}</span><span><b>SOURCE</b>{visitor.source||"direct"}</span><span><b>VIEWS</b>{visitor.page_views} pages · {visitor.video_opens} videos</span><span><b>WATCH</b>{formatDuration(visitor.watch_seconds)}</span></div>
          <div className="visitor-foot"><span className={"country-proof "+(visitor.country_confirmed?"verified":"estimated")}><i/>{visitor.country_confirmed?"EDGE VERIFIED":"LOCATION ESTIMATE"}</span><span>View details →</span></div>
        </a>)}</div>:<Empty/>}
      </section>
    </section>

    <section id="content" className="section-block">
      <SectionHeading kicker="CONTENT" title="What they watch" subtitle="Per-video views, visitors and watch time."/>
      <div className="video-performance panel">
        <header className="panel-head"><div><small>VIDEO PERFORMANCE</small><h2>Video views</h2><p>Every row shows views registered for that video in the selected period.</p></div></header>
        {report.topVideos.length?<div className="video-table">
          <div className="video-table-head"><span>Video</span><span>Views</span><span>Visitors</span><span>Watch</span><span/></div>
          {report.topVideos.map(v=><div className="video-row" key={v.video_id}><div><strong>{videoTitle(report,v.video_id)}</strong><small>{report.videoMeta[v.video_id]?.speakerName||v.video_id}</small></div><b>{formatNumber(v.views)}</b><span>{formatNumber(v.sessions)}</span><span>{formatDuration(v.watch_seconds)}</span><a href={"/?video="+encodeURIComponent(v.video_id)} target="_blank" rel="noreferrer">Open ↗</a></div>)}
        </div>:<Empty/>}
      </div>
      <div className="two-grid content-secondary">
        <Panel title="Top pages" kicker="PAGE PERFORMANCE">{report.topPages.length?report.topPages.map(v=><ContentRow key={v.name} title={v.name||"/"} meta={v.sessions+" visitors"} value={v.views+" views"}/>):<Empty/>}</Panel>
        <Panel title="Watch leaders" kicker="WATCH TIME">{[...report.topVideos].sort((a,b)=>b.watch_seconds-a.watch_seconds).slice(0,12).map(v=><ContentRow key={v.video_id} title={videoTitle(report,v.video_id)} meta={v.views+" views"} value={formatDuration(v.watch_seconds)}/>)}</Panel>
      </div>
    </section>

    <section id="acquisition" className="section-block">
      <SectionHeading kicker="ACQUISITION & TECH" title="How they arrive" subtitle="Traffic sources, devices and browsers."/>
      <div className="three-grid">
        <Panel title="Traffic sources" kicker="SOURCES">{report.sources.length?report.sources.map(v=><BarRow key={v.name} name={v.name||"direct"} value={v.sessions} max={report.sources[0]?.sessions||1}/>):<Empty/>}</Panel>
        <Panel title="Devices" kicker="DEVICES">{report.devices.length?report.devices.map(v=><BarRow key={v.name} name={v.name||"Other"} value={v.sessions} max={report.devices[0]?.sessions||1}/>):<Empty/>}</Panel>
        <Panel title="Browsers" kicker="BROWSERS">{report.browsers.length?report.browsers.map(v=><BarRow key={v.name} name={v.name||"Other"} value={v.sessions} max={report.browsers[0]?.sessions||1}/>):<Empty/>}</Panel>
      </div>
    </section>

    <section id="activity" className="section-block">
      <SectionHeading kicker="ACTIVITY" title="Product activity" subtitle="Event mix and latest events."/>
      <div className="two-grid">
        <Panel title="Events" kicker="EVENT TYPES">{report.events.length?report.events.map(v=><ContentRow key={v.name} title={v.name} meta="" value={formatNumber(v.count)}/>):<Empty/>}</Panel>
        <Panel title="Recent activity" kicker="LIVE FEED"><div className="recent-list">{report.recent.slice(0,24).map((e,i)=><div className="recent-row" key={e.created_at+"-"+i}><span className="recent-dot"/><div><strong>{e.event_name}</strong><p>{e.video_id?videoTitle(report,e.video_id):e.path}</p></div><time>{when(e.created_at)}</time></div>)}</div></Panel>
      </div>
    </section>

  </>;
}

function AnalyticsDrawer({report,state,visitorVideoMap,close,openVisitor}:{report:Report;state:Exclude<DrawerState,null>;visitorVideoMap:Record<string,VisitorVideoStat[]>;close:()=>void;openVisitor:(visitor:Visitor)=>void}){
  let title="",subtitle="";let body:ReactNode=null;
  if(state.kind==="visitor"){
    const visitor=state.visitor;
    const watched=(visitorVideoMap[visitor.session_id]||[]).sort((a,b)=>(b.views||0)-(a.views||0)||b.watch_seconds-a.watch_seconds);
    title=place(visitor);subtitle="Session "+shortSession(visitor.session_id);
    body=<><div className="drawer-proof"><span className={visitor.country_confirmed?"verified":"estimated"}>{visitor.country_confirmed?"✓ Country verified by Vercel Edge":"~ Country estimated from available signals"}</span></div><div className="drawer-facts"><span><small>LAST SEEN</small><b>{when(visitor.last_seen)}</b></span><span><small>DEVICE</small><b>{visitor.device||"—"} · {visitor.browser||"—"}</b></span><span><small>SOURCE</small><b>{visitor.source||"direct"}</b></span><span><small>WATCH TIME</small><b>{formatDuration(visitor.watch_seconds)}</b></span></div><div className="drawer-section"><h3>Videos watched</h3>{watched.length?watched.map(row=><div className="drawer-video" key={row.video_id}><div><strong>{videoTitle(report,row.video_id)}</strong><small>{report.videoMeta[row.video_id]?.speakerName||row.video_id}</small></div><div><b>{row.views} views</b><span>{formatDuration(row.watch_seconds)}</span></div></div>):<Empty/>}</div></>;
  }else if(state.kind==="visitors"){
    title="Visitors";subtitle="Recent anonymous sessions";
    body=<div className="drawer-list">{report.visitors.slice(0,30).map(v=><button key={v.session_id} onClick={()=>openVisitor(v)}><span>{countryFlag(v.country)}</span><div><strong>{place(v)}</strong><small>{v.video_opens} video views · {formatDuration(v.watch_seconds)}</small></div><b>→</b></button>)}</div>;
  }else if(state.kind==="pages"){
    title="Page views";subtitle="Pages opened in the selected period";
    body=<div className="drawer-list">{report.topPages.map(v=><div className="drawer-static" key={v.name}><div><strong>{v.name||"/"}</strong><small>{v.sessions} visitors</small></div><b>{v.views} views</b></div>)}</div>;
  }else{
    title=state.kind==="watch"?"Watch time":state.kind==="unique"?"Videos reached":"Video views";
    subtitle=state.kind==="watch"?"Videos ranked by viewing time":"Per-video performance";
    const rows=state.kind==="watch"?[...report.topVideos].sort((a,b)=>b.watch_seconds-a.watch_seconds):report.topVideos;
    body=<div className="drawer-list">{rows.slice(0,30).map(v=><div className="drawer-static" key={v.video_id}><div><strong>{videoTitle(report,v.video_id)}</strong><small>{v.sessions} visitors · {v.views} views</small></div><b>{formatDuration(v.watch_seconds)}</b></div>)}</div>;
  }
  return <div className="drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><aside className="analytics-drawer" role="dialog" aria-modal="true" aria-label={title}><header><div><small>DETAILS</small><h2>{title}</h2><p>{subtitle}</p></div><button onClick={close} aria-label="Close">×</button></header><div className="drawer-body">{body}</div></aside></div>;
}

function Metric({tone,eyebrow,value,detail,href}:{tone:string;eyebrow:string;value:string;detail:string;href:string}){return <a className={"metric "+tone} href={href}><span className="metric-arrow">→</span><small>{eyebrow}</small><strong>{value}</strong><p>{detail}</p></a>;}
function SectionHeading({kicker,title,subtitle}:{kicker:string;title:string;subtitle:string}){return <div className="section-heading"><span>{kicker}</span><h2>{title}</h2><p>{subtitle}</p></div>;}
function Panel({title,kicker,children}:{title:string;kicker:string;children:ReactNode}){return <section className="panel"><header className="panel-head"><div><small>{kicker}</small><h2>{title}</h2></div></header><div className="panel-body">{children}</div></section>;}
function BarRow({name,value,max,meta}:{name:string;value:number;max:number;meta?:string}){const width=Math.max(4,Math.round((value/Math.max(1,max))*100));return <div className="bar-row"><div><span>{name}{meta&&<small>{meta}</small>}</span><strong>{formatNumber(value)}</strong></div><i><b style={{width:width+"%"}}/></i></div>;}
function ContentRow({title,meta,value}:{title:string;meta:string;value:string}){return <div className="content-row"><div><strong>{title}</strong>{meta&&<span>{meta}</span>}</div><b>{value}</b></div>;}
function Empty(){return <p className="empty">No data yet.</p>;}

function AnalyticsFooter(){
  const year=new Date().getFullYear();
  return <footer className="analytics-footer"><div className="analytics-footer-inner"><div className="footer-brand"><span className="footer-logo">▶</span><div><strong>GreekTube <b>Subs</b></strong><p>Private product analytics for GreekTube.</p></div></div><div className="footer-links"><div><small>NAVIGATE</small><a href="/">Library</a><a href="/admin/analytics">Analytics</a></div><div><small>LEGAL</small><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a></div><div><small>SYSTEM</small><span>Production</span><span>Version {APP_VERSION}</span></div></div></div><div className="footer-bottom"><span>© {year} GreekTube Subs</span><span>First-party analytics · no advertising profiles</span></div></footer>;
}

const styles=`
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}button,a,input{font:inherit}
.analytics-page,.analytics-login-page{font-family:var(--font-ui),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202534}
.analytics-page{min-height:100vh;background:radial-gradient(circle at 8% 0%,rgba(120,104,225,.10),transparent 30%),linear-gradient(180deg,#f8f9fb 0%,#f1f3f7 55%,#eef1f5 100%)}
.analytics-shell{width:min(1460px,calc(100% - 56px));margin:0 auto;padding:30px 0 70px}
.analytics-header{display:flex;align-items:center;justify-content:space-between;gap:24px}.analytics-identity{display:flex;align-items:center;gap:14px}.analytics-orb{width:46px;height:46px;display:grid;place-items:center;border-radius:14px;background:#202538;box-shadow:0 10px 24px rgba(42,46,69,.13)}.analytics-orb i{width:16px;height:16px;border-radius:50%;background:linear-gradient(145deg,#c1b8ff,#7768e2);box-shadow:0 0 0 5px rgba(174,160,255,.14)}
.analytics-header span,.section-heading>span,.panel-head small,.period-label small,.analytics-login-card>small,.analytics-drawer header small{display:block;color:#7567d7;font-size:10px;font-weight:800;letter-spacing:.13em}.analytics-header h1{margin:3px 0;font-size:34px;line-height:1;letter-spacing:-.045em}.analytics-header p{margin:0;color:#7d8591;font-size:14px}.header-actions{display:flex;gap:8px}.header-actions button,.header-actions a{display:inline-flex;align-items:center;height:38px;padding:0 12px;border:1px solid #dfe2e8;border-radius:10px;background:rgba(255,255,255,.78);color:#58606c;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}
.analytics-menu{position:sticky;top:10px;z-index:20;display:flex;gap:5px;width:max-content;max-width:100%;margin:24px auto 0;padding:5px;border:1px solid rgba(216,219,228,.92);border-radius:14px;background:rgba(252,252,254,.88);backdrop-filter:blur(18px);box-shadow:0 8px 28px rgba(36,42,58,.07)}.analytics-menu button{height:34px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:#69717c;font-size:12px;font-weight:700;cursor:pointer}.analytics-menu button:hover{background:#eceafa;color:#6255ca}
.analytics-toolbar{display:flex;align-items:center;gap:18px;margin-top:18px;padding:12px 14px 12px 16px;border:1px solid #dfe2e8;border-radius:15px;background:rgba(255,255,255,.82);box-shadow:0 7px 22px rgba(47,54,76,.035)}.period-label strong{display:block;margin-top:3px;font-size:14px;font-weight:750}.analytics-health{display:inline-flex;align-items:center;gap:7px;margin-left:auto;padding:7px 9px;border:1px solid #e3e5ea;border-radius:999px;background:#f7f8fa;color:#8b929d;font-size:9px;font-weight:850;letter-spacing:.06em}.analytics-health i{width:7px;height:7px;border-radius:50%;background:#aab0b9}.analytics-health.live{border-color:#cfe9dc;background:#f1fbf6;color:#2f7a54}.analytics-health.live i{background:#54ad7d;box-shadow:0 0 0 4px rgba(84,173,125,.12)}.period-buttons{display:flex;gap:4px}.period-buttons button{height:34px;padding:0 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:#777f8a;font-size:11px;font-weight:700;cursor:pointer}.period-buttons button.active{border-color:#d9d4f2;background:#eeeafd;color:#6255ca}
.message{margin-top:14px;padding:18px;border:1px solid #dfe2e8;border-radius:16px;background:#fff;color:#6d7580}
.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:10px;scroll-margin-top:80px}.metric{position:relative;display:block;min-height:118px;padding:17px 18px;border:1px solid transparent;border-radius:16px;text-align:left;text-decoration:none;cursor:pointer;box-shadow:0 8px 24px rgba(47,54,76,.04);transition:.15s}.metric:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(47,54,76,.08)}.metric small{display:block;font-size:9px;font-weight:850;letter-spacing:.12em}.metric strong{display:block;margin-top:12px;font-size:25px;line-height:1;letter-spacing:-.045em;color:#252b38}.metric p{margin:8px 0 0;font-size:12px;color:#757e8a}.metric-arrow{position:absolute;right:13px;top:11px;font-size:13px;opacity:.55}.metric.violet{background:linear-gradient(145deg,#f4f1ff,#fbfaff);border-color:#ded7fb}.metric.violet small{color:#6d5ed1}.metric.blue{background:linear-gradient(145deg,#eef5ff,#fbfdff);border-color:#d8e6fa}.metric.blue small{color:#4d78b9}.metric.cyan{background:linear-gradient(145deg,#edfafa,#fbfefe);border-color:#d3eceb}.metric.cyan small{color:#3b8580}.metric.amber{background:linear-gradient(145deg,#fff8e9,#fffdf8);border-color:#f0e1bd}.metric.amber small{color:#a27325}.metric.rose{background:linear-gradient(145deg,#fff2f6,#fffafb);border-color:#f2dbe3}.metric.rose small{color:#a95a73}
.section-block{scroll-margin-top:82px}.section-heading{margin:34px 0 12px}.section-heading h2{margin:4px 0;font-size:24px;line-height:1.1;letter-spacing:-.035em}.section-heading p{margin:0;color:#8a919c;font-size:13px}.two-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.three-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.panel,.visitors-panel{border:1px solid #dfe2e8;background:rgba(255,255,255,.91);box-shadow:0 8px 26px rgba(47,54,76,.038)}.panel{padding:18px;border-radius:16px;min-width:0}.panel-head{display:flex;justify-content:space-between;gap:18px;margin-bottom:12px}.panel-head h2{margin:4px 0 0;color:#252b39;font-size:17px}.panel-head p,.panel-note{margin:6px 0 0;color:#9198a2;font-size:12px;line-height:1.5}.panel-head>strong{min-width:31px;height:31px;display:grid;place-items:center;border:1px solid #dfdcef;border-radius:999px;background:#f4f1ff;color:#7164d2;font-size:11px}
.bar-row{padding:10px 0;border-top:1px solid #eceef2}.bar-row:first-child{border-top:0}.bar-row>div{display:flex;justify-content:space-between;gap:14px}.bar-row span{min-width:0;color:#59616d;font-size:12.5px}.bar-row span small{display:block;margin-top:3px;color:#a0a6af;font-size:9px}.bar-row strong{font-size:12px}.bar-row>i{display:block;height:4px;margin-top:7px;border-radius:999px;background:#eef0f4;overflow:hidden}.bar-row>i>b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#8274df,#a496ec)}
.visitors-panel{margin-top:10px;padding:20px;border-radius:16px}.visitor-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.visitor-card{display:grid;gap:12px;padding:15px;text-decoration:none;color:inherit;border:1px solid #e5e8ee;border-radius:14px;background:#fafbfc;text-align:left;cursor:pointer;transition:.15s}.visitor-card:hover{border-color:#d5d1ef;background:#fff;transform:translateY(-1px)}.visitor-main{display:flex;align-items:center;gap:11px}.visitor-avatar{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:#f0edff;font-size:19px}.visitor-main strong{display:block;font-size:13.5px}.visitor-main span{display:block;margin-top:3px;color:#9299a3;font-size:10.5px}.visitor-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.visitor-facts span{color:#59616d;font-size:11px}.visitor-facts b{display:block;margin-bottom:3px;color:#a0a6ae;font-size:8.5px;letter-spacing:.08em}.visitor-foot{display:flex;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px solid #eceef2;color:#7d8590;font-size:10px}.country-proof{display:inline-flex;align-items:center;gap:6px;font-weight:800}.country-proof i{width:6px;height:6px;border-radius:50%;background:#aaa}.country-proof.verified{color:#3d805d}.country-proof.verified i{background:#57ad7e}.country-proof.estimated{color:#9a7a46}.country-proof.estimated i{background:#d7a54c}
.video-performance{padding:0;overflow:hidden}.video-performance .panel-head{padding:18px 18px 6px}.video-table-head,.video-row{display:grid;grid-template-columns:minmax(300px,1fr) 90px 90px 130px 58px;gap:12px;align-items:center}.video-table-head{padding:9px 18px;color:#a0a6ae;font-size:9px;font-weight:800;letter-spacing:.08em;border-top:1px solid #eceef2;border-bottom:1px solid #eceef2;background:#fafbfc}.video-row{padding:12px 18px;border-bottom:1px solid #eceef2}.video-row:last-child{border-bottom:0}.video-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}.video-row small{display:block;margin-top:3px;color:#9aa1aa;font-size:10px}.video-row>b,.video-row>span{font-size:11.5px;color:#59616d}.video-row>a{color:#7062d0;text-decoration:none;font-size:10px;font-weight:750}.content-secondary{margin-top:10px}.content-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-top:1px solid #eceef2}.content-row:first-child{border-top:0}.content-row>div{min-width:0}.content-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}.content-row span{display:block;margin-top:3px;color:#9aa0a9;font-size:10.5px}.content-row>b{flex:0 0 auto;color:#695dc3;font-size:11px}
.recent-row{display:grid;grid-template-columns:8px 1fr auto;gap:9px;align-items:center;padding:9px 0;border-top:1px solid #eceef2}.recent-row:first-child{border-top:0}.recent-dot{width:6px;height:6px;border-radius:50%;background:#8e82e7}.recent-row strong{font-size:11.5px}.recent-row p{margin:2px 0 0;max-width:44ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9299a3;font-size:10px}.recent-row time{color:#a0a6ae;font-size:9.5px}.empty{margin:8px 0;color:#9aa1aa;font-size:12px}
.drawer-backdrop{position:fixed;inset:0;z-index:90;background:rgba(22,26,37,.22);backdrop-filter:blur(3px)}.analytics-drawer{position:absolute;top:12px;right:12px;bottom:12px;width:min(520px,calc(100% - 24px));overflow:auto;border:1px solid #dde0e8;border-radius:20px;background:#fbfbfd;box-shadow:0 30px 80px rgba(27,31,43,.2)}.analytics-drawer>header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:18px;padding:20px;border-bottom:1px solid #e6e8ed;background:rgba(251,251,253,.93);backdrop-filter:blur(15px)}.analytics-drawer h2{margin:4px 0;font-size:22px}.analytics-drawer header p{margin:0;color:#8d949e;font-size:12px}.analytics-drawer header>button{width:32px;height:32px;border:1px solid #dfe2e8;border-radius:10px;background:#fff;color:#6e7681;font-size:19px;cursor:pointer}.drawer-body{padding:18px}.drawer-proof span{display:inline-flex;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:800}.drawer-proof .verified{background:#eef9f3;color:#3d805d;border:1px solid #cde7d8}.drawer-proof .estimated{background:#fff7e9;color:#916c30;border:1px solid #eadab9}.drawer-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.drawer-facts span{padding:12px;border:1px solid #e6e8ed;border-radius:12px;background:#fff}.drawer-facts small{display:block;color:#a0a6ae;font-size:8.5px;font-weight:800}.drawer-facts b{display:block;margin-top:5px;font-size:11.5px}.drawer-section{margin-top:22px}.drawer-section h3{margin:0 0 9px;font-size:15px}.drawer-video,.drawer-static{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid #e9ebef}.drawer-video strong,.drawer-static strong{display:block;font-size:12px}.drawer-video small,.drawer-static small{display:block;margin-top:3px;color:#9aa1aa;font-size:9.5px}.drawer-video>div:last-child{text-align:right}.drawer-video>div:last-child b,.drawer-video>div:last-child span{display:block;font-size:10px}.drawer-video>div:last-child span{margin-top:3px;color:#777f8a}.drawer-static>b{white-space:nowrap;color:#6659c2;font-size:10.5px}.drawer-list>button{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;width:100%;padding:11px 3px;border:0;border-top:1px solid #e9ebef;background:transparent;text-align:left;cursor:pointer}.drawer-list>button:first-child,.drawer-static:first-child{border-top:0}.drawer-list>button>span{font-size:18px}.drawer-list>button strong{display:block;font-size:12px}.drawer-list>button small{display:block;margin-top:3px;color:#969da6;font-size:9.5px}
.analytics-footer{border-top:1px solid #dde1e8;background:#202532;color:#e8ebf1}.analytics-footer-inner{width:min(1460px,calc(100% - 56px));margin:0 auto;display:grid;grid-template-columns:1.25fr 1fr;gap:70px;padding:36px 0 26px}.footer-brand{display:flex;gap:12px}.footer-logo{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(145deg,#8476df,#5f55b9);font-size:11px}.footer-brand strong{font-size:14px}.footer-brand strong b{color:#a99ef0}.footer-brand p{margin:7px 0 0;color:#9ca4b1;font-size:11.5px}.footer-links{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.footer-links>div{display:grid;align-content:start;gap:7px}.footer-links small{color:#8276dc;font-size:9px;font-weight:850}.footer-links a,.footer-links span{color:#b5bbc5;text-decoration:none;font-size:11px}.footer-bottom{width:min(1460px,calc(100% - 56px));margin:0 auto;display:flex;justify-content:space-between;gap:20px;padding:14px 0 22px;border-top:1px solid rgba(255,255,255,.08);color:#7f8794;font-size:10px}
.analytics-login-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0%,rgba(132,112,238,.14),transparent 36%),#f4f5f8}.analytics-login-card{width:min(430px,100%);padding:30px;border:1px solid #e0e3e9;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(37,43,58,.12)}.login-back{color:#777f8a;text-decoration:none;font-size:12px}.login-mark{width:44px;height:44px;display:grid;place-items:center;margin:30px 0 20px;border-radius:14px;background:#202538}.login-mark span{width:16px;height:16px;border-radius:50%;background:#8d80e8}.analytics-login-card h1{margin:5px 0 8px;font-size:30px}.analytics-login-card p{margin:0;color:#828a95;font-size:13px}.analytics-login-card form{display:grid;gap:10px;margin-top:24px}.analytics-login-card input{height:44px;padding:0 12px;border:1px solid #dfe2e8;border-radius:11px}.analytics-login-card form button{height:44px;border:0;border-radius:11px;background:#6f61cf;color:#fff;font-weight:750}
@media(max-width:1050px){.metrics{grid-template-columns:repeat(2,1fr)}.metrics .metric:last-child{grid-column:span 2}.visitor-list,.two-grid,.three-grid{grid-template-columns:1fr}.analytics-footer-inner{grid-template-columns:1fr;gap:26px}}
@media(max-width:720px){.analytics-shell,.analytics-footer-inner,.footer-bottom{width:min(100% - 28px,1460px)}.analytics-header h1{font-size:28px}.analytics-header p,.header-actions button{display:none}.analytics-menu{width:100%;overflow:auto;justify-content:flex-start}.analytics-toolbar{flex-wrap:wrap}.analytics-health{margin-left:0}.period-buttons{margin-left:auto}.metrics{grid-template-columns:1fr 1fr}.metric{min-height:108px;padding:14px}.metric strong{font-size:21px}.visitor-facts{grid-template-columns:1fr 1fr}.video-table-head{display:none}.video-row{grid-template-columns:1fr auto;gap:7px}.footer-links{grid-template-columns:repeat(2,1fr)}.footer-bottom{flex-direction:column;gap:5px}.drawer-facts{grid-template-columns:1fr}}
`;

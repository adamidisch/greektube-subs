"use client";

import {useEffect,useMemo,useState} from "react";
import type {FormEvent,ReactNode} from "react";
import GtsFooter from "../../GtsFooter";

type Summary={sessions?:number;page_views?:number;video_opens?:number;watch_seconds?:number;unique_videos?:number};
type TopVideo={video_id:string;opens:number;sessions:number;watch_seconds:number};
type TopPage={name:string;views:number;sessions:number};
type CountRow={name:string;sessions:number};
type CityRow={name:string;country:string;sessions:number};
type EventRow={name:string;count:number};
type Visitor={session_id:string;first_seen:string;last_seen:string;country:string;city:string;device:string;browser:string;source:string;events:number;page_views:number;video_opens:number;watch_seconds:number;videos:string[];paths:string[]};
type RecentEvent={created_at:string;session_id:string;event_name:string;path:string;video_id:string;referrer_host:string;country:string;city:string;device:string;browser:string;properties:Record<string,unknown>};
type Report={days:number;summary:Summary;topVideos:TopVideo[];topPages:TopPage[];sources:CountRow[];countries:CountRow[];cities:CityRow[];devices:CountRow[];browsers:CountRow[];events:EventRow[];visitors:Visitor[];recent:RecentEvent[];videoTitles:Record<string,string>};
type AuthState="checking"|"yes"|"no";

function formatDuration(value:number){const s=Math.max(0,Math.round(Number(value)||0));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h)return `${h}ω ${m}λ`;if(m)return `${m}λ ${sec}δ`;return `${sec}δ`;}
function formatNumber(value:number|undefined){return new Intl.NumberFormat("el-GR").format(Number(value)||0);}
function shortSession(value:string){return value?`${value.slice(0,6)}…${value.slice(-4)}`:"—";}
function when(value:string){return new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
function location(country:string,city:string){return [city,country].filter(Boolean).join(", ")||"Άγνωστη τοποθεσία";}

export default function AnalyticsPage(){
  const [days,setDays]=useState(7);
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState("");
  const [auth,setAuth]=useState<AuthState>("checking");
  const [password,setPassword]=useState("");
  const [loginBusy,setLoginBusy]=useState(false);
  const [loginError,setLoginError]=useState("");

  async function loadReport(selectedDays=days){
    setReport(null);setError("");
    try{
      const response=await fetch(`/api/analytics/report?days=${selectedDays}`,{cache:"no-store",credentials:"same-origin"});
      if(response.status===401){setAuth("no");return;}
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
      <p>{auth==="checking"?"Ένα δευτερόλεπτο…":"Χρησιμοποίησε τον ίδιο admin κωδικό που χρησιμοποιείς για την επεξεργασία των βίντεο."}</p>
      {auth==="no"&&<form onSubmit={login}>
        <label htmlFor="analytics-password">Admin password</label>
        <input id="analytics-password" type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" autoFocus placeholder="••••••••"/>
        {loginError&&<div className="login-error">{loginError}</div>}
        <button type="submit" disabled={loginBusy||!password}>{loginBusy?"Σύνδεση…":"Είσοδος στα analytics"}</button>
      </form>}
    </section>
    <style>{styles}</style>
  </main>;

  return <main className="analytics-page">
    <div className="analytics-wrap">
      <header className="analytics-header">
        <div className="analytics-identity"><div className="analytics-orb"><i/></div><div><span>GREEKTUBE SUBS · ADMIN</span><h1>Analytics</h1><p>Ποιοι μπήκαν, από πού ήρθαν και τι είδαν.</p></div></div>
        <a href="/">Πίσω στο site <b>↗</b></a>
      </header>

      <section className="analytics-toolbar">
        <div className="period-label"><small>ΠΕΡΙΟΔΟΣ</small><strong>{days===1?"Σήμερα":`Τελευταίες ${days} ημέρες`}</strong></div>
        <nav>{[1,7,30,90].map(value=><button key={value} className={days===value?"active":""} onClick={()=>setDays(value)}>{value===1?"Σήμερα":`${value} ημέρες`}</button>)}</nav>
      </section>

      {error?<section className="message">{error}</section>:!report?<section className="message">Φόρτωση δεδομένων…</section>:<Dashboard report={report}/>} 
    </div>
    <GtsFooter/>
    <style>{styles}</style>
  </main>;
}

function Dashboard({report}:{report:Report}){
  const visitorViews=useMemo(()=>report.visitors.map(visitor=>{
    const videos=(visitor.videos||[]).map(id=>report.videoTitles[id]||id).slice(0,3);
    const paths=(visitor.paths||[]).filter(Boolean).slice(0,2);
    return {...visitor,viewed:[...videos,...paths].filter(Boolean)};
  }),[report]);

  return <>
    <section className="metrics">
      <Metric eyebrow="ΕΠΙΣΚΕΠΤΕΣ" value={formatNumber(report.summary.sessions)} detail="Μοναδικά sessions"/>
      <Metric eyebrow="PAGE VIEWS" value={formatNumber(report.summary.page_views)} detail="Προβολές σελίδων"/>
      <Metric eyebrow="VIDEO OPENS" value={formatNumber(report.summary.video_opens)} detail="Ανοίγματα βίντεο"/>
      <Metric eyebrow="WATCH TIME" value={formatDuration(report.summary.watch_seconds||0)} detail="Πραγματικός χρόνος θέασης"/>
      <Metric eyebrow="VIDEOS" value={formatNumber(report.summary.unique_videos)} detail="Διαφορετικά βίντεο"/>
    </section>

    <SectionHeading kicker="AUDIENCE" title="Ποιοι μπήκαν" subtitle="Χώρα, πόλη και πρόσφατοι επισκέπτες."/>
    <section className="two-grid audience-grid">
      <Panel title="Χώρες" kicker="COUNTRIES">{report.countries.length?report.countries.map(v=><BarRow key={v.name} name={v.name} value={v.sessions} max={report.countries[0]?.sessions||1}/>):<Empty/>}</Panel>
      <Panel title="Πόλεις" kicker="CITIES">{report.cities.length?report.cities.map(v=><BarRow key={`${v.name}-${v.country}`} name={`${v.name}${v.country?` · ${v.country}`:""}`} value={v.sessions} max={report.cities[0]?.sessions||1}/>):<Empty/>}</Panel>
    </section>

    <section className="visitors-panel">
      <header className="panel-head"><div><small>VISITORS / SESSIONS</small><h2>Τελευταίοι επισκέπτες</h2><p>Κάθε γραμμή είναι ανώνυμο session. Βλέπεις location, συσκευή, source και τι άνοιξε.</p></div><strong>{report.visitors.length}</strong></header>
      {visitorViews.length?<div className="visitor-list">{visitorViews.map(visitor=><article className="visitor-card" key={visitor.session_id}>
        <div className="visitor-main"><div className="visitor-avatar">{(visitor.country||"?").slice(0,2).toUpperCase()}</div><div><strong>{location(visitor.country,visitor.city)}</strong><span>Session {shortSession(visitor.session_id)} · {when(visitor.last_seen)}</span></div></div>
        <div className="visitor-facts"><span><b>Συσκευή</b>{[visitor.device,visitor.browser].filter(Boolean).join(" · ")||"—"}</span><span><b>Source</b>{visitor.source||"direct"}</span><span><b>Views</b>{visitor.page_views} pages · {visitor.video_opens} videos</span><span><b>Watch</b>{formatDuration(visitor.watch_seconds)}</span></div>
        <div className="visitor-viewed"><b>Είδε</b><span>{visitor.viewed.length?visitor.viewed.join("  •  "):"Δεν υπάρχει ακόμη content event"}</span></div>
      </article>)}</div>:<Empty/>}
    </section>

    <SectionHeading kicker="CONTENT" title="Τι βλέπουν" subtitle="Βίντεο και σελίδες που τραβούν περισσότερο ενδιαφέρον."/>
    <section className="two-grid">
      <Panel title="Top videos" kicker="VIDEO PERFORMANCE">{report.topVideos.length?report.topVideos.map(v=><ContentRow key={v.video_id} title={report.videoTitles[v.video_id]||v.video_id} meta={`${v.sessions} visitors · ${v.opens} opens`} value={formatDuration(v.watch_seconds)}/>):<Empty/>}</Panel>
      <Panel title="Top pages" kicker="PAGE PERFORMANCE">{report.topPages.length?report.topPages.map(v=><ContentRow key={v.name} title={v.name||"/"} meta={`${v.sessions} visitors`} value={`${v.views} views`}/>):<Empty/>}</Panel>
    </section>

    <SectionHeading kicker="ACQUISITION & TECH" title="Πώς έρχονται και με τι" subtitle="Traffic sources, συσκευές και browsers."/>
    <section className="three-grid">
      <Panel title="Traffic sources" kicker="SOURCES">{report.sources.length?report.sources.map(v=><BarRow key={v.name} name={v.name||"direct"} value={v.sessions} max={report.sources[0]?.sessions||1}/>):<Empty/>}</Panel>
      <Panel title="Συσκευές" kicker="DEVICES">{report.devices.length?report.devices.map(v=><BarRow key={v.name} name={v.name||"Other"} value={v.sessions} max={report.devices[0]?.sessions||1}/>):<Empty/>}</Panel>
      <Panel title="Browsers" kicker="BROWSERS">{report.browsers.length?report.browsers.map(v=><BarRow key={v.name} name={v.name||"Other"} value={v.sessions} max={report.browsers[0]?.sessions||1}/>):<Empty/>}</Panel>
    </section>

    <SectionHeading kicker="ACTIVITY" title="Τι κάνουν μέσα στο site" subtitle="Event breakdown και πρόσφατη δραστηριότητα."/>
    <section className="two-grid activity-grid">
      <Panel title="Events" kicker="EVENT TYPES">{report.events.length?report.events.map(v=><ContentRow key={v.name} title={v.name} meta="" value={formatNumber(v.count)}/>):<Empty/>}</Panel>
      <Panel title="Recent activity" kicker="LIVE FEED"><div className="recent-list">{report.recent.slice(0,20).map((e,i)=><div className="recent-row" key={`${e.created_at}-${i}`}><span className="recent-dot"/><div><strong>{e.event_name}</strong><p>{report.videoTitles[e.video_id]||e.video_id||e.path}</p></div><time>{when(e.created_at)}</time></div>)}</div></Panel>
    </section>
  </>;
}

function Metric({eyebrow,value,detail}:{eyebrow:string;value:string;detail:string}){return <article className="metric"><small>{eyebrow}</small><strong>{value}</strong><p>{detail}</p></article>}
function SectionHeading({kicker,title,subtitle}:{kicker:string;title:string;subtitle:string}){return <div className="section-heading"><span>{kicker}</span><h2>{title}</h2><p>{subtitle}</p></div>}
function Panel({title,kicker,children}:{title:string;kicker:string;children:ReactNode}){return <section className="panel"><header className="panel-head"><div><small>{kicker}</small><h2>{title}</h2></div></header><div className="panel-body">{children}</div></section>}
function BarRow({name,value,max}:{name:string;value:number;max:number}){const width=Math.max(4,Math.round((value/Math.max(1,max))*100));return <div className="bar-row"><div><span>{name}</span><strong>{formatNumber(value)}</strong></div><i><b style={{width:`${width}%`}}/></i></div>}
function ContentRow({title,meta,value}:{title:string;meta:string;value:string}){return <div className="content-row"><div><strong>{title}</strong>{meta&&<span>{meta}</span>}</div><b>{value}</b></div>}
function Empty(){return <p className="empty">Δεν υπάρχουν ακόμη δεδομένα.</p>}

const styles=`
*{box-sizing:border-box}body{margin:0}.analytics-page,.analytics-login-page{font-family:var(--font-ui),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202534}.analytics-page{min-height:100vh;padding:34px 0 24px;background:radial-gradient(circle at 8% 0%,rgba(132,112,238,.11),transparent 28%),linear-gradient(180deg,#f8f8fb 0%,#f1f3f7 100%)}.analytics-wrap{width:min(1500px,calc(100% - 64px));margin:0 auto}.analytics-header{display:flex;align-items:center;justify-content:space-between;gap:24px}.analytics-identity{display:flex;align-items:center;gap:16px}.analytics-orb{width:52px;height:52px;display:grid;place-items:center;border-radius:16px;background:#202538;box-shadow:0 12px 28px rgba(42,46,69,.15)}.analytics-orb i{width:19px;height:19px;border-radius:50%;background:linear-gradient(145deg,#b9adff,#7669df);box-shadow:0 0 0 6px rgba(174,160,255,.14)}.analytics-header span,.section-heading>span,.panel-head small,.metric small,.period-label small,.analytics-login-card>small{display:block;color:#7567d7;font-size:11px;font-weight:800;letter-spacing:.13em}.analytics-header h1{margin:4px 0 4px;font-size:38px;line-height:1;letter-spacing:-.05em}.analytics-header p{margin:0;color:#7c8490;font-size:15px}.analytics-header>a{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 15px;border:1px solid #dfe1e8;border-radius:12px;background:rgba(255,255,255,.78);color:#565d68;text-decoration:none;font-size:13px;font-weight:650;box-shadow:0 4px 14px rgba(47,54,76,.05)}.analytics-header>a b{color:#8176dc}.analytics-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:30px;padding:15px 16px 15px 18px;border:1px solid #dfe2e8;border-radius:17px;background:rgba(255,255,255,.82);box-shadow:0 9px 26px rgba(47,54,76,.045)}.period-label strong{display:block;margin-top:4px;font-size:15px;font-weight:720}.analytics-toolbar nav{display:flex;gap:7px;flex-wrap:wrap}.analytics-toolbar nav button{height:38px;padding:0 13px;border:1px solid transparent;border-radius:10px;background:transparent;color:#737b87;font-size:13px;font-weight:650;cursor:pointer}.analytics-toolbar nav button:hover{background:#f1f0fb;color:#6357c7}.analytics-toolbar nav button.active{border-color:#d8d3f3;background:#ece9ff;color:#6255ca}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:12px}.metric,.panel,.visitors-panel,.message{border:1px solid #dfe2e8;background:rgba(255,255,255,.9);box-shadow:0 10px 30px rgba(47,54,76,.045)}.metric{min-height:150px;padding:22px;border-radius:18px}.metric strong{display:block;margin-top:15px;color:#202534;font-size:32px;line-height:1;letter-spacing:-.05em}.metric p{margin:10px 0 0;color:#9299a3;font-size:14px;line-height:1.4}.section-heading{margin:42px 0 15px}.section-heading h2{margin:5px 0 5px;font-size:27px;line-height:1.1;letter-spacing:-.035em}.section-heading p{margin:0;color:#89909b;font-size:15px}.two-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.three-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.panel{padding:22px;border-radius:18px;min-width:0}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:15px}.panel-head h2{margin:5px 0 0;color:#252b39;font-size:19px;font-weight:720;letter-spacing:-.025em}.panel-head p{max-width:700px;margin:7px 0 0;color:#8c939e;font-size:14px;line-height:1.55}.panel-head>strong{min-width:35px;height:35px;display:grid;place-items:center;border:1px solid #dfdcef;border-radius:999px;background:#f4f1ff;color:#7164d2;font-size:12px}.panel-body{min-width:0}.bar-row{padding:12px 0;border-top:1px solid #eceef2}.bar-row:first-child{border-top:0}.bar-row>div{display:flex;align-items:center;justify-content:space-between;gap:14px}.bar-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#59616d;font-size:14px}.bar-row strong{color:#404754;font-size:13px}.bar-row>i{display:block;height:5px;margin-top:8px;border-radius:999px;background:#eef0f4;overflow:hidden}.bar-row>i>b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#8274df,#a496ec)}.visitors-panel{margin-top:12px;padding:24px;border-radius:18px}.visitor-list{display:grid;gap:10px}.visitor-card{display:grid;grid-template-columns:minmax(220px,1.05fr) minmax(390px,1.6fr);gap:16px 26px;padding:18px;border:1px solid #e7e9ee;border-radius:15px;background:#fafbfc}.visitor-main{display:flex;align-items:center;gap:13px;min-width:0}.visitor-avatar{width:42px;height:42px;display:grid;place-items:center;flex:0 0 auto;border-radius:13px;background:#eeeaff;color:#6759ca;font-size:12px;font-weight:800}.visitor-main strong{display:block;color:#2e3542;font-size:15px}.visitor-main span{display:block;margin-top:4px;color:#9299a3;font-size:12px}.visitor-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.visitor-facts span{min-width:0;color:#59616d;font-size:12.5px;line-height:1.4}.visitor-facts b{display:block;margin-bottom:4px;color:#a0a6ae;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.visitor-viewed{grid-column:1/-1;display:grid;grid-template-columns:58px 1fr;gap:10px;padding-top:13px;border-top:1px solid #e8eaef;color:#636b77;font-size:13px;line-height:1.5}.visitor-viewed b{color:#333a47}.content-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:13px 0;border-top:1px solid #eceef2}.content-row:first-child{border-top:0}.content-row>div{min-width:0}.content-row strong{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;color:#3b424e;font-size:14px;line-height:1.4}.content-row span{display:block;margin-top:4px;color:#9299a3;font-size:12px}.content-row>b{flex:0 0 auto;color:#6860ba;font-size:13px}.recent-list{display:grid}.recent-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:11px;align-items:start;padding:12px 0;border-top:1px solid #eceef2}.recent-row:first-child{border-top:0}.recent-dot{width:7px;height:7px;margin-top:6px;border-radius:50%;background:#7d71df}.recent-row strong{display:block;color:#414855;font-size:13px}.recent-row p{margin:3px 0 0;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8b929d;font-size:12px}.recent-row time{color:#9aa0a9;font-size:11.5px;white-space:nowrap}.empty{margin:14px 0 4px;color:#9aa1ab;font-size:14px}.message{margin-top:12px;padding:28px;border-radius:18px;color:#7f8792;font-size:15px}.analytics-page>.gts-standard-footer{font-family:var(--font-ui),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.analytics-login-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 30% 15%,rgba(130,113,223,.15),transparent 30%),#f3f4f8}.analytics-login-card{width:min(470px,100%);padding:34px;border:1px solid #e0e2e8;border-radius:22px;background:#fff;box-shadow:0 20px 60px rgba(40,46,66,.09)}.login-back{display:inline-block;margin-bottom:30px;color:#787f8a;text-decoration:none;font-size:13px}.login-mark{width:52px;height:52px;display:grid;place-items:center;margin-bottom:22px;border-radius:16px;background:#202538}.login-mark span{width:19px;height:19px;border-radius:50%;background:#8e7ce9;box-shadow:0 0 0 6px rgba(142,124,233,.15)}.analytics-login-card h1{margin:6px 0 8px;font-size:34px;letter-spacing:-.045em}.analytics-login-card p{margin:0 0 24px;color:#7e8590;font-size:15px;line-height:1.55}.analytics-login-card form{display:grid;gap:10px}.analytics-login-card label{font-size:13px;font-weight:700;color:#555c67}.analytics-login-card input{height:48px;padding:0 14px;border:1px solid #dcdfe6;border-radius:11px;font-size:16px;outline:none}.analytics-login-card input:focus{border-color:#9a8ee8;box-shadow:0 0 0 3px rgba(154,142,232,.12)}.analytics-login-card button{height:48px;border:0;border-radius:11px;background:#282d43;color:#fff;font-size:14px;font-weight:700;cursor:pointer}.login-error{padding:11px 12px;border-radius:9px;background:#fff1f1;color:#a14343;font-size:13px}
@media(max-width:1100px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.three-grid{grid-template-columns:1fr 1fr}.visitor-card{grid-template-columns:1fr}.visitor-facts{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.analytics-page{padding-top:22px}.analytics-wrap{width:calc(100% - 28px)}.analytics-header{align-items:flex-start}.analytics-orb{width:46px;height:46px;border-radius:14px}.analytics-header h1{font-size:32px}.analytics-header p{font-size:13.5px}.analytics-header>a{min-height:38px;padding:0 11px;font-size:12px}.analytics-toolbar{display:grid;grid-template-columns:1fr;padding:14px;margin-top:22px}.analytics-toolbar nav{display:grid;grid-template-columns:repeat(4,1fr)}.analytics-toolbar nav button{padding:0 6px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{min-height:132px;padding:18px}.metric strong{font-size:29px}.metric p{font-size:13px}.section-heading{margin-top:34px}.section-heading h2{font-size:24px}.section-heading p{font-size:14px}.two-grid,.three-grid{grid-template-columns:1fr}.panel,.visitors-panel{padding:18px}.visitor-facts{grid-template-columns:1fr 1fr}.visitor-viewed{grid-template-columns:1fr}.analytics-page>.gts-standard-footer{margin-top:32px}}
@media(max-width:470px){.analytics-header{gap:12px}.analytics-identity{gap:11px}.analytics-header>a{font-size:0;width:40px;padding:0;justify-content:center}.analytics-header>a b{font-size:15px}.metrics{grid-template-columns:1fr 1fr}.metric{min-height:120px}.metric small{font-size:9.5px}.metric strong{font-size:26px}.visitor-facts{grid-template-columns:1fr}.visitor-main strong{font-size:14px}.analytics-toolbar nav button{font-size:11.5px}.content-row{align-items:flex-start}.recent-row{grid-template-columns:8px minmax(0,1fr)}.recent-row time{grid-column:2}.analytics-login-card{padding:27px 22px}}
`;

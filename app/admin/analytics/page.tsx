"use client";

import {useEffect,useState} from "react";
import type {FormEvent,ReactNode} from "react";

type Report={days:number;summary:{sessions?:number;page_views?:number;video_opens?:number;watch_seconds?:number};topVideos:Array<{video_id:string;opens:number;watch_seconds:number}>;sources:Array<{name:string;sessions:number}>;countries:Array<{name:string;sessions:number}>;devices:Array<{name:string;sessions:number}>;events:Array<{name:string;count:number}>;recent:Array<{created_at:string;session_id:string;event_name:string;path:string;video_id:string;referrer_host:string;country:string;city:string;device:string;browser:string;properties:Record<string,unknown>}>};
type AuthState="checking"|"yes"|"no";

function duration(value:number){const s=Math.max(0,Math.round(Number(value)||0));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}ω ${m}λ`:`${m} λεπτά`;}
function number(value:number|undefined){return new Intl.NumberFormat("el-GR").format(Number(value)||0);}

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

  if(auth!=="yes")return <main className="analytics-login-shell">
    <section className="analytics-login-card">
      <a className="login-back" href="/">← GreekTube Subs</a>
      <div className="login-mark"><span></span></div>
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
    <header className="analytics-header"><div className="analytics-identity"><div className="analytics-orb"><i></i></div><div><span>GREEKTUBE SUBS · ADMIN</span><h1>Analytics</h1><p>Traffic και product usage σε μία καθαρή εικόνα.</p></div></div><a href="/">Πίσω στο site <b>↗</b></a></header>
    <section className="analytics-toolbar"><div className="period-label"><small>ΠΕΡΙΟΔΟΣ</small><strong>{days===1?"Σήμερα":`Τελευταίες ${days} ημέρες`}</strong></div><nav>{[1,7,30,90].map(value=><button key={value} className={days===value?"active":""} onClick={()=>setDays(value)}>{value===1?"Σήμερα":`${value} ημέρες`}</button>)}</nav></section>
    {error?<section className="message">{error}</section>:!report?<section className="message">Φόρτωση δεδομένων…</section>:<>
      <section className="metrics">
        <Metric eyebrow="SESSIONS" value={number(report.summary.sessions)} detail="Μοναδικές επισκέψεις"/>
        <Metric eyebrow="PAGE VIEWS" value={number(report.summary.page_views)} detail="Προβολές σελίδων"/>
        <Metric eyebrow="VIDEO OPENS" value={number(report.summary.video_opens)} detail="Ανοίγματα βίντεο"/>
        <Metric eyebrow="WATCH TIME" value={duration(report.summary.watch_seconds||0)} detail="Πραγματικός χρόνος θέασης"/>
      </section>
      <section className="grid">
        <Panel title="Top videos" kicker="CONTENT">{report.topVideos.length?report.topVideos.map(v=><Row key={v.video_id} name={v.video_id} value={`${v.opens} ανοίγματα · ${duration(v.watch_seconds)}`}/>):<Empty/>}</Panel>
        <Panel title="Traffic sources" kicker="ACQUISITION">{report.sources.length?report.sources.map(v=><Row key={v.name} name={v.name||"Direct"} value={`${v.sessions} sessions`}/>):<Empty/>}</Panel>
        <Panel title="Χώρες" kicker="AUDIENCE">{report.countries.length?report.countries.map(v=><Row key={v.name} name={v.name} value={`${v.sessions} sessions`}/>):<Empty/>}</Panel>
        <Panel title="Συσκευές" kicker="TECHNOLOGY">{report.devices.length?report.devices.map(v=><Row key={v.name} name={v.name||"Other"} value={`${v.sessions} sessions`}/>):<Empty/>}</Panel>
      </section>
      <section className="recent"><div className="section-head"><div><span>LIVE EVENT FEED</span><h2>Τελευταίες ενέργειες</h2><p>Τι έγινε μέσα στο GreekTube Subs.</p></div><strong>{report.recent.length}</strong></div><div className="table"><div className="tr head"><span>Ώρα</span><span>Event</span><span>Video / Page</span><span>Location</span><span>Device</span></div>{report.recent.map((e,i)=><div className="tr" key={`${e.created_at}-${i}`}><span>{new Date(e.created_at).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span><span><em></em>{e.event_name}</span><span>{e.video_id||e.path}</span><span>{[e.city,e.country].filter(Boolean).join(", ")||"—"}</span><span>{e.device} · {e.browser}</span></div>)}</div></section>
    </>}
    <style>{styles}</style>
  </main>;
}

function Metric({eyebrow,value,detail}:{eyebrow:string;value:string;detail:string}){return <article><small>{eyebrow}</small><strong>{value}</strong><p>{detail}</p></article>}
function Panel({title,kicker,children}:{title:string;kicker:string;children:ReactNode}){return <section className="panel"><header><small>{kicker}</small><h2>{title}</h2></header><div>{children}</div></section>}
function Row({name,value}:{name:string;value:string}){return <div className="row"><span>{name}</span><strong>{value}</strong></div>}
function Empty(){return <p className="empty">Δεν υπάρχουν ακόμη δεδομένα.</p>}

const styles=`
*{box-sizing:border-box}body{margin:0}.analytics-page,.analytics-login-shell{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;color:#1c2230}.analytics-page{min-height:100vh;padding:30px clamp(16px,4vw,58px) 80px;background:radial-gradient(circle at 8% 0%,rgba(132,112,238,.10),transparent 30%),linear-gradient(180deg,#f8f8fb 0%,#f2f3f7 100%)}.analytics-header,.analytics-toolbar,.metrics,.grid,.recent,.message{max-width:1480px;margin-left:auto;margin-right:auto}.analytics-header{display:flex;align-items:center;justify-content:space-between;gap:20px}.analytics-identity{display:flex;align-items:center;gap:13px}.analytics-orb{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:#202538;box-shadow:0 9px 24px rgba(42,46,69,.14)}.analytics-orb i{width:15px;height:15px;border-radius:50%;background:linear-gradient(145deg,#b9adff,#7669df);box-shadow:0 0 0 5px rgba(174,160,255,.14)}.analytics-header span,.section-head span,.panel header small,.metrics small,.period-label small,.analytics-login-card>small{display:block;color:#786bd8;font-size:8px;font-weight:780;letter-spacing:.135em}.analytics-header h1{margin:3px 0 2px;font-size:28px;line-height:1;letter-spacing:-.045em}.analytics-header p{margin:0;color:#7d8490;font-size:11px}.analytics-header>a{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border:1px solid #dfe1e8;border-radius:10px;background:rgba(255,255,255,.72);color:#5f6470;text-decoration:none;font-size:10px;font-weight:620;box-shadow:0 3px 12px rgba(47,54,76,.04)}.analytics-header>a b{color:#8176dc}.analytics-toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:28px;padding:11px 12px 11px 15px;border:1px solid #e0e2e8;border-radius:15px;background:rgba(255,255,255,.76);box-shadow:0 8px 24px rgba(47,54,76,.045)}.period-label strong{display:block;margin-top:3px;font-size:11px;font-weight:680}.analytics-toolbar nav{display:flex;gap:5px}.analytics-toolbar nav button{height:31px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#7b818c;font-size:9px;font-weight:620}.analytics-toolbar nav button:hover{background:#f1f0fb;color:#6357c7}.analytics-toolbar nav button.active{border-color:#d9d4f4;background:#eeebff;color:#6659cf}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}.metrics article,.panel,.recent,.message{border:1px solid #e1e3e9;background:rgba(255,255,255,.86);box-shadow:0 9px 28px rgba(47,54,76,.045)}.metrics article{min-height:126px;padding:17px;border-radius:16px}.metrics strong{display:block;margin-top:10px;color:#202534;font-size:24px;line-height:1;letter-spacing:-.045em}.metrics p{margin:8px 0 0;color:#979ca5;font-size:9.5px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}.panel{padding:16px;border-radius:16px}.panel header{margin-bottom:8px}.panel h2,.section-head h2{margin:3px 0 0;color:#252b39;font-size:13px;font-weight:690;letter-spacing:-.025em}.row{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:9px 1px;border-top:1px solid #eceef2;font-size:10px}.row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#5d6470}.row strong{flex:0 0 auto;color:#969ba4;font-size:9px;font-weight:580}.empty{margin:12px 0 4px;color:#9ca1aa;font-size:10px}.recent{margin-top:10px;padding:16px;border-radius:16px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.section-head p{margin:4px 0 0;color:#9ca1aa;font-size:9.5px}.section-head>strong{min-width:25px;height:25px;display:grid;place-items:center;border:1px solid #dedfee;border-radius:999px;background:#f5f3ff;color:#7569d4;font-size:9px}.table{margin-top:12px;overflow:auto}.tr{min-width:820px;display:grid;grid-template-columns:120px 135px minmax(220px,1fr) 160px 180px;gap:12px;padding:9px 3px;border-top:1px solid #eceef2;color:#6c727e;font-size:9.5px}.tr.head{color:#a0a4ac;font-size:8px;font-weight:720;letter-spacing:.055em}.tr:not(.head)>span:nth-child(2){display:flex;align-items:center;gap:7px;color:#4d5460;font-weight:620}.tr em{width:5px;height:5px;flex:0 0 5px;border-radius:50%;background:#7d71df}.message{margin-top:10px;padding:24px;border-radius:16px;color:#858b96;font-size:11px}.analytics-login-shell{min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 30% 15%,rgba(145,128,238,.16),transparent 30%),radial-gradient(circle at 80% 80%,rgba(92,171,195,.12),transparent 32%),#f4f5f8}.analytics-login-card{width:min(410px,100%);padding:25px;border:1px solid #dee1e8;border-radius:22px;background:rgba(255,255,255,.91);box-shadow:0 28px 80px rgba(48,54,74,.12)}.login-back{display:inline-block;margin-bottom:28px;color:#828895;text-decoration:none;font-size:10px}.login-mark{width:44px;height:44px;display:grid;place-items:center;margin-bottom:17px;border-radius:15px;background:#222638}.login-mark span{width:14px;height:14px;border-radius:50%;background:#9284ed;box-shadow:0 0 0 5px rgba(146,132,237,.15)}.analytics-login-card h1{margin:5px 0 7px;font-size:27px;letter-spacing:-.045em}.analytics-login-card>p{margin:0 0 22px;color:#7d8490;font-size:11px;line-height:1.55}.analytics-login-card form{display:grid;gap:9px}.analytics-login-card label{color:#727986;font-size:9px;font-weight:650}.analytics-login-card input{height:45px;width:100%;padding:0 13px;border:1px solid #d9dce3;border-radius:11px;outline:none;background:#fafbfc;color:#202532;font-size:14px}.analytics-login-card input:focus{border-color:#9c91eb;box-shadow:0 0 0 3px rgba(143,127,240,.11)}.analytics-login-card form button{height:44px;margin-top:3px;border:0;border-radius:11px;background:#272b3c;color:#fff;font-size:10.5px;font-weight:680}.analytics-login-card form button:disabled{opacity:.55}.login-error{padding:9px 10px;border:1px solid #f1c8c5;border-radius:9px;background:#fff4f3;color:#a0504a;font-size:9.5px}@media(max-width:760px){.analytics-page{padding:20px 12px 60px}.analytics-header{align-items:flex-start}.analytics-header h1{font-size:24px}.analytics-header p{max-width:210px}.analytics-header>a{min-height:32px;padding:0 9px;font-size:9px}.analytics-toolbar{align-items:flex-start;flex-direction:column;padding:12px}.analytics-toolbar nav{width:100%;display:grid;grid-template-columns:repeat(4,1fr)}.analytics-toolbar nav button{padding:0 4px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics article{min-height:112px;padding:14px}.metrics strong{font-size:19px}.grid{grid-template-columns:1fr}.analytics-login-card{padding:21px;border-radius:19px}.analytics-login-card h1{font-size:24px}}
`;

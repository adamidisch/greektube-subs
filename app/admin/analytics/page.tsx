"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import type {FormEvent} from "react";
import type {AnalyticsReport} from "@/lib/analytics-report";
import AnalyticsDashboard from "./AnalyticsDashboard";

type AuthState="checking"|"yes"|"no";

export default function AnalyticsPage(){
  const [days,setDays]=useState(7);
  const [report,setReport]=useState<AnalyticsReport|null>(null);
  const [error,setError]=useState("");
  const [auth,setAuth]=useState<AuthState>("checking");
  const [password,setPassword]=useState("");
  const [loginBusy,setLoginBusy]=useState(false);
  const [loginError,setLoginError]=useState("");

  const [tick,setTick]=useState(0);

  useEffect(()=>{
    let active=true;
    void fetch("/api/admin-auth",{cache:"no-store",credentials:"same-origin"}).then(async response=>{
      const result=await response.json().catch(()=>({})) as {authorized?:boolean};
      if(!active)return;
      const ok=response.ok&&result.authorized===true;
      setAuth(ok?"yes":"no");
    }).catch(()=>{if(active)setAuth("no");});
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(auth!=="yes")return;
    let active=true;
    void fetch("/api/analytics/report?days="+days,{cache:"no-store",credentials:"same-origin"}).then(async response=>{
      if(!active)return;
      if(response.status===401){setAuth("no");setReport(null);return;}
      if(!response.ok)throw new Error("Δεν φορτώθηκαν τα analytics.");
      setReport(await response.json() as AnalyticsReport);
      setError("");
    }).catch(problem=>{if(active)setError(problem instanceof Error?problem.message:"Δεν φορτώθηκαν τα analytics.");});
    return()=>{active=false;};
  },[days,auth,tick]);

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
      <Link className="login-back" href="/">← GreekTube Subs</Link>
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

  return <AnalyticsDashboard report={report} error={error} days={days} onDays={setDays} onRefresh={()=>setTick(value=>value+1)}/>;
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
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px;scroll-margin-top:80px}.metric{position:relative;display:block;min-height:118px;padding:17px 18px;border:1px solid transparent;border-radius:16px;text-align:left;text-decoration:none;cursor:pointer;box-shadow:0 8px 24px rgba(47,54,76,.04);transition:.15s}.metric:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(47,54,76,.08)}.metric small{display:block;font-size:9px;font-weight:850;letter-spacing:.12em}.metric strong{display:block;margin-top:12px;font-size:25px;line-height:1;letter-spacing:-.045em;color:#252b38}.metric p{margin:8px 0 0;font-size:12px;color:#757e8a}.metric-arrow{position:absolute;right:13px;top:11px;font-size:13px;opacity:.55}.metric.violet{background:linear-gradient(145deg,#f4f1ff,#fbfaff);border-color:#ded7fb}.metric.violet small{color:#6d5ed1}.metric.blue{background:linear-gradient(145deg,#eef5ff,#fbfdff);border-color:#d8e6fa}.metric.blue small{color:#4d78b9}.metric.cyan{background:linear-gradient(145deg,#edfafa,#fbfefe);border-color:#d3eceb}.metric.cyan small{color:#3b8580}.metric.amber{background:linear-gradient(145deg,#fff8e9,#fffdf8);border-color:#f0e1bd}.metric.amber small{color:#a27325}.metric.rose{background:linear-gradient(145deg,#fff2f6,#fffafb);border-color:#f2dbe3}.metric.rose small{color:#a95a73}
.metric.red{background:linear-gradient(145deg,#fff0ee,#fffaf9);border-color:#f3d5d1}
.metric.red small{color:#b4483c}
.metric.green{background:linear-gradient(145deg,#eef8f1,#fbfefc);border-color:#d3eadb}
.metric.green small{color:#2f7a4d}
.section-block{scroll-margin-top:82px}.section-heading{margin:34px 0 12px}.section-heading h2{margin:4px 0;font-size:24px;line-height:1.1;letter-spacing:-.035em}.section-heading p{margin:0;color:#8a919c;font-size:13px}.two-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.three-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.panel,.visitors-panel{border:1px solid #dfe2e8;background:rgba(255,255,255,.91);box-shadow:0 8px 26px rgba(47,54,76,.038)}.panel{padding:18px;border-radius:16px;min-width:0}.panel-head{display:flex;justify-content:space-between;gap:18px;margin-bottom:12px}.panel-head h2{margin:4px 0 0;color:#252b39;font-size:17px}.panel-head p,.panel-note{margin:6px 0 0;color:#9198a2;font-size:12px;line-height:1.5}.panel-head>strong{min-width:31px;height:31px;display:grid;place-items:center;border:1px solid #dfdcef;border-radius:999px;background:#f4f1ff;color:#7164d2;font-size:11px}
.bar-row{padding:10px 0;border-top:1px solid #eceef2}.bar-row:first-child{border-top:0}.bar-row>div{display:flex;justify-content:space-between;gap:14px}.bar-row span{min-width:0;color:#59616d;font-size:12.5px}.bar-row span small{display:block;margin-top:3px;color:#a0a6af;font-size:9px}.bar-row strong{font-size:12px}.bar-row>i{display:block;height:4px;margin-top:7px;border-radius:999px;background:#eef0f4;overflow:hidden}.bar-row>i>b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#8274df,#a496ec)}
.visitors-panel{margin-top:10px;padding:20px;border-radius:16px}.visitor-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.visitor-card{display:grid;gap:12px;padding:15px;text-decoration:none;color:inherit;border:1px solid #e5e8ee;border-radius:14px;background:#fafbfc;text-align:left;cursor:pointer;transition:.15s}.visitor-card:hover{border-color:#d5d1ef;background:#fff;transform:translateY(-1px)}.visitor-main{display:flex;align-items:center;gap:11px}.visitor-avatar{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:#f0edff;font-size:19px}.visitor-main strong{display:block;font-size:13.5px}.visitor-main span{display:block;margin-top:3px;color:#9299a3;font-size:10.5px}.visitor-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.visitor-facts span{color:#59616d;font-size:11px}.visitor-facts b{display:block;margin-bottom:3px;color:#a0a6ae;font-size:8.5px;letter-spacing:.08em}.visitor-foot{display:flex;justify-content:space-between;gap:10px;padding-top:9px;border-top:1px solid #eceef2;color:#7d8590;font-size:10px}.country-proof{display:inline-flex;align-items:center;gap:6px;font-weight:800}.country-proof i{width:6px;height:6px;border-radius:50%;background:#aaa}.country-proof.verified{color:#3d805d}.country-proof.verified i{background:#57ad7e}.country-proof.estimated{color:#9a7a46}.country-proof.estimated i{background:#d7a54c}
.video-performance{padding:0;overflow:hidden}.video-performance .panel-head{padding:18px 18px 6px}.video-table-head,.video-row{display:grid;grid-template-columns:minmax(300px,1fr) 90px 90px 130px 58px;gap:12px;align-items:center}.video-table-head{padding:9px 18px;color:#a0a6ae;font-size:9px;font-weight:800;letter-spacing:.08em;border-top:1px solid #eceef2;border-bottom:1px solid #eceef2;background:#fafbfc}.video-row{padding:12px 18px;border-bottom:1px solid #eceef2}.video-row:last-child{border-bottom:0}.video-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}.video-row small{display:block;margin-top:3px;color:#9aa1aa;font-size:10px}.video-row>b,.video-row>span{font-size:11.5px;color:#59616d}.video-row>a{color:#7062d0;text-decoration:none;font-size:10px;font-weight:750}.content-secondary{margin-top:10px}.content-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-top:1px solid #eceef2}.content-row:first-child{border-top:0}.content-row>div{min-width:0}.content-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}.content-row span{display:block;margin-top:3px;color:#9aa0a9;font-size:10.5px}.content-row>b{flex:0 0 auto;color:#695dc3;font-size:11px}
.recent-row{display:grid;grid-template-columns:8px 1fr auto;gap:9px;align-items:center;padding:9px 0;border-top:1px solid #eceef2}.recent-row:first-child{border-top:0}.recent-dot{width:6px;height:6px;border-radius:50%;background:#8e82e7}.recent-row strong{font-size:11.5px}.recent-row p{margin:2px 0 0;max-width:44ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9299a3;font-size:10px}.recent-row time{color:#a0a6ae;font-size:9.5px}.empty{margin:8px 0;color:#9aa1aa;font-size:12px}
.drawer-backdrop{position:fixed;inset:0;z-index:90;background:rgba(22,26,37,.22);backdrop-filter:blur(3px)}.analytics-drawer{position:absolute;top:12px;right:12px;bottom:12px;width:min(520px,calc(100% - 24px));overflow:auto;border:1px solid #dde0e8;border-radius:20px;background:#fbfbfd;box-shadow:0 30px 80px rgba(27,31,43,.2)}.analytics-drawer>header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:18px;padding:20px;border-bottom:1px solid #e6e8ed;background:rgba(251,251,253,.93);backdrop-filter:blur(15px)}.analytics-drawer h2{margin:4px 0;font-size:22px}.analytics-drawer header p{margin:0;color:#8d949e;font-size:12px}.analytics-drawer header>button{width:32px;height:32px;border:1px solid #dfe2e8;border-radius:10px;background:#fff;color:#6e7681;font-size:19px;cursor:pointer}.drawer-body{padding:18px}.drawer-proof span{display:inline-flex;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:800}.drawer-proof .verified{background:#eef9f3;color:#3d805d;border:1px solid #cde7d8}.drawer-proof .estimated{background:#fff7e9;color:#916c30;border:1px solid #eadab9}.drawer-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.drawer-facts span{padding:12px;border:1px solid #e6e8ed;border-radius:12px;background:#fff}.drawer-facts small{display:block;color:#a0a6ae;font-size:8.5px;font-weight:800}.drawer-facts b{display:block;margin-top:5px;font-size:11.5px}.drawer-section{margin-top:22px}.drawer-section h3{margin:0 0 9px;font-size:15px}.drawer-video,.drawer-static{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid #e9ebef}.drawer-video strong,.drawer-static strong{display:block;font-size:12px}.drawer-video small,.drawer-static small{display:block;margin-top:3px;color:#9aa1aa;font-size:9.5px}.drawer-video>div:last-child{text-align:right}.drawer-video>div:last-child b,.drawer-video>div:last-child span{display:block;font-size:10px}.drawer-video>div:last-child span{margin-top:3px;color:#777f8a}.drawer-static>b{white-space:nowrap;color:#6659c2;font-size:10.5px}.drawer-list>button{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;width:100%;padding:11px 3px;border:0;border-top:1px solid #e9ebef;background:transparent;text-align:left;cursor:pointer}.drawer-list>button:first-child,.drawer-static:first-child{border-top:0}.drawer-list>button>span{font-size:18px}.drawer-list>button strong{display:block;font-size:12px}.drawer-list>button small{display:block;margin-top:3px;color:#969da6;font-size:9.5px}
.analytics-footer{border-top:1px solid #dde1e8;background:#202532;color:#e8ebf1}.analytics-footer-inner{width:min(1460px,calc(100% - 56px));margin:0 auto;display:grid;grid-template-columns:1.25fr 1fr;gap:70px;padding:36px 0 26px}.footer-brand{display:flex;gap:12px}.footer-logo{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(145deg,#8476df,#5f55b9);font-size:11px}.footer-brand strong{font-size:14px}.footer-brand strong b{color:#a99ef0}.footer-brand p{margin:7px 0 0;color:#9ca4b1;font-size:11.5px}.footer-links{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.footer-links>div{display:grid;align-content:start;gap:7px}.footer-links small{color:#8276dc;font-size:9px;font-weight:850}.footer-links a,.footer-links span{color:#b5bbc5;text-decoration:none;font-size:11px}.footer-bottom{width:min(1460px,calc(100% - 56px));margin:0 auto;display:flex;justify-content:space-between;gap:20px;padding:14px 0 22px;border-top:1px solid rgba(255,255,255,.08);color:#7f8794;font-size:10px}
.analytics-login-page{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 0%,rgba(132,112,238,.14),transparent 36%),#f4f5f8}.analytics-login-card{width:min(430px,100%);padding:30px;border:1px solid #e0e3e9;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(37,43,58,.12)}.login-back{color:#777f8a;text-decoration:none;font-size:12px}.login-mark{width:44px;height:44px;display:grid;place-items:center;margin:30px 0 20px;border-radius:14px;background:#202538}.login-mark span{width:16px;height:16px;border-radius:50%;background:#8d80e8}.analytics-login-card h1{margin:5px 0 8px;font-size:30px}.analytics-login-card p{margin:0;color:#828a95;font-size:13px}.analytics-login-card form{display:grid;gap:10px;margin-top:24px}.analytics-login-card input{height:44px;padding:0 12px;border:1px solid #dfe2e8;border-radius:11px}.analytics-login-card form button{height:44px;border:0;border-radius:11px;background:#6f61cf;color:#fff;font-weight:750}
.header-actions .users-button{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;color:#fff!important;border:1px solid #6e5abf!important;background:linear-gradient(135deg,#7565d9,#5745ac)!important;border-radius:11px;font-size:12px;font-weight:700;text-decoration:none;box-shadow:0 5px 14px rgba(101,79,184,.18)}.header-actions .users-button:hover{background:linear-gradient(135deg,#8374ea,#6553c4)!important;transform:translateY(-1px)}.header-actions .users-button:focus-visible{outline:2px solid #8f83ee;outline-offset:2px}.header-actions .users-button span{font-size:15px;line-height:1}\n@media(max-width:1050px){.metrics{grid-template-columns:repeat(2,1fr)}.metrics .metric:last-child{grid-column:span 2}.visitor-list,.two-grid,.three-grid{grid-template-columns:1fr}.analytics-footer-inner{grid-template-columns:1fr;gap:26px}}
@media(max-width:720px){.analytics-shell,.analytics-footer-inner,.footer-bottom{width:min(100% - 28px,1460px)}.analytics-header h1{font-size:28px}.analytics-header p,.header-actions button{display:none}.analytics-menu{width:100%;overflow:auto;justify-content:flex-start}.analytics-toolbar{flex-wrap:wrap}.analytics-health{margin-left:0}.period-buttons{margin-left:auto}.metrics{grid-template-columns:1fr 1fr}.metric{min-height:108px;padding:14px}.metric strong{font-size:21px}.visitor-facts{grid-template-columns:1fr 1fr}.video-table-head{display:none}.video-row{grid-template-columns:1fr auto;gap:7px}.footer-links{grid-template-columns:repeat(2,1fr)}.footer-bottom{flex-direction:column;gap:5px}.drawer-facts{grid-template-columns:1fr}}
`;

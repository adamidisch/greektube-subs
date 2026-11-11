"use client";

import {useEffect,useState} from "react";
import type {FormEvent} from "react";
import type {AnalyticsReport} from "@/lib/analytics-report";
import AnalyticsDashboard from "./AnalyticsDashboard";
import AnalyticsLogin from "./AnalyticsLogin";

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
  const [loadedKey,setLoadedKey]=useState("");
  const key=days+":"+tick;

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
      const data=await response.json() as AnalyticsReport;
      if(!active)return;
      setReport(data);setLoadedKey(days+":"+tick);
      setError("");
    }).catch(problem=>{if(active){setError(problem instanceof Error?problem.message:"Δεν φορτώθηκαν τα analytics.");setLoadedKey(days+":"+tick);}});
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

  if(auth!=="yes")return <AnalyticsLogin checking={auth==="checking"} busy={loginBusy} error={loginError} password={password} onPassword={setPassword} onSubmit={login}/>;

  return <AnalyticsDashboard report={report} loading={loadedKey!==key} error={error} days={days} onDays={setDays} onRefresh={()=>setTick(value=>value+1)}/>;
}


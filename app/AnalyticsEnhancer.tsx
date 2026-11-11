"use client";

import {useEffect,useRef} from "react";

const CONSENT_KEY="gts-analytics-consent-v1";
const SESSION_KEY="gts-analytics-session-v1";

type Consent="yes"|"no";
type EventPayload={name:string;properties?:Record<string,string|number|boolean|null>};
type QueuedEvent={sessionId:string;name:string;path:string;videoId:string;referrer:string;properties?:Record<string,string|number|boolean|null>;ts:number};

function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function currentPath(){return `${location.pathname}${location.search}`.slice(0,220);}
let fallbackSessionId="";
function sessionId(){
  try{
    let value=sessionStorage.getItem(SESSION_KEY)||"";
    if(!value){
      value=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY,value);
    }
    return value;
  }catch{
    if(!fallbackSessionId)fallbackSessionId=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return fallbackSessionId;
  }
}
function labelFor(element:Element){
  return (element.getAttribute("aria-label")||element.getAttribute("title")||element.textContent||"").replace(/\s+/g," ").trim().slice(0,80);
}
function kindFor(element:Element){
  if(element.matches("button"))return "button";
  if(element.matches("a"))return "link";
  if(element.matches("select"))return "select";
  return element.tagName.toLowerCase();
}
function getConsent():Consent{
  try{return localStorage.getItem(CONSENT_KEY)==="no"?"no":"yes";}catch{return "yes";}
}

export default function AnalyticsEnhancer(){
  const consentRef=useRef<Consent>("no");
  const queue=useRef<QueuedEvent[]>([]);
  const lastPath=useRef("");
  const watchAccum=useRef(0);
  const lastTick=useRef(0);
  const lastProgressBucket=useRef<Record<string,number>>({});

  useEffect(()=>{const value=getConsent();consentRef.current=value;try{if(!localStorage.getItem(CONSENT_KEY))localStorage.setItem(CONSENT_KEY,"yes");}catch{}},[]);

  useEffect(()=>{
    let flushInFlight=false;
    const requeue=(events:QueuedEvent[])=>{
      queue.current=[...events,...queue.current].slice(0,120);
    };
    const flush=()=>{
      if(consentRef.current!=="yes"||!queue.current.length||flushInFlight)return;
      const events=queue.current.splice(0,30);
      const body=JSON.stringify({events});

      if(document.visibilityState==="hidden"&&navigator.sendBeacon){
        const accepted=navigator.sendBeacon("/api/analytics",new Blob([body],{type:"application/json"}));
        if(!accepted)requeue(events);
        return;
      }

      flushInFlight=true;
      void fetch("/api/analytics",{method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true,credentials:"same-origin"})
        .then(response=>{if(!response.ok)requeue(events);})
        .catch(()=>requeue(events))
        .finally(()=>{flushInFlight=false;if(queue.current.length>=10)queueMicrotask(flush);});
    };
    const track=(event:EventPayload)=>{
      if(consentRef.current!=="yes")return;
      try{
        const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||"Unknown";
        queue.current.push({sessionId:sessionId(),name:event.name,path:currentPath(),videoId:currentVideoId(),referrer:document.referrer,properties:{timezone,locale:navigator.language||"Unknown",...event.properties},ts:Date.now()});
        if(queue.current.length>=10)flush();
      }catch{
        // Analytics must never break the app UI.
      }
    };
    const page=()=>{
      const path=currentPath();
      if(path===lastPath.current)return;
      lastPath.current=path;
      track({name:"page_view"});
      const id=currentVideoId();
      if(id)track({name:"video_open"});
    };
    const click=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest("button,a,[role='button']"):null;
      if(!target)return;
      const label=labelFor(target);
      const props:Record<string,string|number|boolean|null>={kind:kindFor(target)};
      if(label)props.label=label;
      const cls=target.className;
      if(typeof cls==="string"&&cls)props.className=cls.split(/\s+/).slice(0,3).join(" ").slice(0,100);
      track({name:"click",properties:props});
      const lower=label.toLowerCase();
      if(lower.includes("πλήρης")||lower.includes("fullscreen"))track({name:"fullscreen"});
      if(lower.includes("αγαπη"))track({name:"favorite"});
      if(lower.includes("κοινο")||lower.includes("share"))track({name:"share"});
      if(lower.includes("υπότιτ"))track({name:"subtitle"});
      if(lower.includes("επεξεργασία βίντεο")||target.matches(".card-edit"))track({name:"editor_open"});
      if(target.closest(".gts-editor-screen")&&lower.includes("αποθήκευση"))track({name:"editor_save"});
    };
    let searchTimer=0;
    const input=(event:Event)=>{
      const target=event.target;
      if(target instanceof HTMLInputElement&&(/search/i.test(target.type)||/αναζήτηση/i.test(target.placeholder))){
        window.clearTimeout(searchTimer);
        searchTimer=window.setTimeout(()=>track({name:"search",properties:{length:target.value.length}}),650);
      }
      if(target instanceof HTMLSelectElement){
        const label=target.getAttribute("aria-label")||"select";
        track({name:/speed|ταχύ/i.test(label)?"speed":"filter",properties:{label:label.slice(0,60),value:target.value.slice(0,80)}});
      }
    };
    const timer=window.setInterval(()=>{
      page();
      if(consentRef.current!=="yes")return;
      const now=Date.now();
      const delta=Math.min(5,Math.max(0,(now-lastTick.current)/1000));
      lastTick.current=now;
      const videoId=currentVideoId();
      const playing=Boolean(document.querySelector('.gts31-play[aria-label="Παύση"],button[aria-label="Παύση"]'));
      const seek=document.querySelector<HTMLInputElement>(".player-seek-bar");
      if(document.visibilityState==="visible"&&videoId&&playing&&seek){
        watchAccum.current+=delta;
        if(watchAccum.current>=15){
          const seconds=Math.floor(watchAccum.current);watchAccum.current=0;
          track({name:"video_watch",properties:{seconds,currentTime:Number(seek.value)||0,duration:Number(seek.max)||0}});
        }
        const duration=Number(seek.max)||0,current=Number(seek.value)||0;
        if(duration>0){
          const pct=current/duration*100;
          const bucket=pct>=95?100:pct>=75?75:pct>=50?50:pct>=25?25:0;
          if(bucket&&lastProgressBucket.current[videoId]!==bucket){lastProgressBucket.current[videoId]=bucket;track({name:"video_progress",properties:{percent:bucket,currentTime:current}});}
        }
      }
    },5000);
    const visibility=()=>{if(document.visibilityState==="hidden")flush();};
    const end=()=>{track({name:"session_end",properties:{watchSeconds:Math.round(watchAccum.current)}});flush();};
    const originalPush=history.pushState.bind(history),originalReplace=history.replaceState.bind(history);
    history.pushState=((...args:Parameters<History["pushState"]>)=>{originalPush(...args);queueMicrotask(page);}) as History["pushState"];
    history.replaceState=((...args:Parameters<History["replaceState"]>)=>{originalReplace(...args);queueMicrotask(page);}) as History["replaceState"];
    // Bug tracking: uncaught JS errors, unhandled promise rejections and failing /api calls (deduplicated, max 25 per page load).
    const seenErrors=new Set<string>();
    const reportError=(kind:string,message:string,source:string,extra:Record<string,unknown>={})=>{
      const clean=String(message||"").replace(/\s+/g," ").trim().slice(0,160)||"(no message)";
      const key=kind+"|"+clean+"|"+source;
      if(seenErrors.has(key)||seenErrors.size>=25)return;
      seenErrors.add(key);
      track({name:"error",properties:{kind,message:clean,source:source.slice(0,120),...extra}});
    };
    const onWindowError=(event:ErrorEvent)=>{
      if(!event.message||/ResizeObserver loop/i.test(event.message))return;
      reportError("js_error",event.message,(event.filename||"").replace(location.origin,"")+":"+(event.lineno||0));
    };
    const onRejection=(event:PromiseRejectionEvent)=>{
      const reason=event.reason as {message?:unknown}|string|undefined;
      reportError("promise_rejection",typeof reason==="string"?reason:String(reason?.message||"Unhandled promise rejection"),"promise");
    };
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(async(...args:Parameters<typeof fetch>)=>{
      const input=args[0];
      const url=typeof input==="string"?input:input instanceof URL?input.href:(input as Request).url;
      const apiPath=url.replace(location.origin,"").split("?")[0];
      const tracked=apiPath.startsWith("/api/")&&!apiPath.startsWith("/api/analytics");
      try{
        const response=await nativeFetch(...args);
        if(tracked&&response.status>=500)reportError("api_error","HTTP "+response.status,apiPath,{status:response.status});
        return response;
      }catch(error){
        if(tracked&&!(error instanceof DOMException&&error.name==="AbortError"))reportError("network_error",error instanceof Error?error.message:"Network request failed",apiPath);
        throw error;
      }
    }) as typeof window.fetch;
    window.addEventListener("error",onWindowError);window.addEventListener("unhandledrejection",onRejection);
    window.addEventListener("popstate",page);document.addEventListener("click",click,true);document.addEventListener("input",input,true);document.addEventListener("change",input,true);document.addEventListener("visibilitychange",visibility);window.addEventListener("pagehide",end);
    lastTick.current=Date.now();
    const flushTimer=window.setInterval(flush,4000);page();window.setTimeout(flush,300);
    return()=>{window.fetch=nativeFetch;window.removeEventListener("error",onWindowError);window.removeEventListener("unhandledrejection",onRejection);window.clearInterval(timer);window.clearInterval(flushTimer);window.clearTimeout(searchTimer);window.removeEventListener("popstate",page);document.removeEventListener("click",click,true);document.removeEventListener("input",input,true);document.removeEventListener("change",input,true);document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",end);history.pushState=originalPush;history.replaceState=originalReplace;flush();};
  },[]);

  return null;
}

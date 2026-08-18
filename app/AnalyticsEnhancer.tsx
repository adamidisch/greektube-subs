"use client";

import {useEffect,useRef,useState} from "react";

const CONSENT_KEY="gts-analytics-consent-v1";
const SESSION_KEY="gts-analytics-session-v1";

type Consent="yes"|"no"|"";
type EventPayload={name:string;properties?:Record<string,string|number|boolean|null>};
type QueuedEvent={sessionId:string;name:string;path:string;videoId:string;referrer:string;properties?:Record<string,string|number|boolean|null>;ts:number};

function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function currentPath(){return `${location.pathname}${location.search}`.slice(0,220);}
function sessionId(){
  let value=sessionStorage.getItem(SESSION_KEY)||"";
  if(!value){value=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(SESSION_KEY,value);}
  return value;
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
  try{return localStorage.getItem(CONSENT_KEY)==="yes"?"yes":localStorage.getItem(CONSENT_KEY)==="no"?"no":"";}catch{return "";}
}

export default function AnalyticsEnhancer(){
  const [consent,setConsent]=useState<Consent>("");
  const consentRef=useRef<Consent>("");
  const queue=useRef<QueuedEvent[]>([]);
  const lastPath=useRef("");
  const watchAccum=useRef(0);
  const lastTick=useRef(Date.now());
  const lastProgressBucket=useRef<Record<string,number>>({});

  useEffect(()=>{const value=getConsent();setConsent(value);consentRef.current=value;},[]);

  useEffect(()=>{
    const flush=()=>{
      if(consentRef.current!=="yes"||!queue.current.length)return;
      const events=queue.current.splice(0,30);
      const body=JSON.stringify({events});
      if(document.visibilityState==="hidden"&&navigator.sendBeacon){
        navigator.sendBeacon("/api/analytics",new Blob([body],{type:"application/json"}));
      }else{
        void fetch("/api/analytics",{method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true,credentials:"same-origin"}).catch(()=>{queue.current.unshift(...events.slice(-10));});
      }
    };
    const track=(event:EventPayload)=>{
      if(consentRef.current!=="yes")return;
      queue.current.push({sessionId:sessionId(),name:event.name,path:currentPath(),videoId:currentVideoId(),referrer:document.referrer,properties:event.properties,ts:Date.now()});
      if(queue.current.length>=10)flush();
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
    window.addEventListener("popstate",page);document.addEventListener("click",click,true);document.addEventListener("input",input,true);document.addEventListener("change",input,true);document.addEventListener("visibilitychange",visibility);window.addEventListener("pagehide",end);
    const flushTimer=window.setInterval(flush,5000);page();
    return()=>{window.clearInterval(timer);window.clearInterval(flushTimer);window.clearTimeout(searchTimer);window.removeEventListener("popstate",page);document.removeEventListener("click",click,true);document.removeEventListener("input",input,true);document.removeEventListener("change",input,true);document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",end);history.pushState=originalPush;history.replaceState=originalReplace;flush();};
  },[]);

  function choose(value:"yes"|"no"){
    try{localStorage.setItem(CONSENT_KEY,value);if(value==="no")sessionStorage.removeItem(SESSION_KEY);}catch{}
    consentRef.current=value;setConsent(value);
    if(value==="yes")window.location.reload();
  }

  if(consent)return null;
  return <div className="gts-analytics-consent" role="dialog" aria-label="Ρυθμίσεις analytics"><div><strong>Βελτίωση του GreekTube Subs</strong><p>Θέλουμε να μετράμε ανώνυμα ποιες σελίδες και λειτουργίες χρησιμοποιούνται ώστε να βελτιώνουμε το site. Δεν αποθηκεύουμε raw IP και δεν χρησιμοποιούμε διαφημιστικό tracking.</p></div><div className="gts-analytics-actions"><button onClick={()=>choose("no")}>Μόνο απαραίτητα</button><button className="accept" onClick={()=>choose("yes")}>Αποδοχή analytics</button></div><style>{`
    .gts-analytics-consent{position:fixed;left:50%;bottom:max(14px,env(safe-area-inset-bottom));z-index:2147483400;width:min(680px,calc(100vw - 24px));display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 15px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(16,19,25,.96);color:#f4f4f1;box-shadow:0 18px 60px rgba(0,0,0,.42);backdrop-filter:blur(18px);transform:translateX(-50%)}.gts-analytics-consent>div:first-child{min-width:0}.gts-analytics-consent strong{display:block;font-size:12px;font-weight:680}.gts-analytics-consent p{max-width:430px;margin:5px 0 0;color:#979da7;font-size:10.5px;line-height:1.45}.gts-analytics-actions{display:flex;flex:0 0 auto;gap:7px}.gts-analytics-actions button{min-height:35px;padding:0 11px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:transparent;color:#c6cad1;font-size:9.5px;font-weight:620}.gts-analytics-actions button.accept{border-color:rgba(143,127,240,.42);background:#7569d9;color:#fff}@media(max-width:620px){.gts-analytics-consent{display:block;padding:14px}.gts-analytics-consent p{font-size:11px}.gts-analytics-actions{margin-top:12px}.gts-analytics-actions button{flex:1;min-height:38px}}
  `}</style></div>;
}

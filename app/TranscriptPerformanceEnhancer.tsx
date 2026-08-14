"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";

type Cue={start:number;duration:number;text:string};
type Captions={cues?:Cue[]};

function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function clock(value:number){
  const seconds=Math.max(0,Math.floor(Number(value)||0));
  const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
  return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
}
function cueAt(cues:Cue[],time:number){
  let lo=0,hi=cues.length-1,answer=-1;
  while(lo<=hi){
    const mid=(lo+hi)>>1;
    if((Number(cues[mid]?.start)||0)<=time){answer=mid;lo=mid+1;}else hi=mid-1;
  }
  return answer;
}
function cachedCaptions(videoId:string):Captions|null{
  try{
    const raw=localStorage.getItem(`greektube-transcript:${videoId}:v12`);
    return raw?JSON.parse(raw) as Captions:null;
  }catch{return null;}
}

export default function TranscriptPerformanceEnhancer(){
  const [open,setOpen]=useState(false);
  const [cues,setCues]=useState<Cue[]>([]);
  const [loading,setLoading]=useState(false);
  const [portalTarget,setPortalTarget]=useState<Element|null>(null);
  const transcriptRef=useRef<HTMLDivElement|null>(null);
  const activeRef=useRef(-1);
  const activeTimeRef=useRef<HTMLElement|null>(null);

  useEffect(()=>{
    const intercept=(event:MouseEvent)=>{
      const element=event.target as Element|null;
      const toggle=element?.closest(".transcript-toggle,.mobile-transcript-toggle");
      if(!toggle)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(value=>!value);
    };
    window.addEventListener("click",intercept,true);
    return()=>window.removeEventListener("click",intercept,true);
  },[]);

  useEffect(()=>{
    const target=document.querySelector(".watch-layout");
    setPortalTarget(target);
    if(!target)return;
    if(open){target.classList.add("transcript-open");target.classList.remove("player-only");}
    else{target.classList.remove("transcript-open");target.classList.add("player-only");}
    document.querySelectorAll<HTMLElement>(".transcript-toggle,.mobile-transcript-toggle").forEach(button=>{
      button.classList.toggle("active",open);
      button.setAttribute("aria-pressed",open?"true":"false");
      const label=button.querySelector("span:last-child");
      if(label&&button.classList.contains("transcript-toggle"))label.textContent=open?"Κλείσιμο κειμένου":"Κείμενο μεταγραφής";
    });
    return()=>{
      target.classList.remove("transcript-open");
      target.classList.add("player-only");
    };
  },[open]);

  useEffect(()=>{
    if(!open)return;
    const videoId=currentVideoId();
    if(!videoId)return;
    let cancelled=false;
    const cached=cachedCaptions(videoId);
    if(Array.isArray(cached?.cues)&&cached!.cues!.length)setCues(cached!.cues!);
    setLoading(!cached?.cues?.length);
    void fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store"})
      .then(async response=>response.ok?await response.json() as Captions:null)
      .then(record=>{if(!cancelled&&Array.isArray(record?.cues)){setCues(record!.cues!);setLoading(false);}})
      .catch(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[open]);

  useEffect(()=>{
    if(!open||!cues.length)return;
    const update=()=>{
      const seek=document.querySelector<HTMLInputElement>(".player-seek-bar");
      const time=Number(seek?.value)||0;
      const next=cueAt(cues,time);
      if(next===activeRef.current)return;
      const root=transcriptRef.current;
      const previous=activeRef.current;
      if(root){
        if(previous>=0)root.querySelector<HTMLElement>(`button[data-cue="${previous}"]`)?.classList.remove("active");
        const row=next>=0?root.querySelector<HTMLElement>(`button[data-cue="${next}"]`):null;
        row?.classList.remove("past");
        row?.classList.add("active");
        row?.scrollIntoView({block:"nearest"});
        // Only touch the delta range between previous and next active index —
        // never the full cue list — so this stays correct (and cheap) on
        // both forward and backward seeks.
        if(next>previous){
          for(let index=Math.max(previous,0);index<next;index+=1){
            root.querySelector<HTMLElement>(`button[data-cue="${index}"]`)?.classList.add("past");
          }
        }else if(next<previous){
          for(let index=Math.max(next+1,0);index<=previous;index+=1){
            root.querySelector<HTMLElement>(`button[data-cue="${index}"]`)?.classList.remove("past");
          }
        }
      }
      activeRef.current=next;
      if(activeTimeRef.current)activeTimeRef.current.textContent=next>=0?clock(cues[next]?.start||0):"0:00";
    };
    update();
    const timer=window.setInterval(update,250);
    return()=>window.clearInterval(timer);
  },[open,cues]);

  const rows=useMemo(()=>cues.map((cue,index)=><button key={`${cue.start}-${index}`} data-cue={index}><time>{clock(cue.start)}</time><span>{cue.text}</span><i aria-label="Αποθήκευση στιγμής">＋</i></button>),[cues]);

  if(!open||!portalTarget)return null;

  const click=(event:React.MouseEvent<HTMLDivElement>)=>{
    const element=event.target as Element;
    const row=element.closest<HTMLButtonElement>("button[data-cue]");
    if(!row)return;
    const index=Number(row.dataset.cue);
    const cue=cues[index];
    if(!cue)return;
    if(element.closest("i")){
      event.preventDefault();event.stopPropagation();
      row.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:event.clientX,clientY:event.clientY}));
      return;
    }
    const seek=document.querySelector<HTMLInputElement>(".player-seek-bar");
    if(!seek)return;
    seek.value=String(cue.start);
    seek.dispatchEvent(new Event("input",{bubbles:true}));
    seek.dispatchEvent(new Event("change",{bubbles:true}));
  };

  return createPortal(<aside className="side-panel transcript-drawer" data-gts-performance-transcript="1">
    <div className="drawer-header transcript-header"><div><small>ΕΛΛΗΝΙΚΟΙ ΥΠΟΤΙΤΛΟΙ</small><strong>Μεταγραφή</strong><span>{cues.length} σημεία · <b ref={activeTimeRef} style={{font:"inherit"}}>0:00</b></span></div><button aria-label="Κλείσιμο μεταγραφής" onClick={()=>setOpen(false)}>×</button></div>
    <div className="transcript" ref={transcriptRef} onClick={click}>{loading&&!cues.length?<div className="transcript-empty">Φόρτωση μεταγραφής…</div>:rows.length?rows:<div className="transcript-empty">Δεν υπάρχει αποθηκευμένη μεταγραφή.</div>}</div>
  </aside>,portalTarget);
}

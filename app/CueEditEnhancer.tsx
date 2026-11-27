"use client";
import {useEffect,useState} from "react";

type Cue={start?:number;duration?:number;text?:string};
type Track={origin?:string;events?:{text?:string;sourceIndices?:number[]}[]};
type Captions={transcriptVersion?:number;cues?:Cue[];subtitleTrack?:Track};
type Edit={videoId:string;cueIndex:number;version:number;expected:string;top:number;left:number;width:number};

function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function pausePlayer(){document.querySelector<HTMLButtonElement>('.gtp-play[aria-label="Παύση"],.play-toggle[aria-label="Παύση"]')?.click();}

/** Owner-only: double-click a Greek subtitle (on the video or in the transcript) to correct its wording. */
export default function CueEditEnhancer(){
  const [edit,setEdit]=useState<Edit|null>(null);
  const [text,setText]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    // The display event under the pointer: a transcript row, or the subtitle shown on the video (it ignores pointer events).
    const targetFor=(event:MouseEvent)=>{
      const row=(event.target as Element|null)?.closest<HTMLElement>(".transcript-event button[data-seek]");
      if(row)return {index:Number(row.dataset.seek),element:row};
      const overlay=document.querySelector<HTMLElement>(".subtitles[data-event]");
      if(!overlay)return null;
      const r=overlay.getBoundingClientRect();
      if(event.clientX<r.left-8||event.clientX>r.right+8||event.clientY<r.top-8||event.clientY>r.bottom+8)return null;
      return {index:Number(overlay.dataset.event),element:overlay};
    };
    const dblclick=async(event:MouseEvent)=>{
      const target=targetFor(event),videoId=currentVideoId();
      if(!target||!videoId||!Number.isInteger(target.index)||target.index<0)return;
      event.preventDefault();event.stopPropagation();
      const auth=await fetch("/api/admin-auth",{cache:"no-store",credentials:"same-origin"}).then(r=>r.ok?r.json():null).catch(()=>null) as {authorized?:boolean}|null;
      if(!auth?.authorized)return;
      pausePlayer();
      const rect=target.element.getBoundingClientRect();
      const response=await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}&includeEnglish=1&edit=${Date.now()}`,{cache:"no-store"}).catch(()=>null);
      const record=response?.ok?await response.json() as Captions:null;
      const events=record?.subtitleTrack?.origin==="authored"?record.subtitleTrack.events:undefined;
      const mapped=events?events[target.index]?.sourceIndices:[target.index];
      const cueIndex=mapped?.length===1?mapped[0]:-1;
      const expected=String(record?.cues?.[cueIndex]?.text||"");
      setText(expected);setBusy(false);
      setError(!record||!Number.isFinite(record.transcriptVersion)?"Δεν φορτώθηκαν οι υπότιτλοι. Δοκίμασε ξανά.":cueIndex<0||!expected?"Αυτός ο υπότιτλος δεν αλλάζει μόνος του.":"");
      setEdit({videoId,cueIndex,version:Number(record?.transcriptVersion),expected,top:rect.bottom+8,left:rect.left,width:rect.width});
    };
    const listener=(event:MouseEvent)=>{void dblclick(event);};
    document.addEventListener("dblclick",listener,true);
    return()=>document.removeEventListener("dblclick",listener,true);
  },[]);

  async function save(){
    if(!edit||busy||edit.cueIndex<0)return;
    const value=text.trim();
    if(!value){setError("Το κείμενο δεν μπορεί να είναι κενό.");return;}
    if(value===edit.expected){setEdit(null);return;}
    setBusy(true);setError("");
    const response=await fetch("/api/captions/cue",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:edit.videoId,transcriptVersion:edit.version,cueIndex:edit.cueIndex,text:value,expectedText:edit.expected})}).catch(()=>null);
    const result=await response?.json().catch(()=>({})) as {ok?:boolean;error?:string}|undefined;
    if(!response?.ok||!result?.ok){setError(result?.error||"Η αποθήκευση απέτυχε.");setBusy(false);return;}
    window.dispatchEvent(new CustomEvent("greektube:subtitle-track-updated",{detail:{videoId:edit.videoId}}));
    setBusy(false);setEdit(null);
  }

  if(!edit)return null;
  const width=Math.max(320,Math.min(edit.width,560));
  return <div role="dialog" aria-label="Διόρθωση ελληνικού υπότιτλου" onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} style={{position:"fixed",zIndex:10000,top:Math.max(8,Math.min(edit.top,window.innerHeight-200)),left:Math.max(8,Math.min(edit.left,window.innerWidth-width-8)),width:`min(${width}px, calc(100vw - 16px))`,padding:12,border:"1px solid rgba(143,127,240,.38)",borderRadius:12,background:"#15151a",boxShadow:"0 18px 60px rgba(0,0,0,.45)"}}>
    <textarea autoFocus value={text} disabled={busy||edit.cueIndex<0} aria-label="Κείμενο υπότιτλου" onChange={event=>{setText(event.target.value);setError("")}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();setEdit(null)}else if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void save();}}} style={{width:"100%",minHeight:76,resize:"vertical",border:"1px solid rgba(179,169,250,.55)",borderRadius:8,outline:"none",background:"rgba(255,255,255,.04)",color:"#f5f4fb",font:"inherit",fontSize:16,lineHeight:1.45,padding:"9px 10px"}}/>
    {error&&<div role="alert" style={{marginTop:6,color:"#ff8e86",fontSize:12}}>{error}</div>}
    <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button type="button" className="secondary compact" disabled={busy} onClick={()=>setEdit(null)}>Ακύρωση</button><button type="button" className="primary compact" disabled={busy||edit.cueIndex<0} onClick={()=>void save()}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></div>
  </div>;
}

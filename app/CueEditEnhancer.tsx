"use client";
import {useEffect,useRef,useState} from "react";

type Cue={start?:number;duration?:number;text?:string};
type Track={origin?:string;events?:{text?:string;sourceIndices?:number[]}[]};
type Captions={transcriptVersion?:number;cues?:Cue[];subtitleTrack?:Track};
type Edit={videoId:string;cueIndex:number;version:number;expected:string;start:number;duration:number};
type Target={index:number;element:HTMLElement};

function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function pausePlayer(){document.querySelector<HTMLButtonElement>('.gtp-play[aria-label="Παύση"],.play-toggle[aria-label="Παύση"]')?.click();}
function clock(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}

/** Owner-only: right-click (or double-click) a Greek subtitle on the video or in the transcript to correct its wording. */
export default function CueEditEnhancer(){
  const [edit,setEdit]=useState<Edit|null>(null);
  const [text,setText]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const allowedRef=useRef(false);
  const openRef=useRef<(target:Target)=>void>(()=>{});

  useEffect(()=>{
    let cancelled=false;
    fetch("/api/admin-auth",{cache:"no-store",credentials:"same-origin"})
      .then(r=>r.ok?r.json():null).catch(()=>null)
      .then(auth=>{if(!cancelled)allowedRef.current=Boolean((auth as {authorized?:boolean}|null)?.authorized);});
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    // The display event under the pointer: a transcript row, or the subtitle shown on the video (it ignores pointer events).
    const targetFor=(event:MouseEvent):Target|null=>{
      const row=(event.target as Element|null)?.closest<HTMLElement>(".transcript-event button[data-seek]");
      if(row)return {index:Number(row.dataset.seek),element:row};
      const overlay=document.querySelector<HTMLElement>(".subtitles[data-event]");
      if(!overlay)return null;
      const r=overlay.getBoundingClientRect();
      if(event.clientX<r.left-8||event.clientX>r.right+8||event.clientY<r.top-8||event.clientY>r.bottom+8)return null;
      return {index:Number(overlay.dataset.event),element:overlay};
    };
    const openEdit=async(target:Target)=>{
      const videoId=currentVideoId();
      if(!videoId||!Number.isInteger(target.index)||target.index<0)return;
      pausePlayer();
      const response=await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}&includeEnglish=1&edit=${Date.now()}`,{cache:"no-store"}).catch(()=>null);
      const record=response?.ok?await response.json() as Captions:null;
      const events=record?.subtitleTrack?.origin==="authored"?record.subtitleTrack.events:undefined;
      const mapped=events?events[target.index]?.sourceIndices:[target.index];
      const cueIndex=mapped?.length===1?mapped[0]:-1;
      const cue=record?.cues?.[cueIndex];
      const expected=String(cue?.text||"");
      setText(expected);setBusy(false);
      setError(!record||!Number.isFinite(record.transcriptVersion)?"Δεν φορτώθηκαν οι υπότιτλοι. Δοκίμασε ξανά.":cueIndex<0||!expected?"Αυτός ο υπότιτλος δεν αλλάζει μόνος του.":"");
      setEdit({videoId,cueIndex,version:Number(record?.transcriptVersion),expected,start:Number(cue?.start||0),duration:Number(cue?.duration||0)});
    };
    openRef.current=target=>{void openEdit(target);};
    const onDoubleClick=(event:MouseEvent)=>{
      if(!allowedRef.current)return;
      const target=targetFor(event);
      if(!target)return;
      event.preventDefault();event.stopPropagation();
      openRef.current(target);
    };
    // Capture phase: for the owner the subtitle right-click opens the correction instead of the save-moment menu.
    // Everyone else gets the normal browser menu, because the handler returns before preventDefault.
    const onContextMenu=(event:MouseEvent)=>{
      if(!allowedRef.current)return;
      const target=targetFor(event);
      if(!target)return;
      event.preventDefault();event.stopPropagation();
      openRef.current(target);
    };
    document.addEventListener("dblclick",onDoubleClick,true);
    document.addEventListener("contextmenu",onContextMenu,true);
    return()=>{
      document.removeEventListener("dblclick",onDoubleClick,true);
      document.removeEventListener("contextmenu",onContextMenu,true);
    };
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
  const canSave=!busy&&edit.cueIndex>=0&&text.trim().length>0;
  const cps=edit.duration>0?(text.length/edit.duration).toFixed(1):"";
  return <div className="cue-edit-backdrop" onMouseDown={()=>setEdit(null)}>
    <div role="dialog" aria-modal="true" aria-label="Διόρθωση ελληνικού υπότιτλου" className="cue-edit-card" onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>
      <header className="cue-edit-head">
        <div>
          <p className="cue-edit-kicker">Διόρθωση υπότιτλου</p>
          <h2 className="cue-edit-title">Ελληνικός υπότιτλος</h2>
        </div>
        <button type="button" className="cue-edit-close" aria-label="Κλείσιμο" onClick={()=>setEdit(null)}>×</button>
      </header>
      <div className="cue-edit-meta">
        <span className="cue-edit-chip">{clock(edit.start)} – {clock(edit.start+edit.duration)}</span>
        {cps&&<span className="cue-edit-chip cps">{cps} χαρ./δευτ.</span>}
      </div>
      <textarea className="cue-edit-area" autoFocus value={text} disabled={busy||edit.cueIndex<0} aria-label="Κείμενο υπότιτλου"
        onChange={event=>{setText(event.target.value);setError("")}}
        onKeyDown={event=>{
          if(event.key==="Escape"){event.preventDefault();setEdit(null);}
          else if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void save();}
        }}/>
      {error&&<p role="alert" className="cue-edit-error">{error}</p>}
      <footer className="cue-edit-foot">
        <span className="cue-edit-count">{text.length} χαρακτήρες · Enter για αποθήκευση</span>
        <div className="cue-edit-actions">
          <button type="button" className="cue-edit-btn ghost" disabled={busy} onClick={()=>setEdit(null)}>Ακύρωση</button>
          <button type="button" className="cue-edit-btn solid" disabled={!canSave} onClick={()=>void save()}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button>
        </div>
      </footer>
    </div>
  </div>;
}

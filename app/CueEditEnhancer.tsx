"use client";
import {useEffect,useRef,useState} from "react";

type Cue={start?:number;duration?:number;text?:string};
type Captions={transcriptVersion?:number;cues?:Cue[]};
type Edit={videoId:string;index:number;version:number;expected:string;top:number;left:number;width:number;record:Captions};
type Override={videoId:string;index:number;text:string};

function pausePlayer(){
  document.querySelector<HTMLButtonElement>('.play-toggle[aria-label="Παύση"]')?.click();
}

function patchVisibleCue(override:Override){
  const row=document.querySelector<HTMLElement>(`.transcript>button[data-cue="${override.index}"]`);
  const span=row?.querySelector<HTMLElement>(":scope>span");
  if(span&&span.textContent!==override.text)span.textContent=override.text;
  const active=document.querySelector<HTMLElement>(".transcript>button.active[data-cue]");
  if(Number(active?.dataset.cue)!==override.index)return;
  const subtitle=document.querySelector<HTMLElement>(".subtitles");
  if(!subtitle)return;
  const greek=subtitle.querySelector<HTMLElement>(":scope>span");
  if(greek){if(greek.textContent!==override.text)greek.textContent=override.text;}
  else if(subtitle.textContent!==override.text)subtitle.textContent=override.text;
}

export default function CueEditEnhancer(){
  const [edit,setEdit]=useState<Edit|null>(null);
  const [text,setText]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const clickTimer=useRef<number|undefined>(undefined);
  const override=useRef<Override|null>(null);

  useEffect(()=>{
    let active=true;
    void fetch("/api/admin-auth",{cache:"no-store"}).then(async response=>{
      if(!response.ok)return;
      const result=await response.json().catch(()=>({})) as {authorized?:boolean};
      if(active)setAuthorized(result.authorized===true);
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!authorized)return;
    const targetFor=(event:Event)=>{
      const span=(event.target as Element|null)?.closest(".transcript>button[data-cue]>span") as HTMLElement|null;
      const row=span?.closest("button[data-cue]") as HTMLElement|null;
      const index=Number(row?.dataset.cue);
      if(!span||!row||!Number.isInteger(index)||index<0)return null;
      return {span,row,index};
    };
    const openEditor=async(event:Event)=>{
      const target=targetFor(event);
      const videoId=new URLSearchParams(location.search).get("video")||"";
      if(!target||!videoId)return;
      event.preventDefault();event.stopPropagation();
      if(clickTimer.current)window.clearTimeout(clickTimer.current);
      pausePlayer();
      const response=await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}&edit=${Date.now()}`,{cache:"no-store"});
      if(!response.ok)return;
      const record=await response.json() as Captions;
      const expected=String(record.cues?.[target.index]?.text||target.span.textContent||"");
      if(!expected||!Number.isFinite(record.transcriptVersion))return;
      const rect=target.row.getBoundingClientRect();
      setText(expected);setError("");
      setEdit({videoId,index:target.index,version:Number(record.transcriptVersion),expected,top:rect.top,left:rect.left,width:rect.width,record});
    };
    const click=(event:MouseEvent)=>{
      const target=targetFor(event);
      if(!target)return;
      event.preventDefault();event.stopPropagation();
      if(event.detail>1)return;
      if(clickTimer.current)window.clearTimeout(clickTimer.current);
      clickTimer.current=window.setTimeout(()=>target.row.click(),230);
    };
    const dblclick=(event:MouseEvent)=>{void openEditor(event);};
    const contextmenu=(event:MouseEvent)=>{void openEditor(event);};
    document.addEventListener("click",click,true);
    document.addEventListener("dblclick",dblclick,true);
    document.addEventListener("contextmenu",contextmenu,true);
    return()=>{
      document.removeEventListener("click",click,true);
      document.removeEventListener("dblclick",dblclick,true);
      document.removeEventListener("contextmenu",contextmenu,true);
      if(clickTimer.current)window.clearTimeout(clickTimer.current);
    };
  },[authorized]);

  useEffect(()=>{
    const observer=new MutationObserver(()=>{if(override.current)patchVisibleCue(override.current)});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class"]});
    return()=>observer.disconnect();
  },[]);

  async function save(){
    if(!edit||busy)return;
    const value=text.trim();
    if(!value){setError("Το κείμενο δεν μπορεί να είναι κενό.");return;}
    setBusy(true);setError("");
    const response=await fetch("/api/captions/cue",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:edit.videoId,transcriptVersion:edit.version,cueIndex:edit.index,text:value,expectedText:edit.expected})});
    const result=await response.json().catch(()=>({})) as {ok?:boolean;error?:string};
    if(!response.ok||!result.ok){setError(result.error||"Η αποθήκευση απέτυχε.");setBusy(false);return;}
    const updated:Override={videoId:edit.videoId,index:edit.index,text:value};
    override.current=updated;
    patchVisibleCue(updated);
    const cues=Array.isArray(edit.record.cues)?edit.record.cues.slice():[];
    if(cues[edit.index])cues[edit.index]={...cues[edit.index],text:value};
    try{localStorage.setItem(`greektube-transcript:${edit.videoId}:v12`,JSON.stringify({...edit.record,cues}));}catch{}
    setBusy(false);setEdit(null);
  }

  if(!edit)return null;
  return <div role="dialog" aria-label="Επεξεργασία ελληνικού υποτίτλου" onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onContextMenu={event=>event.stopPropagation()} style={{position:"fixed",zIndex:10000,top:Math.max(8,Math.min(edit.top,window.innerHeight-180)),left:Math.max(8,Math.min(edit.left,window.innerWidth-Math.max(300,edit.width)-8)),width:`min(${Math.max(300,edit.width)}px, calc(100vw - 16px))`,padding:10,border:"1px solid rgba(143,127,240,.38)",borderRadius:10,background:"#15151a",boxShadow:"0 18px 60px rgba(0,0,0,.45)"}}><textarea autoFocus value={text} disabled={busy} onChange={event=>{setText(event.target.value);setError("")}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();setEdit(null)}else if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void save();}}} style={{width:"100%",minHeight:76,resize:"vertical",border:"1px solid rgba(179,169,250,.55)",borderRadius:8,outline:"none",background:"rgba(255,255,255,.04)",color:"#f5f4fb",font:"inherit",lineHeight:1.45,padding:"9px 10px"}}/>{error&&<div style={{marginTop:6,color:"#ff8e86",fontSize:11}}>{error}</div>}<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button type="button" disabled={busy} onClick={()=>setEdit(null)}>Ακύρωση</button><button type="button" disabled={busy} onClick={()=>void save()}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></div></div>;
}

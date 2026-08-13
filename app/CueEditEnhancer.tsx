"use client";
import {useEffect,useState} from "react";

type Edit={videoId:string;index:number;version:number;expected:string;top:number;left:number;width:number};

function parseClock(value:string){
  const parts=value.trim().split(":").map(Number);
  if(parts.some(part=>!Number.isFinite(part)))return 0;
  if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];
  if(parts.length===2)return parts[0]*60+parts[1];
  return parts[0]||0;
}

export default function CueEditEnhancer(){
  const [edit,setEdit]=useState<Edit|null>(null);
  const [text,setText]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const handler=async(e:MouseEvent)=>{
      const span=(e.target as Element|null)?.closest(".transcript>button[data-cue]>span");
      const row=span?.closest("button[data-cue]") as HTMLElement|null;
      const videoId=new URLSearchParams(location.search).get("video")||"";
      const index=Number(row?.dataset.cue);
      if(!span||!row||!videoId||!Number.isInteger(index)||index<0)return;

      const auth=await fetch("/api/admin-auth",{cache:"no-store"}).catch(()=>null);
      if(!auth?.ok)return;
      const authResult=await auth.json().catch(()=>({})) as {authorized?:boolean};
      if(authResult.authorized!==true)return;

      e.preventDefault();e.stopPropagation();
      const r=await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store"});
      if(!r.ok)return;
      const j=await r.json() as {transcriptVersion?:number;cues?:Array<{text?:string}>};
      const expected=String(j.cues?.[index]?.text||"");
      if(!expected||!Number.isFinite(j.transcriptVersion))return;
      const rect=row.getBoundingClientRect();
      setText(expected);setError("");setEdit({videoId,index,version:Number(j.transcriptVersion),expected,top:rect.top,left:rect.left,width:rect.width});
    };
    document.addEventListener("dblclick",handler,true);
    return()=>document.removeEventListener("dblclick",handler,true);
  },[]);

  async function save(){
    if(!edit||busy)return;
    const value=text.trim();
    if(!value){setError("Το κείμενο δεν μπορεί να είναι κενό.");return;}
    setBusy(true);setError("");
    const r=await fetch("/api/captions/cue",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:edit.videoId,transcriptVersion:edit.version,cueIndex:edit.index,text:value,expectedText:edit.expected})});
    const j=await r.json().catch(()=>({})) as {ok?:boolean;error?:string};
    if(!r.ok||!j.ok){setError(j.error||"Η αποθήκευση απέτυχε.");setBusy(false);return;}

    const params=new URLSearchParams(location.search);
    const current=document.querySelector(".player-time-label")?.textContent?.split("/")[0]||"";
    const seconds=parseClock(current);
    if(seconds>0)params.set("t",String(Math.floor(seconds)));
    history.replaceState(null,"",`${location.pathname}?${params.toString()}`);
    location.reload();
  }

  if(!edit)return null;
  return <div role="dialog" aria-label="Επεξεργασία ελληνικού υποτίτλου" style={{position:"fixed",zIndex:10000,top:Math.max(8,edit.top),left:Math.max(8,edit.left),width:`min(${Math.max(300,edit.width)}px, calc(100vw - 16px))`,padding:10,border:"1px solid rgba(143,127,240,.38)",borderRadius:10,background:"#15151a",boxShadow:"0 18px 60px rgba(0,0,0,.45)"}}><textarea autoFocus value={text} disabled={busy} onChange={e=>{setText(e.target.value);setError("")}} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();setEdit(null)}else if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void save();}}} style={{width:"100%",minHeight:76,resize:"vertical",border:"1px solid rgba(179,169,250,.55)",borderRadius:8,outline:"none",background:"rgba(255,255,255,.04)",color:"#f5f4fb",font:"inherit",lineHeight:1.45,padding:"9px 10px"}}/>{error&&<div style={{marginTop:6,color:"#ff8e86",fontSize:11}}>{error}</div>}<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button type="button" disabled={busy} onClick={()=>setEdit(null)}>Ακύρωση</button><button type="button" disabled={busy} onClick={()=>void save()}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></div></div>;
}

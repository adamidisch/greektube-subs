"use client";
import {useEffect,useState} from "react";

type Edit={videoId:string;index:number;version:number;expected:string};

export default function CueEditEnhancer(){
  const [allowed,setAllowed]=useState(false);
  const [edit,setEdit]=useState<Edit|null>(null);
  const [text,setText]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{void fetch("/api/admin-auth",{cache:"no-store"}).then(async r=>{const j=await r.json().catch(()=>({}));setAllowed(r.ok&&j.authorized===true)}).catch(()=>setAllowed(false));},[]);
  useEffect(()=>{
    if(!allowed)return;
    const handler=async(e:MouseEvent)=>{
      const span=(e.target as Element|null)?.closest(".transcript>button[data-cue]>span");
      const row=span?.closest("button[data-cue]") as HTMLElement|null;
      const videoId=new URLSearchParams(location.search).get("video")||"";
      const index=Number(row?.dataset.cue);
      if(!span||!row||!videoId||!Number.isInteger(index))return;
      e.preventDefault();e.stopPropagation();
      const r=await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store"});
      if(!r.ok)return;
      const j=await r.json() as {transcriptVersion?:number;cues?:Array<{text?:string}>};
      const expected=String(j.cues?.[index]?.text||"");
      if(!expected||!Number.isFinite(j.transcriptVersion))return;
      setText(expected);setError("");setEdit({videoId,index,version:Number(j.transcriptVersion),expected});
    };
    document.addEventListener("dblclick",handler,true);
    return()=>document.removeEventListener("dblclick",handler,true);
  },[allowed]);

  async function save(){
    if(!edit||busy)return;const value=text.trim();if(!value){setError("Το κείμενο δεν μπορεί να είναι κενό.");return;}
    setBusy(true);setError("");
    const r=await fetch("/api/captions/cue",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:edit.videoId,transcriptVersion:edit.version,cueIndex:edit.index,text:value,expectedText:edit.expected})});
    const j=await r.json().catch(()=>({})) as {ok?:boolean;error?:string};
    if(!r.ok||!j.ok){setError(j.error||"Η αποθήκευση απέτυχε.");setBusy(false);return;}
    location.reload();
  }

  if(!edit)return null;
  return <div style={{position:"fixed",zIndex:10000,inset:"20% 20px auto",maxWidth:760,margin:"auto",padding:12,borderRadius:12,background:"#15151a",boxShadow:"0 20px 70px #0008"}}><textarea autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setEdit(null);else if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void save();}}} style={{width:"100%",minHeight:90,padding:10,borderRadius:8,background:"#202027",color:"white"}}/>{error&&<p>{error}</p>}<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}><button onClick={()=>setEdit(null)} disabled={busy}>Ακύρωση</button><button onClick={()=>void save()} disabled={busy}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></div></div>;
}

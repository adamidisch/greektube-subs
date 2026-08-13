"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";

type SkipRange={start:number;end:number};
type VideoRecord={id?:unknown;skipRanges?:unknown;[key:string]:unknown};
type AppState={videos?:VideoRecord[];[key:string]:unknown};

function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function clock(seconds:number){
  const safe=Math.max(0,Math.floor(Number(seconds)||0));
  const h=Math.floor(safe/3600),m=Math.floor((safe%3600)/60),s=safe%60;
  return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
}
function normalizeRanges(input:unknown):SkipRange[]{
  if(!Array.isArray(input))return [];
  const ranges=input.map(item=>{
    const value=item as {start?:unknown;end?:unknown};
    return {start:Number(value?.start),end:Number(value?.end)};
  }).filter(range=>Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end>range.start+.15)
    .sort((a,b)=>a.start-b.start);
  const merged:SkipRange[]=[];
  for(const range of ranges){
    const last=merged[merged.length-1];
    if(last&&range.start<=last.end+.05)last.end=Math.max(last.end,range.end);
    else merged.push({...range});
  }
  return merged;
}
function seekBar(){return document.querySelector<HTMLInputElement>(".player-seek-bar");}
function currentTime(){return Number(seekBar()?.value||0);}
function seekTo(seconds:number){
  const input=seekBar();
  if(!input)return;
  const max=Number(input.max||0);
  const target=Math.max(0,max>0?Math.min(max,seconds):seconds);
  const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");
  descriptor?.set?.call(input,String(target));
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
}
async function fetchState():Promise<AppState|null>{
  try{
    const response=await fetch("/api/state",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)return null;
    const result=await response.json() as {state?:AppState};
    return result.state||null;
  }catch{return null;}
}

export default function SkipRangesEnhancer(){
  const [videoId,setVideoId]=useState("");
  const [ranges,setRanges]=useState<SkipRange[]>([]);
  const [authorized,setAuthorized]=useState(false);
  const [open,setOpen]=useState(false);
  const [draftStart,setDraftStart]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [portalTarget,setPortalTarget]=useState<Element|null>(null);
  const lastJump=useRef<{at:number;target:number}>({at:0,target:-1});

  const totalSkipped=useMemo(()=>ranges.reduce((sum,range)=>sum+(range.end-range.start),0),[ranges]);

  useEffect(()=>{
    let cancelled=false;
    const syncVideo=async()=>{
      const next=currentVideoId();
      if(next===videoId)return;
      setVideoId(next);setOpen(false);setDraftStart(null);setMessage("");
      if(!next){setRanges([]);return;}
      const state=await fetchState();
      if(cancelled)return;
      const video=state?.videos?.find(item=>String(item.id||"")===next);
      setRanges(normalizeRanges(video?.skipRanges));
    };
    void syncVideo();
    const timer=window.setInterval(()=>void syncVideo(),500);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[videoId]);

  useEffect(()=>{
    let cancelled=false;
    const auth=()=>void fetch("/api/admin-auth",{cache:"no-store",credentials:"same-origin"}).then(async response=>{
      const result=await response.json().catch(()=>({})) as {authorized?:boolean};
      if(!cancelled)setAuthorized(response.ok&&result.authorized===true);
    }).catch(()=>{if(!cancelled)setAuthorized(false);});
    auth();const timer=window.setInterval(auth,3000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[]);

  useEffect(()=>{
    const syncTarget=()=>setPortalTarget(document.querySelector(".heading-actions")||document.querySelector(".player-secondary-actions"));
    syncTarget();
    const observer=new MutationObserver(syncTarget);
    observer.observe(document.body,{subtree:true,childList:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!videoId||!ranges.length)return;
    const timer=window.setInterval(()=>{
      const now=currentTime();
      if(!Number.isFinite(now))return;
      const range=ranges.find(item=>now>=item.start-.06&&now<item.end-.08);
      if(!range)return;
      const recent=Date.now()-lastJump.current.at<900&&Math.abs(lastJump.current.target-range.end)<.2;
      if(recent)return;
      lastJump.current={at:Date.now(),target:range.end};
      seekTo(range.end);
    },120);
    return()=>window.clearInterval(timer);
  },[videoId,ranges]);

  async function reloadRanges(){
    const state=await fetchState();
    const video=state?.videos?.find(item=>String(item.id||"")===videoId);
    setRanges(normalizeRanges(video?.skipRanges));
  }

  function markStart(){
    const now=currentTime();
    if(!Number.isFinite(now))return;
    setDraftStart(now);setMessage(`Αρχή: ${clock(now)}`);
  }
  function markEnd(){
    const end=currentTime();
    if(draftStart===null){setMessage("Πάτησε πρώτα «Από τρέχον σημείο».");return;}
    if(!Number.isFinite(end)||end<=draftStart+.15){setMessage("Το τέλος πρέπει να είναι μετά την αρχή.");return;}
    setRanges(current=>normalizeRanges([...current,{start:draftStart,end}]));
    setDraftStart(null);setMessage(`Προστέθηκε παράλειψη ${clock(draftStart)} → ${clock(end)}.`);
  }
  async function save(){
    if(!videoId||busy)return;
    setBusy(true);setMessage("Αποθήκευση…");
    try{
      const state=await fetchState();
      if(!state?.videos)throw new Error("state");
      const videos=state.videos.map(video=>String(video.id||"")===videoId?{...video,skipRanges:normalizeRanges(ranges)}:video);
      const response=await fetch("/api/state",{method:"PUT",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json","X-GreekTube-Shared-Write":"1"},body:JSON.stringify({...state,videos})});
      const result=await response.json().catch(()=>({})) as {ok?:boolean;sharedSaved?:boolean;error?:string};
      if(!response.ok||!result.ok||!result.sharedSaved)throw new Error(result.error||"save");
      await reloadRanges();setMessage("Οι παραλείψεις αποθηκεύτηκαν.");
    }catch(problem){setMessage(problem instanceof Error&&problem.message!=="save"&&problem.message!=="state"?problem.message:"Δεν αποθηκεύτηκαν οι παραλείψεις.");}
    finally{setBusy(false);}
  }

  if(!videoId)return <style jsx global>{styles}</style>;

  return <>
    {authorized&&portalTarget&&createPortal(<button type="button" className="skip-editor-trigger" onClick={event=>{event.preventDefault();event.stopPropagation();setOpen(true);}}><span aria-hidden="true">✂</span> Παραλείψεις{ranges.length>0&&<b>{ranges.length}</b>}</button>,portalTarget)}
    {authorized&&open&&createPortal(<div className="skip-editor-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false)}}>
      <section className="skip-editor-modal" role="dialog" aria-modal="true" aria-label="Παραλείψεις βίντεο">
        <header><div><small>NON-DESTRUCTIVE EDIT</small><h2>Παραλείψεις βίντεο</h2></div><button type="button" aria-label="Κλείσιμο" onClick={()=>setOpen(false)}>×</button></header>
        <p className="skip-editor-help">Το original video και τα timestamps δεν αλλάζουν. Όταν η αναπαραγωγή φτάσει σε αποθηκευμένο range, συνεχίζει αυτόματα από το τέλος του.</p>
        <div className="skip-editor-current"><span>Τρέχον σημείο</span><strong>{clock(currentTime())}</strong></div>
        <div className="skip-editor-markers">
          <button type="button" className={draftStart!==null?"active":""} onClick={markStart}><small>ΑΠΟ</small><span>Από τρέχον σημείο</span>{draftStart!==null&&<b>{clock(draftStart)}</b>}</button>
          <button type="button" onClick={markEnd}><small>ΜΕΧΡΙ</small><span>Μέχρι τρέχον σημείο</span></button>
        </div>
        <div className="skip-editor-list">
          {ranges.length===0?<p className="skip-editor-empty">Δεν υπάρχουν ακόμη περιοχές παράλειψης.</p>:ranges.map((range,index)=><div className="skip-editor-range" key={`${range.start}-${range.end}-${index}`}>
            <button type="button" className="skip-editor-seek" onClick={()=>seekTo(range.start)}><strong>{clock(range.start)} → {clock(range.end)}</strong><small>Παράλειψη {clock(range.end-range.start)}</small></button>
            <button type="button" className="skip-editor-remove" aria-label="Αφαίρεση παράλειψης" onClick={()=>setRanges(current=>current.filter((_,itemIndex)=>itemIndex!==index))}>×</button>
          </div>)}
        </div>
        <div className="skip-editor-summary"><span>{ranges.length} ranges</span><span>Σύνολο παράλειψης {clock(totalSkipped)}</span></div>
        {message&&<p className="skip-editor-message" role="status">{message}</p>}
        <footer><button type="button" className="secondary" disabled={busy} onClick={()=>setOpen(false)}>Ακύρωση</button><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></footer>
      </section>
    </div>,document.body)}
    <style jsx global>{styles}</style>
  </>;
}

const styles=`
.skip-editor-trigger{display:inline-flex!important;align-items:center!important;gap:7px!important;position:relative!important;min-height:36px!important;padding:0 11px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:10px!important;background:transparent!important;color:inherit!important;font:inherit!important;cursor:pointer!important}
.skip-editor-trigger:hover{background:rgba(255,255,255,.05)!important}
.skip-editor-trigger b{min-width:18px;height:18px;display:grid;place-items:center;border-radius:99px;background:rgba(184,134,63,.18);color:#d7a95e;font-size:10px}
.skip-editor-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:18px;background:rgba(3,5,7,.72);backdrop-filter:blur(10px)}
.skip-editor-modal{width:min(560px,100%);max-height:min(760px,92svh);overflow:auto;padding:20px;border:1px solid rgba(255,255,255,.13);border-radius:20px;background:#14171d;color:#f6f3ec;box-shadow:0 28px 90px rgba(0,0,0,.5)}
.skip-editor-modal>header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.skip-editor-modal>header small{display:block;margin-bottom:4px;color:#b8863f;font-size:9px;font-weight:750;letter-spacing:.1em}.skip-editor-modal h2{margin:0;font-size:20px}.skip-editor-modal>header>button{width:34px;height:34px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.04);color:inherit;font-size:20px}
.skip-editor-help{margin:14px 0;color:#9ba0aa;font-size:12px;line-height:1.5}.skip-editor-current{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);font-size:12px}.skip-editor-current strong{font-variant-numeric:tabular-nums}
.skip-editor-markers{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.skip-editor-markers button{min-height:72px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.035);color:inherit;text-align:left}.skip-editor-markers button.active{border-color:rgba(184,134,63,.5);background:rgba(184,134,63,.1)}.skip-editor-markers small{color:#b8863f;font-size:9px;font-weight:750;letter-spacing:.08em}.skip-editor-markers span{font-size:12.5px;font-weight:650}.skip-editor-markers b{font-size:11px;color:#d7a95e}
.skip-editor-list{display:grid;gap:8px;margin-top:14px}.skip-editor-empty{margin:0;padding:18px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#8b9099;text-align:center;font-size:12px}.skip-editor-range{display:grid;grid-template-columns:1fr 38px;gap:8px}.skip-editor-seek{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;border:1px solid rgba(184,134,63,.24);border-radius:11px;background:rgba(184,134,63,.07);color:inherit;text-align:left}.skip-editor-seek strong{font-size:12.5px;font-variant-numeric:tabular-nums}.skip-editor-seek small{color:#a5a9b1;font-size:10.5px}.skip-editor-remove{border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.04);color:#b8bbc2;font-size:18px}.skip-editor-summary{display:flex;justify-content:space-between;gap:12px;margin-top:12px;color:#8b9099;font-size:10.5px}.skip-editor-message{margin:12px 0 0;color:#d7a95e;font-size:11.5px}.skip-editor-modal>footer{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.skip-editor-modal>footer button{min-height:40px;padding:0 15px;border-radius:11px;font-weight:650}.skip-editor-modal>footer .secondary{border:1px solid rgba(255,255,255,.12);background:transparent;color:inherit}.skip-editor-modal>footer .primary{border:1px solid rgba(124,116,224,.45);background:#7c74e0;color:#fff}
html[data-theme="light"] .skip-editor-modal{border-color:rgba(34,45,24,.12);background:#fff;color:#1c2116;box-shadow:0 28px 90px rgba(34,45,24,.18)}html[data-theme="light"] .skip-editor-help,html[data-theme="light"] .skip-editor-summary{color:#5e6656}html[data-theme="light"] .skip-editor-current,html[data-theme="light"] .skip-editor-markers button{border-color:rgba(34,45,24,.12);background:#f7f9f1}html[data-theme="light"] .skip-editor-modal>footer .primary{border-color:#2f6b4f;background:linear-gradient(150deg,#3d8563,#1f4f38)}
@media(max-width:620px){.skip-editor-backdrop{padding:10px;align-items:end}.skip-editor-modal{max-height:90svh;border-radius:18px 18px 12px 12px;padding:16px}.skip-editor-markers{grid-template-columns:1fr}.skip-editor-seek{align-items:flex-start;flex-direction:column;gap:3px}.skip-editor-trigger{font-size:0!important;width:36px!important;padding:0!important;justify-content:center!important}.skip-editor-trigger span{font-size:15px}.skip-editor-trigger b{position:absolute;right:-5px;top:-5px}}
`;

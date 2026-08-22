"use client";

import {useEffect,useMemo,useRef,useState,type CSSProperties} from "react";
import {createPortal} from "react-dom";
import OwnerTranslationPanel from "./OwnerTranslationPanel";

type SkipRange={start:number;end:number};
type EditorVideo={
  id:string;title:string;originalTitle?:string;speakerName?:string;speakerRole?:string;channel?:string;channelUrl?:string;
  originalVideoUrl?:string;url?:string;category?:string;tags?:string[];description?:string;duration?:number;metadataVersion?:number;skipRanges?:SkipRange[];
};
type MetadataDraft={title:string;originalTitle:string;speakerName:string;speakerRole:string;channel:string;channelUrl:string;originalVideoUrl:string;category:string;tags:string[];description:string};
type Cue={start:number;duration:number;text:string};
type EditorCaptions={videoId:string;cues:Cue[];duration?:number;transcriptVersion?:number};
type PlayerLike={destroy:()=>void;playVideo:()=>void;pauseVideo:()=>void;getPlayerState:()=>number;getCurrentTime:()=>number;getDuration:()=>number;seekTo:(seconds:number,allow:boolean)=>void;getOptions?:()=>string[];unloadModule?:(module:string)=>void};

const CATEGORIES=[
  ["Medical","Ιατρικά"],["Tech","Τεχνολογία"],["Podcasts","Συζητήσεις"],["Comedy","Κωμωδία"],["Education","Εκπαίδευση"],["Documentaries","Ντοκιμαντέρ"],["Other","Άλλα"],
] as const;

function clock(seconds:number,precise=false){
  const safe=Math.max(0,Number(seconds)||0),whole=Math.floor(safe),h=Math.floor(whole/3600),m=Math.floor((whole%3600)/60),s=whole%60;
  const base=h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
  return precise?`${base}.${Math.floor((safe-whole)*10)}`:base;
}
function rangesFrom(input:unknown):SkipRange[]{
  if(!Array.isArray(input))return [];
  return input.map(item=>({start:Number((item as SkipRange).start),end:Number((item as SkipRange).end)})).filter(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)).sort((a,b)=>a.start-b.start);
}
function metadataFrom(video:EditorVideo):MetadataDraft{
  return {title:video.title||"",originalTitle:video.originalTitle||"",speakerName:video.speakerName||"",speakerRole:video.speakerRole||"",channel:video.channel||"",channelUrl:video.channelUrl||"",originalVideoUrl:video.originalVideoUrl||video.url||`https://www.youtube.com/watch?v=${video.id}`,category:video.category||"Other",tags:Array.isArray(video.tags)?video.tags:[],description:video.description||""};
}
function snapshotOf(metadata:MetadataDraft,ranges:SkipRange[]){return JSON.stringify({metadata,ranges});}
function activeCueIndex(cues:Cue[],time:number){let result=-1;for(let index=0;index<cues.length;index+=1){if(cues[index].start<=time)result=index;else break;}return result;}
function subtitleFrames(text:string,maxLineCharacters=42){
  const clean=text.replace(/\s+/g," ").trim();if(!clean)return [];
  const lines:string[]=[];let line="";
  for(const word of clean.split(" ")){const next=line?`${line} ${word}`:word;if(line&&next.length>maxLineCharacters){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  return lines.flatMap((_,index)=>index%2===0?[lines.slice(index,index+2).join("\n")]:[]);
}
function subtitleWindow(cue:Cue|undefined,currentTime:number,nextCue?:Cue){
  if(!cue)return "";const frames=subtitleFrames(cue.text);if(frames.length<=1)return frames[0]||"";
  const boundary=nextCue&&nextCue.start>cue.start?nextCue.start-cue.start:cue.duration;
  const duration=Math.max(.1,Math.min(cue.duration,boundary));const elapsed=Math.max(0,Math.min(duration-.001,currentTime-cue.start));
  const minReadable=duration>=frames.length*1.35?1.35:duration/frames.length;const remaining=Math.max(0,duration-minReadable*frames.length);
  const weights=frames.map(frame=>Math.max(1,frame.replace(/\s/g,"").length));const total=weights.reduce((sum,weight)=>sum+weight,0)||1;let end=0;
  for(let index=0;index<frames.length;index+=1){end+=minReadable+(remaining*weights[index]/total);if(elapsed<end||index===frames.length-1)return frames[index];}
  return frames[frames.length-1];
}
function isVerifiedGreekCaptions(data:EditorCaptions|null|undefined,duration=0){
  if(!data?.cues?.length||data.transcriptVersion!==12)return false;
  let latestStart=-Infinity;
  const valid=data.cues.length>=3&&data.cues.every(cue=>{if(!Number.isFinite(cue.start)||cue.start<0||!Number.isFinite(cue.duration)||cue.duration<=0||!cue.text.trim()||cue.start<latestStart-5)return false;latestStart=Math.max(latestStart,cue.start);return true;});
  if(!valid)return false;
  const sample=data.cues.slice(0,120).map(cue=>cue.text).join(" ");const letters=sample.match(/\p{L}/gu)?.length||0;const greek=sample.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length||0;
  if(!letters||greek/letters<=.22)return false;
  const fullDuration=duration||data.duration||0;
  if(fullDuration){const last=data.cues.reduce((max,cue)=>Math.max(max,cue.start+cue.duration),0);if(data.cues[0].start>Math.max(90,fullDuration*.1)||(last<fullDuration*.82&&fullDuration-last>180))return false;}
  return true;
}
function videoIdFromButton(button:HTMLElement){
  const current=new URLSearchParams(location.search).get("video")||"";
  if(current&&button.closest(".viewer"))return current;
  const image=button.closest(".video-card")?.querySelector<HTMLImageElement>("img")||button.closest("article")?.querySelector<HTMLImageElement>('img[src*="i.ytimg.com/vi/"]');
  return image?.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//)?.[1]||"";
}
function nativeSeek(seconds:number){
  const input=document.querySelector<HTMLInputElement>(".player-seek-bar");
  if(!input)return;
  const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");
  descriptor?.set?.call(input,String(seconds));
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
}
async function ensureYouTubeApi(){
  const target=window as unknown as {YT?:{Player:new(el:HTMLElement,options:Record<string,unknown>)=>PlayerLike};onYouTubeIframeAPIReady?:()=>void};
  if(target.YT?.Player)return target.YT;
  return await new Promise<NonNullable<typeof target.YT>>((resolve,reject)=>{
    const previous=target.onYouTubeIframeAPIReady;
    const finish=()=>{previous?.();if(target.YT?.Player)resolve(target.YT);else reject(new Error("youtube-api"));};
    target.onYouTubeIframeAPIReady=finish;
    let script=document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if(!script){script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;document.head.appendChild(script);}
    script.addEventListener("error",()=>reject(new Error("youtube-api")),{once:true});
    window.setTimeout(()=>{if(target.YT?.Player)resolve(target.YT);},500);
  });
}

export default function VideoEditorDemoEnhancer(){
  const [open,setOpen]=useState(false);
  const [authRequired,setAuthRequired]=useState(false);
  const [pendingId,setPendingId]=useState("");
  const [password,setPassword]=useState("");
  const [authError,setAuthError]=useState("");
  const [loading,setLoading]=useState(false);
  const [video,setVideo]=useState<EditorVideo|null>(null);
  const [captions,setCaptions]=useState<EditorCaptions|null>(null);
  const [metadata,setMetadata]=useState<MetadataDraft|null>(null);
  const [ranges,setRanges]=useState<SkipRange[]>([]);
  const [initialSnapshot,setInitialSnapshot]=useState("");
  const [draftStart,setDraftStart]=useState<number|null>(null);
  const [current,setCurrent]=useState(0);
  const [duration,setDuration]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [previewIndex,setPreviewIndex]=useState<number|null>(null);
  const [status,setStatus]=useState("");
  const [saveBusy,setSaveBusy]=useState(false);
  const host=useRef<HTMLDivElement|null>(null);
  const player=useRef<PlayerLike|null>(null);
  const origin=useRef<{videoId:string;time:number}>({videoId:"",time:0});

  const validationErrors=useMemo(()=>{
    const errors:string[]=[];
    if(metadata&&!metadata.title.trim())errors.push("Ο ελληνικός τίτλος είναι υποχρεωτικός.");
    const sorted=[...ranges].sort((a,b)=>a.start-b.start);
    sorted.forEach((range,index)=>{
      if(!Number.isFinite(range.start)||!Number.isFinite(range.end))errors.push(`Range ${index+1}: μη έγκυρο timestamp.`);
      else if(range.start<0)errors.push(`Range ${index+1}: η αρχή δεν μπορεί να είναι αρνητική.`);
      else if(range.end<=range.start+.15)errors.push(`Range ${index+1}: το τέλος πρέπει να είναι μετά την αρχή.`);
      else if(duration>0&&range.end>duration+.25)errors.push(`Range ${index+1}: βρίσκεται έξω από τη διάρκεια του βίντεο.`);
      const previous=sorted[index-1];
      if(previous&&range.start<previous.end-.01)errors.push(`Range ${index+1}: επικαλύπτεται με το προηγούμενο range.`);
    });
    return errors;
  },[metadata,ranges,duration]);
  const dirty=Boolean(metadata&&snapshotOf(metadata,ranges)!==initialSnapshot);
  const totalSkipped=useMemo(()=>ranges.reduce((sum,item)=>sum+Math.max(0,item.end-item.start),0),[ranges]);
  const activeCaption=useMemo(()=>captions?activeCueIndex(captions.cues,current):-1,[captions,current]);

  async function loadEditor(videoId:string){
    setLoading(true);setAuthRequired(false);setOpen(true);setStatus("");setCaptions(null);
    const queryId=new URLSearchParams(location.search).get("video")||"";
    const sourceTime=queryId===videoId?Number(document.querySelector<HTMLInputElement>(".player-seek-bar")?.value||0):0;
    origin.current={videoId:queryId===videoId?videoId:"",time:sourceTime};
    document.querySelector<HTMLButtonElement>('.gts31-play[aria-label="Παύση"],button[aria-label="Παύση"]')?.click();
    try{
      const response=await fetch(`/api/video-editor?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store",credentials:"same-origin"});
      const result=await response.json() as {video?:EditorVideo;error?:string};
      if(!response.ok||!result.video)throw new Error(result.error||"Το βίντεο δεν φορτώθηκε.");
      const nextMetadata=metadataFrom(result.video),nextRanges=rangesFrom(result.video.skipRanges);
      setVideo(result.video);setMetadata(nextMetadata);setRanges(nextRanges);setDuration(Number(result.video.duration||0));setCurrent(sourceTime);setInitialSnapshot(snapshotOf(nextMetadata,nextRanges));setDraftStart(null);
      const captionsResponse=await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store",credentials:"same-origin"});
      const captionData=await captionsResponse.json().catch(()=>null) as EditorCaptions|null;
      if(captionsResponse.ok&&isVerifiedGreekCaptions(captionData,Number(result.video.duration||0)))setCaptions(captionData);
      else setStatus("Δεν υπάρχει ακόμη verified ελληνική μεταγραφή για το Video Editor.");
    }catch(problem){setStatus(problem instanceof Error?problem.message:"Το βίντεο δεν φορτώθηκε.");}
    finally{setLoading(false);}
  }
  async function requestEditor(videoId:string){
    setPendingId(videoId);setAuthError("");
    try{
      const response=await fetch("/api/admin-auth",{cache:"no-store",credentials:"same-origin"});
      const result=await response.json().catch(()=>({})) as {authorized?:boolean};
      if(response.ok&&result.authorized){await loadEditor(videoId);return;}
    }catch{}
    setAuthRequired(true);setOpen(true);
  }
  async function authorize(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setAuthError("");
    try{
      const response=await fetch("/api/admin-auth",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const result=await response.json().catch(()=>({})) as {authorized?:boolean;error?:string};
      if(!response.ok||!result.authorized){setAuthError(result.error||"Ο κωδικός δεν είναι σωστός.");return;}
      setPassword("");await loadEditor(pendingId);
    }catch{setAuthError("Δεν ήταν δυνατός ο έλεγχος του κωδικού.");}
  }

  useEffect(()=>{
    const intercept=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest<HTMLElement>('button[aria-label="Επεξεργασία βίντεο"],button.card-edit'):null;
      if(!target)return;
      const id=videoIdFromButton(target);
      if(!id)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      void requestEditor(id);
    };
    document.addEventListener("click",intercept,true);
    return()=>document.removeEventListener("click",intercept,true);
  },[]);

  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=previous;};
  },[open]);
  useEffect(()=>{
    if(!dirty)return;
    const before=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",before);return()=>window.removeEventListener("beforeunload",before);
  },[dirty]);

  useEffect(()=>{
    if(!open||!video||!host.current||authRequired)return;
    let cancelled=false;
    void ensureYouTubeApi().then(YT=>{
      if(cancelled||!host.current)return;
      player.current?.destroy();host.current.innerHTML="";
      const disableYouTubeCaptions=(target:PlayerLike)=>{if(target.getOptions?.().includes("captions"))target.unloadModule?.("captions");};
      player.current=new YT.Player(host.current,{videoId:video.id,width:"100%",height:"100%",playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1,rel:0,modestbranding:1,start:Math.floor(current),cc_load_policy:0,iv_load_policy:3},events:{
        onReady:({target}:{target:PlayerLike})=>{const d=target.getDuration();if(d>0)setDuration(d);target.seekTo(current,true);disableYouTubeCaptions(target);window.setTimeout(()=>disableYouTubeCaptions(target),350);},
        onApiChange:({target}:{target:PlayerLike})=>disableYouTubeCaptions(target),
        onStateChange:({target,data}:{target:PlayerLike;data:number})=>{disableYouTubeCaptions(target);setPlaying(data===1);},
      }});
    }).catch(()=>setStatus("Δεν ήταν δυνατή η φόρτωση του YouTube player."));
    return()=>{cancelled=true;player.current?.destroy();player.current=null;};
  },[open,video?.id,authRequired]);

  useEffect(()=>{
    if(!open||!video||authRequired)return;
    const timer=window.setInterval(()=>{
      const target=player.current;if(!target)return;
      const now=target.getCurrentTime();if(Number.isFinite(now))setCurrent(now);
      const d=target.getDuration();if(d>0&&Math.abs(d-duration)>.5)setDuration(d);
      if(previewIndex!==null){
        const range=ranges[previewIndex];
        if(!range){setPreviewIndex(null);return;}
        if(now>=range.start-.03&&now<range.end-.03){target.seekTo(range.end,true);return;}
        if(now>=range.end+2){target.pauseVideo();setPreviewIndex(null);setStatus("Preview ολοκληρώθηκε.");}
      }
    },100);
    return()=>window.clearInterval(timer);
  },[open,video?.id,authRequired,previewIndex,ranges,duration]);

  function closeEditor(){
    if(dirty&&!window.confirm("Υπάρχουν μη αποθηκευμένες αλλαγές. Θέλεις να φύγεις χωρίς αποθήκευση;"))return;
    if(video&&origin.current.videoId===video.id){
      nativeSeek(current);
      const params=new URLSearchParams(location.search);params.set("video",video.id);params.set("t",Math.max(0,current).toFixed(1));history.replaceState(null,"",`/?${params.toString()}`);
    }
    setOpen(false);setAuthRequired(false);setVideo(null);setCaptions(null);setMetadata(null);setRanges([]);setInitialSnapshot("");setPreviewIndex(null);setStatus("");
  }
  function seek(next:number){const target=player.current;if(!target)return;const safe=Math.max(0,Math.min(duration||Number.MAX_SAFE_INTEGER,next));target.seekTo(safe,true);setCurrent(safe);}
  function toggle(){const target=player.current;if(!target)return;if(target.getPlayerState()===1)target.pauseVideo();else target.playVideo();}
  function markStart(){setDraftStart(current);setStatus(`Αρχή range: ${clock(current,true)}`);}
  function markEnd(){
    if(draftStart===null){setStatus("Όρισε πρώτα την αρχή του range.");return;}
    if(current<=draftStart+.15){setStatus("Το τέλος πρέπει να είναι μετά την αρχή.");return;}
    setRanges(value=>[...value,{start:draftStart,end:current}].sort((a,b)=>a.start-b.start));setDraftStart(null);setStatus("Το range προστέθηκε στο draft.");
  }
  function preview(index:number){const range=ranges[index];if(!range)return;setPreviewIndex(index);setStatus(`Preview ${clock(range.start)} → ${clock(range.end)}`);seek(Math.max(0,range.start-2));window.setTimeout(()=>player.current?.playVideo(),80);}
  function updateRange(index:number,key:"start"|"end",value:number){setRanges(currentRanges=>currentRanges.map((item,itemIndex)=>itemIndex===index?{...item,[key]:value}:item).sort((a,b)=>a.start-b.start));}
  async function save(){
    if(!video||!metadata||validationErrors.length||saveBusy)return;
    setSaveBusy(true);setStatus("Αποθήκευση metadata και markers…");
    try{
      const response=await fetch("/api/video-editor",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:video.id,metadataVersion:Number(video.metadataVersion||0),metadata,skipRanges:ranges})});
      const result=await response.json() as {ok?:boolean;video?:EditorVideo;error?:string};
      if(!response.ok||!result.ok||!result.video)throw new Error(result.error||"Η αποθήκευση απέτυχε.");
      const nextMetadata=metadataFrom(result.video),nextRanges=rangesFrom(result.video.skipRanges);
      setVideo(result.video);setMetadata(nextMetadata);setRanges(nextRanges);setInitialSnapshot(snapshotOf(nextMetadata,nextRanges));setStatus("Όλες οι αλλαγές αποθηκεύτηκαν.");
    }catch(problem){setStatus(problem instanceof Error?problem.message:"Η αποθήκευση απέτυχε.");}
    finally{setSaveBusy(false);}
  }

  if(!open)return null;
  return createPortal(<>
    <div className="gts-editor-screen">
      {authRequired?<section className="gts-editor-auth"><div className="gts-editor-auth-card"><span className="gts-editor-kicker">VIDEO EDITOR</span><h1>Προστατευμένη επεξεργασία</h1><p>Βάλε τον κωδικό διαχειριστή για να ανοίξει ο νέος editor.</p><form onSubmit={authorize}><input type="password" autoFocus value={password} onChange={event=>setPassword(event.target.value)} placeholder="Κωδικός πρόσβασης"/><button className="primary">Συνέχεια</button></form>{authError&&<small className="gts-editor-error">{authError}</small>}<button className="gts-editor-auth-cancel" onClick={closeEditor}>Ακύρωση</button></div></section>:<>
        <header className="gts-editor-header"><button className="gts-editor-back" onClick={closeEditor}>← <span>Πίσω στο βίντεο</span></button><div className="gts-editor-title"><span className="gts-editor-kicker">VIDEO EDITOR · DEMO</span><strong>{video?.title||"Επεξεργασία βίντεο"}</strong></div><div className="gts-editor-save-state">{dirty?<span>ΜΗ ΑΠΟΘΗΚΕΥΜΕΝΕΣ ΑΛΛΑΓΕΣ</span>:<span className="saved">ΑΠΟΘΗΚΕΥΜΕΝΟ</span>}<button className="primary" disabled={!dirty||validationErrors.length>0||saveBusy||loading} onClick={()=>void save()}>{saveBusy?"Αποθήκευση…":"Αποθήκευση"}</button></div></header>
        {loading?<div className="gts-editor-loading">Φόρτωση editor…</div>:video&&metadata?<main className="gts-editor-layout">
          <section className="gts-editor-stage">
            <div className="gts-editor-video"><div ref={host}/>{captions&&activeCaption>=0&&<div className="gts-editor-subtitles" aria-live="off">{subtitleWindow(captions.cues[activeCaption],current,captions.cues[activeCaption+1])}</div>}<div className="gts-editor-timecode">{clock(current,true)} <span>/ {clock(duration)}</span></div></div>
            <div className="gts-editor-transport"><button onClick={()=>seek(current-5)} aria-label="Πίσω 5 δευτερόλεπτα">−5</button><button className="gts-editor-play" onClick={toggle} aria-label={playing?"Παύση":"Αναπαραγωγή"}>{playing?"❚❚":"▶"}</button><button onClick={()=>seek(current+5)} aria-label="Μπροστά 5 δευτερόλεπτα">+5</button></div>
            <div className="gts-editor-timeline-wrap">
              <div className="gts-editor-timeline">
                {duration>0&&ranges.map((range,index)=><i key={`${range.start}-${range.end}-${index}`} className={previewIndex===index?"previewing":""} style={{left:`${Math.max(0,Math.min(100,range.start/duration*100))}%`,width:`${Math.max(.35,Math.min(100,(range.end-range.start)/duration*100))}%`} as CSSProperties}/>) }
                {duration>0&&draftStart!==null&&<b style={{left:`${Math.max(0,Math.min(100,draftStart/duration*100))}%`} as CSSProperties}/>} 
                <input type="range" min={0} max={Math.max(1,duration)} step="0.1" value={Math.min(current,Math.max(1,duration))} onChange={event=>seek(Number(event.target.value))} aria-label="Γραμμή χρόνου editor"/>
              </div>
              <div className="gts-editor-timeline-labels"><span>0:00</span><strong>{ranges.length} SKIP RANGES · {clock(totalSkipped)} ΣΥΝΟΛΟ</strong><span>{clock(duration)}</span></div>
            </div>
            <div className="gts-editor-mark-actions"><button className={draftStart!==null?"active":""} onClick={markStart}><small>01</small><span><b>Ορισμός αρχής</b>{draftStart!==null?clock(draftStart,true):"Στο τρέχον σημείο"}</span></button><button onClick={markEnd}><small>02</small><span><b>Ορισμός τέλους</b>Δημιουργία skip range</span></button></div>
            <section className="gts-editor-ranges"><div className="gts-editor-section-head"><div><span className="gts-editor-kicker">SKIP RANGES</span><h2>Περιοχές παράλειψης</h2></div><strong>{ranges.length}</strong></div>
              {ranges.length===0?<div className="gts-editor-empty">Δεν υπάρχουν ακόμη ranges. Παίξε το βίντεο και όρισε αρχή και τέλος.</div>:<div className="gts-editor-range-list">{ranges.map((range,index)=><article key={`${index}-${range.start}-${range.end}`} className={validationErrors.some(error=>error.startsWith(`Range ${index+1}:`))?"invalid":""}><div className="gts-editor-range-index">{String(index+1).padStart(2,"0")}</div><div className="gts-editor-range-main"><div className="gts-editor-range-times"><label>ΑΠΟ<input type="number" step="0.1" min="0" value={Number(range.start.toFixed(1))} onChange={event=>updateRange(index,"start",Number(event.target.value))}/></label><span>→</span><label>ΜΕΧΡΙ<input type="number" step="0.1" min="0" value={Number(range.end.toFixed(1))} onChange={event=>updateRange(index,"end",Number(event.target.value))}/></label><em>{(range.end-range.start).toFixed(1)}s</em></div><div className="gts-editor-range-actions"><button onClick={()=>preview(index)}>{previewIndex===index?"Previewing…":"Preview"}</button><button onClick={()=>seek(range.start)}>Μετάβαση</button><button className="danger" onClick={()=>setRanges(value=>value.filter((_,itemIndex)=>itemIndex!==index))}>Διαγραφή</button></div></div></article>)}</div>}
            </section>
          </section>
          <aside className="gts-editor-sidebar">
            <section className="gts-editor-card"><div className="gts-editor-section-head"><div><span className="gts-editor-kicker">VIDEO INFORMATION</span><h2>Πληροφορίες βίντεο</h2></div></div>
              <div className="gts-editor-form"><label>Ελληνικός τίτλος<input value={metadata.title} onChange={event=>setMetadata({...metadata,title:event.target.value})}/></label><label>Αγγλικός τίτλος<input value={metadata.originalTitle} onChange={event=>setMetadata({...metadata,originalTitle:event.target.value})}/></label><div className="gts-editor-grid"><label>Γιατρός ή ομιλητής<input value={metadata.speakerName} onChange={event=>setMetadata({...metadata,speakerName:event.target.value})}/></label><label>Ιδιότητα<input value={metadata.speakerRole} onChange={event=>setMetadata({...metadata,speakerRole:event.target.value})}/></label></div><div className="gts-editor-grid"><label>Κανάλι<input value={metadata.channel} onChange={event=>setMetadata({...metadata,channel:event.target.value})}/></label><label>Link καναλιού<input value={metadata.channelUrl} onChange={event=>setMetadata({...metadata,channelUrl:event.target.value})}/></label></div><label>Original video link<input value={metadata.originalVideoUrl} onChange={event=>setMetadata({...metadata,originalVideoUrl:event.target.value})}/></label><div className="gts-editor-grid"><label>Κατηγορία<select value={metadata.category} onChange={event=>setMetadata({...metadata,category:event.target.value})}>{CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Ετικέτες<input value={metadata.tags.join(", ")} onChange={event=>setMetadata({...metadata,tags:event.target.value.split(",").map(item=>item.trim()).filter(Boolean)})}/></label></div><label>Περιγραφή<textarea value={metadata.description} onChange={event=>setMetadata({...metadata,description:event.target.value})}/></label></div>
            </section>
            <OwnerTranslationPanel videoId={video.id}/>
            <section className={`gts-editor-card gts-editor-validation ${validationErrors.length?"has-errors":"ok"}`}><div className="gts-editor-section-head"><div><span className="gts-editor-kicker">VALIDATION</span><h2>{validationErrors.length?"Χρειάζεται διόρθωση":"Όλα έτοιμα"}</h2></div><strong>{validationErrors.length?"!":"✓"}</strong></div>{validationErrors.length?<ul>{validationErrors.map((error,index)=><li key={`${error}-${index}`}>{error}</li>)}</ul>:<p>Δεν υπάρχουν επικαλύψεις ή λανθασμένα timestamps. Metadata και markers μπορούν να αποθηκευτούν μαζί.</p>}</section>
            {status&&<div className="gts-editor-status" role="status">{status}</div>}
          </aside>
        </main>:<div className="gts-editor-loading">{status||"Το βίντεο δεν φορτώθηκε."}</div>}
        <div className="gts-editor-mobile-save"><div>{dirty?"Μη αποθηκευμένες αλλαγές":"Όλα αποθηκευμένα"}</div><button className="primary" disabled={!dirty||validationErrors.length>0||saveBusy||loading} onClick={()=>void save()}>{saveBusy?"Αποθήκευση…":"Αποθήκευση"}</button></div>
      </>}
    </div>
    <style>{styles}</style>
  </>,document.body);
}

const styles=`
.gts-editor-screen{position:fixed;inset:0;z-index:2147483200;overflow:auto;background:#090b0f;color:#f5f5f2;font-family:var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.gts-editor-header{position:sticky;top:0;z-index:20;height:72px;display:grid;grid-template-columns:1fr minmax(0,1.5fr) 1fr;align-items:center;gap:18px;padding:0 clamp(16px,3vw,38px);border-bottom:1px solid rgba(255,255,255,.08);background:rgba(9,11,15,.91);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}.gts-editor-back{justify-self:start;border:0;background:transparent;color:#aeb3bc;font-size:12px}.gts-editor-back:hover{color:#fff}.gts-editor-title{text-align:center;min-width:0}.gts-editor-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:620}.gts-editor-kicker{display:block;color:#9084ee;font-size:8px;font-weight:760;letter-spacing:.13em}.gts-editor-save-state{justify-self:end;display:flex;align-items:center;gap:12px}.gts-editor-save-state>span{color:#d6a25b;font-size:8px;font-weight:760;letter-spacing:.08em}.gts-editor-save-state>span.saved{color:#6fbb91}.gts-editor-save-state .primary,.gts-editor-mobile-save .primary,.gts-editor-auth .primary{min-height:38px;padding:0 15px;border:0;border-radius:10px;background:#7569d9;color:#fff;font-size:11px;font-weight:680}.gts-editor-save-state .primary:disabled,.gts-editor-mobile-save .primary:disabled{opacity:.38;cursor:not-allowed}.gts-editor-layout{width:min(1480px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(340px,.68fr);gap:22px;padding:24px clamp(16px,3vw,38px) 80px}.gts-editor-stage{min-width:0}.gts-editor-video{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:#000;box-shadow:0 24px 70px rgba(0,0,0,.34)}.gts-editor-video>div:first-child,.gts-editor-video iframe{width:100%!important;height:100%!important;border:0}.gts-editor-timecode{position:absolute;right:14px;bottom:12px;padding:6px 9px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:rgba(5,6,8,.76);font:600 11px var(--font-geist-mono),monospace;backdrop-filter:blur(8px)}.gts-editor-timecode span{color:#777d87}.gts-editor-transport{display:flex;align-items:center;justify-content:center;gap:10px;padding:15px 0 10px}.gts-editor-transport button{width:46px;height:42px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#141820;color:#d7dae0;font-size:12px;font-weight:650}.gts-editor-transport .gts-editor-play{width:58px;height:48px;border-color:rgba(143,127,240,.42);background:linear-gradient(145deg,#8275e6,#685dc4);color:#fff;font-size:17px;box-shadow:0 9px 25px rgba(105,93,196,.24)}.gts-editor-timeline-wrap{padding:4px 2px 16px}.gts-editor-timeline{position:relative;height:26px;display:flex;align-items:center}.gts-editor-timeline:before{content:"";position:absolute;left:0;right:0;height:6px;border-radius:99px;background:#252a33}.gts-editor-timeline>i{position:absolute;z-index:2;height:9px;border-radius:99px;background:#c58a42;box-shadow:0 0 0 1px rgba(255,214,150,.16),0 0 13px rgba(197,138,66,.22);pointer-events:none}.gts-editor-timeline>i.previewing{background:#9b8ef8;box-shadow:0 0 16px rgba(155,142,248,.5)}.gts-editor-timeline>b{position:absolute;z-index:3;top:2px;width:2px;height:22px;background:#f0c67e;pointer-events:none}.gts-editor-timeline input{position:absolute;z-index:4;width:100%;height:26px;margin:0;opacity:.01;cursor:pointer}.gts-editor-timeline-labels{display:flex;justify-content:space-between;align-items:center;color:#666d78;font:500 9px var(--font-geist-mono),monospace}.gts-editor-timeline-labels strong{color:#8b9099;font-size:8px;letter-spacing:.05em}.gts-editor-mark-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 24px}.gts-editor-mark-actions button{display:grid;grid-template-columns:34px 1fr;align-items:center;gap:9px;min-height:64px;padding:10px 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:#12151b;color:#eef0f3;text-align:left}.gts-editor-mark-actions button.active{border-color:rgba(197,138,66,.5);background:rgba(197,138,66,.09)}.gts-editor-mark-actions small{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#1d212a;color:#b8bdc6;font-size:9px}.gts-editor-mark-actions span{display:block;color:#8d939d;font-size:10px}.gts-editor-mark-actions b{display:block;margin-bottom:3px;color:#eef0f3;font-size:12px}.gts-editor-ranges{padding:18px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#101319}.gts-editor-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.gts-editor-section-head h2{margin:4px 0 0;font-size:16px;font-weight:650;letter-spacing:-.025em}.gts-editor-section-head>strong{min-width:28px;height:28px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#181c23;color:#aaa1ef;font-size:11px}.gts-editor-empty{margin-top:14px;padding:22px;border:1px dashed rgba(255,255,255,.12);border-radius:13px;color:#777e88;font-size:11px;text-align:center}.gts-editor-range-list{display:grid;gap:8px;margin-top:14px}.gts-editor-range-list article{display:grid;grid-template-columns:38px 1fr;gap:10px;padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:#151920}.gts-editor-range-list article.invalid{border-color:rgba(226,96,86,.45);background:rgba(226,96,86,.055)}.gts-editor-range-index{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:#20252e;color:#b5bac3;font:650 10px var(--font-geist-mono),monospace}.gts-editor-range-times{display:grid;grid-template-columns:minmax(105px,1fr) auto minmax(105px,1fr) auto;gap:8px;align-items:end}.gts-editor-range-times label{color:#707781;font-size:7px;font-weight:750;letter-spacing:.08em}.gts-editor-range-times input{width:100%;height:34px;margin-top:4px;padding:0 8px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#0f1217;color:#e9ebee;font:600 11px var(--font-geist-mono),monospace;outline:none}.gts-editor-range-times span{padding-bottom:9px;color:#565d67}.gts-editor-range-times em{padding-bottom:9px;color:#ba8a4f;font:600 9px var(--font-geist-mono),monospace;font-style:normal}.gts-editor-range-actions{display:flex;gap:7px;margin-top:8px}.gts-editor-range-actions button{min-height:29px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:transparent;color:#aeb3bc;font-size:9px}.gts-editor-range-actions button:hover{background:rgba(255,255,255,.05);color:#fff}.gts-editor-range-actions button.danger{margin-left:auto;color:#d97f79}.gts-editor-sidebar{display:grid;align-content:start;gap:13px}.gts-editor-card{padding:18px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#101319}.gts-editor-form{display:grid;gap:12px;margin-top:16px}.gts-editor-form label{display:grid;gap:5px;color:#858b94;font-size:8.5px;font-weight:580}.gts-editor-form input,.gts-editor-form select,.gts-editor-form textarea{width:100%;border:1px solid rgba(255,255,255,.085);border-radius:10px;background:#171b22;color:#f0f1f3;outline:none;font-size:10.5px}.gts-editor-form input,.gts-editor-form select{height:39px;padding:0 10px}.gts-editor-form textarea{min-height:100px;padding:10px;resize:vertical;line-height:1.5}.gts-editor-form input:focus,.gts-editor-form select:focus,.gts-editor-form textarea:focus{border-color:rgba(143,127,240,.48);box-shadow:0 0 0 3px rgba(143,127,240,.07)}.gts-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.gts-editor-validation p,.gts-editor-validation ul{margin:12px 0 0;color:#858b94;font-size:10px;line-height:1.55}.gts-editor-validation ul{padding-left:18px;color:#e28a83}.gts-editor-validation.ok{border-color:rgba(84,171,124,.18)}.gts-editor-validation.ok .gts-editor-section-head>strong{color:#6fc394;background:rgba(84,171,124,.08)}.gts-editor-validation.has-errors{border-color:rgba(226,96,86,.24)}.gts-editor-validation.has-errors .gts-editor-section-head>strong{color:#e28a83;background:rgba(226,96,86,.07)}.gts-editor-status{padding:12px 14px;border:1px solid rgba(143,127,240,.17);border-radius:12px;background:rgba(143,127,240,.07);color:#b8b0ef;font-size:10px;line-height:1.45}.gts-editor-loading{min-height:55vh;display:grid;place-items:center;color:#868c96;font-size:12px}.gts-editor-mobile-save{display:none}.gts-editor-auth{min-height:100dvh;display:grid;place-items:center;padding:20px}.gts-editor-auth-card{width:min(390px,100%);padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:#11151b;box-shadow:0 30px 90px rgba(0,0,0,.4)}.gts-editor-auth-card h1{margin:7px 0 8px;font-size:21px}.gts-editor-auth-card p{margin:0 0 16px;color:#8d939d;font-size:11px;line-height:1.55}.gts-editor-auth-card form{display:grid;gap:9px}.gts-editor-auth-card input{height:43px;padding:0 12px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:#191d24;color:#fff;outline:none}.gts-editor-error{display:block;margin-top:10px;color:#e28a83;font-size:10px}.gts-editor-auth-cancel{width:100%;margin-top:8px;padding:8px;border:0;background:transparent;color:#777e88;font-size:10px}
@media(max-width:900px){.gts-editor-header{grid-template-columns:auto 1fr auto;height:64px;padding:0 13px}.gts-editor-back span,.gts-editor-save-state>span,.gts-editor-title .gts-editor-kicker{display:none}.gts-editor-title{text-align:left}.gts-editor-title strong{max-width:44vw;font-size:11px}.gts-editor-save-state .primary{display:none}.gts-editor-layout{display:block;padding:12px 12px 92px}.gts-editor-video{border-radius:14px}.gts-editor-transport{padding:12px 0 8px}.gts-editor-timeline-wrap{padding:2px 2px 13px}.gts-editor-timeline-labels strong{font-size:7px}.gts-editor-mark-actions{gap:8px;margin-bottom:14px}.gts-editor-mark-actions button{min-height:58px;padding:8px}.gts-editor-ranges{padding:14px;border-radius:15px}.gts-editor-sidebar{margin-top:12px;gap:10px}.gts-editor-card{padding:14px;border-radius:15px}.gts-editor-grid{grid-template-columns:1fr}.gts-editor-range-times{grid-template-columns:1fr auto 1fr}.gts-editor-range-times em{display:none}.gts-editor-range-list article{grid-template-columns:30px 1fr;padding:9px}.gts-editor-range-index{width:28px;height:28px}.gts-editor-mobile-save{position:fixed;left:0;right:0;bottom:0;z-index:25;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.09);background:rgba(9,11,15,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.gts-editor-mobile-save div{color:#858b94;font-size:9px}.gts-editor-mobile-save .primary{min-width:124px}.gts-editor-section-head h2{font-size:14px}.gts-editor-form input,.gts-editor-form select,.gts-editor-form textarea{font-size:12px}.gts-editor-range-times input{font-size:12px}.gts-editor-range-actions button{font-size:10px;min-height:32px}.gts-editor-timeline input{touch-action:pan-x}}
@media(max-width:420px){.gts-editor-mark-actions button{grid-template-columns:28px 1fr}.gts-editor-mark-actions small{width:26px;height:26px}.gts-editor-mark-actions b{font-size:11px}.gts-editor-range-times{gap:5px}.gts-editor-range-times input{padding:0 6px}.gts-editor-range-actions{gap:5px}.gts-editor-range-actions button{padding:0 7px}.gts-editor-range-actions button.danger{margin-left:0}.gts-editor-title strong{max-width:46vw}}
.gts-editor-subtitles{position:absolute;z-index:4;left:50%;bottom:8%;max-width:min(86%,760px);transform:translateX(-50%);padding:7px 12px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(0,0,0,.8);color:#fff;font-size:clamp(14px,1.65vw,24px);font-weight:650;line-height:1.35;text-align:center;white-space:pre-line;pointer-events:none}.gts-editor-timecode{z-index:5}
`;

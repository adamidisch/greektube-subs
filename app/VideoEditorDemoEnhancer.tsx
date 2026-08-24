"use client";

import {useEffect,useMemo,useRef,useState,type CSSProperties} from "react";
import {createPortal} from "react-dom";
import OwnerTranslationPanel from "./OwnerTranslationPanel";
import {activeSkipTarget,formatSkipTimecode,normalizeSkipRanges,parseSkipTimecode,SKIP_RANGES_UPDATED_EVENT,validateSkipRanges,type SkipRange} from "./skip-ranges";

type EditorVideo={
  id:string;title:string;originalTitle?:string;speakerName?:string;speakerRole?:string;channel?:string;channelUrl?:string;
  originalVideoUrl?:string;url?:string;category?:string;tags?:string[];description?:string;duration?:number;metadataVersion?:number;skipRanges?:SkipRange[];
};
type MetadataDraft={title:string;originalTitle:string;speakerName:string;speakerRole:string;channel:string;channelUrl:string;originalVideoUrl:string;category:string;tags:string[];description:string};
type Cue={start:number;duration:number;text:string};
type EditorCaptions={videoId:string;cues:Cue[];duration?:number;transcriptVersion?:number};
type PlayerLike={destroy:()=>void;playVideo:()=>void;pauseVideo:()=>void;getPlayerState:()=>number;getCurrentTime:()=>number;getDuration:()=>number;seekTo:(seconds:number,allow:boolean)=>void;unloadModule?:(module:string)=>void};

const CATEGORIES=[
  ["Medical","Ιατρικά"],["Tech","Τεχνολογία"],["Podcasts","Συζητήσεις"],["Comedy","Κωμωδία"],["Education","Εκπαίδευση"],["Documentaries","Ντοκιμαντέρ"],["Other","Άλλα"],
] as const;

function clock(seconds:number,precise=false){
  const safe=Math.max(0,Number(seconds)||0),whole=Math.floor(safe),h=Math.floor(whole/3600),m=Math.floor((whole%3600)/60),s=whole%60;
  const base=h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;
  return precise?`${base}.${Math.floor((safe-whole)*10)}`:base;
}
function metadataFrom(video:EditorVideo):MetadataDraft{
  return {title:video.title||"",originalTitle:video.originalTitle||"",speakerName:video.speakerName||"",speakerRole:video.speakerRole||"",channel:video.channel||"",channelUrl:video.channelUrl||"",originalVideoUrl:video.originalVideoUrl||video.url||`https://www.youtube.com/watch?v=${video.id}`,category:video.category||"Other",tags:Array.isArray(video.tags)?video.tags:[],description:video.description||""};
}
function snapshotOf(metadata:MetadataDraft,ranges:SkipRange[]){return JSON.stringify({metadata,ranges});}
function cueIsActive(cue:Cue|undefined,time:number){return Boolean(cue&&Number.isFinite(time)&&Number.isFinite(cue.start)&&Number.isFinite(cue.duration)&&cue.duration>0&&time>=cue.start&&time<cue.start+cue.duration);}
function activeCueIndex(cues:Cue[],time:number){let result=-1;let latestStart=-Infinity;for(let index=0;index<cues.length;index+=1){const cue=cues[index];if(cueIsActive(cue,time)&&cue.start>=latestStart){result=index;latestStart=cue.start;}}return result;}
function subtitleFrames(text:string,maxLineCharacters=42){
  const clean=text.replace(/\s+/g," ").trim();if(!clean)return [];
  const lines:string[]=[];let line="";
  for(const word of clean.split(" ")){const next=line?`${line} ${word}`:word;if(line&&next.length>maxLineCharacters){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);
  return lines.flatMap((_,index)=>index%2===0?[lines.slice(index,index+2).join("\n")]:[]);
}
function subtitleWindow(cue:Cue|undefined,currentTime:number,nextCue?:Cue){
  if(!cue||!cueIsActive(cue,currentTime))return "";const frames=subtitleFrames(cue.text);if(frames.length<=1)return frames[0]||"";
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
function suppressNativeCaptions(target:PlayerLike){
  window.setTimeout(()=>{try{target.unloadModule?.("captions");}catch{}},0);
}
function blocksEditorShortcut(target:EventTarget|null){
  return target instanceof Element&&Boolean(target.closest("input,textarea,select,[contenteditable=true]"));
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
  const [playerVisualReady,setPlayerVisualReady]=useState(false);
  const [previewIndex,setPreviewIndex]=useState<number|null>(null);
  const [timelinePreview,setTimelinePreview]=useState<number|null>(null);
  const [timecodeDrafts,setTimecodeDrafts]=useState<Record<string,string>>({});
  const [status,setStatus]=useState("");
  const [saveBusy,setSaveBusy]=useState(false);
  const host=useRef<HTMLDivElement|null>(null);
  const keyboardTarget=useRef<HTMLDivElement|null>(null);
  const player=useRef<PlayerLike|null>(null);
  const captionReadyPlayer=useRef<PlayerLike|null>(null);
  const captionsRequestSequence=useRef(0);
  const captionsAbortController=useRef<AbortController|null>(null);
  const currentEditorVideoId=useRef("");
  const origin=useRef<{videoId:string;time:number}>({videoId:"",time:0});

  const validationErrors=useMemo(()=>{
    const errors:string[]=[];
    if(metadata&&!metadata.title.trim())errors.push("Ο ελληνικός τίτλος είναι υποχρεωτικός.");
    errors.push(...validateSkipRanges(ranges,duration).errors);
    if(Object.values(timecodeDrafts).some(value=>parseSkipTimecode(value)===null))errors.push("Υπάρχει μη έγκυρο timecode. Χρησιμοποίησε MM:SS.d ή δευτερόλεπτα.");
    return errors;
  },[metadata,ranges,duration,timecodeDrafts]);
  const dirty=Boolean(metadata&&snapshotOf(metadata,ranges)!==initialSnapshot);
  const totalSkipped=useMemo(()=>ranges.reduce((sum,item)=>sum+Math.max(0,item.end-item.start),0),[ranges]);
  const activeCaption=useMemo(()=>captions?activeCueIndex(captions.cues,current):-1,[captions,current]);

  async function loadEditor(videoId:string){
    captionsAbortController.current?.abort();
    captionsAbortController.current=null;
    const requestSequence=++captionsRequestSequence.current;
    currentEditorVideoId.current=videoId;
    setLoading(true);setAuthRequired(false);setOpen(true);setStatus("");setCaptions(null);setPlayerVisualReady(false);setTimecodeDrafts({});
    const queryId=new URLSearchParams(location.search).get("video")||"";
    const sourceTime=queryId===videoId?Number(document.querySelector<HTMLInputElement>(".player-seek-bar")?.value||0):0;
    origin.current={videoId:queryId===videoId?videoId:"",time:sourceTime};
    document.querySelector<HTMLButtonElement>('.gts31-play[aria-label="Παύση"],button[aria-label="Παύση"]')?.click();
    try{
      const response=await fetch(`/api/video-editor?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store",credentials:"same-origin"});
      const result=await response.json() as {video?:EditorVideo;error?:string};
      if(!response.ok||!result.video)throw new Error(result.error||"Το βίντεο δεν φορτώθηκε.");
      const editorVideo=result.video;
      if(requestSequence!==captionsRequestSequence.current||currentEditorVideoId.current!==videoId)return;
      const nextMetadata=metadataFrom(editorVideo),nextRanges=normalizeSkipRanges(editorVideo.skipRanges);
      setVideo(editorVideo);setMetadata(nextMetadata);setRanges(nextRanges);setDuration(Number(editorVideo.duration||0));setCurrent(sourceTime);setInitialSnapshot(snapshotOf(nextMetadata,nextRanges));setDraftStart(null);
      const controller=new AbortController();
      captionsAbortController.current=controller;
      const isCurrentRequest=()=>!controller.signal.aborted&&requestSequence===captionsRequestSequence.current&&captionsAbortController.current===controller&&currentEditorVideoId.current===editorVideo.id;
      void (async()=>{
        try{
          const captionsResponse=await fetch(`/api/captions?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
          const captionData=await captionsResponse.json().catch(()=>null) as EditorCaptions|null;
          if(!isCurrentRequest())return;
          if(captionsResponse.ok&&captionData?.videoId===editorVideo.id&&isVerifiedGreekCaptions(captionData,Number(editorVideo.duration||0)))setCaptions(captionData);
          else{setCaptions(null);setStatus("Δεν υπάρχει ακόμη verified ελληνική μεταγραφή για το Video Editor.");}
        }catch{
          if(isCurrentRequest()){setCaptions(null);setStatus("Δεν υπάρχει ακόμη verified ελληνική μεταγραφή για το Video Editor.");}
        }finally{
          if(captionsAbortController.current===controller)captionsAbortController.current=null;
        }
      })();
    }catch(problem){if(requestSequence===captionsRequestSequence.current&&currentEditorVideoId.current===videoId)setStatus(problem instanceof Error?problem.message:"Το βίντεο δεν φορτώθηκε.");}
    finally{if(requestSequence===captionsRequestSequence.current&&currentEditorVideoId.current===videoId)setLoading(false);}
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
    if(!open||!video)return;
    const previous=document.title;
    document.title=`${metadata?.title||video.title} · Video Editor`;
    return()=>{document.title=previous;};
  },[open,video,metadata?.title]);
  useEffect(()=>{
    if(!dirty)return;
    const before=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",before);return()=>window.removeEventListener("beforeunload",before);
  },[dirty]);

  useEffect(()=>{
    if(!open||!video||authRequired)return;
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||blocksEditorShortcut(event.target))return;
      const target=player.current;if(!target)return;
      if(event.code==="Space"){
        if(event.repeat)return;
        event.preventDefault();
        if(target.getPlayerState()===1)target.pauseVideo();else target.playVideo();
        return;
      }
      if(event.code!=="ArrowLeft"&&event.code!=="ArrowRight")return;
      event.preventDefault();
      const direction=event.code==="ArrowLeft"?-5:5;
      const playerDuration=target.getDuration()||duration||Number.MAX_SAFE_INTEGER;
      const next=Math.max(0,Math.min(playerDuration,target.getCurrentTime()+direction));
      target.seekTo(next,true);setCurrent(next);
    };
    window.addEventListener("keydown",key,true);
    return()=>window.removeEventListener("keydown",key,true);
  },[open,video?.id,authRequired,duration]);

  useEffect(()=>{
    if(!open||!video||!host.current||authRequired)return;
    let cancelled=false;setPlayerVisualReady(false);
    void ensureYouTubeApi().then(YT=>{
      if(cancelled||!host.current)return;
      const restoreKeyboardFocus=()=>window.setTimeout(()=>{
        const active=document.activeElement;
        if(active instanceof HTMLIFrameElement&&active.closest(".gts-editor-video"))keyboardTarget.current?.focus({preventScroll:true});
      },0);
      player.current?.destroy();host.current.innerHTML="";
      player.current=new YT.Player(host.current,{videoId:video.id,width:"100%",height:"100%",playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1,rel:0,modestbranding:1,start:Math.floor(current)},events:{
        onReady:({target}:{target:PlayerLike})=>{const d=target.getDuration();if(d>0)setDuration(d);target.seekTo(current,true);captionReadyPlayer.current=target;setPlayerVisualReady(true);suppressNativeCaptions(target);window.setTimeout(()=>{if(captionReadyPlayer.current===target)suppressNativeCaptions(target);},350);},
        onApiChange:({target}:{target:PlayerLike})=>{if(captionReadyPlayer.current===target)suppressNativeCaptions(target);},
        onStateChange:({target,data}:{target:PlayerLike;data:number})=>{setPlaying(data===1);if(captionReadyPlayer.current===target)suppressNativeCaptions(target);restoreKeyboardFocus();},
      }});
    }).catch(()=>{setPlayerVisualReady(false);setStatus("Δεν ήταν δυνατή η φόρτωση του YouTube player.");});
    return()=>{cancelled=true;captionReadyPlayer.current=null;player.current?.destroy();player.current=null;};
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
        const skipTarget=activeSkipTarget([range],now,d||duration);
        if(skipTarget!==null){target.seekTo(skipTarget,true);setCurrent(skipTarget);return;}
        const previewStop=d>0?Math.min(d,range.end+2):range.end+2;
        if(now>=previewStop-.05){target.pauseVideo();setPreviewIndex(null);setStatus("Preview ολοκληρώθηκε.");}
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
    captionsRequestSequence.current+=1;captionsAbortController.current?.abort();captionsAbortController.current=null;currentEditorVideoId.current="";
    setOpen(false);setAuthRequired(false);setLoading(false);setPlayerVisualReady(false);setVideo(null);setCaptions(null);setMetadata(null);setRanges([]);setTimecodeDrafts({});setInitialSnapshot("");setPreviewIndex(null);setTimelinePreview(null);setStatus("");
  }
  function seek(next:number){const target=player.current;if(!target)return;const safe=Math.max(0,Math.min(duration||Number.MAX_SAFE_INTEGER,next));target.seekTo(safe,true);setCurrent(safe);}
  function updateTimelinePreview(event:React.PointerEvent<HTMLInputElement>){if(duration<=0)return;const rect=event.currentTarget.getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));setTimelinePreview(ratio*duration);}
  function toggle(){const target=player.current;if(!target)return;if(target.getPlayerState()===1)target.pauseVideo();else target.playVideo();}
  function markStart(){setDraftStart(current);setStatus(`Αρχή range: ${clock(current,true)}`);}
  function markEnd(){
    if(draftStart===null){setStatus("Όρισε πρώτα την αρχή του range.");return;}
    if(current<=draftStart+.15){setStatus("Το τέλος πρέπει να είναι μετά την αρχή.");return;}
    setRanges(value=>[...value,{start:draftStart,end:current}].sort((a,b)=>a.start-b.start));setTimecodeDrafts({});setDraftStart(null);setStatus("Το range προστέθηκε στο draft.");
  }
  function preview(index:number){const range=ranges[index];if(!range)return;setPreviewIndex(index);setStatus(`Preview ${formatSkipTimecode(range.start)} → ${formatSkipTimecode(range.end)}`);seek(Math.max(0,range.start-2));window.setTimeout(()=>player.current?.playVideo(),80);}
  function updateRange(index:number,key:"start"|"end",value:number){setRanges(currentRanges=>currentRanges.map((item,itemIndex)=>itemIndex===index?{...item,[key]:value}:item));}
  function updateTimecode(index:number,key:"start"|"end",value:string){
    const draftKey=`${index}-${key}`;setTimecodeDrafts(currentDrafts=>({...currentDrafts,[draftKey]:value}));
    const parsed=parseSkipTimecode(value);if(parsed!==null)updateRange(index,key,parsed);
  }
  function commitTimecode(index:number,key:"start"|"end",fallback:number){
    const draftKey=`${index}-${key}`,draft=timecodeDrafts[draftKey]??formatSkipTimecode(fallback),parsed=parseSkipTimecode(draft);
    if(parsed!==null)setRanges(currentRanges=>currentRanges.map((item,itemIndex)=>itemIndex===index?{...item,[key]:parsed}:item).sort((left,right)=>left.start-right.start));
    setTimecodeDrafts({});
  }
  function deleteRange(index:number){setRanges(value=>value.filter((_,itemIndex)=>itemIndex!==index));setTimecodeDrafts({});setPreviewIndex(null);}
  async function save(){
    if(!video||!metadata||validationErrors.length||saveBusy)return;
    setSaveBusy(true);setStatus("Αποθήκευση metadata και markers…");
    try{
      const response=await fetch("/api/video-editor",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:video.id,metadataVersion:Number(video.metadataVersion||0),metadata,skipRanges:ranges})});
      const result=await response.json() as {ok?:boolean;video?:EditorVideo;error?:string};
      if(!response.ok||!result.ok||!result.video)throw new Error(result.error||"Η αποθήκευση απέτυχε.");
      const nextMetadata=metadataFrom(result.video),nextRanges=normalizeSkipRanges(result.video.skipRanges);
      setVideo(result.video);setMetadata(nextMetadata);setRanges(nextRanges);setTimecodeDrafts({});setInitialSnapshot(snapshotOf(nextMetadata,nextRanges));setStatus("Όλες οι αλλαγές αποθηκεύτηκαν και συγχρονίστηκαν με τον player.");
      window.dispatchEvent(new CustomEvent(SKIP_RANGES_UPDATED_EVENT,{detail:{videoId:result.video.id,skipRanges:nextRanges,metadataVersion:Number(result.video.metadataVersion||0)}}));
    }catch(problem){setStatus(problem instanceof Error?problem.message:"Η αποθήκευση απέτυχε.");}
    finally{setSaveBusy(false);}
  }

  if(!open)return null;
  const progress=duration>0?Math.max(0,Math.min(100,current/duration*100)):0;
  const rulerTicks=duration>0?Array.from({length:9},(_,index)=>index/8*duration):[];
  return createPortal(<>
    <div className="gts-editor-screen" ref={keyboardTarget} tabIndex={-1}>
      {authRequired?<section className="gts-editor-auth"><div className="gts-editor-auth-card"><span className="gts-editor-kicker">VIDEO EDITOR</span><h1>Προστατευμένη επεξεργασία</h1><p>Βάλε τον κωδικό διαχειριστή για να ανοίξει ο νέος editor.</p><form onSubmit={authorize}><input type="password" autoFocus value={password} onChange={event=>setPassword(event.target.value)} placeholder="Κωδικός πρόσβασης"/><button className="primary">Συνέχεια</button></form>{authError&&<small className="gts-editor-error">{authError}</small>}<button className="gts-editor-auth-cancel" onClick={closeEditor}>Ακύρωση</button></div></section>:<>
        <header className="gts-editor-header">
          <button className="gts-editor-back" onClick={closeEditor}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Πίσω στο βίντεο</span></button>
          <div className="gts-editor-title"><span className="gts-editor-kicker">VIDEO EDITOR</span><h1 title={metadata?.title||video?.title||"Επεξεργασία βίντεο"}><strong>{metadata?.title||video?.title||"Επεξεργασία βίντεο"}</strong></h1>{(metadata?.originalTitle||video?.originalTitle)&&<p title={metadata?.originalTitle||video?.originalTitle}>{metadata?.originalTitle||video?.originalTitle}</p>}</div>
          <div className="gts-editor-save-state">{dirty?<span><i/>ΜΗ ΑΠΟΘΗΚΕΥΜΕΝΕΣ ΑΛΛΑΓΕΣ</span>:<span className="saved"><i/>ΑΠΟΘΗΚΕΥΜΕΝΟ</span>}<button className="primary" disabled={!dirty||validationErrors.length>0||saveBusy||loading} onClick={()=>void save()}>{saveBusy?"Αποθήκευση…":"Αποθήκευση"}</button></div>
        </header>
        {loading?<div className="gts-editor-loading"><span className="gts-editor-player-spinner"/>Φόρτωση editor…</div>:video&&metadata?<main className="gts-editor-layout">
          <section className="gts-editor-stage">

            <div className="gts-editor-video"><div ref={host}/><div className={`gts-editor-player-loading ${playerVisualReady?"ready":""}`} aria-hidden={playerVisualReady}><span className="gts-editor-player-spinner"/><strong>ΦΟΡΤΩΣΗ ΒΙΝΤΕΟ</strong></div>{captions&&activeCaption>=0&&<div className="gts-editor-subtitles" aria-live="off">{subtitleWindow(captions.cues[activeCaption],current,captions.cues[activeCaption+1]).split("\n").map((line,index)=><span key={`${activeCaption}-${index}`}>{line}</span>)}</div>}<div className="gts-editor-timecode">{clock(current,true)} <span>/ {clock(duration)}</span></div></div>

            <div className="gts-editor-console">
              <div className="gts-editor-timeline-wrap">
                <div className="gts-editor-timeline" style={{"--editor-seek-progress":`${progress}%`} as CSSProperties}>
                  {duration>0&&ranges.map((range,index)=><i key={`${range.start}-${range.end}-${index}`} className={previewIndex===index?"previewing":""} style={{left:`${Math.max(0,Math.min(100,range.start/duration*100))}%`,width:`${Math.max(.35,Math.min(100,(range.end-range.start)/duration*100))}%`} as CSSProperties}/>)}
                  {duration>0&&draftStart!==null&&<b style={{left:`${Math.max(0,Math.min(100,draftStart/duration*100))}%`} as CSSProperties}/>}
                  {timelinePreview!==null&&duration>0&&<output className="gts-editor-timeline-preview" style={{"--editor-preview-position":`${Math.max(0,Math.min(100,timelinePreview/duration*100))}%`} as CSSProperties}>{clock(timelinePreview,true)}</output>}
                  <input type="range" min={0} max={Math.max(1,duration)} step="0.1" value={Math.min(current,Math.max(1,duration))} onPointerDown={updateTimelinePreview} onPointerMove={updateTimelinePreview} onPointerUp={()=>setTimelinePreview(null)} onPointerCancel={()=>setTimelinePreview(null)} onPointerLeave={()=>setTimelinePreview(null)} onChange={event=>seek(Number(event.target.value))} aria-label="Γραμμή χρόνου editor"/>
                </div>
                <div className="gts-editor-ruler" aria-hidden="true">{rulerTicks.map((tick,index)=><span key={index}>{clock(tick)}</span>)}</div>
              </div>

              <div className="gts-editor-console-top">
                <div className="gts-editor-transport"><button onClick={()=>seek(current-5)} aria-label="Πίσω 5 δευτερόλεπτα"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 19 2 12l9-7v14z"/><path d="M22 19l-9-7 9-7v14z"/></svg><em>5</em></button><button className="gts-editor-play" onClick={toggle} aria-label={playing?"Παύση":"Αναπαραγωγή"}>{playing?<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/></svg>:<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>}</button><button onClick={()=>seek(current+5)} aria-label="Μπροστά 5 δευτερόλεπτα"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m13 19 9-7-9-7v14z"/><path d="M2 19l9-7-9-7v14z"/></svg><em>5</em></button></div>
                <div className="gts-editor-readout"><strong>{clock(current,true)}</strong><span>/ {clock(duration)}</span></div>
                <div className="gts-editor-summary"><span><b>{ranges.length}</b>SKIP RANGES</span><span><b>{clock(totalSkipped)}</b>ΣΥΝΟΛΟ</span></div>
              </div>

              <div className="gts-editor-mark-actions" data-armed={draftStart!==null?"1":"0"}>
                <button className={`gts-mark gts-mark-a ${draftStart!==null?"done":"live"}`} onClick={markStart}><span className="gts-mark-bracket" aria-hidden="true">[</span><span className="gts-mark-body"><b>Σημείο Α · έναρξη</b><em>{draftStart!==null?clock(draftStart,true):`τώρα · ${clock(current,true)}`}</em></span><span className="gts-mark-key" aria-hidden="true">Α</span></button>
                <button className={`gts-mark gts-mark-b ${draftStart!==null?"live":"idle"}`} onClick={markEnd}><span className="gts-mark-key" aria-hidden="true">Β</span><span className="gts-mark-body"><b>Σημείο Β · λήξη</b><em>{draftStart!==null?`κόψε ως εδώ · ${clock(current,true)}`:"όρισε πρώτα το Α"}</em></span><span className="gts-mark-bracket" aria-hidden="true">]</span></button>
              </div>
            </div>

            <section className="gts-editor-ranges">
              <div className="gts-editor-section-head"><div><span className="gts-editor-kicker">SKIP RANGES</span><h2>Περιοχές παράλειψης</h2></div><strong>{ranges.length}</strong></div>
              {ranges.length===0?<div className="gts-editor-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg><p>Δεν υπάρχουν ακόμη ranges. Παίξε το βίντεο και όρισε αρχή και τέλος.</p></div>:<div className="gts-editor-range-list">{ranges.map((range,index)=>{const startKey=`${index}-start`,endKey=`${index}-end`;const startDraft=timecodeDrafts[startKey]??formatSkipTimecode(range.start),endDraft=timecodeDrafts[endKey]??formatSkipTimecode(range.end);return <article key={index} className={`${validationErrors.some(error=>error.startsWith(`Range ${index+1}:`))?"invalid":""} ${previewIndex===index?"is-previewing":""}`}><div className="gts-editor-range-index">{String(index+1).padStart(2,"0")}</div><div className="gts-editor-range-main"><strong className="gts-editor-range-timecode">{formatSkipTimecode(range.start)} <span>→</span> {formatSkipTimecode(range.end)}<em>{formatSkipTimecode(Math.max(0,range.end-range.start))}</em></strong><div className="gts-editor-range-times"><label>ΑΠΟ<input type="text" inputMode="decimal" value={startDraft} aria-invalid={parseSkipTimecode(startDraft)===null} onChange={event=>updateTimecode(index,"start",event.target.value)} onBlur={()=>commitTimecode(index,"start",range.start)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/></label><span>→</span><label>ΜΕΧΡΙ<input type="text" inputMode="decimal" value={endDraft} aria-invalid={parseSkipTimecode(endDraft)===null} onChange={event=>updateTimecode(index,"end",event.target.value)} onBlur={()=>commitTimecode(index,"end",range.end)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/></label></div><div className="gts-editor-range-actions"><button onClick={()=>preview(index)}>{previewIndex===index?"Previewing…":"Preview"}</button><button onClick={()=>seek(range.start)}>Μετάβαση</button><button className="danger" onClick={()=>deleteRange(index)}>Διαγραφή</button></div></div></article>;})}</div>}
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
.gts-editor-screen{position:fixed;inset:0;z-index:2147483200;overflow:auto;background:#161B23;color:#EDF0F5;--e-sans:var(--font-geist-sans),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--e-display:var(--font-geist-sans),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--e-mono:var(--font-geist-mono),ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-family:var(--e-sans);font-size:16px;-webkit-font-smoothing:antialiased;--e-panel:#1E242E;--e-sunk:#191E27;--e-raised:#252C38;--e-hair:rgba(255,255,255,.12);--e-hair-strong:rgba(255,255,255,.22);--e-text:#EDF0F5;--e-muted:#A6AEBC;--e-dim:#828B9A;--e-indigo:#8E82F2;--e-indigo-soft:rgba(142,130,242,.16);--e-amber:#E0A863;--e-amber-soft:rgba(224,168,99,.16);--e-green:#89CFA6;--e-red:#EB8C82}
.gts-editor-screen:focus{outline:none}
.gts-editor-screen *:focus-visible{outline:2px solid var(--e-indigo);outline-offset:2px;border-radius:8px}
.gts-editor-screen button{cursor:pointer;font-family:inherit}

.gts-editor-header{position:sticky;top:0;z-index:20;height:84px;display:grid;grid-template-columns:1fr minmax(0,1.6fr) 1fr;align-items:center;gap:20px;padding:0 clamp(18px,3vw,44px);border-bottom:1px solid var(--e-hair);background:rgba(22,27,35,.94);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
.gts-editor-back{justify-self:start;display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px 0 11px;border:1px solid transparent;border-radius:12px;background:transparent;color:var(--e-muted);font-size:15px;font-weight:550;transition:color .15s,background .15s,border-color .15s}
.gts-editor-back svg{width:19px;height:19px;flex:none}
.gts-editor-back:hover{color:#fff;background:var(--e-raised);border-color:var(--e-hair)}
.gts-editor-title{display:grid;gap:4px;text-align:center;min-width:0}
.gts-editor-title h1,.gts-editor-title p{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gts-editor-title h1{margin:0;font-family:var(--e-display);font-size:19px;font-weight:600;line-height:1.2;letter-spacing:-.02em}
.gts-editor-title h1 strong{display:block;font:inherit}
.gts-editor-title p{margin:0;color:var(--e-dim);font-size:13px;font-weight:500;line-height:1.2}
.gts-editor-title .gts-editor-kicker{font-size:11px!important}
.gts-editor-title .gts-editor-kicker::after{content:none!important}
.gts-editor-kicker{display:block;color:#ABA2F7;font-size:11px;font-weight:700;letter-spacing:.16em;font-family:var(--e-display)}
.gts-editor-save-state{justify-self:end;display:flex;align-items:center;gap:15px}
.gts-editor-save-state>span{display:inline-flex;align-items:center;gap:8px;color:var(--e-amber);font-size:11px;font-weight:700;letter-spacing:.08em;white-space:nowrap;font-family:var(--e-display)}
.gts-editor-save-state>span i{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 0 4px var(--e-amber-soft)}
.gts-editor-save-state>span.saved{color:var(--e-green)}
.gts-editor-save-state>span.saved i{box-shadow:0 0 0 4px rgba(137,207,166,.16)}
.gts-editor-save-state .primary,.gts-editor-mobile-save .primary,.gts-editor-auth .primary{min-height:46px;padding:0 22px;border:0;border-radius:12px;background:var(--e-indigo);color:#fff;font-family:var(--e-display);font-size:15px;font-weight:600;letter-spacing:-.01em;transition:filter .15s,transform .1s,box-shadow .15s;box-shadow:0 8px 22px -6px rgba(142,130,242,.65)}
.gts-editor-save-state .primary:hover:not(:disabled),.gts-editor-mobile-save .primary:hover:not(:disabled),.gts-editor-auth .primary:hover{filter:brightness(1.1)}
.gts-editor-save-state .primary:active:not(:disabled){transform:translateY(1px)}
.gts-editor-save-state .primary:disabled,.gts-editor-mobile-save .primary:disabled{opacity:.38;cursor:not-allowed;filter:none;box-shadow:none}

.gts-editor-layout{width:min(1500px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(0,1.72fr) minmax(360px,.66fr);gap:28px;padding:28px clamp(18px,3vw,44px) 92px;align-items:start}
.gts-editor-stage{min-width:0;display:grid;gap:20px}

.gts-editor-video{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:1px solid var(--e-hair);border-radius:20px;background:#000;box-shadow:0 30px 72px -24px rgba(0,0,0,.78)}
.gts-editor-video>div:first-child,.gts-editor-video iframe{width:100%!important;height:100%!important;border:0}
.gts-editor-timecode{position:absolute;right:16px;bottom:14px;z-index:5;padding:8px 12px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,17,22,.82);font:700 15px var(--e-mono);font-variant-numeric:tabular-nums;backdrop-filter:blur(10px)}
.gts-editor-timecode span{color:var(--e-dim)}

.gts-editor-console{padding:20px 22px 22px;border:1px solid var(--e-hair);border-radius:20px;background:var(--e-panel)}
.gts-editor-console-top{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.gts-editor-transport{display:flex;align-items:center;gap:11px}
.gts-editor-transport button>*{pointer-events:none}
.gts-editor-transport button{position:relative;width:48px;height:44px;display:grid;place-items:center;border:1px solid var(--e-hair);border-radius:14px;background:var(--e-raised);color:#E3E7EE;transition:border-color .15s,background .15s,transform .1s}
.gts-editor-transport button svg{width:18px;height:18px}
.gts-editor-transport button em{position:absolute;right:8px;bottom:5px;font:700 10px var(--e-mono);font-style:normal;color:var(--e-dim)}
.gts-editor-transport button:hover{border-color:var(--e-hair-strong);background:#2B333F}
.gts-editor-transport button:active{transform:translateY(1px)}
.gts-editor-transport .gts-editor-play{width:56px;height:48px;border-color:rgba(155,143,248,.5);background:linear-gradient(150deg,#9C90F5,#7C6FE0);color:#fff;box-shadow:0 12px 28px -8px rgba(122,110,215,.78)}
.gts-editor-transport .gts-editor-play svg{width:21px;height:21px}
.gts-editor-transport .gts-editor-play:hover{border-color:rgba(179,169,249,.72);background:linear-gradient(150deg,#A79CF7,#877BE3)}
.gts-editor-readout{display:flex;align-items:baseline;gap:8px;font-family:var(--e-mono);font-variant-numeric:tabular-nums}
.gts-editor-readout strong{font-size:26px;font-weight:700;letter-spacing:-.03em;color:var(--e-text)}
.gts-editor-readout span{font-size:15px;color:var(--e-dim)}
.gts-editor-summary{margin-left:auto;display:flex;gap:11px}
.gts-editor-summary span{display:grid;gap:2px;min-width:92px;padding:8px 13px;border:1px solid var(--e-hair);border-radius:13px;background:var(--e-sunk);color:var(--e-muted);font-size:11px;font-weight:700;letter-spacing:.09em;font-family:var(--e-display)}
.gts-editor-summary b{font:700 17px var(--e-mono);font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--e-amber)}

.gts-editor-timeline-wrap{margin-top:0;margin-bottom:20px}
.gts-editor-timeline{position:relative;isolation:isolate;height:46px;display:flex;align-items:center}
.gts-editor-timeline:before{content:"";position:absolute;top:50%;left:0;right:0;z-index:0;height:15px;transform:translateY(-50%);border-radius:99px;background:#313947;box-shadow:inset 0 1px 3px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.05)}
.gts-editor-timeline:after{content:"";position:absolute;top:50%;left:0;z-index:1;width:var(--editor-seek-progress);height:15px;transform:translateY(-50%);border-radius:99px;background:linear-gradient(90deg,#7B6FE4,#AB9FF8);box-shadow:0 0 16px -2px rgba(146,133,236,.55);pointer-events:none}
.gts-editor-timeline>i{position:absolute;top:50%;z-index:2;height:23px;transform:translateY(-50%);border-radius:7px;border:1px solid rgba(255,220,164,.42);background:repeating-linear-gradient(115deg,#E0A863 0 7px,#CC9550 7px 14px);box-shadow:0 0 0 1px rgba(0,0,0,.3),0 4px 14px -4px rgba(224,168,99,.72);pointer-events:none}
.gts-editor-timeline>i.previewing{border-color:rgba(179,169,249,.62);background:repeating-linear-gradient(115deg,#AB9FF8 0 7px,#9C90F5 7px 14px);box-shadow:0 0 18px -2px rgba(171,159,248,.82)}
.gts-editor-timeline>b{position:absolute;z-index:3;top:5px;width:3px;height:36px;border-radius:2px;background:#F5D390;box-shadow:0 0 12px rgba(245,211,144,.75);pointer-events:none}
.gts-editor-timeline>b:before{content:"";position:absolute;top:-6px;left:-4px;width:11px;height:11px;border-radius:50%;background:#F5D390}
.gts-editor-timeline input{position:absolute;inset:0;z-index:4;width:100%;height:46px;margin:0;opacity:1;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer;touch-action:pan-y}
.gts-editor-timeline input::-webkit-slider-runnable-track{height:15px;border:0;background:transparent}
.gts-editor-timeline input::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-3.5px;border:3px solid #fff;border-radius:50%;background:var(--e-indigo);box-shadow:0 3px 10px rgba(0,0,0,.6),0 0 0 3px rgba(142,130,242,.3)}
.gts-editor-timeline input::-moz-range-track{height:15px;border:0;background:transparent}
.gts-editor-timeline input::-moz-range-progress{height:15px;background:transparent}
.gts-editor-timeline input::-moz-range-thumb{width:19px;height:19px;border:3px solid #fff;border-radius:50%;background:var(--e-indigo);box-shadow:0 3px 10px rgba(0,0,0,.6),0 0 0 3px rgba(142,130,242,.3)}
.gts-editor-timeline input:focus-visible{outline:none}
.gts-editor-timeline input:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 5px rgba(171,159,248,.42),0 3px 10px rgba(0,0,0,.6)}
.gts-editor-timeline input:focus-visible::-moz-range-thumb{box-shadow:0 0 0 5px rgba(171,159,248,.42),0 3px 10px rgba(0,0,0,.6)}
.gts-editor-timeline-preview{position:absolute;left:clamp(34px,var(--editor-preview-position),calc(100% - 34px));bottom:46px;z-index:6;min-width:64px;padding:8px 10px;transform:translateX(-50%);border:1px solid var(--e-hair-strong);border-radius:10px;background:#2B333F;color:#fff;font:700 13px/1 var(--e-mono);font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap;pointer-events:none;box-shadow:0 10px 26px rgba(0,0,0,.5)}
.gts-editor-ruler{display:flex;justify-content:space-between;margin-top:10px;padding:0 2px;color:var(--e-dim);font:600 11.5px var(--e-mono);font-variant-numeric:tabular-nums}
.gts-editor-ruler span{position:relative;padding-top:9px}
.gts-editor-ruler span:before{content:"";position:absolute;top:0;left:50%;width:1px;height:5px;background:rgba(255,255,255,.18)}
.gts-editor-ruler span:first-child:before{left:0}
.gts-editor-ruler span:last-child:before{left:auto;right:0}

/* ---- marker buttons: an A—[ ]—B bracket the user "closes" ---- */
.gts-editor-mark-actions{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;position:relative}
.gts-editor-mark-actions:before{content:"";position:absolute;left:50%;top:50%;width:34px;height:2px;transform:translate(-50%,-50%);background:var(--e-hair);border-radius:2px;z-index:1}
.gts-editor-mark-actions[data-armed="1"]:before{background:linear-gradient(90deg,var(--e-amber),var(--e-indigo));box-shadow:0 0 12px rgba(171,159,248,.5)}
.gts-mark>*{pointer-events:none}
.gts-mark{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:13px;min-height:82px;padding:16px 18px;border:1px solid var(--e-hair);border-radius:17px;background:var(--e-raised);color:var(--e-text);text-align:left;transition:border-color .15s,background .15s,box-shadow .15s,transform .1s}
.gts-mark:hover{border-color:var(--e-hair-strong);background:#2B333F}
.gts-mark:active{transform:translateY(1px)}
.gts-mark-bracket{font:700 40px/1 var(--e-display);color:var(--e-dim);transition:color .15s}
.gts-mark-key{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:10px;background:var(--e-sunk);border:1px solid var(--e-hair);color:var(--e-muted);font:700 16px var(--e-display);transition:background .15s,color .15s,border-color .15s}
.gts-mark-body{min-width:0}
.gts-mark-body b{display:block;margin-bottom:4px;font-family:var(--e-display);font-size:15.5px;font-weight:600;letter-spacing:-.01em;color:var(--e-text)}
.gts-mark-body em{display:block;font:600 13px var(--e-mono);font-variant-numeric:tabular-nums;font-style:normal;color:var(--e-muted)}
.gts-mark-a.live{border-color:rgba(224,168,99,.6);background:var(--e-amber-soft)}
.gts-mark-a.live .gts-mark-bracket,.gts-mark-a.done .gts-mark-bracket{color:var(--e-amber)}
.gts-mark-a.live .gts-mark-key,.gts-mark-a.done .gts-mark-key{background:var(--e-amber);border-color:var(--e-amber);color:#241804}
.gts-mark-a.done{border-color:rgba(224,168,99,.32)}
.gts-mark-b.idle{opacity:.62}
.gts-mark-b.idle .gts-mark-bracket{color:#4E5665}
.gts-mark-b.live{border-color:rgba(155,143,248,.62);background:var(--e-indigo-soft);box-shadow:0 0 0 1px rgba(142,130,242,.22)}
.gts-mark-b.live .gts-mark-bracket{color:var(--e-indigo)}
.gts-mark-b.live .gts-mark-key{background:var(--e-indigo);border-color:var(--e-indigo);color:#fff}

.gts-editor-ranges{padding:24px;border:1px solid var(--e-hair);border-radius:20px;background:var(--e-panel)}
.gts-editor-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.gts-editor-section-head h2{margin:6px 0 0;font-family:var(--e-display);font-size:21px;font-weight:600;letter-spacing:-.025em}
.gts-editor-section-head>strong{min-width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--e-hair);border-radius:12px;background:var(--e-sunk);color:#BAB1F9;font:700 15px var(--e-mono)}
.gts-editor-empty{display:grid;justify-items:center;gap:14px;margin-top:18px;padding:38px 22px;border:1px dashed rgba(255,255,255,.16);border-radius:16px;color:var(--e-muted);text-align:center}
.gts-editor-empty svg{width:34px;height:34px;color:#525A69}
.gts-editor-empty p{margin:0;font-size:15px;line-height:1.6;max-width:34ch}
.gts-editor-range-list{display:grid;gap:11px;margin-top:20px}
.gts-editor-range-list article{display:grid;grid-template-columns:46px 1fr;gap:15px;padding:16px;border:1px solid var(--e-hair);border-radius:16px;background:var(--e-raised);transition:border-color .15s,background .15s}
.gts-editor-range-list article:hover{border-color:var(--e-hair-strong)}
.gts-editor-range-list article.is-previewing{border-color:rgba(155,143,248,.62);background:var(--e-indigo-soft)}
.gts-editor-range-list article.invalid{border-color:rgba(235,140,130,.55);background:rgba(235,140,130,.08)}
.gts-editor-range-index{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:#2B3341;color:#C7CDD8;font:700 15px var(--e-mono)}
.gts-editor-range-timecode{display:flex;align-items:center;gap:2px;margin:0 0 13px;color:#F5F3FF;font:700 18px var(--e-mono);font-variant-numeric:tabular-nums;letter-spacing:-.025em}
.gts-editor-range-timecode span{padding:0 8px;color:#A197EC}
.gts-editor-range-timecode em{margin-left:auto;padding:5px 11px;border-radius:8px;background:var(--e-amber-soft);color:var(--e-amber);font-size:13px;font-weight:700;font-style:normal;letter-spacing:0}
.gts-editor-range-times{display:grid;grid-template-columns:minmax(112px,1fr) auto minmax(112px,1fr);gap:11px;align-items:end}
.gts-editor-range-times label{display:grid;color:var(--e-muted);font-size:11px;font-weight:700;letter-spacing:.1em;font-family:var(--e-display)}
.gts-editor-range-times input{width:100%;height:44px;margin-top:7px;padding:0 12px;border:1px solid var(--e-hair);border-radius:11px;background:var(--e-sunk);color:var(--e-text);font:700 16px var(--e-mono);font-variant-numeric:tabular-nums;outline:none;transition:border-color .15s,box-shadow .15s}
.gts-editor-range-times input:hover{border-color:var(--e-hair-strong)}
.gts-editor-range-times input:focus{border-color:rgba(155,143,248,.65);box-shadow:0 0 0 3px rgba(155,143,248,.14)}
.gts-editor-range-times input[aria-invalid=true]{border-color:rgba(235,140,130,.75);box-shadow:0 0 0 3px rgba(235,140,130,.14)}
.gts-editor-range-times>span{padding-bottom:12px;color:#727B8A}
.gts-editor-range-actions{display:flex;gap:9px;margin-top:14px}
.gts-editor-range-actions button{min-height:38px;padding:0 16px;border:1px solid var(--e-hair);border-radius:11px;background:transparent;color:var(--e-muted);font-family:var(--e-display);font-size:13px;font-weight:550;transition:background .15s,color .15s,border-color .15s}
.gts-editor-range-actions button:hover{background:rgba(255,255,255,.07);border-color:var(--e-hair-strong);color:#fff}
.gts-editor-range-actions button.danger{margin-left:auto;color:var(--e-red)}
.gts-editor-range-actions button.danger:hover{background:rgba(235,140,130,.14);border-color:rgba(235,140,130,.45);color:#F4A79E}

.gts-editor-sidebar{display:grid;align-content:start;gap:16px;position:sticky;top:100px}
.gts-editor-card{padding:24px;border:1px solid var(--e-hair);border-radius:20px;background:var(--e-panel)}
.gts-editor-form{display:grid;gap:16px;margin-top:20px}
.gts-editor-form label{display:grid;gap:8px;color:var(--e-muted);font-size:12px;font-weight:650;letter-spacing:.02em;font-family:var(--e-display)}
.gts-editor-form input,.gts-editor-form select,.gts-editor-form textarea{width:100%;border:1px solid var(--e-hair);border-radius:12px;background:var(--e-raised);color:var(--e-text);outline:none;font-family:var(--e-sans);font-size:15px;transition:border-color .15s,box-shadow .15s,background .15s}
.gts-editor-form input,.gts-editor-form select{height:48px;padding:0 14px}
.gts-editor-form textarea{min-height:112px;padding:13px 14px;resize:vertical;line-height:1.6}
.gts-editor-form input:hover,.gts-editor-form select:hover,.gts-editor-form textarea:hover{border-color:var(--e-hair-strong)}
.gts-editor-form input:focus,.gts-editor-form select:focus,.gts-editor-form textarea:focus{border-color:rgba(155,143,248,.65);background:var(--e-sunk);box-shadow:0 0 0 3px rgba(155,143,248,.14)}
.gts-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gts-editor-validation p,.gts-editor-validation ul{margin:15px 0 0;color:var(--e-muted);font-size:14px;line-height:1.65}
.gts-editor-validation ul{padding-left:21px;color:var(--e-red)}
.gts-editor-validation.ok{border-color:rgba(105,190,141,.28)}
.gts-editor-validation.ok .gts-editor-section-head>strong{color:var(--e-green);background:rgba(105,190,141,.13);border-color:rgba(105,190,141,.3)}
.gts-editor-validation.has-errors{border-color:rgba(235,140,130,.34)}
.gts-editor-validation.has-errors .gts-editor-section-head>strong{color:var(--e-red);background:rgba(235,140,130,.12);border-color:rgba(235,140,130,.34)}
.gts-editor-status{padding:16px 18px;border:1px solid rgba(155,143,248,.28);border-radius:14px;background:var(--e-indigo-soft);color:#CEC7FA;font-size:14px;line-height:1.55}

.gts-editor-loading{min-height:55vh;display:grid;place-items:center;align-content:center;gap:17px;color:var(--e-muted);font-size:16px}
.gts-editor-mobile-save{display:none}

.gts-editor-auth{min-height:100dvh;display:grid;place-items:center;padding:20px}
.gts-editor-auth-card{width:min(420px,100%);padding:32px;border:1px solid var(--e-hair);border-radius:22px;background:var(--e-panel);box-shadow:0 36px 90px -30px rgba(0,0,0,.85)}
.gts-editor-auth-card h1{margin:10px 0 11px;font-family:var(--e-display);font-size:26px;font-weight:600;letter-spacing:-.025em}
.gts-editor-auth-card p{margin:0 0 22px;color:var(--e-muted);font-size:15px;line-height:1.6}
.gts-editor-auth-card form{display:grid;gap:12px}
.gts-editor-auth-card input{height:52px;padding:0 15px;border:1px solid var(--e-hair);border-radius:13px;background:var(--e-raised);color:#fff;font-family:var(--e-sans);font-size:15px;outline:none;transition:border-color .15s,box-shadow .15s}
.gts-editor-auth-card input:focus{border-color:rgba(155,143,248,.65);box-shadow:0 0 0 3px rgba(155,143,248,.14)}
.gts-editor-auth .primary{width:100%}
.gts-editor-error{display:block;margin-top:13px;color:var(--e-red);font-size:13.5px}
.gts-editor-auth-cancel{width:100%;margin-top:11px;padding:11px;border:0;background:transparent;color:var(--e-dim);font-size:13.5px;transition:color .15s}
.gts-editor-auth-cancel:hover{color:#C7CDD8}

.gts-editor-subtitles{box-sizing:border-box;position:absolute;z-index:4;left:50%;bottom:8%;width:min(88%,760px);transform:translateX(-50%);padding:10px 15px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(0,0,0,.84);color:#fff;font-family:var(--e-sans);font-size:clamp(15px,1.75vw,26px);font-weight:650;line-height:1.35;text-align:center;pointer-events:none}
.gts-editor-subtitles span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gts-editor-player-loading{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:radial-gradient(circle at 50% 45%,rgba(52,47,86,.44),rgba(10,12,16,.94) 72%);color:#DFDAFF;opacity:1;visibility:visible;pointer-events:none;transition:opacity .28s ease,visibility 0s linear 0s}
.gts-editor-player-loading.ready{opacity:0;visibility:hidden;transition:opacity .28s ease,visibility 0s linear .28s}
.gts-editor-player-spinner{width:38px;height:38px;border:2px solid rgba(171,159,248,.26);border-top-color:#AB9FF8;border-radius:50%;animation:gts-editor-spin .8s linear infinite}
.gts-editor-player-loading strong{font-family:var(--e-display);font-size:12px;font-weight:700;letter-spacing:.16em}
@keyframes gts-editor-spin{to{transform:rotate(360deg)}}

@media(max-width:1100px){
.gts-editor-layout{grid-template-columns:minmax(0,1fr);gap:22px}
.gts-editor-sidebar{position:static}
}
@media(max-width:900px){
.gts-editor-header{grid-template-columns:auto minmax(0,1fr) auto;height:70px;padding:0 13px;gap:12px}
.gts-editor-back{height:40px;padding:0 10px}
.gts-editor-back span,.gts-editor-save-state>span{display:none}
.gts-editor-title{text-align:left}
.gts-editor-title h1{font-size:15px}
.gts-editor-title p{font-size:11.5px}
.gts-editor-save-state .primary{display:none}
.gts-editor-layout{padding:16px 13px 100px;gap:18px}
.gts-editor-stage{gap:16px}
.gts-editor-video{border-radius:15px}
.gts-editor-console{padding:16px;border-radius:16px}
.gts-editor-console-top{gap:14px}
.gts-editor-transport{order:2;width:100%;justify-content:center}
.gts-editor-readout{order:1;width:100%;justify-content:center}
.gts-editor-readout strong{font-size:34px}
.gts-editor-summary{order:3;margin-left:0;width:100%}
.gts-editor-summary span{flex:1;min-width:0;text-align:center;justify-items:center}
.gts-editor-timeline-wrap{margin-top:18px}
.gts-editor-timeline{height:52px}
.gts-editor-timeline input{height:52px;touch-action:pan-x}
.gts-editor-timeline input::-webkit-slider-thumb{width:26px;height:26px;margin-top:-5.5px}
.gts-editor-timeline input::-moz-range-thumb{width:23px;height:23px}
.gts-editor-ruler span:nth-child(even){display:none}
.gts-editor-mark-actions{gap:11px;margin-top:18px}
.gts-mark{min-height:74px;padding:13px 14px;gap:11px}
.gts-mark-bracket{font-size:34px}
.gts-mark-key{width:32px;height:32px}
.gts-editor-ranges,.gts-editor-card{padding:17px;border-radius:16px}
.gts-editor-section-head h2{font-size:18px}
.gts-editor-sidebar{gap:13px}
.gts-editor-grid{grid-template-columns:1fr}
.gts-editor-range-list article{grid-template-columns:36px 1fr;gap:12px;padding:13px}
.gts-editor-range-index{width:36px;height:36px;font-size:13px}
.gts-editor-range-timecode{font-size:16px;flex-wrap:wrap}
.gts-editor-range-times{grid-template-columns:1fr auto 1fr;gap:8px}
.gts-editor-range-actions button{font-size:13.5px;min-height:40px}
.gts-editor-mobile-save{position:fixed;left:0;right:0;bottom:0;z-index:25;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px calc(13px + env(safe-area-inset-bottom));border-top:1px solid var(--e-hair);background:rgba(22,27,35,.96);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.gts-editor-mobile-save div{color:var(--e-muted);font-size:13px;font-weight:550}
.gts-editor-mobile-save .primary{min-width:142px}
}
@media(max-width:430px){
.gts-editor-mark-actions{grid-template-columns:1fr}
.gts-editor-mark-actions:before{display:none}
.gts-mark{min-height:66px}
.gts-editor-range-times{grid-template-columns:1fr;gap:10px}
.gts-editor-range-times>span{display:none}
.gts-editor-range-actions{flex-wrap:wrap}
.gts-editor-range-actions button.danger{margin-left:0;width:100%}
.gts-editor-title h1,.gts-editor-title p{max-width:52vw}
.gts-editor-readout strong{font-size:30px}
}
@media(prefers-reduced-motion:reduce){
.gts-editor-screen *{animation-duration:.01ms!important;transition-duration:.01ms!important}
}
`;

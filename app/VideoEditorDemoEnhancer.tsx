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
  return createPortal(<>
    <div className="gts-editor-screen" ref={keyboardTarget} tabIndex={-1}>
      {authRequired?<section className="gts-editor-auth"><div className="gts-editor-auth-card"><span className="gts-editor-kicker">VIDEO EDITOR</span><h1>Προστατευμένη επεξεργασία</h1><p>Βάλε τον κωδικό διαχειριστή για να ανοίξει ο νέος editor.</p><form onSubmit={authorize}><input type="password" autoFocus value={password} onChange={event=>setPassword(event.target.value)} placeholder="Κωδικός πρόσβασης"/><button className="primary">Συνέχεια</button></form>{authError&&<small className="gts-editor-error">{authError}</small>}<button className="gts-editor-auth-cancel" onClick={closeEditor}>Ακύρωση</button></div></section>:<>
        <header className="gts-editor-header"><button className="gts-editor-back" onClick={closeEditor}>← <span>Πίσω στο βίντεο</span></button><div className="gts-editor-title"><span className="gts-editor-kicker">VIDEO EDITOR</span><h1 title={metadata?.title||video?.title||"Επεξεργασία βίντεο"}><strong>{metadata?.title||video?.title||"Επεξεργασία βίντεο"}</strong></h1>{(metadata?.originalTitle||video?.originalTitle)&&<p title={metadata?.originalTitle||video?.originalTitle}>{metadata?.originalTitle||video?.originalTitle}</p>}</div><div className="gts-editor-save-state">{dirty?<span>ΜΗ ΑΠΟΘΗΚΕΥΜΕΝΕΣ ΑΛΛΑΓΕΣ</span>:<span className="saved">ΑΠΟΘΗΚΕΥΜΕΝΟ</span>}<button className="primary" disabled={!dirty||validationErrors.length>0||saveBusy||loading} onClick={()=>void save()}>{saveBusy?"Αποθήκευση…":"Αποθήκευση"}</button></div></header>
        {loading?<div className="gts-editor-loading">Φόρτωση editor…</div>:video&&metadata?<main className="gts-editor-layout">
          <section className="gts-editor-stage">
            <div className="gts-editor-video"><div ref={host}/><div className={`gts-editor-player-loading ${playerVisualReady?"ready":""}`} aria-hidden={playerVisualReady}><span className="gts-editor-player-spinner"/><strong>ΦΟΡΤΩΣΗ ΒΙΝΤΕΟ</strong></div>{captions&&activeCaption>=0&&<div className="gts-editor-subtitles" aria-live="off">{subtitleWindow(captions.cues[activeCaption],current,captions.cues[activeCaption+1]).split("\n").map((line,index)=><span key={`${activeCaption}-${index}`}>{line}</span>)}</div>}<div className="gts-editor-timecode">{clock(current,true)} <span>/ {clock(duration)}</span></div></div>
            <div className="gts-editor-transport"><button onClick={()=>seek(current-5)} aria-label="Πίσω 5 δευτερόλεπτα">−5</button><button className="gts-editor-play" onClick={toggle} aria-label={playing?"Παύση":"Αναπαραγωγή"}>{playing?"❚❚":"▶"}</button><button onClick={()=>seek(current+5)} aria-label="Μπροστά 5 δευτερόλεπτα">+5</button></div>
            <div className="gts-editor-timeline-wrap">
              <div className="gts-editor-timeline" style={{"--editor-seek-progress":`${duration>0?Math.max(0,Math.min(100,current/duration*100)):0}%`} as CSSProperties}>
                {duration>0&&ranges.map((range,index)=><i key={`${range.start}-${range.end}-${index}`} className={previewIndex===index?"previewing":""} style={{left:`${Math.max(0,Math.min(100,range.start/duration*100))}%`,width:`${Math.max(.35,Math.min(100,(range.end-range.start)/duration*100))}%`} as CSSProperties}/>) }
                {duration>0&&draftStart!==null&&<b style={{left:`${Math.max(0,Math.min(100,draftStart/duration*100))}%`} as CSSProperties}/>} 
                {timelinePreview!==null&&duration>0&&<output className="gts-editor-timeline-preview" style={{"--editor-preview-position":`${Math.max(0,Math.min(100,timelinePreview/duration*100))}%`} as CSSProperties}>{clock(timelinePreview,true)}</output>}
                <input type="range" min={0} max={Math.max(1,duration)} step="0.1" value={Math.min(current,Math.max(1,duration))} onPointerDown={updateTimelinePreview} onPointerMove={updateTimelinePreview} onPointerUp={()=>setTimelinePreview(null)} onPointerCancel={()=>setTimelinePreview(null)} onPointerLeave={()=>setTimelinePreview(null)} onChange={event=>seek(Number(event.target.value))} aria-label="Γραμμή χρόνου editor"/>
              </div>
              <div className="gts-editor-timeline-labels"><span>{clock(current,true)} / {clock(duration)}</span><strong>{ranges.length} SKIP RANGES · {clock(totalSkipped)} ΣΥΝΟΛΟ</strong></div>
            </div>
            <div className="gts-editor-mark-actions"><button className={draftStart!==null?"active":""} onClick={markStart}><small>01</small><span><b>Ορισμός αρχής</b>{draftStart!==null?clock(draftStart,true):"Στο τρέχον σημείο"}</span></button><button onClick={markEnd}><small>02</small><span><b>Ορισμός τέλους</b>Δημιουργία skip range</span></button></div>
            <section className="gts-editor-ranges"><div className="gts-editor-section-head"><div><span className="gts-editor-kicker">SKIP RANGES</span><h2>Περιοχές παράλειψης</h2></div><strong>{ranges.length}</strong></div>
              {ranges.length===0?<div className="gts-editor-empty">Δεν υπάρχουν ακόμη ranges. Παίξε το βίντεο και όρισε αρχή και τέλος.</div>:<div className="gts-editor-range-list">{ranges.map((range,index)=>{const startKey=`${index}-start`,endKey=`${index}-end`;const startDraft=timecodeDrafts[startKey]??formatSkipTimecode(range.start),endDraft=timecodeDrafts[endKey]??formatSkipTimecode(range.end);return <article key={index} className={validationErrors.some(error=>error.startsWith(`Range ${index+1}:`))?"invalid":""}><div className="gts-editor-range-index">{String(index+1).padStart(2,"0")}</div><div className="gts-editor-range-main"><strong className="gts-editor-range-timecode">{formatSkipTimecode(range.start)} <span>→</span> {formatSkipTimecode(range.end)}</strong><div className="gts-editor-range-times"><label>ΑΠΟ<input type="text" inputMode="decimal" value={startDraft} aria-invalid={parseSkipTimecode(startDraft)===null} onChange={event=>updateTimecode(index,"start",event.target.value)} onBlur={()=>commitTimecode(index,"start",range.start)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/></label><span>→</span><label>ΜΕΧΡΙ<input type="text" inputMode="decimal" value={endDraft} aria-invalid={parseSkipTimecode(endDraft)===null} onChange={event=>updateTimecode(index,"end",event.target.value)} onBlur={()=>commitTimecode(index,"end",range.end)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/></label><em>{formatSkipTimecode(Math.max(0,range.end-range.start))}</em></div><div className="gts-editor-range-actions"><button onClick={()=>preview(index)}>{previewIndex===index?"Previewing…":"Preview"}</button><button onClick={()=>seek(range.start)}>Μετάβαση</button><button className="danger" onClick={()=>deleteRange(index)}>Διαγραφή</button></div></div></article>;})}</div>}
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
.gts-editor-screen:focus{outline:none}.gts-editor-timeline-preview{position:absolute;left:clamp(30px,var(--editor-preview-position),calc(100% - 30px));bottom:25px;z-index:5;min-width:58px;padding:6px 8px;transform:translateX(-50%);border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(28,33,41,.96);color:#f4f1ff;font:650 11px/1 var(--font-geist-mono),monospace;font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.34)}
.gts-editor-screen{position:fixed;inset:0;z-index:2147483200;overflow:auto;background:#12151b;color:#f2f3f6;font-family:var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.gts-editor-header{position:sticky;top:0;z-index:20;height:76px;display:grid;grid-template-columns:1fr minmax(0,1.5fr) 1fr;align-items:center;gap:18px;padding:0 clamp(16px,3vw,38px);border-bottom:1px solid rgba(255,255,255,.11);background:rgba(20,24,31,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}.gts-editor-back{justify-self:start;border:0;background:transparent;color:#a4acb9;font-size:13px;font-weight:500;cursor:pointer;transition:color .15s ease}.gts-editor-back:hover{color:#fff}.gts-editor-title{display:grid;gap:3px;text-align:center;min-width:0}.gts-editor-title h1,.gts-editor-title p{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gts-editor-title h1{margin:0;font-size:16px;font-weight:650;line-height:1.2;letter-spacing:-.015em}.gts-editor-title h1 strong{display:block;font:inherit}.gts-editor-title p{margin:0;color:#8b93a0;font-size:11px;font-weight:500;line-height:1.2}.gts-editor-title .gts-editor-kicker{font-size:9.5px!important}.gts-editor-title .gts-editor-kicker::after{content:none!important}.gts-editor-kicker{display:block;color:#a49af5;font-size:9.5px;font-weight:760;letter-spacing:.14em}.gts-editor-save-state{justify-self:end;display:flex;align-items:center;gap:13px}.gts-editor-save-state>span{color:#e0aa63;font-size:9.5px;font-weight:760;letter-spacing:.09em}.gts-editor-save-state>span.saved{color:#83c9a2}.gts-editor-save-state .primary,.gts-editor-mobile-save .primary,.gts-editor-auth .primary{min-height:42px;padding:0 18px;border:0;border-radius:11px;background:#8b7ff0;color:#fff;font-size:13px;font-weight:650;cursor:pointer;transition:filter .15s ease,transform .12s ease}.gts-editor-save-state .primary:hover:not(:disabled),.gts-editor-mobile-save .primary:hover:not(:disabled){filter:brightness(1.09)}.gts-editor-save-state .primary:active:not(:disabled){transform:translateY(1px)}.gts-editor-save-state .primary:disabled,.gts-editor-mobile-save .primary:disabled{opacity:.4;cursor:not-allowed;filter:none}.gts-editor-layout{width:min(1480px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(348px,.7fr);gap:24px;padding:26px clamp(16px,3vw,38px) 80px}.gts-editor-stage{min-width:0}.gts-editor-video{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:#000;box-shadow:0 24px 70px rgba(0,0,0,.34)}.gts-editor-video>div:first-child,.gts-editor-video iframe{width:100%!important;height:100%!important;border:0}.gts-editor-timecode{position:absolute;right:14px;bottom:12px;padding:7px 11px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(18,21,27,.82);font:650 13px var(--font-geist-mono),monospace;font-variant-numeric:tabular-nums;backdrop-filter:blur(8px)}.gts-editor-timecode span{color:#8b93a0}.gts-editor-transport{display:flex;align-items:center;justify-content:center;gap:11px;padding:17px 0 12px}.gts-editor-transport button{width:50px;height:46px;border:1px solid rgba(255,255,255,.13);border-radius:13px;background:#1c212a;color:#dde1e7;font-size:13px;font-weight:650;cursor:pointer;transition:border-color .15s ease,background .15s ease}.gts-editor-transport button:hover{border-color:rgba(255,255,255,.24);background:#232935}.gts-editor-transport .gts-editor-play{width:62px;height:52px;border-color:rgba(155,143,248,.48);background:linear-gradient(145deg,#9186f2,#7669d4);color:#fff;font-size:19px;box-shadow:0 9px 25px rgba(122,110,215,.3)}.gts-editor-transport .gts-editor-play:hover{background:linear-gradient(145deg,#9c92f5,#8175dd)}.gts-editor-timeline-wrap{padding:4px 2px 18px}.gts-editor-timeline{position:relative;height:26px;display:flex;align-items:center}.gts-editor-timeline:before{content:"";position:absolute;left:0;right:0;height:6px;border-radius:99px;background:#333a47}.gts-editor-timeline>i{position:absolute;z-index:2;height:9px;border-radius:99px;background:#d49a55;box-shadow:0 0 0 1px rgba(255,214,150,.16),0 0 13px rgba(212,154,85,.24);pointer-events:none}.gts-editor-timeline>i.previewing{background:#a99df7;box-shadow:0 0 16px rgba(169,157,247,.5)}.gts-editor-timeline>b{position:absolute;z-index:3;top:2px;width:2px;height:22px;background:#f3cf8d;pointer-events:none}.gts-editor-timeline input{position:absolute;z-index:4;width:100%;height:26px;margin:0;opacity:.01;cursor:pointer}.gts-editor-timeline-labels{display:flex;justify-content:space-between;align-items:center;color:#8b93a0;font:600 11px var(--font-geist-mono),monospace;font-variant-numeric:tabular-nums}.gts-editor-timeline-labels strong{color:#a4acb9;font-size:10px;letter-spacing:.06em}.gts-editor-mark-actions{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:0 0 26px}.gts-editor-mark-actions button{display:grid;grid-template-columns:38px 1fr;align-items:center;gap:11px;min-height:70px;padding:12px 14px;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:#1a1f27;color:#f2f3f6;text-align:left;cursor:pointer;transition:border-color .15s ease,background .15s ease}.gts-editor-mark-actions button:hover{border-color:rgba(255,255,255,.22);background:#212731}.gts-editor-mark-actions button.active{border-color:rgba(212,154,85,.58);background:rgba(212,154,85,.12)}.gts-editor-mark-actions small{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#272e3a;color:#c3cad4;font:650 11px var(--font-geist-mono),monospace}.gts-editor-mark-actions span{display:block;color:#9ba2ad;font-size:12px}.gts-editor-mark-actions b{display:block;margin-bottom:4px;color:#f2f3f6;font-size:14px;font-weight:650}.gts-editor-ranges{padding:20px;border:1px solid rgba(255,255,255,.11);border-radius:18px;background:#1a1f27}.gts-editor-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.gts-editor-section-head h2{margin:5px 0 0;font-size:18px;font-weight:650;letter-spacing:-.025em}.gts-editor-section-head>strong{min-width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#242b36;color:#b7aef7;font-size:13px;font-weight:650}.gts-editor-empty{margin-top:16px;padding:26px;border:1px dashed rgba(255,255,255,.16);border-radius:14px;color:#9ba2ad;font-size:13px;line-height:1.55;text-align:center}.gts-editor-range-list{display:grid;gap:9px;margin-top:16px}.gts-editor-range-list article{display:grid;grid-template-columns:42px 1fr;gap:12px;padding:13px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#1f242e;transition:border-color .15s ease}.gts-editor-range-list article:hover{border-color:rgba(255,255,255,.18)}.gts-editor-range-list article.invalid{border-color:rgba(232,116,106,.5);background:rgba(232,116,106,.07)}.gts-editor-range-index{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:#2b3341;color:#c3cad4;font:650 12px var(--font-geist-mono),monospace}.gts-editor-range-times{display:grid;grid-template-columns:minmax(105px,1fr) auto minmax(105px,1fr) auto;gap:9px;align-items:end}.gts-editor-range-times label{color:#8b93a0;font-size:9px;font-weight:750;letter-spacing:.09em}.gts-editor-range-times input{width:100%;height:38px;margin-top:5px;padding:0 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:#161a21;color:#f2f3f6;font:600 13px var(--font-geist-mono),monospace;font-variant-numeric:tabular-nums;outline:none;transition:border-color .15s ease,box-shadow .15s ease}.gts-editor-range-times input:focus{border-color:rgba(155,143,248,.55);box-shadow:0 0 0 3px rgba(155,143,248,.1)}.gts-editor-range-times span{padding-bottom:10px;color:#6d7683}.gts-editor-range-times em{padding-bottom:10px;color:#d49a55;font:650 11px var(--font-geist-mono),monospace;font-style:normal}.gts-editor-range-actions{display:flex;gap:8px;margin-top:10px}.gts-editor-range-actions button{min-height:33px;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:transparent;color:#a4acb9;font-size:11.5px;font-weight:500;cursor:pointer;transition:background .15s ease,color .15s ease}.gts-editor-range-actions button:hover{background:rgba(255,255,255,.07);color:#fff}.gts-editor-range-actions button.danger{margin-left:auto;color:#e5897f}.gts-editor-range-actions button.danger:hover{background:rgba(232,116,106,.12);color:#f0a49b}.gts-editor-sidebar{display:grid;align-content:start;gap:14px}.gts-editor-card{padding:20px;border:1px solid rgba(255,255,255,.11);border-radius:18px;background:#1a1f27}.gts-editor-form{display:grid;gap:14px;margin-top:18px}.gts-editor-form label{display:grid;gap:6px;color:#9ba2ad;font-size:10.5px;font-weight:620;letter-spacing:.02em}.gts-editor-form input,.gts-editor-form select,.gts-editor-form textarea{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:#212731;color:#f2f3f6;outline:none;font-size:13px;transition:border-color .15s ease,box-shadow .15s ease}.gts-editor-form input,.gts-editor-form select{height:43px;padding:0 12px}.gts-editor-form textarea{min-height:104px;padding:11px 12px;resize:vertical;line-height:1.55}.gts-editor-form input:focus,.gts-editor-form select:focus,.gts-editor-form textarea:focus{border-color:rgba(155,143,248,.55);box-shadow:0 0 0 3px rgba(155,143,248,.1)}.gts-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.gts-editor-validation p,.gts-editor-validation ul{margin:13px 0 0;color:#9ba2ad;font-size:12.5px;line-height:1.6}.gts-editor-validation ul{padding-left:19px;color:#e5897f}.gts-editor-validation.ok{border-color:rgba(105,190,141,.24)}.gts-editor-validation.ok .gts-editor-section-head>strong{color:#83c9a2;background:rgba(105,190,141,.11)}.gts-editor-validation.has-errors{border-color:rgba(232,116,106,.3)}.gts-editor-validation.has-errors .gts-editor-section-head>strong{color:#e5897f;background:rgba(232,116,106,.1)}.gts-editor-status{padding:14px 16px;border:1px solid rgba(155,143,248,.24);border-radius:13px;background:rgba(155,143,248,.1);color:#c4bcf7;font-size:12.5px;line-height:1.5}.gts-editor-loading{min-height:55vh;display:grid;place-items:center;color:#9ba2ad;font-size:14px}.gts-editor-mobile-save{display:none}.gts-editor-auth{min-height:100dvh;display:grid;place-items:center;padding:20px}.gts-editor-auth-card{width:min(400px,100%);padding:28px;border:1px solid rgba(255,255,255,.13);border-radius:20px;background:#1a1f27;box-shadow:0 30px 90px rgba(0,0,0,.4)}.gts-editor-auth-card h1{margin:8px 0 9px;font-size:23px;font-weight:650;letter-spacing:-.02em}.gts-editor-auth-card p{margin:0 0 18px;color:#9ba2ad;font-size:13px;line-height:1.6}.gts-editor-auth-card form{display:grid;gap:10px}.gts-editor-auth-card input{height:46px;padding:0 13px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:#212731;color:#fff;font-size:14px;outline:none;transition:border-color .15s ease}.gts-editor-auth-card input:focus{border-color:rgba(155,143,248,.55)}.gts-editor-error{display:block;margin-top:11px;color:#e5897f;font-size:12px}.gts-editor-auth-cancel{width:100%;margin-top:9px;padding:9px;border:0;background:transparent;color:#8b93a0;font-size:12px;cursor:pointer}.gts-editor-auth-cancel:hover{color:#c3cad4}
@media(max-width:900px){.gts-editor-header{grid-template-columns:auto minmax(0,1fr) auto;height:70px;padding:0 13px}.gts-editor-back span,.gts-editor-save-state>span{display:none}.gts-editor-title{text-align:left}.gts-editor-title .gts-editor-kicker{display:block}.gts-editor-title h1{font-size:13px}.gts-editor-title p{font-size:10px}.gts-editor-save-state .primary{display:none}.gts-editor-layout{display:block;padding:12px 12px 92px}.gts-editor-video{border-radius:14px}.gts-editor-transport{padding:13px 0 9px}.gts-editor-timeline-wrap{padding:2px 2px 14px}.gts-editor-timeline-labels{font-size:10px}.gts-editor-timeline-labels strong{font-size:9px}.gts-editor-mark-actions{gap:9px;margin-bottom:16px}.gts-editor-mark-actions button{min-height:62px;padding:9px 10px}.gts-editor-ranges{padding:15px;border-radius:15px}.gts-editor-sidebar{margin-top:13px;gap:11px}.gts-editor-card{padding:15px;border-radius:15px}.gts-editor-grid{grid-template-columns:1fr}.gts-editor-range-times{grid-template-columns:1fr auto 1fr}.gts-editor-range-times em{display:none}.gts-editor-range-list article{grid-template-columns:32px 1fr;padding:10px}.gts-editor-range-index{width:32px;height:32px}.gts-editor-mobile-save{position:fixed;left:0;right:0;bottom:0;z-index:25;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px calc(11px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.12);background:rgba(20,24,31,.95);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.gts-editor-mobile-save div{color:#9ba2ad;font-size:11px}.gts-editor-mobile-save .primary{min-width:130px}.gts-editor-section-head h2{font-size:16px}.gts-editor-form input,.gts-editor-form select,.gts-editor-form textarea{font-size:13.5px}.gts-editor-range-times input{font-size:13.5px}.gts-editor-range-actions button{font-size:12px;min-height:35px}.gts-editor-timeline input{touch-action:pan-x}}
@media(max-width:420px){.gts-editor-mark-actions button{grid-template-columns:30px 1fr}.gts-editor-mark-actions small{width:28px;height:28px}.gts-editor-mark-actions b{font-size:13px}.gts-editor-range-times{gap:6px}.gts-editor-range-times input{padding:0 7px}.gts-editor-range-actions{gap:6px}.gts-editor-range-actions button{padding:0 9px}.gts-editor-range-actions button.danger{margin-left:0}.gts-editor-title h1,.gts-editor-title p{max-width:46vw}}
.gts-editor-subtitles{box-sizing:border-box;position:absolute;z-index:4;left:50%;bottom:8%;width:min(88%,760px);transform:translateX(-50%);padding:8px 13px;border:1px solid rgba(255,255,255,.16);border-radius:11px;background:rgba(0,0,0,.82);color:#fff;font-size:clamp(14px,1.7vw,25px);font-weight:650;line-height:1.35;text-align:center;pointer-events:none}.gts-editor-subtitles span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gts-editor-timecode{z-index:5}
.gts-editor-player-loading{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 45%,rgba(52,47,86,.4),rgba(10,12,16,.92) 72%);color:#ddd8ff;opacity:1;visibility:visible;pointer-events:none;transition:opacity .28s ease,visibility 0s linear 0s}.gts-editor-player-loading.ready{opacity:0;visibility:hidden;transition:opacity .28s ease,visibility 0s linear .28s}.gts-editor-player-spinner{width:36px;height:36px;border:2px solid rgba(169,157,247,.24);border-top-color:#a99df7;border-radius:50%;animation:gts-editor-spin .8s linear infinite}.gts-editor-player-loading strong{font-size:10.5px;font-weight:760;letter-spacing:.16em}.gts-editor-range-timecode{display:block;margin:0 0 9px;color:#f4f2ff;font:650 15px var(--font-geist-mono),monospace;font-variant-numeric:tabular-nums;letter-spacing:-.02em}.gts-editor-range-timecode span{padding:0 6px;color:#9a8fea}.gts-editor-range-times input[aria-invalid=true]{border-color:rgba(232,116,106,.72);box-shadow:0 0 0 3px rgba(232,116,106,.1)}
@keyframes gts-editor-spin{to{transform:rotate(360deg)}}
@media(max-width:900px){.gts-editor-player-spinner{width:32px;height:32px}.gts-editor-player-loading{gap:11px}.gts-editor-range-timecode{font-size:14px}.gts-editor-range-times input{min-width:0}}
.gts-editor-timeline{isolation:isolate;height:30px}.gts-editor-timeline:before{top:50%;z-index:0;height:7px;transform:translateY(-50%);background:#3a4250;box-shadow:inset 0 1px 2px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.05)}.gts-editor-timeline:after{content:"";position:absolute;top:50%;left:0;z-index:1;width:var(--editor-seek-progress);height:7px;transform:translateY(-50%);border-radius:99px;background:linear-gradient(90deg,#8b7ff0,#a99df7);box-shadow:0 0 12px rgba(146,133,236,.32);pointer-events:none}.gts-editor-timeline>i{top:50%;z-index:2;height:10px;transform:translateY(-50%);border:1px solid rgba(255,220,164,.36);background:#d49a55;box-shadow:0 0 0 1px rgba(0,0,0,.22),0 0 13px rgba(212,154,85,.32)}.gts-editor-timeline>b{z-index:3;top:3px;height:24px}.gts-editor-timeline input{inset:0;z-index:4;width:100%;height:30px;margin:0;opacity:1;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer;touch-action:pan-y}.gts-editor-timeline input::-webkit-slider-runnable-track{height:7px;border:0;background:transparent}.gts-editor-timeline input::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-4.5px;border:2px solid #b3a9f9;border-radius:50%;background:#1a1f27;box-shadow:0 2px 8px rgba(0,0,0,.5),0 0 0 2px rgba(139,127,240,.24)}.gts-editor-timeline input::-moz-range-track{height:7px;border:0;background:transparent}.gts-editor-timeline input::-moz-range-progress{height:7px;background:transparent}.gts-editor-timeline input::-moz-range-thumb{width:14px;height:14px;border:2px solid #b3a9f9;border-radius:50%;background:#1a1f27;box-shadow:0 2px 8px rgba(0,0,0,.5),0 0 0 2px rgba(139,127,240,.24)}.gts-editor-timeline input:focus-visible{outline:none}.gts-editor-timeline input:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px rgba(169,157,247,.32),0 2px 8px rgba(0,0,0,.5)}.gts-editor-timeline input:focus-visible::-moz-range-thumb{box-shadow:0 0 0 4px rgba(169,157,247,.32),0 2px 8px rgba(0,0,0,.5)}
@media(max-width:900px){.gts-editor-timeline{height:34px}.gts-editor-timeline input{height:34px}.gts-editor-timeline input::-webkit-slider-thumb{width:18px;height:18px;margin-top:-5.5px}.gts-editor-timeline input::-moz-range-thumb{width:16px;height:16px}}
`;

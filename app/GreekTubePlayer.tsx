"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Cue = { start: number; duration: number; text: string };
type Captions = { videoId: string; title: string; channel: string; cues: Cue[]; duration?: number; transcriptVersion?: number; keyPoints?: string[]; topics?: string[] };
type Category = "Medical" | "Tech" | "Podcasts" | "Comedy" | "Education" | "Documentaries" | "Other";
type Video = {
  id: string; url: string; title: string; channel: string; category: Category;
  tags: string[]; notes: string; description: string; duration: number; addedAt: string;
  favorite: boolean; lastPosition: number; progress: number; lastWatched?: string; captions?: Cue[];
};
type Moment = { id: string; videoId: string; time: number; note: string; tags: string[]; excerpt: string };
type Settings = {
  subtitleMode: "el" | "en" | "dual"; subtitleSize: number; subtitlePosition: "top" | "bottom";
  opacity: number; delay: number; subtitles: boolean; autoScroll: boolean; highlight: boolean;
  autoplay: boolean; speed: number; autoTranslate: boolean; autoCategory: boolean;
  layout: "grid" | "list"; compact: boolean; theme: "dark" | "light" | "system";
  descriptions: boolean; continueWatching: boolean;
};
type AppState = { videos: Video[]; moments: Moment[]; settings: Settings };
type Player = {
  destroy: () => void; getCurrentTime: () => number; getDuration: () => number;
  playVideo: () => void; seekTo: (seconds: number, allow: boolean) => void;
  setPlaybackRate: (rate: number) => void; unloadModule: (module: string) => void;
  getOptions: () => string[];
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, options: Record<string, unknown>) => Player };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const CATEGORIES = ["Όλα", "Medical", "Tech", "Podcasts", "Comedy", "Education", "Documentaries", "Other"] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  Όλα: "Όλα", Medical: "Ιατρικά", Tech: "Τεχνολογία", Podcasts: "Συζητήσεις",
  Comedy: "Κωμωδία", Education: "Εκπαίδευση", Documentaries: "Ντοκιμαντέρ", Other: "Άλλα",
};
const DEFAULT_SETTINGS: Settings = {
  subtitleMode: "el", subtitleSize: 18, subtitlePosition: "bottom", opacity: .8, delay: 0,
  subtitles: true, autoScroll: true, highlight: true, autoplay: true, speed: 1,
  autoTranslate: true, autoCategory: true, layout: "grid", compact: true,
  theme: "dark", descriptions: true, continueWatching: true,
};
const SEED: Video[] = [
  ["ATKu1Cxs2Pc","Καρδιοχειρουργός: Ο μεγαλύτερος παράγοντας κινδύνου για καρδιακή νόσο","Dr. Philip Ovadia","Ο Dr. Philip Ovadia εξηγεί τη σχέση της αντίστασης στην ινσουλίνη με την καρδιακή νόσο."],
  ["NqLpQhii_fU","Αν θέλεις να μειώσεις τους υδατάνθρακες δες αυτό!","Dr. Sarah Myhill","Τι συμβαίνει στον οργανισμό όταν μειώνονται οι υδατάνθρακες."],
  ["D7bBCcbAuYQ","Η κρυφή αιτία του επίμονου λίπους","Συζήτηση υγείας","Οι μεταβολικοί μηχανισμοί πίσω από την απώλεια λίπους."],
  ["fX2z-BF8Jac","Ας γίνει η τροφή το φάρμακό σου","Dr. Natasha Campbell-McBride","Η σύνδεση της τροφής με το μικροβίωμα και το έντερο."],
  ["KkBy__7d9Fs","Γιατί οι περισσότεροι άνθρωποι έχουν αντίσταση στην ινσουλίνη","Dr. Sarah Myhill","Αντίσταση στην ινσουλίνη και οι παράγοντες που την τροφοδοτούν."],
  ["0_adZSC0sFI","Ο πιο γρήγορος τρόπος αντιμετώπισης της ζύμωσης στο ανώτερο έντερο","Dr. Sarah Myhill","Πέψη και μηχανισμοί πίσω από τη ζύμωση."],
  ["D2RjneeG_xA","Ο ευκολότερος τρόπος αντιστροφής μεταβολικών προβλημάτων","Συζήτηση υγείας","Βασικά βήματα για καλύτερη μεταβολική λειτουργία."],
].map(([id,title,channel,description], index) => ({
  id, url:`https://www.youtube.com/watch?v=${id}`, title, channel, description,
  category:"Medical", tags:["υγεία"], notes:"", duration:0, addedAt:new Date(2026,6,23,index).toISOString(),
  favorite:false, lastPosition:0, progress:0,
})) as Video[];

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
function extractId(value:string) {
  try {
    const u=new URL(value.trim()); const host=u.hostname.replace(/^www\./,"");
    if(host==="youtu.be") return u.pathname.split("/")[1]||null;
    if(host.endsWith("youtube.com")) { if(u.pathname==="/watch") return u.searchParams.get("v"); const p=u.pathname.split("/").filter(Boolean); if(["shorts","embed","live"].includes(p[0])) return p[1]||null; }
  } catch { return null; }
  return null;
}
function clock(n:number) { const t=Math.max(0,Math.floor(n)); const h=Math.floor(t/3600); const m=Math.floor((t%3600)/60); const s=t%60; return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`; }
function activeIndex(cues:Cue[], time:number) { let result=-1; for(let i=0;i<cues.length;i++){if(cues[i].start<=time) result=i; else break;} return result; }
function isCompleteGreekTranscript(data:Captions|null|undefined,duration=0) {
  if(!data?.cues?.length||data.transcriptVersion!==2)return false;
  const cues=data.cues;
  const ordered=cues.length>=3&&cues.every((cue,index)=>Number.isFinite(cue.start)&&Number.isFinite(cue.duration)&&cue.duration>0&&cue.text.trim().length>0&&(index===0||cue.start>=cues[index-1].start));
  if(!ordered)return false;
  const sample=cues.slice(0,120).map(cue=>cue.text).join(" ");
  const letters=sample.match(/\p{L}/gu)?.length||0;
  const greek=sample.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length||0;
  if(!letters||greek/letters<=.22)return false;
  const fullDuration=duration||data.duration||0;
  if(fullDuration>0){
    const last=cues.reduce((max,cue)=>Math.max(max,cue.start+cue.duration),0);
    if(cues[0].start>Math.max(60,fullDuration*.08)||last<fullDuration*.9)return false;
  }
  return true;
}
function transcriptHighlights(cues:Cue[]) {
  if(!cues.length)return [];
  const step=Math.max(1,Math.floor(cues.length/10));
  return cues.filter((_,index)=>index%step===0).map(c=>c.text.replace(/\s+/g," ").trim()).filter((text,index,list)=>text.length>18&&list.indexOf(text)===index).slice(0,10);
}

export default function GreekTubePlayer() {
  const [state,setState]=useState<AppState>({videos:SEED,moments:[],settings:DEFAULT_SETTINGS});
  const [hydrated,setHydrated]=useState(false);
  const [view,setView]=useState<"library"|"settings">("library");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [captions,setCaptions]=useState<Captions|null>(null);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState(0);
  const [loadingPoints,setLoadingPoints]=useState<string[]>([]);
  const [transcriptOpen,setTranscriptOpen]=useState(false);
  const [error,setError]=useState("");
  const [active,setActive]=useState(-1);
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState<(typeof CATEGORIES)[number]>("Όλα");
  const [sort,setSort]=useState("recent");
  const [filter,setFilter]=useState<"all"|"favorites"|"recent">("all");
  const [modal,setModal]=useState(false);
  const [momentModal,setMomentModal]=useState<{time:number;excerpt:string}|null>(null);
  const playerHost=useRef<HTMLDivElement>(null);
  const player=useRef<Player|null>(null);
  const transcript=useRef<HTMLDivElement>(null);
  const saveTimer=useRef<number|undefined>(undefined);
  const selected=state.videos.find(v=>v.id===selectedId)||null;

  useEffect(()=>{ void (async()=>{try{const r=await fetch("/api/state"); const j=await r.json(); if(j.state?.videos) setState({settings:{...DEFAULT_SETTINGS,...j.state.settings},videos:j.state.videos,moments:j.state.moments||[]});}finally{setHydrated(true);}})(); },[]);
  useEffect(()=>{ if(!hydrated)return; window.clearTimeout(saveTimer.current); saveTimer.current=window.setTimeout(()=>{void fetch("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(state)});},450); },[state,hydrated]);
  useEffect(()=>{document.documentElement.dataset.theme=state.settings.theme;},[state.settings.theme]);

  const filtered=useMemo(()=> {
    let list=state.videos.filter(v=>(category==="Όλα"||v.category===category)&&(`${v.title} ${v.channel} ${v.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())));
    if(filter==="favorites") list=list.filter(v=>v.favorite);
    if(filter==="recent") list=list.filter(v=>v.lastWatched);
    return [...list].sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="progress"?b.progress-a.progress:b.addedAt.localeCompare(a.addedAt));
  },[state.videos,category,search,sort,filter]);
  const continueVideos=state.videos.filter(v=>v.progress>0&&v.progress<96).sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||"")).slice(0,5);
  const featured=useMemo(()=>{
    const unfinished=state.videos.filter(v=>v.progress>0&&v.progress<96&&v.lastWatched).sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||""));
    if(unfinished[0])return unfinished[0];
    const lastCompleted=[...state.videos].filter(v=>v.progress>=96&&v.lastWatched).sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||""))[0];
    if(lastCompleted){
      const index=state.videos.findIndex(v=>v.id===lastCompleted.id);
      return state.videos[(index+1)%state.videos.length]||lastCompleted;
    }
    return [...state.videos].sort((a,b)=>b.addedAt.localeCompare(a.addedAt))[0]||null;
  },[state.videos]);
  const featuredMoments=featured?state.moments.filter(m=>m.videoId===featured.id):[];
  const featuredTopics=featured?[...new Set([CATEGORY_LABELS[featured.category],...featured.tags])].slice(0,4):[];

  function patchVideo(id:string,patch:Partial<Video>){setState(s=>({...s,videos:s.videos.map(v=>v.id===id?{...v,...patch}:v)}));}
  async function openVideo(video:Video,start?:number,showTranscript=false){
    const knownPoints=transcriptHighlights(video.captions||[]);
    setSelectedId(video.id); setView("library"); setLoading(true); setProgress(4); setError(""); setCaptions(null); setLoadingPoints(knownPoints.length?knownPoints:[video.description,...video.tags.map(tag=>`Βασικό θέμα: ${tag}`)].filter(Boolean)); setTranscriptOpen(showTranscript);
    history.replaceState(null,"",`/?video=${video.id}${start?`&t=${Math.floor(start)}`:""}`);
    const timer=window.setInterval(()=>setProgress(p=>Math.min(92,p+(p<35?5:p<70?2:1))),420);
    try{
      let data:Captions;
      {
        let response:Response|null=null;
        let sharedData:Captions|null=null;
        for(let attempt=0;attempt<120;attempt++){
          const controller=new AbortController();
          const timeout=window.setTimeout(()=>controller.abort(),120000);
          try{
            response=await fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url}),signal:controller.signal});
          }catch{
            response=null;
          }finally{
            window.clearTimeout(timeout);
          }
          if(response?.status===202){
            const processing=await response.json();
            if(typeof processing.progress==="number")setProgress(Math.max(4,Math.min(96,processing.progress)));
            if(Array.isArray(processing.keyPoints)&&processing.keyPoints.length)setLoadingPoints(processing.keyPoints);
            await new Promise(resolve=>window.setTimeout(resolve,1000));
            continue;
          }
          if(response?.ok){sharedData=await response.json();break;}
          if(!response||response.status===429||response.status>=500)throw new Error("shared-storage");
          break;
        }
        if(!isCompleteGreekTranscript(sharedData,video.duration))throw new Error("incomplete-transcript");
        data=sharedData;
        localStorage.setItem(`greektube-transcript:${video.id}:v2`,JSON.stringify(sharedData));
        patchVideo(video.id,{title:sharedData.title,channel:sharedData.channel,captions:sharedData.cues});
      }
      const points=data.keyPoints?.length?data.keyPoints:transcriptHighlights(data.cues);
      if(points.length){setLoadingPoints(points);setProgress(100);await new Promise(resolve=>window.setTimeout(resolve,750));}
      setProgress(100); setCaptions(data); setLoading(false); patchVideo(video.id,{lastWatched:new Date().toISOString()});
      window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),120);
    }catch{
      const local=localStorage.getItem(`greektube-transcript:${video.id}:v2`);
      if(local){
        try{
          const fallback=JSON.parse(local) as Captions;
          if(isCompleteGreekTranscript(fallback,video.duration)){
            setCaptions(fallback);setLoading(false);patchVideo(video.id,{lastWatched:new Date().toISOString()});
            window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),120);
            window.setTimeout(()=>{void fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url})}).catch(()=>undefined)},10000);
            return;
          }
        }catch{}
      }
      player.current?.destroy();player.current=null;
      setCaptions(null);setLoading(false);setProgress(0);
      setError("Το video δεν θα ανοίξει μέχρι να είναι έτοιμοι και ελεγμένοι οι πλήρεις ελληνικοί υπότιτλοι. Δοκίμασε ξανά σε λίγο.");
    }finally{clearInterval(timer);}
  }
  function initPlayer(id:string,start:number){
    const disableYouTubeCaptions=(target:Player)=>{
      if(target.getOptions?.().includes("captions")){
        target.unloadModule?.("captions");
      }
    };
    const create=()=>{if(!window.YT||!playerHost.current)return; player.current?.destroy(); playerHost.current.innerHTML=""; player.current=new window.YT.Player(playerHost.current,{videoId:id,width:"100%",height:"100%",playerVars:{autoplay:state.settings.autoplay?1:0,controls:1,modestbranding:1,rel:0,playsinline:1,start:Math.floor(start),cc_load_policy:0,hl:"el"},events:{onReady:({target}:{target:Player})=>{disableYouTubeCaptions(target);window.setTimeout(()=>disableYouTubeCaptions(target),350);target.setPlaybackRate(state.settings.speed);if(state.settings.autoplay)target.playVideo();},onApiChange:({target}:{target:Player})=>disableYouTubeCaptions(target),onStateChange:({target}:{target:Player})=>disableYouTubeCaptions(target)}});};
    if(window.YT?.Player)create(); else{if(!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')){const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";document.head.appendChild(s);}window.onYouTubeIframeAPIReady=create;}
  }
  useEffect(()=>{if(!captions||!selectedId)return;const timer=window.setInterval(()=>{const now=player.current?.getCurrentTime();if(typeof now!=="number")return;const duration=player.current?.getDuration()||selected?.duration||0;setActive(activeIndex(captions.cues,now+state.settings.delay));if(duration>0)patchVideo(selectedId,{lastPosition:now,duration,progress:Math.min(100,(now/duration)*100)});},1000);return()=>clearInterval(timer);},[captions,selectedId,state.settings.delay]);
  useEffect(()=>{if(active<0||!state.settings.autoScroll)return;transcript.current?.querySelector(`[data-cue="${active}"]`)?.scrollIntoView({block:"center",behavior:"smooth"});},[active,state.settings.autoScroll]);
  useEffect(()=>{const params=new URLSearchParams(location.search);const id=params.get("video");const t=Number(params.get("t")||0);if(hydrated&&id){const v=state.videos.find(x=>x.id===id);if(v)window.setTimeout(()=>void openVideo(v,t),0);}},[hydrated]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==="m"&&selected){e.preventDefault();beginMoment();}};addEventListener("keydown",key);return()=>removeEventListener("keydown",key);},[selected,active,captions]);

  function seek(time:number){player.current?.seekTo(time,true);player.current?.playVideo();}
  function beginMoment(time=player.current?.getCurrentTime()||0,excerpt=captions?.cues[active]?.text||""){setMomentModal({time,excerpt});}
  function saveMoment(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selected||!momentModal)return;const fd=new FormData(event.currentTarget);const m:Moment={id:uid(),videoId:selected.id,time:momentModal.time,note:String(fd.get("note")||"Αποθηκευμένη στιγμή"),tags:String(fd.get("tags")||"").split(",").map(x=>x.trim()).filter(Boolean),excerpt:momentModal.excerpt};setState(s=>({...s,moments:[m,...s.moments]}));setMomentModal(null);void copyMoment(m);}
  async function copyMoment(m:Moment){const url=`${location.origin}/?video=${m.videoId}&t=${Math.floor(m.time)}`;await navigator.clipboard?.writeText(url);}
  function close(){player.current?.destroy();player.current=null;setSelectedId(null);setCaptions(null);setTranscriptOpen(false);setError("");history.replaceState(null,"","/");}

  if(selected){
    const moments=state.moments.filter(m=>m.videoId===selected.id);
    return <main className="app-shell viewer">
      <header className="app-header"><button className="ghost" onClick={close}>← Βιβλιοθήκη</button><Brand/><button className="icon-button" onClick={()=>setView("settings")}>⚙</button></header>
      {loading&&<section className="content-loading">
        <div className="loading-visual"><img src={`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`} alt=""/><div><small>{selected.channel}</small><h1>{selected.title}</h1></div></div>
        <div className="loading-insights">
          <div className="loading-progress-line"><span>Περιεχόμενο βίντεο</span><strong>{Math.round(progress)}%</strong></div>
          <div className="progress" role="progressbar" aria-label="Πρόοδος προετοιμασίας" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:`${progress}%`}}/></div>
          <h2>Σημεία από τη μεταγραφή</h2>
          <ul>{loadingPoints.slice(0,10).map((point,index)=><li key={`${point}-${index}`}><i>{String(index+1).padStart(2,"0")}</i><span>{point}</span></li>)}</ul>
        </div>
      </section>}
      {error&&<section className="empty"><b>!</b><h2>Δεν ολοκληρώθηκε η προετοιμασία</h2><p>{error}</p><button className="primary" onClick={()=>void openVideo(selected)}>Δοκίμασε ξανά</button></section>}
      {!loading&&captions&&<>
        <section className={`watch-layout ${transcriptOpen?"transcript-open":"player-only"}`}>
          <div className="watch-main">
            <div className="sticky-player" onContextMenu={e=>{e.preventDefault();beginMoment();}}>
              <div className="video-frame"><div ref={playerHost}/>{state.settings.subtitles&&<div className={`subtitles ${state.settings.subtitlePosition}`} style={{fontSize:state.settings.subtitleSize,background:`rgba(0,0,0,${state.settings.opacity})`}}>{captions.cues[active]?.text}</div>}</div>
              <div className="player-actions"><div><button className="primary compact" onClick={()=>beginMoment()}>＋ Αποθήκευση στιγμής</button><button className="secondary compact transcript-toggle" onClick={()=>setTranscriptOpen(value=>!value)}>{transcriptOpen?"Κλείσιμο μεταγραφής":"Άνοιγμα μεταγραφής"}</button></div><span>{Math.round(selected.progress)}% προβολή</span></div>
            </div>
            <div className="video-heading"><div><small>{selected.channel} · {CATEGORY_LABELS[selected.category]}</small><h1>{captions.title}</h1></div><button aria-label="Αγαπημένο" className={`favorite ${selected.favorite?"active":""}`} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♥</button></div>
            <section className="moments"><div className="section-title"><h2>Αποθηκευμένες στιγμές</h2><small>{moments.length}</small></div>{moments.length===0?<p className="muted">Πάτησε M ή το κουμπί πάνω για να κρατήσεις ένα σημείο.</p>:moments.map(m=><article className="moment" key={m.id} onClick={()=>seek(m.time)}><time>{clock(m.time)}</time><div><strong>{m.note}</strong><p>{m.excerpt}</p></div><div className="moment-actions"><button onClick={e=>{e.stopPropagation();seek(m.time)}}>Αναπαραγωγή</button><button onClick={e=>{e.stopPropagation();void copyMoment(m)}}>Αντιγραφή συνδέσμου</button><button onClick={e=>{e.stopPropagation();navigator.share?.({title:m.note,url:`${location.origin}/?video=${m.videoId}&t=${Math.floor(m.time)}`})}}>Κοινοποίηση</button><button onClick={e=>{e.stopPropagation();setState(s=>({...s,moments:s.moments.filter(x=>x.id!==m.id)}))}}>Διαγραφή</button></div></article>)}</section>
          </div>
          {transcriptOpen&&<aside className="side-panel transcript-drawer">
            <div className="drawer-header"><div><small>Ελληνικοί υπότιτλοι</small><strong>Μεταγραφή</strong></div><button aria-label="Κλείσιμο μεταγραφής" onClick={()=>setTranscriptOpen(false)}>×</button></div>
            <div className="transcript" ref={transcript}>{captions.cues.length?captions.cues.map((c,i)=><button key={`${c.start}-${i}`} data-cue={i} className={state.settings.highlight&&i===active?"active":""} onClick={()=>seek(c.start)} onContextMenu={e=>{e.preventDefault();beginMoment(c.start,c.text)}}><time>{clock(c.start)}</time><span>{c.text}</span><i onClick={e=>{e.stopPropagation();beginMoment(c.start,c.text)}}>＋</i></button>):<div className="transcript-empty">Δεν υπάρχει αποθηκευμένη μεταγραφή.</div>}</div>
          </aside>}
        </section>
      </>}
      {momentModal&&<Modal title="Αποθήκευση στιγμής" close={()=>setMomentModal(null)}><form className="form" onSubmit={saveMoment}><div className="moment-preview"><time>{clock(momentModal.time)}</time><p>{momentModal.excerpt}</p></div><label>Σύντομη σημείωση<input name="note" autoFocus placeholder="Τι θέλεις να θυμάσαι;"/></label><label>Ετικέτες<input name="tags" placeholder="π.χ. ινσουλίνη, LDL"/></label><button className="primary">Αποθήκευση και αντιγραφή συνδέσμου</button></form></Modal>}
    </main>;
  }

  return <main className="app-shell">
    <header className="app-header"><Brand/><nav><button className={view==="library"?"active":""} onClick={()=>setView("library")}>Βιβλιοθήκη</button><button className={view==="settings"?"active":""} onClick={()=>setView("settings")}>Ρυθμίσεις</button></nav><button className="primary compact add-top" onClick={()=>setModal(true)}>＋ Προσθήκη βίντεο</button></header>
    {view==="settings"?<SettingsPage settings={state.settings} update={patch=>setState(s=>({...s,settings:{...s.settings,...patch}}))}/>:<>
      <section className="home-intro"><span>Η προσωπική σου βιβλιοθήκη βίντεο</span><h1>Αυτόματοι ελληνικοί υπότιτλοι</h1></section>
      {featured&&<section className="featured" aria-label="Προτεινόμενο βίντεο">
        <button className="featured-media" onClick={()=>void openVideo(featured,featured.lastPosition)} aria-label={`Συνέχεια προβολής: ${featured.title}`}>
          <img src={`https://i.ytimg.com/vi/${featured.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${featured.id}/hqdefault.jpg`}} alt=""/>
          <span className="featured-play">▶</span>
          <div className="featured-overlay"><small>{featured.channel}</small><strong>{featured.title}</strong></div>
          <div className="featured-progress"><i style={{width:`${featured.progress}%`}}/></div>
        </button>
        <div className="featured-panel">
          <div className="featured-meta"><span>{CATEGORY_LABELS[featured.category]}</span><button aria-label="Αγαπημένο" className={`featured-favorite ${featured.favorite?"active":""}`} onClick={()=>patchVideo(featured.id,{favorite:!featured.favorite})}>♥</button></div>
          <h2>{featured.title}</h2>
          <small>{featured.channel}</small>
          <p>{featured.description}</p>
          <div className="topic-list">{featuredTopics.map(topic=><span key={topic}>{topic}</span>)}</div>
          <div className="featured-stats">
            <div><strong>{Math.round(featured.progress)}%</strong><span>προβλήθηκε</span></div>
            <div><strong>{featured.duration>0?clock(Math.max(0,featured.duration-featured.lastPosition)):"—"}</strong><span>απομένει</span></div>
            <div><strong>{featuredMoments.length}</strong><span>στιγμές</span></div>
          </div>
          <div className="featured-actions">
            <button className="primary" onClick={()=>void openVideo(featured,featured.lastPosition)}>▶ Συνέχεια προβολής</button>
            <button className="secondary" onClick={()=>void openVideo(featured,0)}>↺ Από την αρχή</button>
            <button className="text-action" onClick={()=>void openVideo(featured,featured.lastPosition,true)}>Άνοιγμα μεταγραφής →</button>
          </div>
          {featuredMoments[0]&&<button className="latest-moment" onClick={()=>void openVideo(featured,featuredMoments[0].time)}><span>Τελευταία στιγμή · {clock(featuredMoments[0].time)}</span><strong>{featuredMoments[0].note}</strong></button>}
        </div>
      </section>}
      {state.settings.continueWatching&&continueVideos.length>0&&<section className="continue-section"><div className="continue-header"><div><span>ΣΥΝΕΧΙΣΗ ΠΡΟΒΟΛΗΣ</span><div className="continue-title-line"><h2>Συνέχισε την προβολή</h2><small>{continueVideos.length} {continueVideos.length===1?"βίντεο":"βίντεο"}</small></div><p>Συνέχισε από το σημείο που σταμάτησες.</p></div><button onClick={()=>document.querySelector(".library-tools")?.scrollIntoView({behavior:"smooth",block:"start"})}>Προβολή όλων</button></div><div className="continue-row">{continueVideos.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} settings={state.settings} variant="continue"/>)}</div></section>}
      <section className="library-tools"><div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Αναζήτηση βίντεο, καναλιού ή ετικέτας"/></div><select aria-label="Ταξινόμηση" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Πρόσφατα</option><option value="title">Τίτλος</option><option value="progress">Πρόοδος</option></select><div className="quick-filters"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Όλα</button><button className={filter==="favorites"?"active":""} onClick={()=>setFilter("favorites")}>♥ Αγαπημένα</button><button className={filter==="recent"?"active":""} onClick={()=>setFilter("recent")}>Πρόσφατη προβολή</button></div></section>
      <div className="category-row">{CATEGORIES.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{CATEGORY_LABELS[c]}</button>)}</div>
      <section className={`video-grid ${state.settings.layout} ${state.settings.compact?"compact":""}`}>{filtered.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} settings={state.settings}/>)}</section>
      {filtered.length===0&&<div className="empty"><h2>Δεν βρέθηκαν βίντεο</h2><p>Δοκίμασε διαφορετική κατηγορία ή αναζήτηση.</p></div>}
    </>}
    {modal&&<AddVideo close={()=>setModal(false)} add={async(video,translate)=>{setState(s=>({...s,videos:[video,...s.videos]}));setModal(false);if(translate)await openVideo(video);}}/>}
  </main>;
}

function Brand(){return <div className="brand"><span className="brand-mark"><i>≡</i>▶</span><span>GreekTube <b>Subs</b></span><small className="brand-version">ver 2.1</small></div>;}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal"><header><h2>{title}</h2><button onClick={close}>×</button></header>{children}</section></div>;}
function VideoCard({video,open,patch,settings,variant="library"}:{video:Video;open:(v:Video)=>void;patch:(id:string,p:Partial<Video>)=>void;settings:Settings;variant?:"library"|"continue"}){const remaining=video.duration>0?Math.max(0,video.duration-video.lastPosition):0;return <article className={`video-card ${variant==="continue"?"continue-card":""}`} role="button" tabIndex={0} aria-label={`Άνοιγμα βίντεο: ${video.title}`} onClick={()=>void open(video)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();void open(video)}}}><div className="thumb"><img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt=""/><span className="duration">{video.duration?clock(video.duration):"Υπότιτλοι · EL"}</span><button aria-label="Αγαπημένο" className={`heart ${video.favorite?"active":""}`} onClick={e=>{e.stopPropagation();patch(video.id,{favorite:!video.favorite})}}>♥</button>{video.progress>0&&<i className="card-progress" style={{width:`${video.progress}%`}}/>}</div><div className="card-info"><strong>{video.title}</strong><span>{video.channel}</span><small>{variant==="continue"?(remaining>0?`${Math.round(video.progress)}% · Απομένουν ${clock(remaining)}`:`${Math.round(video.progress)}% ολοκληρώθηκε`):`${CATEGORY_LABELS[video.category]}${video.progress>0?` · ${Math.round(video.progress)}%`:""}`}</small>{variant==="library"&&settings.descriptions&&<p>{video.description}</p>}</div></article>;}

function AddVideo({close,add}:{close:()=>void;add:(v:Video,t:boolean)=>Promise<void>}) {
  const [url,setUrl]=useState("");const [metadata,setMetadata]=useState<{id:string;title:string;channel:string}|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function inspect(){const id=extractId(url);if(!id){setError("Βάλε έναν έγκυρο σύνδεσμο YouTube.");return;}setBusy(true);setError("");try{const r=await fetch("/api/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});const j=await r.json();if(!r.ok)throw new Error(j.error);setMetadata(j);}catch(e){setError(e instanceof Error?e.message:"Σφάλμα");}finally{setBusy(false);}}
  async function submit(e:React.MouseEvent<HTMLButtonElement>,translate:boolean){e.preventDefault();const form=e.currentTarget.form;if(!form)return;if(!metadata){await inspect();return;}const fd=new FormData(form);const v:Video={id:metadata.id,url,title:metadata.title,channel:metadata.channel,category:String(fd.get("category")) as Category,tags:String(fd.get("tags")||"").split(",").map(x=>x.trim()).filter(Boolean),notes:String(fd.get("notes")||""),description:String(fd.get("notes")||"Νέο βίντεο στη βιβλιοθήκη."),duration:0,addedAt:new Date().toISOString(),favorite:false,lastPosition:0,progress:0};await add(v,translate);}
  return <Modal title="Προσθήκη βίντεο" close={close}><form className="form"><label>Σύνδεσμος YouTube<div className="inspect-row"><input value={url} onChange={e=>{setUrl(e.target.value);setMetadata(null)}} placeholder="https://youtube.com/watch?v=…"/><button type="button" onClick={()=>void inspect()}>{busy?"…":"Έλεγχος"}</button></div></label>{error&&<p className="form-error">{error}</p>}{metadata&&<div className="metadata"><img src={`https://i.ytimg.com/vi/${metadata.id}/hqdefault.jpg`} alt=""/><div><strong>{metadata.title}</strong><span>{metadata.channel}</span></div></div>}<div className="form-grid"><label>Κατηγορία<select name="category" defaultValue="Other">{CATEGORIES.slice(1).map(c=><option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label><label>Ετικέτες<input name="tags" placeholder="υγεία, ινσουλίνη"/></label></div><label>Προσωπικές σημειώσεις<textarea name="notes" placeholder="Γιατί θέλω να κρατήσω αυτό το βίντεο…"/></label><div className="modal-actions"><button className="secondary" onClick={e=>void submit(e,false)}>Αποθήκευση χωρίς μετάφραση</button><button className="primary" onClick={e=>void submit(e,true)}>Μετάφραση τώρα</button></div></form></Modal>;
}

function SettingsPage({settings,update}:{settings:Settings;update:(p:Partial<Settings>)=>void}) {
  const toggle=(key:keyof Settings,label:string)=><label className="setting-row"><span>{label}</span><input type="checkbox" checked={Boolean(settings[key])} onChange={e=>update({[key]:e.target.checked})}/></label>;
  return <section className="settings-page"><header><span>Προτιμήσεις εφαρμογής</span><h1>Ρυθμίσεις</h1><p>Οι αλλαγές αποθηκεύονται αυτόματα και εφαρμόζονται σε όλα τα βίντεο.</p></header><div className="settings-grid"><section><h2>Υπότιτλοι</h2><label>Προεπιλεγμένη γλώσσα<select value={settings.subtitleMode} onChange={e=>update({subtitleMode:e.target.value as Settings["subtitleMode"]})}><option value="el">Ελληνικά</option><option value="en">Αγγλικά</option><option value="dual">Διπλοί υπότιτλοι</option></select></label><label>Μέγεθος γραμματοσειράς<input type="range" min="13" max="28" value={settings.subtitleSize} onChange={e=>update({subtitleSize:+e.target.value})}/><output>{settings.subtitleSize}px</output></label><label>Θέση<select value={settings.subtitlePosition} onChange={e=>update({subtitlePosition:e.target.value as "top"|"bottom"})}><option value="bottom">Κάτω</option><option value="top">Πάνω</option></select></label><label>Διαφάνεια φόντου<input type="range" min="0" max="1" step=".1" value={settings.opacity} onChange={e=>update({opacity:+e.target.value})}/></label><label>Καθυστέρηση υποτίτλων<input type="range" min="-5" max="5" step=".1" value={settings.delay} onChange={e=>update({delay:+e.target.value})}/><output>{settings.delay}s</output></label>{toggle("subtitles","Εμφάνιση υποτίτλων")}{toggle("autoScroll","Αυτόματη κύλιση μεταγραφής")}{toggle("highlight","Επισήμανση ενεργής γραμμής")}</section><section><h2>Αναπαραγωγή</h2>{toggle("autoplay","Αυτόματη αναπαραγωγή")}<label>Προεπιλεγμένη ταχύτητα<select value={settings.speed} onChange={e=>update({speed:+e.target.value})}>{[.5,.75,1,1.25,1.5,2].map(x=><option key={x} value={x}>{x}×</option>)}</select></label>{toggle("autoTranslate","Αυτόματη μετάφραση")}{toggle("autoCategory","Αυτόματη κατηγοριοποίηση")}{toggle("continueWatching","Συνέχιση προβολής")}</section><section><h2>Εμφάνιση</h2><label>Διάταξη βιβλιοθήκης<select value={settings.layout} onChange={e=>update({layout:e.target.value as "grid"|"list"})}><option value="grid">Πλέγμα</option><option value="list">Λίστα</option></select></label><label>Θέμα<select value={settings.theme} onChange={e=>update({theme:e.target.value as Settings["theme"]})}><option value="dark">Σκούρο</option><option value="light">Φωτεινό</option><option value="system">Σύστημα</option></select></label>{toggle("compact","Συμπαγείς κάρτες")}{toggle("descriptions","Εμφάνιση περιγραφών")}</section></div></section>;
}

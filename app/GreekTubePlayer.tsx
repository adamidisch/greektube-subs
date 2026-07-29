"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Cue = { start: number; duration: number; text: string };
type SpeakerProfile = { name:string; role:string; importance:string; currentWork:string; highlights:string[] };
type Captions = { videoId: string; title: string; originalTitle?:string; channel: string; cues: Cue[]; englishCues?:Cue[]; duration?: number; transcriptVersion?: number; keyPoints?: string[]; topics?: string[]; speaker?:SpeakerProfile };
type Category = "Medical" | "Tech" | "Podcasts" | "Comedy" | "Education" | "Documentaries" | "Other";
type Video = {
  id: string; url: string; title: string; originalTitle?:string; channel: string; category: Category;
  tags: string[]; notes: string; description: string; duration: number; addedAt: string;
  favorite: boolean; lastPosition: number; progress: number; lastWatched?: string; captions?: Cue[];
  speakerName?:string; views?:number; metadataVersion?:number;
};
type Moment = { id: string; videoId: string; time: number; note: string; tags: string[]; excerpt: string };
type Settings = {
  subtitleMode: "el" | "en" | "dual"; subtitleSize: number; subtitlePosition: "top" | "bottom";
  subtitleSizeVersion?: number;
  opacity: number; delay: number; subtitles: boolean; autoScroll: boolean; highlight: boolean;
  autoplay: boolean; speed: number; autoTranslate: boolean; autoCategory: boolean;
  layout: "grid" | "list"; compact: boolean; theme: "dark" | "light" | "system";
  descriptions: boolean; continueWatching: boolean;
};
type AppState = { videos: Video[]; moments: Moment[]; settings: Settings };
type Player = {
  destroy: () => void; getCurrentTime: () => number; getDuration: () => number;
  playVideo: () => void; pauseVideo: () => void; getPlayerState: () => number; seekTo: (seconds: number, allow: boolean) => void;
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
  subtitleMode: "el", subtitleSize: 19, subtitleSizeVersion: 2, subtitlePosition: "bottom", opacity: .8, delay: 0,
  subtitles: true, autoScroll: true, highlight: true, autoplay: true, speed: 1,
  autoTranslate: true, autoCategory: true, layout: "grid", compact: true,
  theme: "dark", descriptions: true, continueWatching: true,
};
const PERSONAL_CACHE_KEY="greektube-personal-state:v1";
function normalizedSettings(settings?:Partial<Settings>):Settings{
  const merged={...DEFAULT_SETTINGS,...settings};
  return settings?.subtitleSizeVersion===2?merged:{...merged,subtitleSize:19,subtitleSizeVersion:2};
}
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

const SPEAKERS:Record<string,SpeakerProfile>={
  ATKu1Cxs2Pc:{name:"Dr Philip Ovadia",role:"Καρδιοθωρακοχειρουργός και ειδικός στη μεταβολική υγεία",importance:"Γνωστός για το έργο του στην πρόληψη της καρδιοπάθειας μέσω της μεταβολικής υγείας.",currentWork:"",highlights:[]},
  NqLpQhii_fU:{name:"Dr Sarah Myhill",role:"Ιατρός με ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",importance:"Γνωστή για το έργο της στη χρόνια κόπωση και στη μιτοχονδριακή λειτουργία.",currentWork:"",highlights:[]},
  KkBy__7d9Fs:{name:"Dr Sarah Myhill",role:"Ιατρός με ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",importance:"Γνωστή για το έργο της στη χρόνια κόπωση και στη μιτοχονδριακή λειτουργία.",currentWork:"",highlights:[]},
  "0_adZSC0sFI":{name:"Dr Sarah Myhill",role:"Ιατρός με ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",importance:"Γνωστή για το έργο της στη χρόνια κόπωση και στη μιτοχονδριακή λειτουργία.",currentWork:"",highlights:[]},
  D2RjneeG_xA:{name:"Dr Sarah Myhill",role:"Ιατρός με ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",importance:"Γνωστή για το έργο της στη χρόνια κόπωση και στη μιτοχονδριακή λειτουργία.",currentWork:"",highlights:[]},
  "fX2z-BF8Jac":{name:"Dr Natasha Campbell-McBride",role:"Ιατρός με εκπαίδευση στη νευρολογία και στην ανθρώπινη διατροφή",importance:"Γνωστή για την προσέγγιση GAPS και τη σχέση εντέρου και εγκεφάλου.",currentWork:"",highlights:[]},
  HDK3Y9mGMiA:{name:"Dr Natasha Campbell-McBride",role:"Ιατρός με εκπαίδευση στη νευρολογία και στην ανθρώπινη διατροφή",importance:"Γνωστή για την προσέγγιση GAPS και τη σχέση εντέρου και εγκεφάλου.",currentWork:"",highlights:[]},
};
function speakerForVideo(id:string,channel:string):SpeakerProfile{return SPEAKERS[id]||{name:channel||"Ομιλητής του βίντεο",role:"Ομιλητής και δημιουργός του περιεχομένου",importance:"Το επαγγελματικό προφίλ του ομιλητή δεν έχει ακόμη επιβεβαιωθεί.",currentWork:"Θα προστεθούν περισσότερα στοιχεία μόλις επιβεβαιωθεί η ταυτότητά του.",highlights:["Ταυτότητα ομιλητή","Επαγγελματική ιδιότητα","Κύριο έργο","Σημερινή δραστηριότητα"]};}
const GREEK_TITLES:Record<string,string>={
  ATKu1Cxs2Pc:"Καρδιοχειρουργός: Ο μεγαλύτερος παράγοντας κινδύνου για καρδιακή νόσο",
  NqLpQhii_fU:"Αν θέλεις να μειώσεις τους υδατάνθρακες δες αυτό!",
  D7bBCcbAuYQ:"Η κρυφή αιτία του επίμονου λίπους",
  "fX2z-BF8Jac":"Ας γίνει η τροφή το φάρμακό σου",
  KkBy__7d9Fs:"Γιατί οι περισσότεροι άνθρωποι έχουν αντίσταση στην ινσουλίνη",
  "0_adZSC0sFI":"Ο πιο γρήγορος τρόπος αντιμετώπισης της ζύμωσης στο ανώτερο έντερο",
  D2RjneeG_xA:"Ο ευκολότερος τρόπος αντιστροφής μεταβολικών προβλημάτων",
};
function greekTitle(video:Video){return isGreekTitle(video.title)?video.title:GREEK_TITLES[video.id]||video.title;}
function isGreekTitle(value:string){const letters=value.match(/\p{L}/gu)?.length||0;const greek=value.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length||0;return letters>0&&greek/letters>.22;}
const ENGLISH_TITLES:Record<string,string>={
  ATKu1Cxs2Pc:"Heart Surgeon: The Biggest Risk Factor for Heart Disease",
  NqLpQhii_fU:"If You Want to Cut Carbs, Watch This!",
  D7bBCcbAuYQ:"The Hidden Cause of Stubborn Fat",
  "fX2z-BF8Jac":"Let Food Be Thy Medicine",
  KkBy__7d9Fs:"Why Most People Have Insulin Resistance",
  "0_adZSC0sFI":"The Fastest Way to Get Rid of an Upper Fermenting Gut",
  D2RjneeG_xA:"#1 Absolute Easiest Way to Reverse Metabolic Issues",
};
function englishTitle(video:Video){return video.originalTitle||ENGLISH_TITLES[video.id]||"";}

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
function subtitleParts(text:string,maxCharacters=76){
  const clean=text.replace(/\s+/g," ").trim();
  if(!clean)return [];
  const sentences=clean.match(/[^.!?…]+[.!?…]?/g)?.map(part=>part.trim()).filter(Boolean)||[clean];
  const parts:string[]=[];
  for(const sentence of sentences){
    const words=sentence.split(" ");
    let part="";
    for(const word of words){
      const next=part?`${part} ${word}`:word;
      if(part&&next.length>maxCharacters){parts.push(part);part=word;}else part=next;
    }
    if(part)parts.push(part);
  }
  return parts;
}
function subtitleWindow(cue:Cue|undefined,currentTime:number){
  if(!cue)return "";
  const parts=subtitleParts(cue.text);
  if(parts.length<=1)return parts[0]||"";
  const elapsed=Math.max(0,currentTime-cue.start);
  const ratio=cue.duration>0?Math.min(.999,elapsed/cue.duration):0;
  return parts[Math.floor(ratio*parts.length)]||parts[0];
}
function isCompleteGreekTranscript(data:Captions|null|undefined,duration=0) {
  if(!data?.cues?.length||data.transcriptVersion!==4)return false;
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
    const startsInTime=cues[0].start<=Math.max(90,fullDuration*.1);
    const reachesSpokenEnd=last>=fullDuration*.82||fullDuration-last<=180;
    if(!startsInTime||!reachesSpokenEnd)return false;
  }
  return true;
}
const PREPARATION_STAGES=[
  {at:4,label:"Ανάγνωση στοιχείων βίντεο"},
  {at:12,label:"Εντοπισμός αρχικών υποτίτλων"},
  {at:28,label:"Μετάφραση υποτίτλων στα ελληνικά"},
  {at:88,label:"Έλεγχος συγχρονισμού και πληρότητας"},
];
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
  const [loadingDescription,setLoadingDescription]=useState("");
  const [transcriptOpen,setTranscriptOpen]=useState(false);
  const [error,setError]=useState("");
  const [active,setActive]=useState(-1);
  const [playhead,setPlayhead]=useState(0);
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState<(typeof CATEGORIES)[number]>("Όλα");
  const [doctor,setDoctor]=useState("Όλοι οι γιατροί");
  const [sort,setSort]=useState("recent");
  const [filter,setFilter]=useState<"all"|"favorites"|"recent">("all");
  const [modal,setModal]=useState(false);
  const [editingVideo,setEditingVideo]=useState<Video|null>(null);
  const [editRequest,setEditRequest]=useState<Video|null>(null);
  const [mobileMenu,setMobileMenu]=useState(false);
  const [momentModal,setMomentModal]=useState<{time:number;excerpt:string}|null>(null);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [isPseudoFullscreen,setIsPseudoFullscreen]=useState(false);
  const [isPlaying,setIsPlaying]=useState(false);
  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);
  const playerHost=useRef<HTMLDivElement>(null);
  const fullscreenHost=useRef<HTMLDivElement>(null);
  const player=useRef<Player|null>(null);
  const transcript=useRef<HTMLDivElement>(null);
  const saveTimer=useRef<number|undefined>(undefined);
  const activeRef=useRef(-1);
  const lastProgressSave=useRef(0);
  const selected=state.videos.find(v=>v.id===selectedId)||null;

  useEffect(()=>{ void (async()=>{
    let fallback:AppState|null=null;
    try{const raw=localStorage.getItem(PERSONAL_CACHE_KEY);if(raw)fallback=JSON.parse(raw) as AppState;}catch{}
    if(fallback?.videos)setState({settings:normalizedSettings(fallback.settings),videos:fallback.videos,moments:fallback.moments||[]});
    try{
      const r=await fetch("/api/state");
      if(r.ok){
        const j=await r.json();
        if(j.state?.videos)setState({settings:normalizedSettings(j.state.settings),videos:j.state.videos,moments:j.state.moments||[]});
      }
    }finally{setHydrated(true);}
  })(); },[]);
  useEffect(()=>{ if(!hydrated)return;try{localStorage.setItem(PERSONAL_CACHE_KEY,JSON.stringify(state));}catch{}window.clearTimeout(saveTimer.current); saveTimer.current=window.setTimeout(()=>{void fetch("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(state)}).catch(()=>undefined);},1500);return()=>window.clearTimeout(saveTimer.current); },[state,hydrated]);
  useEffect(()=>{
    if(!hydrated)return;
    const missing=state.videos.filter(video=>video.metadataVersion!==3);
    if(!missing.length)return;
    let cancelled=false;
    void Promise.all(missing.map(async video=>{
      try{
        const response=await fetch("/api/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url})});
        if(!response.ok)return null;
        const metadata=await response.json() as {id?:string;title?:string;originalTitle?:string;channel?:string;duration?:number;description?:string;speakerName?:string;category?:Category;tags?:string[]};
        return metadata.id?metadata:null;
      }catch{return null;}
    })).then(results=>{
      if(cancelled)return;
      const metadataById=new Map(results.filter(Boolean).map(result=>[result!.id!,result!]));
      if(!metadataById.size)return;
      setState(current=>({...current,videos:current.videos.map(video=>{
        const metadata=metadataById.get(video.id);
        if(!metadata)return video;
        return {...video,title:isGreekTitle(metadata.title||"")?metadata.title!:video.title,originalTitle:metadata.originalTitle||video.originalTitle,channel:metadata.channel||video.channel,duration:metadata.duration||video.duration,description:metadata.description||video.description,speakerName:metadata.speakerName||video.speakerName,category:metadata.category||video.category,tags:metadata.tags?.length?Array.from(new Set([...video.tags,...metadata.tags])):video.tags,metadataVersion:3};
      })}));
    });
    return()=>{cancelled=true;};
  },[hydrated,state.videos]);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: light)");
    const apply=()=>{document.documentElement.dataset.theme=state.settings.theme==="system"?(media.matches?"light":"dark"):state.settings.theme;};
    apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply);
  },[state.settings.theme]);
  useEffect(()=>{
    const fullscreenDocument=document as Document&{webkitFullscreenElement?:Element};
    const syncFullscreen=()=>setIsFullscreen((document.fullscreenElement||fullscreenDocument.webkitFullscreenElement)===fullscreenHost.current);
    document.addEventListener("fullscreenchange",syncFullscreen);
    document.addEventListener("webkitfullscreenchange",syncFullscreen);
    return()=>{document.removeEventListener("fullscreenchange",syncFullscreen);document.removeEventListener("webkitfullscreenchange",syncFullscreen);};
  },[]);
  useEffect(()=>{
    if(!isPseudoFullscreen)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=previousOverflow;};
  },[isPseudoFullscreen]);

  const doctors=useMemo(()=>["Όλοι οι γιατροί",...Array.from(new Set(state.videos.map(video=>video.speakerName||speakerForVideo(video.id,video.channel).name).filter(name=>/\b(?:Dr|Doctor|Δρ)\b/i.test(name)))).sort((a,b)=>a.localeCompare(b,"el"))],[state.videos]);
  const filtered=useMemo(()=> {
    let list=state.videos.filter(v=>(category==="Όλα"||v.category===category)&&(doctor==="Όλοι οι γιατροί"||(v.speakerName||speakerForVideo(v.id,v.channel).name)===doctor)&&(`${v.title} ${v.channel} ${v.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())));
    if(filter==="favorites") list=list.filter(v=>v.favorite);
    if(filter==="recent") list=list.filter(v=>v.lastWatched);
    return [...list].sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="progress"?b.progress-a.progress:b.addedAt.localeCompare(a.addedAt));
  },[state.videos,category,doctor,search,sort,filter]);
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

  function patchVideo(id:string,patch:Partial<Video>){setState(s=>({...s,videos:s.videos.map(v=>v.id===id?{...v,...patch}:v)}));}
  async function requestEdit(video:Video){
    try{
      const response=await fetch("/api/admin-auth",{cache:"no-store"});
      const result=await response.json() as {authorized?:boolean};
      if(response.ok&&result.authorized){setEditingVideo(video);return;}
    }catch{}
    setEditRequest(video);
  }
  async function openVideo(video:Video,start?:number,showTranscript=false,forceTranslation=false){
    const knownPoints=transcriptHighlights(video.captions||[]);
    patchVideo(video.id,{views:(video.views||0)+1});
    setSelectedId(video.id); setView("library"); setError(""); setLoadingDescription(video.description||"Ετοιμάζουμε την ελληνική περιγραφή του βίντεο."); setLoadingPoints(knownPoints); setTranscriptOpen(showTranscript);
    history.replaceState(null,"",`/?video=${video.id}${start?`&t=${Math.floor(start)}`:""}`);
    const localRecord=localStorage.getItem(`greektube-transcript:${video.id}:v4`);
    if(localRecord&&!forceTranslation){
      try{
        const cached=JSON.parse(localRecord) as Captions;
        if(isCompleteGreekTranscript(cached,video.duration)){
          setProgress(100);setCaptions(cached);setLoading(false);
          patchVideo(video.id,{title:isGreekTitle(video.title)?video.title:cached.title,originalTitle:video.originalTitle||cached.originalTitle||englishTitle(video),channel:video.channel||cached.channel,captions:cached.cues,speakerName:video.speakerName||cached.speaker?.name,lastWatched:new Date().toISOString()});
          window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),80);
          void fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url})}).then(async response=>{
            if(!response.ok)return;
            const refreshed=await response.json() as Captions;
            if(!isCompleteGreekTranscript(refreshed,video.duration))return;
            localStorage.setItem(`greektube-transcript:${video.id}:v4`,JSON.stringify(refreshed));
            setCaptions(refreshed);
          }).catch(()=>undefined);
          return;
        }
      }catch{}
    }
    setLoading(false); setProgress(4); setCaptions(null);
    const loadingDelay=window.setTimeout(()=>setLoading(true),500);
    const timer=window.setInterval(()=>setProgress(p=>Math.min(84,p+(p<28?2:p<60?1:.5))),1200);
    try{
      let data:Captions;
      {
        let response:Response|null=null;
        let sharedData:Captions|null=null;
        let transientFailures=0;
        for(let attempt=0;attempt<120;attempt++){
          const controller=new AbortController();
          const timeout=window.setTimeout(()=>controller.abort(),300000);
          try{
            response=await fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url,force:forceTranslation&&attempt===0}),signal:controller.signal});
          }catch{
            response=null;
          }finally{
            window.clearTimeout(timeout);
          }
          if(response?.status===202){
            setLoading(true);
            const processing=await response.json();
            if(typeof processing.progress==="number")setProgress(Math.max(4,Math.min(96,processing.progress)));
            if(Array.isArray(processing.keyPoints)&&processing.keyPoints.length)setLoadingPoints(processing.keyPoints);
            await new Promise(resolve=>window.setTimeout(resolve,1000));
            continue;
          }
          if(response?.ok){sharedData=await response.json();break;}
          if(!response||response.status===429||response.status>=500){
            transientFailures+=1;
            if(transientFailures<5){
              await new Promise(resolve=>window.setTimeout(resolve,Math.min(6000,1000*transientFailures)));
              continue;
            }
            throw new Error("shared-storage");
          }
          break;
        }
        if(!isCompleteGreekTranscript(sharedData,video.duration))throw new Error("incomplete-transcript");
        data=sharedData;
        localStorage.setItem(`greektube-transcript:${video.id}:v4`,JSON.stringify(sharedData));
        patchVideo(video.id,{title:isGreekTitle(video.title)?video.title:sharedData.title,originalTitle:video.originalTitle||sharedData.originalTitle||englishTitle(video),channel:video.channel||sharedData.channel,captions:sharedData.cues,speakerName:video.speakerName||sharedData.speaker?.name});
      }
      const points=data.keyPoints?.length?data.keyPoints:transcriptHighlights(data.cues);
      if(points.length){setLoadingPoints(points);setProgress(100);await new Promise(resolve=>window.setTimeout(resolve,750));}
      setProgress(100); setCaptions(data); setLoading(false); patchVideo(video.id,{lastWatched:new Date().toISOString()});
      window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),120);
    }catch{
      const local=localStorage.getItem(`greektube-transcript:${video.id}:v4`);
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
    }finally{window.clearTimeout(loadingDelay);clearInterval(timer);}
  }
  function initPlayer(id:string,start:number){
    const disableYouTubeCaptions=(target:Player)=>{
      if(target.getOptions?.().includes("captions")){
        target.unloadModule?.("captions");
      }
    };
    const create=()=>{if(!window.YT||!playerHost.current)return; player.current?.destroy(); playerHost.current.innerHTML=""; player.current=new window.YT.Player(playerHost.current,{videoId:id,width:"100%",height:"100%",playerVars:{autoplay:state.settings.autoplay?1:0,controls:1,modestbranding:1,rel:0,playsinline:1,fs:0,start:Math.floor(start),cc_load_policy:0,iv_load_policy:3,showinfo:0,hl:"el"},events:{onReady:({target}:{target:Player})=>{disableYouTubeCaptions(target);window.setTimeout(()=>disableYouTubeCaptions(target),350);target.setPlaybackRate(state.settings.speed);if(state.settings.autoplay)target.playVideo();},onApiChange:({target}:{target:Player})=>disableYouTubeCaptions(target),onStateChange:({target,data}:{target:Player;data:number})=>{disableYouTubeCaptions(target);setIsPlaying(data===1);}}});};
    if(window.YT?.Player)create(); else{if(!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')){const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";document.head.appendChild(s);}window.onYouTubeIframeAPIReady=create;}
  }
  useEffect(()=>{if(!captions||!selectedId)return;lastProgressSave.current=0;const selectedDuration=selected?.duration||0;const timer=window.setInterval(()=>{const now=player.current?.getCurrentTime();if(typeof now!=="number")return;setPlayhead(now+state.settings.delay);const nextActive=activeIndex(captions.cues,now+state.settings.delay);if(nextActive!==activeRef.current){activeRef.current=nextActive;setActive(nextActive);}const duration=player.current?.getDuration()||selectedDuration;if(duration>0&&now-lastProgressSave.current>=5){lastProgressSave.current=now;patchVideo(selectedId,{lastPosition:now,duration,progress:Math.min(100,(now/duration)*100)});}},250);return()=>clearInterval(timer);},[captions,selectedId,state.settings.delay,selected?.duration]);
  useEffect(()=>{
    if(active<0||!state.settings.autoScroll||!transcript.current)return;
    const container=transcript.current;
    const cue=container.querySelector(`[data-cue="${active}"]`) as HTMLElement|null;
    if(!cue)return;
    const target=Math.max(0,cue.offsetTop-container.clientHeight/2+cue.clientHeight/2);
    container.scrollTo({top:target,behavior:"smooth"});
  },[active,state.settings.autoScroll]);
  useEffect(()=>{const params=new URLSearchParams(location.search);const id=params.get("video");const t=Number(params.get("t")||0);if(hydrated&&id){const v=state.videos.find(x=>x.id===id);if(v)window.setTimeout(()=>void openVideo(v,t),0);}},[hydrated]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==="m"&&selected){e.preventDefault();beginMoment();}};addEventListener("keydown",key);return()=>removeEventListener("keydown",key);},[selected,active,captions]);

  function seek(time:number){player.current?.seekTo(time,true);player.current?.playVideo();}
  function skip(seconds:number){
    const target=player.current;if(!target)return;
    const duration=target.getDuration()||0;
    target.seekTo(Math.max(0,Math.min(duration||Number.MAX_SAFE_INTEGER,target.getCurrentTime()+seconds)),true);
  }
  function togglePlayback(){
    const target=player.current;if(!target)return;
    if(target.getPlayerState()===1)target.pauseVideo();else target.playVideo();
  }
  async function toggleFullscreen(){
    if(isPseudoFullscreen){setIsPseudoFullscreen(false);return;}
    const fullscreenDocument=document as Document&{webkitFullscreenElement?:Element;webkitExitFullscreen?:()=>Promise<void>|void};
    if(document.fullscreenElement||fullscreenDocument.webkitFullscreenElement){
      if(document.exitFullscreen)await document.exitFullscreen();
      else await fullscreenDocument.webkitExitFullscreen?.();
      return;
    }
    const isAppleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    if(isAppleMobile){setIsPseudoFullscreen(true);return;}
    const target=fullscreenHost.current as (HTMLDivElement&{webkitRequestFullscreen?:()=>Promise<void>|void})|null;
    try{
      if(target?.requestFullscreen)await target.requestFullscreen();
      else if(target?.webkitRequestFullscreen)await target.webkitRequestFullscreen();
      else setIsPseudoFullscreen(true);
    }catch{setIsPseudoFullscreen(true);}
  }
  function beginMoment(time=player.current?.getCurrentTime()||0,excerpt=captions?.cues[active]?.text||""){setMomentModal({time,excerpt});}
  function saveMoment(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selected||!momentModal)return;const fd=new FormData(event.currentTarget);const m:Moment={id:uid(),videoId:selected.id,time:momentModal.time,note:String(fd.get("note")||"Αποθηκευμένη στιγμή"),tags:String(fd.get("tags")||"").split(",").map(x=>x.trim()).filter(Boolean),excerpt:momentModal.excerpt};setState(s=>({...s,moments:[m,...s.moments]}));setMomentModal(null);void copyMoment(m);}
  async function copyMoment(m:Moment){const url=`${location.origin}/?video=${m.videoId}&t=${Math.floor(m.time)}`;await navigator.clipboard?.writeText(url);}
  function close(){player.current?.destroy();player.current=null;setIsPseudoFullscreen(false);setSelectedId(null);setCaptions(null);setTranscriptOpen(false);setError("");history.replaceState(null,"","/");}
  function goToSettings(){
    const time=player.current?.getCurrentTime()||selected?.lastPosition||0;
    if(selectedId)patchVideo(selectedId,{lastPosition:time});
    player.current?.destroy();player.current=null;setTranscriptOpen(false);setError("");setView("settings");
  }
  function returnToVideo(){
    if(!selectedId)return;
    const position=state.videos.find(video=>video.id===selectedId)?.lastPosition||0;
    setView("library");
    window.setTimeout(()=>initPlayer(selectedId,position),120);
  }
  function goHome(){close();setView("library");setMobileMenu(false);}
  async function rebuildTranslation(video:Video){
    localStorage.removeItem(`greektube-transcript:${video.id}:v3`);
    localStorage.removeItem(`greektube-transcript:${video.id}:v4`);
    setEditingVideo(null);
    player.current?.destroy();
    player.current=null;
    await openVideo(video,video.lastPosition,false,true);
  }

  if(selected){
    const moments=state.moments.filter(m=>m.videoId===selected.id);
    const speaker=captions?.speaker||speakerForVideo(selected.id,selected.channel);
    const preparationStage=progress>=100?"Οι ελληνικοί υπότιτλοι είναι έτοιμοι":[...PREPARATION_STAGES].reverse().find(stage=>progress>=stage.at)?.label||PREPARATION_STAGES[0].label;
    if(view==="settings")return <main className="app-shell viewer settings-from-player"><header className="app-header"><button className="ghost back-to-video" onClick={returnToVideo}>← Πίσω στο βίντεο</button><Brand home={goHome}/><button className="icon-button active" aria-label="Ρυθμίσεις">⚙</button></header><SettingsPage settings={state.settings} update={patch=>setState(current=>({...current,settings:{...current.settings,...patch}}))}/></main>;
    return <main className="app-shell viewer">
      <header className="app-header"><button className="ghost back-library" onClick={close}><span aria-hidden="true">‹</span> Βιβλιοθήκη</button><Brand home={goHome}/><button className="icon-button" aria-label="Ρυθμίσεις" onClick={goToSettings}>⚙</button></header>
      {loading&&<section className="content-loading">
        <div className="loading-visual"><img src={`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`} alt=""/><div className="loading-percentage" aria-label={`${Math.round(progress)} τοις εκατό`}>{Math.round(progress)}%</div><div className="loading-caption"><small>{speaker.name}</small><h1>{greekTitle(selected)}</h1>{englishTitle(selected)&&<p className="original-title">{englishTitle(selected)}</p>}</div></div>
        <div className="loading-insights">
          <div className="loading-progress-line"><span>Προετοιμασία υποτίτλων</span></div>
          <div className="progress" role="progressbar" aria-label="Πρόοδος προετοιμασίας" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:`${progress}%`}}/></div>
          <div className={`preparation-status ${progress>=100?"done":""}`} aria-live="polite"><i aria-hidden="true">{progress>=100?"✓":""}</i><span key={preparationStage}>{preparationStage}</span></div>
          <section className="speaker-loading-card"><h2>{speaker.name}</h2><strong>{speaker.role}</strong></section>
          <h2>Περιγραφή βίντεο</h2>
          <div className="loading-description">{loadingDescription}</div>
          {loadingPoints.length>0&&<><h2 className="loading-points-title">Βασικά σημεία του βίντεο</h2><ul>{loadingPoints.slice(0,10).map((point,index)=><li key={`${point}-${index}`}><i>{String(index+1).padStart(2,"0")}</i><span>{point}</span></li>)}</ul></>}
        </div>
      </section>}
      {error&&<section className="empty"><b>!</b><h2>Δεν ολοκληρώθηκε η προετοιμασία</h2><p>{error}</p><button className="primary" onClick={()=>void openVideo(selected)}>Δοκίμασε ξανά</button></section>}
      {!loading&&captions&&<>
        <section className={`watch-layout ${transcriptOpen?"transcript-open":"player-only"}`}>
          <div className="watch-main">
            <div className="sticky-player" onContextMenu={e=>{e.preventDefault();beginMoment();}}>
              <div className={`video-frame ${isPseudoFullscreen?"pseudo-fullscreen":""}`} ref={fullscreenHost}><div ref={playerHost}/>{state.settings.subtitles&&active>=0&&<div className={`subtitles ${state.settings.subtitlePosition}`} style={{"--subtitle-size":`${state.settings.subtitleSize}px`,background:`rgba(0,0,0,${state.settings.opacity})`} as CSSProperties}>{state.settings.subtitleMode==="en"?subtitleWindow(captions.englishCues?.[active]||captions.cues[active],playhead):state.settings.subtitleMode==="dual"?<><span>{subtitleWindow(captions.cues[active],playhead)}</span>{captions.englishCues?.[active]?.text&&<small>{subtitleWindow(captions.englishCues[active],playhead)}</small>}</>:subtitleWindow(captions.cues[active],playhead)}</div>}{(isFullscreen||isPseudoFullscreen)&&<button className="custom-fullscreen" title="Έξοδος από πλήρη οθόνη" aria-label="Έξοδος από πλήρη οθόνη" onClick={()=>void toggleFullscreen()}>↙</button>}</div>
              <div className="player-actions player-tools">
                <small className="player-tools-label">Εργαλεία</small>
                <div className="player-toolbar">
                  <section className="control-section primary-control-section"><div className="primary-control-row"><div className="playback-controls" role="group" aria-label="Έλεγχος αναπαραγωγής"><button className="skip-button" aria-label="Πίσω 10 δευτερόλεπτα" onClick={()=>skip(-10)}>≪</button><button className="play-toggle" aria-label={isPlaying?"Παύση":"Αναπαραγωγή"} onClick={togglePlayback}>{isPlaying?"Ⅱ":"▶"}</button><button className="skip-button" aria-label="Μπροστά 10 δευτερόλεπτα" onClick={()=>skip(10)}>≫</button></div><i className="controls-separator" aria-hidden="true"/><div className="subtitle-cc-control"><button className={`cc-toggle ${state.settings.subtitles?"active":""}`} aria-label="Επιλογές υποτίτλων" aria-expanded={subtitleMenuOpen} onClick={()=>setSubtitleMenuOpen(open=>!open)}>CC</button>{subtitleMenuOpen&&<div className="subtitle-cc-menu" role="menu" aria-label="Επιλογές υποτίτλων"><button className={!state.settings.subtitles?"active":""} role="menuitemradio" aria-checked={!state.settings.subtitles} onClick={()=>{setState(current=>({...current,settings:{...current.settings,subtitles:false}}));setSubtitleMenuOpen(false);}}><span>Χωρίς υπότιτλους</span>{!state.settings.subtitles&&<i>✓</i>}</button>{[{size:16,label:"Μικροί"},{size:19,label:"Μεσαίοι"},{size:22,label:"Μεγάλοι"}].map(option=><button key={option.size} className={state.settings.subtitles&&state.settings.subtitleSize===option.size?"active":""} role="menuitemradio" aria-checked={state.settings.subtitles&&state.settings.subtitleSize===option.size} onClick={()=>{setState(current=>({...current,settings:{...current.settings,subtitles:true,subtitleSize:option.size,subtitleSizeVersion:2}}));setSubtitleMenuOpen(false);}}><span>{option.label}</span>{state.settings.subtitles&&state.settings.subtitleSize===option.size&&<i>✓</i>}</button>)}</div>}</div></div></section>
                </div>
                <section className="control-section action-section"><div className="player-secondary-actions"><button className="fullscreen-toggle" aria-label="Πλήρης οθόνη" onClick={()=>void toggleFullscreen()}><span className="tool-icon fullscreen-icon" aria-hidden="true">⌗</span><b>Πλήρης<br/>οθόνη</b></button><button className="moment-save" onClick={()=>beginMoment()}><span className="tool-icon" aria-hidden="true">＋</span><b>Αποθήκευση<br/>στιγμής</b></button><button className="transcript-toggle" onClick={()=>setTranscriptOpen(value=>!value)}><span className="tool-icon" aria-hidden="true">≡</span><b>{transcriptOpen?"Κλείσιμο":"Κείμενο"}</b></button></div></section>
              </div>
            </div>
            <div className="video-heading"><div><small>{selected.channel} · {CATEGORY_LABELS[selected.category]} · Προβολές: {selected.views||0}</small><h1 className="player-greek-title">{isGreekTitle(selected.title)?selected.title:isGreekTitle(captions.title)?captions.title:"Βίντεο με ελληνικούς υπότιτλους"}</h1>{(selected.originalTitle||captions.originalTitle||englishTitle(selected))&&<a className="player-original-title" href={selected.url} target="_blank" rel="noreferrer" title="Άνοιγμα στο YouTube">{selected.originalTitle||captions.originalTitle||englishTitle(selected)}</a>}<div className="speaker-row"><span>Ομιλητής</span><strong>{selected.speakerName||speaker.name}</strong><i>{speaker.role}</i></div></div><div className="heading-actions"><button type="button" className="edit-video" onClick={()=>void requestEdit(selected)}><span aria-hidden="true">✎</span> Επεξεργασία</button><button aria-label="Αγαπημένο" className={`favorite ${selected.favorite?"active":""}`} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♥</button></div></div>
            <section className="moments"><div className="section-title"><h2>Αποθηκευμένες στιγμές</h2><small>{moments.length}</small></div>{moments.length===0?<p className="muted">Πάτησε M ή το κουμπί πάνω για να κρατήσεις ένα σημείο.</p>:moments.map(m=><article className="moment" key={m.id} onClick={()=>seek(m.time)}><time>{clock(m.time)}</time><div><strong>{m.note}</strong><p>{m.excerpt}</p></div><div className="moment-actions"><button onClick={e=>{e.stopPropagation();seek(m.time)}}>Αναπαραγωγή</button><button onClick={e=>{e.stopPropagation();void copyMoment(m)}}>Αντιγραφή συνδέσμου</button><button onClick={e=>{e.stopPropagation();navigator.share?.({title:m.note,url:`${location.origin}/?video=${m.videoId}&t=${Math.floor(m.time)}`})}}>Κοινοποίηση</button><button onClick={e=>{e.stopPropagation();setState(s=>({...s,moments:s.moments.filter(x=>x.id!==m.id)}))}}>Διαγραφή</button></div></article>)}</section>
          </div>
          {transcriptOpen&&<aside className="side-panel transcript-drawer">
            <div className="drawer-header"><div><small>Ελληνικοί υπότιτλοι</small><strong>Μεταγραφή</strong></div><button aria-label="Κλείσιμο μεταγραφής" onClick={()=>setTranscriptOpen(false)}>×</button></div>
            <div className="transcript" ref={transcript}>{captions.cues.length?captions.cues.map((c,i)=><button key={`${c.start}-${i}`} data-cue={i} className={state.settings.highlight&&i===active?"active":""} onClick={()=>seek(c.start)} onContextMenu={e=>{e.preventDefault();beginMoment(c.start,c.text)}}><time>{clock(c.start)}</time><span>{c.text}</span><i onClick={e=>{e.stopPropagation();beginMoment(c.start,c.text)}}>＋</i></button>):<div className="transcript-empty">Δεν υπάρχει αποθηκευμένη μεταγραφή.</div>}</div>
          </aside>}
        </section>
      </>}
      {momentModal&&<Modal title="Αποθήκευση στιγμής" close={()=>setMomentModal(null)}><form className="form moment-form" onSubmit={saveMoment}><div className="moment-preview"><time>{clock(momentModal.time)}</time><p>{momentModal.excerpt||"Η στιγμή θα αποθηκευτεί στο συγκεκριμένο σημείο του βίντεο."}</p></div><label>Σύντομη σημείωση<input name="note" autoFocus placeholder="Τι θέλεις να θυμάσαι από αυτό το σημείο;"/></label><label>Ετικέτες <small>Προαιρετικά</small><input name="tags" placeholder="π.χ. ινσουλίνη, διατροφή"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setMomentModal(null)}>Ακύρωση</button><button className="primary">Αποθήκευση στιγμής</button></div></form></Modal>}
      {editRequest&&<EditPassword close={()=>setEditRequest(null)} authorized={()=>{setEditingVideo(editRequest);setEditRequest(null);}}/>}
      {editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:3});setEditingVideo(null);}} rebuild={()=>void rebuildTranslation(editingVideo)}/>}
    </main>;
  }

  return <main className="app-shell">
    <header className="app-header"><Brand home={goHome}/><nav className="desktop-nav"><button className={view==="library"?"active":""} onClick={()=>setView("library")}>Βιβλιοθήκη</button><button className={view==="settings"?"active":""} onClick={()=>setView("settings")}>Ρυθμίσεις</button></nav><button className="primary compact add-top" onClick={()=>setModal(true)}>＋ Προσθήκη βίντεο</button><button className={`mobile-menu-toggle ${mobileMenu?"active":""}`} aria-label={mobileMenu?"Κλείσιμο μενού":"Άνοιγμα μενού"} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(value=>!value)}><i/><i/><i/></button>{mobileMenu&&<div className="mobile-menu"><button className={view==="library"?"active":""} onClick={goHome}>Βιβλιοθήκη</button><button className={view==="settings"?"active":""} onClick={()=>{setView("settings");setMobileMenu(false)}}>Ρυθμίσεις</button><button className="primary mobile-add" onClick={()=>{setModal(true);setMobileMenu(false)}}>＋ Προσθήκη βίντεο</button></div>}</header>
    {view==="settings"?<SettingsPage settings={state.settings} update={patch=>setState(s=>({...s,settings:{...s.settings,...patch}}))}/>:<>
      <section className="home-intro"><span>Βίντεο βιβλιοθήκη</span><h1>Αυτόματοι ελληνικοί υπότιτλοι</h1></section>
      {featured&&<section className="featured" aria-label="Προτεινόμενο βίντεο">
        <button className="featured-media" onClick={()=>void openVideo(featured,featured.lastPosition)} aria-label={`Συνέχεια προβολής: ${greekTitle(featured)}`}>
          <img src={`https://i.ytimg.com/vi/${featured.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${featured.id}/hqdefault.jpg`}} alt=""/>
          <span className="featured-play">▶</span>
          <div className="featured-overlay"><small>{featured.channel}</small><strong>{greekTitle(featured)}</strong></div>
          <div className="featured-progress"><i style={{width:`${featured.progress}%`}}/></div>
        </button>
        <div className="featured-panel">
          <div className="featured-meta"><span>{CATEGORY_LABELS[featured.category]} · Προβολές: {featured.views||0}</span><button aria-label="Αγαπημένο" className={`featured-favorite ${featured.favorite?"active":""}`} onClick={()=>patchVideo(featured.id,{favorite:!featured.favorite})}>♥</button></div>
          <h2>{greekTitle(featured)}</h2>
          {englishTitle(featured)&&<p className="featured-original-title">{englishTitle(featured)}</p>}
          <small className="featured-speaker">{featured.speakerName||speakerForVideo(featured.id,featured.channel).name}</small>
          <div className="featured-details"><span>{Math.round(featured.progress)}% ολοκληρώθηκε</span>{featured.duration>0&&<span>{clock(Math.max(0,featured.duration-featured.lastPosition))} απομένουν</span>}<span>{featuredMoments.length} στιγμές</span></div>
          <div className="featured-actions">
            <button className="primary" onClick={()=>void openVideo(featured,featured.lastPosition)}>▶ Συνέχεια προβολής</button>
            <button className="secondary" onClick={()=>void openVideo(featured,0)}>↺ Από την αρχή</button>
            <button className="text-action" onClick={()=>void openVideo(featured,featured.lastPosition,true)}>Άνοιγμα μεταγραφής →</button>
          </div>
          {featuredMoments[0]&&<button className="latest-moment" onClick={()=>void openVideo(featured,featuredMoments[0].time)}><span>Τελευταία στιγμή · {clock(featuredMoments[0].time)}</span><strong>{featuredMoments[0].note}</strong></button>}
        </div>
      </section>}
      {state.settings.continueWatching&&continueVideos.length>0&&<section className="continue-section"><div className="continue-header"><div><span>ΣΥΝΕΧΙΣΗ ΠΡΟΒΟΛΗΣ</span><div className="continue-title-line"><h2>Συνέχισε την προβολή</h2><small>{continueVideos.length} {continueVideos.length===1?"βίντεο":"βίντεο"}</small></div><p>Συνέχισε από το σημείο που σταμάτησες.</p></div><button onClick={()=>document.querySelector(".library-tools")?.scrollIntoView({behavior:"smooth",block:"start"})}>Προβολή όλων</button></div><div className="continue-row">{continueVideos.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} edit={requestEdit} settings={state.settings} variant="continue"/>)}</div></section>}
      <section className="library-tools"><div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Αναζήτηση βίντεο, καναλιού ή ετικέτας"/></div><select aria-label="Ταξινόμηση" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Πρόσφατα</option><option value="title">Τίτλος</option><option value="progress">Πρόοδος</option></select><div className="quick-filters"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Όλα</button><button className={filter==="favorites"?"active":""} onClick={()=>setFilter("favorites")}>♥ Αγαπημένα</button><button className={filter==="recent"?"active":""} onClick={()=>setFilter("recent")}>Πρόσφατη προβολή</button></div></section>
      <div className="category-row">{CATEGORIES.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{CATEGORY_LABELS[c]}</button>)}</div>
      <div className="doctor-filter" aria-label="Φίλτρο ανά γιατρό"><span>Γιατροί</span><div>{doctors.map(name=><button key={name} className={doctor===name?"active":""} onClick={()=>setDoctor(name)}>{name}</button>)}</div></div>
      <section className={`video-grid ${state.settings.layout} ${state.settings.compact?"compact":""}`}>{filtered.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} edit={requestEdit} settings={state.settings}/>)}</section>
      {filtered.length===0&&<div className="empty"><h2>Δεν βρέθηκαν βίντεο</h2><p>Δοκίμασε διαφορετική κατηγορία ή αναζήτηση.</p></div>}
    </>}
    {modal&&<AddVideo existingIds={state.videos.map(video=>video.id)} close={()=>setModal(false)} add={async(video,translate)=>{setState(s=>({...s,videos:[video,...s.videos]}));setModal(false);if(translate)await openVideo(video);}}/>}
    {editRequest&&<EditPassword close={()=>setEditRequest(null)} authorized={()=>{setEditingVideo(editRequest);setEditRequest(null);}}/>}
    {editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:3});setEditingVideo(null);}}/>}
  </main>;
}

function Brand({home}:{home:()=>void}){return <button className="brand brand-home" aria-label="Αρχική σελίδα" onClick={home}><span className="brand-mark"><i>≡</i>▶</span><span>GreekTube <b>Subs</b></span><small className="brand-version">ver 5.6</small></button>;}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")close();};addEventListener("keydown",escape);return()=>removeEventListener("keydown",escape);},[close]);return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button aria-label="Κλείσιμο" onClick={close}>×</button></header>{children}</section></div>;}
function EditPassword({close,authorized}:{close:()=>void;authorized:()=>void}){
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");
    const password=String(new FormData(event.currentTarget).get("password")||"");
    try{
      const response=await fetch("/api/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const result=await response.json() as {authorized?:boolean;error?:string};
      if(!response.ok||!result.authorized){setError(result.error||"Ο κωδικός δεν είναι σωστός.");return;}
      authorized();
    }catch{setError("Δεν ήταν δυνατός ο έλεγχος του κωδικού.");}
    finally{setBusy(false);}
  }
  return <Modal title="Προστατευμένη επεξεργασία" close={close}><form className="form password-form" onSubmit={submit}><div className="password-intro"><span aria-hidden="true">⌑</span><div><strong>Απαιτείται κωδικός</strong><p>Η επεξεργασία είναι διαθέσιμη μόνο στον διαχειριστή.</p></div></div><label>Κωδικός πρόσβασης<input name="password" type="password" autoFocus autoComplete="current-password" required placeholder="Πληκτρολόγησε τον κωδικό"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>Ακύρωση</button><button className="primary" disabled={busy}>{busy?"Έλεγχος…":"Συνέχεια"}</button></div></form></Modal>;
}
function VideoCard({video,open,patch,edit,settings,variant="library"}:{video:Video;open:(v:Video)=>void;patch:(id:string,p:Partial<Video>)=>void;edit:(v:Video)=>void;settings:Settings;variant?:"library"|"continue"}){const title=greekTitle(video);const watchedMinutes=Math.round(video.lastPosition/60);const totalMinutes=Math.ceil(video.duration/60);return <article className={`video-card ${variant==="continue"?"continue-card":""}`} role="button" tabIndex={0} aria-label={`Άνοιγμα βίντεο: ${title}`} onClick={()=>void open(video)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();void open(video)}}}><div className="thumb"><img loading="lazy" decoding="async" src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt=""/><span className="duration">{video.duration?clock(video.duration):"Ελληνικοί υπότιτλοι"}</span><button aria-label="Επεξεργασία βίντεο" className="card-edit" onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();edit(video)}}>✎</button><button aria-label="Αγαπημένο" className={`heart ${video.favorite?"active":""}`} onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();patch(video.id,{favorite:!video.favorite})}}>♥</button>{video.progress>0&&<i className="card-progress" style={{width:`${video.progress}%`}}/>}</div><div className="card-info"><strong>{title}</strong>{englishTitle(video)&&englishTitle(video)!==title&&<p className="card-original-title">{englishTitle(video)}</p>}<span>{video.channel}</span><small>{variant==="continue"?(totalMinutes>0?`${watchedMinutes} / ${totalMinutes} λεπτά`:"Η διάρκεια υπολογίζεται…"):`${CATEGORY_LABELS[video.category]}${video.progress>0?` · ${Math.round(video.progress)}%`:""}`}</small>{variant==="library"&&settings.descriptions&&<p>{video.description}</p>}</div></article>;}

function EditVideo({video,close,save,rebuild}:{video:Video;close:()=>void;save:(patch:Partial<Video>)=>void;rebuild?:()=>void}) {
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    save({
      title:String(data.get("title")||video.title).trim(),
      originalTitle:String(data.get("originalTitle")||"").trim(),
      speakerName:String(data.get("speakerName")||"").trim(),
      channel:String(data.get("channel")||video.channel).trim(),
      category:String(data.get("category")||video.category) as Category,
      tags:String(data.get("tags")||"").split(",").map(tag=>tag.trim()).filter(Boolean),
      description:String(data.get("description")||"").trim(),
    });
  }
  return <Modal title="Επεξεργασία βίντεο" close={close}><form className="form edit-video-form" onSubmit={submit}>
    <div className="edit-video-preview"><img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt=""/><div><strong>{greekTitle(video)}</strong><span>{clock(video.duration)}</span></div></div>
    <label>Ελληνικός τίτλος<input name="title" required defaultValue={video.title}/></label>
    <label>Αγγλικός τίτλος<input name="originalTitle" defaultValue={video.originalTitle||""}/></label>
    <div className="form-grid"><label>Γιατρός ή ομιλητής<input name="speakerName" defaultValue={video.speakerName||""}/></label><label>Κανάλι<input name="channel" defaultValue={video.channel}/></label></div>
    <div className="form-grid"><label>Κατηγορία<select name="category" defaultValue={video.category}>{CATEGORIES.slice(1).map(category=><option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select></label><label>Ετικέτες<input name="tags" defaultValue={video.tags.join(", ")}/></label></div>
    <label>Περιγραφή<textarea name="description" defaultValue={video.description}/></label>
    {rebuild&&<button type="button" className="secondary rebuild-translation" onClick={rebuild}>↻ Νέα μετάφραση από το αγγλικό πρωτότυπο</button>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Ακύρωση</button><button className="primary">Αποθήκευση αλλαγών</button></div>
  </form></Modal>;
}

function AddVideo({close,add,existingIds}:{close:()=>void;add:(v:Video,t:boolean)=>Promise<void>;existingIds:string[]}) {
  const [url,setUrl]=useState("");const [metadata,setMetadata]=useState<{id:string;title:string;originalTitle?:string;channel:string;duration?:number;description?:string;speakerName?:string;category?:Category;tags?:string[]}|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function inspect(){const id=extractId(url);if(!id){setError("Βάλε έναν έγκυρο σύνδεσμο YouTube.");return;}if(existingIds.includes(id)){setError("Αυτό το βίντεο υπάρχει ήδη στη βιβλιοθήκη.");return;}setBusy(true);setError("");try{const r=await fetch("/api/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});const j=await r.json();if(!r.ok)throw new Error(j.error);setMetadata(j);}catch(e){setError(e instanceof Error?e.message:"Σφάλμα");}finally{setBusy(false);}}
  async function submit(e:React.MouseEvent<HTMLButtonElement>,translate:boolean){e.preventDefault();const form=e.currentTarget.form;if(!form||busy)return;if(!metadata){await inspect();return;}setBusy(true);const fd=new FormData(form);const manualTags=String(fd.get("tags")||"").split(",").map(x=>x.trim()).filter(Boolean);const v:Video={id:metadata.id,url,title:metadata.title,originalTitle:metadata.originalTitle,channel:metadata.channel,speakerName:metadata.speakerName,category:String(fd.get("category")||metadata.category||"Other") as Category,tags:Array.from(new Set([...(metadata.tags||[]),...manualTags])),notes:String(fd.get("notes")||""),description:String(fd.get("notes")||metadata.description||"Νέο βίντεο στη βιβλιοθήκη."),duration:metadata.duration||0,addedAt:new Date().toISOString(),favorite:false,lastPosition:0,progress:0,metadataVersion:3};await add(v,translate);}
  return <Modal title="Προσθήκη βίντεο" close={close}><form className="form"><label>Σύνδεσμος YouTube<div className="inspect-row"><input value={url} onChange={e=>{setUrl(e.target.value);setMetadata(null);setError("")}} placeholder="https://youtube.com/watch?v=…"/><button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?"Έλεγχος…":"Έλεγχος"}</button></div></label>{error&&<p className="form-error">{error}</p>}{metadata&&<div className="metadata"><img src={`https://i.ytimg.com/vi/${metadata.id}/hqdefault.jpg`} alt=""/><div><strong>{metadata.title}</strong>{metadata.originalTitle&&<small>{metadata.originalTitle}</small>}<span>{metadata.speakerName||metadata.channel} · {CATEGORY_LABELS[metadata.category||"Other"]} · {metadata.duration?clock(metadata.duration):"Διάρκεια υπό υπολογισμό"}</span></div></div>}<div className="form-grid"><label>Κατηγορία<select name="category" key={metadata?.category||"Other"} defaultValue={metadata?.category||"Other"}>{CATEGORIES.slice(1).map(c=><option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label><label>Ετικέτες<input name="tags" defaultValue={metadata?.tags?.join(", ")||""} placeholder="υγεία, ινσουλίνη"/></label></div><label>Προσωπικές σημειώσεις<textarea name="notes" placeholder="Γιατί θέλω να κρατήσω αυτό το βίντεο…"/></label><div className="modal-actions"><button className="secondary" disabled={busy} onClick={e=>void submit(e,false)}>Αποθήκευση</button><button className="primary" disabled={busy} onClick={e=>void submit(e,true)}>Αποθήκευση και ετοιμασία υποτίτλων</button></div></form></Modal>;
}

function SettingsPage({settings,update}:{settings:Settings;update:(p:Partial<Settings>)=>void}) {
  const toggle=(key:keyof Settings,label:string)=><label className="setting-row"><span>{label}</span><input type="checkbox" checked={Boolean(settings[key])} onChange={e=>update({[key]:e.target.checked})}/></label>;
  return <section className="settings-page"><header><span>Προτιμήσεις εφαρμογής</span><h1>Ρυθμίσεις</h1><p>Οι αλλαγές αποθηκεύονται αυτόματα και εφαρμόζονται σε όλα τα βίντεο.</p></header><div className="settings-grid"><section><h2>Υπότιτλοι</h2><label>Προεπιλεγμένη γλώσσα<select value={settings.subtitleMode} onChange={e=>update({subtitleMode:e.target.value as Settings["subtitleMode"]})}><option value="el">Ελληνικά</option><option value="en">Αγγλικά</option><option value="dual">Διπλοί υπότιτλοι</option></select></label><label>Μέγεθος γραμματοσειράς<input type="range" min="13" max="28" value={settings.subtitleSize} onChange={e=>update({subtitleSize:+e.target.value,subtitleSizeVersion:2})}/><output>{settings.subtitleSize}px · αποθηκεύεται ως προεπιλογή</output></label><label>Θέση<select value={settings.subtitlePosition} onChange={e=>update({subtitlePosition:e.target.value as "top"|"bottom"})}><option value="bottom">Κάτω</option><option value="top">Πάνω</option></select></label><label>Διαφάνεια φόντου<input type="range" min="0" max="1" step=".1" value={settings.opacity} onChange={e=>update({opacity:+e.target.value})}/></label><label>Καθυστέρηση υποτίτλων<input type="range" min="-5" max="5" step=".1" value={settings.delay} onChange={e=>update({delay:+e.target.value})}/><output>{settings.delay}s</output></label>{toggle("subtitles","Εμφάνιση υποτίτλων")}{toggle("autoScroll","Αυτόματη κύλιση μεταγραφής")}{toggle("highlight","Επισήμανση ενεργής γραμμής")}</section><section><h2>Αναπαραγωγή</h2>{toggle("autoplay","Αυτόματη αναπαραγωγή")}<label>Προεπιλεγμένη ταχύτητα<select value={settings.speed} onChange={e=>update({speed:+e.target.value})}>{[.5,.75,1,1.25,1.5,2].map(x=><option key={x} value={x}>{x}×</option>)}</select></label>{toggle("autoTranslate","Αυτόματη μετάφραση")}{toggle("autoCategory","Αυτόματη κατηγοριοποίηση")}{toggle("continueWatching","Συνέχιση προβολής")}</section><section><h2>Εμφάνιση</h2><label>Διάταξη βιβλιοθήκης<select value={settings.layout} onChange={e=>update({layout:e.target.value as "grid"|"list"})}><option value="grid">Πλέγμα</option><option value="list">Λίστα</option></select></label><label>Θέμα<select value={settings.theme} onChange={e=>update({theme:e.target.value as Settings["theme"]})}><option value="dark">Σκούρο</option><option value="light">Φωτεινό</option><option value="system">Σύστημα</option></select></label>{toggle("compact","Συμπαγείς κάρτες")}{toggle("descriptions","Εμφάνιση περιγραφών")}</section></div></section>;
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AudioTimingCapturePanel from "./AudioTimingCapturePanel";
import { APP_VERSION } from "./version";
import { latestViewedAt, pickHomeFeaturedVideo, preferredWatchState } from "./home-featured-selection";
import { editorialVideoTitle } from "./editorial-video-titles";
import { canonicalSpeakerForVideo, type CanonicalSpeakerProfile } from "./speaker-catalog";
import {activeSkipTarget,normalizeSkipRanges,SKIP_RANGES_UPDATED_EVENT,VIDEO_EDITOR_SAVED_EVENT,type SkipRange} from "./skip-ranges";
import {subtitleLines} from "./subtitle-display";
import {displaySubtitleTrack,legacySubtitleTrack,subtitleEventAt,type SubtitleTrack} from "./subtitle-track";
import SubtitleTranscript from "./SubtitleTranscript";
import {APP_LANGUAGE_EVENT,APP_LANGUAGE_KEY,getAppLanguage,setAppLanguage,tr,useAppLanguage,type AppLanguage} from "./app-language";
import {SESSION_ENDING_EVENT,SESSION_ENDED_KEY} from "./session-client";
import {
  ALIGNMENT_PROOF_CAPTIONS,
  ALIGNMENT_PROOF_QUERY_VALUE,
  ALIGNMENT_V81_PROOF_QUERY_VALUE,
  ALIGNMENT_PROOF_VIDEO_ID,
  isAlignmentProofRequest,
  isV81AlignmentProofRequest,
} from "./alignment-proof";

type Cue = { start: number; duration: number; text: string };
type SpeakerProfile = { name:string; role:string; importance:string; currentWork:string; highlights:string[] };
type Captions = { videoId: string; title: string; originalTitle?:string; channel: string; channelUrl?:string; originalVideoUrl?:string; cues: Cue[]; englishCues?:Cue[]; subtitleTrack?:SubtitleTrack; duration?: number; transcriptVersion?: number; keyPoints?: string[]; topics?: string[]; speaker?:SpeakerProfile };
type ProcessingTelemetry = { status?:string; progress?:number; stage?:string; cursor?:number; totalCues?:number; currentCue?:number; cueStart?:number|null; elapsedSeconds?:number; updatedAt?:string|null; retryAfter?:string|null; transientError?:string; keyPoints?:string[] };
type ManualImportProgress = { progress:number; label:string; detail:string; currentCue?:number; totalCues?:number };
type GuideItem = { time:number; title:string; summary:string; comment?:string };
type Category = "Medical" | "Tech" | "Podcasts" | "Comedy" | "Education" | "Documentaries" | "Other";
type TranslationMode = "legacy" | "google" | "professional" | "manual-pro";
type VideoTapZone = "backward" | "center" | "forward";
type Video = {
  id: string; url: string; title: string; originalTitle?:string; channel: string; category: Category;
  tags: string[]; notes: string; description: string; duration: number; addedAt: string;
  favorite: boolean; lastPosition: number; progress: number; lastWatched?: string; captions?: Cue[];
  speakerName?:string; speakerRole?:string; channelUrl?:string; originalVideoUrl?:string; views?:number; metadataVersion?:number; creatorChapters?:GuideItem[]; skipRanges?:SkipRange[];
  watchedSeconds?:number;
  translationMode?:TranslationMode;
  libraryVisible?:boolean;
};
type Moment = { id: string; videoId: string; time: number; note: string; tags: string[]; excerpt: string };
type Settings = {
  subtitleMode: "el" | "en" | "dual"; subtitleSize: number; subtitlePosition: "top" | "bottom";
  subtitleSizeVersion?: number;
  opacity: number; delay: number; subtitles: boolean; autoScroll: boolean; highlight: boolean;
  autoplay: boolean; speed: number; autoTranslate: boolean; autoCategory: boolean;
  layout: "grid" | "list"; compact: boolean; theme: "dark" | "light" | "system";
  descriptions: boolean; continueWatching: boolean;
  appLanguage?:AppLanguage;
};
type AppState = { videos: Video[]; moments: Moment[]; settings: Settings };
type Player = {
  destroy: () => void; getCurrentTime: () => number; getDuration: () => number;
  playVideo: () => void; pauseVideo: () => void; getPlayerState: () => number; seekTo: (seconds: number, allow: boolean) => void;
  setPlaybackRate: (rate: number) => void; getPlaybackRate: () => number; unloadModule: (module: string) => void;
  getOptions: () => string[];
  setVolume: (volume: number) => void; getVolume: () => number;
  mute: () => void; unMute: () => void; isMuted: () => boolean;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, options: Record<string, unknown>) => Player };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const CATEGORIES = ["all", "Medical", "Tech", "Podcasts", "Comedy", "Education", "Documentaries", "Other"] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  all: "Όλα", Medical: "Ιατρικά", Tech: "Τεχνολογία", Podcasts: "Συζητήσεις",
  Comedy: "Κωμωδία", Education: "Εκπαίδευση", Documentaries: "Ντοκιμαντέρ", Other: "Άλλα",
};
const DEFAULT_SETTINGS: Settings = {
  subtitleMode: "el", subtitleSize: 19, subtitleSizeVersion: 2, subtitlePosition: "bottom", opacity: .8, delay: 0,
  subtitles: true, autoScroll: true, highlight: true, autoplay: true, speed: 1,
  autoTranslate: true, autoCategory: true, layout: "grid", compact: true,
  theme: "dark", descriptions: true, continueWatching: true,
};
const PERSONAL_CACHE_KEY="greektube-personal-state:v1";
type SaveStateResult = { ok?: boolean; sharedSaved?: boolean; sharedVideoCount?: number; error?: string };
function personalStatePayload(state:AppState):AppState{
  return {...state,settings:{...state.settings,appLanguage:getAppLanguage()},videos:state.videos.map(video=>{
    const personalVideo={...video};
    delete personalVideo.captions;
    return personalVideo;
  })};
}
async function saveStateToServer(state:AppState,keepalive=false,requireShared=false):Promise<SaveStateResult|null> {
  const payload=JSON.stringify(personalStatePayload(state));
  try{localStorage.setItem(PERSONAL_CACHE_KEY,payload);}catch{}
  try{
    const response=await fetch("/api/state",{method:"PUT",credentials:"same-origin",cache:"no-store",keepalive,headers:{"Content-Type":"application/json","X-GreekTube-Shared-Write":requireShared?"1":"0"},body:payload});
    const result=await response.json().catch(()=>({})) as SaveStateResult;
    if(!response.ok)return {...result,ok:false};
    return result;
  }catch{return null;}
}
function mergeAppStates(base:AppState,incoming:AppState):AppState{
  const videos=new Map(base.videos.map(video=>[video.id,video]));
  incoming.videos.forEach(video=>videos.set(video.id,canonicalVideoMetadata(preferredWatchState(videos.get(video.id),{...(videos.get(video.id)||{}),...video}))));
  return {
    settings:normalizedSettings(incoming.settings||base.settings),
    moments:[...(incoming.moments||[]),...base.moments.filter(moment=>!(incoming.moments||[]).some(item=>item.id===moment.id))],
    videos:Array.from(videos.values()).sort((a,b)=>b.addedAt.localeCompare(a.addedAt)),
  };
}
function normalizedSettings(settings?:Partial<Settings>):Settings{
  const merged={...DEFAULT_SETTINGS,...settings,speed:normalizedPlaybackSpeed(settings?.speed)};
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

function speakerForVideo(id:string,channel:string):SpeakerProfile{
  return canonicalSpeakerForVideo(id,channel)||{
    name:tr("Ομιλητής προς επιβεβαίωση"),
    role:"",
    importance:tr("Η ταυτότητα του ομιλητή δεν έχει ακόμη επιβεβαιωθεί."),
    currentWork:"",
    highlights:[],
  };
}
const CURATED_VIDEO_METADATA:Partial<Record<string,Pick<Video,"title"|"description"|"category">>>={
  h2Pf6xO_NVM:{
    title:"Γλυκόζη, ζάχαρη και η βιοχημεία της ανάπτυξης του οργανισμού",
    description:"Η Jessie Inchauspé εξηγεί πώς η γλυκόζη και η ζάχαρη επηρεάζουν τον εγκέφαλο, τη ντοπαμίνη, τη διάθεση και τις λιγούρες. Συζητά τον ρόλο της διατροφής στη λειτουργία του οργανισμού και κατά την εγκυμοσύνη. Αναλύει πώς θρεπτικά συστατικά όπως η χολίνη συνδέονται με την ανάπτυξη του εγκεφάλου και του μωρού.",
    category:"Medical",
  },
};
function canonicalVideoMetadata(video:Video):Video{
  const metadata=CURATED_VIDEO_METADATA[video.id];
  const merged=metadata?{...video,...metadata}:video;
  return {...merged,title:editorialVideoTitle(merged.id,merged.title)};
}
const GREEK_TITLES:Record<string,string>={
  ATKu1Cxs2Pc:"Καρδιοχειρουργός: Ο μεγαλύτερος παράγοντας κινδύνου για καρδιακή νόσο",
  NqLpQhii_fU:"Αν θέλεις να μειώσεις τους υδατάνθρακες δες αυτό!",
  D7bBCcbAuYQ:"Η κρυφή αιτία του επίμονου λίπους",
  "fX2z-BF8Jac":"Ας γίνει η τροφή το φάρμακό σου",
  KkBy__7d9Fs:"Γιατί οι περισσότεροι άνθρωποι έχουν αντίσταση στην ινσουλίνη",
  "0_adZSC0sFI":"Ο πιο γρήγορος τρόπος αντιμετώπισης της ζύμωσης στο ανώτερο έντερο",
  D2RjneeG_xA:"Ο ευκολότερος τρόπος αντιστροφής μεταβολικών προβλημάτων",
};
function greekTitle(video:Video){return editorialVideoTitle(video.id,isGreekTitle(video.title)?video.title:GREEK_TITLES[video.id]||video.title);}
function appTitle(video:Video){return getAppLanguage()==="en"?(englishTitle(video)||greekTitle(video)):greekTitle(video);}
function isGreekTitle(value:string){const letters=value.match(/\p{L}/gu)?.length||0;const greek=value.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length||0;return letters>0&&greek/letters>.22;}
function mobileSummary(video:Video,captions:Captions){
  const description=video.description?.trim()||"";
  const normalizedDescription=description.toLocaleLowerCase("el-GR").normalize("NFD").replace(/\p{Diacritic}/gu,"");
  const placeholder=normalizedDescription.includes("μιλησαμε τελευταια φορα")||normalizedDescription.includes("νεο βιντεο στη βιβλιοθηκη");
  if(description.length>=40&&!placeholder)return description;
  const point=captions.keyPoints?.find(isGreekTitle)||captions.cues.find(cue=>isGreekTitle(cue.text))?.text;
  return point|| (isGreekTitle(video.description)?video.description:"Δες τα βασικά σημεία και τη μεταγραφή του βίντεο στα ελληνικά.");
}
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
function srtFilename(video:Video){
  const source=englishTitle(video)||video.title||video.id;
  const slug=source.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase().slice(0,60)||video.id;
  return `${slug}-english.srt`;
}
function fetchAndDownloadSrt(video:Video){
  return fetch(`/api/captions/export-srt?videoId=${encodeURIComponent(video.id)}`,{cache:"no-store"}).then(async response=>{
    if(!response.ok){const failure=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(failure?.error||"Δεν ήταν δυνατή η λήψη του αγγλικού transcript.");}
    const text=await response.text();
    try{sessionStorage.setItem(`manual-source-srt:${video.id}`,text);}catch{}
    const blob=new Blob([text],{type:"application/x-subrip;charset=utf-8"});
    const link=document.createElement("a");
    link.href=URL.createObjectURL(blob);
    link.download=srtFilename(video);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  });
}
function upperGreekLabel(value:string){
  return tr(value).toLocaleUpperCase("el-GR");
}
function playerVolumeFromUi(value:number){
  const normalized=Math.max(0,Math.min(100,value))/100;
  return Math.round(Math.pow(normalized,2.2)*100);
}
function SettingsGearIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.8 2h2.4l.5 2.2 1.7.7 1.9-1.2 1.7 1.7-1.2 1.9.7 1.7 2.2.5v2.4l-2.2.5-.7 1.7 1.2 1.9-1.7 1.7-1.9-1.2-1.7.7-.5 2.2h-2.4l-.5-2.2-1.7-.7-1.9 1.2-1.7-1.7 1.2-1.9-.7-1.7-2.2-.5V9.5l2.2-.5.7-1.7-1.2-1.9 1.7-1.7 1.9 1.2 1.7-.7z" transform="translate(0 1)"/><circle cx="12" cy="12" r="2.7"/></svg>}
function PlayIcon(){return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.4 5.55a1 1 0 011.52-.85l9.1 6.45a1.04 1.04 0 010 1.7l-9.1 6.45a1 1 0 01-1.52-.85V5.55z"/></svg>;}
function PauseIcon(){return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.8" y="5" width="3.7" height="14" rx="1.2"/><rect x="13.5" y="5" width="3.7" height="14" rx="1.2"/></svg>;}
function VolumeIcon({muted=false}:{muted?:boolean}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4z"/>{muted?<><path d="M16 9l5 5"/><path d="M21 9l-5 5"/></>:<><path d="M16.5 8.5a5 5 0 010 7"/><path d="M19 6a8 8 0 010 12"/></>}</svg>;}
function FullscreenExitIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3v4a2 2 0 01-2 2H3M15 3v4a2 2 0 002 2h4M9 21v-4a2 2 0 00-2-2H3M15 21v-4a2 2 0 012-2h4"/></svg>;}
function SearchIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4"/><path d="m15.5 15.5 4.3 4.3"/></svg>;}
async function copyText(text:string){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch{}
  try{
    const helper=document.createElement("textarea");
    helper.value=text;helper.setAttribute("readonly","");helper.style.position="fixed";helper.style.opacity="0";
    document.body.appendChild(helper);helper.select();
    const ok=document.execCommand("copy");
    helper.remove();
    return ok;
  }catch{return false;}
}
const PLAYBACK_SPEEDS=[0.5,0.75,1,1.25,1.5] as const;
function isAllowedShareSpeed(value:number):boolean{
  return Number.isFinite(value)&&PLAYBACK_SPEEDS.some(speed=>Math.abs(speed-value)<0.001);
}
function normalizedPlaybackSpeed(value:number|undefined):number{
  return typeof value==="number"&&isAllowedShareSpeed(value)?value:1;
}
function blocksPlayerShortcut(target:EventTarget|null):boolean{
  return target instanceof HTMLElement&&Boolean(target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="textbox"]'));
}
function buildMomentShareUrl(videoId:string,time:number,speed:number){
  const safeTime=Number.isFinite(time)&&time>=0?Math.floor(time):0;
  const safeSpeed=isAllowedShareSpeed(speed)?speed:1;
  return `${location.origin}/?video=${videoId}&t=${safeTime}&speed=${safeSpeed}`;
}
function searchText(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function cleanSpeakerRole(value?:string){
  const role=(value||"").trim();
  if(!role)return "";
  const normalized=searchText(role);
  const generic=normalized.includes("ομιλητης")&&(normalized.includes("δημιουργος")||normalized.includes("περιεχομενου"));
  return generic?"":role;
}
function searchHaystack(video:Video){
  return [
    greekTitle(video),
    englishTitle(video),
    video.title,
    video.originalTitle||"",
    video.channel,
    video.speakerName||"",
    video.speakerRole||"",
    video.tags.join(" "),
    video.description,
    video.notes,
  ].map(searchText).join(" ");
}
function searchScore(video:Video,terms:string[]){
  if(!terms.length)return 0;
  const titleText=searchText(`${appTitle(video)} ${englishTitle(video)} ${video.title} ${video.originalTitle||""}`);
  const speakerText=searchText(`${video.channel} ${video.speakerName||""} ${video.speakerRole||""}`);
  const tagText=searchText(video.tags.join(" "));
  return terms.reduce((score,term)=>score+(titleText.includes(term)?8:0)+(speakerText.includes(term)?4:0)+(tagText.includes(term)?3:0),0);
}

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
function activeIndex(cues:Cue[], time:number) { return subtitleEventAt(cues,time); }
function isCompleteGreekTranscript(data:Captions|null|undefined,duration=0) {
  if(!data?.cues?.length||data.transcriptVersion!==12)return false;
  const cues=data.cues;
  let latestStart=-Infinity;
  const ordered=cues.length>=3&&cues.every(cue=>{
    const valid=Number.isFinite(cue.start)&&Number.isFinite(cue.duration)&&cue.duration>0&&cue.text.trim().length>0;
    if(!valid||cue.start<latestStart-5)return false;
    latestStart=Math.max(latestStart,cue.start);
    return true;
  });
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
  {at:4,label:tr("Ανάγνωση στοιχείων βίντεο")},
  {at:12,label:tr("Εντοπισμός αρχικών υποτίτλων")},
  {at:28,label:tr("Μετάφραση υποτίτλων στα ελληνικά")},
  {at:88,label:tr("Έλεγχος συγχρονισμού και πληρότητας")},
];
function transcriptHighlights(cues:Cue[]) {
  if(!cues.length)return [];
  const step=Math.max(1,Math.floor(cues.length/10));
  return cues.filter((_,index)=>index%step===0).map(c=>c.text.replace(/\s+/g," ").trim()).filter((text,index,list)=>text.length>18&&list.indexOf(text)===index).slice(0,10);
}
const PREPARATION_STAGES_EL=[
  {at:4,label:tr("Ανάκτηση στοιχείων βίντεο")},
  {at:12,label:tr("Ανάκτηση αγγλικού transcript")},
  {at:28,label:tr("Δόμηση αγγλικού transcript")},
  {at:48,label:tr("Μετάφραση στα ελληνικά")},
  {at:84,label:tr("Συγχρονισμός με το αρχικό timing")},
  {at:92,label:tr("Έλεγχος πιστότητας και ακεραιότητας")},
  {at:96,label:tr("Ολοκλήρωση υποτίτλων")},
];
function cleanGuideText(text:string) {
  return text.replace(/\s+/g," ").replace(/\bhttps?:\/\/\S+/gi,"").replace(/^[\d\s:.)-]+/,"").trim();
}
const EDITORIAL_GUIDES:Record<string,GuideItem[]>={
  D2RjneeG_xA:[
    {time:26,title:"Πόσο γρήγορα πρέπει να γίνει η μετάβαση",summary:"Η ομιλήτρια εξηγεί ότι ο ρυθμός αλλαγής εξαρτάται από την κατάσταση του οργανισμού. Όσο πιο καταπονημένος ή άρρωστος είναι κάποιος τόσο πιο σταδιακή μπορεί να χρειάζεται να είναι η μετάβαση.",comment:"Βασικό πλαίσιο για όλο το υπόλοιπο βίντεο: δεν υπάρχει ένας ίδιος ρυθμός για όλους."},
    {time:70,title:"Γιατί κάποιοι δυσκολεύονται με μια διατροφή υψηλή σε λίπος",summary:"Η πέψη του λίπους απαιτεί σημαντική παραγωγή παγκρεατικών ενζύμων και επαρκή χολή. Σε ανθρώπους που βασίζονταν για χρόνια κυρίως σε υδατάνθρακες η προσαρμογή μπορεί να χρειάζεται χρόνο."},
    {time:121,title:"Πότε αρχίζουν να φαίνονται αλλαγές",summary:"Σύμφωνα με την ομιλήτρια με την είσοδο σε κέτωση ορισμένες αλλαγές μπορούν να εμφανιστούν μέσα σε ημέρες ή εβδομάδες όπως πιο σταθερά επίπεδα ενέργειας και καλύτερος ύπνος.",comment:"Εδώ περιγράφεται ο αναμενόμενος χρονικός ορίζοντας που δίνει η ίδια η ομιλήτρια."},
    {time:246,title:"Κρεατίνη και methylene blue",summary:"Η κρεατίνη παρουσιάζεται ως χρήσιμη για τη μυϊκή λειτουργία και τους μηχανισμούς παροχής ενέργειας. Για το methylene blue η ομιλήτρια αναφέρει ότι δεν θα το έβαζε ως πρώτο βήμα."},
    {time:293,title:"Το πρόβλημα με τα quick fixes",summary:"Το βασικό μήνυμα είναι ότι ένα μεμονωμένο supplement δεν αντικαθιστά τις βασικές αλλαγές. Η έμφαση μεταφέρεται στη συνέπεια και στην εφαρμογή των θεμελιωδών παρεμβάσεων.",comment:"Ένα από τα πιο καθαρά κεντρικά μηνύματα του αποσπάσματος."},
    {time:426,title:"Το απλούστερο πρωτόκολλο που προτείνει",summary:"Η συζήτηση καταλήγει σε ένα απλοποιημένο πλάνο με ketogenic diet, vitamin C, iodine, βασικά supplements, χρονικά περιορισμένη διατροφή και άσκηση."}
  ]
};
function conciseGuideTitle(text:string,index:number){
  const clean=cleanGuideText(text).replace(/^Σημείο συζήτησης:\s*/i,"");
  const sentence=clean.split(/[.!?]/)[0]?.trim()||clean;
  const short=sentence.length>74?`${sentence.slice(0,71).trim()}…`:sentence;
  return short||`Κύριο σημείο ${index+1}`;
}
function limitGuideItems(items:GuideItem[]) {
  const clean=items.filter(item=>Number.isFinite(item.time)&&item.time>=15&&cleanGuideText(item.title).length>=2).sort((a,b)=>a.time-b.time);
  if(clean.length<=5)return clean;
  const last=clean.length-1;
  const indexes=[0,Math.round(last*.25),Math.round(last*.5),Math.round(last*.75),last];
  return [...new Set(indexes)].map(index=>clean[index]).slice(0,5);
}
function videoGuide(_captions:Captions|null|undefined,videoId?:string,creatorChapters:GuideItem[]=[]):GuideItem[] {
  const creator=limitGuideItems(creatorChapters);
  if(creator.length)return creator;
  if(videoId&&EDITORIAL_GUIDES[videoId])return limitGuideItems(EDITORIAL_GUIDES[videoId]);
  return [];
}
function loadingGuide(points:string[]) {
  return points.map(cleanGuideText).filter(Boolean).slice(0,5);
}
const WATCHED_THRESHOLD=90;
const CONTINUE_MIN_SECONDS=30;
const CONTINUE_MIN_PROGRESS=2;
const INITIAL_LIBRARY_SIZE=5;
const LIBRARY_PAGE_SIZE=10;


export default function GreekTubePlayer() {
  useAppLanguage();
  const [state,setState]=useState<AppState>({videos:[],moments:[],settings:DEFAULT_SETTINGS});
  const [hydrated,setHydrated]=useState(false);
  const [libraryLoadFailed,setLibraryLoadFailed]=useState(false);
  const [view,setView]=useState<"library"|"settings">("library");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [captions,setCaptions]=useState<Captions|null>(null);
  const displayTrack=useMemo(()=>displaySubtitleTrack(captions?.cues||[],captions?.subtitleTrack),[captions]);
  const englishTrack=useMemo(()=>legacySubtitleTrack(captions?.englishCues||[]),[captions?.englishCues]);
  const [loading,setLoading]=useState(false);
  const [checkingReady,setCheckingReady]=useState(false);
  const [progress,setProgress]=useState(0);
  const [processingTelemetry,setProcessingTelemetry]=useState<ProcessingTelemetry|null>(null);
  const [loadingPoints,setLoadingPoints]=useState<string[]>([]);
  const [loadingDescription,setLoadingDescription]=useState("");
  const [transcriptOpen,setTranscriptOpen]=useState(false);
  const [error,setError]=useState("");
  const [active,setActive]=useState(-1);
  const [playhead,setPlayhead]=useState(0);
  const [controlsVisible,setControlsVisible]=useState(true);
  const [seekPreview,setSeekPreview]=useState<number|null>(null);
  const [visibleCount,setVisibleCount]=useState(INITIAL_LIBRARY_SIZE);
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState<(typeof CATEGORIES)[number]>("all");
  const [sort,setSort]=useState("recent");
  const [filter,setFilter]=useState<"all"|"new"|"favorites"|"recent"|"hidden">("all");
  const [speakerBioOpen,setSpeakerBioOpen]=useState(false);
  const closeSpeakerBio=useCallback(()=>setSpeakerBioOpen(false),[]);
  const [modal,setModal]=useState(false);
  const [addRequest,setAddRequest]=useState(false);
  const [syncRequest,setSyncRequest]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState("");
  const [editingVideo,setEditingVideo]=useState<Video|null>(null);
  const [editRequest,setEditRequest]=useState<Video|null>(null);
  const [proImportVideo,setProImportVideo]=useState<Video|null>(null);
  const [manualImportRequest,setManualImportRequest]=useState<Video|null>(null);
  const [translationChoiceVideo,setTranslationChoiceVideo]=useState<Video|null>(null);
  const [detailsCopyState,setDetailsCopyState]=useState<"idle"|"copied"|"error">("idle");
  const [detailsSrtDownloading,setDetailsSrtDownloading]=useState(false);
  const [detailsSrtError,setDetailsSrtError]=useState("");
  const [mobileMenu,setMobileMenu]=useState(false);
  const [momentModal,setMomentModal]=useState<{time:number;excerpt:string}|null>(null);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [isPseudoFullscreen,setIsPseudoFullscreen]=useState(false);
  const [isPlaying,setIsPlaying]=useState(false);
  const [playerReady,setPlayerReady]=useState(false);
  const [playerLoadFailed,setPlayerLoadFailed]=useState(false);
  const [volume,setVolumeState]=useState(100);
  const [isMuted,setIsMuted]=useState(false);
  const [volumeSliderOpen,setVolumeSliderOpen]=useState(false);
  const [showFsExit,setShowFsExit]=useState(true);
  const fsExitTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const playerReadyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const controlsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const videoTapTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastVideoTap=useRef(0);
  const lastVideoTapZone=useRef<VideoTapZone|null>(null);
  const volumeDragging=useRef(false);
  const keyboardSeekTarget=useRef<number|null>(null);
  const keyboardSeekTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const playerScrollPosition=useRef(0);
  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);
  const [guideOpen,setGuideOpen]=useState(false);
  const playerHost=useRef<HTMLDivElement>(null);
  const fullscreenHost=useRef<HTMLDivElement>(null);
  const player=useRef<Player|null>(null);
  const readyCaptionsCache=useRef(new Map<string,Promise<Captions|null>>());
  const playWhenReady=useRef(false);
  const pendingPlayerStart=useRef(0);
  const pendingShareSpeed=useRef<number|null>(null);
  const transcript=useRef<HTMLDivElement>(null);
  const saveTimer=useRef<number|undefined>(undefined);
  const sessionEnding=useRef(false);
  const stateRef=useRef(state);
  const activeRef=useRef(-1);
  const lastProgressSave=useRef(0);
  const lastSkipJump=useRef<{videoId:string;target:number;at:number}|null>(null);
  const lastTelemetryUpdatedAt=useRef<string|null>(null);
  const proofModeRef=useRef(false);
  const proofVersionRef=useRef<"v8"|"v81"|null>(null);
  const selected=state.videos.find(v=>v.id===selectedId)||null;
  useEffect(()=>{
    if(!selectedId||!isPlaying)return;
    let last=performance.now();
    const record=()=>{const now=performance.now(),seconds=Math.min(10,Math.max(0,(now-last)/1000));last=now;if(sessionEnding.current||!seconds)return;setState(current=>({...current,videos:current.videos.map(video=>video.id===selectedId?{...video,watchedSeconds:(video.watchedSeconds||0)+seconds}:video)}))};
    const timer=window.setInterval(record,5000);return()=>{clearInterval(timer);record()};
  },[selectedId,isPlaying]);

  function getReadyCaptions(video:Video){
    const existing=readyCaptionsCache.current.get(video.id);
    if(existing)return existing;
    const request=fetch(`/api/captions?videoId=${encodeURIComponent(video.id)}`,{cache:"no-store"})
      .then(async response=>{
        if(!response.ok)return null;
        const ready=await response.json() as Captions;
        return isCompleteGreekTranscript(ready,video.duration)?ready:null;
      })
      .catch(()=>null);
    readyCaptionsCache.current.set(video.id,request);
    void request.then(result=>{if(!result)readyCaptionsCache.current.delete(video.id);});
    return request;
  }

  useEffect(()=>{
    // Warm the YouTube API while the user is still browsing the library so the
    // first playback does not pay the script-download cost after the click.
    for(const href of ["https://www.youtube.com","https://i.ytimg.com"]){
      if(document.head.querySelector(`link[rel="preconnect"][href="${href}"]`))continue;
      const link=document.createElement("link");
      link.rel="preconnect";link.href=href;link.crossOrigin="anonymous";
      document.head.appendChild(link);
    }
    if(window.YT?.Player||document.querySelector('script[src="https://www.youtube.com/iframe_api"]'))return;
    const script=document.createElement("script");
    script.src="https://www.youtube.com/iframe_api";script.async=true;
    document.head.appendChild(script);
  },[]);
  useEffect(()=>()=>{
    if(videoTapTimer.current)clearTimeout(videoTapTimer.current);
  },[]);

  useEffect(()=>{
    if(proofModeRef.current)return;
    if(!selectedId||!captions||state.settings.subtitleMode==="el"||captions.englishCues?.length)return;
    let active=true;
    void fetch(`/api/captions?videoId=${encodeURIComponent(selectedId)}&includeEnglish=1`,{cache:"no-store"})
      .then(async response=>{
        if(!response.ok)return;
        const enriched=await response.json() as Captions;
        if(!active||!isCompleteGreekTranscript(enriched)||!enriched.englishCues?.length)return;
        setCaptions(current=>current?.videoId===selectedId?{...current,englishCues:enriched.englishCues}:current);
      })
      .catch(()=>undefined);
    return()=>{active=false;};
  },[selectedId,captions,state.settings.subtitleMode]);

  useEffect(()=>{ void (async()=>{
    if(isAlignmentProofRequest(location.search)){
      proofModeRef.current=true;
      proofVersionRef.current=isV81AlignmentProofRequest(location.search)?"v81":"v8";
      setHydrated(true);
      return;
    }
    let fallback:AppState|null=null;
    try{const raw=localStorage.getItem(PERSONAL_CACHE_KEY);if(raw)fallback=JSON.parse(raw) as AppState;}catch{}
    if(fallback?.videos){
      const fallbackState={settings:normalizedSettings(fallback.settings),videos:fallback.videos,moments:fallback.moments||[]};
      setState(current=>mergeAppStates(current,fallbackState));
    }
    try{
      const r=await fetch("/api/state",{credentials:"same-origin",cache:"no-store"});
      if(r.ok){
        const j=await r.json();
        if(j.state?.videos)setState(current=>mergeAppStates(current,{settings:normalizedSettings(j.state.settings),videos:j.state.videos,moments:j.state.moments||[]}));
      }else if(!fallback?.videos?.length){setLibraryLoadFailed(true);}
    }catch{
      if(!fallback?.videos?.length)setLibraryLoadFailed(true);
    }finally{setHydrated(true);}
  })(); },[]);
  useEffect(()=>{
    stateRef.current=state;
    if(!hydrated||proofModeRef.current||sessionEnding.current)return;
    const payload=JSON.stringify(personalStatePayload(state));
    try{localStorage.setItem(PERSONAL_CACHE_KEY,payload);}catch{}
    window.clearTimeout(saveTimer.current);
    saveTimer.current=window.setTimeout(()=>{
      void fetch("/api/state",{method:"PUT",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:payload}).catch(()=>undefined);
    },1200);
    return()=>window.clearTimeout(saveTimer.current);
  },[state,hydrated]);
  useEffect(()=>{
    const syncSkipRanges=(event:Event)=>{
      const detail=(event as CustomEvent<{videoId?:unknown;skipRanges?:unknown;metadataVersion?:unknown}>).detail;
      if(!detail||typeof detail.videoId!=="string"||!detail.videoId)return;
      const skipRanges=normalizeSkipRanges(detail.skipRanges);
      const metadataVersion=Number(detail.metadataVersion||0);
      setState(current=>({...current,videos:current.videos.map(video=>video.id===detail.videoId?{...video,skipRanges,metadataVersion:Number.isFinite(metadataVersion)?Math.max(Number(video.metadataVersion||0),metadataVersion):video.metadataVersion}:video)}));
    };
    const syncEditorSavedVideo=(event:Event)=>{
      const detail=(event as CustomEvent<{video?:Partial<Video>&{id?:unknown}}>).detail;
      const saved=detail?.video;
      if(!saved||typeof saved.id!=="string"||!saved.id)return;
      setState(current=>({...current,videos:current.videos.map(video=>{
        if(video.id!==saved.id)return video;
        const metadataVersion=Number(saved.metadataVersion||0);
        return {
          ...video,
          title:typeof saved.title==="string"?saved.title:video.title,
          originalTitle:typeof saved.originalTitle==="string"?saved.originalTitle:video.originalTitle,
          speakerName:typeof saved.speakerName==="string"?saved.speakerName:video.speakerName,
          speakerRole:typeof saved.speakerRole==="string"?saved.speakerRole:video.speakerRole,
          channel:typeof saved.channel==="string"?saved.channel:video.channel,
          channelUrl:typeof saved.channelUrl==="string"?saved.channelUrl:video.channelUrl,
          originalVideoUrl:typeof saved.originalVideoUrl==="string"?saved.originalVideoUrl:video.originalVideoUrl,
          category:typeof saved.category==="string"?saved.category as Category:video.category,
          tags:Array.isArray(saved.tags)?saved.tags.filter((tag):tag is string=>typeof tag==="string"):video.tags,
          description:typeof saved.description==="string"?saved.description:video.description,
          skipRanges:normalizeSkipRanges(saved.skipRanges),
          libraryVisible:typeof saved.libraryVisible==="boolean"?saved.libraryVisible:video.libraryVisible,
          metadataVersion:Number.isFinite(metadataVersion)?Math.max(Number(video.metadataVersion||0),metadataVersion):video.metadataVersion,
        };
      })}));
    };
    window.addEventListener(SKIP_RANGES_UPDATED_EVENT,syncSkipRanges);
    window.addEventListener(VIDEO_EDITOR_SAVED_EVENT,syncEditorSavedVideo);
    return()=>{
      window.removeEventListener(SKIP_RANGES_UPDATED_EVENT,syncSkipRanges);
      window.removeEventListener(VIDEO_EDITOR_SAVED_EVENT,syncEditorSavedVideo);
    };
  },[]);
  useEffect(()=>{
    if(!hydrated||proofModeRef.current)return;
    const saveBeforeLeaving=()=>{
      if(!sessionEnding.current)void saveStateToServer(stateRef.current,true);
    };
    window.addEventListener("pagehide",saveBeforeLeaving);
    return()=>window.removeEventListener("pagehide",saveBeforeLeaving);
  },[hydrated]);
  useEffect(()=>{
    const stop=()=>{sessionEnding.current=true;window.clearTimeout(saveTimer.current)};
    const resume=()=>{sessionEnding.current=false};
    const storage=(event:StorageEvent)=>{if(event.key===SESSION_ENDED_KEY){stop();localStorage.removeItem(PERSONAL_CACHE_KEY);location.reload()}};
    window.addEventListener(SESSION_ENDING_EVENT,stop);window.addEventListener("greektube:session-resume",resume);window.addEventListener("storage",storage);
    return()=>{window.removeEventListener(SESSION_ENDING_EVENT,stop);window.removeEventListener("greektube:session-resume",resume);window.removeEventListener("storage",storage)};
  },[]);
  useEffect(()=>{
    const update=(event:Event)=>{const language=(event as CustomEvent).detail;if(language==="el"||language==="en")setState(current=>({...current,settings:{...current.settings,appLanguage:language}}))};
    window.addEventListener(APP_LANGUAGE_EVENT,update);return()=>window.removeEventListener(APP_LANGUAGE_EVENT,update);
  },[]);
  useEffect(()=>{if(hydrated&&!localStorage.getItem(APP_LANGUAGE_KEY)&&state.settings.appLanguage)setAppLanguage(state.settings.appLanguage)},[hydrated,state.settings.appLanguage]);
  useEffect(()=>{
    const refresh=(event:Event)=>{if((event as CustomEvent).detail?.videoId!==selectedId)return;void fetch(`/api/captions?videoId=${selectedId}&includeEnglish=1`,{cache:"no-store"}).then(response=>response.ok?response.json():null).then(data=>{if(data?.cues)setCaptions(data)}).catch(()=>undefined)};
    window.addEventListener("greektube:subtitle-track-updated",refresh);return()=>window.removeEventListener("greektube:subtitle-track-updated",refresh);
  },[selectedId]);
  useEffect(()=>{
    const add=()=>{void requestAdd()};window.addEventListener("greektube:add-video",add);
    if(hydrated&&new URLSearchParams(location.search).get("action")==="add"){const url=new URL(location.href);url.searchParams.delete("action");history.replaceState(history.state,"",url);add()}
    return()=>window.removeEventListener("greektube:add-video",add);
  },[hydrated]);
  useEffect(()=>{
    if(!hydrated||proofModeRef.current)return;
    const missing=state.videos.filter(video=>video.metadataVersion!==6);
    if(!missing.length)return;
    let cancelled=false;
    void Promise.all(missing.map(async video=>{
      try{
        const response=await fetch("/api/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url})});
        if(!response.ok)return null;
        const metadata=await response.json() as {id?:string;title?:string;originalTitle?:string;channel?:string;channelUrl?:string;originalVideoUrl?:string;duration?:number;description?:string;speakerName?:string;speakerRole?:string;category?:Category;tags?:string[];creatorChapters?:GuideItem[]};
        return metadata.id?metadata:null;
      }catch{return null;}
    })).then(results=>{
      if(cancelled)return;
      const metadataById=new Map(results.filter(Boolean).map(result=>[result!.id!,result!]));
      if(!metadataById.size)return;
      setState(current=>({...current,videos:current.videos.map(video=>{
        const metadata=metadataById.get(video.id);
        if(!metadata)return video;
        return {...video,title:isGreekTitle(metadata.title||"")?metadata.title!:video.title,originalTitle:metadata.originalTitle||video.originalTitle,channel:metadata.channel||video.channel,channelUrl:metadata.channelUrl||video.channelUrl,originalVideoUrl:metadata.originalVideoUrl||video.originalVideoUrl||video.url,duration:metadata.duration||video.duration,description:metadata.description||video.description,speakerName:metadata.speakerName||video.speakerName,speakerRole:metadata.speakerRole||video.speakerRole,category:metadata.category||video.category,tags:metadata.tags?.length?Array.from(new Set([...video.tags,...metadata.tags])):video.tags,creatorChapters:metadata.creatorChapters?.length?metadata.creatorChapters:video.creatorChapters,metadataVersion:6};
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
    const body=document.body;
    const root=document.documentElement;
    const scrollX=window.scrollX;
    const scrollY=window.scrollY;
    const previous={
      bodyOverflow:body.style.overflow,
      bodyPosition:body.style.position,
      bodyTop:body.style.top,
      bodyLeft:body.style.left,
      bodyWidth:body.style.width,
      rootOverflow:root.style.overflow,
      rootOverscroll:root.style.overscrollBehavior,
    };
    root.style.overflow="hidden";
    root.style.overscrollBehavior="none";
    body.style.overflow="hidden";
    body.style.position="fixed";
    body.style.top=`-${scrollY}px`;
    body.style.left=`-${scrollX}px`;
    body.style.width="100%";
    return()=>{
      root.style.overflow=previous.rootOverflow;
      root.style.overscrollBehavior=previous.rootOverscroll;
      body.style.overflow=previous.bodyOverflow;
      body.style.position=previous.bodyPosition;
      body.style.top=previous.bodyTop;
      body.style.left=previous.bodyLeft;
      body.style.width=previous.bodyWidth;
      window.scrollTo(scrollX,scrollY);
    };
  },[isPseudoFullscreen]);
  useEffect(()=>{
    if(isPseudoFullscreen)return;
    // Refresh iOS Safari hit-testing after the fixed pseudo-fullscreen layer
    // and body scroll lock are removed in the same render cycle.
    const host=fullscreenHost.current;
    if(!host)return;
    void host.offsetHeight;
    const raf=window.requestAnimationFrame(()=>{void host.offsetHeight;});
    return()=>window.cancelAnimationFrame(raf);
  },[isPseudoFullscreen]);
  useEffect(()=>{
    if(view!=="settings")return;
    const body=document.body;
    const previousOverflow=body.style.overflow;
    const previousPaddingRight=body.style.paddingRight;
    const scrollbarGap=Math.max(0,window.innerWidth-document.documentElement.clientWidth);
    if(scrollbarGap>0)body.style.paddingRight=`${scrollbarGap}px`;
    body.style.overflow="hidden";
    return()=>{
      body.style.overflow=previousOverflow;
      body.style.paddingRight=previousPaddingRight;
      window.requestAnimationFrame(()=>window.scrollTo(0,playerScrollPosition.current));
    };
  },[view]);
  useEffect(()=>{
    const syncQuickTheme=(event:Event)=>{
      const next=(event as CustomEvent<{theme?:Settings["theme"]}>).detail?.theme;
      if(next!=="dark"&&next!=="light"&&next!=="system")return;
      setState(current=>current.settings.theme===next?current:{...current,settings:{...current.settings,theme:next}});
    };
    window.addEventListener("gts:themechange",syncQuickTheme as EventListener);
    return()=>window.removeEventListener("gts:themechange",syncQuickTheme as EventListener);
  },[]);
  useEffect(()=>{
    if(!isFullscreen&&!isPseudoFullscreen){
      if(fsExitTimer.current)clearTimeout(fsExitTimer.current);
      const reveal=window.setTimeout(()=>setShowFsExit(true),0);
      return()=>window.clearTimeout(reveal);
    }
    if(isPlaying){
      fsExitTimer.current=setTimeout(()=>setShowFsExit(false),2200);
    }else{
      if(fsExitTimer.current)clearTimeout(fsExitTimer.current);
      fsExitTimer.current=setTimeout(()=>setShowFsExit(true),0);
    }
    return()=>{if(fsExitTimer.current)clearTimeout(fsExitTimer.current);};
  },[isFullscreen,isPseudoFullscreen,isPlaying]);
  useEffect(()=>{
    if(controlsTimer.current)clearTimeout(controlsTimer.current);
    const reveal=window.setTimeout(()=>setControlsVisible(true),0);
    if(!isPlaying)return()=>window.clearTimeout(reveal);
    controlsTimer.current=setTimeout(()=>setControlsVisible(false),3600);
    return()=>{window.clearTimeout(reveal);if(controlsTimer.current)clearTimeout(controlsTimer.current);};
  },[isPlaying,selectedId]);
  useEffect(()=>{
    if(!mobileMenu&&!subtitleMenuOpen&&!volumeSliderOpen)return;
    const closeFloating=(event:PointerEvent)=>{
      const target=event.target as Element|null;
      if(!target)return;
      if(mobileMenu&&!target.closest(".mobile-menu")&&!target.closest(".mobile-menu-toggle"))setMobileMenu(false);
      if(subtitleMenuOpen&&!target.closest(".subtitle-cc-control")&&!target.closest(".gts31-subtitles"))setSubtitleMenuOpen(false);
      if(volumeSliderOpen&&!target.closest(".gts31-volume"))setVolumeSliderOpen(false);
    };
    const closeOnEscape=(event:KeyboardEvent)=>{
      if(event.key!=="Escape")return;
      setMobileMenu(false);
      setSubtitleMenuOpen(false);
      setVolumeSliderOpen(false);
    };
    document.addEventListener("pointerdown",closeFloating);
    document.addEventListener("keydown",closeOnEscape);
    return()=>{
      document.removeEventListener("pointerdown",closeFloating);
      document.removeEventListener("keydown",closeOnEscape);
    };
  },[mobileMenu,subtitleMenuOpen,volumeSliderOpen]);

  const libraryVideos=useMemo(()=>state.videos.filter(video=>video.libraryVisible!==false),[state.videos]);
  const newVideoIds=useMemo(()=>new Set([...libraryVideos].sort((a,b)=>b.addedAt.localeCompare(a.addedAt)).slice(0,10).map(video=>video.id)),[libraryVideos]);
  const filtered=useMemo(()=> {
    const terms=searchText(search).split(/\s+/).filter(Boolean);
    let list=(filter==="hidden"?state.videos.filter(video=>video.libraryVisible===false):libraryVideos).filter(v=>(category==="all"||v.category===category)&&terms.every(term=>searchHaystack(v).includes(term)));
    if(filter==="new") list=list.filter(v=>newVideoIds.has(v.id));
    if(filter==="favorites") list=list.filter(v=>v.favorite);
    if(filter==="recent") list=list.filter(v=>v.lastWatched);
    return [...list].sort((a,b)=>{
      if(terms.length){
        const score=searchScore(b,terms)-searchScore(a,terms);
        if(score!==0)return score;
      }
      if(filter==="recent")return (b.lastWatched||"").localeCompare(a.lastWatched||"")||b.addedAt.localeCompare(a.addedAt);
      return sort==="title"?greekTitle(a).localeCompare(greekTitle(b),"el"):sort==="progress"?b.progress-a.progress:b.addedAt.localeCompare(a.addedAt);
    });
  },[state.videos,libraryVideos,category,search,sort,filter,newVideoIds]);
  const visibleVideos=filtered.slice(0,visibleCount);
  const continueVideos=libraryVideos.filter(v=>v.lastPosition>=CONTINUE_MIN_SECONDS&&v.progress>=CONTINUE_MIN_PROGRESS&&v.progress<WATCHED_THRESHOLD).sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||"")).slice(0,5);
  const featured=useMemo(()=>hydrated?pickHomeFeaturedVideo(libraryVideos):null,[hydrated,libraryVideos]);
  const featuredHasHistory=Boolean(featured&&Number.isFinite(latestViewedAt(featured)));
  const featuredResumeTime=featured&&featuredHasHistory&&featured.lastPosition>=CONTINUE_MIN_SECONDS&&featured.progress<WATCHED_THRESHOLD?featured.lastPosition:0;
  const featuredMoments=featured?state.moments.filter(m=>m.videoId===featured.id):[];
  // Avoid prefetching a full transcript on home load. Captions load on demand.
  useEffect(()=>{const reset=window.setTimeout(()=>setVisibleCount(INITIAL_LIBRARY_SIZE),0);return()=>window.clearTimeout(reset);},[search,category,sort,filter]);

  function patchVideo(id:string,patch:Partial<Video>){setState(s=>({...s,videos:s.videos.map(v=>v.id===id?{...v,...patch}:v)}));}
  function patchSettings(patch:Partial<Settings>){
    setState(current=>({...current,settings:{...current.settings,...patch}}));
    if(typeof patch.speed==="number")currentPlayer()?.setPlaybackRate(patch.speed);
  }
  async function requestEdit(video:Video){
    try{
      const response=await fetch("/api/admin-auth",{cache:"no-store"});
      const result=await response.json() as {authorized?:boolean};
      if(response.ok&&result.authorized){setEditingVideo(video);return;}
    }catch{}
    setEditRequest(video);
  }
  async function requestAdd(){
    try{
      const response=await fetch("/api/admin-auth",{cache:"no-store"});
      const result=await response.json() as {authorized?:boolean};
      if(response.ok&&result.authorized){setModal(true);return;}
    }catch{}
    setAddRequest(true);
  }
  async function requestManualImport(video:Video){
    try{
      const response=await fetch("/api/admin-auth",{cache:"no-store"});
      const result=await response.json() as {authorized?:boolean};
      if(response.ok&&result.authorized){setTranslationChoiceVideo(null);setProImportVideo(video);return;}
    }catch{}
    setTranslationChoiceVideo(null);
    setManualImportRequest(video);
  }
  async function syncLocalTranscripts(videos:Video[]){
    let synced=0;
    for(const video of videos){
      try{
        const raw=localStorage.getItem(`greektube-transcript:${video.id}:v12`);
        if(!raw)continue;
        const cached=JSON.parse(raw) as Captions;
        if(!isCompleteGreekTranscript(cached,video.duration))continue;
        const response=await fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url,cachedTranscript:cached})});
        if(response.ok)synced+=1;
      }catch{}
    }
    return synced;
  }
  async function syncLibraryToServer(){
    if(syncing)return;
    setSyncing(true);setSyncMessage(tr("Συγχρονισμός σε εξέλιξη…"));
    try{
      await new Promise(resolve=>window.setTimeout(resolve,350));
      const result=await saveStateToServer(stateRef.current,false,true);
      if(!result?.ok||!result.sharedSaved)throw new Error(result?.error||"sync-denied");
      const transcriptCount=await syncLocalTranscripts(stateRef.current.videos);
      setSyncMessage(`Συγχρονίστηκαν ${result.sharedVideoCount||stateRef.current.videos.length} βίντεο και ${transcriptCount} μεταγραφές.`);
    }catch{
      setSyncMessage(tr("Ο συγχρονισμός χρειάζεται ξανά τον κωδικό."));
      setSyncRequest(true);
    }finally{setSyncing(false);}
  }
  async function requestSync(){
    try{
      const response=await fetch("/api/admin-auth",{cache:"no-store"});
      const result=await response.json() as {authorized?:boolean};
      if(response.ok&&result.authorized){await syncLibraryToServer();return;}
    }catch{}
    setSyncRequest(true);
  }
  function applyProcessingTelemetry(next:ProcessingTelemetry){
    const updatedAt=typeof next.updatedAt==="string"?next.updatedAt:null;
    if(updatedAt&&lastTelemetryUpdatedAt.current&&updatedAt<lastTelemetryUpdatedAt.current)return;
    if(updatedAt)lastTelemetryUpdatedAt.current=updatedAt;
    const reportedProgress=next.progress;
    if(typeof reportedProgress==="number")setProgress(Math.max(0,Math.min(100,reportedProgress)));
    setProcessingTelemetry(next);
  }
  async function openVideo(video:Video,start?:number,showTranscript=false,forceTranslation=false,readyCaptions?:Captions){
    window.scrollTo(0,0);
    window.requestAnimationFrame(()=>window.scrollTo(0,0));
    const proofMode=proofModeRef.current&&video.id===ALIGNMENT_PROOF_VIDEO_ID;
    const translationMode:TranslationMode=video.translationMode||"legacy";
    const knownPoints=transcriptHighlights(video.captions||[]);
    patchVideo(video.id,{views:(video.views||0)+1,lastWatched:new Date().toISOString()});
    player.current?.pauseVideo();setPlayerReady(false);setPlayerLoadFailed(false);setIsPlaying(false);setPlayhead(0);setActive(-1);
    pendingPlayerStart.current=start??video.lastPosition;
    setSelectedId(video.id); setView("library"); setSpeakerBioOpen(false); setError(""); setLoadingDescription(video.description||tr("Ετοιμάζουμε την ελληνική περιγραφή του βίντεο.")); setLoadingPoints(knownPoints); setTranscriptOpen(showTranscript); setProcessingTelemetry(null); lastTelemetryUpdatedAt.current=null;
    const proofQuery=proofVersionRef.current==="v81"?ALIGNMENT_V81_PROOF_QUERY_VALUE:ALIGNMENT_PROOF_QUERY_VALUE;
    history.replaceState(null,"",`/?video=${video.id}${proofMode?`&proof=${proofQuery}`:""}${start?`&t=${Math.floor(start)}`:""}`);
    if(proofMode){
      if(proofVersionRef.current==="v81"){
        setLoading(true);setCheckingReady(false);setCaptions(null);
        try{
          const response=await fetch(`/api/audio-timing?video=${video.id}&include=artifact`,{cache:"no-store",credentials:"same-origin"});
          const result=await response.json() as {artifact?:{durationMs?:number;proofReady?:boolean;proofAlignment?:{units?:Array<{start_ms:number;end_ms:number;rendered_text?:string;greek_text:string}>}};error?:string};
          const units=result.artifact?.proofAlignment?.units||[];
          if(!response.ok||!result.artifact?.proofReady||!units.length)throw new Error(result.error||"Το πραγματικό v8.1 proof δεν είναι ακόμη έτοιμο.");
          const proofCaptions={...ALIGNMENT_PROOF_CAPTIONS,duration:(result.artifact.durationMs||565560)/1000,cues:units.map(unit=>({start:unit.start_ms/1000,duration:Math.max(.001,(unit.end_ms-unit.start_ms)/1000),text:unit.rendered_text||unit.greek_text}))} as Captions;
          setProgress(100);setCaptions(proofCaptions);setLoading(false);
          patchVideo(video.id,{duration:proofCaptions.duration,lastWatched:new Date().toISOString()});
        }catch(problem){
          setLoading(false);setError(problem instanceof Error?problem.message:"Το πραγματικό v8.1 proof δεν είναι ακόμη έτοιμο.");
        }
        return;
      }
      const proofCaptions=ALIGNMENT_PROOF_CAPTIONS as Captions;
      setProgress(100);setCaptions(proofCaptions);setLoading(false);setCheckingReady(false);
      patchVideo(video.id,{duration:proofCaptions.duration,lastWatched:new Date().toISOString()});
      return;
    }
    setCheckingReady(!readyCaptions&&!forceTranslation);
    if(readyCaptions){
      localStorage.setItem(`greektube-transcript:${video.id}:v12`,JSON.stringify(readyCaptions));
      setProgress(100);setCaptions(readyCaptions);setLoading(false);setCheckingReady(false);
      patchVideo(video.id,{title:isGreekTitle(video.title)?video.title:readyCaptions.title,originalTitle:video.originalTitle||readyCaptions.originalTitle||englishTitle(video),channel:video.channel||readyCaptions.channel,captions:readyCaptions.cues,speakerName:video.speakerName||readyCaptions.speaker?.name,speakerRole:video.speakerRole||readyCaptions.speaker?.role,lastWatched:new Date().toISOString()});
      return;
    }
    // The shared transcript is authoritative. Browser storage is only an offline fallback.
    if(!forceTranslation){
      try{
        const ready=await getReadyCaptions(video);
        if(ready){
          localStorage.setItem(`greektube-transcript:${video.id}:v12`,JSON.stringify(ready));
          setProgress(100);setCaptions(ready);setLoading(false);setCheckingReady(false);
          patchVideo(video.id,{title:isGreekTitle(video.title)?video.title:ready.title,originalTitle:video.originalTitle||ready.originalTitle||englishTitle(video),channel:video.channel||ready.channel,captions:ready.cues,speakerName:video.speakerName||ready.speaker?.name,speakerRole:video.speakerRole||ready.speaker?.role,lastWatched:new Date().toISOString()});
          return;
        }
      }catch{}
    }
    const localRecord=localStorage.getItem(`greektube-transcript:${video.id}:v12`);
    if(localRecord&&!forceTranslation){
      try{
        const cached=JSON.parse(localRecord) as Captions;
        if(isCompleteGreekTranscript(cached,video.duration)){
          setProgress(100);setCaptions(cached);setLoading(false);setCheckingReady(false);
          patchVideo(video.id,{title:isGreekTitle(video.title)?video.title:cached.title,originalTitle:video.originalTitle||cached.originalTitle||englishTitle(video),channel:video.channel||cached.channel,captions:cached.cues,speakerName:video.speakerName||cached.speaker?.name,speakerRole:video.speakerRole||cached.speaker?.role,lastWatched:new Date().toISOString()});
          void fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url,cachedTranscript:cached})}).then(async response=>{
            if(!response.ok)return;
            const refreshed=await response.json() as Captions;
            if(!isCompleteGreekTranscript(refreshed,video.duration))return;
            localStorage.setItem(`greektube-transcript:${video.id}:v12`,JSON.stringify(refreshed));
            setCaptions(refreshed);
          }).catch(()=>undefined);
          return;
        }
      }catch{}
    }
    if(!forceTranslation){
      // Opening a video with no ready Greek transcript must never silently start translation
      // or auto-open the translation-workflow modal. Show the video-details screen instead and
      // let the user explicitly choose a translation method from there.
      setCheckingReady(false);setLoading(false);setProgress(0);setCaptions(null);return;
    }
    setCheckingReady(false); setLoading(false); setProgress(3); setCaptions(null);
    const loadingDelay=window.setTimeout(()=>setLoading(true),350);
    let stopStatusPolling=false;
    const statusPolling=(async()=>{
      while(!stopStatusPolling){
        await new Promise(resolve=>window.setTimeout(resolve,900));
        if(stopStatusPolling)break;
        try{
          const statusResponse=await fetch(`/api/captions?videoId=${encodeURIComponent(video.id)}`,{cache:"no-store"});
          if(statusResponse.status!==202)continue;
          const statusData=await statusResponse.json() as ProcessingTelemetry;
          applyProcessingTelemetry(statusData);
          if(Array.isArray(statusData.keyPoints)&&statusData.keyPoints.length)setLoadingPoints(statusData.keyPoints);
        }catch{}
      }
    })();
    try{
      let data:Captions;
      {
        let response:Response|null=null;
        let sharedData:Captions|null=null;
        let transientFailures=0;
        let failureMessage="";
        for(let attempt=0;;attempt++){
          const controller=new AbortController();
          const timeout=window.setTimeout(()=>controller.abort(),300000);
          try{
            response=await fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url,force:forceTranslation&&attempt===0,translationMode}),signal:controller.signal});
          }catch{
            response=null;
          }finally{
            window.clearTimeout(timeout);
          }
          if(response?.status===202){
            setLoading(true);
            const processing=await response.json();
            applyProcessingTelemetry(processing as ProcessingTelemetry);
            if(Array.isArray(processing.keyPoints)&&processing.keyPoints.length)setLoadingPoints(processing.keyPoints);
            const retryAfter=Math.max(1,Number(response.headers.get("Retry-After"))||1);
            await new Promise(resolve=>window.setTimeout(resolve,retryAfter*1000));
            continue;
          }
          if(response?.ok){sharedData=await response.json();break;}
          if(response){
            try{
              const failure=await response.json() as {error?:string};
              failureMessage=failure.error||`HTTP ${response.status}`;
            }catch{
              failureMessage=`HTTP ${response.status}`;
            }
          }
          if(!response||response.status===429||response.status>=500){
            transientFailures+=1;
            if(transientFailures<20){
              const delay=Math.min(30000,1000*Math.pow(2,Math.min(5,transientFailures-1)));
              await new Promise(resolve=>window.setTimeout(resolve,delay));
              continue;
            }
            throw new Error(failureMessage||"shared-storage");
          }
          break;
        }
        if(!sharedData||!isCompleteGreekTranscript(sharedData,video.duration))throw new Error(failureMessage||"incomplete-transcript");
        data=sharedData;
        localStorage.setItem(`greektube-transcript:${video.id}:v12`,JSON.stringify(sharedData));
        patchVideo(video.id,{title:isGreekTitle(video.title)?video.title:sharedData.title,originalTitle:video.originalTitle||sharedData.originalTitle||englishTitle(video),channel:video.channel||sharedData.channel,captions:sharedData.cues,speakerName:video.speakerName||sharedData.speaker?.name,speakerRole:video.speakerRole||sharedData.speaker?.role});
      }
      const points=data.keyPoints?.length?data.keyPoints:transcriptHighlights(data.cues);
      if(points.length){setLoadingPoints(points);setProgress(100);await new Promise(resolve=>window.setTimeout(resolve,750));}
      setProgress(100); setCaptions(data); setLoading(false); patchVideo(video.id,{lastWatched:new Date().toISOString()});
    }catch(error){
      console.error("Caption preparation failed",error);
      const local=localStorage.getItem(`greektube-transcript:${video.id}:v12`);
      if(local){
        try{
          const fallback=JSON.parse(local) as Captions;
          if(isCompleteGreekTranscript(fallback,video.duration)){
            setCaptions(fallback);setLoading(false);patchVideo(video.id,{lastWatched:new Date().toISOString()});
            window.setTimeout(()=>{void fetch("/api/captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url,cachedTranscript:fallback})}).catch(()=>undefined)},10000);
          return;
        }
      }catch{}
    }

      player.current?.destroy();player.current=null;
      setCaptions(null);setLoading(false);setProgress(0);
      setError("Το video δεν θα ανοίξει μέχρι να είναι έτοιμοι και ελεγμένοι οι πλήρεις ελληνικοί υπότιτλοι. Δοκίμασε ξανά σε λίγο.");
    }finally{
      stopStatusPolling=true;
      window.clearTimeout(loadingDelay);
      void statusPolling;
    }
  }
  function initPlayer(id:string,start:number){
    setPlayerLoadFailed(false);
    let created=false;
    const disableYouTubeCaptions=(target:Player)=>{
      if(target.getOptions?.().includes("captions")){
        target.unloadModule?.("captions");
      }
    };
    const create=()=>{if(created||!window.YT||!playerHost.current)return;created=true;player.current?.destroy(); playerHost.current.innerHTML="";if(playerReadyTimer.current)clearTimeout(playerReadyTimer.current);playerReadyTimer.current=setTimeout(()=>setPlayerLoadFailed(true),12000);player.current=new window.YT.Player(playerHost.current,{videoId:id,width:"100%",height:"100%",playerVars:{autoplay:state.settings.autoplay?1:0,controls:0,disablekb:1,modestbranding:1,rel:0,playsinline:1,fs:0,start:Math.floor(start),cc_load_policy:0,iv_load_policy:3,showinfo:0,hl:"el"},events:{onReady:({target}:{target:Player})=>{if(playerReadyTimer.current)clearTimeout(playerReadyTimer.current);setPlayerLoadFailed(false);setPlayerReady(true);disableYouTubeCaptions(target);window.setTimeout(()=>disableYouTubeCaptions(target),350);target.setVolume(playerVolumeFromUi(volume));if(isMuted)target.mute();const appliedRate=pendingShareSpeed.current??state.settings.speed;target.setPlaybackRate(appliedRate);pendingShareSpeed.current=null;if(start>1&&Number.isFinite(start)){target.seekTo(start,true);setPlayhead(start);}if(state.settings.autoplay||playWhenReady.current){playWhenReady.current=false;target.playVideo();}},onApiChange:({target}:{target:Player})=>disableYouTubeCaptions(target),onStateChange:({target,data}:{target:Player;data:number})=>{disableYouTubeCaptions(target);setIsPlaying(data===1);},onPlaybackRateChange:({data}:{data:number})=>{if(isAllowedShareSpeed(data))setState(current=>({...current,settings:{...current.settings,speed:data}}));}}});};
    if(window.YT?.Player){create();return;}
    let script=document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if(!script){script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;document.head.appendChild(script);}
    window.onYouTubeIframeAPIReady=create;
    const apiTimeout=window.setTimeout(()=>{if(window.YT?.Player){create();return;}script?.remove();setPlayerLoadFailed(true);},12000);
    script.addEventListener("load",()=>{window.clearTimeout(apiTimeout);if(window.YT?.Player)create();},{once:true});
    script.addEventListener("error",()=>{window.clearTimeout(apiTimeout);script?.remove();setPlayerLoadFailed(true);},{once:true});
  }
  useEffect(()=>{
    if(!captions||!selectedId||checkingReady||loading||playerReady)return;
    const raf=window.requestAnimationFrame(()=>initPlayer(selectedId,pendingPlayerStart.current));
    return()=>window.cancelAnimationFrame(raf);
  },[captions,selectedId,checkingReady,loading,playerReady]);
  function currentPlayer(){
    const target=player.current;
    return target&&typeof target.getCurrentTime==="function"&&typeof target.getDuration==="function"?target:null;
  }
  useEffect(()=>{
    if(!selectedId||!playerReady)return;
    lastSkipJump.current=null;
    const selectedDuration=selected?.duration||0;
    const timer=window.setInterval(()=>{
      const target=currentPlayer();if(!target)return;
      const now=target.getCurrentTime();if(!Number.isFinite(now))return;
      const duration=target.getDuration()||selectedDuration;
      const skipTarget=activeSkipTarget(selected?.skipRanges,now,duration);
      if(skipTarget===null)return;
      const recent=lastSkipJump.current;
      const timestamp=performance.now();
      if(recent&&recent.videoId===selectedId&&Math.abs(recent.target-skipTarget)<.01&&timestamp-recent.at<1200)return;
      lastSkipJump.current={videoId:selectedId,target:skipTarget,at:timestamp};
      target.seekTo(skipTarget,true);
      setPlayhead(skipTarget+state.settings.delay);
    },100);
    return()=>window.clearInterval(timer);
  },[selectedId,playerReady,selected?.skipRanges,selected?.duration,state.settings.delay]);
  useEffect(()=>{if(!captions||!selectedId)return;lastProgressSave.current=0;const selectedDuration=selected?.duration||0;const timer=window.setInterval(()=>{const target=currentPlayer();if(!target)return;const now=target.getCurrentTime();if(!Number.isFinite(now))return;setPlayhead(now+state.settings.delay);const nextActive=activeIndex(captions.cues,now+state.settings.delay);if(nextActive!==activeRef.current){activeRef.current=nextActive;setActive(nextActive);}const duration=target.getDuration()||selectedDuration;if(duration>0&&now-lastProgressSave.current>=5){lastProgressSave.current=now;patchVideo(selectedId,{lastPosition:now,duration,progress:Math.min(100,(now/duration)*100)});}},250);return()=>clearInterval(timer);},[captions,selectedId,state.settings.delay,selected?.duration]);
  useEffect(()=>{
    if(!transcriptOpen||!state.settings.autoScroll||!transcript.current||!captions)return;
    const currentTime=currentPlayer()?.getCurrentTime();
    const cueIndex=typeof currentTime==="number"?activeIndex(captions.cues,currentTime+state.settings.delay):active;
    if(cueIndex<0)return;
    if(cueIndex!==activeRef.current){activeRef.current=cueIndex;setActive(cueIndex);}
    const container=transcript.current;
    const cue=container.querySelector(`[data-cue="${cueIndex}"]`) as HTMLElement|null;
    if(!cue)return;
    const target=Math.max(0,cue.offsetTop-container.clientHeight/2+cue.clientHeight/2);
    container.scrollTo({top:target,behavior:"smooth"});
  },[transcriptOpen,active,state.settings.autoScroll,state.settings.delay,captions]);
  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    const id=params.get("video");
    const rawTime=Number(params.get("t"));
    const t=Number.isFinite(rawTime)&&rawTime>=0?rawTime:0;
    const rawSpeed=Number(params.get("speed"));
    const validSpeed=isAllowedShareSpeed(rawSpeed)?rawSpeed:null;
    if(!hydrated||!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return;
    const controller=new AbortController();
    const open=(video:Video,ready?:Captions)=>{
      if(controller.signal.aborted||new URLSearchParams(location.search).get("video")!==id)return;
      if(validSpeed!==null){
        pendingShareSpeed.current=validSpeed;
        setState(current=>({...current,settings:{...current.settings,speed:validSpeed}}));
      }
      void openVideo(video,t,false,false,ready);
    };
    const existing=state.videos.find(video=>video.id===id);
    const timer=window.setTimeout(()=>{
      if(existing){open(existing);return;}
      // Shared links may refer to published captions absent from this device's library.
      // Resolve ready data only; opening a link must never start a translation job.
      void fetch(`/api/captions?videoId=${encodeURIComponent(id)}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
        if(!response.ok)return;
        const ready=await response.json() as Captions;
        if(controller.signal.aborted||new URLSearchParams(location.search).get("video")!==id||ready.videoId!==id||!isCompleteGreekTranscript(ready))return;
        const video:Video={id,url:`https://www.youtube.com/watch?v=${id}`,title:ready.title,originalTitle:ready.originalTitle,channel:ready.channel,channelUrl:ready.channelUrl,originalVideoUrl:ready.originalVideoUrl,category:"Other",tags:[],notes:"",description:ready.keyPoints?.[0]||"",duration:ready.duration||0,addedAt:new Date().toISOString(),favorite:false,lastPosition:0,progress:0,metadataVersion:6,speakerName:ready.speaker?.name,speakerRole:ready.speaker?.role};
        setState(current=>({...current,videos:current.videos.some(item=>item.id===id)?current.videos:[video,...current.videos]}));
        open(video,ready);
      }).catch(()=>undefined);
    },0);
    return()=>{window.clearTimeout(timer);controller.abort()};
  },[hydrated]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||blocksPlayerShortcut(event.target))return;
      if(event.code==="KeyM"&&selected){
        if(event.repeat)return;
        event.preventDefault();
        const time=player.current?.getCurrentTime()||0;
        setMomentModal({time,excerpt:captions?.cues[active]?.text||""});
        return;
      }
      const target=player.current;
      if(!captions||!target||typeof target.getCurrentTime!=="function")return;
      if(event.code==="Space"){
        if(event.repeat)return;
        event.preventDefault();
        if(target.getPlayerState()===1)target.pauseVideo();else target.playVideo();
        setShowFsExit(true);
        return;
      }
      if(event.code!=="ArrowLeft"&&event.code!=="ArrowRight")return;
      event.preventDefault();
      const direction=event.code==="ArrowLeft"?-5:5;
      const duration=target.getDuration()||Number.MAX_SAFE_INTEGER;
      const base=keyboardSeekTarget.current??target.getCurrentTime();
      const next=Math.max(0,Math.min(duration,base+direction));
      keyboardSeekTarget.current=next;
      target.seekTo(next,true);
      if(keyboardSeekTimer.current)clearTimeout(keyboardSeekTimer.current);
      keyboardSeekTimer.current=setTimeout(()=>{keyboardSeekTarget.current=null;},350);
    };
    addEventListener("keydown",key);
    return()=>{removeEventListener("keydown",key);if(keyboardSeekTimer.current)clearTimeout(keyboardSeekTimer.current);};
  },[selected,active,captions]);

  function seek(time:number){const target=currentPlayer();target?.seekTo(time,true);target?.playVideo();}
  function skip(seconds:number){
    const target=currentPlayer();if(!target)return;
    const duration=target.getDuration()||0;
    target.seekTo(Math.max(0,Math.min(duration||Number.MAX_SAFE_INTEGER,target.getCurrentTime()+seconds)),true);
  }
  function revealPlayerUi(){
    setControlsVisible(true);
    if(controlsTimer.current)clearTimeout(controlsTimer.current);
    if(isPlaying)controlsTimer.current=setTimeout(()=>setControlsVisible(false),3600);
  }
  function updateSeekPreview(event:React.PointerEvent<HTMLInputElement>,duration:number){
    if(duration<=0)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));
    setSeekPreview(ratio*duration);
    revealPlayerUi();
  }
  function togglePlayback(){
    const target=currentPlayer();if(!target||typeof target.getPlayerState!=="function"){playWhenReady.current=true;return;}
    if(target.getPlayerState()===1)target.pauseVideo();else target.playVideo();
    revealFsExit();
  }
  function handleVideoTap(event:React.MouseEvent<HTMLButtonElement>){
    event.preventDefault();
    revealPlayerUi();revealFsExit();
    if(event.detail===0){togglePlayback();return;}
    const coarsePointer=window.matchMedia("(pointer: coarse)").matches;
    const rect=event.currentTarget.getBoundingClientRect();
    const horizontalPosition=(event.clientX-rect.left)/Math.max(1,rect.width);
    const tapZone:VideoTapZone=!coarsePointer?"center":horizontalPosition<.35?"backward":horizontalPosition>.65?"forward":"center";
    const now=window.performance.now();
    if(lastVideoTap.current>0&&now-lastVideoTap.current<=320&&lastVideoTapZone.current===tapZone){
      if(videoTapTimer.current)clearTimeout(videoTapTimer.current);
      videoTapTimer.current=null;lastVideoTap.current=0;lastVideoTapZone.current=null;
      if(tapZone==="backward")skip(-10);
      else if(tapZone==="forward")skip(10);
      else void toggleFullscreen();
      return;
    }
    lastVideoTap.current=now;lastVideoTapZone.current=tapZone;
    if(videoTapTimer.current)clearTimeout(videoTapTimer.current);
    videoTapTimer.current=setTimeout(()=>{
      videoTapTimer.current=null;lastVideoTap.current=0;lastVideoTapZone.current=null;togglePlayback();
    },300);
  }
  function revealFsExit(){
    setShowFsExit(true);
    if(fsExitTimer.current)clearTimeout(fsExitTimer.current);
    if(isPlaying)fsExitTimer.current=setTimeout(()=>setShowFsExit(false),2200);
  }
  function toggleMute(){
    const target=currentPlayer();if(!target||typeof target.mute!=="function")return;
    if(isMuted||volume===0){target.unMute();if(volume===0){target.setVolume(playerVolumeFromUi(70));setVolumeState(70)}setIsMuted(false);}
    else{target.mute();setIsMuted(true);}
  }
  function changeVolume(next:number){
    const target=currentPlayer();if(!target||typeof target.setVolume!=="function")return;
    const clamped=Math.max(0,Math.min(100,next));
    target.setVolume(playerVolumeFromUi(clamped));setVolumeState(clamped);
    if(clamped===0){target.mute();setIsMuted(true);}else if(isMuted){target.unMute();setIsMuted(false);}
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
    if(isAppleMobile){window.scrollTo(0,0);setIsPseudoFullscreen(true);return;}
    const target=fullscreenHost.current as (HTMLDivElement&{webkitRequestFullscreen?:()=>Promise<void>|void})|null;
    try{
      if(target?.requestFullscreen)await target.requestFullscreen();
      else if(target?.webkitRequestFullscreen)await target.webkitRequestFullscreen();
      else setIsPseudoFullscreen(true);
    }catch{setIsPseudoFullscreen(true);}
  }
  function beginMoment(time=currentPlayer()?.getCurrentTime()||0,excerpt=captions?.cues[active]?.text||""){setMomentModal({time,excerpt});}
  function saveMoment(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selected||!momentModal)return;const fd=new FormData(event.currentTarget);const m:Moment={id:uid(),videoId:selected.id,time:momentModal.time,note:String(fd.get("note")||tr("Αποθηκευμένη στιγμή")),tags:String(fd.get("tags")||"").split(",").map(x=>x.trim()).filter(Boolean),excerpt:momentModal.excerpt};setState(s=>({...s,moments:[m,...s.moments]}));setMomentModal(null);void copyMoment(m);}
  function currentShareSpeed(){return currentPlayer()?.getPlaybackRate()??state.settings.speed;}
  async function copyMoment(m:Moment){await copyText(buildMomentShareUrl(m.videoId,m.time,currentShareSpeed()));}
  async function shareMoment(m:Moment){
    const url=buildMomentShareUrl(m.videoId,m.time,currentShareSpeed());
    if(navigator.share){try{await navigator.share({title:m.note,url});return;}catch{}}
    await copyText(url);
  }
  function close(){if(selectedId){const time=player.current?.getCurrentTime();const duration=player.current?.getDuration()||selected?.duration||0;if(typeof time==="number"&&Number.isFinite(time)&&time>0){patchVideo(selectedId,{lastPosition:time,duration:duration||0,progress:duration>0?Math.min(100,(time/duration)*100):selected?.progress||0,lastWatched:new Date().toISOString()});}}if(playerReadyTimer.current)clearTimeout(playerReadyTimer.current);if(videoTapTimer.current)clearTimeout(videoTapTimer.current);lastVideoTap.current=0;lastVideoTapZone.current=null;player.current?.destroy();player.current=null;setPlayerReady(false);setPlayerLoadFailed(false);setIsPlaying(false);setPlayhead(0);setActive(-1);setIsPseudoFullscreen(false);setCheckingReady(false);setSpeakerBioOpen(false);setSelectedId(null);setCaptions(null);setTranscriptOpen(false);setError("");history.replaceState(null,"","/");}
  function goToSettings(){
    playerScrollPosition.current=window.scrollY;
    const time=currentPlayer()?.getCurrentTime()||selected?.lastPosition||0;
    if(selectedId)patchVideo(selectedId,{lastPosition:time});
    setMobileMenu(false);
    setSubtitleMenuOpen(false);
    setVolumeSliderOpen(false);
    setView("settings");
  }
  function returnToVideo(){
    if(!selectedId)return;
    setView("library");
  }
  function openLibrarySettings(){
    playerScrollPosition.current=window.scrollY;
    setMobileMenu(false);
    setView("settings");
  }
  function returnToLibrary(){setView("library");}
  function goHome(){close();setView("library");setMobileMenu(false);}
  async function rebuildTranslation(video:Video){
    localStorage.removeItem(`greektube-transcript:${video.id}:v3`);
    localStorage.removeItem(`greektube-transcript:${video.id}:v12`);
    setEditingVideo(null);
    player.current?.destroy();
    player.current=null;
    await openVideo(video,video.lastPosition,false,true);
  }

  if(selected){
    const moments=state.moments.filter(m=>m.videoId===selected.id);
    const canonicalSpeaker=canonicalSpeakerForVideo(selected.id,selected.speakerName,captions?.speaker?.name,selected.channel);
    const fallbackSpeaker=canonicalSpeaker||speakerForVideo(selected.id,selected.channel);
    const speaker=captions?.speaker||fallbackSpeaker;
    const storedSpeaker=(selected.speakerName||"").trim();
    const normalizedStoredSpeaker=searchText(storedSpeaker);
    const normalizedChannel=searchText(selected.channel);
    const speakerNeedsFallback=!storedSpeaker||normalizedStoredSpeaker===normalizedChannel||normalizedStoredSpeaker==="αγνωστος ομιλητης"||normalizedStoredSpeaker==="unknown speaker";
    const displaySpeakerName=speakerNeedsFallback?(captions?.speaker?.name||fallbackSpeaker.name||selected.channel):storedSpeaker;
    const displaySpeakerRole=[canonicalSpeaker?.role,selected.speakerRole,captions?.speaker?.role,fallbackSpeaker.role].map(cleanSpeakerRole).find(Boolean)||"";
    const displaySpeakerLabel=displaySpeakerRole?`${displaySpeakerName} | ${displaySpeakerRole}`:displaySpeakerName;
    const sourceVideoUrl=selected.originalVideoUrl||selected.url||`https://www.youtube.com/watch?v=${selected.id}`;
    const sourceChannelUrl=selected.channelUrl||"";
    const providerWaiting=Boolean(processingTelemetry?.retryAfter&&new Date(processingTelemetry.retryAfter).getTime()>Date.now());
    const preparationStage=providerWaiting?tr("Προσωρινή καθυστέρηση — συνεχίζουμε αυτόματα"):progress>=100?tr("Οι ελληνικοί υπότιτλοι είναι έτοιμοι"):[...PREPARATION_STAGES_EL].reverse().find(stage=>progress>=stage.at)?.label||PREPARATION_STAGES_EL[0].label;
    const guideItems=videoGuide(captions,selected.id,selected.creatorChapters||[]);
    const preparingGuide=loadingGuide(loadingPoints);
    const nextVideos=state.videos.filter(video=>video.id!==selected.id&&video.progress<WATCHED_THRESHOLD).sort((a,b)=>b.addedAt.localeCompare(a.addedAt)).slice(0,4);
    const showPlayerCover=!playerReady||(!isPlaying&&playhead<1);
    const seekDuration=Math.max(selected.duration||0,captions?.duration||0);
    const detailsVideo=selected;
    async function handleCopyLink(){
      const ok=await copyText(sourceVideoUrl);
      setDetailsCopyState(ok?"copied":"error");
      window.setTimeout(()=>setDetailsCopyState("idle"),2000);
    }
    async function handleDownloadSrt(){
      setDetailsSrtDownloading(true);setDetailsSrtError("");
      try{await fetchAndDownloadSrt(detailsVideo);}
      catch(problem){setDetailsSrtError(problem instanceof Error?problem.message:"Δεν ήταν δυνατή η λήψη του αγγλικού transcript.");}
      finally{setDetailsSrtDownloading(false);}
    }
    const settingsFromPlayer=view==="settings";
    return <>
    <main className={`app-shell viewer player-screen-transition ${checkingReady?"player-is-opening":""} ${settingsFromPlayer?"viewer-settings-open":""}`} aria-hidden={settingsFromPlayer?true:undefined}>
      <header className="app-header"><button className="ghost back-library" onClick={close}><span aria-hidden="true">‹</span> {tr("Βιβλιοθήκη")}</button><Brand home={goHome}/><button className="icon-button" aria-label="Ρυθμίσεις" onClick={goToSettings}><SettingsGearIcon/></button></header>
      {checkingReady&&<section className="watch-layout player-only player-opening-shell" role="status" aria-live="polite" aria-label="Φόρτωση βίντεο">
        <div className="watch-main">
          <div className="mobile-video-byline player-opening-byline"><strong>{displaySpeakerLabel}</strong><span aria-hidden="true"><i/><i/><i/></span></div>
          <div className="sticky-player">
            <div className="video-frame player-opening-frame">
              <img src={`https://i.ytimg.com/vi/${selected.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`}} alt=""/>
              <div className="player-opening-shade" aria-hidden="true"/>
              <span className="player-opening-spinner" aria-hidden="true"/>
              <span className="player-opening-progress" aria-hidden="true"><i/></span>
            </div>
            <div className="player-opening-controls" aria-hidden="true">
              <div className="player-opening-control-card">
                <div className="player-opening-primary"><span/><b/><span/></div>
                <div className="player-opening-compact"><i/><i/></div>
              </div>
              <div className="player-opening-actions"><i/><i/><i/></div>
            </div>
          </div>
          <div className="player-opening-details" aria-hidden="true"><i/><i/><i/></div>
        </div>
        <span className="sr-only">{tr("Το βίντεο ανοίγει")}</span>
      </section>}
      {!checkingReady&&loading&&<section className="content-loading">
        <div className="loading-visual"><img src={`https://i.ytimg.com/vi/${selected.id}/maxresdefault.jpg`} onError={event=>{event.currentTarget.src=`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`}} alt=""/><div className="loading-percentage" aria-label={`${progress.toFixed(1)} τοις εκατό`}>{progress.toFixed(1)}%</div><div className="loading-caption"><small>{speaker.name}</small><h1>{appTitle(selected)}</h1>{englishTitle(selected)&&<p className="original-title">{englishTitle(selected)}</p>}</div></div>
        <div className="loading-insights">
          <div className="loading-progress-line"><span>{tr("ΠΡΟΕΤΟΙΜΑΣΙΑ ΥΠΟΤΙΤΛΩΝ")}</span><strong>{progress.toFixed(1)}%</strong></div>
          <div className="progress" role="progressbar" aria-label="Πρόοδος προετοιμασίας" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:`${progress}%`}}/></div>
          {processingTelemetry&&<div className="preparation-telemetry" aria-label="Λεπτομέρειες προετοιμασίας">{processingTelemetry.totalCues? <span className="telemetry-cues">{processingTelemetry.currentCue||Math.min(processingTelemetry.totalCues,(processingTelemetry.cursor||0)+1)} / {processingTelemetry.totalCues}</span>:null}<span className="telemetry-elapsed">◷ {clock(processingTelemetry.elapsedSeconds||0)}</span></div>}
          <div className={`preparation-status ${progress>=100?"done":""}`} aria-live="polite"><i aria-hidden="true">{progress>=100?"✓":""}</i><span key={preparationStage}>{preparationStage}</span></div>
          <ol className="preparation-steps" aria-label="Στάδια προετοιμασίας υποτίτλων">{PREPARATION_STAGES_EL.map((stage,index)=>{const next=PREPARATION_STAGES_EL[index+1];const done=progress>=100||Boolean(next&&progress>=next.at);const active=!done&&progress>=stage.at;return <li key={stage.at} className={`${done?"done":""} ${active?"active":""}`}><i aria-hidden="true">{done?"✓":String(index+1).padStart(2,"0")}</i><span>{stage.label}</span></li>})}</ol>
          <section className="speaker-loading-card"><h2>{speaker.name}</h2><strong>{speaker.role}</strong></section>
          <h2>{tr("Οδηγός βίντεο")}</h2>
          {preparingGuide.length>0?<ol className="loading-guide">{preparingGuide.map((point,index)=><li key={`${point}-${index}`}><i>{String(index+1).padStart(2,"0")}</i><span>{point}</span></li>)}</ol>:<div className="loading-description">{tr("Μόλις ετοιμαστούν οι ελληνικοί υπότιτλοι, εδώ θα εμφανιστούν 4-5 σημεία με timestamps για γρήγορη πλοήγηση.")}</div>}
        </div>
      </section>}
      {!checkingReady&&error&&<section className="empty"><b>!</b><h2>{tr("Δεν ολοκληρώθηκε η προετοιμασία")}</h2><p>{error}</p><button className="primary" onClick={()=>void openVideo(selected)}>{tr("Δοκίμασε ξανά")}</button></section>}
      {!checkingReady&&!loading&&!captions&&!error&&<section className="video-details">
        <div className="video-details-grid">
          <div className="video-details-thumb">
            <img src={`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`} alt=""/>
            <div className="video-details-thumb-tags">
              <span>{tr(CATEGORY_LABELS[selected.category])}</span>
              {selected.duration?<span>{clock(selected.duration)}</span>:null}
              <span className="status">{upperGreekLabel(tr("Χωρίς ελληνικούς υπότιτλους"))}</span>
            </div>
          </div>
          <div className="video-details-info">
            <h1>{appTitle(selected)}</h1>
            {englishTitle(selected)&&<p className="video-details-original">{englishTitle(selected)}</p>}
            <dl className="video-details-meta">
              <div><dt>{upperGreekLabel(tr("Ομιλητής"))}</dt><dd>{displaySpeakerName}</dd></div>
              {displaySpeakerRole&&<div><dt>{upperGreekLabel(tr("Ιδιότητα"))}</dt><dd>{displaySpeakerRole}</dd></div>}
              <div><dt>{upperGreekLabel(tr("Κανάλι"))}</dt><dd>{sourceChannelUrl?<a href={sourceChannelUrl} target="_blank" rel="noreferrer">{selected.channel}</a>:selected.channel}</dd></div>
              <div><dt>{upperGreekLabel(tr("Κατηγορία"))}</dt><dd>{tr(CATEGORY_LABELS[selected.category])}</dd></div>
              <div><dt>{upperGreekLabel(tr("Διάρκεια"))}</dt><dd>{selected.duration?clock(selected.duration):"—"}</dd></div>
            </dl>
            {selected.description&&<p className="video-details-description">{selected.description}</p>}
            <button type="button" className="secondary video-details-edit" onClick={()=>void requestEdit(selected)}>{tr("Επεξεργασία στοιχείων")}</button>
          </div>
        </div>
        <section className="video-details-source">
          <h2>{upperGreekLabel(tr("Πηγή"))}</h2>
          <div className="video-details-source-row">
            <input readOnly value={sourceVideoUrl} onFocus={event=>event.currentTarget.select()} aria-label="Σύνδεσμος YouTube"/>
            <button type="button" className="secondary" onClick={()=>void handleCopyLink()}>{detailsCopyState==="copied"?tr("Αντιγράφηκε ✓"):tr("Αντιγραφή")}</button>
            <a className="secondary" href={sourceVideoUrl} target="_blank" rel="noreferrer">{tr("Άνοιγμα στο YouTube")}</a>
          </div>
          <span role="status" aria-live="polite" className="sr-only">{detailsCopyState==="copied"?tr("Ο σύνδεσμος αντιγράφηκε"):detailsCopyState==="error"?tr("Η αντιγραφή απέτυχε"):""}</span>
        </section>
        <section className="video-details-translate">
          <h2>{upperGreekLabel(tr("Μετάφραση και υπότιτλοι"))}</h2>
          <p className="video-details-translate-intro">{tr("Δεν υπάρχουν ακόμη ελληνικοί υπότιτλοι για αυτό το βίντεο.")}</p>
          <div className="video-details-option recommended">
            <small>{upperGreekLabel(tr("Προτεινόμενη επιλογή"))}</small>
            <p>{tr("Αντέγραψε τον σύνδεσμο και στείλε τον στο ChatGPT. Θα αναλάβει τη λήψη του αγγλικού SRT, την ελληνική μετάφραση και τον έλεγχο ορολογίας και timestamps.")}</p>
            <div className="video-details-option-actions">
              <button type="button" className="primary" onClick={()=>void handleCopyLink()}>{detailsCopyState==="copied"?tr("Αντιγράφηκε ✓"):tr("Αντιγραφή")}</button>
              <button type="button" className="primary" onClick={()=>void requestManualImport(detailsVideo)}>{tr("Εισαγωγή ελληνικού SRT")}</button>
            </div>
            <button type="button" className="video-details-secondary-link" disabled={detailsSrtDownloading} onClick={()=>void handleDownloadSrt()}>{detailsSrtDownloading?tr("Λήψη…"):tr("Λήψη αγγλικού SRT")}</button>
            {detailsSrtError&&<p className="form-error" role="alert">{detailsSrtError}</p>}
          </div>
          <div className="video-details-option">
            <small>{upperGreekLabel(tr("Αυτόματη μετάφραση"))}</small>
            <p>{tr("Η αυτόματη μετάφραση ελέγχεται πριν από τη δημοσίευση. Ο ακουστικός έλεγχος εμφανίζεται ξεχωριστά.","Automatic translation is checked before publication. Audio review is reported separately.")}</p>
            <button type="button" className="secondary" onClick={()=>{const next={...selected,translationMode:"professional" as TranslationMode};patchVideo(selected.id,{translationMode:"professional"});void openVideo(next,selected.lastPosition,false,true);}}>{tr("Ξεκίνα αυτόματη μετάφραση")}</button>
          </div>
        </section>
      </section>}
      {!checkingReady&&!loading&&captions&&<>
        <section className={`watch-layout player-ready-transition ${transcriptOpen?"transcript-open":"player-only"}`}>
          <div className="watch-main">
            <div className="gts31-owner">
              <i className="gts31-owner-marker" aria-hidden="true"/>
              <span className="gts31-owner-copy"><strong>{displaySpeakerName}</strong>{displaySpeakerRole&&<span className="gts33-speaker-meta"><small>{displaySpeakerRole}</small>{canonicalSpeaker?.biography&&<button type="button" aria-haspopup="dialog" aria-expanded={speakerBioOpen} onClick={()=>{player.current?.pauseVideo();setIsPlaying(false);setSpeakerBioOpen(true);}}>{tr("Περισσότερα")}<span aria-hidden="true">›</span></button>}</span>}</span>
              <span className="gts31-owner-actions">
                <button type="button" aria-label="Επεξεργασία βίντεο" onClick={()=>void requestEdit(selected)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                <button type="button" aria-label={selected.favorite?tr("Αφαίρεση από τα αγαπημένα"):tr("Προσθήκη στα αγαπημένα")} className={selected.favorite?"active":""} aria-pressed={selected.favorite} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}><svg viewBox="0 0 24 24" fill={selected.favorite?"currentColor":"none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg></button>
              </span>
            </div>
            <div className="sticky-player" onContextMenu={e=>{e.preventDefault();beginMoment();}}>
              <div className={`video-frame ${isPseudoFullscreen?"pseudo-fullscreen":""} ${controlsVisible||!isPlaying?"player-ui-visible":"player-ui-hidden"}`} ref={fullscreenHost} onPointerMove={()=>revealPlayerUi()} onPointerDown={()=>revealPlayerUi()} onMouseLeave={()=>{if(isPlaying&&controlsTimer.current)controlsTimer.current=setTimeout(()=>setControlsVisible(false),900);}}>
                <div ref={playerHost}/>
                <button className={`player-cover ${playerReady?"":"is-loading"} ${showPlayerCover?"is-visible":"is-hidden"}`} tabIndex={showPlayerCover?0:-1} aria-hidden={!showPlayerCover} aria-label={playerReady?tr("Αναπαραγωγή βίντεο"):playerLoadFailed?tr("Επανάληψη φόρτωσης βίντεο"):tr("Φόρτωση βίντεο")} onClick={event=>playerLoadFailed?initPlayer(selected.id,playhead||selected.lastPosition):handleVideoTap(event)}><img src={`https://i.ytimg.com/vi/${selected.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`}} alt=""/>{playerReady?<span className="cover-play"><PlayIcon/></span>:<span className="cover-loading" aria-hidden="true"><i/><small>{playerLoadFailed?tr("ΠΑΤΗΣΤΕ ΓΙΑ ΕΠΑΝΑΛΗΨΗ"):tr("ΦΟΡΤΩΣΗ ΒΙΝΤΕΟ")}</small></span>}<span className="cover-caption"><small>{displaySpeakerLabel}</small><strong>{appTitle(selected)}</strong></span></button>
                {/* The title is shown only once in the details card below the player. */}
                <div className="player-cover-badges" aria-hidden="true"><span>{upperGreekLabel(CATEGORY_LABELS[selected.category])}</span>{selected.duration>0&&<time>{clock(selected.duration)}</time>}</div>
                <div className={`player-seek-ui ${controlsVisible||!isPlaying?"visible":"hidden"}`} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
                  <span className="player-time-label">{clock(Math.max(0,playhead))} / {clock(Math.max(0,seekDuration))}</span>
                  {seekPreview!==null&&seekDuration>0&&<output className="seek-preview" style={{"--seek-preview-position":`${Math.min(100,Math.max(0,(seekPreview/seekDuration)*100))}%`} as CSSProperties}>{clock(seekPreview)}</output>}
                  <input className="player-seek-bar" type="range" min={0} max={Math.max(1,seekDuration)} step="0.1" value={Math.min(playhead,Math.max(1,seekDuration))} disabled={seekDuration<=0} aria-label="Μετακίνηση στο βίντεο" style={{"--seek-progress":`${seekDuration>0?Math.min(100,(playhead/seekDuration)*100):0}%`} as CSSProperties} onPointerDown={event=>{event.stopPropagation();updateSeekPreview(event,seekDuration);}} onPointerMove={event=>updateSeekPreview(event,seekDuration)} onPointerUp={()=>{setSeekPreview(null);revealPlayerUi();}} onPointerCancel={()=>setSeekPreview(null)} onPointerLeave={()=>setSeekPreview(null)} onClick={event=>event.stopPropagation()} onChange={event=>{const nextTime=Number(event.currentTarget.value);setPlayhead(nextTime);currentPlayer()?.seekTo(nextTime,true);revealPlayerUi();}}/>
                </div>
                {state.settings.subtitles&&(()=>{const gi=subtitleEventAt(displayTrack.events,playhead),ei=subtitleEventAt(englishTrack.events,playhead);const greek=subtitleLines(displayTrack.events[gi]?.text||"").join("\n"),english=subtitleLines(englishTrack.events[ei]?.text||"").join("\n");if(!greek&&!english)return null;return <div className={`subtitles ${state.settings.subtitlePosition}`} style={{"--subtitle-size":`${state.settings.subtitleSize}px`,background:`rgba(0,0,0,${state.settings.opacity})`} as CSSProperties}>{state.settings.subtitleMode==="en"?english:state.settings.subtitleMode==="dual"?<><span>{greek}</span>{english&&<small>{english}</small>}</>:greek}</div>;})()}
                <button className="video-tap-toggle" aria-label={isPlaying?tr("Παύση βίντεο"):tr("Αναπαραγωγή βίντεο")} onClick={handleVideoTap}/>
                {(isFullscreen||isPseudoFullscreen)&&showFsExit&&<button className="custom-fullscreen" title={tr("Έξοδος από πλήρη οθόνη")} aria-label="Έξοδος από πλήρη οθόνη" onClick={e=>{e.preventDefault();e.stopPropagation();e.currentTarget.blur();void toggleFullscreen();}}><FullscreenExitIcon/></button>}
              </div>
              <div className="gts31-controls">
                <div className="gts31-controls-row-1">
                  <div className="gts31-play-cluster" role="group" aria-label="Έλεγχος αναπαραγωγής">
                    <button className="gts31-control gts31-skip" aria-label="Πίσω 10 δευτερόλεπτα" onClick={()=>skip(-10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M17 5l-7 7 7 7M10 5l-7 7 7 7"/></svg><small>10</small></button>
                    <button className="gts31-control gts31-play" aria-label={isPlaying?tr("Παύση"):tr("Αναπαραγωγή")} onClick={togglePlayback}>{isPlaying?<PauseIcon/>:<PlayIcon/>}</button>
                    <button className="gts31-control gts31-skip" aria-label="Μπροστά 10 δευτερόλεπτα" onClick={()=>skip(10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M7 5l7 7-7 7M14 5l7 7-7 7"/></svg><small>10</small></button>
                  </div>
                  <div className="gts31-settings-cluster">
                    <label className="gts31-speed" aria-label="Ταχύτητα αναπαραγωγής"><span className="sr-only">{tr("Ταχύτητα")}</span><select value={normalizedPlaybackSpeed(state.settings.speed)} onChange={event=>{const next=Number(event.target.value);setState(current=>({...current,settings:{...current.settings,speed:next}}));currentPlayer()?.setPlaybackRate(next);}}>{PLAYBACK_SPEEDS.map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label>
                    <div className="gts31-volume">
                      <button className="gts31-control gts31-volume-toggle" aria-label={isMuted||volume===0?tr("Ενεργοποίηση ήχου"):tr("Ρύθμιση ή σίγαση ήχου")} aria-expanded={volumeSliderOpen} onClick={()=>setVolumeSliderOpen(open=>!open)}>
                        <VolumeIcon muted={isMuted||volume===0}/>
                      </button>
                      {volumeSliderOpen&&<div className="gts31-volume-popup">
                        <button className="gts31-volume-mute" aria-label={isMuted?tr("Ενεργοποίηση ήχου"):tr("Σίγαση")} onClick={toggleMute}><VolumeIcon muted={isMuted||volume===0}/></button>
                        <input type="range" min={0} max={100} value={isMuted?0:volume} onPointerDown={event=>{volumeDragging.current=true;try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}}} onPointerUp={()=>{volumeDragging.current=false}} onPointerCancel={()=>{volumeDragging.current=false}} onChange={event=>changeVolume(Number(event.target.value))} aria-label="Ένταση ήχου"/>
                      </div>}
                    </div>
                  </div>
                </div>
                <div className="gts31-controls-row-2">
                  <button className="gts31-segment gts31-fullscreen" aria-label="Πλήρης οθόνη" onClick={event=>{event.currentTarget.blur();void toggleFullscreen();}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m11 0h3a2 2 0 002-2v-3"/></svg><span>{tr("Πλήρης")}</span></button>
                  <button className="gts31-segment gts31-moment" aria-label="Αποθήκευση στιγμής" onClick={()=>beginMoment()}>{moments.length>0&&<span className="gts31-moment-count">{moments.length}</span>}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 2l2.9 6.6L21 9.3l-4.9 4.6L17.4 21 12 17.6 6.6 21l1.3-7.1L3 9.3l6.1-.7L12 2z"/></svg><span>{tr("Στιγμή")}</span></button>
                  <button className={`gts31-segment gts31-transcript-button ${transcriptOpen?"active":""}`} aria-pressed={transcriptOpen} onClick={()=>setTranscriptOpen(value=>!value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7"/></svg><span>{tr("Κείμενο")}</span></button>
                  <div className={`gts31-subtitles ${state.settings.subtitles?"active":""}`}>
                    <button className={`gts31-segment gts31-cc-toggle ${state.settings.subtitles?"active":""}`} aria-label="Επιλογές υποτίτλων" aria-expanded={subtitleMenuOpen} onClick={()=>setSubtitleMenuOpen(open=>!open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h3M13 10h4M7 14h6"/></svg><span>{tr("Υπότιτλοι")}</span></button>
                    {subtitleMenuOpen&&<div className="gts31-cc-menu" role="menu" aria-label="Επιλογές υποτίτλων"><button className={!state.settings.subtitles?"active":""} role="menuitemradio" aria-checked={!state.settings.subtitles} onClick={()=>{setState(current=>({...current,settings:{...current.settings,subtitles:false}}));setSubtitleMenuOpen(false);}}><span>{tr("Χωρίς υπότιτλους")}</span>{!state.settings.subtitles&&<i>✓</i>}</button>{[{size:16,label:tr("Μικροί")},{size:19,label:tr("Μεσαίοι")},{size:22,label:tr("Μεγάλοι")}].map(option=><button key={option.size} className={state.settings.subtitles&&state.settings.subtitleSize===option.size?"active":""} role="menuitemradio" aria-checked={state.settings.subtitles&&state.settings.subtitleSize===option.size} onClick={()=>{setState(current=>({...current,settings:{...current.settings,subtitles:true,subtitleSize:option.size,subtitleSizeVersion:2}}));setSubtitleMenuOpen(false);}}><span>{option.label}</span>{state.settings.subtitles&&state.settings.subtitleSize===option.size&&<i>✓</i>}</button>)}</div>}
                  </div>
                </div>
              </div>
            </div>
            <div className="video-heading player-info-card"><div><small className="video-meta-kicker"><span className="video-category-label" data-category={selected.category}>{upperGreekLabel(CATEGORY_LABELS[selected.category])}</span></small><h1 className="player-greek-title">{appTitle(selected)}</h1>{(selected.originalTitle||captions.originalTitle||englishTitle(selected))&&<a className="player-original-title" href={sourceVideoUrl} target="_blank" rel="noreferrer" title={tr("Άνοιγμα αρχικού βίντεο στο YouTube")}>{selected.originalTitle||captions.originalTitle||englishTitle(selected)} ↗</a>}<div className="video-source-row"><span>{tr("ΠΗΓΗ")}</span>{sourceChannelUrl?<a href={sourceChannelUrl} target="_blank" rel="noreferrer" title={tr("Άνοιγμα καναλιού στο YouTube")}>{selected.channel} ↗</a>:<strong>{selected.channel}</strong>}</div><p className="mobile-video-description">{mobileSummary(selected,captions)}</p></div></div>
            {proofModeRef.current&&selected.id===ALIGNMENT_PROOF_VIDEO_ID&&<AudioTimingCapturePanel videoId={selected.id} playerReady={playerReady} getPlayer={currentPlayer}/>}
            <div className="mobile-watch-summary"><p>{selected.channel} · {tr(CATEGORY_LABELS[selected.category])} · {selected.views||0} {tr("προβολές")}</p><section><span>{(speaker.name||selected.speakerName||selected.channel).slice(0,1)}</span><div><strong>{displaySpeakerName}</strong><small>{displaySpeakerRole}</small></div><button type="button" aria-label="Διαχείριση υποτίτλων" onClick={()=>setTranslationChoiceVideo(selected)}>CC</button><button type="button" aria-label="Επεξεργασία βίντεο" onClick={()=>void requestEdit(selected)}>✎</button><button type="button" aria-label="Αγαπημένο" className={selected.favorite?"active":""} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♡</button></section></div>
            <section className="moments"><div className="section-title"><h2>{tr("Αποθηκευμένες στιγμές")}</h2><small>{moments.length}</small></div>{moments.length===0?<p className="muted">{tr("Πάτησε M ή το κουμπί πάνω για να κρατήσεις ένα σημείο.")}</p>:moments.map(m=><article className="moment" key={m.id} onClick={()=>seek(m.time)}><time>{clock(m.time)}</time><div><strong>{m.note}</strong><p>{m.excerpt}</p></div><div className="moment-actions"><button onClick={e=>{e.stopPropagation();seek(m.time)}}>{tr("Αναπαραγωγή")}</button><button onClick={e=>{e.stopPropagation();void copyMoment(m)}}>{tr("Αντιγραφή συνδέσμου")}</button><button onClick={e=>{e.stopPropagation();void shareMoment(m)}}>{tr("Κοινοποίηση")}</button><button onClick={e=>{e.stopPropagation();setState(s=>({...s,moments:s.moments.filter(x=>x.id!==m.id)}))}}>{tr("Διαγραφή")}</button></div></article>)}</section>
            {guideItems.length>0&&<section className={`video-guide editorial-guide ${guideOpen?"open":""}`}><button type="button" className="guide-toggle" aria-expanded={guideOpen} onClick={()=>setGuideOpen(open=>!open)}><span><small>{selected.creatorChapters?.length?"YOUTUBE CHAPTERS":"EDITORIAL GUIDE"}</small><strong>{tr("Οδηγός βίντεο")}</strong></span><span className="guide-toggle-meta">{guideItems.length?`${guideItems.length} βασικά σημεία`:tr("Υπό επιμέλεια")}<i aria-hidden="true">⌄</i></span></button>{guideOpen&&<div className="guide-content"><p className="guide-intro">{selected.creatorChapters?.length?tr("Κεφάλαια που έχει ορίσει ο δημιουργός του βίντεο στο YouTube."):tr("Επιλεγμένα σημεία με σύντομη περίληψη και context ώστε να πηγαίνεις κατευθείαν στην ουσία.")}</p>{guideItems.length?<div className="guide-list editorial-guide-list">{guideItems.map((item,index)=><button key={`${item.time}-${index}`} onClick={()=>seek(item.time)}><time>{clock(item.time)}</time><span><strong>{item.title}</strong>{item.summary&&<small>{item.summary}</small>}{item.comment&&<em><b>{tr("Σχόλιο")}</b>{item.comment}</em>}</span><i aria-hidden="true">▶</i></button>)}</div>:<div className="guide-empty">{tr("Ο οδηγός δεν έχει ακόμη επιμεληθεί για αυτό το βίντεο. Δεν εμφανίζουμε αυτόματα raw subtitle fragments.")}</div>}</div>}</section>}
            {nextVideos.length>0&&<section className="next-videos"><div className="section-title"><h2>{tr("Επόμενα βίντεο")}</h2><small>{nextVideos.length}</small></div><div className="next-video-row">{nextVideos.map(video=><button key={video.id} onClick={()=>void openVideo(video,video.lastPosition)}><img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt=""/><span><strong>{appTitle(video)}</strong><small>{video.channel}</small></span></button>)}</div></section>}
          </div>
          {transcriptOpen&&<SubtitleTranscript track={displayTrack} time={playhead} follow={state.settings.autoScroll} highlight={state.settings.highlight} seek={seek} moment={beginMoment} close={()=>setTranscriptOpen(false)}/>}
        </section>
      </>}
      {momentModal&&<Modal title={tr("Αποθήκευση στιγμής")} close={()=>setMomentModal(null)}><form className="form moment-form" onSubmit={saveMoment}><div className="moment-preview"><time>{clock(momentModal.time)}</time><p>{momentModal.excerpt||tr("Η στιγμή θα αποθηκευτεί στο συγκεκριμένο σημείο του βίντεο.")}</p></div><label>{tr("Σύντομη σημείωση")}<input name="note" autoFocus placeholder={tr("Τι θέλεις να θυμάσαι από αυτό το σημείο;")}/></label><label>{tr("Ετικέτες")}<small>{tr("Προαιρετικά")}</small><input name="tags" placeholder={tr("π.χ. ινσουλίνη, διατροφή")}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setMomentModal(null)}>{tr("Ακύρωση")}</button><button className="primary">{tr("Αποθήκευση στιγμής")}</button></div></form></Modal>}
      {editRequest&&<EditPassword close={()=>setEditRequest(null)} authorized={()=>{setEditingVideo(editRequest);setEditRequest(null);}}/>}
      {editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:6});setEditingVideo(null);}} rebuild={()=>{const video=editingVideo;setEditingVideo(null);setTranslationChoiceVideo(video);}}/>}
      {manualImportRequest&&<EditPassword close={()=>setManualImportRequest(null)} authorized={()=>{setProImportVideo(manualImportRequest);setManualImportRequest(null);}}/>}
      {proImportVideo&&<ManualTranslateModal video={proImportVideo} authorizationRequired={()=>{setManualImportRequest(proImportVideo);setProImportVideo(null);}} close={()=>setProImportVideo(null)} done={async result=>{localStorage.setItem(`greektube-transcript:${proImportVideo.id}:v12`,JSON.stringify(result));patchVideo(proImportVideo.id,{captions:result.cues,translationMode:"manual-pro",title:isGreekTitle(proImportVideo.title)?proImportVideo.title:result.title||proImportVideo.title,originalTitle:proImportVideo.originalTitle||result.originalTitle});const video={...proImportVideo,captions:result.cues,translationMode:"manual-pro" as TranslationMode};setProImportVideo(null);setTranslationChoiceVideo(null);await openVideo(video,undefined,false,false,result);}}/>}
      {translationChoiceVideo&&<TranslationChoiceModal
        video={translationChoiceVideo}
        close={()=>setTranslationChoiceVideo(null)}
        backToLibrary={()=>{setTranslationChoiceVideo(null);setProImportVideo(null);goHome();}}
        onQuick={()=>{const next={...translationChoiceVideo,translationMode:"professional" as TranslationMode};setTranslationChoiceVideo(null);patchVideo(translationChoiceVideo.id,{translationMode:"professional"});void rebuildTranslation(next);}}
        onOpenManual={()=>void requestManualImport(translationChoiceVideo)}
      />}
      <SiteFooter />
    </main>
    {speakerBioOpen&&canonicalSpeaker?.biography&&<SpeakerBioModal profile={canonicalSpeaker} close={closeSpeakerBio}/>}
    {settingsFromPlayer&&<div className="settings-screen-layer" role="dialog" aria-modal="true" aria-label="Ρυθμίσεις"><div className="app-shell viewer settings-from-player settings-screen-shell"><header className="app-header"><button className="ghost back-to-video" autoFocus onClick={returnToVideo}>{tr("← Πίσω στο βίντεο")}</button><Brand home={goHome}/><button className="icon-button active" aria-label="Ρυθμίσεις" onClick={returnToVideo}><SettingsGearIcon/></button></header><div className="settings-screen-scroll"><SettingsPage settings={state.settings} update={patchSettings} close={returnToVideo}/></div></div></div>}
    </>;
  }

  const settingsFromLibrary=view==="settings";
  return <>
  <main className={`app-shell ${settingsFromLibrary?"library-settings-open":""}`} aria-hidden={settingsFromLibrary?true:undefined}>
    <header className="app-header"><Brand home={goHome}/><nav className="desktop-nav"><button className={!settingsFromLibrary?"active":""} onClick={returnToLibrary}>{tr("Βιβλιοθήκη")}</button><button data-gts-settings-trigger="true" className={settingsFromLibrary?"active":""} onClick={openLibrarySettings}>{tr("Ρυθμίσεις")}</button></nav><button className={`mobile-menu-toggle ${mobileMenu?"active":""}`} aria-label={mobileMenu?tr("Κλείσιμο μενού"):tr("Άνοιγμα μενού")} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(value=>!value)}><i/><i/><i/></button>{mobileMenu&&<div className="mobile-menu"><button className={!settingsFromLibrary?"active":""} onClick={goHome}>{tr("Βιβλιοθήκη")}</button><button data-gts-settings-trigger="true" className={settingsFromLibrary?"active":""} onClick={openLibrarySettings}>{tr("Ρυθμίσεις")}</button></div>}</header>
    <>
      <section className="home-intro"><span>{tr("ΒΙΝΤΕΟ ΒΙΒΛΙΟΘΗΚΗ")}</span><h1>{tr("Αυτόματοι ελληνικοί υπότιτλοι")}</h1></section>
      {!hydrated&&<section className="featured featured-loading" role="status" aria-label={tr("Φόρτωση προτεινόμενου βίντεο")} aria-busy="true"><div className="home-featured-loading-image"><span className="home-loading-mark" aria-hidden="true">▶</span><span className="home-loading-status">{tr("Φόρτωση βιβλιοθήκης…")}</span></div><div className="home-featured-loading-info" aria-hidden="true"><i className="home-loading-line short"/><i className="home-loading-line title"/><i className="home-loading-line medium"/><i className="home-loading-line wide"/><i className="home-loading-button"/></div></section>}
      {hydrated&&libraryLoadFailed&&libraryVideos.length===0&&<section className="home-library-error" role="alert"><strong>{tr("Η βιβλιοθήκη δεν φορτώθηκε.")}</strong><button type="button" onClick={()=>location.reload()}>{tr("Επανάληψη φόρτωσης")}</button></section>}
      {hydrated&&featured&&<section className={`featured ${newVideoIds.has(featured.id)?"featured-new":""}`} aria-label="Προτεινόμενο βίντεο">
        <button className="featured-media" onClick={()=>void openVideo(featured,featuredResumeTime)} aria-label={`${tr("Άνοιγμα βίντεο")}: ${appTitle(featured)}`}>
          <img src={`https://i.ytimg.com/vi/${featured.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${featured.id}/hqdefault.jpg`}} alt=""/>
          <span className="featured-play">▶</span>
          <div className="featured-overlay"><small>{featured.channel}</small></div>
          <div className="featured-progress"><i style={{width:`${featured.progress}%`}}/></div>
        </button>
        <div className="featured-panel">
          <div className="home-featured-context">{featuredHasHistory?tr("ΤΕΛΕΥΤΑΙΑ ΠΡΟΒΟΛΗ"):tr("ΝΕΟΤΕΡΟ ΒΙΝΤΕΟ")}</div><div className="featured-meta"><span>{upperGreekLabel(`${tr(CATEGORY_LABELS[featured.category])} · ${tr("Προβολές","Views")}: ${featured.views||0}`)}</span>{newVideoIds.has(featured.id)&&<i>{tr("ΝΕΟ")}</i>}<button aria-label="Αγαπημένο" className={`featured-favorite ${featured.favorite?"active":""}`} onClick={()=>patchVideo(featured.id,{favorite:!featured.favorite})}>♥</button></div>
          <h2>{appTitle(featured)}</h2>
          {englishTitle(featured)&&<p className="featured-original-title">{englishTitle(featured)}</p>}
          <small className="featured-speaker">{featured.speakerName||speakerForVideo(featured.id,featured.channel).name}</small>
          <div className="featured-actions">
            <button className="primary featured-resume" onClick={()=>void openVideo(featured,featuredResumeTime)}><span>{featuredResumeTime>0?tr("Συνέχεια προβολής"):featuredHasHistory?tr("Προβολή βίντεο"):tr("Δες το νέο βίντεο")}</span>{featured.progress>0&&featured.progress<WATCHED_THRESHOLD&&<small>{Math.round(featured.progress)}{tr("% έχεις δει")}</small>}<i style={{width:`${Math.max(0,Math.min(100,featured.progress||0))}%`}}/></button>
            {featuredResumeTime>0&&<button className="secondary" onClick={()=>void openVideo(featured,0)}>{tr("↺ Από την αρχή")}</button>}
          </div>
          {featuredMoments[0]&&<button className="latest-moment" onClick={()=>void openVideo(featured,featuredMoments[0].time)}><span>{tr("Τελευταία στιγμή ·")}{clock(featuredMoments[0].time)}</span><strong>{featuredMoments[0].note}</strong></button>}
        </div>
      </section>}
      {hydrated&&state.settings.continueWatching&&continueVideos.length>0&&<section className="continue-section"><div className="continue-header"><div><span>{tr("ΣΥΝΕΧΙΣΗ ΠΡΟΒΟΛΗΣ")}</span><div className="continue-title-line"><h2>{tr("Συνέχισε την προβολή")}</h2><small>{continueVideos.length} {continueVideos.length===1?tr("βίντεο"):tr("βίντεο")}</small></div><p>{tr("Συνέχισε από το σημείο που σταμάτησες.")}</p></div><button onClick={()=>document.querySelector(".library-tools")?.scrollIntoView({behavior:"smooth",block:"start"})}>{tr("Προβολή όλων")}</button></div><div className="continue-row">{continueVideos.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} edit={requestEdit} settings={state.settings} variant="continue" isNew={newVideoIds.has(v.id)}/>)}</div></section>}
      <section className="library-tools clean-library-tools"><div className="search"><SearchIcon/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr("Αναζήτηση βίντεο")}/>{search&&<button type="button" aria-label="Καθαρισμός αναζήτησης" onClick={()=>setSearch("")}>×</button>}</div><select className="library-sort" aria-label="Ταξινόμηση" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">{tr("Πρόσφατα")}</option><option value="title">{tr("Τίτλος")}</option><option value="progress">{tr("Πρόοδος")}</option></select><div className="quick-filters"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>{tr("Όλα")}</button><button className={filter==="new"?"active":""} onClick={()=>setFilter("new")}>{tr("Νέα")}</button><button className={filter==="favorites"?"active":""} onClick={()=>setFilter("favorites")}>{tr("♥ Αγαπημένα")}</button><button className={filter==="recent"?"active":""} onClick={()=>setFilter("recent")}>{tr("Ιστορικό προβολών")}</button><button className={filter==="hidden"?"active":""} onClick={()=>setFilter("hidden")}>{tr("Κρυφά")}</button></div></section>
      <div className="library-result-line"><span>{hydrated?`${filtered.length} ${tr("βίντεο")}`:tr("Φόρτωση…")}</span>{search&&<b>{tr("Αναζήτηση:")}{search}</b>}{syncMessage&&<b>{syncMessage}</b>}<button type="button" className="sync-library" disabled={syncing} onClick={()=>void requestSync()}>{syncing?tr("Συγχρονισμός…"):tr("Συγχρονισμός")}</button></div>
      <div className="category-row">{CATEGORIES.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{tr(CATEGORY_LABELS[c])}</button>)}</div>
      {!hydrated?<section className="video-grid skeleton-grid" aria-label="Φόρτωση βιβλιοθήκης">{Array.from({length:6}).map((_,index)=><div className="video-card skeleton-card" key={index}><div className="thumb"/><div className="card-info"><i/><i/><i/></div></div>)}</section>:<section className={`video-grid ${state.settings.layout} ${state.settings.compact?"compact":""}`}>{visibleVideos.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} edit={requestEdit} settings={state.settings} isNew={newVideoIds.has(v.id)}/>)}</section>}
      {hydrated&&visibleVideos.length<filtered.length&&<div className="load-more-wrap"><button className="load-more-button" type="button" onClick={()=>setVisibleCount(count=>count+LIBRARY_PAGE_SIZE)}><span>{tr("Περισσότερα")}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg><small>+{Math.min(LIBRARY_PAGE_SIZE,filtered.length-visibleVideos.length)} {tr("βίντεο")}</small></button></div>}
      {hydrated&&filtered.length===0&&<div className="empty polished-empty"><b>⌕</b><h2>{tr("Δεν βρέθηκαν βίντεο")}</h2><p>{tr("Δοκίμασε διαφορετική κατηγορία, ομιλητή ή λέξη αναζήτησης.")}</p></div>}
      <SiteFooter />
    </>
    {modal&&<AddVideo existingIds={state.videos.map(video=>video.id)} close={()=>setModal(false)} add={async(video,translate,openProImport)=>{const next={...stateRef.current,videos:[video,...stateRef.current.videos.filter(item=>item.id!==video.id)]};const saved=await saveStateToServer(next,false,true);if(!saved?.ok||!saved.sharedSaved)throw new Error(saved?.error||tr("Δεν αποθηκεύτηκε η κοινή βιβλιοθήκη."));setState(next);setModal(false);if(translate||openProImport){setTranslationChoiceVideo(video);return;}}}/>}
    {addRequest&&<EditPassword close={()=>setAddRequest(false)} authorized={()=>{setAddRequest(false);window.setTimeout(()=>void syncLibraryToServer(),350);setModal(true);}}/>}
    {syncRequest&&<EditPassword close={()=>setSyncRequest(false)} authorized={()=>{setSyncRequest(false);window.setTimeout(()=>void syncLibraryToServer(),350);}}/>}
    {editRequest&&<EditPassword close={()=>setEditRequest(null)} authorized={()=>{setEditingVideo(editRequest);setEditRequest(null);}}/>}
    {editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:6});setEditingVideo(null);}} rebuild={()=>{const video=editingVideo;setEditingVideo(null);setTranslationChoiceVideo(video);}}/>}
    {manualImportRequest&&<EditPassword close={()=>setManualImportRequest(null)} authorized={()=>{setProImportVideo(manualImportRequest);setManualImportRequest(null);}}/>}
    {proImportVideo&&<ManualTranslateModal video={proImportVideo} authorizationRequired={()=>{setManualImportRequest(proImportVideo);setProImportVideo(null);}} close={()=>setProImportVideo(null)} done={async result=>{localStorage.setItem(`greektube-transcript:${proImportVideo.id}:v12`,JSON.stringify(result));patchVideo(proImportVideo.id,{captions:result.cues,translationMode:"manual-pro",title:isGreekTitle(proImportVideo.title)?proImportVideo.title:result.title||proImportVideo.title,originalTitle:proImportVideo.originalTitle||result.originalTitle});const video={...proImportVideo,captions:result.cues,translationMode:"manual-pro" as TranslationMode};setProImportVideo(null);setTranslationChoiceVideo(null);await openVideo(video,undefined,false,false,result);}}/>}
    {translationChoiceVideo&&<TranslationChoiceModal video={translationChoiceVideo} close={()=>setTranslationChoiceVideo(null)} backToLibrary={()=>{setTranslationChoiceVideo(null);setProImportVideo(null);goHome();}} onQuick={()=>{const next={...translationChoiceVideo,translationMode:"professional" as TranslationMode};setTranslationChoiceVideo(null);patchVideo(translationChoiceVideo.id,{translationMode:"professional"});void rebuildTranslation(next);}} onOpenManual={()=>void requestManualImport(translationChoiceVideo)}/>}
  </main>
  {settingsFromLibrary&&<div className="settings-screen-layer" role="dialog" aria-modal="true" aria-label="Ρυθμίσεις"><div className="app-shell viewer settings-from-library settings-screen-shell"><header className="app-header"><button className="ghost back-library" autoFocus onClick={returnToLibrary}>{tr("← Βιβλιοθήκη")}</button><Brand home={goHome}/><button className="icon-button active" aria-label="Ρυθμίσεις" onClick={returnToLibrary}><SettingsGearIcon/></button></header><div className="settings-screen-scroll"><SettingsPage settings={state.settings} update={patchSettings} close={returnToLibrary}/></div></div></div>}
  </>;
}

function Brand({home}:{home:()=>void}){return <button className="brand brand-home" aria-label="Αρχική σελίδα" onClick={home}><span className="brand-mark" aria-hidden="true" /><span>GreekTube <b>Subs</b></span><small className="brand-version">{`ver ${APP_VERSION}`}</small></button>;}
function SiteFooter(){return <footer className="app-footer"><div className="app-footer-brand"><span className="brand-mark" aria-hidden="true" /><span>GreekTube <b>Subs</b></span></div><p>{tr("Αυτόματοι ελληνικοί υπότιτλοι για δημόσια βίντεο YouTube.")}</p><span className="app-footer-note">{tr("Φτιαγμένο με ♥ για ελληνόφωνους θεατές")}</span></footer>;}
function speakerMonogram(name:string){return name.replace(/^Dr\.?\s+/i,"").split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()||"").join("")||"i";}
function SpeakerBioModal({profile,close}:{profile:CanonicalSpeakerProfile;close:()=>void}){
  const biography=profile.biography;
  useEffect(()=>{
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")close();};
    window.addEventListener("keydown",escape);
    return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener("keydown",escape);};
  },[close]);
  if(!biography)return null;
  return <div className="gts33-bio-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
    <section className="gts33-bio-modal" role="dialog" aria-modal="true" aria-labelledby="speaker-bio-title" aria-describedby="speaker-bio-introduction">
      <header>
        <div className="gts33-bio-monogram" aria-hidden="true">{speakerMonogram(profile.name)}</div>
        <div><small>{upperGreekLabel(biography.profileLabel)}</small><h2 id="speaker-bio-title">{profile.name}</h2><span>{profile.role}</span></div>
        <button type="button" autoFocus aria-label="Κλείσιμο βιογραφικού" onClick={close}>×</button>
      </header>
      <p className="gts33-bio-intro" id="speaker-bio-introduction">{biography.introduction}</p>
      <div className="gts33-bio-facts">{biography.facts.map(fact=><article key={fact.label}><i aria-hidden="true"/><div><strong>{fact.label}</strong><p>{fact.text}</p></div></article>)}</div>
      {biography.infoNote&&<p className="gts33-bio-status"><span aria-hidden="true">i</span>{biography.infoNote}</p>}
      <footer><strong>{upperGreekLabel(tr("Πηγές"))}</strong><div>{biography.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true">↗</span></a>)}</div></footer>
    </section>
  </div>;
}
function Modal({title,close,children,busy=false}:{title:string;close:()=>void;children:React.ReactNode;busy?:boolean}){useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)close();};addEventListener("keydown",escape);return()=>removeEventListener("keydown",escape);},[busy,close]);return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><section className="modal" role="dialog" aria-modal="true" aria-label={title} aria-busy={busy}><header><h2>{title}</h2><button aria-label="Κλείσιμο" disabled={busy} onClick={close}>×</button></header>{children}</section></div>;}
function EditPassword({close,authorized}:{close:()=>void;authorized:()=>void}){
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");
    const password=String(new FormData(event.currentTarget).get("password")||"");
    try{
      const response=await fetch("/api/admin-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const result=await response.json() as {authorized?:boolean;error?:string};
      if(!response.ok||!result.authorized){setError(result.error||tr("Ο κωδικός δεν είναι σωστός."));return;}
      authorized();
    }catch{setError(tr("Δεν ήταν δυνατός ο έλεγχος του κωδικού."));}
    finally{setBusy(false);}
  }
  return <Modal title={tr("Προστατευμένη επεξεργασία")} close={close}><form className="form password-form" onSubmit={submit}><div className="password-intro"><span aria-hidden="true">⌑</span><div><strong>{tr("Απαιτείται κωδικός")}</strong><p>{tr("Η επεξεργασία είναι διαθέσιμη μόνο στον διαχειριστή.")}</p></div></div><label>{tr("Κωδικός πρόσβασης")}<input name="password" type="password" autoFocus autoComplete="current-password" required placeholder={tr("Πληκτρολόγησε τον κωδικό")}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>{tr("Ακύρωση")}</button><button className="primary" disabled={busy}>{busy?tr("Έλεγχος…"):tr("Συνέχεια")}</button></div></form></Modal>;
}
function VideoCard({video,open,patch,edit,settings,variant="library",isNew=false}:{video:Video;open:(v:Video)=>void;patch:(id:string,p:Partial<Video>)=>void;edit:(v:Video)=>void;settings:Settings;variant?:"library"|"continue";isNew?:boolean}){const title=appTitle(video);const watchedMinutes=Math.round(video.lastPosition/60);const totalMinutes=Math.ceil(video.duration/60);const progress=Math.round(video.progress||0);return <article className={`video-card ${variant==="continue"?"continue-card":""} ${isNew?"new-video":""}`} role="button" tabIndex={0} aria-label={`Άνοιγμα βίντεο: ${title}`} onClick={()=>{if(window.getSelection()?.toString().trim())return;void open(video)}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();void open(video)}}}><div className="thumb"><img loading="lazy" decoding="async" src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt=""/>{isNew&&<span className="new-badge">{tr("ΝΕΟ")}</span>}{video.duration>0&&<span className="duration">{clock(video.duration)}</span>}{progress>=WATCHED_THRESHOLD&&<span className="watched-badge">{tr("✓ Προβλήθηκε")}</span>}<button aria-label="Επεξεργασία βίντεο" className="card-edit" onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();edit(video)}}>✎</button><div className="thumb-top-right"><span className="card-category" data-category={video.category}>{upperGreekLabel(CATEGORY_LABELS[video.category])}</span><button aria-label="Αγαπημένο" className={`heart ${video.favorite?"active":""}`} onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();patch(video.id,{favorite:!video.favorite})}}>♥</button></div>{video.progress>0&&<i className="card-progress" style={{width:`${video.progress}%`}}/>}</div><div className="card-info"><div className="card-meta-line"><span>{video.channel}</span>{progress>0&&<em>{progress}%</em>}</div><strong>{title}</strong>{englishTitle(video)&&englishTitle(video)!==title&&<p className="card-original-title">{englishTitle(video)}</p>}{variant==="continue"&&<small>{totalMinutes>0?`${watchedMinutes} / ${totalMinutes} ${tr("λεπτά","min")}`:tr("Η διάρκεια υπολογίζεται…")}</small>}{variant==="library"&&settings.descriptions&&<p>{tr(video.description)}</p>}</div></article>;}

function EditVideo({video,close,save,rebuild}:{video:Video;close:()=>void;save:(patch:Partial<Video>)=>void;rebuild?:()=>void}) {
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    save({
      title:String(data.get("title")||video.title).trim(),
      originalTitle:String(data.get("originalTitle")||"").trim(),
      speakerName:String(data.get("speakerName")||"").trim(),
      speakerRole:String(data.get("speakerRole")||"").trim(),
      channel:String(data.get("channel")||video.channel).trim(),
      channelUrl:String(data.get("channelUrl")||"").trim(),
      originalVideoUrl:String(data.get("originalVideoUrl")||video.url).trim(),
      category:String(data.get("category")||video.category) as Category,
      tags:String(data.get("tags")||"").split(",").map(tag=>tag.trim()).filter(Boolean),
      description:String(data.get("description")||"").trim(),
      libraryVisible:data.get("libraryVisible")==="on",
    });
  }
  return <Modal title={tr("Επεξεργασία βίντεο")} close={close}><form className="form edit-video-form" onSubmit={submit}>
    <div className="edit-video-preview"><img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt=""/><div><strong>{appTitle(video)}</strong><span>{clock(video.duration)}</span></div></div>
    <label>{tr("Ελληνικός τίτλος")}<input name="title" required defaultValue={video.title}/></label>
    <label>{tr("Αγγλικός τίτλος")}<input name="originalTitle" defaultValue={video.originalTitle||""}/></label>
    <div className="form-grid"><label>{tr("Γιατρός ή ομιλητής")}<input name="speakerName" defaultValue={video.speakerName||""}/></label><label>{tr("Ιδιότητα")}<input name="speakerRole" defaultValue={cleanSpeakerRole(video.speakerRole)||cleanSpeakerRole(speakerForVideo(video.id,video.channel).role)} placeholder="π.χ. Neurologist"/></label></div>
    <div className="form-grid"><label>{tr("Κανάλι")}<input name="channel" defaultValue={video.channel}/></label><label>{tr("Link καναλιού")}<input name="channelUrl" type="url" defaultValue={video.channelUrl||""}/></label></div>
    <label>Original video link<input name="originalVideoUrl" type="url" defaultValue={video.originalVideoUrl||video.url}/></label>
    <div className="form-grid"><label>{tr("Κατηγορία")}<select name="category" defaultValue={video.category}>{CATEGORIES.slice(1).map(category=><option key={category} value={category}>{tr(CATEGORY_LABELS[category])}</option>)}</select></label><label>{tr("Ετικέτες")}<input name="tags" defaultValue={video.tags.join(", ")}/></label></div>
    <label>{tr("Περιγραφή")}<textarea name="description" defaultValue={video.description}/></label>
    <label className="edit-video-visibility"><span>{tr("Εμφάνιση στη βιβλιοθήκη")}</span><input name="libraryVisible" type="checkbox" defaultChecked={video.libraryVisible!==false}/><small>{video.libraryVisible===false?tr("Κρυφό — το βίντεο παραμένει αποθηκευμένο αλλά δεν εμφανίζεται στη βιβλιοθήκη."):tr("Ορατό στη βιβλιοθήκη.")}</small></label>
    {rebuild&&<button type="button" className="secondary rebuild-translation" onClick={rebuild}>{tr("↻ Νέα μετάφραση")}</button>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>{tr("Ακύρωση")}</button><button className="primary">{tr("Αποθήκευση αλλαγών")}</button></div>
  </form></Modal>;
}

function AutoTranslateIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/></svg>;}
function ManualTranslateIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h16M4 20v-3.5L15 5.5a1.5 1.5 0 0 1 2.1 0l1.4 1.4a1.5 1.5 0 0 1 0 2.1L7.5 20H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/><path d="M13 7.5 16.5 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;}

function ManualTranslateModal({video,authorizationRequired,close,done}:{video:Video;authorizationRequired:()=>void;close:()=>void;done:(captions:Captions)=>Promise<void>}) {
  const [downloading,setDownloading]=useState(false);
  const [downloadError,setDownloadError]=useState("");
  const [importing,setImporting]=useState(false);
  const [importError,setImportError]=useState("");
  const [importProgress,setImportProgress]=useState<ManualImportProgress|null>(null);
  const [sourceSubtitleText,setSourceSubtitleText]=useState(()=>{
    try{return typeof window==="undefined"?"":sessionStorage.getItem(`manual-source-srt:${video.id}`)||"";}catch{return "";}
  });
  const [showFallback,setShowFallback]=useState(false);
  const [subtitleText,setSubtitleText]=useState("");
  const [manualBusy,setManualBusy]=useState(false);
  const [manualError,setManualError]=useState("");
  const fileInput=useRef<HTMLInputElement|null>(null);

  async function downloadSrt(){
    setDownloading(true);setDownloadError("");
    try{
      const response=await fetch(`/api/captions/export-srt?videoId=${encodeURIComponent(video.id)}`,{cache:"no-store"});
      if(!response.ok){const failure=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(failure?.error||"Δεν ήταν δυνατή η λήψη του αγγλικού transcript.");}
      const text=await response.text();
      setSourceSubtitleText(text);
      try{sessionStorage.setItem(`manual-source-srt:${video.id}`,text);}catch{}
      const blob=new Blob([text],{type:"application/x-subrip;charset=utf-8"});
      const link=document.createElement("a");
      link.href=URL.createObjectURL(blob);
      link.download=srtFilename(video);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }catch(problem){setDownloadError(problem instanceof Error?problem.message:"Δεν ήταν δυνατή η λήψη του αγγλικού transcript.");}
    finally{setDownloading(false);}
  }
  async function importFile(file:File){
    setImporting(true);setImportError("");setImportProgress({progress:4,label:tr("Ανάγνωση ελληνικού SRT"),detail:`Διαβάζουμε το αρχείο ${file.name}.`});
    try{
      const text=await file.text();
      setImportProgress({progress:8,label:tr("Αποστολή για ασφαλή έλεγχο"),detail:tr("Το αρχείο διαβάστηκε και ξεκινά ο αυστηρός έλεγχος.")});
      const response=await fetch("/api/manual-captions/progress",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/x-ndjson"},body:JSON.stringify({url:video.url,title:video.title,originalTitle:video.originalTitle||"",channel:video.channel,duration:video.duration||0,subtitleText:text,sourceSubtitleText})});
      if(!response.ok){const failure=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(failure?.error||tr("Η εισαγωγή του ελληνικού SRT απέτυχε."));}
      if(!response.body)throw new Error(tr("Δεν ήταν δυνατή η παρακολούθηση της εισαγωγής."));
      const reader=response.body.getReader();
      const decoder=new TextDecoder();
      let buffer="";
      let result:Captions|null=null;
      let streamError="";
      for(;;){
        const {done:streamDone,value}=await reader.read();
        buffer+=decoder.decode(value||new Uint8Array(),{stream:!streamDone});
        const lines=buffer.split("\n");
        buffer=streamDone?"":lines.pop()||"";
        for(const line of lines){
          if(!line.trim())continue;
          const event=JSON.parse(line) as ({type:"progress"}&ManualImportProgress)|{type:"complete";result:Captions}|{type:"error";error:string};
          if(event.type==="progress")setImportProgress({progress:event.progress,label:event.label,detail:event.detail,currentCue:event.currentCue,totalCues:event.totalCues});
          if(event.type==="complete")result=event.result;
          if(event.type==="error")streamError=event.error;
        }
        if(streamDone)break;
      }
      if(streamError)throw new Error(streamError);
      if(!result)throw new Error(tr("Η εισαγωγή δεν επέστρεψε ολοκληρωμένους υπότιτλους."));
      setImportProgress({progress:100,label:tr("Η εισαγωγή ολοκληρώθηκε"),detail:tr("Όλοι οι έλεγχοι πέρασαν. Ανοίγουμε το video."),currentCue:result.cues.length,totalCues:result.cues.length});
      await done(result);
    }catch(problem){setImportProgress(null);setImportError(problem instanceof Error?problem.message:tr("Η εισαγωγή του ελληνικού SRT απέτυχε."));}
    finally{setImporting(false);}
  }
  async function chooseImportFile(){
    setImportError("");
    try{
      const response=await fetch("/api/admin-auth",{cache:"no-store"});
      const result=await response.json() as {authorized?:boolean};
      if(response.ok&&result.authorized){fileInput.current?.click();return;}
    }catch{}
    authorizationRequired();
  }
  async function submitManual(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!subtitleText.trim()){setManualError(tr("Επικόλλησε πρώτα τους έτοιμους ελληνικούς υπότιτλους."));return;}
    setManualBusy(true);setManualError("");
    try{
      const response=await fetch("/api/manual-captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url,title:video.title,originalTitle:video.originalTitle||"",channel:video.channel,duration:video.duration||0,subtitleText})});
      const result=await response.json() as Captions&{error?:string};
      if(!response.ok)throw new Error(result.error||tr("Δεν έγινε η εισαγωγή της μετάφρασης."));
      await done(result);
    }catch(problem){setManualError(problem instanceof Error?problem.message:tr("Δεν έγινε η εισαγωγή της μετάφρασης."));}
    finally{setManualBusy(false);}
  }
  return <Modal title="Manual Translate" close={close} busy={importing}>
    <div className="form manual-translate">
      <section className="manual-step">
        <div className="manual-step-head"><span className="manual-step-index">01</span><div className="manual-step-body"><strong>{tr("Λήψη αγγλικού SRT")}</strong><p>{tr("Σταθερή αρίθμηση, ακριβή timestamps από το timed transcript που χρησιμοποιεί η εφαρμογή.")}</p></div></div>
        <button type="button" className="primary" disabled={downloading} onClick={()=>void downloadSrt()}>{downloading?tr("Λήψη…"):tr("Λήψη αγγλικού transcript (.srt)")}</button>
      </section>
      {downloadError&&<p className="form-error" role="alert">{downloadError}</p>}
      <section className="manual-step muted">
        <div className="manual-step-head"><span className="manual-step-index">02</span><div className="manual-step-body"><strong>{tr("Μετάφραση στο ChatGPT")}</strong><p>{tr("Ανέβασε το .srt και ζήτησε ελληνική μετάφραση κρατώντας ακριβώς τον ίδιο αριθμό γραμμών και τα ίδια timestamps.")}</p></div></div>
      </section>
      <section className="manual-step">
        <div className="manual-step-head"><span className="manual-step-index">03</span><div className="manual-step-body"><strong>{tr("Εισαγωγή ελληνικού SRT")}</strong><p>{tr("Ελέγχουμε αριθμό cues, σειρά και timestamps πριν αποθηκευτεί οτιδήποτε. Αν κάτι δεν ταιριάζει, το υπάρχον transcript παραμένει όπως είναι.")}</p></div></div>
        <input ref={fileInput} type="file" accept=".srt,.vtt,text/plain" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void importFile(file);event.target.value="";}}/>
        <button type="button" className="primary" disabled={importing} onClick={()=>void chooseImportFile()}>{importing?tr("Εισαγωγή σε εξέλιξη"):tr("Εισαγωγή ελληνικού SRT")}</button>
        {importing&&importProgress&&<div className="manual-import-progress" role="status" aria-live="polite" aria-label={`${Math.round(importProgress.progress)}% — ${importProgress.label}`}>
          <div className="manual-import-progress-head"><strong>{importProgress.label}</strong><span>{Math.round(importProgress.progress)}%</span></div>
          <div className="manual-import-progress-track" aria-hidden="true"><i style={{width:`${Math.max(3,Math.min(100,importProgress.progress))}%`}}/></div>
          <div className="manual-import-progress-meta"><p>{importProgress.detail}</p>{importProgress.totalCues?<span>{(importProgress.currentCue||0).toLocaleString("el-GR")} / {importProgress.totalCues.toLocaleString("el-GR")} cues</span>:null}</div>
        </div>}
      </section>
      {importError&&<p className="form-error" role="alert">{importError}</p>}
      <button type="button" className="manual-fallback-toggle" onClick={()=>setShowFallback(value=>!value)}>{showFallback?tr("Απόκρυψη χειροκίνητης επικόλλησης"):tr("Εναλλακτικά επικόλλησε χειροκίνητα")}</button>
      {showFallback&&<div className="manual-fallback">
        <form onSubmit={submitManual}>
          <label>{tr("Ελληνικοί υπότιτλοι (χειροκίνητα)")}<textarea value={subtitleText} onChange={event=>{setSubtitleText(event.target.value);setManualError("")}} rows={10} spellCheck={false} placeholder={'1\n00:00:00,000 --> 00:00:03,400\nΗ ελληνική μετάφραση εδώ…\n\n2\n00:00:03,400 --> 00:00:07,100\nΗ επόμενη πρόταση…'}/></label>
          <small className="pro-format-note">{tr("Δέχεται SRT, VTT ή κείμενο με χρόνους. Ο έλεγχος αναγνωσιμότητας ισχύει και στη χειροκίνητη εισαγωγή.","Accepts SRT, VTT or timestamped text. Readability checks also apply to manual imports.")}</small>
          {manualError&&<p className="form-error" role="alert">{manualError}</p>}
          <div className="modal-actions"><button className="secondary" disabled={manualBusy}>{manualBusy?tr("Εισαγωγή…"):tr("Εισαγωγή (χειροκίνητα)")}</button></div>
        </form>
      </div>}
      <div className="modal-actions"><button type="button" className="secondary" disabled={importing} onClick={close}>{tr("Ακύρωση")}</button></div>
    </div>
  </Modal>;
}

function TranslationChoiceModal({video,close,backToLibrary,onQuick,onOpenManual}:{video:Video;close:()=>void;backToLibrary:()=>void;onQuick:()=>void;onOpenManual:()=>void}) {
  const [hasExisting,setHasExisting]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const [downloadError,setDownloadError]=useState("");
  useEffect(()=>{
    let active=true;
    fetch(`/api/captions?videoId=${encodeURIComponent(video.id)}`,{cache:"no-store"}).then(response=>{if(active)setHasExisting(response.status===200);}).catch(()=>{if(active)setHasExisting(false);});
    return()=>{active=false;};
  },[video.id]);
  async function downloadSrt(){
    setDownloading(true);setDownloadError("");
    try{
      const response=await fetch(`/api/captions/export-srt?videoId=${encodeURIComponent(video.id)}`,{cache:"no-store"});
      if(!response.ok){const failure=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(failure?.error||"Δεν ήταν δυνατή η λήψη του αγγλικού transcript.");}
      const text=await response.text();
      try{sessionStorage.setItem(`manual-source-srt:${video.id}`,text);}catch{}
      const blob=new Blob([text],{type:"application/x-subrip;charset=utf-8"});
      const link=document.createElement("a");
      link.href=URL.createObjectURL(blob);
      link.download=srtFilename(video);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }catch(problem){setDownloadError(problem instanceof Error?problem.message:"Δεν ήταν δυνατή η λήψη του αγγλικού transcript.");}
    finally{setDownloading(false);}
  }
  return <Modal title={tr("Νέα μετάφραση")} close={close}>
    <div className="form translation-choice">
      {hasExisting&&<div className="translation-choice-warning" role="status"><span aria-hidden="true">⚠</span><p>{tr("Υπάρχει ήδη ολοκληρωμένη ελληνική μεταγραφή για αυτό το βίντεο. Δεν θα αλλάξει τίποτα μέχρι να επικυρωθεί και να αποθηκευτεί επιτυχώς η νέα μετάφραση.")}</p></div>}
      <div className="translation-choice-grid">
        <section className="translation-choice-card quick">
          <span className="mode-icon"><AutoTranslateIcon/></span>
          <h3>Auto Translate</h3>
          <p>{tr("Αυτόματη μετάφραση με έλεγχο περιεχομένου και αναγνωσιμότητας. Ο συγχρονισμός με τον ήχο χρειάζεται ξεχωριστή επιβεβαίωση.","Automatic translation with content and readability checks. Audio timing requires separate verification.")}</p>
          <button type="button" className="primary" onClick={onQuick}>{tr("Ξεκίνα αυτόματη μετάφραση")}</button>
        </section>
        <section className="translation-choice-card manual">
          <span className="mode-icon"><ManualTranslateIcon/></span>
          <h3>Manual Translate</h3>
          <p>{tr("Χειροκίνητη μετάφραση υψηλής ποιότητας με πλήρες context: κατέβασε το αγγλικό SRT, μετάφρασέ το, εισάγαγε το ελληνικό SRT.")}</p>
          <div className="translation-choice-manual-actions">
            <button type="button" className="primary" disabled={downloading} onClick={()=>void downloadSrt()}>{downloading?tr("Λήψη…"):tr("Λήψη αγγλικού transcript (.srt)")}</button>
            <button type="button" className="secondary" onClick={onOpenManual}>{tr("Εισαγωγή ελληνικού SRT")}</button>
          </div>
        </section>
      </div>
      {downloadError&&<p className="form-error" role="alert">{downloadError}</p>}
      <div className="modal-actions translation-choice-actions"><button type="button" className="secondary" onClick={close}>{tr("Ακύρωση")}</button><button type="button" className="secondary" onClick={backToLibrary}>{tr("Επιστροφή στη βιβλιοθήκη")}</button></div>
    </div>
  </Modal>;
}

function AddVideo({close,add,existingIds}:{close:()=>void;add:(v:Video,t:boolean,openProImport?:boolean)=>Promise<void>;existingIds:string[]}) {
  const [url,setUrl]=useState("");
  const [metadata,setMetadata]=useState<{id:string;title:string;originalTitle?:string;channel:string;channelUrl?:string;originalVideoUrl?:string;duration?:number;description?:string;speakerName?:string;speakerRole?:string;category?:Category;tags?:string[];creatorChapters?:GuideItem[]}|null>(null);
  const [mode,setMode]=useState<"professional"|"manual-pro">("professional");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function inspect(){const id=extractId(url);if(!id){setError(tr("Βάλε έναν έγκυρο σύνδεσμο YouTube."));return;}if(existingIds.includes(id)){setError(tr("Αυτό το βίντεο υπάρχει ήδη στη βιβλιοθήκη."));return;}setBusy(true);setError("");try{const r=await fetch("/api/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});const j=await r.json();if(!r.ok)throw new Error(j.error);setMetadata(j);}catch(e){setError(e instanceof Error?e.message:tr("Σφάλμα"));}finally{setBusy(false);}}
  async function submit(e:React.MouseEvent<HTMLButtonElement>,action:"save"|"prepare"){e.preventDefault();const form=e.currentTarget.form;if(!form||busy)return;if(!metadata){await inspect();return;}setBusy(true);setError("");try{const fd=new FormData(form);const manualTags=String(fd.get("tags")||"").split(",").map(x=>x.trim()).filter(Boolean);const v:Video={id:metadata.id,url,title:metadata.title,originalTitle:metadata.originalTitle,channel:metadata.channel,channelUrl:metadata.channelUrl,originalVideoUrl:metadata.originalVideoUrl||url,speakerName:metadata.speakerName,speakerRole:metadata.speakerRole,category:String(fd.get("category")||metadata.category||"Other") as Category,tags:Array.from(new Set([...(metadata.tags||[]),...manualTags])),notes:String(fd.get("notes")||""),description:String(fd.get("notes")||metadata.description||tr("Νέο βίντεο στη βιβλιοθήκη.")),duration:metadata.duration||0,addedAt:new Date().toISOString(),favorite:false,lastPosition:0,progress:0,metadataVersion:6,creatorChapters:metadata.creatorChapters,translationMode:mode};if(action==="save")await add(v,false,false);else if(mode==="professional")await add(v,true,false);else await add(v,false,true);}catch(problem){setError(problem instanceof Error?problem.message:tr("Δεν αποθηκεύτηκε το βίντεο."));}finally{setBusy(false);}}
  return <Modal title={tr("Προσθήκη βίντεο")} close={close}><form className="form add-video-v740"><label>{tr("Σύνδεσμος YouTube")}<div className="inspect-row"><input value={url} onChange={e=>{setUrl(e.target.value);setMetadata(null);setError("")}} placeholder="https://youtube.com/watch?v=…"/><button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?tr("Έλεγχος…"):tr("Έλεγχος")}</button></div></label>{error&&<p className="form-error">{error}</p>}{metadata&&<div className="metadata"><img src={`https://i.ytimg.com/vi/${metadata.id}/hqdefault.jpg`} alt=""/><div><strong>{metadata.title}</strong>{metadata.originalTitle&&<small>{metadata.originalTitle}</small>}<span>{metadata.speakerName||metadata.channel}{metadata.speakerRole?` (${metadata.speakerRole})`:""} · {tr(CATEGORY_LABELS[metadata.category||"Other"])} · {metadata.duration?clock(metadata.duration):tr("Διάρκεια υπό υπολογισμό")}</span></div></div>}
    <section className="translation-mode-section"><div className="translation-mode-heading"><span>{tr("ΤΡΟΠΟΣ ΜΕΤΑΦΡΑΣΗΣ")}</span><small>{tr("Διάλεξε ταχύτητα ή μέγιστη ποιότητα.")}</small></div><div className="translation-mode-grid">
      <button type="button" className={`translation-mode-card ${mode==="professional"?"active":""}`} onClick={()=>setMode("professional")}><span className="mode-icon"><AutoTranslateIcon/></span><div><strong>Auto Translate</strong><small>{tr("Αυτόματη μετάφραση","Automatic translation")}</small><p>{tr("Μετάφραση με βάση το περιεχόμενο του βίντεο και έλεγχο πριν από τη δημοσίευση.","Translation informed by the video’s context with checks before publication.")}</p></div><i aria-hidden="true">{mode==="professional"?"✓":""}</i></button>
      <button type="button" className={`translation-mode-card manual ${mode==="manual-pro"?"active":""}`} onClick={()=>setMode("manual-pro")}><span className="mode-icon"><ManualTranslateIcon/></span><div><strong>Manual Translate</strong><small>ChatGPT</small><p>{tr("Κατεβάζεις το αγγλικό SRT, μεταφράζεις εξωτερικά, εισάγεις το ελληνικό SRT.")}</p></div><i aria-hidden="true">{mode==="manual-pro"?"✓":""}</i></button>
    </div></section>
    <div className="form-grid"><label>{tr("Κατηγορία")}<select name="category" key={metadata?.category||"Other"} defaultValue={metadata?.category||"Other"}>{CATEGORIES.slice(1).map(c=><option key={c} value={c}>{tr(CATEGORY_LABELS[c])}</option>)}</select></label><label>{tr("Ετικέτες")}<input name="tags" defaultValue={metadata?.tags?.join(", ")||""} placeholder={tr("υγεία, ινσουλίνη")}/></label></div><label>{tr("Προσωπικές σημειώσεις")}<textarea name="notes" placeholder={tr("Γιατί θέλω να κρατήσω αυτό το βίντεο…")}/></label><div className="modal-actions"><button className="secondary" disabled={busy} onClick={e=>void submit(e,"save")}>{tr("Αποθήκευση μόνο")}</button><button className="primary" disabled={busy} onClick={e=>void submit(e,"prepare")}>{busy?tr("Αποθήκευση…"):mode==="professional"?tr("Αποθήκευση και αυτόματη μετάφραση"):tr("Αποθήκευση και Manual Translate")}</button></div></form></Modal>;
}

function SettingsPage({settings,update,close}:{settings:Settings;update:(p:Partial<Settings>)=>void;close:()=>void}) {
  const blurAfterPointer=<T extends HTMLElement>(event:React.PointerEvent<T>)=>event.currentTarget.blur();
  const toggle=(key:keyof Settings,label:string)=><label className="setting-row"><span>{label}</span><input type="checkbox" checked={Boolean(settings[key])} onPointerUp={blurAfterPointer} onChange={e=>update({[key]:e.target.checked})}/></label>;
  const language=useAppLanguage();
  const transparency=Math.round((1-settings.opacity)*100);
  return <section className="settings-page"><header className="settings-page-header"><button type="button" className="settings-close" aria-label="Κλείσιμο ρυθμίσεων" onClick={close}>×</button><span>{tr("ΠΡΟΤΙΜΗΣΕΙΣ ΕΦΑΡΜΟΓΗΣ")}</span><h1>{tr("Ρυθμίσεις")}</h1><p>{tr("Οι αλλαγές αποθηκεύονται αυτόματα και εφαρμόζονται σε όλα τα βίντεο.")}</p></header><div className="settings-grid"><section className="subtitle-language-setting"><h2>{tr("Γλώσσα εφαρμογής")}</h2><label>{tr("Γλώσσα εφαρμογής")}<select value={language} onChange={e=>{const appLanguage=e.target.value as AppLanguage;setAppLanguage(appLanguage);update({appLanguage})}}><option value="el">{tr("Ελληνικά")}</option><option value="en">English</option></select></label><p>{tr("Η γλώσσα εφαρμογής δεν αλλάζει τη γλώσσα των υποτίτλων.")}</p></section><section><h2>{tr("Υπότιτλοι")}</h2><label>{tr("Προεπιλεγμένη γλώσσα")}<select value={settings.subtitleMode} onPointerUp={blurAfterPointer} onChange={e=>update({subtitleMode:e.target.value as Settings["subtitleMode"]})}><option value="el">{tr("Ελληνικά")}</option><option value="en">{tr("Αγγλικά")}</option><option value="dual">{tr("Διπλοί υπότιτλοι")}</option></select></label><label>{tr("Μέγεθος γραμματοσειράς")}<input type="range" min="13" max="28" value={settings.subtitleSize} onPointerUp={blurAfterPointer} onChange={e=>update({subtitleSize:+e.target.value,subtitleSizeVersion:2})}/><output>{settings.subtitleSize}{tr("px · αποθηκεύεται ως προεπιλογή")}</output></label><label>{tr("Θέση")}<select value={settings.subtitlePosition} onPointerUp={blurAfterPointer} onChange={e=>update({subtitlePosition:e.target.value as "top"|"bottom"})}><option value="bottom">{tr("Κάτω")}</option><option value="top">{tr("Πάνω")}</option></select></label><label>{tr("Διαφάνεια φόντου")}<input type="range" min="0" max="100" step="10" value={transparency} onPointerUp={blurAfterPointer} onChange={e=>update({opacity:1-(+e.target.value/100)})}/><output>{transparency}{tr("% διαφάνεια")}</output></label><label>{tr("Καθυστέρηση υποτίτλων")}<input type="range" min="-5" max="5" step=".1" value={settings.delay} onPointerUp={blurAfterPointer} onChange={e=>update({delay:+e.target.value})}/><output>{settings.delay}s</output></label>{toggle("subtitles",tr("Εμφάνιση υποτίτλων"))}{toggle("autoScroll",tr("Αυτόματη κύλιση μεταγραφής"))}{toggle("highlight",tr("Επισήμανση ενεργής γραμμής"))}</section><section><h2>{tr("Αναπαραγωγή")}</h2>{toggle("autoplay",tr("Αυτόματη αναπαραγωγή"))}<label>{tr("Προεπιλεγμένη ταχύτητα")}<select value={settings.speed} onPointerUp={blurAfterPointer} onChange={e=>update({speed:+e.target.value})}>{PLAYBACK_SPEEDS.map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label>{toggle("autoTranslate",tr("Αυτόματη μετάφραση"))}{toggle("autoCategory",tr("Αυτόματη κατηγοριοποίηση"))}{toggle("continueWatching",tr("Συνέχιση προβολής"))}</section><section><h2>{tr("Εμφάνιση")}</h2><label>{tr("Διάταξη βιβλιοθήκης")}<select value={settings.layout} onPointerUp={blurAfterPointer} onChange={e=>update({layout:e.target.value as "grid"|"list"})}><option value="grid">{tr("Πλέγμα")}</option><option value="list">{tr("Λίστα")}</option></select></label><label>{tr("Θέμα")}<select value={settings.theme} onPointerUp={blurAfterPointer} onChange={e=>update({theme:e.target.value as Settings["theme"]})}><option value="dark">{tr("Σκούρο")}</option><option value="light">{tr("Φωτεινό")}</option><option value="system">{tr("Σύστημα")}</option></select></label>{toggle("compact",tr("Συμπαγείς κάρτες"))}{toggle("descriptions",tr("Εμφάνιση περιγραφών"))}</section></div><footer className="gts33-settings-footer"><small>{tr("Οι αλλαγές έχουν αποθηκευτεί.")}</small><button type="button" onClick={close}>{tr("Κλείσιμο ρυθμίσεων")}</button></footer></section>;
}

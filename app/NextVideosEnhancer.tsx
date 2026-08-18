"use client";

import {useEffect} from "react";
import {watchAppNavigation} from "./navigation-events";

type VideoItem={
  id?:unknown;
  title?:unknown;
  channel?:unknown;
  addedAt?:unknown;
  progress?:unknown;
  lastPosition?:unknown;
  lastWatched?:unknown;
};
type AppState={videos?:VideoItem[]};

const PERSONAL_CACHE_KEY="greektube-personal-state:v1";

function safeText(value:unknown){return typeof value==="string"?value.trim():"";}
function numeric(value:unknown){const number=Number(value||0);return Number.isFinite(number)?number:0;}
function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function readPersonalVideos():Map<string,VideoItem>{
  try{
    const raw=localStorage.getItem(PERSONAL_CACHE_KEY);
    if(!raw)return new Map<string,VideoItem>();
    const parsed=JSON.parse(raw) as AppState;
    const entries:Array<[string,VideoItem]>=(parsed.videos||[])
      .map(video=>[safeText(video.id),video] as [string,VideoItem])
      .filter(([id])=>Boolean(id));
    return new Map<string,VideoItem>(entries);
  }catch{return new Map<string,VideoItem>();}
}
function isWatched(video:VideoItem){
  return Boolean(safeText(video.lastWatched))||numeric(video.progress)>.5||numeric(video.lastPosition)>=5;
}
function thumb(videoId:string){return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;}

export default function NextVideosEnhancer(){
  useEffect(()=>{
    let sharedVideos:VideoItem[]=[];
    let raf=0;
    let cancelled=false;

    const schedule=()=>{if(!raf)raf=window.requestAnimationFrame(decorate);};

    const loadLibrary=async()=>{
      try{
        const response=await fetch("/api/state",{credentials:"same-origin",cache:"no-store"});
        if(!response.ok)return;
        const result=await response.json() as {state?:AppState};
        if(cancelled)return;
        sharedVideos=Array.isArray(result.state?.videos)?result.state!.videos!:[];
        schedule();
      }catch{}
    };

    const openVideo=(id:string)=>{
      const originalButtons=Array.from(document.querySelectorAll<HTMLButtonElement>(".next-videos .next-video-row > button"));
      const original=originalButtons.find(button=>button.querySelector<HTMLImageElement>("img")?.src.includes(`/vi/${id}/`));
      if(original){original.click();return;}
      location.assign(`/?video=${encodeURIComponent(id)}`);
    };

    const showLibrary=()=>{
      const home=document.querySelector<HTMLButtonElement>(".brand-home");
      if(home){home.click();window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"smooth"}));return;}
      location.assign("/");
    };

    function decorate(){
      raf=0;
      const selectedId=currentVideoId();
      const watchMain=document.querySelector<HTMLElement>(".watch-main");
      const existing=document.querySelector<HTMLElement>(".gts-next-videos");
      if(!selectedId||!watchMain){existing?.remove();return;}

      const personal=readPersonalVideos();
      const merged=sharedVideos.map(video=>{
        const id=safeText(video.id);
        return {...video,...(personal.get(id)||{})};
      });
      const candidates=merged
        .filter(video=>{
          const id=safeText(video.id);
          return /^[A-Za-z0-9_-]{11}$/.test(id)&&id!==selectedId&&!isWatched(video);
        })
        .sort((a,b)=>safeText(b.addedAt).localeCompare(safeText(a.addedAt)))
        .slice(0,5);

      if(!candidates.length){existing?.remove();return;}

      const section=existing||document.createElement("section");
      section.className="gts-next-videos";
      section.setAttribute("aria-label","Επόμενα βίντεο");
      section.innerHTML="";

      const header=document.createElement("div");
      header.className="gts-next-header";
      const titleWrap=document.createElement("div");
      const title=document.createElement("h2");
      title.textContent="Επόμενα βίντεο";
      const count=document.createElement("small");
      count.textContent=String(candidates.length);
      titleWrap.append(title,count);
      const more=document.createElement("button");
      more.type="button";
      more.className="gts-next-more";
      more.innerHTML="More <span aria-hidden=\"true\">&gt;&gt;</span>";
      more.addEventListener("click",showLibrary);
      header.append(titleWrap,more);

      const list=document.createElement("div");
      list.className="gts-next-list";
      candidates.forEach(video=>{
        const id=safeText(video.id);
        const button=document.createElement("button");
        button.type="button";
        button.className="gts-next-item";
        button.setAttribute("aria-label",`Άνοιγμα: ${safeText(video.title)||"Επόμενο βίντεο"}`);
        button.addEventListener("click",()=>openVideo(id));
        const image=document.createElement("img");
        image.src=thumb(id);image.alt="";image.loading="lazy";
        const copy=document.createElement("span");
        const strong=document.createElement("strong");
        strong.textContent=safeText(video.title)||"Βίντεο";
        const channel=document.createElement("small");
        channel.textContent=safeText(video.channel);
        copy.append(strong,channel);
        button.append(image,copy);
        list.appendChild(button);
      });

      section.append(header,list);
      if(!existing)watchMain.appendChild(section);
    }

    void loadLibrary();
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    const stopNavigation=watchAppNavigation(()=>{void loadLibrary();schedule();});
    const storage=(event:StorageEvent)=>{if(event.key===PERSONAL_CACHE_KEY)schedule();};
    window.addEventListener("storage",storage);

    return()=>{
      cancelled=true;
      observer.disconnect();
      stopNavigation();
      window.removeEventListener("storage",storage);
      if(raf)window.cancelAnimationFrame(raf);
      document.querySelector<HTMLElement>(".gts-next-videos")?.remove();
    };
  },[]);

  return <style>{`
    .viewer .next-videos { display:none !important; }
    .gts-next-videos {
      margin-top:30px;
      padding-top:3px;
    }
    .gts-next-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:18px;
      margin-bottom:12px;
    }
    .gts-next-header > div {
      display:flex;
      align-items:center;
      gap:9px;
      min-width:0;
    }
    .gts-next-header h2 {
      margin:0;
      color:var(--text);
      font-size:15px;
      font-weight:680;
      letter-spacing:-.025em;
    }
    .gts-next-header small {
      min-width:20px;
      height:20px;
      display:grid;
      place-items:center;
      padding:0 6px;
      border-radius:999px;
      background:rgba(255,255,255,.055);
      color:var(--soft);
      font-size:9px;
      font-weight:650;
    }
    .gts-next-more {
      min-height:30px;
      padding:0 2px 0 10px;
      border:0;
      background:transparent;
      color:#8f86dc;
      font-size:10px;
      font-weight:620;
      letter-spacing:.01em;
      cursor:pointer;
    }
    .gts-next-more span { margin-left:3px; font-size:9px; }
    .gts-next-more:hover { color:#b5adf6; }
    .gts-next-list {
      display:grid;
      gap:8px;
    }
    .gts-next-item {
      width:100%;
      min-width:0;
      display:grid;
      grid-template-columns:116px minmax(0,1fr);
      gap:13px;
      align-items:center;
      padding:9px;
      border:1px solid var(--line);
      border-radius:13px;
      background:var(--raised);
      color:var(--text);
      text-align:left;
      cursor:pointer;
      transition:border-color .15s ease,background .15s ease,transform .15s ease;
    }
    .gts-next-item:hover {
      transform:translateY(-1px);
      border-color:rgba(143,127,240,.28);
      background:rgba(143,127,240,.045);
    }
    .gts-next-item img {
      width:116px;
      aspect-ratio:16/9;
      display:block;
      object-fit:cover;
      border-radius:9px;
      background:#080a0e;
    }
    .gts-next-item > span { min-width:0; }
    .gts-next-item strong {
      display:-webkit-box;
      overflow:hidden;
      -webkit-box-orient:vertical;
      -webkit-line-clamp:2;
      color:var(--text);
      font-size:12px;
      font-weight:590;
      line-height:1.34;
      letter-spacing:-.015em;
    }
    .gts-next-item small {
      display:block;
      margin-top:5px;
      overflow:hidden;
      color:var(--soft);
      font-size:9.5px;
      line-height:1.2;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    @media (min-width:900px) {
      .gts-next-list {
        grid-template-columns:repeat(5,minmax(0,1fr));
        gap:9px;
      }
      .gts-next-item {
        grid-template-columns:1fr;
        align-content:start;
        gap:8px;
        padding:8px;
      }
      .gts-next-item img { width:100%; border-radius:8px; }
      .gts-next-item strong { font-size:10.5px; line-height:1.35; }
      .gts-next-item small { font-size:8.5px; }
    }
    @media (max-width:700px) {
      .gts-next-videos { margin-top:26px; }
      .gts-next-header { margin-bottom:10px; }
      .gts-next-header h2 { font-size:14px; }
      .gts-next-more { font-size:10px; }
      .gts-next-item {
        grid-template-columns:112px minmax(0,1fr);
        gap:11px;
        padding:8px;
        border-radius:12px;
      }
      .gts-next-item img { width:112px; }
      .gts-next-item strong { font-size:11.5px; }
      .gts-next-item small { font-size:9px; }
    }
  `}</style>;
}

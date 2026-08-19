"use client";

import {useEffect} from "react";
import {watchAppNavigation} from "./navigation-events";

type PersonalVideo={id?:unknown;progress?:unknown;lastPosition?:unknown;lastWatched?:unknown};
type PersonalState={videos?:PersonalVideo[]};

const PERSONAL_CACHE_KEY="greektube-personal-state:v1";
const MANUAL_SCROLL_HOLD_MS=12000;

function readPersonalState():PersonalState|null{
  try{const raw=localStorage.getItem(PERSONAL_CACHE_KEY);return raw?JSON.parse(raw) as PersonalState:null;}catch{return null;}
}
function watchedVideoIds(){
  const state=readPersonalState();
  return new Set((state?.videos||[]).filter(video=>{
    const progress=Number(video.progress||0),lastPosition=Number(video.lastPosition||0);
    return typeof video.lastWatched==="string"||progress>.5||lastPosition>=5;
  }).map(video=>String(video.id||"")).filter(Boolean));
}
function videoIdFromNextButton(button:HTMLButtonElement){
  return button.querySelector<HTMLImageElement>("img")?.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//)?.[1]||"";
}

export default function MobileUXFixesEnhancer(){
  useEffect(()=>{
    let manualScrollUntil=0;
    let transcriptScrollTo:typeof HTMLElement.prototype.scrollTo|null=null;
    let decoratedTranscript:HTMLElement|null=null;
    let raf=0;

    const decorateTranscript=()=>{
      const transcript=document.querySelector<HTMLElement>(".transcript-drawer .transcript");
      if(!transcript||transcript===decoratedTranscript)return;
      decoratedTranscript=transcript;
      transcript.dataset.manualScroll="0";
      transcriptScrollTo=transcript.scrollTo.bind(transcript);
      const holdManualScroll=()=>{manualScrollUntil=Date.now()+MANUAL_SCROLL_HOLD_MS;transcript.dataset.manualScroll="1";};
      const releaseWhenIdle=()=>{
        const remaining=manualScrollUntil-Date.now();
        if(remaining>0){window.setTimeout(releaseWhenIdle,Math.min(remaining+80,1000));return;}
        transcript.dataset.manualScroll="0";
      };
      transcript.addEventListener("touchstart",holdManualScroll,{passive:true});
      transcript.addEventListener("touchmove",holdManualScroll,{passive:true});
      transcript.addEventListener("pointerdown",holdManualScroll,{passive:true});
      transcript.addEventListener("wheel",holdManualScroll,{passive:true});
      transcript.addEventListener("scroll",()=>{if(Date.now()<manualScrollUntil)releaseWhenIdle();},{passive:true});
      transcript.scrollTo=((...args:Parameters<typeof transcript.scrollTo>)=>{if(Date.now()<manualScrollUntil)return;transcriptScrollTo?.(...args);}) as typeof transcript.scrollTo;
    };

    const markNextVideos=()=>{
      const section=document.querySelector<HTMLElement>(".next-videos");if(!section)return;
      const watched=watchedVideoIds();const buttons=Array.from(section.querySelectorAll<HTMLButtonElement>(".next-video-row > button"));let visible=0;
      buttons.forEach(button=>{
        const id=videoIdFromNextButton(button),isWatched=Boolean(id&&watched.has(id));
        button.dataset.gtsWatched=isWatched?"1":"0";
        if(!isWatched)visible+=1;
      });
      section.dataset.gtsVisibleCount=String(visible);
      const count=section.querySelector<HTMLElement>(".section-title small");if(count)count.dataset.gtsCount=String(visible);
    };

    const decorate=()=>{raf=0;decorateTranscript();markNextVideos();};
    const schedule=()=>{if(!raf)raf=window.requestAnimationFrame(decorate);};
    schedule();
    const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
    const stopNavigationWatch=watchAppNavigation(schedule);
    const storage=(event:StorageEvent)=>{if(event.key===PERSONAL_CACHE_KEY)schedule();};
    window.addEventListener("storage",storage);
    return()=>{
      observer.disconnect();stopNavigationWatch();window.removeEventListener("storage",storage);
      if(raf)window.cancelAnimationFrame(raf);
      if(decoratedTranscript&&transcriptScrollTo)decoratedTranscript.scrollTo=transcriptScrollTo;
    };
  },[]);

  return <style>{`
    .transcript-drawer .transcript{-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;overscroll-behavior-y:contain!important;overflow-y:auto!important}
    .next-video-row>button[data-gts-watched="1"]{display:none!important}
    .next-videos[data-gts-visible-count="0"]{display:none!important}
    .next-videos .section-title small[data-gts-count]{font-size:0!important}
    .next-videos .section-title small[data-gts-count]::after{content:attr(data-gts-count);font-size:9px!important}
    .gts31-transcript-button>span{font-size:0!important}
    .gts31-transcript-button>span::after{content:"Κείμενο";font-size:10.5px!important}

    .video-frame.pseudo-fullscreen{position:fixed!important;inset:0!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:100vw!important;max-width:none!important;height:100vh!important;height:100dvh!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;transform:none!important;z-index:2147483000!important}
    .sticky-player:has(.video-frame.pseudo-fullscreen),.watch-main:has(.video-frame.pseudo-fullscreen),.watch-layout:has(.video-frame.pseudo-fullscreen),.app-shell.viewer:has(.video-frame.pseudo-fullscreen){overflow:visible!important;transform:none!important;filter:none!important;contain:none!important;clip-path:none!important}
    .sticky-player:has(.video-frame.pseudo-fullscreen){border:0!important;border-radius:0!important}
    .video-frame.pseudo-fullscreen>div:first-child,.video-frame.pseudo-fullscreen iframe{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;border-radius:0!important}

    @media(max-width:700px){
      .gts31-controls-row-2{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;width:100%!important}
      .gts31-controls-row-2>*{min-width:0!important;width:100%!important}
      .gts31-controls-row-2 .gts31-segment{min-width:0!important;width:100%!important;padding-inline:5px!important}
      .gts31-controls-row-2 .gts31-segment>span{display:block!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:10.5px!important}
      .gts31-transcript-button>span::after{font-size:10.5px!important}
    }
  `}</style>;
}

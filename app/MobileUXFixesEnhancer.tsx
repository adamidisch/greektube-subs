"use client";

import {useEffect} from "react";
import {watchAppNavigation} from "./navigation-events";

type PersonalVideo={id?:unknown;progress?:unknown;lastPosition?:unknown;lastWatched?:unknown};
type PersonalState={videos?:PersonalVideo[]};
type WebkitFullscreenDocument=Document&{webkitFullscreenElement?:Element|null};
type WebkitFullscreenElement=HTMLElement&{webkitRequestFullscreen?:()=>Promise<void>|void};

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
    let fullscreenFallbackBypass=false;
    let fullscreenProbeTimer=0;

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

    const syncVisualViewport=()=>{
      const viewport=window.visualViewport;
      const root=document.documentElement;
      root.style.setProperty("--gts-visual-width",`${viewport?.width||window.innerWidth}px`);
      root.style.setProperty("--gts-visual-height",`${viewport?.height||window.innerHeight}px`);
    };

    const replayReactFullscreen=(button:HTMLButtonElement)=>{
      fullscreenFallbackBypass=true;
      try{button.click();}finally{fullscreenFallbackBypass=false;}
    };

    const preferNativeAppleFullscreen=(event:MouseEvent)=>{
      if(fullscreenFallbackBypass)return;
      const appleTouch=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
      if(!appleTouch)return;
      const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>(".gts31-fullscreen"):null;
      if(!button)return;
      const fullscreenDocument=document as WebkitFullscreenDocument;
      if(document.fullscreenElement||fullscreenDocument.webkitFullscreenElement)return;
      const frame=document.querySelector<WebkitFullscreenElement>(".video-frame");
      if(!frame)return;
      const request=frame.requestFullscreen
        ?()=>frame.requestFullscreen()
        :frame.webkitRequestFullscreen
          ?()=>frame.webkitRequestFullscreen?.()
          :null;
      if(!request)return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      syncVisualViewport();

      Promise.resolve(request()).then(()=>{
        window.clearTimeout(fullscreenProbeTimer);
        fullscreenProbeTimer=window.setTimeout(()=>{
          const currentDocument=document as WebkitFullscreenDocument;
          if(!document.fullscreenElement&&!currentDocument.webkitFullscreenElement)replayReactFullscreen(button);
        },450);
      }).catch(()=>replayReactFullscreen(button));
    };

    const decorate=()=>{raf=0;decorateTranscript();markNextVideos();syncVisualViewport();};
    const schedule=()=>{if(!raf)raf=window.requestAnimationFrame(decorate);};
    schedule();
    const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
    const stopNavigationWatch=watchAppNavigation(schedule);
    const storage=(event:StorageEvent)=>{if(event.key===PERSONAL_CACHE_KEY)schedule();};
    window.addEventListener("storage",storage);
    window.addEventListener("resize",syncVisualViewport,{passive:true});
    window.addEventListener("orientationchange",syncVisualViewport,{passive:true});
    window.visualViewport?.addEventListener("resize",syncVisualViewport,{passive:true});
    window.visualViewport?.addEventListener("scroll",syncVisualViewport,{passive:true});
    document.addEventListener("click",preferNativeAppleFullscreen,true);
    return()=>{
      observer.disconnect();stopNavigationWatch();window.removeEventListener("storage",storage);
      window.removeEventListener("resize",syncVisualViewport);
      window.removeEventListener("orientationchange",syncVisualViewport);
      window.visualViewport?.removeEventListener("resize",syncVisualViewport);
      window.visualViewport?.removeEventListener("scroll",syncVisualViewport);
      document.removeEventListener("click",preferNativeAppleFullscreen,true);
      window.clearTimeout(fullscreenProbeTimer);
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

    /* v7.9.0 — subtitles float over the image without a card/frame. */
    .viewer .video-frame .subtitles,
    .viewer .video-frame:fullscreen .subtitles,
    .viewer .video-frame:-webkit-full-screen .subtitles,
    .viewer .video-frame.pseudo-fullscreen .subtitles{
      padding:2px 4px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
      text-shadow:0 1px 2px rgba(0,0,0,.96),0 2px 8px rgba(0,0,0,.92),0 0 2px rgba(0,0,0,.9)!important;
    }

    /* Native fullscreen is preferred on current Safari. This remains the fallback
       for browsers that still reject arbitrary-element fullscreen. */
    .video-frame.pseudo-fullscreen{
      position:fixed!important;inset:0!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;
      width:var(--gts-visual-width,100vw)!important;max-width:none!important;
      height:var(--gts-visual-height,100dvh)!important;max-height:none!important;
      margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;
      aspect-ratio:auto!important;transform:none!important;z-index:2147483000!important;background:#000!important;
    }
    .video-frame:fullscreen,.video-frame:-webkit-full-screen{
      width:100vw!important;max-width:none!important;height:100vh!important;height:100dvh!important;max-height:none!important;
      margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;
      aspect-ratio:auto!important;background:#000!important;
    }
    .sticky-player:has(.video-frame.pseudo-fullscreen),.watch-main:has(.video-frame.pseudo-fullscreen),.watch-layout:has(.video-frame.pseudo-fullscreen),.app-shell.viewer:has(.video-frame.pseudo-fullscreen){overflow:visible!important;transform:none!important;filter:none!important;contain:none!important;clip-path:none!important}
    .sticky-player:has(.video-frame.pseudo-fullscreen){border:0!important;border-radius:0!important}
    .video-frame.pseudo-fullscreen>div:first-child,.video-frame.pseudo-fullscreen iframe,
    .video-frame:fullscreen>div:first-child,.video-frame:fullscreen iframe,
    .video-frame:-webkit-full-screen>div:first-child,.video-frame:-webkit-full-screen iframe{
      position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;border:0!important;border-radius:0!important;
    }

    @media(max-width:700px){
      /* Compact viewer chrome: around 10% less visual bulk while keeping controls clear. */
      html body .viewer.viewer.viewer.app-shell{max-width:440px!important;padding-inline:8px!important}
      html body .viewer.viewer.viewer .watch-layout{padding-top:3px!important}
      html body .viewer.viewer.viewer .sticky-player{gap:4px!important}

      html body .viewer.viewer.viewer .gts31-owner{
        min-height:51px!important;grid-template-columns:3px minmax(0,1fr) auto!important;gap:8px!important;padding:0 1px 8px!important;
      }
      html body .viewer.viewer.viewer .gts31-owner-marker{height:20px!important}
      html body .viewer.viewer.viewer .gts31-owner-copy>strong{font-size:13px!important;line-height:1.2!important}
      html body .viewer.viewer.viewer .gts31-owner-copy>small{font-size:11.5px!important;line-height:1.2!important}
      html body .viewer.viewer.viewer .gts31-owner-actions{gap:6px!important}
      html body .viewer.viewer.viewer .gts31-owner-actions>button{
        width:40px!important;min-width:40px!important;height:40px!important;min-height:40px!important;border-radius:11px!important;
      }
      html body .viewer.viewer.viewer .gts31-owner-actions>button>svg{width:15.5px!important;height:15.5px!important}

      html body .viewer.viewer.viewer .gts31-controls{
        margin-bottom:9px!important;padding:8px!important;border-radius:14px!important;
      }
      html body .viewer.viewer.viewer .gts31-controls-row-1{
        height:76px!important;gap:10px!important;padding:4px 4px 10px!important;
      }
      html body .viewer.viewer.viewer .gts31-play-cluster{
        width:152px!important;height:59px!important;gap:6px!important;padding:5px 4px!important;border-radius:16px!important;
      }
      html body .viewer.viewer.viewer .gts31-settings-cluster{
        width:116px!important;height:49px!important;gap:5px!important;padding:4px!important;border-radius:16px!important;
      }
      html body .viewer.viewer.viewer .gts31-control{
        width:40px!important;min-width:40px!important;height:40px!important;min-height:40px!important;flex-basis:40px!important;border-radius:11px!important;
      }
      html body .viewer.viewer.viewer .gts31-skip>svg{width:18px!important;height:18px!important}
      html body .viewer.viewer.viewer .gts31-skip>small{right:3px!important;bottom:2px!important;font-size:11.5px!important}
      html body .viewer.viewer.viewer .gts31-play-cluster .gts31-play{
        width:49px!important;min-width:49px!important;height:49px!important;min-height:49px!important;flex-basis:49px!important;border-radius:14px!important;
      }
      html body .viewer.viewer.viewer .gts31-play-cluster .gts31-play svg{width:15px!important;height:15px!important}
      html body .viewer.viewer.viewer .gts31-speed{
        width:62px!important;min-width:62px!important;height:40px!important;flex-basis:62px!important;border-radius:11px!important;
      }
      html body .viewer.viewer.viewer .gts31-speed>select{height:40px!important;border-radius:11px!important;font-size:12px!important}
      html body .viewer.viewer.viewer .gts31-volume{width:40px!important;height:40px!important;flex-basis:40px!important}
      html body .viewer.viewer.viewer .gts31-volume-toggle>svg{width:15.5px!important;height:15.5px!important}

      html body .viewer.viewer.viewer .gts31-controls-row-2{
        display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:5px!important;width:100%!important;min-height:60px!important;padding-top:8px!important;
      }
      html body .viewer.viewer.viewer .gts31-controls-row-2>*{min-width:0!important;width:100%!important}
      html body .viewer.viewer.viewer .gts31-controls-row-2 .gts31-segment{
        min-width:0!important;width:100%!important;min-height:50px!important;gap:3px!important;padding:7px 3px!important;border-radius:10px!important;
      }
      html body .viewer.viewer.viewer .gts31-controls-row-2 .gts31-segment>svg{width:15px!important;height:15px!important;flex-basis:15px!important}
      html body .viewer.viewer.viewer .gts31-controls-row-2 .gts31-segment>span{display:block!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:11.5px!important;line-height:1.05!important}
      .gts31-transcript-button>span::after{font-size:11.5px!important}

      html body .viewer.viewer.viewer .watch-layout.watch-layout .video-frame:not(.pseudo-fullscreen){
        border-radius:17px!important;
      }
    }

    @media(orientation:landscape) and (max-height:620px){
      .video-frame.pseudo-fullscreen{
        width:var(--gts-visual-width,100vw)!important;height:var(--gts-visual-height,100dvh)!important;
      }
      .video-frame.pseudo-fullscreen .custom-fullscreen,
      .video-frame:fullscreen .custom-fullscreen,
      .video-frame:-webkit-full-screen .custom-fullscreen{
        right:max(12px,env(safe-area-inset-right))!important;
      }
    }
  `}</style>;
}

"use client";
import {useEffect} from "react";
import {watchAppNavigation} from "./navigation-events";

const HIDE_DELAY=2200;

export default function FullscreenExitEnhancer(){
  useEffect(()=>{
    let hideTimer:ReturnType<typeof setTimeout>|null=null;
    let forwardingTouchClick=false;
    let suppressGeneratedClickUntil=0;

    const fullscreenDocument=document as Document&{webkitFullscreenElement?:Element};

    const activeFrame=()=>{
      const native=(document.fullscreenElement||fullscreenDocument.webkitFullscreenElement) as HTMLElement|null;
      if(native?.classList.contains("video-frame"))return native;
      return document.querySelector<HTMLElement>(".video-frame.pseudo-fullscreen");
    };

    const clearHideTimer=()=>{
      if(hideTimer){clearTimeout(hideTimer);hideTimer=null;}
    };

    const hideRestore=()=>{
      const frame=activeFrame();
      if(frame)frame.dataset.gtsFsExitHidden="1";
    };

    const scheduleHide=()=>{
      clearHideTimer();
      const frame=activeFrame();
      if(!frame)return;
      hideTimer=setTimeout(hideRestore,HIDE_DELAY);
    };

    const revealRestore=()=>{
      const frame=activeFrame();
      if(!frame){clearHideTimer();return;}
      delete frame.dataset.gtsFsExitHidden;
      scheduleHide();
    };

    const syncFullscreenUi=()=>{
      const frame=activeFrame();
      if(!frame){clearHideTimer();return;}
      delete frame.dataset.gtsFsExitHidden;
      scheduleHide();
    };

    const handleInteraction=(event:Event)=>{
      const frame=activeFrame();
      if(!frame)return;
      const target=event.target as Element|null;
      if(target?.closest(".custom-fullscreen"))return;
      revealRestore();
    };

    // iOS/Safari can fire touchend and then a synthetic click. Forward one
    // click and suppress the generated duplicate so fullscreen cannot toggle twice.
    const handleTouchEnd=(event:TouchEvent)=>{
      const target=event.target as Element|null;
      const button=target?.closest<HTMLButtonElement>(".custom-fullscreen");
      if(!button)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressGeneratedClickUntil=Date.now()+900;
      forwardingTouchClick=true;
      button.click();
      forwardingTouchClick=false;
      clearHideTimer();
    };

    const handleClickCapture=(event:MouseEvent)=>{
      const target=event.target as Element|null;
      if(!target?.closest(".custom-fullscreen"))return;
      if(forwardingTouchClick)return;
      if(Date.now()<suppressGeneratedClickUntil){
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    document.addEventListener("touchend",handleTouchEnd,{capture:true,passive:false});
    document.addEventListener("click",handleClickCapture,true);
    document.addEventListener("fullscreenchange",syncFullscreenUi);
    document.addEventListener("webkitfullscreenchange",syncFullscreenUi as EventListener);
    document.addEventListener("pointerdown",handleInteraction,true);
    document.addEventListener("pointermove",handleInteraction,true);
    document.addEventListener("touchstart",handleInteraction,{capture:true,passive:true});

    let observedFrame:HTMLElement|null=null;
    let frameObserver:MutationObserver|null=null;
    const attachFrameObserver=()=>{
      const next=document.querySelector<HTMLElement>(".video-frame");
      if(next===observedFrame)return;
      frameObserver?.disconnect();
      frameObserver=null;
      observedFrame=next;
      if(next){
        frameObserver=new MutationObserver(syncFullscreenUi);
        frameObserver.observe(next,{attributes:true,attributeFilter:["class"]});
      }
      syncFullscreenUi();
    };

    const lifecycleRoot=document.querySelector(".app-shell")||document.body;
    const lifecycleObserver=new MutationObserver(attachFrameObserver);
    lifecycleObserver.observe(lifecycleRoot,{subtree:true,childList:true});
    attachFrameObserver();
    const stopWatching=watchAppNavigation(()=>window.requestAnimationFrame(attachFrameObserver));

    return()=>{
      clearHideTimer();
      frameObserver?.disconnect();
      lifecycleObserver.disconnect();
      stopWatching();
      document.removeEventListener("touchend",handleTouchEnd,true);
      document.removeEventListener("click",handleClickCapture,true);
      document.removeEventListener("fullscreenchange",syncFullscreenUi);
      document.removeEventListener("webkitfullscreenchange",syncFullscreenUi as EventListener);
      document.removeEventListener("pointerdown",handleInteraction,true);
      document.removeEventListener("pointermove",handleInteraction,true);
      document.removeEventListener("touchstart",handleInteraction,true);
    };
  },[]);

  return <style jsx global>{`
    .video-frame.pseudo-fullscreen .custom-fullscreen,
    .video-frame:fullscreen .custom-fullscreen{
      opacity:1!important;
      pointer-events:auto!important;
      z-index:100!important;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
      transition:opacity .16s ease!important;
    }
    .video-frame.pseudo-fullscreen[data-gts-fs-exit-hidden="1"] .custom-fullscreen,
    .video-frame:fullscreen[data-gts-fs-exit-hidden="1"] .custom-fullscreen{
      opacity:0!important;
      pointer-events:none!important;
    }
  `}</style>;
}

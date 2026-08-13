"use client";
import {useEffect} from "react";

export default function FullscreenExitEnhancer(){
  useEffect(()=>{
    const handleTouchEnd=(event:TouchEvent)=>{
      const element=event.target as Element|null;
      if(element?.closest(".custom-fullscreen"))event.stopPropagation();
    };
    document.addEventListener("touchend",handleTouchEnd,true);
    return()=>document.removeEventListener("touchend",handleTouchEnd,true);
  },[]);

  return <style jsx global>{`
    .video-frame.pseudo-fullscreen .custom-fullscreen.fs-exit-hidden,
    .video-frame:fullscreen .custom-fullscreen.fs-exit-hidden{
      opacity:0!important;
      pointer-events:none!important;
    }
    .video-frame.pseudo-fullscreen .custom-fullscreen,
    .video-frame:fullscreen .custom-fullscreen{
      z-index:40!important;
      touch-action:manipulation;
    }
  `}</style>;
}

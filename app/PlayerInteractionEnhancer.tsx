"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";

function fullscreenButton(){
  return document.querySelector<HTMLButtonElement>(".fullscreen-primary");
}

function triggerFullscreen(){
  const button=fullscreenButton();
  if(!button)return;
  button.click();
}

function isFullscreenFrame(frame:HTMLElement|null){
  if(!frame)return false;
  const webkitDocument=document as Document&{webkitFullscreenElement?:Element};
  return frame.classList.contains("pseudo-fullscreen")||document.fullscreenElement===frame||webkitDocument.webkitFullscreenElement===frame;
}

export default function PlayerInteractionEnhancer(){
  const [frame,setFrame]=useState<HTMLElement|null>(null);
  const [fullscreen,setFullscreen]=useState(false);

  useEffect(()=>{
    let suppressFloatingClickUntil=0;

    const sync=()=>{
      const next=document.querySelector<HTMLElement>(".video-frame");
      setFrame(current=>current===next?current:next);
      setFullscreen(isFullscreenFrame(next));
    };

    const handleDoubleClick=(event:MouseEvent)=>{
      const target=event.target as Element|null;
      if(!target)return;
      if(target.closest(".player-seek-ui,.custom-fullscreen,.gts-seek-fullscreen,.player-cover,.subtitles,button:not(.video-tap-toggle),input,select,a"))return;
      if(!target.closest(".video-frame"))return;
      event.preventDefault();
      event.stopPropagation();
      triggerFullscreen();
    };

    const handleFloatingTouch=(event:TouchEvent)=>{
      const target=event.target as Element|null;
      if(!target?.closest(".custom-fullscreen"))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressFloatingClickUntil=Date.now()+800;
      triggerFullscreen();
    };

    const suppressSyntheticFloatingClick=(event:MouseEvent)=>{
      const target=event.target as Element|null;
      if(!target?.closest(".custom-fullscreen"))return;
      if(Date.now()>=suppressFloatingClickUntil)return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    document.addEventListener("fullscreenchange",sync);
    document.addEventListener("webkitfullscreenchange",sync as EventListener);
    document.addEventListener("dblclick",handleDoubleClick,true);
    document.addEventListener("touchend",handleFloatingTouch,{capture:true,passive:false});
    document.addEventListener("click",suppressSyntheticFloatingClick,true);
    sync();

    return()=>{
      observer.disconnect();
      document.removeEventListener("fullscreenchange",sync);
      document.removeEventListener("webkitfullscreenchange",sync as EventListener);
      document.removeEventListener("dblclick",handleDoubleClick,true);
      document.removeEventListener("touchend",handleFloatingTouch,true);
      document.removeEventListener("click",suppressSyntheticFloatingClick,true);
    };
  },[]);

  if(!frame)return <style jsx global>{styles}</style>;

  return <>
    {createPortal(
      <button
        type="button"
        className="gts-seek-fullscreen"
        aria-label={fullscreen?"Έξοδος από πλήρη οθόνη":"Πλήρης οθόνη"}
        title={fullscreen?"Έξοδος από πλήρη οθόνη":"Πλήρης οθόνη"}
        onPointerDown={event=>event.stopPropagation()}
        onClick={event=>{event.preventDefault();event.stopPropagation();triggerFullscreen();}}
      >
        {fullscreen?
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M9 3v4a2 2 0 01-2 2H3M15 3v4a2 2 0 002 2h4M9 21v-4a2 2 0 00-2-2H3M15 21v-4a2 2 0 012-2h4"/></svg>:
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m11 0h3a2 2 0 002-2v-3"/></svg>}
      </button>,
      frame,
    )}
    <style jsx global>{styles}</style>
  </>;
}

const styles=`
  .video-frame{position:relative}
  .gts-seek-fullscreen{
    position:absolute;
    right:12px;
    bottom:11px;
    z-index:92;
    width:34px;
    height:34px;
    display:grid;
    place-items:center;
    border:0;
    border-radius:7px;
    background:rgba(0,0,0,.42);
    color:#fff;
    cursor:pointer;
    opacity:1;
    transition:opacity .18s ease,background .18s ease,transform .12s ease;
    -webkit-tap-highlight-color:transparent;
    touch-action:manipulation;
  }
  .gts-seek-fullscreen:hover{background:rgba(0,0,0,.62)}
  .gts-seek-fullscreen:active{transform:scale(.94)}
  .gts-seek-fullscreen svg{width:20px;height:20px}
  .video-frame.player-ui-hidden .gts-seek-fullscreen{opacity:0;pointer-events:none}
  .video-frame.player-ui-visible .gts-seek-fullscreen,
  .video-frame:not(.player-ui-hidden) .gts-seek-fullscreen{opacity:1;pointer-events:auto}
  .player-seek-bar{touch-action:none}
  @media (max-width:700px){
    .gts-seek-fullscreen{right:9px;bottom:9px;width:36px;height:36px}
  }
`;
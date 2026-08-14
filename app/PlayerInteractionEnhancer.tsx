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
  const [shell,setShell]=useState<Element|null>(null);
  const [showFooter,setShowFooter]=useState(false);

  useEffect(()=>{
    const sync=()=>{
      const next=document.querySelector<HTMLElement>(".video-frame");
      const appShell=document.querySelector(".app-shell");
      const playerView=Boolean(document.querySelector(".watch-layout"));
      const existingFooter=Boolean(document.querySelector(".app-footer"));
      setFrame(current=>current===next?current:next);
      setFullscreen(isFullscreenFrame(next));
      setShell(current=>current===appShell?current:appShell);
      setShowFooter(Boolean(appShell&&playerView&&!existingFooter));

      document.querySelectorAll<HTMLElement>('button[aria-label="Διαχείριση υποτίτλων"]').forEach(button=>{
        if((button.textContent||"").trim()==="CC")button.textContent="Subs";
      });
      document.querySelectorAll<HTMLElement>(".heading-actions .subtitle-manage>span").forEach(span=>{
        if((span.textContent||"").trim()==="CC")span.textContent="Subs";
      });
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

    const observeRoot=document.querySelector(".app-shell")||document.body;
    const observer=new MutationObserver(sync);
    observer.observe(observeRoot,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    document.addEventListener("fullscreenchange",sync);
    document.addEventListener("webkitfullscreenchange",sync as EventListener);
    document.addEventListener("dblclick",handleDoubleClick,true);
    sync();

    return()=>{
      observer.disconnect();
      document.removeEventListener("fullscreenchange",sync);
      document.removeEventListener("webkitfullscreenchange",sync as EventListener);
      document.removeEventListener("dblclick",handleDoubleClick,true);
    };
  },[]);

  return <>
    {frame&&createPortal(
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
    {shell&&showFooter&&createPortal(
      <footer className="app-footer player-view-footer">
        <div className="app-footer-brand"><span className="brand-mark"><i aria-hidden="true"/>▶</span><span>GreekTube <b>Subs</b></span></div>
        <p>Αυτόματοι ελληνικοί υπότιτλοι για δημόσια βίντεο YouTube.</p>
        <span className="app-footer-note">Φτιαγμένο με ♥ για ελληνόφωνους θεατές</span>
      </footer>,
      shell,
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
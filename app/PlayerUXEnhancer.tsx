"use client";

import {useEffect,useRef,useState} from "react";

type Toast={message:string;id:number}|null;

export default function PlayerUXEnhancer(){
  const [toast,setToast]=useState<Toast>(null);
  const timer=useRef<number|undefined>(undefined);

  useEffect(()=>{
    const style=document.createElement("style");
    style.dataset.greektubeUx="player-enhancer";
    style.textContent=`
      button,.secondary,.primary,.video-details-secondary-link{transition:transform .12s ease,background-color .16s ease,border-color .16s ease,box-shadow .16s ease,opacity .16s ease}
      button:active,.secondary:active,.primary:active,.video-details-secondary-link:active{transform:scale(.975)}
      .gt-action-confirm{position:fixed;left:50%;bottom:24px;z-index:20000;transform:translateX(-50%);max-width:min(92vw,420px);padding:10px 14px;border:1px solid rgba(164,150,255,.34);border-radius:12px;background:rgba(20,20,27,.94);box-shadow:0 14px 40px rgba(0,0,0,.38);backdrop-filter:blur(16px);color:#f4f2ff;font-size:12px;font-weight:650;letter-spacing:.01em;pointer-events:none;animation:gtConfirmIn .16s ease-out}
      @keyframes gtConfirmIn{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
    `;
    document.head.appendChild(style);

    const click=(event:MouseEvent)=>{
      const target=(event.target as HTMLElement|null)?.closest("button,a") as HTMLElement|null;
      if(!target)return;
      const text=(target.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
      if(!text.includes("αντιγραφή")&&!text.includes("αντιγράφηκε"))return;
      if(timer.current)window.clearTimeout(timer.current);
      setToast({message:"Ο σύνδεσμος αντιγράφηκε ✓",id:Date.now()});
      timer.current=window.setTimeout(()=>setToast(null),1800);
    };

    document.addEventListener("click",click);
    return()=>{
      document.removeEventListener("click",click);
      if(timer.current)window.clearTimeout(timer.current);
      style.remove();
    };
  },[]);

  return toast?<div className="gt-action-confirm" role="status" aria-live="polite" key={toast.id}>{toast.message}</div>:null;
}

"use client";

import {useEffect,useRef,useState} from "react";

type Toast={message:string;id:number}|null;

function editableTarget(target:EventTarget|null){
  return target instanceof HTMLElement&&Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
}

function activePlayerButton(){
  return document.querySelector<HTMLButtonElement>(".play-toggle");
}

function togglePlayback(){
  const button=activePlayerButton();
  if(!button)return false;
  button.blur();
  button.click();
  return true;
}

function seekByKeyboard(direction:-1|1){
  const range=document.querySelector<HTMLInputElement>(".player-seek-bar");
  if(!range||range.disabled)return false;
  const max=Number(range.max)||0;
  const current=Number(range.value)||0;
  const next=Math.max(0,Math.min(max,current+direction*5));
  range.value=String(next);
  range.dispatchEvent(new Event("input",{bubbles:true}));
  range.dispatchEvent(new Event("change",{bubbles:true}));
  return true;
}

function seekFromPointer(event:PointerEvent,range:HTMLInputElement){
  if(range.disabled)return;
  const rect=range.getBoundingClientRect();
  if(rect.width<=0)return;
  const min=Number(range.min)||0;
  const max=Number(range.max)||0;
  const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
  const next=min+(max-min)*ratio;
  range.value=String(next);
  range.dispatchEvent(new Event("input",{bubbles:true}));
  range.dispatchEvent(new Event("change",{bubbles:true}));
}

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
      [data-gt-clicked="1"]{border-color:rgba(164,150,255,.58)!important;box-shadow:0 0 0 3px rgba(143,127,240,.10)!important}
    `;
    document.head.appendChild(style);

    const key=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||editableTarget(event.target))return;
      if(event.code==="Space"){
        if(event.repeat)return;
        const transcriptButton=event.target instanceof HTMLElement?event.target.closest(".transcript>button[data-cue]"):null;
        if(transcriptButton||event.target===document.body||event.target===document.documentElement){
          event.preventDefault();event.stopPropagation();
          togglePlayback();
        }
        return;
      }
      if(event.code!=="ArrowLeft"&&event.code!=="ArrowRight")return;
      if(event.repeat)return;
      event.preventDefault();event.stopPropagation();
      seekByKeyboard(event.code==="ArrowLeft"?-1:1);
    };

    const pointer=(event:PointerEvent)=>{
      const target=event.target as HTMLElement|null;
      const range=target?.closest(".player-seek-bar") as HTMLInputElement|null;
      if(!range)return;
      seekFromPointer(event,range);
    };

    const click=(event:MouseEvent)=>{
      const target=(event.target as HTMLElement|null)?.closest("button,a") as HTMLElement|null;
      if(!target)return;
      target.dataset.gtClicked="1";
      window.setTimeout(()=>delete target.dataset.gtClicked,280);
      const text=(target.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
      let message="";
      if(text.includes("αντιγραφή")||text.includes("αντιγράφηκε"))message="Ο σύνδεσμος αντιγράφηκε ✓";
      else if(text.includes("αποθήκευση στιγμής"))message="Η στιγμή αποθηκεύτηκε ✓";
      if(!message)return;
      if(timer.current)window.clearTimeout(timer.current);
      setToast({message,id:Date.now()});
      timer.current=window.setTimeout(()=>setToast(null),1800);
    };

    document.addEventListener("keydown",key,true);
    document.addEventListener("pointerdown",pointer,true);
    document.addEventListener("click",click,true);
    return()=>{
      document.removeEventListener("keydown",key,true);
      document.removeEventListener("pointerdown",pointer,true);
      document.removeEventListener("click",click,true);
      if(timer.current)window.clearTimeout(timer.current);
      style.remove();
    };
  },[]);

  return toast?<div className="gt-action-confirm" role="status" aria-live="polite" key={toast.id}>{toast.message}</div>:null;
}

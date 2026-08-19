"use client";

import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import GtsFooter from "./GtsFooter";

export default function EditorFooterPortal(){
  const [target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{
    let raf=0;
    const locate=()=>{raf=0;const next=document.querySelector(".gts-editor-screen");setTarget(current=>current===next?current:next);};
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(locate);};
    schedule();
    const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);};
  },[]);
  return target?createPortal(<GtsFooter/>,target):null;
}

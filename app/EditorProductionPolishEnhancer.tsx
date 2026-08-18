"use client";

import {useEffect} from "react";

export default function EditorProductionPolishEnhancer(){
  useEffect(()=>{
    const polish=()=>{
      const kicker=document.querySelector<HTMLElement>(".gts-editor-title .gts-editor-kicker");
      if(kicker&&kicker.textContent!=="VIDEO EDITOR")kicker.textContent="VIDEO EDITOR";
    };
    polish();
    const observer=new MutationObserver(polish);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}

"use client";

import {useEffect} from "react";

const GREEK=/[\u0370-\u03ff\u1f00-\u1fff]/;
const DIACRITICS=/\p{Diacritic}/gu;
const LABEL_TAGS=new Set(["H1","H2","H3","H4","H5","H6","SMALL","LABEL","BUTTON","SPAN","STRONG"]);

function upperGreekNoTonos(value:string){
  return value.toLocaleUpperCase("el-GR").normalize("NFD").replace(DIACRITICS,"").normalize("NFC");
}

function shouldNormalize(element:HTMLElement,text:string){
  if(!LABEL_TAGS.has(element.tagName)||text.length>100||!GREEK.test(text))return false;
  if(element.closest('[class*="subtitle"],[class*="caption"],[class*="transcript"],[class*="cue"]'))return false;
  const letters=text.match(/\p{L}/gu)?.join("")||"";
  if(!letters)return false;
  const visuallyUpper=getComputedStyle(element).textTransform==="uppercase";
  const alreadyUpper=letters===letters.toLocaleUpperCase("el-GR");
  return visuallyUpper||alreadyUpper;
}

function normalizeRoot(root:ParentNode){
  const nodes=root instanceof HTMLElement?[root,...Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,small,label,button,span,strong"))]:Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,small,label,button,span,strong"));
  for(const element of nodes){
    if(element.children.length)continue;
    const text=element.textContent||"";
    if(!shouldNormalize(element,text))continue;
    const normalized=upperGreekNoTonos(text);
    if(normalized!==text)element.textContent=normalized;
  }
}

export default function GreekUppercaseGuard(){
  useEffect(()=>{
    normalizeRoot(document.body);
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.target instanceof HTMLElement)normalizeRoot(record.target);
        for(const node of Array.from(record.addedNodes))if(node instanceof HTMLElement)normalizeRoot(node);
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}

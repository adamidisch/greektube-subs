"use client";

import {useEffect} from "react";

const GREEK=/[\u0370-\u03ff\u1f00-\u1fff]/;
const DIACRITICS=/\p{Diacritic}/gu;
const EXCLUDED='[class*="subtitle"],[class*="caption"],[class*="transcript"],[class*="cue"],input,textarea,select,option,[contenteditable="true"]';

function stripTonos(value:string){
  return value.normalize("NFD").replace(DIACRITICS,"").normalize("NFC");
}
function isRawUppercaseGreek(value:string){
  const letters=value.match(/\p{L}/gu)?.join("")||"";
  return Boolean(letters)&&GREEK.test(value)&&letters===letters.toLocaleUpperCase("el-GR");
}
function normalizeElement(element:HTMLElement){
  if(element.matches(EXCLUDED)||element.closest(EXCLUDED))return;
  const visuallyUpper=getComputedStyle(element).textTransform==="uppercase";
  const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
  const changes:Array<{node:Text;value:string}>=[];
  let current=walker.nextNode();
  while(current){
    const node=current as Text;
    const parent=node.parentElement;
    const text=node.nodeValue||"";
    if(parent&&!parent.matches(EXCLUDED)&&!parent.closest(EXCLUDED)&&GREEK.test(text)&&(visuallyUpper||getComputedStyle(parent).textTransform==="uppercase"||isRawUppercaseGreek(text))){
      const normalized=stripTonos(text);
      if(normalized!==text)changes.push({node,value:normalized});
    }
    current=walker.nextNode();
  }
  for(const change of changes)change.node.nodeValue=change.value;
}
function normalizeRoot(root:ParentNode){
  if(root instanceof HTMLElement)normalizeElement(root);
  for(const element of Array.from(root.querySelectorAll<HTMLElement>("*")))normalizeElement(element);
}

export default function GreekUppercaseGuard(){
  useEffect(()=>{
    normalizeRoot(document.body);
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.target instanceof HTMLElement)normalizeElement(record.target);
        else if(record.target.parentElement)normalizeElement(record.target.parentElement);
        for(const node of Array.from(record.addedNodes))if(node instanceof HTMLElement)normalizeRoot(node);else if(node.parentElement)normalizeElement(node.parentElement);
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}

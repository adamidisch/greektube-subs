"use client";

import {useEffect} from "react";

const KEY_PREFIX="gts-demo-skip-ranges:v1:";
type SkipRange={start:number;end:number};

function normalize(input:unknown):SkipRange[]{
  if(!Array.isArray(input))return [];
  return input
    .map(item=>({start:Number((item as {start?:unknown}).start),end:Number((item as {end?:unknown}).end)}))
    .filter(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.start>=0&&item.end>item.start)
    .sort((a,b)=>a.start-b.start);
}
function key(videoId:string){return `${KEY_PREFIX}${videoId}`;}
function read(videoId:string):SkipRange[]{
  try{return normalize(JSON.parse(localStorage.getItem(key(videoId))||"[]"));}catch{return [];}
}
function currentVideoId(){return new URLSearchParams(location.search).get("video")||"";}
function seekMainPlayer(seconds:number){
  const input=document.querySelector<HTMLInputElement>(".player-seek-bar");
  if(!input)return false;
  const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");
  descriptor?.set?.call(input,String(seconds));
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
  return true;
}

export default function DemoSkipPlaybackEnhancer(){
  useEffect(()=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const response=await nativeFetch(input,init);
      try{
        const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
        const requestMethod=typeof Request!=="undefined"&&input instanceof Request?input.method:"GET";
        const method=String(init?.method||requestMethod).toUpperCase();
        if(method==="PUT"&&url.includes("/api/video-editor")&&response.ok&&typeof init?.body==="string"){
          const payload=JSON.parse(init.body) as {videoId?:unknown;skipRanges?:unknown};
          const videoId=typeof payload.videoId==="string"?payload.videoId:"";
          if(/^[A-Za-z0-9_-]{11}$/.test(videoId)){
            const ranges=normalize(payload.skipRanges);
            localStorage.setItem(key(videoId),JSON.stringify(ranges));
            window.dispatchEvent(new CustomEvent("gts:demo-skip-ranges",{detail:{videoId,ranges}}));
          }
        }
      }catch{}
      return response;
    }) as typeof window.fetch;

    let activeVideoId="";
    let ranges:SkipRange[]=[];
    let lastJumpEnd=-1;
    const refresh=()=>{
      const next=currentVideoId();
      if(next===activeVideoId)return;
      activeVideoId=next;
      ranges=next?read(next):[];
      lastJumpEnd=-1;
    };
    const onRanges=(event:Event)=>{
      const detail=(event as CustomEvent<{videoId?:string;ranges?:SkipRange[]}>).detail;
      if(detail?.videoId!==activeVideoId)return;
      ranges=normalize(detail.ranges);
      lastJumpEnd=-1;
    };
    const onStorage=(event:StorageEvent)=>{
      if(activeVideoId&&event.key===key(activeVideoId)){ranges=read(activeVideoId);lastJumpEnd=-1;}
    };
    const timer=window.setInterval(()=>{
      refresh();
      if(!activeVideoId||!ranges.length)return;
      const input=document.querySelector<HTMLInputElement>(".player-seek-bar");
      if(!input||input.disabled)return;
      const now=Number(input.value);
      if(!Number.isFinite(now))return;
      if(lastJumpEnd>=0&&now>=lastJumpEnd-.35){lastJumpEnd=-1;}
      const range=ranges.find(item=>now>=item.start-.08&&now<item.end-.08);
      if(!range||Math.abs(lastJumpEnd-range.end)<.05)return;
      if(seekMainPlayer(range.end))lastJumpEnd=range.end;
    },80);

    refresh();
    window.addEventListener("gts:demo-skip-ranges",onRanges as EventListener);
    window.addEventListener("storage",onStorage);
    return()=>{
      window.clearInterval(timer);
      window.removeEventListener("gts:demo-skip-ranges",onRanges as EventListener);
      window.removeEventListener("storage",onStorage);
      window.fetch=nativeFetch as typeof window.fetch;
    };
  },[]);

  return null;
}

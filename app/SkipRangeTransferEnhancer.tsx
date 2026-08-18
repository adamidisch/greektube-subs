"use client";

import {useEffect} from "react";

type SkipRange={start:number;end:number};
type ExportPayload={
  format:"greektube-skip-ranges";
  version:1;
  videoId:string;
  title:string;
  exportedAt:string;
  skipRanges:SkipRange[];
  totalSkippedSeconds:number;
};

function round1(value:number){return Math.round(value*10)/10;}
function parseVideoId(value:string){
  const clean=value.trim();
  const direct=clean.match(/^[A-Za-z0-9_-]{11}$/)?.[0];
  if(direct)return direct;
  try{
    const url=new URL(clean,location.origin);
    const query=url.searchParams.get("v")||url.searchParams.get("video");
    if(query&&/^[A-Za-z0-9_-]{11}$/.test(query))return query;
    const path=url.pathname.match(/\/(?:embed\/|shorts\/|youtu\.be\/)?([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1];
    return path||"";
  }catch{return "";}
}
function editorVideoId(){
  const query=new URLSearchParams(location.search).get("video")||"";
  if(/^[A-Za-z0-9_-]{11}$/.test(query))return query;
  const inputs=Array.from(document.querySelectorAll<HTMLInputElement>(".gts-editor-form input"));
  for(const input of inputs){
    const id=parseVideoId(input.value);
    if(id)return id;
  }
  return "";
}
function editorTitle(){return document.querySelector<HTMLElement>(".gts-editor-title strong")?.textContent?.trim()||"video";}
function currentRanges(){
  return Array.from(document.querySelectorAll<HTMLElement>(".gts-editor-range-times")).map(row=>{
    const inputs=row.querySelectorAll<HTMLInputElement>('input[type="number"]');
    return {start:Number(inputs[0]?.value),end:Number(inputs[1]?.value)};
  }).filter(range=>Number.isFinite(range.start)&&Number.isFinite(range.end)).sort((a,b)=>a.start-b.start);
}
function timeline(){return document.querySelector<HTMLInputElement>('.gts-editor-timeline input[type="range"]');}
function nativeRangeValue(input:HTMLInputElement,value:number){
  const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");
  descriptor?.set?.call(input,String(value));
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.dispatchEvent(new Event("change",{bubbles:true}));
}
function nextFrame(){return new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
function parseTimestamp(value:string){
  const clean=value.trim().replace(",",".");
  if(!clean)return NaN;
  if(/^\d+(?:\.\d+)?$/.test(clean))return Number(clean);
  const parts=clean.split(":").map(Number);
  if(parts.some(part=>!Number.isFinite(part))||parts.length<2||parts.length>3)return NaN;
  if(parts.length===2)return parts[0]*60+parts[1];
  return parts[0]*3600+parts[1]*60+parts[2];
}
function parseTextRanges(text:string){
  const ranges:SkipRange[]=[];
  for(const rawLine of text.split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line||line.startsWith("#"))continue;
    const match=line.match(/^\s*([\d:.,]+)\s*(?:-->|->|→|–|—|,|;)\s*([\d:.,]+)\s*$/);
    if(!match)continue;
    const start=parseTimestamp(match[1]);
    const end=parseTimestamp(match[2]);
    if(Number.isFinite(start)&&Number.isFinite(end))ranges.push({start,end});
  }
  return ranges;
}
function importedPayload(text:string):{videoId:string;ranges:SkipRange[]}{
  try{
    const parsed=JSON.parse(text) as unknown;
    if(Array.isArray(parsed))return {videoId:"",ranges:parsed.map(item=>({start:Number((item as {start?:unknown}).start),end:Number((item as {end?:unknown}).end)}))};
    if(parsed&&typeof parsed==="object"){
      const object=parsed as {videoId?:unknown;skipRanges?:unknown;ranges?:unknown};
      const list=Array.isArray(object.skipRanges)?object.skipRanges:Array.isArray(object.ranges)?object.ranges:[];
      return {
        videoId:typeof object.videoId==="string"?object.videoId:"",
        ranges:list.map(item=>({start:Number((item as {start?:unknown}).start),end:Number((item as {end?:unknown}).end)})),
      };
    }
  }catch{}
  return {videoId:"",ranges:parseTextRanges(text)};
}
function validateRanges(input:SkipRange[],duration:number){
  const ranges=input.map(range=>({start:round1(Number(range.start)),end:round1(Number(range.end))})).sort((a,b)=>a.start-b.start);
  if(!ranges.length)return {ranges,errors:["Δεν βρέθηκαν έγκυρα skip ranges στο αρχείο."]};
  const errors:string[]=[];
  ranges.forEach((range,index)=>{
    if(!Number.isFinite(range.start)||!Number.isFinite(range.end))errors.push(`Range ${index+1}: μη έγκυρο timestamp.`);
    else if(range.start<0)errors.push(`Range ${index+1}: η αρχή είναι αρνητική.`);
    else if(range.end<=range.start+.15)errors.push(`Range ${index+1}: το τέλος πρέπει να είναι μετά την αρχή.`);
    else if(duration>0&&range.end>duration+.25)errors.push(`Range ${index+1}: ξεπερνά τη διάρκεια του βίντεο.`);
    const previous=ranges[index-1];
    if(previous&&range.start<previous.end-.01)errors.push(`Range ${index+1}: επικαλύπτεται με το προηγούμενο range.`);
  });
  return {ranges,errors};
}
function downloadExport(){
  const videoId=editorVideoId();
  if(!videoId){window.alert("Δεν βρέθηκε το video id.");return;}
  const ranges=currentRanges();
  if(!ranges.length){window.alert("Δεν υπάρχουν skip ranges για export.");return;}
  const payload:ExportPayload={
    format:"greektube-skip-ranges",
    version:1,
    videoId,
    title:editorTitle(),
    exportedAt:new Date().toISOString(),
    skipRanges:ranges.map(range=>({start:round1(range.start),end:round1(range.end)})),
    totalSkippedSeconds:round1(ranges.reduce((sum,range)=>sum+Math.max(0,range.end-range.start),0)),
  };
  const blob=new Blob([JSON.stringify(payload,null,2)+"\n"],{type:"application/json;charset=utf-8"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download=`greektube-skip-ranges-${videoId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
async function applyImportedRanges(ranges:SkipRange[]){
  const seek=timeline();
  const markButtons=document.querySelectorAll<HTMLButtonElement>(".gts-editor-mark-actions > button");
  if(!seek||markButtons.length<2)throw new Error("Ο editor δεν είναι έτοιμος για import.");
  const deletes=Array.from(document.querySelectorAll<HTMLButtonElement>(".gts-editor-range-actions .danger"));
  if(deletes.length){
    const confirmed=window.confirm(`Το import θα αντικαταστήσει τα ${deletes.length} υπάρχοντα ranges. Συνέχεια;`);
    if(!confirmed)return false;
    for(const button of deletes.reverse()){button.click();await nextFrame();}
  }
  for(const range of ranges){
    nativeRangeValue(seek,range.start);await nextFrame();markButtons[0].click();await nextFrame();
    nativeRangeValue(seek,range.end);await nextFrame();markButtons[1].click();await nextFrame();
  }
  return true;
}

export default function SkipRangeTransferEnhancer(){
  useEffect(()=>{
    let raf=0;
    let importing=false;
    const decorate=()=>{
      raf=0;
      const head=document.querySelector<HTMLElement>(".gts-editor-ranges .gts-editor-section-head");
      if(!head||head.querySelector(".gts-range-transfer"))return;
      const count=head.querySelector<HTMLElement>(":scope > strong");
      const tools=document.createElement("div");
      tools.className="gts-range-transfer";
      const exportButton=document.createElement("button");
      exportButton.type="button";exportButton.textContent="Export";exportButton.title="Export skip ranges";
      exportButton.addEventListener("click",downloadExport);
      const importButton=document.createElement("button");
      importButton.type="button";importButton.textContent="Import";importButton.title="Import skip ranges";
      const file=document.createElement("input");
      file.type="file";file.accept=".json,.txt,.csv,application/json,text/plain,text/csv";file.hidden=true;
      importButton.addEventListener("click",()=>{if(!importing)file.click();});
      file.addEventListener("change",()=>{void (async()=>{
        const selected=file.files?.[0];file.value="";if(!selected||importing)return;
        importing=true;importButton.disabled=true;importButton.textContent="Importing…";
        try{
          const data=importedPayload(await selected.text());
          const currentId=editorVideoId();
          if(data.videoId&&currentId&&data.videoId!==currentId)throw new Error(`Το αρχείο είναι για άλλο video (${data.videoId}).`);
          const max=Number(timeline()?.max||0);
          const checked=validateRanges(data.ranges,max);
          if(checked.errors.length)throw new Error(checked.errors.join("\n"));
          const applied=await applyImportedRanges(checked.ranges);
          if(applied)window.alert(`Έγινε import ${checked.ranges.length} skip ranges. Έλεγξέ τα και πάτησε Αποθήκευση.`);
        }catch(problem){window.alert(problem instanceof Error?problem.message:"Το import απέτυχε.");}
        finally{importing=false;importButton.disabled=false;importButton.textContent="Import";}
      })();});
      tools.append(exportButton,importButton,file);
      if(count)count.before(tools);else head.appendChild(tools);
    };
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(decorate);};
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);};
  },[]);

  return <style>{`
    .gts-range-transfer{margin-left:auto;display:flex;align-items:center;gap:6px}
    .gts-range-transfer button{height:29px;padding:0 10px;border:1px solid rgba(255,255,255,.10);border-radius:8px;background:rgba(255,255,255,.035);color:#bfc3cc;font:600 9px/1 var(--font-geist-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.01em;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}
    .gts-range-transfer button:hover{background:rgba(143,127,240,.09);border-color:rgba(143,127,240,.30);color:#fff}
    .gts-range-transfer button:disabled{opacity:.55;cursor:default}
    @media(max-width:700px){.gts-editor-ranges .gts-editor-section-head{flex-wrap:wrap}.gts-range-transfer{order:3;width:100%;margin:7px 0 0}.gts-range-transfer button{flex:1;height:34px}}
  `}</style>;
}

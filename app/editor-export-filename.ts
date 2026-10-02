export function safeExportStem(value:string,fallback:string){
  const stem=(value||fallback)
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .replace(/[. ]+$/g,"")
    .slice(0,120)
    .trim();
  return stem||fallback;
}

function trimAtWord(value:string,max:number){
  if(value.length<=max)return value;
  const clipped=value.slice(0,max+1);
  const boundary=clipped.lastIndexOf(" ");
  return (boundary>=Math.floor(max*.65)?clipped.slice(0,boundary):value.slice(0,max)).trim();
}

export function conciseEnglishVideoTitle(originalTitle:string,fallback:string){
  const clean=(originalTitle||"").replace(/\s+/g," ").trim();
  if(!clean)return fallback;
  const beforePipe=clean.split(/\s*[|•]\s*/u)[0]?.trim()||clean;
  const beforeColon=beforePipe.split(/\s*:\s*/u)[0]?.trim()||beforePipe;
  const english=/[A-Za-z]/.test(beforeColon)?beforeColon:fallback;
  return trimAtWord(english,58)||fallback;
}

export function editorExportStem({
  originalTitle,
  speakerName,
  fallback,
}:{originalTitle:string;speakerName?:string;fallback:string}){
  const title=conciseEnglishVideoTitle(originalTitle,fallback);
  const speaker=(speakerName||"")
    .replace(/^Dr\.\s*/i,"Dr ")
    .replace(/\s+/g," ")
    .trim();
  const combined=speaker&&!title.toLocaleLowerCase("en-US").includes(speaker.toLocaleLowerCase("en-US"))
    ? `${title} - ${speaker}`
    : title;
  return safeExportStem(combined,fallback);
}

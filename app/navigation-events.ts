"use client";

declare global {
  interface Window {
    __gtsHistoryPatched?: boolean;
  }
}

function ensureHistoryEvents(){
  if(window.__gtsHistoryPatched)return;
  window.__gtsHistoryPatched=true;
  const originalPush=history.pushState.bind(history);
  const originalReplace=history.replaceState.bind(history);
  history.pushState=function(...args:Parameters<typeof history.pushState>){
    originalPush(...args);
    window.dispatchEvent(new Event("gts:locationchange"));
  };
  history.replaceState=function(...args:Parameters<typeof history.replaceState>){
    originalReplace(...args);
    window.dispatchEvent(new Event("gts:locationchange"));
  };
}

export function watchAppNavigation(onChange:()=>void){
  ensureHistoryEvents();
  window.addEventListener("gts:locationchange",onChange);
  window.addEventListener("popstate",onChange);
  return()=>{
    window.removeEventListener("gts:locationchange",onChange);
    window.removeEventListener("popstate",onChange);
  };
}

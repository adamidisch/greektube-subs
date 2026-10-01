"use client";

import {createPortal} from "react-dom";
import {useEffect,useMemo,useState,type CSSProperties} from "react";

type EditorVideo={id:string;libraryVisible?:boolean};
type PersonalState={videos?:Array<{id?:string;libraryVisible?:boolean}>;moments?:Array<{videoId?:string}>};

const PERSONAL_CACHE_KEY="greektube-personal-state:v1";
const wrapStyle:CSSProperties={
  marginTop:10,padding:"12px 12px 11px",border:"1px solid rgba(145,145,180,.18)",borderRadius:12,
  background:"rgba(255,255,255,.025)",display:"grid",gap:9,
};
const labelStyle:CSSProperties={fontSize:11,fontWeight:800,letterSpacing:".08em",color:"rgba(210,210,230,.62)"};
const rowStyle:CSSProperties={display:"grid",gridTemplateColumns:"1fr 1fr",gap:7};
const buttonBase:CSSProperties={
  minHeight:34,borderRadius:9,border:"1px solid rgba(150,150,185,.2)",fontSize:12,fontWeight:800,cursor:"pointer",
  transition:"background .18s ease,border-color .18s ease,color .18s ease,opacity .18s ease",
};

function patchPersonalVideo(videoId:string,patch:Record<string,unknown>|null){
  try{
    const raw=localStorage.getItem(PERSONAL_CACHE_KEY);
    if(!raw)return;
    const state=JSON.parse(raw) as PersonalState;
    if(!Array.isArray(state.videos))return;
    state.videos=patch===null?state.videos.filter(video=>video.id!==videoId):state.videos.map(video=>video.id===videoId?{...video,...patch}:video);
    if(patch===null&&Array.isArray(state.moments))state.moments=state.moments.filter(moment=>moment.videoId!==videoId);
    localStorage.setItem(PERSONAL_CACHE_KEY,JSON.stringify(state));
  }catch{}
}

function videoIdFromCard(card:HTMLElement){
  const image=card.querySelector<HTMLImageElement>("img[src*='i.ytimg.com/vi/']");
  const match=image?.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//);
  return match?.[1]||"";
}

export default function EditorLibraryVisibilityEnhancer(){
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const [videoId,setVideoId]=useState("");
  const [visible,setVisible]=useState(true);
  const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState("");
  const [isAdmin,setIsAdmin]=useState(false);

  useEffect(()=>{
    let active=true;
    const checkAdmin=()=>fetch("/api/admin-auth",{cache:"no-store",credentials:"same-origin"})
      .then(async response=>({response,data:await response.json() as {authorized?:boolean}}))
      .then(({response,data})=>{if(active)setIsAdmin(Boolean(response.ok&&data.authorized));})
      .catch(()=>{if(active)setIsAdmin(false);});
    void checkAdmin();
    const onFocus=()=>void checkAdmin();
    window.addEventListener("focus",onFocus);
    return()=>{active=false;window.removeEventListener("focus",onFocus);};
  },[]);

  useEffect(()=>{
    const syncTarget=()=>{
      const next=document.querySelector<HTMLElement>(".gts-editor-sidebar .gts-editor-card .gts-editor-fields");
      setTarget(next);
      const id=new URLSearchParams(location.search).get("video")||"";
      if(next&&/^[A-Za-z0-9_-]{11}$/.test(id))setVideoId(id);
    };
    syncTarget();
    const observer=new MutationObserver(syncTarget);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!target||!videoId)return;
    let active=true;
    setStatus("");
    void fetch(`/api/video-editor?videoId=${encodeURIComponent(videoId)}`,{cache:"no-store",credentials:"same-origin"})
      .then(async response=>({response,data:await response.json() as {video?:EditorVideo}}))
      .then(({response,data})=>{if(active&&response.ok&&data.video)setVisible(data.video.libraryVisible!==false);})
      .catch(()=>undefined);
    return()=>{active=false;};
  },[target,videoId]);

  useEffect(()=>{
    const applyAdminLibraryUi=()=>{
      const hiddenButton=Array.from(document.querySelectorAll<HTMLButtonElement>(".quick-filters button")).find(button=>button.textContent?.trim()==="Κρυφά");
      if(hiddenButton)hiddenButton.style.display=isAdmin?"":"none";
      if(!isAdmin)return;
      const hiddenActive=Boolean(hiddenButton?.classList.contains("active"));
      for(const card of Array.from(document.querySelectorAll<HTMLElement>(".video-grid .video-card"))){
        const existing=card.querySelector<HTMLButtonElement>("[data-admin-delete-video]");
        if(!hiddenActive){existing?.remove();continue;}
        if(existing)continue;
        const id=videoIdFromCard(card);
        if(!id)continue;
        const button=document.createElement("button");
        button.type="button";
        button.dataset.adminDeleteVideo=id;
        button.textContent="Διαγραφή οριστικά";
        button.setAttribute("aria-label","Οριστική διαγραφή βίντεο");
        Object.assign(button.style,{position:"absolute",right:"10px",bottom:"10px",zIndex:"8",padding:"8px 10px",borderRadius:"9px",border:"1px solid rgba(255,120,120,.35)",background:"rgba(65,20,24,.92)",color:"#ffd7d7",fontSize:"11px",fontWeight:"800",cursor:"pointer"});
        button.addEventListener("click",async event=>{
          event.preventDefault();event.stopPropagation();
          if(!window.confirm("Να διαγραφεί οριστικά αυτό το βίντεο; Η ενέργεια δεν αναιρείται."))return;
          button.disabled=true;button.textContent="Διαγραφή…";
          try{
            const response=await fetch("/api/video-visibility",{method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:id})});
            const result=await response.json() as {ok?:boolean;error?:string};
            if(!response.ok||!result.ok)throw new Error(result.error||"Η διαγραφή απέτυχε.");
            patchPersonalVideo(id,null);
            window.location.reload();
          }catch(error){button.disabled=false;button.textContent="Διαγραφή οριστικά";window.alert(error instanceof Error?error.message:"Η διαγραφή απέτυχε.");}
        });
        card.style.position="relative";
        card.appendChild(button);
      }
    };
    applyAdminLibraryUi();
    const observer=new MutationObserver(applyAdminLibraryUi);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    return()=>observer.disconnect();
  },[isAdmin]);

  const activeStyle=useMemo<CSSProperties>(()=>({
    ...buttonBase,
    color:"#f7f7fb",
    background:"linear-gradient(180deg,rgba(133,117,241,.95),rgba(108,92,214,.95))",
    borderColor:"rgba(159,147,255,.75)",
    boxShadow:"0 6px 18px rgba(93,75,194,.22)",
  }),[]);
  const idleStyle=useMemo<CSSProperties>(()=>({...buttonBase,color:"rgba(230,230,240,.7)",background:"rgba(255,255,255,.035)"}),[]);

  async function setLibraryVisible(next:boolean){
    if(!videoId||loading||next===visible)return;
    setLoading(true);setStatus("Αποθήκευση…");
    try{
      const response=await fetch("/api/video-visibility",{
        method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({videoId,libraryVisible:next}),
      });
      const result=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!result.ok)throw new Error(result.error||"Η αλλαγή απέτυχε.");
      patchPersonalVideo(videoId,{libraryVisible:next});
      setVisible(next);setStatus(next?"Το βίντεο είναι ορατό στη βιβλιοθήκη.":"Το βίντεο είναι κρυφό από τη βιβλιοθήκη.");
    }catch(error){setStatus(error instanceof Error?error.message:"Η αλλαγή απέτυχε.");}
    finally{setLoading(false);}
  }

  if(!target||!isAdmin)return null;
  return createPortal(
    <div style={wrapStyle} data-editor-library-visibility="true">
      <span style={labelStyle}>ΚΑΤΑΣΤΑΣΗ ΒΙΒΛΙΟΘΗΚΗΣ</span>
      <div style={rowStyle}>
        <button type="button" style={visible?activeStyle:idleStyle} disabled={loading} onClick={()=>void setLibraryVisible(true)}>ΟΡΑΤΟ</button>
        <button type="button" style={!visible?activeStyle:idleStyle} disabled={loading} onClick={()=>void setLibraryVisible(false)}>ΚΡΥΦΟ</button>
      </div>
      {status&&<small style={{fontSize:11,lineHeight:1.45,color:"rgba(215,215,230,.62)"}}>{status}</small>}
    </div>,
    target,
  );
}

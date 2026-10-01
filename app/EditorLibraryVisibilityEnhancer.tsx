"use client";

import {createPortal} from "react-dom";
import {useEffect,useMemo,useState,type CSSProperties} from "react";

type EditorVideo={id:string;libraryVisible?:boolean};

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

export default function EditorLibraryVisibilityEnhancer(){
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const [videoId,setVideoId]=useState("");
  const [visible,setVisible]=useState(true);
  const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState("");
  const [changed,setChanged]=useState(false);

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
    if(target||!changed)return;
    window.location.reload();
  },[target,changed]);

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
      setVisible(next);setChanged(true);setStatus(next?"Το βίντεο είναι ορατό στη βιβλιοθήκη.":"Το βίντεο είναι κρυφό από τη βιβλιοθήκη.");
    }catch(error){setStatus(error instanceof Error?error.message:"Η αλλαγή απέτυχε.");}
    finally{setLoading(false);}
  }

  if(!target)return null;
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

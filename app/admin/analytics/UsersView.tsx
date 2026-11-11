"use client";

import {useEffect,useMemo,useState} from "react";

type Row={public_id:string;username:string;created_at:string;last_saved:string|null;moments:number;watched:number;watch_seconds:number};
type ListData={counts:{profiles:number;with_history:number;recently_saved:number};users:Row[]};
type Detail={id:string;username:string;created_at:string;updated_at:string;last_saved:string|null;device_profile:boolean;moments:number;videos:Array<{id:string;title:string;progress:number;position:number;watchedSeconds:number;lastWatched:string|null}>};
type Props={id:string;onOpen:(id:string)=>void;onOpenVideo:(id:string)=>void};

const num=(v:number)=>new Intl.NumberFormat("en-US").format(Math.round(Number(v)||0));
const when=(v:string|null|undefined)=>v?new Date(v).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
const mins=(s:number)=>s>=3600?`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`:`${Math.floor(s/60)}m`;
const clock=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

function useFetched<T>(url:string){
  const [state,setState]=useState<{url:string;data:T|null;error:boolean}>({url:"",data:null,error:false});
  useEffect(()=>{
    let active=true;
    void fetch(url,{cache:"no-store",credentials:"same-origin"}).then(async r=>{
      if(!r.ok)throw new Error("failed");
      const data=await r.json() as T;
      if(active)setState({url,data,error:false});
    }).catch(()=>{if(active)setState({url,data:null,error:true});});
    return()=>{active=false;};
  },[url]);
  const ready=state.url===url;
  return {data:ready?state.data:null,error:ready&&state.error,loading:!ready};
}

export default function UsersView({id,onOpen,onOpenVideo}:Props){
  return id?<UserDetail id={id} onOpenVideo={onOpenVideo}/>:<UserList onOpen={onOpen}/>;
}

function UserList({onOpen}:{onOpen:(id:string)=>void}){
  const {data,error,loading}=useFetched<ListData>("/api/analytics/users");
  const [query,setQuery]=useState("");
  const rows=useMemo(()=>{const q=query.trim().toLowerCase();return (data?.users??[]).filter(u=>!q||u.username.toLowerCase().includes(q));},[data,query]);
  if(error)return <section className="ad-message">Could not load users.</section>;
  if(loading||!data)return <div className="ad-skel"><div className="ad-kpis">{[0,1,2].map(i=><div key={i} className="ad-kpi sk"><i/><i/><i/></div>)}</div></div>;
  return <>
    <div className="ad-stats three">
      <article className="ad-stat"><small>PROFILES</small><strong>{num(data.counts.profiles)}</strong><p>Device or user profiles, not verified logins</p></article>
      <article className="ad-stat"><small>WITH SAVED HISTORY</small><strong>{num(data.counts.with_history)}</strong><p>Progress or personal state saved</p></article>
      <article className="ad-stat"><small>SAVED IN LAST 7 DAYS</small><strong>{num(data.counts.recently_saved)}</strong><p>Saves, not necessarily logins</p></article>
    </div>
    <section className="ad-card flush">
      <header><div><small>{num(rows.length)} PROFILES</small><h2>Users</h2></div><div className="ad-filters"><input type="search" placeholder="Search username…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search username"/></div></header>
      <div className="ad-table users">
        <div className="ad-tr head" role="row"><span>User</span><span>Created</span><span>Last saved</span><span>Videos</span><span>Watch</span><span>Moments</span></div>
        {rows.map(u=><button type="button" key={u.public_id} className="ad-tr" role="row" onClick={()=>onOpen(u.public_id)}>
          <span className="loc"><b className="ad-avatar" aria-hidden="true">{u.username.slice(0,1).toUpperCase()}</b><em>{u.username}</em></span>
          <span data-label="Created">{when(u.created_at)}</span><span data-label="Last saved">{when(u.last_saved)}</span>
          <span data-label="Videos">{num(u.watched)}</span><span data-label="Watch">{mins(Number(u.watch_seconds))}</span><span data-label="Moments">{num(u.moments)}</span>
        </button>)}
        {!rows.length&&<p className="ad-empty">No profiles match.</p>}
      </div>
    </section>
    <p className="ad-note">Saved dates do not prove a login, and older analytics clicks cannot be matched safely to a username.</p>
  </>;
}

function UserDetail({id,onOpenVideo}:{id:string;onOpenVideo:(id:string)=>void}){
  const {data,error,loading}=useFetched<Detail>("/api/analytics/users/"+encodeURIComponent(id));
  if(error)return <section className="ad-message">This profile could not be loaded.</section>;
  if(loading||!data)return <div className="ad-skel"><div className="ad-card sk big"><i/><i/></div></div>;
  const completed=data.videos.filter(v=>v.progress>=90).length;
  const seconds=data.videos.reduce((n,v)=>n+v.watchedSeconds,0);
  return <>
    <section className="ad-hero"><div className="ad-hero-loc"><b className="ad-avatar big" aria-hidden="true">{data.username.slice(0,1).toUpperCase()}</b><div><small>PROFILE #{data.id}</small><h2>{data.username}</h2><p>{data.device_profile?"Device profile":"Externally identified user"}</p></div></div></section>
    <div className="ad-stats"><article className="ad-stat"><small>VIDEOS WATCHED</small><strong>{num(data.videos.length)}</strong><p>{completed} completed</p></article><article className="ad-stat"><small>WATCH TIME</small><strong>{mins(seconds)}</strong><p>Where seconds were saved</p></article><article className="ad-stat"><small>MOMENTS</small><strong>{num(data.moments)}</strong><p>Saved in history</p></article><article className="ad-stat"><small>LAST SAVED</small><strong className="sm">{when(data.last_saved)}</strong><p>Created {when(data.created_at)}</p></article></div>
    <section className="ad-card"><header><div><small>HISTORY</small><h2>Watched videos</h2></div></header>
      {data.videos.length?<ul className="ad-events">{data.videos.map(v=><li key={v.id}><button type="button" className="ad-ev" onClick={()=>onOpenVideo(v.id)}><span className="ad-chip">{v.progress}%</span><div><strong>{v.title}</strong><small>Position {clock(v.position)}</small></div><time>{when(v.lastWatched)}</time></button></li>)}</ul>:<p className="ad-empty">No saved videos for this profile.</p>}
    </section>
  </>;
}

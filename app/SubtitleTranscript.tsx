"use client";

import { useEffect, useMemo, useRef } from "react";
import { subtitleEventAt, type SubtitleTrack } from "./subtitle-track";
import {tr,useAppLanguage} from "./app-language";

const clock = (t:number) => `${t>=3600?`${Math.floor(t/3600)}:`:""}${String(Math.floor(t / 60)%60).padStart(t>=3600?2:1,"0")}:${String(Math.floor(t % 60)).padStart(2,"0")}`;

export default function SubtitleTranscript({track,time,follow,highlight,seek,moment,quick,savedTimes=[],close}:{track:SubtitleTrack;time:number;follow:boolean;highlight:boolean;seek:(time:number)=>void;moment:(time:number,text:string)=>void;quick:(time:number,text:string,until:number)=>void;savedTimes?:number[];close:()=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const language=useAppLanguage();
  const active=subtitleEventAt(track.events,time);
  useEffect(()=>{
    root.current?.querySelector(".active")?.classList.remove("active");
    if(highlight&&active>=0)root.current?.querySelector(`[data-event="${active}"]`)?.classList.add("active");
    if(follow&&active>=0)root.current?.querySelector(`[data-event="${active}"]`)?.scrollIntoView({block:"nearest",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  },[active,follow,highlight,track]);
  const rows=useMemo(()=>track.events.map((event,index)=><div className="transcript-event" key={`${event.start}-${index}`} data-event={index}><button data-seek={index}><time>{clock(event.start)}</time><span>{event.text}</span></button>{(()=>{const end=track.events[index+1]?.start??Infinity;const saved=savedTimes.some(t=>t>=event.start-0.5&&t<end-0.5);return <button className={`transcript-moment ${saved?"saved":""}`} data-moment={index} data-tip={saved?tr("Αποθηκευμένη φράση","Saved phrase"):tr("Αποθήκευση της φράσης στις αποθηκευμένες στιγμές","Save this phrase to saved moments")} aria-label={saved?tr("Αποθηκευμένη φράση","Saved phrase"):tr("Αποθήκευση φράσης","Save phrase")} title={saved?tr("Αποθηκευμένη φράση","Saved phrase"):tr("Αποθήκευση φράσης στις αποθηκευμένες στιγμές","Save this phrase to saved moments")}><svg viewBox="0 0 24 24" fill={saved?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>{!saved&&<span>{tr("Αποθήκευση","Save")}</span>}</button>;})()}</div>),[track,language,savedTimes.join(",")]);
  return <aside className="side-panel transcript-drawer" data-gts-shared-transcript="1">
    <div className="drawer-header transcript-header"><div><small>{tr("ΕΛΛΗΝΙΚΟΙ ΥΠΟΤΙΤΛΟΙ")}</small><strong>{tr("Μεταγραφή")}</strong><span>{track.events.length} {tr("σημεία ·")}{clock(Math.max(0,time))}</span></div><button aria-label="Κλείσιμο μεταγραφής" onClick={close}>×</button></div>
    {!track.audit.professionalReady&&<p className="subtitle-review-note" role="note">{tr("Η μεταγραφή ακολουθεί τους υπότιτλους. Ο συγχρονισμός χρειάζεται έλεγχο.")}</p>}
    <div className="transcript" ref={root} onClick={e=>{const button=(e.target as Element).closest<HTMLButtonElement>("button[data-seek],button[data-moment]");if(!button)return;const event=track.events[Number(button.dataset.seek??button.dataset.moment)];if(event){if(button.dataset.moment!==undefined)quick(event.start,event.text,track.events[Number(button.dataset.moment)+1]?.start??Infinity);else seek(event.start)}}} onContextMenu={e=>{const row=(e.target as Element).closest<HTMLElement>("[data-event]");const event=row&&track.events[Number(row.dataset.event)];if(event){e.preventDefault();moment(event.start,event.text)}}}>{rows}</div>
  </aside>;
}

"use client";

import {useEffect,useRef,useState} from "react";
import {auditSubtitleEvents,validateAuthoredEvents,type SubtitleTrack,type TimedCue} from "./subtitle-track";
import {tr,useAppLanguage} from "./app-language";

type Review={videoId:string;sourceHash:string;translationHash:string;track:SubtitleTrack;pending?:boolean};
export default function SubtitleQualityPanel({videoId,onSeek,onDirtyChange}:{videoId:string;onSeek?:(time:number)=>void;onDirtyChange?:(dirty:boolean)=>void}){
  useAppLanguage();
  const [review,setReview]=useState<Review|null>(null),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [pending,setPending]=useState(false),[candidate,setCandidate]=useState<SubtitleTrack|null>(null);
  const [note,setNote]=useState(""),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false);
  const [editIndex,setEditIndex]=useState(0),[sourceEnglish,setSourceEnglish]=useState<TimedCue[]>([]);
  const originalTranslation=useRef<TimedCue[]>([]);
  useEffect(()=>{onDirtyChange?.(candidate!==null);return()=>onDirtyChange?.(false)},[candidate,onDirtyChange]);
  const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/subtitle-review?videoId=${videoId}${pending?"&draft=1":""}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(data.error);if(!controller.signal.aborted)setReview(data);
    }).catch(error=>{if(!controller.signal.aborted)setError(error.message)});
    return()=>controller.abort();
  },[videoId,pending]);
  async function loadFile(file:File){
    setError("");setCandidate(null);setApproved(false);
    try{
      if(file.size>8000000)throw Error(tr("Το αρχείο είναι πολύ μεγάλο.","The file is too large."));
      const data=JSON.parse(await file.text());
      if(!review||data.videoId!==videoId||data.sourceHash!==review.sourceHash||data.translationHash!==review.translationHash)throw Error(tr("Το αρχείο ανήκει σε διαφορετική έκδοση. Κατέβασε τη νέα αναφορά.","The file belongs to a different revision. Download the current report."));
      const response=await fetch(`/api/subtitle-review?videoId=${videoId}&download=report${pending?"&draft=1":""}`,{cache:"no-store"});
      if(!response.ok)throw Error(tr("Δεν φορτώθηκε η αναφορά.","Could not load the report."));
      const original=await response.json();
      originalTranslation.current=original.translation||[];setSourceEnglish(original.source||[]);
      const track=validateAuthoredEvents(data.track?.events||data.events,(original.translation||[]) as TimedCue[]);
      setCandidate(track);
      setEditIndex(0);
      setMessage(tr("Το διορθωμένο timeline φορτώθηκε για έλεγχο.","The revised timeline is ready for review."));
    }catch(error){setError(error instanceof Error?error.message:"Invalid review file.");}
    finally{if(fileRef.current)fileRef.current.value="";}
  }
  async function beginEditing(){
    if(!review)return;setBusy(true);setError("");
    try{
      const response=await fetch(`/api/subtitle-review?videoId=${videoId}&download=report${pending?"&draft=1":""}`,{cache:"no-store"});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      if(data.sourceHash!==review.sourceHash||data.translationHash!==review.translationHash)throw Error(tr("Η μεταγραφή άλλαξε. Φόρτωσε ξανά.","The transcript changed. Reload before editing."));
      originalTranslation.current=data.translation||[];setSourceEnglish(data.source||[]);
      setCandidate(validateAuthoredEvents(data.track.events,originalTranslation.current));setEditIndex(0);setApproved(false);
    }catch(error){setError(error instanceof Error?error.message:"Could not begin review.");}
    finally{setBusy(false);}
  }
  function editEvent(patch:Partial<SubtitleTrack["events"][number]>){
    setApproved(false);
    setCandidate(current=>{if(!current)return current;const events=current.events.map((event,index)=>index===editIndex?{...event,...patch,...(!("timing" in patch)?{timing:"estimated" as const}:{})}:event);return {...current,events,audit:auditSubtitleEvents(events)}});
  }
  function selectEvent(index:number){setEditIndex(index);const event=candidate?.events[index];if(event)onSeek?.(event.start);}
  async function submit(action:"draft"|"publish"){
    if(!review||!candidate)return;setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/subtitle-review",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId,action,pending,sourceHash:review.sourceHash,translationHash:review.translationHash,events:candidate.events,bilingualReview:approved?"approved":null,reviewNote:note})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      setMessage(result.message||tr(action==="publish"?"Το ελεγμένο timeline δημοσιεύτηκε.":"Το προσχέδιο αποθηκεύτηκε.",action==="publish"?"The reviewed timeline was published.":"Draft saved."));
      if(action==="draft"){setReview({...review,track:candidate,pending:true});setCandidate(null);setPending(true);}
      if(result.subtitleTrack){setReview({...review,track:result.subtitleTrack});setCandidate(null);localStorage.removeItem(`greektube-transcript:${videoId}:v12`);window.dispatchEvent(new CustomEvent("greektube:subtitle-track-updated",{detail:{videoId}}));}
    }catch(error){setError(error instanceof Error?error.message:"Review failed.");}
    finally{setBusy(false);}
  }
  const track=candidate||review?.track;
  const edited=candidate?.events[editIndex];
  return <section className="subtitle-quality-panel">
    <h2>{tr("Έλεγχος υποτίτλων","Subtitle quality")}</h2>
    <div className="subtitle-quality-actions"><button type="button" onClick={()=>{setReview(null);setCandidate(null);setError("");setMessage("");setNote("");setApproved(false);setPending(value=>!value)}} disabled={busy}>{pending?tr("Δημοσιευμένη έκδοση","Published version"):tr("Έλεγχος προσχεδίου εισαγωγής","Review import draft")}</button></div>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {!track&&!error?<p role="status">{tr("Φόρτωση…")}</p>:track&&<>
      <div className="subtitle-quality-stats"><span>{tr("Τελικές εμφανίσεις","Display events")}<strong>{track.audit.eventCount}</strong></span><span>{tr("Γρήγορη ανάγνωση","Reading speed issues")}<strong>{track.audit.fastPages}</strong></span><span>{tr("Κάτω από 1,5 δευτ.","Under 1.5 sec")}<strong>{track.audit.shortPages}</strong></span></div>
      <p>{track.audit.professionalReady?tr("Ο έλεγχος αναγνωσιμότητας και ήχου έχει εγκριθεί.","Readability and audio timing approved."):tr("Απαιτείται επιμέλεια πριν χαρακτηριστούν επαγγελματικοί υπότιτλοι.","Review is required before professional approval.")}</p>
      <p>{tr("Αναγνωσιμότητα","Readability")}: {track.audit.readable?"✓":tr("Χρειάζεται διόρθωση")} · {tr("Συγχρονισμός με ήχο","Audio timing")}: {track.audit.speechVerified?"✓":tr("Δεν έχει επιβεβαιωθεί","Not verified")}</p>
      <div className="subtitle-quality-actions">{!pending&&<a href={`/api/subtitle-review?videoId=${videoId}&download=srt`}>{tr("Λήψη SRT εμφάνισης","Download display SRT")}</a>}<a href={`/api/subtitle-review?videoId=${videoId}&download=report${pending?"&draft=1":""}`}>{tr("Λήψη αναφοράς για επιμέλεια","Download editing report")}</a></div>
      <details><summary>{tr("Σημεία για έλεγχο","Review points")}</summary><ol>{track.audit.issues.slice(0,30).map((issue,i)=><li key={i}>{Math.floor((track.events[issue.event]?.start||0)/60)}:{String(Math.floor((track.events[issue.event]?.start||0)%60)).padStart(2,"0")} · {issue.code==="reading_speed"?`${issue.value?.toFixed(1)} ${tr("χαρακτήρες/δευτ.","characters/sec")}`:tr("Χρόνος εμφάνισης ή διάταξη","Duration or line layout")}</li>)}</ol></details>
      {!candidate&&<div className="subtitle-quality-actions"><button type="button" disabled={busy} onClick={()=>void beginEditing()}>{tr("Επιμέλεια με τον ήχο","Review against audio")}</button></div>}
      {edited&&<section className="subtitle-event-editor"><h3>{tr("Επιμέλεια εμφάνισης","Edit display event")} {editIndex+1}/{candidate!.events.length}</h3><div className="subtitle-quality-actions"><button type="button" disabled={editIndex===0} onClick={()=>selectEvent(editIndex-1)}>← {tr("Προηγούμενη","Previous")}</button><button type="button" disabled={editIndex===candidate!.events.length-1} onClick={()=>selectEvent(editIndex+1)}>{tr("Επόμενη","Next")} →</button><button type="button" onClick={()=>onSeek?.(edited.start)}>{tr("Άκουσε το σημείο","Listen to this event")}</button><button type="button" onClick={()=>{const issue=candidate!.audit.issues.find(issue=>issue.event>editIndex);if(issue)selectEvent(issue.event)}}>{tr("Επόμενο πρόβλημα","Next issue")}</button></div><p lang="en">{sourceEnglish.filter(cue=>cue.start<edited.start+edited.duration&&cue.start+cue.duration>edited.start).map(cue=>cue.text).join(" ")}</p><label>{tr("Ελληνικό κείμενο","Greek text")}<textarea value={edited.text} onChange={event=>editEvent({text:event.target.value})}/></label><div className="subtitle-event-times"><label>{tr("Έναρξη (δευτ.)","Start (sec)")}<input type="number" step="0.001" min="0" value={edited.start} onChange={event=>editEvent({start:Number(event.target.value)})}/></label><label>{tr("Διάρκεια (δευτ.)","Duration (sec)")}<input type="number" step="0.001" min="0.1" value={edited.duration} onChange={event=>editEvent({duration:Number(event.target.value)})}/></label></div><label className="subtitle-review-confirm"><input type="checkbox" checked={edited.timing==="audio_reviewed"} onChange={event=>editEvent({timing:event.target.checked?"audio_reviewed":"estimated"})}/>{tr("Η εμφάνιση ελέγχθηκε με τον ήχο.","This event was checked against the audio.")}</label></section>}
      <details className="subtitle-review-authoring"><summary>{tr("Εισαγωγή ελεγμένου timeline","Import reviewed timeline")}</summary><p>{tr("Κατέβασε την αναφορά και επιμελήσου τις εμφανίσεις χωρίς να αλλάξεις την πηγή. Η έγκριση χρειάζεται έλεγχο όλου του ήχου και της μετάφρασης.","Download the report and edit display events while preserving the source. Approval requires a full audio and translation review.")}</p><input ref={fileRef} type="file" accept=".json,application/json" aria-label={tr("Εισαγωγή αναφοράς","Import review report")} disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void loadFile(file)}}/>{candidate&&<><label>{tr("Σημείωση ελέγχου","Review note")}<textarea value={note} maxLength={2000} onChange={event=>setNote(event.target.value)} placeholder={tr("Τι ελέγχθηκε και με ποια πηγή ήχου;","What was checked and against which audio source?")}/></label><label className="subtitle-review-confirm"><input type="checkbox" checked={approved} onChange={event=>setApproved(event.target.checked)}/>{tr("Έλεγξα όλη τη μετάφραση και κάθε εμφάνιση με τον ήχο.","I reviewed the full translation and every display event against the audio.")}</label><div className="subtitle-quality-actions"><button type="button" disabled={busy} onClick={()=>void submit("draft")}>{tr("Αποθήκευση προσχεδίου","Save draft")}</button><button type="button" disabled={busy||!approved||note.trim().length<20||!candidate.audit.professionalReady} onClick={()=>void submit("publish")}>{tr("Έγκριση timeline","Approve timeline")}</button></div></>}</details>
    </>}
  </section>;
}

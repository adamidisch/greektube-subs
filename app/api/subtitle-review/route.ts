import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { database } from "@/db/postgres";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getTranscript, TRANSCRIPT_VERSION } from "../shared-cache";
import { publishTranscript, readPublishedTranscript } from "../transcript-blob";
import { subtitleContentHash, withSubtitleTrack } from "../subtitle-track";
import { pendingSubtitleDraft, reviewedTrack, saveReviewedTrack, saveSubtitleDraft } from "../subtitle-track-store";
import { subtitleTrackSrt, type SubtitleEvent, type TimedCue } from "@/app/subtitle-track";

export const dynamic="force-dynamic";

async function currentTranscript(videoId:string,allowDraft=false){
  const published=await readPublishedTranscript(videoId,TRANSCRIPT_VERSION,true);
  if(published&&Array.isArray(published.cues))return published;
  const record=await getTranscript(videoId);
  return record&&(record.status==="ready"||allowDraft&&record.status==="failed")?{status:"ready",videoId,transcriptVersion:TRANSCRIPT_VERSION,duration:record.duration,title:record.title,channel:record.channel,cues:record.greekTranscript,englishCues:record.englishTranscript}:null;
}

export async function GET(request:Request){
  const url=new URL(request.url),videoId=url.searchParams.get("videoId")||"";
  if(!/^[\w-]{11}$/.test(videoId))return NextResponse.json({error:"Μη έγκυρο βίντεο."},{status:400});
  try{
    const transcript=await currentTranscript(videoId,url.searchParams.get("draft")==="1");
    if(!transcript)return NextResponse.json({error:"Δεν βρέθηκε μεταγραφή."},{status:404});
    if(url.searchParams.get("draft")==="1"){
      if(!await verifyAdminSession(request))return NextResponse.json({error:"Απαιτείται εξουσιοδότηση διαχειριστή."},{status:401});
      const draft=await pendingSubtitleDraft(videoId);
      if(!draft)return NextResponse.json({error:"Δεν υπάρχει προσχέδιο για έλεγχο."},{status:404});
      if(draft.sourceHash!==subtitleContentHash((transcript.englishCues||[]) as TimedCue[]))return NextResponse.json({error:"Η πηγή του προσχεδίου έχει αλλάξει."},{status:409});
      return NextResponse.json({...draft,pending:true},{headers:{"Cache-Control":"private, no-store",...(url.searchParams.get("download")==="report"?{"Content-Disposition":`attachment; filename="${videoId}-subtitle-draft.json"`}:{})}});
    }
    const payload=withSubtitleTrack(transcript);
    if(url.searchParams.get("download")==="srt")return new Response(subtitleTrackSrt(payload.subtitleTrack.events),{headers:{"Content-Type":"application/x-subrip; charset=utf-8","Content-Disposition":`attachment; filename="${videoId}-display.srt"`,"Cache-Control":"no-store"}});
    return NextResponse.json({videoId,sourceHash:subtitleContentHash((transcript.englishCues||[]) as TimedCue[]),translationHash:subtitleContentHash(transcript.cues as TimedCue[]),track:payload.subtitleTrack,...(url.searchParams.get("download")==="report"?{source:transcript.englishCues,translation:transcript.cues}:{})},{headers:{"Cache-Control":"no-store",...(url.searchParams.get("download")==="report"?{"Content-Disposition":`attachment; filename="${videoId}-subtitle-review.json"`}:{})}});
  }catch{return NextResponse.json({error:"Δεν ολοκληρώθηκε ο έλεγχος υποτίτλων."},{status:503});}
}

export async function POST(request:Request){
  if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Μη έγκυρη προέλευση."},{status:403});
  if(!await verifyAdminSession(request))return NextResponse.json({error:"Απαιτείται εξουσιοδότηση διαχειριστή."},{status:401});
  if(process.env.VERCEL_ENV==="preview")return NextResponse.json({error:"Η δημοσίευση υποτίτλων είναι απενεργοποιημένη στο preview."},{status:409});
  let lockedVideo="",token="";
  try{
    const body=await request.json() as {videoId?:string;action?:string;sourceHash?:string;translationHash?:string;events?:SubtitleEvent[];bilingualReview?:unknown;reviewNote?:unknown;pending?:boolean};
    const videoId=body.videoId||"";
    if(!/^[\w-]{11}$/.test(videoId)||!["draft","publish"].includes(body.action||""))return NextResponse.json({error:"Μη έγκυρη ενέργεια."},{status:400});
    token=randomUUID();
    const now=new Date().toISOString(),expires=new Date(Date.now()+120000).toISOString();
    const rows=await database().query("UPDATE video_transcripts SET lock_token=$1,lock_expires_at=$2 WHERE video_id=$3 AND status IN ('ready','failed') AND (lock_token IS NULL OR lock_expires_at IS NULL OR lock_expires_at<$4) RETURNING video_id",[token,expires,videoId,now]) as {video_id:string}[];
    if(rows.length!==1)return NextResponse.json({error:"Η μεταγραφή ενημερώνεται ήδη. Δοκίμασε ξανά μόλις ολοκληρωθεί."},{status:409});
    lockedVideo=videoId;
    const transcript=await currentTranscript(videoId,body.pending===true);
    if(!transcript)throw new Error("Δεν βρέθηκε μεταγραφή.");
    const pending=body.pending?await pendingSubtitleDraft(videoId):null;
    if(body.pending&&!pending)throw new Error("Δεν υπάρχει το προσχέδιο.");
    const source=(transcript.englishCues||[]) as TimedCue[],translation=pending?pending.translation:transcript.cues as TimedCue[];
    if(pending&&pending.sourceHash!==subtitleContentHash(source))throw new Error("Η πηγή του προσχεδίου έχει αλλάξει.");
    if(!source.length)throw new Error("Χρειάζεται το αρχικό αγγλικό transcript.");
    if(body.sourceHash!==subtitleContentHash(source)||body.translationHash!==subtitleContentHash(translation))return NextResponse.json({error:"Η πηγή ή η μετάφραση άλλαξε. Φόρτωσε ξανά πριν συνεχίσεις."},{status:409});
    const draft=await saveSubtitleDraft(videoId,source,translation,body.events);
    if(body.action==="draft")return NextResponse.json(draft,{headers:{"Cache-Control":"no-store"}});
    const subtitleTrack=reviewedTrack(source,translation,body.events,body.bilingualReview,body.reviewNote);
    if(pending){await saveReviewedTrack(videoId,subtitleTrack);return NextResponse.json({ok:true,pending:true,message:"Το timeline εγκρίθηκε. Ολοκλήρωσε την εισαγωγή του ίδιου SRT για δημοσίευση."},{headers:{"Cache-Control":"no-store"}});}
    // Re-read after draft storage: do not apply a review to a concurrently edited translation.
    const latest=await currentTranscript(videoId);
    if(!latest||subtitleContentHash(latest.cues as TimedCue[])!==draft.translationHash||subtitleContentHash((latest.englishCues||[]) as TimedCue[])!==draft.sourceHash)return NextResponse.json({error:"Η μεταγραφή άλλαξε κατά τον έλεγχο."},{status:409});
    if(!await publishTranscript(videoId,TRANSCRIPT_VERSION,{...latest,subtitleTrack}))throw new Error("Δεν αποθηκεύτηκε το τελικό timeline.");
    return NextResponse.json({ok:true,subtitleTrack},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Ο έλεγχος απέτυχε."},{status:422});}
  finally{if(lockedVideo)await database().query("UPDATE video_transcripts SET lock_token=NULL,lock_expires_at=NULL WHERE video_id=$1 AND lock_token=$2",[lockedVideo,token]).catch(()=>undefined);}
}

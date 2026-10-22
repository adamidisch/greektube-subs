import {database} from "@/db/postgres";
import {completeTranscript,failTranscript,getTranscript,TRANSCRIPT_VERSION,type TranscriptRecord} from "../shared-cache";
import {matchesCanonicalManualSource} from "./integrity";
import {publishTranscript,publishTranscriptCheckpoint,readPublishedTranscript,readTranscriptCheckpoint} from "../transcript-blob";
import {approvedSubtitleTrack} from "../subtitle-track-store";
import {subtitleContentHash,withSubtitleTrack} from "../subtitle-track";
import type {TimedCue} from "@/app/subtitle-track";

/** Same guarded Blob → checkpoint/DB switch used by owner publishing. */
export async function commitManualCaptionImport(record:TranscriptRecord,token:string,previous:TranscriptRecord|null,extras:Record<string,unknown>={}){
  const videoId=record.videoId;
  const current=await getTranscript(videoId);
  const currentEnglish=current?.englishTranscript?.length?current.englishTranscript:current?.rawEnglishTranscript||[];
  if(currentEnglish.length&&!matchesCanonicalManualSource(record.englishTranscript,currentEnglish))throw Error("Η πηγή άλλαξε κατά την εισαγωγή. Φόρτωσε το νέο αγγλικό SRT.");
  const [previousPublished,previousCheckpoint,approved]=await Promise.all([
    readPublishedTranscript(videoId,TRANSCRIPT_VERSION,true),
    readTranscriptCheckpoint(videoId,TRANSCRIPT_VERSION,true),
    approvedSubtitleTrack(videoId,record.englishTranscript,record.greekTranscript),
  ]);
  const rows=await database().query("UPDATE video_transcripts SET lock_expires_at=$1 WHERE video_id=$2 AND lock_token=$3 RETURNING video_id",[new Date(Date.now()+180000).toISOString(),videoId,token]) as {video_id:string}[];
  if(rows.length!==1)throw Error("Η εισαγωγή έχασε το κλείδωμα πριν από τη δημοσίευση.");
  const payload={...extras,status:"ready",progress:100,videoId,title:record.title,channel:record.channel,duration:record.duration,sourceLanguage:"en",cues:record.greekTranscript,englishCues:record.englishTranscript,keyPoints:record.keyPoints,topics:record.topics,transcriptVersion:TRANSCRIPT_VERSION,...(approved?{subtitleTrack:approved}:{})};
  let committed=false;
  try{
    if(!await publishTranscript(videoId,TRANSCRIPT_VERSION,payload))throw Error("Δεν δημοσιεύτηκε το νέο αρχείο υποτίτλων.");
    if(!await completeTranscript(record,token))throw Error("Δεν επιβεβαιώθηκε η αποθήκευση της εισαγωγής.");
    committed=true;
    const live=await readPublishedTranscript(videoId,TRANSCRIPT_VERSION,true);
    if(!live||subtitleContentHash(live.cues as TimedCue[])!==subtitleContentHash(record.greekTranscript)||subtitleContentHash((live.englishCues||[]) as TimedCue[])!==subtitleContentHash(record.englishTranscript))throw Error("Η εισαγωγή αποθηκεύτηκε αλλά η τελική ανάγνωση χρειάζεται νέο έλεγχο.");
    return withSubtitleTrack(payload);
  }catch(error){
    if(!committed){
      const lease=await database().query("SELECT video_id FROM video_transcripts WHERE video_id=$1 AND lock_token=$2",[videoId,token]) as {video_id:string}[];
      if(lease.length){
        if(previousPublished&&!await publishTranscript(videoId,TRANSCRIPT_VERSION,previousPublished))throw Error("Η δημοσίευση και η επαναφορά απέτυχαν. Χρειάζεται έλεγχος διαχειριστή.");
        if(previousCheckpoint)await publishTranscriptCheckpoint(videoId,TRANSCRIPT_VERSION,previousCheckpoint);
        if(previous?.status==="ready")await completeTranscript(previous,token);
        else await failTranscript(videoId,token,"manual_import_publication_failed");
      }
    }
    throw error;
  }
}

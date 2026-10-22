import { get, list, put } from "@vercel/blob";
import { subtitleContentHash, subtitleTrackForPayload, type ReviewedSubtitleTrack } from "./subtitle-track";
import { legacySubtitleTrack, validateAuthoredEvents, type SubtitleEvent, type TimedCue } from "../subtitle-track";

export async function saveSubtitleDraft(videoId: string, source: TimedCue[], translation: TimedCue[], events?: SubtitleEvent[]) {
  const sourceHash=subtitleContentHash(source),translationHash=subtitleContentHash(translation);
  const track=events?validateAuthoredEvents(events,translation):legacySubtitleTrack(translation);
  const path=`subtitle-review/v1/${videoId}/${sourceHash}/${translationHash}.json`;
  const draft={videoId,sourceHash,translationHash,source,translation,track,createdAt:new Date().toISOString()};
  await put(path,JSON.stringify(draft),{access:"public",contentType:"application/json",addRandomSuffix:false,allowOverwrite:true});
  await put(`subtitle-review/v1/${videoId}/pending.json`,JSON.stringify({draftPath:path}),{access:"public",contentType:"application/json",addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60});
  return {draftPath:path,sourceHash,translationHash,audit:track.audit};
}

export async function pendingSubtitleDraft(videoId:string){
  const pointer=await readSubtitleDraft(`subtitle-review/v1/${videoId}/pending.json`) as {draftPath?:string}|null;
  if(!pointer?.draftPath?.startsWith(`subtitle-review/v1/${videoId}/`))return null;
  const draft=await readSubtitleDraft(pointer.draftPath) as {videoId:string;sourceHash:string;translationHash:string;source:TimedCue[];translation:TimedCue[];track:ReturnType<typeof legacySubtitleTrack>}|null;
  if(!draft||draft.videoId!==videoId||subtitleContentHash(draft.source)!==draft.sourceHash||subtitleContentHash(draft.translation)!==draft.translationHash)return null;
  return draft;
}

export async function saveReviewedTrack(videoId:string,track:ReviewedSubtitleTrack){
  await put(`subtitle-review/v1/${videoId}/${track.sourceHash}/${track.translationHash}.approved.json`,JSON.stringify(track),{access:"public",contentType:"application/json",addRandomSuffix:false,allowOverwrite:true});
}

export async function approvedSubtitleTrack(videoId:string,source:TimedCue[],translation:TimedCue[]){
  const candidate=await readSubtitleDraft(`subtitle-review/v1/${videoId}/${subtitleContentHash(source)}/${subtitleContentHash(translation)}.approved.json`).catch(()=>null);
  if(!candidate)return null;
  const track=subtitleTrackForPayload({cues:translation,englishCues:source,subtitleTrack:candidate});
  return track.origin==="authored"&&track.audit.professionalReady?track as ReviewedSubtitleTrack:null;
}

export async function readSubtitleDraft(path:string) {
  let blob=await get(path,{access:"public",useCache:false}).catch(()=>null);
  if(!blob?.stream){const result=await list({prefix:path,limit:2});const match=result.blobs.find(item=>item.pathname===path);if(match)blob=await get(match.url,{access:"public",useCache:false});}
  return blob?.stream?await new Response(blob.stream).json():null;
}

export function reviewedTrack(source:TimedCue[],translation:TimedCue[],events:unknown,bilingualReview:unknown,reviewNote:unknown):ReviewedSubtitleTrack {
  const track=validateAuthoredEvents(events,translation);
  if(bilingualReview!=="approved")throw new Error("Απαιτείται εγκεκριμένος έλεγχος μετάφρασης.");
  if(typeof reviewNote!=="string"||reviewNote.trim().length<20||reviewNote.length>2000)throw new Error("Κατάγραψε πώς ελέγχθηκαν το νόημα και ο συγχρονισμός με τον ήχο.");
  if(track.events.some(event=>event.timing!=="audio_reviewed"))throw new Error("Η χειροκίνητη δημοσίευση χρειάζεται ακουστικό έλεγχο κάθε εμφάνισης.");
  if(!track.audit.professionalReady)throw new Error(`Οι υπότιτλοι χρειάζονται έλεγχο: ${track.audit.issues.length} προβλήματα αναγνωσιμότητας. Επιβεβαίωση ήχου: ${track.audit.speechVerified?"ναι":"όχι"}.`);
  return {...track,sourceHash:subtitleContentHash(source),translationHash:subtitleContentHash(translation),reviewedAt:new Date().toISOString(),bilingualReview:"approved",reviewNote:reviewNote.trim()};
}

export class SubtitleReviewRequired extends Error{
  constructor(public draft:Awaited<ReturnType<typeof saveSubtitleDraft>>){super(`Η μετάφραση κρατήθηκε ως προσχέδιο για έλεγχο. ${draft.audit.fastPages} εμφανίσεις διαβάζονται πολύ γρήγορα. Δεν αντικαταστάθηκε η δημοσιευμένη έκδοση.`);this.name="SubtitleReviewRequired";}
}

export async function requireReadableImport(videoId:string,source:TimedCue[],translation:TimedCue[]){
  const track=legacySubtitleTrack(translation);
  if(track.audit.readable)return track.audit;
  const approved=await approvedSubtitleTrack(videoId,source,translation);
  if(approved)return approved.audit;
  throw new SubtitleReviewRequired(await saveSubtitleDraft(videoId,source,translation));
}

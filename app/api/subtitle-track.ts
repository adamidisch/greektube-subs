import { createHash } from "node:crypto";
import { legacySubtitleTrack, validateAuthoredEvents, type SubtitleTrack, type TimedCue } from "../subtitle-track.ts";

export function subtitleContentHash(cues: TimedCue[]) {
  return createHash("sha256").update(JSON.stringify(cues.map(c => [Math.round(c.start * 1000), Math.round(c.duration * 1000), c.text.replace(/\s+/gu," ").trim()]))).digest("hex");
}

export type ApprovalLevel = "audio_reviewed" | "owner_approved" | "auto_checked";
/** Levels whose gate is readability plus approved bilingual review, without per-event listening. */
const READABLE_LEVELS: ApprovalLevel[] = ["owner_approved", "auto_checked"];
export function approvalLevelOf(value: unknown): ApprovalLevel {
  return value === "owner_approved" || value === "auto_checked" ? value : "audio_reviewed";
}
export type ReviewedSubtitleTrack = SubtitleTrack & { sourceHash: string; translationHash: string; reviewedAt: string; bilingualReview: "approved"; reviewNote:string; approvalLevel?: ApprovalLevel };

/** audio_reviewed: every event was heard by a person. owner_approved: the owner approved the translation and readability; timing stays as the alignment recorded it (audio_aligned/estimated) and is never relabelled as heard. auto_checked: the automatic pipeline published it after every automatic gate passed (YouTube word timings, model translation plus independent model review, readability, numbers); nobody listened or read it. */
export function publishableTrack(track: SubtitleTrack, level: ApprovalLevel = "audio_reviewed") {
  if (track.origin !== "authored") return false;
  if (level === "auto_checked") return track.audit.readable && track.events.length > 0 && track.events.every(event => event.timing === "audio_aligned");
  if (READABLE_LEVELS.includes(level)) return track.audit.readable && track.events.length > 0;
  return track.audit.professionalReady && track.events.every(event => event.timing === "audio_reviewed");
}

export function reviewedTrack(source:TimedCue[],translation:TimedCue[],events:unknown,bilingualReview:unknown,reviewNote:unknown,audioEvidence?:unknown,approvalLevel:unknown="audio_reviewed"):ReviewedSubtitleTrack {
  if(approvalLevel!=="audio_reviewed"&&approvalLevel!=="owner_approved"&&approvalLevel!=="auto_checked")throw new Error("Μη έγκυρο επίπεδο έγκρισης.");
  if(audioEvidence && (audioEvidence as {sourceHash?:unknown}).sourceHash!==subtitleContentHash(source))throw Error("Audio source changed");
  const track=validateAuthoredEvents(events,translation,audioEvidence?{source,evidence:audioEvidence}:undefined);
  if(bilingualReview!=="approved")throw new Error("Απαιτείται εγκεκριμένος έλεγχος μετάφρασης.");
  if(typeof reviewNote!=="string"||reviewNote.trim().length<20||reviewNote.length>2000)throw new Error("Κατάγραψε πώς ελέγχθηκαν το νόημα και ο συγχρονισμός με τον ήχο.");
  if(approvalLevel==="auto_checked"&&track.events.some(event=>event.timing!=="audio_aligned"))throw new Error("Η αυτόματη δημοσίευση χρειάζεται χρόνους λέξεων από το YouTube σε κάθε εμφάνιση.");
  if(approvalLevel==="owner_approved"||approvalLevel==="auto_checked"){
    if(!track.audit.readable)throw new Error(`Οι υπότιτλοι χρειάζονται έλεγχο: ${track.audit.issues.length} προβλήματα αναγνωσιμότητας.`);
  }else{
    if(track.events.some(event=>event.timing!=="audio_reviewed"))throw new Error("Η χειροκίνητη δημοσίευση χρειάζεται ακουστικό έλεγχο κάθε εμφάνισης.");
    if(!track.audit.professionalReady)throw new Error(`Οι υπότιτλοι χρειάζονται έλεγχο: ${track.audit.issues.length} προβλήματα αναγνωσιμότητας. Επιβεβαίωση ήχου: ${track.audit.speechVerified?"ναι":"όχι"}.`);
  }
  return {...track,sourceHash:subtitleContentHash(source),translationHash:subtitleContentHash(translation),reviewedAt:new Date().toISOString(),bilingualReview:"approved",reviewNote:reviewNote.trim(),approvalLevel:approvalLevel as ApprovalLevel};
}


export function subtitleTrackForPayload(payload: { cues?: unknown; englishCues?: unknown; subtitleTrack?: unknown }): SubtitleTrack {
  const cues = Array.isArray(payload.cues) ? payload.cues as TimedCue[] : [];
  const english = Array.isArray(payload.englishCues) ? payload.englishCues as TimedCue[] : [];
  const candidate = payload.subtitleTrack as Partial<ReviewedSubtitleTrack> | null;
  if (candidate?.origin === "authored" && candidate.translationHash === subtitleContentHash(cues) && english.length>0 && candidate.sourceHash === subtitleContentHash(english) && candidate.bilingualReview === "approved" && typeof candidate.reviewNote==="string" && candidate.reviewNote.trim().length>=20) {
    try {
      if (candidate.audioEvidence && candidate.audioEvidence.sourceHash !== candidate.sourceHash) throw Error("Audio source changed");
      const track = validateAuthoredEvents(candidate.events, cues, candidate.audioEvidence ? { source: english, evidence: candidate.audioEvidence } : undefined);
      const level = approvalLevelOf(candidate.approvalLevel);
      if (publishableTrack(track, level)) return { ...candidate, ...track, approvalLevel: level } as ReviewedSubtitleTrack;
    } catch { /* A stale or malformed artifact cannot replace the source. */ }
  }
  return legacySubtitleTrack(cues);
}

export function withSubtitleTrack<T extends { cues?: unknown; englishCues?: unknown; subtitleTrack?: unknown }>(payload: T) {
  return { ...payload, subtitleTrack: subtitleTrackForPayload(payload) };
}

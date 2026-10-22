import { createHash } from "node:crypto";
import { legacySubtitleTrack, validateAuthoredEvents, type SubtitleTrack, type TimedCue } from "../subtitle-track.ts";

export function subtitleContentHash(cues: TimedCue[]) {
  return createHash("sha256").update(JSON.stringify(cues.map(c => [Math.round(c.start * 1000), Math.round(c.duration * 1000), c.text.replace(/\s+/gu," ").trim()]))).digest("hex");
}

export type ReviewedSubtitleTrack = SubtitleTrack & { sourceHash: string; translationHash: string; reviewedAt: string; bilingualReview: "approved"; reviewNote:string };

export function reviewedTrack(source:TimedCue[],translation:TimedCue[],events:unknown,bilingualReview:unknown,reviewNote:unknown,audioEvidence?:unknown):ReviewedSubtitleTrack {
  if(audioEvidence && (audioEvidence as {sourceHash?:unknown}).sourceHash!==subtitleContentHash(source))throw Error("Audio source changed");
  const track=validateAuthoredEvents(events,translation,audioEvidence?{source,evidence:audioEvidence}:undefined);
  if(bilingualReview!=="approved")throw new Error("Απαιτείται εγκεκριμένος έλεγχος μετάφρασης.");
  if(typeof reviewNote!=="string"||reviewNote.trim().length<20||reviewNote.length>2000)throw new Error("Κατάγραψε πώς ελέγχθηκαν το νόημα και ο συγχρονισμός με τον ήχο.");
  if(track.events.some(event=>event.timing!=="audio_reviewed"))throw new Error("Η χειροκίνητη δημοσίευση χρειάζεται ακουστικό έλεγχο κάθε εμφάνισης.");
  if(!track.audit.professionalReady)throw new Error(`Οι υπότιτλοι χρειάζονται έλεγχο: ${track.audit.issues.length} προβλήματα αναγνωσιμότητας. Επιβεβαίωση ήχου: ${track.audit.speechVerified?"ναι":"όχι"}.`);
  return {...track,sourceHash:subtitleContentHash(source),translationHash:subtitleContentHash(translation),reviewedAt:new Date().toISOString(),bilingualReview:"approved",reviewNote:reviewNote.trim()};
}


export function subtitleTrackForPayload(payload: { cues?: unknown; englishCues?: unknown; subtitleTrack?: unknown }): SubtitleTrack {
  const cues = Array.isArray(payload.cues) ? payload.cues as TimedCue[] : [];
  const english = Array.isArray(payload.englishCues) ? payload.englishCues as TimedCue[] : [];
  const candidate = payload.subtitleTrack as Partial<ReviewedSubtitleTrack> | null;
  if (candidate?.origin === "authored" && candidate.translationHash === subtitleContentHash(cues) && english.length>0 && candidate.sourceHash === subtitleContentHash(english) && candidate.bilingualReview === "approved" && typeof candidate.reviewNote==="string" && candidate.reviewNote.trim().length>=20) {
    try {
      if (candidate.audioEvidence && candidate.audioEvidence.sourceHash !== candidate.sourceHash) throw Error("Audio source changed");
      const track = validateAuthoredEvents(candidate.events, cues, candidate.audioEvidence ? { source: english, evidence: candidate.audioEvidence } : undefined);
      if (track.audit.professionalReady && track.events.every(event => event.timing === "audio_reviewed")) return { ...candidate, ...track } as ReviewedSubtitleTrack;
    } catch { /* A stale or malformed artifact cannot replace the source. */ }
  }
  return legacySubtitleTrack(cues);
}

export function withSubtitleTrack<T extends { cues?: unknown; englishCues?: unknown; subtitleTrack?: unknown }>(payload: T) {
  return { ...payload, subtitleTrack: subtitleTrackForPayload(payload) };
}

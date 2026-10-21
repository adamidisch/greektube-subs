import { createHash } from "node:crypto";
import { legacySubtitleTrack, validateAuthoredEvents, type SubtitleTrack, type TimedCue } from "../subtitle-track";

export function subtitleContentHash(cues: TimedCue[]) {
  return createHash("sha256").update(JSON.stringify(cues.map(c => [Math.round(c.start * 1000), Math.round(c.duration * 1000), c.text.replace(/\s+/gu," ").trim()]))).digest("hex");
}

export type ReviewedSubtitleTrack = SubtitleTrack & { sourceHash: string; translationHash: string; reviewedAt: string; bilingualReview: "approved"; reviewNote:string };

export function subtitleTrackForPayload(payload: { cues?: unknown; englishCues?: unknown; subtitleTrack?: unknown }): SubtitleTrack {
  const cues = Array.isArray(payload.cues) ? payload.cues as TimedCue[] : [];
  const english = Array.isArray(payload.englishCues) ? payload.englishCues as TimedCue[] : [];
  const candidate = payload.subtitleTrack as Partial<ReviewedSubtitleTrack> | null;
  if (candidate?.origin === "authored" && candidate.translationHash === subtitleContentHash(cues) && (!english.length || candidate.sourceHash === subtitleContentHash(english)) && candidate.bilingualReview === "approved" && typeof candidate.reviewNote==="string" && candidate.reviewNote.trim().length>=20) {
    try {
      const track = validateAuthoredEvents(candidate.events, cues);
      if (track.audit.professionalReady) return { ...candidate, ...track } as ReviewedSubtitleTrack;
    } catch { /* A stale or malformed artifact cannot replace the source. */ }
  }
  return legacySubtitleTrack(cues);
}

export function withSubtitleTrack<T extends { cues?: unknown; englishCues?: unknown; subtitleTrack?: unknown }>(payload: T) {
  return { ...payload, subtitleTrack: subtitleTrackForPayload(payload) };
}

import { createHash } from "node:crypto";
import { auditSubtitleEvents, subtitleInputKey, type SubtitleEvent, type TimedCue } from "../subtitle-track.ts";
import { subtitleContentHash, type ReviewedSubtitleTrack } from "./subtitle-track.ts";

/**
 * Published subtitles are stored as exact JSON text with SHA-256 hashes, so a reader can prove
 * that what it serves is byte-for-byte the version that was verified when it was published.
 */
export type PublishedBodies = { greekBody: string; englishBody: string; greekHash: string; englishHash: string; contentHash: string };

export function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function publishedBodies(greekPayload: Record<string, unknown>, englishCues: unknown[]): PublishedBodies {
  const greekBody = JSON.stringify(greekPayload), englishBody = JSON.stringify(englishCues);
  const greekHash = sha256(greekBody), englishHash = sha256(englishBody);
  return { greekBody, englishBody, greekHash, englishHash, contentHash: sha256(`${greekHash}:${englishHash}`) };
}

/** Throws when stored text does not match its hash: a damaged row is never served. */
export function verifiedBody(body: unknown, hash: unknown) {
  if (typeof body !== "string" || typeof hash !== "string" || sha256(body) !== hash) throw Error("Published subtitle hash mismatch");
  return JSON.parse(body) as unknown;
}

/**
 * One-time restorations of versions approved before Vercel Blob was suspended (24/11/2026).
 * The approved display events are the committed preview (7.22.1), pinned by hash, plus the
 * owner-approved fixes listed here. Nothing else may change.
 */
export const APPROVED_RESTORES: Record<string, { previewEventsSha256: string; eventCount: number; englishCueCount: number; fixes: { index: number; start: number; from: string; to: string }[]; reviewedAt: string; reviewNote: string }> = {
  xYB6uYyRjCA: {
    previewEventsSha256: "04601462565e283ed09180ebd08da839d823028abb8711277cdb38921d1bd83e",
    eventCount: 1513,
    englishCueCount: 1073,
    fixes: [{
      index: 351,
      start: 1579.039,
      from: "Νομίζω ότι όλοι πρέπει να παίρνουμε τουλάχιστον μία σταγόνα Lugol 15% κάθε μέρα",
      to: "Νομίζω, όλοι χρειαζόμαστε τουλάχιστον μία σταγόνα Lugol 15% τη μέρα",
    }, {
      index: 1334,
      start: 5975.84,
      from: "Και τα δύο σκοτώνουν όλα τα μικρόβια, κανένα δεν αντέχει.",
      to: "Βιταμίνη C και ιώδιο σκοτώνουν όλα τα μικρόβια, κανένα δεν αντέχει.",
    }],
    reviewedAt: "2026-11-26T17:30:00.000Z",
    reviewNote: "Εγκεκριμένη από τον ιδιοκτήτη (owner_approved, 24/11/2026 και 26/11/2026): οι εμφανίσεις της προεπισκόπησης 7.22.1 αυτούσιες, με μόνες αλλαγές τις φράσεις στο 26:19 και στο 1:39:35. Επαναφορά από το repo μετά την αναστολή του Blob· το αρχείο χρόνων λέξεων της έγκρισης χάθηκε μαζί με το Blob.",
  },
};

function timedCues(value: unknown, label: string): TimedCue[] {
  if (!Array.isArray(value) || !value.length) throw Error(`${label}: missing cues`);
  return value.map((item, index) => {
    const row = item as Record<string, unknown> | null;
    const start = Number(row?.start), duration = Number(row?.duration), text = row?.text;
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0 || typeof text !== "string" || !text.trim())
      throw Error(`${label}: invalid cue ${index + 1}`);
    return { start, duration, text };
  });
}

export function restoredSnapshot(videoId: string, transcriptVersion: number, previewEvents: unknown, englishInput: unknown, meta: { title?: unknown; channel?: unknown; duration?: unknown }) {
  const spec = APPROVED_RESTORES[videoId];
  if (!spec) throw Error("No approved restoration for this video");
  if (!Array.isArray(previewEvents) || sha256(JSON.stringify(previewEvents)) !== spec.previewEventsSha256) throw Error("Approved preview events changed");
  const events = structuredClone(previewEvents) as SubtitleEvent[];
  if (events.length !== spec.eventCount) throw Error("Unexpected event count");
  for (const fix of spec.fixes) {
    const event = events[fix.index];
    if (!event || event.start !== fix.start || event.text !== fix.from) throw Error(`Fix ${fix.index} does not match the approved preview`);
    event.text = fix.to;
  }
  const englishCues = timedCues(englishInput, "English");
  if (englishCues.length !== spec.englishCueCount) throw Error("English cue count differs from the approved source");
  const covered = new Set<number>();
  let previousStart = -Infinity;
  for (const event of events) {
    if (event.start < previousStart) throw Error("Events are not in time order");
    previousStart = event.start;
    for (const index of event.sourceIndices) {
      if (!Number.isInteger(index) || index < 0 || index >= englishCues.length) throw Error("Event maps outside the English source");
      covered.add(index);
    }
  }
  if (covered.size !== englishCues.length) throw Error("Events do not cover the English source");
  const audit = auditSubtitleEvents(events);
  if (!audit.readable) throw Error(`Approved events are not readable: ${audit.issues.length} issues`);
  // The Greek transcript panel shows exactly the approved display text.
  const cues: TimedCue[] = events.map(({ start, duration, text }) => ({ start, duration, text }));
  const lastEnd = Math.max(...events.map(event => event.start + event.duration));
  const duration = Number(meta.duration) > 0 ? Number(meta.duration) : Math.ceil(lastEnd);
  const subtitleTrack: ReviewedSubtitleTrack & { restoredFrom: string } = {
    schemaVersion: 1,
    inputKey: subtitleInputKey(cues),
    origin: "authored",
    events,
    audit,
    sourceHash: subtitleContentHash(englishCues),
    translationHash: subtitleContentHash(cues),
    reviewedAt: spec.reviewedAt,
    bilingualReview: "approved",
    reviewNote: spec.reviewNote,
    approvalLevel: "owner_approved",
    restoredFrom: `public/previews/${videoId}.json (7.22.1) + ${spec.fixes.length} approved fix`,
  };
  const payload = {
    status: "ready",
    videoId,
    transcriptVersion,
    title: typeof meta.title === "string" ? meta.title.slice(0, 300) : "",
    channel: typeof meta.channel === "string" ? meta.channel.slice(0, 200) : "",
    duration,
    sourceLanguage: "en",
    cues,
    subtitleTrack,
  };
  return { payload, englishCues };
}

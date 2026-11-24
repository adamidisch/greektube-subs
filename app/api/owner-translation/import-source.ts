import {
  acquireProcessingLock,
  completeTranscript,
  getTranscript,
  getTranscriptRowMeta,
  releaseProcessingLock,
  saveProcessingCheckpoint,
  type CachedCue,
} from "../shared-cache";
import { hasValidManualCueTimings, parseManualSubtitleText } from "../manual-captions/parser";
import { freezeOwnerSource, publishOwnerTranslation, validateOwnerGreek } from "./store";

const TIMING_TOLERANCE = 0.002;

export class OwnerImportError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "OwnerImportError"; }
}

function sameTimings(english: CachedCue[], greek: CachedCue[]) {
  return english.length === greek.length && english.every((cue, index) =>
    Math.abs(cue.start - greek[index].start) <= TIMING_TOLERANCE &&
    Math.abs(cue.duration - greek[index].duration) <= TIMING_TOLERANCE,
  );
}

/**
 * Replaces a video's canonical English source with a clean SRT and publishes the matching Greek SRT.
 * Shared by the owner import route and the automatic subtitle pipeline. Rolls back on failure.
 */
export async function importOwnerSourceSrt(videoId: string, sourceSubtitleText: string, subtitleText: string,
  fallbackMeta?: { title: string; channel: string; duration: number }) {
  const english = parseManualSubtitleText(sourceSubtitleText) as CachedCue[];
  const greek = parseManualSubtitleText(subtitleText) as CachedCue[];
  if (english.length < 3 || !hasValidManualCueTimings(english)) {
    throw new OwnerImportError("Το καθαρό αγγλικό SRT δεν περιέχει έγκυρα timed cues.", 400);
  }
  if (greek.length < 3 || !hasValidManualCueTimings(greek)) {
    throw new OwnerImportError("Το ελληνικό SRT δεν περιέχει έγκυρα timed cues.", 400);
  }
  if (!sameTimings(english, greek)) {
    throw new OwnerImportError("Το αγγλικό και το ελληνικό SRT πρέπει να έχουν ακριβώς τον ίδιο αριθμό και τα ίδια timestamps.", 400);
  }

  // A broken payload (missing Blob checkpoint) must not block a full clean-source replacement.
  const previous = await getTranscript(videoId).catch(() => null);
  // A video that was only added to the library has no transcript row yet: the lock below creates it.
  const meta = previous ?? await getTranscriptRowMeta(videoId) ?? fallbackMeta ?? { title: "", channel: "", duration: 0 };

  const token = crypto.randomUUID();
  let staged = false;
  try {
    if (!await acquireProcessingLock(videoId, token, true)) {
      throw new Error("Το βίντεο επεξεργάζεται αυτή τη στιγμή.");
    }

    const now = new Date().toISOString();
    const saved = await saveProcessingCheckpoint(videoId, token, {
      stage: "owner_source_import",
      cursor: english.length,
      progress: 90,
      rawEnglishTranscript: english,
      englishTranscript: english,
      greekTranscript: [],
      title: meta.title,
      channel: meta.channel,
      duration: Math.max(meta.duration, english.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0)),
      originalLanguage: "en",
    });
    if (!saved) throw new Error("Δεν αποθηκεύτηκε το canonical source checkpoint.");
    staged = true;

    await releaseProcessingLock(videoId, token);
    const frozen = await freezeOwnerSource(videoId, true);
    const validated = await validateOwnerGreek(videoId, subtitleText);
    if (!validated.validation.ok) throw new Error("Το ελληνικό SRT απέτυχε στο owner validation.");
    const published = await publishOwnerTranslation(videoId);

    return {
      status: "published" as const,
      manifest: published.manifest,
      validation: validated.validation,
      sourceCueCount: english.length,
      updatedAt: now,
      sourceRevisionCreated: frozen.created,
    };
  } catch (error) {
    if (staged && previous) {
      const rollbackToken = crypto.randomUUID();
      if (await acquireProcessingLock(videoId, rollbackToken, true)) {
        await completeTranscript(previous, rollbackToken).catch(() => undefined);
      }
    }
    await releaseProcessingLock(videoId, token).catch(() => undefined);
    throw error;
  }
}

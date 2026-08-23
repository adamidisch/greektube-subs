import type { SubtitleCue } from "./subtitle-contract";
import { fetchYouTubeNativeEnglish } from "./youtube-native-source";
import { fetchSupadataTranscript } from "../supadata";

export const CAPTION_ACQUISITION_VERSION = 4;

export type CaptionSourceProvenance = {
  provider: "youtube-direct" | "supadata";
  source: "youtube-manual" | "youtube-auto" | "supadata-native";
  languageCode: string;
  acquiredAt: string;
  providerDetail: string;
};

export type CaptionAcquisitionAttempt = {
  provider: CaptionSourceProvenance["provider"];
  status: "success" | "failed";
  elapsedMs: number;
  error?: string;
};

export type CaptionAcquisitionResult = {
  cues: SubtitleCue[];
  provenance: CaptionSourceProvenance;
  attempts: CaptionAcquisitionAttempt[];
};

function cleanCues(cues: SubtitleCue[]) {
  return cues
    .map(cue => ({
      start: Number(cue.start),
      duration: Number(cue.duration),
      text: String(cue.text || "").replace(/\s+/g, " ").trim(),
    }))
    .filter(cue => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.duration) && cue.start >= 0 && cue.duration > 0);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown-error");
}

/**
 * Cost-safe source acquisition, matching the behaviour that worked before 7.8:
 *
 * 1. Try native English timed text directly from YouTube (free).
 * 2. Only if that fails, make ONE Supadata native transcript request.
 *
 * There are deliberately no automatic Supadata retries here. The caller must
 * persist/freeze the first successful source immediately. Translation retries,
 * page polling and resume flows must reuse that stored source and must never
 * call this function again for the same subtitle revision.
 *
 * This function itself performs no database or Blob writes.
 */
export async function acquireEnglishCaptions(videoId: string): Promise<CaptionAcquisitionResult> {
  const attempts: CaptionAcquisitionAttempt[] = [];

  const youtubeStartedAt = Date.now();
  try {
    const direct = await fetchYouTubeNativeEnglish(videoId);
    const cues = cleanCues(direct.cues);
    if (!cues.length) throw new Error("empty-youtube-caption-source");

    attempts.push({ provider: "youtube-direct", status: "success", elapsedMs: Date.now() - youtubeStartedAt });
    return {
      cues,
      provenance: {
        provider: "youtube-direct",
        source: direct.source,
        languageCode: direct.languageCode || "en",
        acquiredAt: new Date().toISOString(),
        providerDetail: direct.client,
      },
      attempts,
    };
  } catch (error) {
    attempts.push({
      provider: "youtube-direct",
      status: "failed",
      elapsedMs: Date.now() - youtubeStartedAt,
      error: errorMessage(error),
    });
  }

  const supadataStartedAt = Date.now();
  try {
    // Paid fallback: exactly one primary /v1/transcript request per acquisition.
    const transcript = await fetchSupadataTranscript(videoId);
    const cues = cleanCues(transcript.cues);
    if (!cues.length) throw new Error("empty-supadata-caption-source");

    attempts.push({ provider: "supadata", status: "success", elapsedMs: Date.now() - supadataStartedAt });
    return {
      cues,
      provenance: {
        provider: "supadata",
        source: "supadata-native",
        languageCode: transcript.lang || "en",
        acquiredAt: new Date().toISOString(),
        providerDetail: "native-transcript-api",
      },
      attempts,
    };
  } catch (error) {
    attempts.push({
      provider: "supadata",
      status: "failed",
      elapsedMs: Date.now() - supadataStartedAt,
      error: errorMessage(error),
    });
  }

  const summary = attempts.map(item => `${item.provider}:${item.status}${item.error ? `:${item.error}` : ""}`).join(" | ");
  throw new Error(`caption-acquisition-failed:${summary}`);
}

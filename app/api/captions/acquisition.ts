import type { SubtitleCue } from "./subtitle-contract";
import { fetchSupadataTranscript } from "../supadata";

export const CAPTION_ACQUISITION_VERSION = 3;

export type CaptionSourceProvenance = {
  provider: "supadata";
  source: "supadata-native";
  languageCode: string;
  acquiredAt: string;
  providerDetail: "native-transcript-api";
};

export type CaptionAcquisitionAttempt = {
  provider: "supadata";
  status: "success" | "failed";
  elapsedMs: number;
  error?: string;
};

export type CaptionAcquisitionResult = {
  cues: SubtitleCue[];
  provenance: CaptionSourceProvenance;
  attempts: CaptionAcquisitionAttempt[];
};

/**
 * Acquire English timed captions exactly through the proven pre-7.8 path:
 * Supadata native transcript mode with lang=en. This function performs no
 * database or Blob writes; callers freeze the returned source separately.
 */
export async function acquireEnglishCaptions(videoId: string): Promise<CaptionAcquisitionResult> {
  const startedAt = Date.now();
  try {
    const transcript = await fetchSupadataTranscript(videoId);
    const cues = transcript.cues
      .map(cue => ({
        start: Number(cue.start),
        duration: Number(cue.duration),
        text: String(cue.text || "").replace(/\s+/g, " ").trim(),
      }))
      .filter(cue => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.duration) && cue.start >= 0 && cue.duration > 0);

    if (!cues.length) throw new Error("empty-caption-source");

    return {
      cues,
      provenance: {
        provider: "supadata",
        source: "supadata-native",
        languageCode: transcript.lang || "en",
        acquiredAt: new Date().toISOString(),
        providerDetail: "native-transcript-api",
      },
      attempts: [{ provider: "supadata", status: "success", elapsedMs: Date.now() - startedAt }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown-error");
    throw new Error(`caption-acquisition-failed:supadata:${message}`);
  }
}

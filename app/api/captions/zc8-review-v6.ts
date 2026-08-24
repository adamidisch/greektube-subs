import { get } from "@vercel/blob";

export const ZC8_REVIEW_VIDEO_ID = "zc8Nh4TMB1s";
export const ZC8_REVIEW_TITLE = "Λιπώδες Ήπαρ: Η Κρυφή Ζάχαρη που Επιβαρύνει το Συκώτι";
export const ZC8_REVIEW_ORIGINAL_TITLE = "Fatty Liver Expert: Your Liver Is Filling With Fat Right Now - Dr David Unwin";
export const ZC8_REVIEW_CHANNEL = "The Diary Of A CEO";
export const ZC8_REVIEW_DURATION = 7885;
export const ZC8_REVIEW_REVISION = "zc8-v6";
export const ZC8_REVIEW_BLOB_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/result.json";

export type Zc8ReviewCue = {
  start: number;
  duration: number;
  text: string;
  speaker?: string;
  speakerConfidence?: "high" | "medium" | "low";
  sourceIds?: string[];
  estimatedBoundary?: boolean;
};

export type Zc8ReviewResult = {
  revision: string;
  status: "ready";
  videoId: string;
  cues: Zc8ReviewCue[];
  quality: Record<string, unknown>;
  source: Record<string, unknown>;
  generatedAt: string;
};

function configured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}

export async function readZc8ReviewResult(): Promise<Zc8ReviewResult | null> {
  if (!configured()) return null;
  try {
    const blob = await get(ZC8_REVIEW_BLOB_PATH, { access: "public" });
    if (!blob?.stream) return null;
    const value = await new Response(blob.stream).json() as Partial<Zc8ReviewResult>;
    if (
      value.status !== "ready" ||
      value.revision !== ZC8_REVIEW_REVISION ||
      value.videoId !== ZC8_REVIEW_VIDEO_ID ||
      !Array.isArray(value.cues) ||
      value.cues.length === 0
    ) return null;
    return value as Zc8ReviewResult;
  } catch {
    return null;
  }
}

export function zc8ReviewHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-GreekTube-Subtitle-Review": ZC8_REVIEW_REVISION,
    "X-GreekTube-Translation-Mode": "review-v6-speaker-aware",
  };
}

export function zc8ReviewPayload(result: Zc8ReviewResult) {
  return {
    status: "ready",
    progress: 100,
    videoId: ZC8_REVIEW_VIDEO_ID,
    title: ZC8_REVIEW_TITLE,
    originalTitle: ZC8_REVIEW_ORIGINAL_TITLE,
    channel: ZC8_REVIEW_CHANNEL,
    originalVideoUrl: `https://www.youtube.com/watch?v=${ZC8_REVIEW_VIDEO_ID}`,
    duration: ZC8_REVIEW_DURATION,
    sourceLanguage: "en",
    cues: result.cues,
    translationMode: "review-v6",
    translationMethod: "plain_medical_greek_speaker_boundary_v6",
    reviewRevision: ZC8_REVIEW_REVISION,
    reviewQuality: result.quality,
    sourceProvenance: result.source,
    cached: true,
  };
}

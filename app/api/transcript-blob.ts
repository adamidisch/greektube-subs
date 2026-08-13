import { get, put } from "@vercel/blob";

type PublishedTranscript = {
  status?: unknown;
  videoId?: unknown;
  cues?: unknown;
  englishCues?: unknown;
  duration?: unknown;
  transcriptVersion?: unknown;
  [key: string]: unknown;
};

function configured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

function pathname(videoId: string, transcriptVersion: number) {
  return `transcripts/v${transcriptVersion}/${videoId}.json`;
}

function validPayload(value: unknown, videoId: string, transcriptVersion: number): value is PublishedTranscript {
  if (!value || typeof value !== "object") return false;
  const payload = value as PublishedTranscript;
  return payload.status === "ready" &&
    payload.videoId === videoId &&
    payload.transcriptVersion === transcriptVersion &&
    Array.isArray(payload.cues) &&
    payload.cues.length > 0;
}

export function transcriptBlobConfigured() {
  return configured();
}

export async function readPublishedTranscript(videoId: string, transcriptVersion: number) {
  if (!configured()) return null;
  try {
    const blob = await get(pathname(videoId, transcriptVersion), { access: "public" });
    if (!blob?.stream) return null;
    const payload = await new Response(blob.stream).json() as unknown;
    return validPayload(payload, videoId, transcriptVersion) ? payload : null;
  } catch (error) {
    console.warn("[transcript-blob:read-failed]", JSON.stringify({
      videoId,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return null;
  }
}

export async function publishTranscript(videoId: string, transcriptVersion: number, payload: unknown) {
  if (!configured() || !validPayload(payload, videoId, transcriptVersion)) return false;
  try {
    await put(pathname(videoId, transcriptVersion), JSON.stringify(payload), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 3600,
      contentType: "application/json; charset=utf-8",
    });
    return true;
  } catch (error) {
    console.warn("[transcript-blob:publish-failed]", JSON.stringify({
      videoId,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return false;
  }
}

// Redeploy marker: refresh Vercel runtime env after Blob store connection.

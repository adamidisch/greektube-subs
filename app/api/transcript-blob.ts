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

type PublishedEnglish = {
  videoId?: unknown;
  englishCues?: unknown;
  transcriptVersion?: unknown;
};

function configured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

function legacyPathname(videoId: string, transcriptVersion: number) {
  return `transcripts/v${transcriptVersion}/${videoId}.json`;
}

function greekPathname(videoId: string, transcriptVersion: number) {
  return `transcripts/v${transcriptVersion}/greek/${videoId}.json`;
}

function englishPathname(videoId: string, transcriptVersion: number) {
  return `transcripts/v${transcriptVersion}/english/${videoId}.json`;
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

function validEnglish(value: unknown, videoId: string, transcriptVersion: number): value is PublishedEnglish {
  if (!value || typeof value !== "object") return false;
  const payload = value as PublishedEnglish;
  return payload.videoId === videoId &&
    payload.transcriptVersion === transcriptVersion &&
    Array.isArray(payload.englishCues) &&
    payload.englishCues.length > 0;
}

async function readJson(pathname: string) {
  const blob = await get(pathname, { access: "public" });
  if (!blob?.stream) return null;
  return await new Response(blob.stream).json() as unknown;
}

function greekOnly(payload: PublishedTranscript): PublishedTranscript {
  const { englishCues: _englishCues, ...rest } = payload;
  return rest;
}

export function transcriptBlobConfigured() {
  return configured();
}

export async function readPublishedTranscript(videoId: string, transcriptVersion: number, includeEnglish = false) {
  if (!configured()) return null;
  try {
    let greekValue = await readJson(greekPathname(videoId, transcriptVersion));
    let legacyValue: unknown = null;

    if (!validPayload(greekValue, videoId, transcriptVersion)) {
      legacyValue = await readJson(legacyPathname(videoId, transcriptVersion));
      if (!validPayload(legacyValue, videoId, transcriptVersion)) return null;
      await publishTranscript(videoId, transcriptVersion, legacyValue);
      greekValue = greekOnly(legacyValue);
    }

    if (!validPayload(greekValue, videoId, transcriptVersion)) return null;
    if (!includeEnglish) return greekOnly(greekValue);

    const englishValue = await readJson(englishPathname(videoId, transcriptVersion));
    if (validEnglish(englishValue, videoId, transcriptVersion)) {
      return { ...greekOnly(greekValue), englishCues: englishValue.englishCues };
    }

    if (!legacyValue) legacyValue = await readJson(legacyPathname(videoId, transcriptVersion));
    if (validPayload(legacyValue, videoId, transcriptVersion) && Array.isArray(legacyValue.englishCues) && legacyValue.englishCues.length) {
      await publishTranscript(videoId, transcriptVersion, legacyValue);
      return { ...greekOnly(greekValue), englishCues: legacyValue.englishCues };
    }

    return null;
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
    const greekPayload = greekOnly(payload);
    const writes = [
      put(greekPathname(videoId, transcriptVersion), JSON.stringify(greekPayload), {
        access: "public" as const,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 3600,
        contentType: "application/json; charset=utf-8",
      }),
    ];

    if (Array.isArray(payload.englishCues) && payload.englishCues.length) {
      const englishPayload = { videoId, transcriptVersion, englishCues: payload.englishCues };
      writes.push(put(englishPathname(videoId, transcriptVersion), JSON.stringify(englishPayload), {
        access: "public" as const,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 3600,
        contentType: "application/json; charset=utf-8",
      }));
    }

    await Promise.all(writes);
    return true;
  } catch (error) {
    console.warn("[transcript-blob:publish-failed]", JSON.stringify({
      videoId,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return false;
  }
}

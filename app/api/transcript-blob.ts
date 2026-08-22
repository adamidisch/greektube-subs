import { get, put } from "@vercel/blob";
import { validateSubtitlePair, type SubtitleCue } from "./captions/subtitle-contract";

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

export type TranscriptCheckpointPayload = {
  videoId: string;
  transcriptVersion: number;
  status: "processing" | "ready" | "failed";
  processingStage: string | null;
  processingCursor: number;
  rawEnglishTranscript: unknown[];
  englishTranscript: unknown[];
  greekTranscript: unknown[];
  timestamps: unknown[];
  updatedAt: string;
};

const checkpointMemory = new Map<string, TranscriptCheckpointPayload>();

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

function checkpointPathname(videoId: string, transcriptVersion: number) {
  return `transcripts/v${transcriptVersion}/checkpoints/${videoId}.json`;
}

function checkpointKey(videoId: string, transcriptVersion: number) {
  return `${transcriptVersion}:${videoId}`;
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

function validCheckpoint(value: unknown, videoId: string, transcriptVersion: number): value is TranscriptCheckpointPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<TranscriptCheckpointPayload>;
  return payload.videoId === videoId &&
    payload.transcriptVersion === transcriptVersion &&
    (payload.status === "processing" || payload.status === "ready" || payload.status === "failed") &&
    Number.isInteger(payload.processingCursor) &&
    Array.isArray(payload.rawEnglishTranscript) &&
    Array.isArray(payload.englishTranscript) &&
    Array.isArray(payload.greekTranscript) &&
    Array.isArray(payload.timestamps) &&
    typeof payload.updatedAt === "string";
}

async function readJson(pathname: string) {
  const blob = await get(pathname, { access: "public" });
  if (!blob?.stream) return null;
  return await new Response(blob.stream).json() as unknown;
}

function cleanTrailingOrphanArticle(value: unknown) {
  if (typeof value !== "string") return value;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return text;

  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const greekLetters = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length ?? 0;
  const words = text.match(/\p{L}+/gu)?.length ?? 0;
  if (letters < 8 || words < 4 || greekLetters / letters < 0.45) return text;

  return text.replace(/\s+(?:α|a)([.!?…])?$/u, "$1").trim();
}

function greekOnly(payload: PublishedTranscript): PublishedTranscript {
  const { englishCues: _englishCues, ...rest } = payload;
  if (!Array.isArray(rest.cues)) return rest;
  return {
    ...rest,
    cues: rest.cues.map(cue => {
      if (!cue || typeof cue !== "object") return cue;
      const value = cue as Record<string, unknown>;
      return { ...value, text: cleanTrailingOrphanArticle(value.text) };
    }),
  };
}

export function transcriptBlobConfigured() {
  return configured();
}

export async function readTranscriptCheckpoint(videoId: string, transcriptVersion: number, fresh = false) {
  if (!configured()) return null;
  const key = checkpointKey(videoId, transcriptVersion);
  const cached = checkpointMemory.get(key);
  if (!fresh && cached) return cached;
  try {
    const value = await readJson(checkpointPathname(videoId, transcriptVersion));
    if (!validCheckpoint(value, videoId, transcriptVersion)) return null;
    checkpointMemory.set(key, value);
    return value;
  } catch (error) {
    console.warn("[transcript-blob:checkpoint-read-failed]", JSON.stringify({
      videoId,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return null;
  }
}

export async function publishTranscriptCheckpoint(
  videoId: string,
  transcriptVersion: number,
  payload: TranscriptCheckpointPayload,
) {
  if (!configured() || !validCheckpoint(payload, videoId, transcriptVersion)) return false;
  try {
    await put(checkpointPathname(videoId, transcriptVersion), JSON.stringify(payload), {
      access: "public" as const,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
    });
    checkpointMemory.set(checkpointKey(videoId, transcriptVersion), payload);
    return true;
  } catch (error) {
    console.warn("[transcript-blob:checkpoint-publish-failed]", JSON.stringify({
      videoId,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return false;
  }
}

export async function upsertTranscriptCheckpoint(
  videoId: string,
  transcriptVersion: number,
  patch: Partial<Omit<TranscriptCheckpointPayload, "videoId" | "transcriptVersion">>,
) {
  if (!configured()) return null;
  const current = await readTranscriptCheckpoint(videoId, transcriptVersion);
  const base: TranscriptCheckpointPayload = current || {
    videoId,
    transcriptVersion,
    status: "processing",
    processingStage: null,
    processingCursor: 0,
    rawEnglishTranscript: [],
    englishTranscript: [],
    greekTranscript: [],
    timestamps: [],
    updatedAt: new Date().toISOString(),
  };
  const next: TranscriptCheckpointPayload = {
    ...base,
    ...patch,
    videoId,
    transcriptVersion,
  };
  return await publishTranscriptCheckpoint(videoId, transcriptVersion, next) ? next : null;
}

export async function mergeTranscriptCheckpoint(
  videoId: string,
  transcriptVersion: number,
  patch: Partial<Omit<TranscriptCheckpointPayload, "videoId" | "transcriptVersion">>,
) {
  return Boolean(await upsertTranscriptCheckpoint(videoId, transcriptVersion, patch));
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
  if (Array.isArray(payload.englishCues) && payload.englishCues.length) {
    const contract = validateSubtitlePair(payload.englishCues as SubtitleCue[], payload.cues as SubtitleCue[]);
    if (!contract.ok) {
      console.warn("[transcript-blob:publish-contract-rejected]", JSON.stringify({
        videoId,
        transcriptVersion,
        errors: contract.errors.slice(0, 20),
      }));
      return false;
    }
  }
  try {
    const greekPayload = greekOnly(payload);
    const writes = [
      put(greekPathname(videoId, transcriptVersion), JSON.stringify(greekPayload), {
        access: "public" as const,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: "application/json; charset=utf-8",
      }),
    ];

    if (Array.isArray(payload.englishCues) && payload.englishCues.length) {
      const englishPayload = { videoId, transcriptVersion, englishCues: payload.englishCues };
      writes.push(put(englishPathname(videoId, transcriptVersion), JSON.stringify(englishPayload), {
        access: "public" as const,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
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

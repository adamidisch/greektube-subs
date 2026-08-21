import { database } from "@/db/postgres";
import {
  mergeTranscriptCheckpoint,
  publishTranscriptCheckpoint,
  readTranscriptCheckpoint,
  type TranscriptCheckpointPayload,
} from "./transcript-blob";

// v7.1.8 could replay a checkpoint after every lease reacquisition. Version
// 12 restarts only those corrupt partial results while retaining raw English.
// Keep this checkpoint version during the v7.1.13 timing migration so an
// already translated finalize checkpoint can be repaired without retranslation.
export const TRANSCRIPT_VERSION = 12;
export const MAX_TRANSIENT_RETRIES = 6;

export type CachedCue = { start: number; duration: number; text: string };

export type TranscriptRecord = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  originalLanguage: string;
  rawEnglishTranscript: CachedCue[];
  englishTranscript: CachedCue[];
  greekTranscript: CachedCue[];
  timestamps: { start: number; duration: number }[];
  topics: string[];
  keyPoints: string[];
  status: "processing" | "ready" | "failed";
  progress: number;
  lockExpiresAt?: string | null;
  processingStage?: string | null;
  processingCursor?: number;
  retryCount?: number;
  retryAfter?: string | null;
  groq429Streak?: number;
  groqCooldownUntil?: string | null;
  processingStartedAt?: string | null;
  error?: string | null;
  transcriptVersion: number;
  createdAt: string;
  updatedAt: string;
};

let transcriptTableReady: Promise<void> | null = null;

export function ensureTranscriptTable() {
  if (transcriptTableReady) return transcriptTableReady;
  transcriptTableReady = (async () => {
    const db = database();
    await db.query(
    `CREATE TABLE IF NOT EXISTS video_transcripts (
      video_id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      duration REAL NOT NULL DEFAULT 0,
      original_language TEXT NOT NULL DEFAULT 'unknown',
      raw_english_transcript TEXT NOT NULL DEFAULT '[]',
      english_transcript TEXT NOT NULL DEFAULT '[]',
      greek_transcript TEXT NOT NULL DEFAULT '[]',
      timestamps TEXT NOT NULL DEFAULT '[]',
      topics TEXT NOT NULL DEFAULT '[]',
      key_points TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'processing',
      progress INTEGER NOT NULL DEFAULT 0,
      lock_token TEXT,
      lock_expires_at TEXT,
      error TEXT,
      processing_stage TEXT,
      processing_cursor INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      retry_after TEXT,
      groq_429_streak INTEGER NOT NULL DEFAULT 0,
      groq_cooldown_until TEXT,
      processing_started_at TEXT,
      transcript_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    );
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS raw_english_transcript TEXT NOT NULL DEFAULT '[]'");
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS processing_stage TEXT");
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS processing_cursor INTEGER NOT NULL DEFAULT 0");
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0");
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS retry_after TEXT");
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS groq_429_streak INTEGER NOT NULL DEFAULT 0");
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS groq_cooldown_until TEXT");
    await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS processing_started_at TEXT");
    await db.query(
    "CREATE INDEX IF NOT EXISTS video_transcripts_status_idx ON video_transcripts (status, updated_at)",
    );
  })().catch((error: unknown) => {
    // A failed cold-start migration must be retryable by the next request.
    transcriptTableReady = null;
    throw error;
  });
  return transcriptTableReady;
}

type Row = {
  video_id: string; title: string; channel: string; thumbnail: string; duration: number;
  original_language: string; topics: string; key_points: string; status: TranscriptRecord["status"];
  progress: number; lock_expires_at: string | null; processing_stage: string | null; processing_cursor: number;
  retry_count: number; retry_after: string | null; groq_429_streak: number; groq_cooldown_until: string | null;
  processing_started_at: string | null;
  error: string | null; transcript_version: number; created_at: string; updated_at: string;
};

type PayloadRow = {
  raw_english_transcript: string;
  english_transcript: string;
  greek_transcript: string;
  timestamps: string;
};

function parseArray<T>(value: string | null | undefined): T[] {
  try {
    const parsed = JSON.parse(value || "[]") as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function checkpointMatchesRow(checkpoint: TranscriptCheckpointPayload | null, row: Row) {
  return Boolean(checkpoint &&
    checkpoint.status === row.status &&
    checkpoint.processingStage === (row.processing_stage || null) &&
    checkpoint.processingCursor === (row.processing_cursor || 0));
}

async function payloadForRow(row: Row) {
  const checkpoint = await readTranscriptCheckpoint(row.video_id, row.transcript_version);
  if (checkpointMatchesRow(checkpoint, row) && checkpoint) return checkpoint;

  // Migration/fallback path: only when Blob is missing or behind the durable
  // Neon cursor do we transfer the large TEXT columns. The result is immediately
  // published so subsequent processing reads stay off Neon.
  const db = database();
  const rows = await db.query(
    `SELECT raw_english_transcript, english_transcript, greek_transcript, timestamps
     FROM video_transcripts WHERE video_id = $1 LIMIT 1`,
    [row.video_id],
  ) as PayloadRow[];
  const payloadRow = rows[0];
  if (!payloadRow) return null;

  const snapshot: TranscriptCheckpointPayload = {
    videoId: row.video_id,
    transcriptVersion: row.transcript_version,
    status: row.status,
    processingStage: row.processing_stage || null,
    processingCursor: row.processing_cursor || 0,
    rawEnglishTranscript: parseArray<CachedCue>(payloadRow.raw_english_transcript),
    englishTranscript: parseArray<CachedCue>(payloadRow.english_transcript),
    greekTranscript: parseArray<CachedCue>(payloadRow.greek_transcript),
    timestamps: parseArray<{ start: number; duration: number }>(payloadRow.timestamps),
    updatedAt: row.updated_at,
  };
  await publishTranscriptCheckpoint(row.video_id, row.transcript_version, snapshot);
  return snapshot;
}

function normalizeReadyTranscriptOrder(
  greekTranscript: CachedCue[],
  englishTranscript: CachedCue[],
  timestamps: { start: number; duration: number }[],
) {
  const order = greekTranscript
    .map((cue, index) => ({ index, start: cue.start }))
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map(item => item.index);

  return {
    greekTranscript: order.map(index => greekTranscript[index]),
    englishTranscript: englishTranscript.length === greekTranscript.length
      ? order.map(index => englishTranscript[index])
      : englishTranscript,
    timestamps: timestamps.length === greekTranscript.length
      ? order.map(index => timestamps[index])
      : timestamps,
  };
}

export async function getTranscript(videoId: string) {
  await ensureTranscriptTable();
  const db = database();
  const rows = await db.query(
    `SELECT video_id, title, channel, thumbnail, duration, original_language,
      topics, key_points, status, progress, lock_expires_at, processing_stage,
      processing_cursor, retry_count, retry_after, groq_429_streak,
      groq_cooldown_until, processing_started_at, error, transcript_version,
      created_at, updated_at
     FROM video_transcripts WHERE video_id = $1 LIMIT 1`,
    [videoId],
  ) as Row[];
  const row = rows[0];
  if (!row) return null;

  const payload = await payloadForRow(row);
  if (!payload) return null;
  const storedGreekTranscript = payload.greekTranscript as CachedCue[];
  const storedEnglishTranscript = payload.englishTranscript as CachedCue[];
  const storedTimestamps = payload.timestamps as { start: number; duration: number }[];
  const hasReadyGreekTranslation = row.status === "ready" && storedGreekTranscript.length > 0;
  const readyOrder = hasReadyGreekTranslation
    ? normalizeReadyTranscriptOrder(storedGreekTranscript, storedEnglishTranscript, storedTimestamps)
    : null;
  const greekTranscript = readyOrder?.greekTranscript || storedGreekTranscript;
  const englishTranscript = readyOrder?.englishTranscript || storedEnglishTranscript;
  const timestamps = readyOrder?.timestamps || storedTimestamps;
  return {
    videoId: row.video_id,
    title: row.title,
    channel: row.channel,
    thumbnail: row.thumbnail,
    duration: row.duration,
    originalLanguage: row.original_language,
    rawEnglishTranscript: payload.rawEnglishTranscript as CachedCue[],
    englishTranscript,
    greekTranscript,
    timestamps,
    topics: parseArray<string>(row.topics),
    keyPoints: parseArray<string>(row.key_points),
    status: row.status,
    progress: row.progress,
    lockExpiresAt: row.lock_expires_at,
    processingStage: row.processing_stage,
    processingCursor: row.processing_cursor || 0,
    retryCount: row.retry_count || 0,
    retryAfter: row.retry_after,
    groq429Streak: row.groq_429_streak || 0,
    groqCooldownUntil: row.groq_cooldown_until,
    processingStartedAt: row.processing_started_at,
    error: row.error,
    transcriptVersion: hasReadyGreekTranslation ? TRANSCRIPT_VERSION : row.transcript_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies TranscriptRecord;
}

export type TranscriptStatusRecord = {
  videoId: string;
  status: TranscriptRecord["status"];
  progress: number;
  lockExpiresAt?: string | null;
  processingStage?: string | null;
  processingCursor: number;
  retryCount: number;
  retryAfter?: string | null;
  groq429Streak: number;
  groqCooldownUntil?: string | null;
  processingStartedAt?: string | null;
  error?: string | null;
  transcriptVersion: number;
  createdAt: string;
  updatedAt: string;
  rawEnglishCount: number;
  englishCount: number;
  greekCount: number;
  keyPoints: string[];
};

type StatusRow = {
  video_id: string;
  status: TranscriptRecord["status"];
  progress: number;
  lock_expires_at: string | null;
  processing_stage: string | null;
  processing_cursor: number;
  retry_count: number;
  retry_after: string | null;
  groq_429_streak: number;
  groq_cooldown_until: string | null;
  processing_started_at: string | null;
  error: string | null;
  transcript_version: number;
  created_at: string;
  updated_at: string;
  raw_english_count: number | string;
  english_count: number | string;
  greek_count: number | string;
  key_points: string;
};

/**
 * Lightweight status read for readiness checks and processing telemetry.
 * Deliberately avoids transferring the large transcript TEXT columns from Neon.
 */
export async function getTranscriptStatus(videoId: string): Promise<TranscriptStatusRecord | null> {
  await ensureTranscriptTable();
  const db = database();
  const rows = await db.query(
    `SELECT
      video_id, status, progress, lock_expires_at, processing_stage, processing_cursor,
      retry_count, retry_after, groq_429_streak, groq_cooldown_until, processing_started_at,
      error, transcript_version, created_at, updated_at, key_points,
      jsonb_array_length(COALESCE(NULLIF(raw_english_transcript, ''), '[]')::jsonb) AS raw_english_count,
      jsonb_array_length(COALESCE(NULLIF(english_transcript, ''), '[]')::jsonb) AS english_count,
      jsonb_array_length(COALESCE(NULLIF(greek_transcript, ''), '[]')::jsonb) AS greek_count
     FROM video_transcripts WHERE video_id = $1 LIMIT 1`,
    [videoId],
  ) as StatusRow[];
  const row = rows[0];
  if (!row) return null;
  const greekCount = Number(row.greek_count) || 0;
  const hasReadyGreekTranslation = row.status === "ready" && greekCount > 0;
  return {
    videoId: row.video_id,
    status: row.status,
    progress: row.progress,
    lockExpiresAt: row.lock_expires_at,
    processingStage: row.processing_stage,
    processingCursor: row.processing_cursor || 0,
    retryCount: row.retry_count || 0,
    retryAfter: row.retry_after,
    groq429Streak: row.groq_429_streak || 0,
    groqCooldownUntil: row.groq_cooldown_until,
    processingStartedAt: row.processing_started_at,
    error: row.error,
    transcriptVersion: hasReadyGreekTranslation ? TRANSCRIPT_VERSION : row.transcript_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rawEnglishCount: Number(row.raw_english_count) || 0,
    englishCount: Number(row.english_count) || 0,
    greekCount,
    keyPoints: parseArray<string>(row.key_points),
  };
}

export async function acquireProcessingLock(videoId: string, token: string, force = false) {
  await ensureTranscriptTable();
  const db = database();
  const now = new Date();
  const expires = new Date(now.getTime() + 180_000).toISOString();
  const rows = await db.query(
    `INSERT INTO video_transcripts (
      video_id, status, progress, lock_token, lock_expires_at, processing_stage, transcript_version, processing_started_at, created_at, updated_at
    ) VALUES ($1, 'processing', 3, $2, $3, 'source', $4, $5, $6, $7)
    ON CONFLICT(video_id) DO UPDATE SET
      status = 'processing',
      -- Reacquiring an expired/released lease continues the exact checkpoint.
      progress = CASE WHEN $8 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version THEN 3
                      ELSE GREATEST(video_transcripts.progress, 3) END,
      processing_stage = CASE WHEN $8 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version THEN NULL
                              ELSE video_transcripts.processing_stage END,
      processing_cursor = CASE WHEN $8 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version THEN 0
                               ELSE video_transcripts.processing_cursor END,
      retry_count = CASE WHEN $8 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version OR video_transcripts.status = 'failed' THEN 0
                         ELSE video_transcripts.retry_count END,
      retry_after = NULL,
      processing_started_at = CASE
        WHEN $8 = 1 OR video_transcripts.transcript_version != EXCLUDED.transcript_version THEN EXCLUDED.processing_started_at
        ELSE COALESCE(video_transcripts.processing_started_at, EXCLUDED.processing_started_at)
      END,
      lock_token = EXCLUDED.lock_token, lock_expires_at = EXCLUDED.lock_expires_at, error = NULL,
      transcript_version = EXCLUDED.transcript_version, updated_at = EXCLUDED.updated_at
    WHERE $8 = 1
       OR video_transcripts.transcript_version != EXCLUDED.transcript_version
       OR video_transcripts.status = 'failed'
       OR video_transcripts.lock_expires_at IS NULL
       OR video_transcripts.lock_expires_at < EXCLUDED.updated_at
    RETURNING video_id`,
    [videoId, token, expires, TRANSCRIPT_VERSION, now.toISOString(), now.toISOString(), now.toISOString(), force ? 1 : 0],
  ) as { video_id: string }[];
  return rows.length > 0;
}

export async function updateProcessingProgress(videoId: string, token: string, progress: number) {
  const db = database();
  const rows = await db.query(
    "UPDATE video_transcripts SET progress = GREATEST(progress, $1), lock_expires_at = $2, updated_at = $3 WHERE video_id = $4 AND lock_token = $5 RETURNING video_id",
    [progress, new Date(Date.now()+180_000).toISOString(), new Date().toISOString(), videoId, token],
  ) as { video_id: string }[];
  return rows.length === 1;
}

export async function completeTranscript(record: TranscriptRecord, token: string) {
  const db = database();
  const rows = await db.query(
    `UPDATE video_transcripts SET
      title = $1, channel = $2, thumbnail = $3, duration = $4, original_language = $5,
      raw_english_transcript = $6, english_transcript = $7, greek_transcript = $8, timestamps = $9, topics = $10, key_points = $11,
      status = 'ready', progress = 100, lock_token = NULL, lock_expires_at = NULL, error = NULL, retry_count = 0, retry_after = NULL,
      processing_stage = NULL, processing_cursor = 0,
      transcript_version = $12, updated_at = $13
    WHERE video_id = $14 AND lock_token = $15
    RETURNING video_id`,
    [record.title, record.channel, record.thumbnail, record.duration, record.originalLanguage,
      JSON.stringify(record.rawEnglishTranscript), JSON.stringify(record.englishTranscript), JSON.stringify(record.greekTranscript),
      JSON.stringify(record.timestamps), JSON.stringify(record.topics), JSON.stringify(record.keyPoints),
      record.transcriptVersion, record.updatedAt, record.videoId, token],
  ) as { video_id: string }[];
  if (rows.length === 1) {
    await publishTranscriptCheckpoint(record.videoId, record.transcriptVersion, {
      videoId: record.videoId,
      transcriptVersion: record.transcriptVersion,
      status: "ready",
      processingStage: null,
      processingCursor: 0,
      rawEnglishTranscript: record.rawEnglishTranscript,
      englishTranscript: record.englishTranscript,
      greekTranscript: record.greekTranscript,
      timestamps: record.timestamps,
      updatedAt: record.updatedAt,
    });
  }
  return rows.length === 1;
}

export type ProcessingCheckpoint = {
  stage: string;
  cursor: number;
  progress: number;
  rawEnglishTranscript?: CachedCue[];
  englishTranscript?: CachedCue[];
  greekTranscript?: CachedCue[];
  title?: string;
  channel?: string;
  duration?: number;
  originalLanguage?: string;
};

function baseCheckpointStage(stage: string) {
  return stage.endsWith("_google") ? stage.slice(0, -7) : stage;
}

function shouldSyncCheckpointBlob(checkpoint: ProcessingCheckpoint) {
  const hasPayload = checkpoint.rawEnglishTranscript !== undefined ||
    checkpoint.englishTranscript !== undefined || checkpoint.greekTranscript !== undefined;
  if (!hasPayload) return false;
  if (checkpoint.rawEnglishTranscript !== undefined) return true;
  const stage = baseCheckpointStage(checkpoint.stage);
  if (stage === "repair" || stage === "source_el_finalize" || stage === "finalize") return true;
  if (stage === "translate") return checkpoint.progress >= 90 || checkpoint.cursor % 24 === 0;
  return false;
}

export async function saveProcessingCheckpoint(videoId: string, token: string, checkpoint: ProcessingCheckpoint) {
  const db = database();
  const now = new Date().toISOString();
  const rows = await db.query(
    `UPDATE video_transcripts SET
      processing_stage = $1, processing_cursor = $2, progress = GREATEST(progress, $3), retry_count = 0, retry_after = NULL, error = NULL,
      raw_english_transcript = COALESCE($4, raw_english_transcript),
      english_transcript = COALESCE($5, english_transcript),
      greek_transcript = COALESCE($6, greek_transcript),
      title = COALESCE($7, title), channel = COALESCE($8, channel),
      duration = COALESCE($9, duration), original_language = COALESCE($10, original_language),
      updated_at = $11, lock_expires_at = $12
     WHERE video_id = $13 AND lock_token = $14
     RETURNING video_id`,
    [checkpoint.stage, checkpoint.cursor, checkpoint.progress,
      checkpoint.rawEnglishTranscript ? JSON.stringify(checkpoint.rawEnglishTranscript) : null,
      checkpoint.englishTranscript ? JSON.stringify(checkpoint.englishTranscript) : null,
      checkpoint.greekTranscript ? JSON.stringify(checkpoint.greekTranscript) : null,
      checkpoint.title ?? null, checkpoint.channel ?? null, checkpoint.duration ?? null, checkpoint.originalLanguage ?? null,
      now, new Date(Date.now()+180_000).toISOString(), videoId, token],
  ) as { video_id: string }[];

  if (rows.length === 1 && shouldSyncCheckpointBlob(checkpoint)) {
    const patch: Partial<Omit<TranscriptCheckpointPayload, "videoId" | "transcriptVersion">> = {
      status: "processing",
      processingStage: checkpoint.stage,
      processingCursor: checkpoint.cursor,
      updatedAt: now,
    };
    if (checkpoint.rawEnglishTranscript !== undefined) patch.rawEnglishTranscript = checkpoint.rawEnglishTranscript;
    if (checkpoint.englishTranscript !== undefined) patch.englishTranscript = checkpoint.englishTranscript;
    if (checkpoint.greekTranscript !== undefined) patch.greekTranscript = checkpoint.greekTranscript;
    await mergeTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, patch);
  }
  return rows.length === 1;
}

export async function resetProcessingForTranslation(videoId: string, token: string, keepRaw = true) {
  const db = database();
  const now = new Date().toISOString();
  const rows = await db.query(
    `UPDATE video_transcripts SET status='processing', progress=$1, processing_stage=$2, processing_cursor=0,
      raw_english_transcript = CASE WHEN $3 = 1 THEN raw_english_transcript ELSE '[]' END,
      english_transcript='[]', greek_transcript='[]', timestamps='[]', topics='[]', key_points='[]',
      error=NULL, retry_count=0, retry_after=NULL, updated_at=$4
     WHERE video_id=$5 AND lock_token=$6
     RETURNING video_id`,
    [keepRaw ? 28 : 3, keepRaw ? 'repair' : 'source', keepRaw ? 1 : 0, now, videoId, token],
  ) as { video_id: string }[];
  if (rows.length === 1) {
    await mergeTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, {
      status: "processing",
      processingStage: keepRaw ? "repair" : "source",
      processingCursor: 0,
      ...(keepRaw ? {} : { rawEnglishTranscript: [] }),
      englishTranscript: [],
      greekTranscript: [],
      timestamps: [],
      updatedAt: now,
    });
  }
  return rows.length === 1;
}

export async function releaseProcessingLock(videoId: string, token: string) {
  const db = database();
  const rows = await db.query(
    "UPDATE video_transcripts SET lock_token=NULL, lock_expires_at=NULL, updated_at=$1 WHERE video_id=$2 AND lock_token=$3 AND status='processing' RETURNING video_id",
    [new Date().toISOString(), videoId, token],
  ) as { video_id: string }[];
  return rows.length === 1;
}

export async function recordGroqRateLimit(videoId: string, token: string, retryAfterSeconds?: number) {
  const db = database();
  // Keep the provider pause short and bounded. It is durable per transcript,
  // so new serverless slices see it instead of immediately rate-limiting again.
  const cooldownSeconds = Math.max(20, Math.min(120, Math.ceil(retryAfterSeconds || 30)));
  const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1_000).toISOString();
  const rows = await db.query(
    `UPDATE video_transcripts SET
      groq_429_streak = groq_429_streak + 1,
      groq_cooldown_until = CASE
        WHEN groq_429_streak + 1 >= 2 THEN CASE
          WHEN groq_cooldown_until IS NOT NULL AND groq_cooldown_until > $1 THEN groq_cooldown_until
          ELSE $1
        END
        ELSE groq_cooldown_until
      END,
      updated_at = $2, lock_expires_at = $3
     WHERE video_id = $4 AND lock_token = $5
     RETURNING groq_429_streak, groq_cooldown_until`,
    [cooldownUntil, new Date().toISOString(), new Date(Date.now() + 180_000).toISOString(), videoId, token],
  ) as { groq_429_streak: number; groq_cooldown_until: string | null }[];
  return rows[0] || null;
}

export async function recordGroqProviderSuccess(videoId: string, token: string) {
  const db = database();
  const rows = await db.query(
    `UPDATE video_transcripts SET groq_429_streak = 0, groq_cooldown_until = NULL,
      updated_at = $1, lock_expires_at = $2
     WHERE video_id = $3 AND lock_token = $4
     RETURNING video_id`,
    [new Date().toISOString(), new Date(Date.now() + 180_000).toISOString(), videoId, token],
  ) as { video_id: string }[];
  return rows.length === 1;
}

export async function recordTransientProcessingFailure(videoId: string, token: string, message: string) {
  const db = database();
  const now = new Date();
  const retryAfter = new Date(now.getTime() + 2_000).toISOString();
  const rows = await db.query(
    `UPDATE video_transcripts SET
      retry_count = retry_count + 1, retry_after = $1, error = $2,
      lock_token = NULL, lock_expires_at = NULL, updated_at = $3,
      status = CASE WHEN retry_count + 1 >= $4 THEN 'failed' ELSE 'processing' END
     WHERE video_id = $5 AND lock_token = $6
     RETURNING status, retry_count, retry_after`,
    [retryAfter, message.slice(0, 500), now.toISOString(), MAX_TRANSIENT_RETRIES, videoId, token],
  ) as { status: TranscriptRecord["status"]; retry_count: number; retry_after: string | null }[];
  if (rows[0]?.status === "failed") {
    await mergeTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, { status: "failed", updatedAt: now.toISOString() });
  }
  return rows[0] || null;
}

export async function recordRecoverableProcessingFailure(
  videoId: string,
  token: string,
  message: string,
  retryAfterSeconds = 5,
) {
  const db = database();
  const now = new Date();
  const delay = Math.max(2, Math.min(60, Math.ceil(retryAfterSeconds)));
  const retryAfter = new Date(now.getTime() + delay * 1_000).toISOString();
  const rows = await db.query(
    `UPDATE video_transcripts SET
      retry_count = retry_count + 1, retry_after = $1, error = $2,
      lock_token = NULL, lock_expires_at = NULL, updated_at = $3, status = 'processing'
     WHERE video_id = $4 AND lock_token = $5
     RETURNING status, retry_count, retry_after`,
    [retryAfter, message.slice(0, 500), now.toISOString(), videoId, token],
  ) as { status: TranscriptRecord["status"]; retry_count: number; retry_after: string | null }[];
  return rows[0] || null;
}

export async function failTranscript(videoId: string, token: string, message: string) {
  const db = database();
  const now = new Date().toISOString();
  const rows = await db.query(
    `UPDATE video_transcripts SET status = 'failed', error = $1,
      lock_token = NULL, lock_expires_at = NULL, updated_at = $2
     WHERE video_id = $3 AND lock_token = $4
     RETURNING video_id`,
    [message.slice(0, 500), now, videoId, token],
  ) as { video_id: string }[];
  if (rows.length === 1) {
    await mergeTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, { status: "failed", updatedAt: now });
  }
}
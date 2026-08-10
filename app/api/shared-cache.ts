import { database } from "@/db/postgres";

export const TRANSCRIPT_VERSION = 6;

export type CachedCue = { start: number; duration: number; text: string };

export type TranscriptRecord = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  originalLanguage: string;
  englishTranscript: CachedCue[];
  greekTranscript: CachedCue[];
  timestamps: { start: number; duration: number }[];
  topics: string[];
  keyPoints: string[];
  status: "processing" | "ready" | "failed";
  progress: number;
  lockExpiresAt?: string | null;
  transcriptVersion: number;
  createdAt: string;
  updatedAt: string;
};

export async function ensureTranscriptTable() {
  const db = database();
  await db.query(
    `CREATE TABLE IF NOT EXISTS video_transcripts (
      video_id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      duration REAL NOT NULL DEFAULT 0,
      original_language TEXT NOT NULL DEFAULT 'unknown',
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
      transcript_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS video_transcripts_status_idx ON video_transcripts (status, updated_at)",
  );
}

type Row = {
  video_id: string; title: string; channel: string; thumbnail: string; duration: number;
  original_language: string; english_transcript: string; greek_transcript: string;
  timestamps: string; topics: string; key_points: string; status: TranscriptRecord["status"];
  progress: number; lock_expires_at: string | null; transcript_version: number; created_at: string; updated_at: string;
};

export async function getTranscript(videoId: string) {
  await ensureTranscriptTable();
  const db = database();
  const rows = await db.query("SELECT * FROM video_transcripts WHERE video_id = $1 LIMIT 1", [videoId]) as Row[];
  const row = rows[0];
  if (!row) return null;
  return {
    videoId: row.video_id,
    title: row.title,
    channel: row.channel,
    thumbnail: row.thumbnail,
    duration: row.duration,
    originalLanguage: row.original_language,
    englishTranscript: JSON.parse(row.english_transcript || "[]"),
    greekTranscript: JSON.parse(row.greek_transcript || "[]"),
    timestamps: JSON.parse(row.timestamps || "[]"),
    topics: JSON.parse(row.topics || "[]"),
    keyPoints: JSON.parse(row.key_points || "[]"),
    status: row.status,
    progress: row.progress,
    lockExpiresAt: row.lock_expires_at,
    transcriptVersion: row.transcript_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies TranscriptRecord;
}

export async function acquireProcessingLock(videoId: string, token: string, force = false) {
  await ensureTranscriptTable();
  const db = database();
  const now = new Date();
  const expires = new Date(now.getTime() + 600_000).toISOString();
  const rows = await db.query(
    `INSERT INTO video_transcripts (
      video_id, status, progress, lock_token, lock_expires_at, transcript_version, created_at, updated_at
    ) VALUES ($1, 'processing', 3, $2, $3, $4, $5, $6)
    ON CONFLICT(video_id) DO UPDATE SET
      status = 'processing', progress = 3, lock_token = EXCLUDED.lock_token,
      lock_expires_at = EXCLUDED.lock_expires_at, error = NULL,
      transcript_version = EXCLUDED.transcript_version, updated_at = EXCLUDED.updated_at
    WHERE $7 = 1
       OR video_transcripts.transcript_version != EXCLUDED.transcript_version
       OR video_transcripts.status = 'failed'
       OR video_transcripts.lock_expires_at IS NULL
       OR video_transcripts.lock_expires_at < EXCLUDED.updated_at
    RETURNING video_id`,
    [videoId, token, expires, TRANSCRIPT_VERSION, now.toISOString(), now.toISOString(), force ? 1 : 0],
  ) as { video_id: string }[];
  return rows.length > 0;
}

export async function updateProcessingProgress(videoId: string, token: string, progress: number) {
  const db = database();
  await db.query(
    "UPDATE video_transcripts SET progress = $1, lock_expires_at = $2, updated_at = $3 WHERE video_id = $4 AND lock_token = $5",
    [progress, new Date(Date.now()+600_000).toISOString(), new Date().toISOString(), videoId, token],
  );
}

export async function completeTranscript(record: TranscriptRecord, token: string) {
  const db = database();
  await db.query(
    `UPDATE video_transcripts SET
      title = $1, channel = $2, thumbnail = $3, duration = $4, original_language = $5,
      english_transcript = $6, greek_transcript = $7, timestamps = $8, topics = $9, key_points = $10,
      status = 'ready', progress = 100, lock_token = NULL, lock_expires_at = NULL, error = NULL,
      transcript_version = $11, updated_at = $12
    WHERE video_id = $13 AND lock_token = $14`,
    [record.title, record.channel, record.thumbnail, record.duration, record.originalLanguage,
      JSON.stringify(record.englishTranscript), JSON.stringify(record.greekTranscript),
      JSON.stringify(record.timestamps), JSON.stringify(record.topics), JSON.stringify(record.keyPoints),
      record.transcriptVersion, record.updatedAt, record.videoId, token],
  );
}

export async function failTranscript(videoId: string, token: string, message: string) {
  const db = database();
  await db.query(
    `UPDATE video_transcripts SET status = 'failed', progress = 0, error = $1,
      lock_token = NULL, lock_expires_at = NULL, updated_at = $2
     WHERE video_id = $3 AND lock_token = $4`,
    [message.slice(0, 500), new Date().toISOString(), videoId, token],
  );
}

export const TRANSCRIPT_VERSION = 4;

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

async function db() {
  const workers = await import("cloudflare:workers");
  return workers.env.DB;
}

export async function ensureTranscriptTable() {
  const database = await db();
  await database.prepare(
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
  ).run();
  await database.prepare(
    "CREATE INDEX IF NOT EXISTS video_transcripts_status_idx ON video_transcripts (status, updated_at)",
  ).run();
}

type Row = {
  video_id: string; title: string; channel: string; thumbnail: string; duration: number;
  original_language: string; english_transcript: string; greek_transcript: string;
  timestamps: string; topics: string; key_points: string; status: TranscriptRecord["status"];
  progress: number; lock_expires_at: string | null; transcript_version: number; created_at: string; updated_at: string;
};

export async function getTranscript(videoId: string) {
  await ensureTranscriptTable();
  const database = await db();
  const row = await database.prepare("SELECT * FROM video_transcripts WHERE video_id = ?")
    .bind(videoId).first<Row>();
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
  const database = await db();
  const now = new Date();
  const expires = new Date(now.getTime() + 600_000).toISOString();
  const result = await database.prepare(
    `INSERT INTO video_transcripts (
      video_id, status, progress, lock_token, lock_expires_at, transcript_version, created_at, updated_at
    ) VALUES (?, 'processing', 3, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      status = 'processing', progress = 3, lock_token = excluded.lock_token,
      lock_expires_at = excluded.lock_expires_at, error = NULL,
      transcript_version = excluded.transcript_version, updated_at = excluded.updated_at
    WHERE ? = 1
       OR video_transcripts.transcript_version != excluded.transcript_version
       OR video_transcripts.status = 'failed'
       OR video_transcripts.lock_expires_at IS NULL
       OR video_transcripts.lock_expires_at < excluded.updated_at`,
  ).bind(videoId, token, expires, TRANSCRIPT_VERSION, now.toISOString(), now.toISOString(), force ? 1 : 0).run();
  return Number(result.meta?.changes || 0) > 0;
}

export async function updateProcessingProgress(videoId: string, token: string, progress: number) {
  const database = await db();
  await database.prepare(
    "UPDATE video_transcripts SET progress = ?, lock_expires_at = ?, updated_at = ? WHERE video_id = ? AND lock_token = ?",
  ).bind(progress, new Date(Date.now()+600_000).toISOString(), new Date().toISOString(), videoId, token).run();
}

export async function completeTranscript(record: TranscriptRecord, token: string) {
  const database = await db();
  await database.prepare(
    `UPDATE video_transcripts SET
      title = ?, channel = ?, thumbnail = ?, duration = ?, original_language = ?,
      english_transcript = ?, greek_transcript = ?, timestamps = ?, topics = ?, key_points = ?,
      status = 'ready', progress = 100, lock_token = NULL, lock_expires_at = NULL, error = NULL,
      transcript_version = ?, updated_at = ?
    WHERE video_id = ? AND lock_token = ?`,
  ).bind(
    record.title, record.channel, record.thumbnail, record.duration, record.originalLanguage,
    JSON.stringify(record.englishTranscript), JSON.stringify(record.greekTranscript),
    JSON.stringify(record.timestamps), JSON.stringify(record.topics), JSON.stringify(record.keyPoints),
    record.transcriptVersion, record.updatedAt, record.videoId, token,
  ).run();
}

export async function failTranscript(videoId: string, token: string, message: string) {
  const database = await db();
  await database.prepare(
    `UPDATE video_transcripts SET status = 'failed', progress = 0, error = ?,
      lock_token = NULL, lock_expires_at = NULL, updated_at = ?
     WHERE video_id = ? AND lock_token = ?`,
  ).bind(message.slice(0, 500), new Date().toISOString(), videoId, token).run();
}

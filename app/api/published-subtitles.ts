import { database } from "@/db/postgres";
import { publishedBodies, verifiedBody } from "./published-subtitles-core";
import { markVerifiedSnapshotTrack } from "./subtitle-track";

/**
 * Neon is the primary store for published subtitles (Vercel Blob is no longer written).
 * Each row is immutable text plus hashes; the latest row per video is the live version.
 */
type Stored = { payload: Record<string, unknown>; englishCues?: unknown[]; contentHash: string };

const CACHE_MS = 60_000;
const memory = new Map<string, { at: number; value: Stored }>();
const fromNeon = new WeakSet<object>();
let ensured: Promise<void> | null = null;

function ensureTable() {
  ensured ??= (async () => {
    const db = database();
    await db.query(`CREATE TABLE IF NOT EXISTS published_subtitles (
      id BIGSERIAL PRIMARY KEY,
      video_id TEXT NOT NULL,
      transcript_version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      greek_hash TEXT NOT NULL,
      english_hash TEXT NOT NULL,
      greek_body TEXT NOT NULL,
      english_body TEXT NOT NULL,
      origin TEXT NOT NULL,
      published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (video_id, transcript_version, content_hash)
    )`);
    await db.query("CREATE INDEX IF NOT EXISTS published_subtitles_latest_idx ON published_subtitles (video_id, transcript_version, published_at DESC, id DESC)");
  })().catch(error => { ensured = null; throw error; });
  return ensured;
}

function cacheKey(videoId: string, transcriptVersion: number, includeEnglish: boolean) {
  return `${transcriptVersion}:${videoId}:${includeEnglish ? "en" : "el"}`;
}

/** True when this payload object was read from hash-verified Neon storage in this request. */
export function publishedFromNeon(value: unknown) {
  return Boolean(value && typeof value === "object" && fromNeon.has(value));
}

function served(value: Stored) {
  const payload = { ...value.payload };
  markVerifiedSnapshotTrack(payload.subtitleTrack);
  fromNeon.add(payload);
  return { payload, englishCues: value.englishCues, contentHash: value.contentHash };
}

export async function readNeonPublished(videoId: string, transcriptVersion: number, includeEnglish: boolean) {
  const key = cacheKey(videoId, transcriptVersion, includeEnglish);
  const cached = memory.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return served(cached.value);
  await ensureTable();
  const columns = includeEnglish ? "content_hash, greek_hash, greek_body, english_hash, english_body" : "content_hash, greek_hash, greek_body";
  const rows = await database().query(
    `SELECT ${columns} FROM published_subtitles WHERE video_id = $1 AND transcript_version = $2 ORDER BY published_at DESC, id DESC LIMIT 1`,
    [videoId, transcriptVersion],
  ) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;
  const payload = verifiedBody(row.greek_body, row.greek_hash) as Record<string, unknown>;
  const englishCues = includeEnglish ? verifiedBody(row.english_body, row.english_hash) as unknown[] : undefined;
  if (payload?.videoId !== videoId || payload.transcriptVersion !== transcriptVersion) throw Error("Published subtitle row does not match its video");
  const value: Stored = { payload, englishCues, contentHash: String(row.content_hash) };
  memory.set(key, { at: Date.now(), value });
  return served(value);
}

export async function writeNeonPublished(videoId: string, transcriptVersion: number, greekPayload: Record<string, unknown>, englishCues: unknown[], origin: "publish" | "restore") {
  await ensureTable();
  const bodies = publishedBodies(greekPayload, englishCues);
  await database().query(
    `INSERT INTO published_subtitles (video_id, transcript_version, content_hash, greek_hash, english_hash, greek_body, english_body, origin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (video_id, transcript_version, content_hash) DO UPDATE SET published_at = now(), origin = EXCLUDED.origin`,
    [videoId, transcriptVersion, bodies.contentHash, bodies.greekHash, bodies.englishHash, bodies.greekBody, bodies.englishBody, origin],
  );
  // Read back and compare hashes: the publish only counts once Neon holds the exact text.
  memory.delete(cacheKey(videoId, transcriptVersion, false));
  memory.delete(cacheKey(videoId, transcriptVersion, true));
  const stored = await readNeonPublished(videoId, transcriptVersion, true);
  if (!stored || stored.contentHash !== bodies.contentHash) throw Error("Published subtitles were not confirmed in Neon");
  return bodies.contentHash;
}

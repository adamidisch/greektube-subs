import { createHash } from "crypto";
import { get, put } from "@vercel/blob";
import { database } from "@/db/postgres";
import { NextResponse } from "next/server";
import { numberTokensMatch } from "../../captions/numeric-integrity";
import { canonicalCueHash, canonicalEnglishForImport } from "../../manual-captions/canonical-source";
import { acquireProcessingLock, completeTranscript, TRANSCRIPT_VERSION } from "../../shared-cache";
import { assembledNatashaTranslation, auditNatashaTranslation } from "../audit/route";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = false;

const VIDEO_ID = "fX2z-BF8Jac";
const EXPECTED_CUES = 3086;
const EXPECTED_SOURCE_HASH = "61c564d0f35b83db04aedffaedd1c808d2b405294f5d8f0799ed36b04ba155a8";
const CHECKPOINT_PATH = `transcripts/v${TRANSCRIPT_VERSION}/checkpoints/${VIDEO_ID}.json`;
const BACKUP_PATH = `transcripts/v${TRANSCRIPT_VERSION}/backups/${VIDEO_ID}-pre-owner-import-${EXPECTED_SOURCE_HASH.slice(0, 12)}.json`;

type Cue = { start: number; duration: number; text: string };
type DbRow = {
  title: string; channel: string; thumbnail: string; duration: number; original_language: string;
  topics: string; key_points: string; status: string; progress: number;
  raw_english_count: number; english_count: number; greek_count: number;
  processing_stage: string | null; processing_cursor: number; retry_count: number; retry_after: string | null;
  groq_429_streak: number; groq_cooldown_until: string | null; processing_started_at: string | null;
  error: string | null; transcript_version: number; created_at: string; updated_at: string;
};
type Checkpoint = {
  videoId?: unknown; transcriptVersion?: unknown; status?: unknown; processingStage?: unknown; processingCursor?: unknown;
  rawEnglishTranscript?: unknown; englishTranscript?: unknown; greekTranscript?: unknown; timestamps?: unknown; updatedAt?: unknown;
};

function stringArray(value: string) {
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.filter(v => typeof v === "string") as string[] : []; }
  catch { return [] as string[]; }
}

function hashCues(cues: Cue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${cue.text.replace(/\s+/g, " ").trim()}\n`);
  return hash.digest("hex");
}

async function checkpointText() {
  const blob = await get(CHECKPOINT_PATH, { access: "public" });
  if (!blob?.stream) throw new Error("Natasha checkpoint Blob is unavailable");
  return await new Response(blob.stream).text();
}

async function restore(db: ReturnType<typeof database>, before: DbRow, previousCheckpoint: string) {
  await put(CHECKPOINT_PATH, previousCheckpoint, {
    access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
    contentType: "application/json; charset=utf-8",
  });
  await db.query(
    `UPDATE video_transcripts SET title=$1, channel=$2, thumbnail=$3, duration=$4, original_language=$5,
      topics=$6, key_points=$7, status=$8, progress=$9, raw_english_count=$10, english_count=$11, greek_count=$12,
      processing_stage=$13, processing_cursor=$14, retry_count=$15, retry_after=$16, groq_429_streak=$17,
      groq_cooldown_until=$18, processing_started_at=$19, error=$20, transcript_version=$21, created_at=$22,
      updated_at=$23, lock_token=NULL, lock_expires_at=NULL WHERE video_id=$24`,
    [before.title, before.channel, before.thumbnail, before.duration, before.original_language, before.topics, before.key_points,
      before.status, before.progress, before.raw_english_count, before.english_count, before.greek_count, before.processing_stage,
      before.processing_cursor, before.retry_count, before.retry_after, before.groq_429_streak, before.groq_cooldown_until,
      before.processing_started_at, before.error, before.transcript_version, before.created_at, before.updated_at, VIDEO_ID],
  );
}

export async function GET() {
  const environment = process.env.VERCEL_ENV || "";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
  if (environment !== "preview" || branch !== "temp/natasha-owner-import") {
    return NextResponse.json({ skipped: true, environment, branch });
  }

  const structural = auditNatashaTranslation();
  if (!structural.ok || structural.count !== EXPECTED_CUES) throw new Error(`Structural QA failed: ${JSON.stringify(structural)}`);

  const canonical = await canonicalEnglishForImport(VIDEO_ID);
  if (canonical.cues.length !== EXPECTED_CUES || canonical.sourceHash !== EXPECTED_SOURCE_HASH) {
    throw new Error(`Canonical mismatch: ${canonical.cues.length}/${canonical.sourceHash}`);
  }

  const rows = assembledNatashaTranslation();
  const greekCues = canonical.cues.map((source, index) => {
    const row = rows[index];
    if (!row || row[0] !== index + 1) throw new Error(`Cue mapping mismatch at ${index + 1}`);
    const text = row[1].replace(/\s+/g, " ").trim();
    if (!text) throw new Error(`Empty Greek cue ${index + 1}`);
    if (/\[\s*\d+\s*\]/.test(text)) throw new Error(`Marker artifact at cue ${index + 1}`);
    if (!numberTokensMatch(source.text, text)) throw new Error(`Numeric mismatch at cue ${index + 1}`);
    return { start: source.start, duration: source.duration, text };
  });
  const greekHash = hashCues(greekCues);

  const db = database();
  const rowsBefore = await db.query(
    `SELECT title, channel, thumbnail, duration, original_language, topics, key_points, status, progress,
      raw_english_count, english_count, greek_count, processing_stage, processing_cursor, retry_count, retry_after,
      groq_429_streak, groq_cooldown_until, processing_started_at, error, transcript_version, created_at, updated_at
     FROM video_transcripts WHERE video_id=$1 LIMIT 1`, [VIDEO_ID],
  ) as DbRow[];
  const before = rowsBefore[0];
  if (!before) throw new Error("Natasha Neon row missing");

  const previousCheckpoint = await checkpointText();
  const previous = JSON.parse(previousCheckpoint) as Checkpoint;
  const rawEnglish = Array.isArray(previous.rawEnglishTranscript) ? previous.rawEnglishTranscript as Cue[] : [];
  if (!rawEnglish.length) throw new Error("Raw English backup is empty");

  await put(BACKUP_PATH, previousCheckpoint, {
    access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
    contentType: "application/json; charset=utf-8",
  });

  try {
    const lockToken = crypto.randomUUID();
    if (!await acquireProcessingLock(VIDEO_ID, lockToken, true)) throw new Error("Natasha import lock failed");

    const now = new Date().toISOString();
    const cueDuration = greekCues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
    const duration = Math.max(Number(before.duration) || 0, cueDuration);
    const topics = stringArray(before.topics);
    const keyPoints = greekCues
      .filter((_, index) => index % Math.max(1, Math.floor(greekCues.length / 10)) === 0)
      .map(cue => cue.text).filter(text => text.length > 18).slice(0, 10);

    const record = {
      videoId: VIDEO_ID,
      title: before.title || "Let Food Be Thy Medicine",
      channel: before.channel || "YouTube",
      thumbnail: before.thumbnail || `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      duration,
      originalLanguage: before.original_language || "en",
      rawEnglishTranscript: rawEnglish,
      englishTranscript: canonical.cues,
      greekTranscript: greekCues,
      timestamps: canonical.cues.map(cue => ({ start: cue.start, duration: cue.duration })),
      topics, keyPoints, status: "ready" as const, progress: 100,
      transcriptVersion: TRANSCRIPT_VERSION, createdAt: before.created_at || now, updatedAt: now,
    };
    if (!await completeTranscript(record, lockToken)) throw new Error("completeTranscript returned false");

    const neonRows = await db.query(
      `SELECT status, progress, transcript_version, raw_english_count, english_count, greek_count,
        processing_stage, processing_cursor, updated_at FROM video_transcripts WHERE video_id=$1 LIMIT 1`, [VIDEO_ID],
    ) as Array<Record<string, unknown>>;
    const neon = neonRows[0];
    if (!neon || neon.status !== "ready" || Number(neon.progress) !== 100 || Number(neon.transcript_version) !== TRANSCRIPT_VERSION ||
        Number(neon.raw_english_count) !== rawEnglish.length || Number(neon.english_count) !== EXPECTED_CUES || Number(neon.greek_count) !== EXPECTED_CUES ||
        neon.processing_stage !== null || Number(neon.processing_cursor) !== 0) {
      throw new Error(`Neon read-back failed: ${JSON.stringify(neon)}`);
    }

    const savedText = await checkpointText();
    const saved = JSON.parse(savedText) as Checkpoint;
    const savedEnglish = Array.isArray(saved.englishTranscript) ? saved.englishTranscript as Cue[] : [];
    const savedGreek = Array.isArray(saved.greekTranscript) ? saved.greekTranscript as Cue[] : [];
    const savedRaw = Array.isArray(saved.rawEnglishTranscript) ? saved.rawEnglishTranscript as Cue[] : [];
    const savedTimestamps = Array.isArray(saved.timestamps) ? saved.timestamps : [];
    const blobEnglishHash = savedEnglish.length ? canonicalCueHash(savedEnglish) : "";
    const blobGreekHash = savedGreek.length ? hashCues(savedGreek) : "";
    if (saved.status !== "ready" || saved.transcriptVersion !== TRANSCRIPT_VERSION || saved.processingStage !== null || Number(saved.processingCursor) !== 0 ||
        savedRaw.length !== rawEnglish.length || savedEnglish.length !== EXPECTED_CUES || savedGreek.length !== EXPECTED_CUES || savedTimestamps.length !== EXPECTED_CUES ||
        blobEnglishHash !== EXPECTED_SOURCE_HASH || blobGreekHash !== greekHash) {
      throw new Error(`Blob read-back failed: ${JSON.stringify({ status:saved.status, version:saved.transcriptVersion, raw:savedRaw.length, english:savedEnglish.length, greek:savedGreek.length, timestamps:savedTimestamps.length, blobEnglishHash, blobGreekHash })}`);
    }

    const result = {
      ok: true, videoId: VIDEO_ID, transcriptVersion: TRANSCRIPT_VERSION,
      sourceHash: EXPECTED_SOURCE_HASH, greekHash, rawEnglishCount: savedRaw.length,
      englishCount: savedEnglish.length, greekCount: savedGreek.length, timestampCount: savedTimestamps.length,
      backupPath: BACKUP_PATH, neon,
    };
    console.info("[natasha-owner-import:success]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[natasha-owner-import:rollback]", error);
    await restore(db, before, previousCheckpoint).catch(rollbackError => console.error("[natasha-owner-import:rollback-failed]", rollbackError));
    throw error;
  }
}

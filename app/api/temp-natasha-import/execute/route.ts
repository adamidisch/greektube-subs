import { createHash } from "crypto";
import { get, put } from "@vercel/blob";
import { database } from "@/db/postgres";
import { NextResponse } from "next/server";
import { numberTokensMatch } from "../../captions/numeric-integrity";
import { canonicalEnglishForImport } from "../../manual-captions/canonical-source";
import {
  acquireProcessingLock,
  completeTranscript,
  TRANSCRIPT_VERSION,
} from "../../shared-cache";
import { publishTranscript } from "../../transcript-blob";
import { assembledNatashaTranslation, auditNatashaTranslation } from "../audit/route";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = false;

const VIDEO_ID = "fX2z-BF8Jac";
const EXPECTED_CUES = 3086;
const EXPECTED_SOURCE_HASH = "61c564d0f35b83db04aedffaedd1c808d2b405294f5d8f0799ed36b04ba155a8";
const GREEK_TITLE = "Ας γίνει η τροφή το φάρμακό σου";
const CHECKPOINT_PATH = `transcripts/v${TRANSCRIPT_VERSION}/checkpoints/${VIDEO_ID}.json`;
const BACKUP_PATH = `transcripts/v${TRANSCRIPT_VERSION}/backups/${VIDEO_ID}-pre-owner-import-${EXPECTED_SOURCE_HASH.slice(0, 12)}.json`;

type DbSnapshot = {
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  original_language: string;
  topics: string;
  key_points: string;
  status: string;
  progress: number;
  raw_english_count: number;
  english_count: number;
  greek_count: number;
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
};

type CheckpointPayload = {
  rawEnglishTranscript?: unknown;
  englishTranscript?: unknown;
  greekTranscript?: unknown;
  timestamps?: unknown;
};

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") as string[] : [];
  } catch {
    return [] as string[];
  }
}

function greekHash(cues: { start: number; duration: number; text: string }[]) {
  const hash = createHash("sha256");
  for (const cue of cues) hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${cue.text.replace(/\s+/g, " ").trim()}\n`);
  return hash.digest("hex");
}

function greekRatio(text: string) {
  const letters = text.match(/\p{L}/gu)?.length || 0;
  const greek = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters ? greek / letters : 0;
}

async function readCheckpointText() {
  const blob = await get(CHECKPOINT_PATH, { access: "public" });
  if (!blob?.stream) throw new Error("Natasha checkpoint Blob missing before import");
  return await new Response(blob.stream).text();
}

async function restoreState(db: ReturnType<typeof database>, before: DbSnapshot, checkpointText: string) {
  await put(CHECKPOINT_PATH, checkpointText, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json; charset=utf-8",
  });
  await db.query(
    `UPDATE video_transcripts SET
      title=$1, channel=$2, thumbnail=$3, duration=$4, original_language=$5,
      topics=$6, key_points=$7, status=$8, progress=$9,
      raw_english_count=$10, english_count=$11, greek_count=$12,
      processing_stage=$13, processing_cursor=$14, retry_count=$15, retry_after=$16,
      groq_429_streak=$17, groq_cooldown_until=$18, processing_started_at=$19,
      error=$20, transcript_version=$21, created_at=$22, updated_at=$23,
      lock_token=NULL, lock_expires_at=NULL
     WHERE video_id=$24`,
    [
      before.title, before.channel, before.thumbnail, before.duration, before.original_language,
      before.topics, before.key_points, before.status, before.progress,
      before.raw_english_count, before.english_count, before.greek_count,
      before.processing_stage, before.processing_cursor, before.retry_count, before.retry_after,
      before.groq_429_streak, before.groq_cooldown_until, before.processing_started_at,
      before.error, before.transcript_version, before.created_at, before.updated_at, VIDEO_ID,
    ],
  );
}

export async function GET() {
  const environment = process.env.VERCEL_ENV || "";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
  if (environment !== "preview" || branch !== "temp/natasha-owner-import") {
    return NextResponse.json({ skipped: true, reason: "preview-branch-only", environment, branch });
  }

  const structural = auditNatashaTranslation();
  if (!structural.ok || structural.count !== EXPECTED_CUES) {
    throw new Error(`Natasha structural audit failed: ${JSON.stringify(structural)}`);
  }

  const canonical = await canonicalEnglishForImport(VIDEO_ID);
  if (canonical.sourceHash !== EXPECTED_SOURCE_HASH || canonical.cues.length !== EXPECTED_CUES) {
    throw new Error(`Canonical source mismatch: ${canonical.sourceHash} / ${canonical.cues.length}`);
  }

  const rows = assembledNatashaTranslation();
  const greekCues = canonical.cues.map((cue, index) => {
    const row = rows[index];
    if (!row || row[0] !== index + 1) throw new Error(`Natasha cue mapping failed at ${index + 1}`);
    const text = row[1].replace(/\s+/g, " ").trim();
    if (!text) throw new Error(`Natasha cue ${index + 1} is empty`);
    if (/\[\s*\d+\s*\]/.test(text)) throw new Error(`Natasha cue ${index + 1} contains a marker artifact`);
    if (!numberTokensMatch(cue.text, text)) throw new Error(`Natasha cue ${index + 1} has a numeric-token mismatch`);
    return { start: cue.start, duration: cue.duration, text };
  });
  const combinedGreek = greekCues.map(cue => cue.text).join(" ");
  if (greekRatio(combinedGreek) < 0.65) throw new Error("Natasha translation Greek ratio is unexpectedly low");
  const translatedHash = greekHash(greekCues);

  const db = database();
  const beforeRows = await db.query(
    `SELECT title, channel, thumbnail, duration, original_language, topics, key_points,
      status, progress, raw_english_count, english_count, greek_count,
      processing_stage, processing_cursor, retry_count, retry_after,
      groq_429_streak, groq_cooldown_until, processing_started_at, error,
      transcript_version, created_at, updated_at
     FROM video_transcripts WHERE video_id=$1 LIMIT 1`,
    [VIDEO_ID],
  ) as DbSnapshot[];
  const before = beforeRows[0];
  if (!before) throw new Error("Natasha Neon row missing before import");

  const checkpointText = await readCheckpointText();
  const checkpoint = JSON.parse(checkpointText) as CheckpointPayload;
  const rawEnglish = Array.isArray(checkpoint.rawEnglishTranscript) ? checkpoint.rawEnglishTranscript : [];
  if (!rawEnglish.length) throw new Error("Natasha raw English checkpoint missing before import");

  await put(BACKUP_PATH, checkpointText, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json; charset=utf-8",
  });

  let lockToken: string | null = null;
  try {
    lockToken = crypto.randomUUID();
    if (!await acquireProcessingLock(VIDEO_ID, lockToken, true)) throw new Error("Could not acquire Natasha import lock");

    const now = new Date().toISOString();
    const cueDuration = greekCues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
    const duration = Math.max(Number(before.duration) || 0, cueDuration);
    const topics = parseStringArray(before.topics);
    const keyPoints = greekCues
      .filter((_, index) => index % Math.max(1, Math.floor(greekCues.length / 10)) === 0)
      .map(cue => cue.text)
      .filter(text => text.length > 18)
      .slice(0, 10);

    const record = {
      videoId: VIDEO_ID,
      title: before.title || "Let Food Be Thy Medicine",
      channel: before.channel || "YouTube",
      thumbnail: before.thumbnail || `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      duration,
      originalLanguage: before.original_language || "en",
      rawEnglishTranscript: rawEnglish as { start: number; duration: number; text: string }[],
      englishTranscript: canonical.cues,
      greekTranscript: greekCues,
      timestamps: canonical.cues.map(cue => ({ start: cue.start, duration: cue.duration })),
      topics,
      keyPoints,
      status: "ready" as const,
      progress: 100,
      transcriptVersion: TRANSCRIPT_VERSION,
      createdAt: before.created_at || now,
      updatedAt: now,
    };

    if (!await completeTranscript(record, lockToken)) throw new Error("Natasha completeTranscript failed");
    lockToken = null;

    const published = await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, {
      status: "ready",
      progress: 100,
      videoId: VIDEO_ID,
      title: GREEK_TITLE,
      originalTitle: before.title || "Let Food Be Thy Medicine",
      channel: record.channel,
      duration,
      sourceLanguage: record.originalLanguage,
      cues: greekCues,
      englishCues: canonical.cues,
      topics,
      keyPoints,
      transcriptVersion: TRANSCRIPT_VERSION,
      cached: true,
    });
    if (!published) throw new Error("Natasha published Blob write failed");

    const verifyRows = await db.query(
      `SELECT status, progress, transcript_version, raw_english_count, english_count, greek_count,
        processing_stage, processing_cursor, updated_at
       FROM video_transcripts WHERE video_id=$1 LIMIT 1`,
      [VIDEO_ID],
    ) as Array<Record<string, unknown>>;
    const verify = verifyRows[0];
    if (!verify || verify.status !== "ready" || Number(verify.progress) !== 100 ||
        Number(verify.transcript_version) !== TRANSCRIPT_VERSION || Number(verify.english_count) !== EXPECTED_CUES ||
        Number(verify.greek_count) !== EXPECTED_CUES || verify.processing_stage !== null || Number(verify.processing_cursor) !== 0) {
      throw new Error(`Natasha Neon read-back failed: ${JSON.stringify(verify)}`);
    }

    console.info("[natasha-owner-import:success]", JSON.stringify({
      videoId: VIDEO_ID,
      transcriptVersion: TRANSCRIPT_VERSION,
      sourceHash: canonical.sourceHash,
      greekHash: translatedHash,
      rawEnglishCount: rawEnglish.length,
      englishCount: canonical.cues.length,
      greekCount: greekCues.length,
      backupPath: BACKUP_PATH,
      neon: verify,
    }));

    return NextResponse.json({
      ok: true,
      videoId: VIDEO_ID,
      transcriptVersion: TRANSCRIPT_VERSION,
      sourceHash: canonical.sourceHash,
      greekHash: translatedHash,
      rawEnglishCount: rawEnglish.length,
      englishCount: canonical.cues.length,
      greekCount: greekCues.length,
      backupPath: BACKUP_PATH,
      neon: verify,
    });
  } catch (error) {
    console.error("[natasha-owner-import:rollback]", error);
    await restoreState(db, before, checkpointText).catch(rollbackError => {
      console.error("[natasha-owner-import:rollback-failed]", rollbackError);
    });
    throw error;
  }
}

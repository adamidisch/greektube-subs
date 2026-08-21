import { createHash } from "crypto";
import { get, put } from "@vercel/blob";
import { database } from "@/db/postgres";
import { NextResponse } from "next/server";
import { numberTokensMatch } from "../../captions/numeric-integrity";
import { canonicalEnglishForImport } from "../../manual-captions/canonical-source";
import { TRANSCRIPT_VERSION } from "../../shared-cache";
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

type Cue = { start: number; duration: number; text: string };
type MetadataRow = { title: string; channel: string; thumbnail: string; duration: number; original_language: string; topics: string; key_points: string; created_at: string };
type Checkpoint = { rawEnglishTranscript?: unknown };

function stringArray(value: string) {
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") as string[] : []; }
  catch { return [] as string[]; }
}
function hashCues(cues: Cue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${cue.text.replace(/\s+/g, " ").trim()}\n`);
  return hash.digest("hex");
}
async function readBlobText(path: string) {
  const blob = await get(path, { access: "public" });
  if (!blob?.stream) return null;
  return await new Response(blob.stream).text();
}

export async function GET() {
  const environment = process.env.VERCEL_ENV || "";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
  if (environment !== "production" || branch !== "main") return NextResponse.json({ skipped: true, environment, branch });

  const structural = auditNatashaTranslation();
  if (!structural.ok || structural.count !== EXPECTED_CUES) throw new Error(`Structural QA failed: ${JSON.stringify(structural)}`);
  const canonical = await canonicalEnglishForImport(VIDEO_ID);
  if (canonical.cues.length !== EXPECTED_CUES || canonical.sourceHash !== EXPECTED_SOURCE_HASH) throw new Error(`Canonical mismatch: ${canonical.cues.length}/${canonical.sourceHash}`);

  const translationRows = assembledNatashaTranslation();
  const greekCues = canonical.cues.map((source, index) => {
    const row = translationRows[index];
    if (!row || row[0] !== index + 1) throw new Error(`Cue mapping mismatch at ${index + 1}`);
    const text = row[1].replace(/\s+/g, " ").trim();
    if (!text) throw new Error(`Empty Greek cue ${index + 1}`);
    if (/\[\s*\d+\s*\]/.test(text)) throw new Error(`Marker artifact at cue ${index + 1}`);
    if (!numberTokensMatch(source.text, text)) throw new Error(`Numeric mismatch at cue ${index + 1}`);
    return { start: source.start, duration: source.duration, text };
  });
  const greekHash = hashCues(greekCues);

  const db = database();
  const metadataRows = await db.query(
    `SELECT title, channel, thumbnail, duration, original_language, topics, key_points, created_at
     FROM video_transcripts WHERE video_id=$1 LIMIT 1`, [VIDEO_ID],
  ) as MetadataRow[];
  const metadata = metadataRows[0];
  if (!metadata) throw new Error("Natasha Neon metadata row missing");

  const previousCheckpoint = await readBlobText(CHECKPOINT_PATH);
  if (!previousCheckpoint) throw new Error("Natasha checkpoint Blob is unavailable");
  const previous = JSON.parse(previousCheckpoint) as Checkpoint;
  const rawEnglish = Array.isArray(previous.rawEnglishTranscript) ? previous.rawEnglishTranscript as Cue[] : [];
  if (!rawEnglish.length) throw new Error("Raw English checkpoint is empty");

  const now = new Date().toISOString();
  const duration = Math.max(Number(metadata.duration) || 0, greekCues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0));
  const topics = stringArray(metadata.topics);
  const keyPoints = greekCues.filter((_, index) => index % Math.max(1, Math.floor(greekCues.length / 10)) === 0).map(cue => cue.text).filter(text => text.length > 18).slice(0, 10);
  const readyCheckpoint = {
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    status: "ready" as const,
    processingStage: null,
    processingCursor: 0,
    rawEnglishTranscript: rawEnglish,
    englishTranscript: canonical.cues,
    greekTranscript: greekCues,
    timestamps: canonical.cues.map(cue => ({ start: cue.start, duration: cue.duration })),
    updatedAt: now,
  };

  await put(BACKUP_PATH, previousCheckpoint, { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json; charset=utf-8" });
  try {
    await put(CHECKPOINT_PATH, JSON.stringify(readyCheckpoint), { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json; charset=utf-8" });
    const published = await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, {
      status: "ready",
      progress: 100,
      videoId: VIDEO_ID,
      title: GREEK_TITLE,
      originalTitle: metadata.title || "Let Food Be Thy Medicine",
      channel: metadata.channel || "YouTube",
      thumbnail: metadata.thumbnail || `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      duration,
      sourceLanguage: metadata.original_language || "en",
      cues: greekCues,
      englishCues: canonical.cues,
      topics,
      keyPoints,
      transcriptVersion: TRANSCRIPT_VERSION,
      cached: true,
    });
    if (!published) throw new Error("Final Natasha published Blob write failed");
  } catch (error) {
    await put(CHECKPOINT_PATH, previousCheckpoint, { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json; charset=utf-8" });
    throw error;
  }

  const result = {
    ok: true,
    phase: "blob-staged",
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    sourceHash: EXPECTED_SOURCE_HASH,
    greekHash,
    rawEnglishCount: rawEnglish.length,
    englishCount: canonical.cues.length,
    greekCount: greekCues.length,
    timestampCount: readyCheckpoint.timestamps.length,
    backupPath: BACKUP_PATH,
  };
  console.info("[natasha-owner-import:blob-staged]", JSON.stringify(result));
  return NextResponse.json(result);
}

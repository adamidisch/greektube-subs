import { NextResponse } from "next/server";
import { database } from "@/db/postgres";
import { POST as runCaptions } from "../captions/route";
import { semanticReviewTranscript } from "../captions/semantic-review";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  completeTranscript,
  ensureTranscriptTable,
  getTranscript,
  releaseProcessingLock,
  resetProcessingForTranslation,
} from "../shared-cache";
import { publishTranscript, readPublishedTranscript } from "../transcript-blob";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REPOSITORY = "adamidisch/greektube-subs";
const COMMAND_OWNER = "adamidisch";
const COMMAND_MARKER = "greektube-translation-command:v1";
const QUALITY_METHOD = "groq_semantic_review_v1";
const QUALITY_CHUNK = 36;

type Cue = { start: number; duration: number; text: string };
type GitHubIssue = {
  number?: number;
  title?: string;
  body?: string | null;
  user?: { login?: string };
  pull_request?: unknown;
};
type QualityJob = {
  cursor: number;
  changed_count: number;
  status: string;
  lock_token: string | null;
  lock_expires_at: string | null;
};

function commandVideoId(issue: GitHubIssue) {
  if (issue.pull_request || issue.user?.login !== COMMAND_OWNER) return null;
  if (!issue.body?.includes(COMMAND_MARKER) || !issue.body.includes("mode=quality")) return null;
  const match = issue.title?.match(/^\[TRANSLATE\]\s+([A-Za-z0-9_-]{11})$/);
  return match?.[1] || null;
}

async function latestTranslationCommand() {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/issues?state=open&creator=${COMMAND_OWNER}&sort=created&direction=desc&per_page=20`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "greektube-translation-worker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`github-command-read-${response.status}`);
  const issues = await response.json() as GitHubIssue[];
  for (const issue of issues) {
    const videoId = commandVideoId(issue);
    if (videoId && Number.isInteger(issue.number)) return { issueNumber: issue.number as number, videoId };
  }
  return null;
}

async function ensureQualityTable() {
  await ensureTranscriptTable();
  const db = database();
  await db.query(`CREATE TABLE IF NOT EXISTS translation_quality_reviews (
    video_id TEXT PRIMARY KEY,
    transcript_version INTEGER NOT NULL,
    cursor INTEGER NOT NULL DEFAULT 0,
    changed_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing',
    lock_token TEXT,
    lock_expires_at TEXT,
    updated_at TEXT NOT NULL
  )`);
}

async function qualityJob(videoId: string) {
  await ensureQualityTable();
  const db = database();
  const rows = await db.query(
    `SELECT cursor, changed_count, status, lock_token, lock_expires_at
     FROM translation_quality_reviews
     WHERE video_id=$1 AND transcript_version=$2 LIMIT 1`,
    [videoId, TRANSCRIPT_VERSION],
  ) as QualityJob[];
  return rows[0] || null;
}

async function initializeQualityJob(videoId: string) {
  await ensureQualityTable();
  const db = database();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO translation_quality_reviews
      (video_id, transcript_version, cursor, changed_count, status, updated_at)
     VALUES ($1,$2,0,0,'processing',$3)
     ON CONFLICT(video_id) DO UPDATE SET
       transcript_version=EXCLUDED.transcript_version,
       cursor=CASE WHEN translation_quality_reviews.transcript_version<>EXCLUDED.transcript_version THEN 0 ELSE translation_quality_reviews.cursor END,
       changed_count=CASE WHEN translation_quality_reviews.transcript_version<>EXCLUDED.transcript_version THEN 0 ELSE translation_quality_reviews.changed_count END,
       status=CASE WHEN translation_quality_reviews.transcript_version<>EXCLUDED.transcript_version THEN 'processing' ELSE translation_quality_reviews.status END,
       updated_at=EXCLUDED.updated_at`,
    [videoId, TRANSCRIPT_VERSION, now],
  );
}

async function claimQualityJob(videoId: string, token: string) {
  await initializeQualityJob(videoId);
  const db = database();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 180_000).toISOString();
  const rows = await db.query(
    `UPDATE translation_quality_reviews SET lock_token=$1, lock_expires_at=$2, updated_at=$3
     WHERE video_id=$4 AND transcript_version=$5 AND status='processing'
       AND (lock_token IS NULL OR lock_expires_at IS NULL OR lock_expires_at<$3)
     RETURNING cursor, changed_count, status, lock_token, lock_expires_at`,
    [token, expires, now, videoId, TRANSCRIPT_VERSION],
  ) as QualityJob[];
  return rows[0] || null;
}

async function releaseQualityJob(videoId: string, token: string) {
  const db = database();
  await db.query(
    `UPDATE translation_quality_reviews SET lock_token=NULL, lock_expires_at=NULL, updated_at=$1
     WHERE video_id=$2 AND transcript_version=$3 AND lock_token=$4`,
    [new Date().toISOString(), videoId, TRANSCRIPT_VERSION, token],
  );
}

async function advanceQualityJob(videoId: string, token: string, cursor: number, changed: number, done: boolean) {
  const db = database();
  const rows = await db.query(
    `UPDATE translation_quality_reviews SET
       cursor=$1,
       changed_count=changed_count+$2,
       status=$3,
       lock_token=NULL,
       lock_expires_at=NULL,
       updated_at=$4
     WHERE video_id=$5 AND transcript_version=$6 AND lock_token=$7
     RETURNING cursor, changed_count, status, lock_token, lock_expires_at`,
    [cursor, changed, done ? "ready" : "processing", new Date().toISOString(), videoId, TRANSCRIPT_VERSION, token],
  ) as QualityJob[];
  return rows[0] || null;
}

function publicationPayload(record: NonNullable<Awaited<ReturnType<typeof getTranscript>>>, published: Record<string, unknown> | null) {
  return {
    ...(published || {}),
    status: "ready",
    progress: 100,
    videoId: record.videoId,
    title: typeof published?.title === "string" ? published.title : record.title,
    originalTitle: typeof published?.originalTitle === "string" ? published.originalTitle : record.title,
    channel: record.channel,
    duration: record.duration,
    sourceLanguage: record.originalLanguage,
    cues: record.greekTranscript,
    englishCues: record.englishTranscript,
    topics: record.topics,
    keyPoints: record.keyPoints,
    transcriptVersion: TRANSCRIPT_VERSION,
    translationMethod: QUALITY_METHOD,
    qualityReviewedAt: new Date().toISOString(),
    cached: false,
  };
}

async function persistReviewedGreek(videoId: string, reviewedGreek: Cue[], published: Record<string, unknown> | null) {
  const record = await getTranscript(videoId);
  if (!record || record.status !== "ready") throw new Error("ready-transcript-missing-before-quality-write");
  if (record.englishTranscript.length !== reviewedGreek.length) throw new Error("quality-write-alignment-mismatch");

  const token = crypto.randomUUID();
  if (!await acquireProcessingLock(videoId, token, true)) throw new Error("quality-write-lock-busy");
  try {
    const now = new Date().toISOString();
    const updated = {
      ...record,
      greekTranscript: reviewedGreek,
      timestamps: reviewedGreek.map(cue => ({ start: cue.start, duration: cue.duration })),
      status: "ready" as const,
      progress: 100,
      transcriptVersion: TRANSCRIPT_VERSION,
      updatedAt: now,
    };
    if (!await completeTranscript(updated, token)) throw new Error("quality-write-failed");
    const saved = await getTranscript(videoId);
    if (!saved) throw new Error("quality-write-readback-failed");
    const payload = publicationPayload(saved, published);
    if (!await publishTranscript(videoId, TRANSCRIPT_VERSION, payload)) throw new Error("quality-publish-failed");
    return saved;
  } catch (error) {
    await releaseProcessingLock(videoId, token).catch(() => undefined);
    throw error;
  }
}

async function resetGoogleCheckpointForQuality(videoId: string) {
  const existing = await getTranscript(videoId);
  if (!existing || existing.status !== "processing" || !existing.processingStage?.endsWith("_google")) return false;
  if (!existing.rawEnglishTranscript.length) return false;
  const token = crypto.randomUUID();
  if (!await acquireProcessingLock(videoId, token, true)) return false;
  try {
    if (!await resetProcessingForTranslation(videoId, token, true)) throw new Error("quality-reset-failed");
    if (!await releaseProcessingLock(videoId, token)) throw new Error("quality-reset-release-failed");
    return true;
  } catch (error) {
    await releaseProcessingLock(videoId, token).catch(() => undefined);
    throw error;
  }
}

async function runQualityStep(videoId: string, issueNumber: number) {
  const publishedValue = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, true);
  const published = publishedValue && typeof publishedValue === "object"
    ? publishedValue as Record<string, unknown>
    : null;
  const existingJob = await qualityJob(videoId);
  if (existingJob?.status === "ready" && published?.translationMethod === QUALITY_METHOD) {
    return NextResponse.json({
      status: "ready", progress: 100, videoId, issueNumber,
      quality: QUALITY_METHOD, reviewedCues: existingJob.cursor, changed: existingJob.changed_count,
    });
  }

  const record = await getTranscript(videoId);
  if (!record || record.status !== "ready") {
    return NextResponse.json({ status: "processing", progress: record?.progress || 90, videoId, issueNumber, stage: "quality-wait" }, {
      status: 202,
      headers: { "Retry-After": "1", "Cache-Control": "no-store" },
    });
  }
  if (!record.englishTranscript.length || record.englishTranscript.length !== record.greekTranscript.length) {
    throw new Error("quality-review-aligned-transcript-unavailable");
  }

  const qualityToken = crypto.randomUUID();
  const job = await claimQualityJob(videoId, qualityToken);
  if (!job) {
    const current = await qualityJob(videoId);
    if (current?.status === "ready") {
      const latestPublishedValue = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, true);
      const latestPublished = latestPublishedValue && typeof latestPublishedValue === "object"
        ? latestPublishedValue as Record<string, unknown>
        : null;
      if (latestPublished?.translationMethod === QUALITY_METHOD) {
        return NextResponse.json({
          status: "ready", progress: 100, videoId, issueNumber,
          quality: QUALITY_METHOD, reviewedCues: current.cursor, changed: current.changed_count,
        });
      }
    }
    return NextResponse.json({ status: "processing", progress: 96, videoId, issueNumber, stage: "quality-busy" }, {
      status: 202,
      headers: { "Retry-After": "2", "Cache-Control": "no-store" },
    });
  }

  try {
    const start = Math.max(0, Math.min(job.cursor || 0, record.greekTranscript.length));
    const end = Math.min(record.greekTranscript.length, start + QUALITY_CHUNK);
    if (start >= end) {
      const payload = publicationPayload(record, published);
      if (!await publishTranscript(videoId, TRANSCRIPT_VERSION, payload)) throw new Error("quality-final-publish-failed");
      const finalJob = await advanceQualityJob(videoId, qualityToken, record.greekTranscript.length, 0, true);
      return NextResponse.json({
        status: "ready", progress: 100, videoId, issueNumber, quality: QUALITY_METHOD,
        reviewedCues: finalJob?.cursor || record.greekTranscript.length,
        changed: finalJob?.changed_count || job.changed_count,
      });
    }

    const result = await semanticReviewTranscript(record.englishTranscript, record.greekTranscript, {
      start,
      end,
      batchSize: 6,
    });
    const updated = await persistReviewedGreek(videoId, result.reviewedGreek as Cue[], published);
    const done = end >= updated.greekTranscript.length;
    const finalJob = await advanceQualityJob(videoId, qualityToken, end, result.changed, done);
    const progress = done ? 100 : Math.round((92 + 8 * (end / updated.greekTranscript.length)) * 10) / 10;
    return NextResponse.json({
      status: done ? "ready" : "processing",
      progress,
      videoId,
      issueNumber,
      stage: done ? "quality-complete" : "quality-review",
      reviewedCues: end,
      totalCues: updated.greekTranscript.length,
      changedThisPass: result.changed,
      changed: finalJob?.changed_count || job.changed_count + result.changed,
      quality: QUALITY_METHOD,
    }, {
      status: done ? 200 : 202,
      headers: done ? { "Cache-Control": "no-store" } : { "Retry-After": "1", "Cache-Control": "no-store" },
    });
  } catch (error) {
    await releaseQualityJob(videoId, qualityToken).catch(() => undefined);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const command = await latestTranslationCommand();
    if (!command) return NextResponse.json({ idle: true }, { headers: { "Cache-Control": "no-store" } });

    const { videoId, issueNumber } = command;
    const publishedValue = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, true);
    const published = publishedValue && typeof publishedValue === "object"
      ? publishedValue as Record<string, unknown>
      : null;
    const completedJob = await qualityJob(videoId);
    if (completedJob?.status === "ready" && published?.translationMethod === QUALITY_METHOD) {
      return NextResponse.json({
        status: "ready", progress: 100, videoId, issueNumber, quality: QUALITY_METHOD,
        reviewedCues: completedJob.cursor, changed: completedJob.changed_count,
      });
    }

    await resetGoogleCheckpointForQuality(videoId);

    const internalRequest = new Request(new URL("/api/captions", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        force: false,
        translationMode: "legacy",
      }),
    });
    const response = await runCaptions(internalRequest);
    const payload = await response.clone().json().catch(() => null) as Record<string, unknown> | null;

    if (response.status === 202) {
      return NextResponse.json({ ...(payload || {}), issueNumber, command: "quality" }, {
        status: 202,
        headers: { "Retry-After": response.headers.get("retry-after") || "1", "Cache-Control": "no-store" },
      });
    }
    if (!response.ok) {
      return NextResponse.json({ error: payload?.error || `captions-${response.status}`, videoId, issueNumber }, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return await runQualityStep(videoId, issueNumber);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "translation-worker-failed",
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

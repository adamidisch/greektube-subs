import { NextResponse } from "next/server";
import { database } from "@/db/postgres";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  acquireProcessingLock,
  releaseProcessingLock,
  TRANSCRIPT_VERSION,
} from "../shared-cache";
import { upsertTranscriptCheckpoint } from "../transcript-blob";
import { hasValidManualCueTimings, parseManualSubtitleText } from "../manual-captions/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WRITE_CONFIRMATION = "IMPORT_MANUAL_ENGLISH_SOURCE";

type ImportBody = {
  url?: unknown;
  sourceText?: unknown;
  title?: unknown;
  channel?: unknown;
  duration?: unknown;
  dryRun?: unknown;
  confirmation?: unknown;
};

function videoIdFrom(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/")[1] || null;
    if (host.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

function monotonic(cues: { start: number; duration: number; text: string }[]) {
  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index].start <= cues[index - 1].start) return false;
  }
  return true;
}

function sourceSummary(cues: { start: number; duration: number; text: string }[]) {
  const last = cues[cues.length - 1];
  return {
    cueCount: cues.length,
    firstCue: cues[0] || null,
    lastCue: last || null,
    endTime: last ? Math.round((last.start + last.duration) * 1000) / 1000 : 0,
  };
}

export async function POST(request: Request) {
  let body: ImportBody;
  try {
    body = await request.json() as ImportBody;
  } catch {
    return NextResponse.json({ error: "Το request δεν μπόρεσε να διαβαστεί." }, { status: 400 });
  }

  const isDryRun = body.dryRun === true;
  if (!isDryRun && !await verifyAdminSession(request)) {
    return NextResponse.json({ error: "Απαιτείται admin authorization για manual source import." }, { status: 401 });
  }
  if (isDryRun && process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Το unauthenticated dry-run επιτρέπεται μόνο σε preview." }, { status: 403 });
  }

  if (typeof body.url !== "string" || typeof body.sourceText !== "string") {
    return NextResponse.json({ error: "Λείπει το YouTube URL ή το English transcript." }, { status: 400 });
  }
  if (body.sourceText.length > 2_000_000) {
    return NextResponse.json({ error: "Το transcript είναι υπερβολικά μεγάλο." }, { status: 413 });
  }

  const videoId = videoIdFrom(body.url);
  if (!videoId) return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });

  const cues = parseManualSubtitleText(body.sourceText);
  if (cues.length < 3) {
    return NextResponse.json({ error: "Δεν βρέθηκαν αρκετά timed English cues." }, { status: 400 });
  }
  if (!hasValidManualCueTimings(cues) || !monotonic(cues)) {
    return NextResponse.json({ error: "Το English transcript έχει μη έγκυρα ή μη μονοτονικά timestamps." }, { status: 400 });
  }

  const summary = sourceSummary(cues);
  if (isDryRun) {
    return NextResponse.json({
      status: "validated",
      dryRun: true,
      writesPerformed: false,
      paidProvidersTouched: false,
      videoId,
      source: "manual-youtube-transcript-copy",
      ...summary,
      cues,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.confirmation !== WRITE_CONFIRMATION) {
    return NextResponse.json({
      error: `Για write χρειάζεται confirmation=${WRITE_CONFIRMATION}.`,
      videoId,
      ...summary,
    }, { status: 409 });
  }

  const lockToken = crypto.randomUUID();
  if (!await acquireProcessingLock(videoId, lockToken, true)) {
    return NextResponse.json({ error: "Το video επεξεργάζεται ήδη. Δοκίμασε ξανά σε λίγο." }, { status: 409 });
  }

  try {
    const now = new Date().toISOString();
    const suppliedDuration = Number(body.duration || 0);
    const duration = Number.isFinite(suppliedDuration) && suppliedDuration > 0
      ? Math.max(suppliedDuration, summary.endTime)
      : summary.endTime;
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "YouTube video";
    const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : "YouTube";
    const timestamps = cues.map(cue => ({ start: cue.start, duration: cue.duration }));

    const checkpoint = await upsertTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, {
      status: "processing",
      processingStage: "translate",
      processingCursor: 0,
      rawEnglishTranscript: cues,
      englishTranscript: cues,
      greekTranscript: [],
      timestamps,
      updatedAt: now,
    });

    if (!checkpoint) throw new Error("Το Blob checkpoint δεν αποθηκεύτηκε.");

    const db = database();
    const rows = await db.query(
      `UPDATE video_transcripts SET
        title=$1,
        channel=$2,
        thumbnail=$3,
        duration=$4,
        original_language='en',
        status='processing',
        progress=48,
        processing_stage='translate',
        processing_cursor=0,
        retry_count=0,
        retry_after=NULL,
        groq_429_streak=0,
        groq_cooldown_until=NULL,
        error=NULL,
        raw_english_count=$5,
        english_count=$5,
        greek_count=0,
        timestamps='[]',
        topics='[]',
        key_points='[]',
        transcript_version=$6,
        updated_at=$7
       WHERE video_id=$8 AND lock_token=$9
       RETURNING video_id`,
      [
        title,
        channel,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration,
        cues.length,
        TRANSCRIPT_VERSION,
        now,
        videoId,
        lockToken,
      ],
    ) as { video_id: string }[];

    if (rows.length !== 1) throw new Error("Το metadata checkpoint δεν αποθηκεύτηκε.");
    await releaseProcessingLock(videoId, lockToken);

    return NextResponse.json({
      status: "processing",
      progress: 48,
      stage: "translate",
      cursor: 0,
      videoId,
      source: "manual-youtube-transcript-copy",
      paidProvidersTouched: false,
      ...summary,
      next: "POST /api/captions with the same YouTube URL to continue contextual Greek translation.",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await releaseProcessingLock(videoId, lockToken).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Το manual source import απέτυχε." }, { status: 500 });
  }
}

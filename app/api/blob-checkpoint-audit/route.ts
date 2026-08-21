import { NextResponse } from "next/server";
import { getTranscript, TRANSCRIPT_VERSION } from "../shared-cache";
import { readTranscriptCheckpoint } from "../transcript-blob";

export const dynamic = "force-dynamic";

const TARGET_VIDEO = "fX2z-BF8Jac";

function previewOnly() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/blob-transcript-checkpoints";
}

export async function GET() {
  if (!previewOnly()) return new Response(null, { status: 404 });

  const before = await readTranscriptCheckpoint(TARGET_VIDEO, TRANSCRIPT_VERSION);
  const record = await getTranscript(TARGET_VIDEO);
  const after = await readTranscriptCheckpoint(TARGET_VIDEO, TRANSCRIPT_VERSION);
  if (!record) return NextResponse.json({ ok: false, error: "missing-record" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    beforeExists: Boolean(before),
    afterExists: Boolean(after),
    matched: Boolean(after &&
      after.status === record.status &&
      after.processingStage === (record.processingStage || null) &&
      after.processingCursor === (record.processingCursor || 0)),
    status: record.status,
    stage: record.processingStage || null,
    cursor: record.processingCursor || 0,
    transcriptVersion: record.transcriptVersion,
    counts: {
      rawEnglish: record.rawEnglishTranscript.length,
      english: record.englishTranscript.length,
      greek: record.greekTranscript.length,
    },
  }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
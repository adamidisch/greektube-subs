import { NextResponse } from "next/server";
import { readTranscriptCheckpoint } from "../transcript-blob";
import { TRANSCRIPT_VERSION } from "../shared-cache";
import { validateSubtitlePair, type SubtitleCue } from "../captions/subtitle-contract";

export const runtime = "nodejs";

function videoIdFrom(value: string) {
  const clean = value.trim();
  return /^[A-Za-z0-9_-]{6,20}$/.test(clean) ? clean : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = videoIdFrom(url.searchParams.get("videoId") || "");
  if (!videoId) return NextResponse.json({ error: "invalid-video-id" }, { status: 400 });

  const checkpoint = await readTranscriptCheckpoint(videoId, TRANSCRIPT_VERSION, true);
  if (!checkpoint) {
    return NextResponse.json({ videoId, transcriptVersion: TRANSCRIPT_VERSION, checkpoint: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const english = checkpoint.englishTranscript as SubtitleCue[];
  const greek = checkpoint.greekTranscript as SubtitleCue[];
  const contract = english.length && greek.length ? validateSubtitlePair(english, greek) : null;

  return NextResponse.json({
    videoId,
    transcriptVersion: checkpoint.transcriptVersion,
    checkpoint: true,
    status: checkpoint.status,
    stage: checkpoint.processingStage,
    cursor: checkpoint.processingCursor,
    rawEnglishCount: checkpoint.rawEnglishTranscript.length,
    englishCount: english.length,
    greekCount: greek.length,
    timestampCount: checkpoint.timestamps.length,
    contract,
    updatedAt: checkpoint.updatedAt,
  }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { getTranscript, TRANSCRIPT_VERSION } from "../shared-cache";

export const dynamic = "force-dynamic";

const VIDEO_ID = "fX2z-BF8Jac";
const PAGE_SIZE = 400;

export async function GET(request: Request) {
  const page = Math.max(0, Math.min(7, Number(new URL(request.url).searchParams.get("page") || 0) || 0));
  const record = await getTranscript(VIDEO_ID).catch(() => null);
  if (!record || record.transcriptVersion !== TRANSCRIPT_VERSION || !record.englishTranscript.length) {
    return NextResponse.json({ error: "Canonical English transcript unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const start = page * PAGE_SIZE;
  const cues = record.englishTranscript.slice(start, start + PAGE_SIZE).map((cue, offset) => ({
    index: start + offset + 1,
    start: cue.start,
    duration: cue.duration,
    text: cue.text,
  }));
  return NextResponse.json({
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    totalCues: record.englishTranscript.length,
    page,
    startIndex: start + 1,
    endIndex: start + cues.length,
    cues,
  }, { headers: { "Cache-Control": "no-store" } });
}

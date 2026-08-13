import { NextResponse } from "next/server";
import { TRANSCRIPT_VERSION } from "../../shared-cache";
import { readPublishedTranscript } from "../../transcript-blob";
import { semanticReviewTranscript } from "../semantic-review";

type Cue = { start: number; duration: number; text: string };

type Published = {
  videoId?: unknown;
  cues?: unknown;
  englishCues?: unknown;
};

function validCue(value: unknown): value is Cue {
  if (!value || typeof value !== "object") return false;
  const cue = value as Cue;
  return Number.isFinite(cue.start) && Number.isFinite(cue.duration) && typeof cue.text === "string";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      videoId?: unknown;
      password?: unknown;
      start?: unknown;
      end?: unknown;
      batchSize?: unknown;
    };
    const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: "invalid-video-id" }, { status: 400 });
    }

    const configuredPassword = process.env.ADMIN_EDIT_PASSWORD;
    if (configuredPassword && body.password !== configuredPassword) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const published = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, true) as Published | null;
    const english = Array.isArray(published?.englishCues) ? published.englishCues.filter(validCue) : [];
    const greek = Array.isArray(published?.cues) ? published.cues.filter(validCue) : [];
    if (!english.length || english.length !== greek.length) {
      return NextResponse.json({
        error: "aligned-transcript-unavailable",
        englishCues: english.length,
        greekCues: greek.length,
      }, { status: 409 });
    }

    const start = typeof body.start === "number" ? body.start : undefined;
    const end = typeof body.end === "number" ? body.end : undefined;
    const batchSize = typeof body.batchSize === "number" ? body.batchSize : undefined;
    const result = await semanticReviewTranscript(english, greek, { start, end, batchSize });

    return NextResponse.json({
      videoId,
      transcriptVersion: TRANSCRIPT_VERSION,
      totalCues: greek.length,
      changed: result.changed,
      range: result.range,
      corrections: result.corrections.map(correction => ({
        ...correction,
        english: english[correction.index]?.text || "",
        before: greek[correction.index]?.text || "",
        after: result.reviewedGreek[correction.index]?.text || correction.text,
        start: greek[correction.index]?.start,
        duration: greek[correction.index]?.duration,
      })),
      readOnly: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "quality-review-failed",
    }, { status: 500 });
  }
}

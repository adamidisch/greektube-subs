import { NextResponse } from "next/server";
import { POST as runCaptions } from "../captions/route";
import { getTranscriptStatus } from "../shared-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_ID = "fX2z-BF8Jac";
const URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

function baseStage(stage: string | null | undefined) {
  const value = stage || "source";
  return value.endsWith("_google") ? value.slice(0, -7) : value;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let passes = 0;

  while (passes < 64 && Date.now() - startedAt < 240_000) {
    const before = await getTranscriptStatus(VIDEO_ID);
    if (!before) return NextResponse.json({ error: "Natasha transcript state missing" }, { status: 404 });
    if (baseStage(before.processingStage) !== "repair") {
      return NextResponse.json({
        videoId: VIDEO_ID,
        stopped: true,
        passes,
        stage: before.processingStage,
        cursor: before.processingCursor,
        rawEnglishCount: before.rawEnglishCount,
        englishCount: before.englishCount,
        greekCount: before.greekCount,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const internal = new Request(new URL("/api/captions", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: URL, force: false, translationMode: "google" }),
    });
    const response = await runCaptions(internal);
    passes += 1;
    if (response.status !== 202) {
      const payload = await response.json().catch(() => null);
      return NextResponse.json({ error: "Repair pass failed", passes, upstreamStatus: response.status, payload }, { status: 502 });
    }
  }

  const after = await getTranscriptStatus(VIDEO_ID);
  return NextResponse.json({
    videoId: VIDEO_ID,
    stopped: baseStage(after?.processingStage) !== "repair",
    passes,
    stage: after?.processingStage || null,
    cursor: after?.processingCursor || 0,
    rawEnglishCount: after?.rawEnglishCount || 0,
    englishCount: after?.englishCount || 0,
    greekCount: after?.greekCount || 0,
  }, { headers: { "Cache-Control": "no-store" } });
}

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { TRANSCRIPT_VERSION } from "../shared-cache";
import { readTranscriptCheckpoint } from "../transcript-blob";

export const dynamic = "force-dynamic";

const VIDEO_ID = "fX2z-BF8Jac";
const EXPORT_KEY = "CQ6WhLkTvW0vHU5Vw8rj2OCsMYPNfBqD2Jv3MH5L4qM";
const PAGE_SIZE = 800;

type Cue = { start: number; duration: number; text: string };

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function transcriptHash(cues: Cue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) {
    hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${normalizeText(cue.text)}\n`);
  }
  return hash.digest("hex");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== EXPORT_KEY) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const checkpoint = await readTranscriptCheckpoint(VIDEO_ID, TRANSCRIPT_VERSION, true);
  const cues = checkpoint?.englishTranscript as Cue[] | undefined;
  if (!checkpoint || !Array.isArray(cues) || !cues.length) {
    return NextResponse.json({ error: "checkpoint-unavailable" }, { status: 404 });
  }

  const pageValue = Number(url.searchParams.get("page") || "0");
  const page = Number.isInteger(pageValue) && pageValue >= 0 ? pageValue : 0;
  const totalPages = Math.ceil(cues.length / PAGE_SIZE);
  if (page >= totalPages) {
    return NextResponse.json({ error: "page-out-of-range", totalPages }, { status: 400 });
  }

  const start = page * PAGE_SIZE;
  const end = Math.min(cues.length, start + PAGE_SIZE);
  return NextResponse.json({
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    sourceHash: transcriptHash(cues),
    totalCues: cues.length,
    page,
    totalPages,
    start,
    end,
    cues: cues.slice(start, end),
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getTranscript, TRANSCRIPT_VERSION, type CachedCue } from "../shared-cache";
import {
  enqueueAudioTimingJob,
  getAudioTimingState,
  normalizeAudioSourceCues,
  type AudioSourceCue,
} from "./store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validVideoId(value: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

function transcriptCues(cues: CachedCue[]): AudioSourceCue[] {
  return cues.map((cue, index) => ({
    cueId: index + 1,
    startMs: Math.max(0, Math.round(cue.start * 1000)),
    endMs: Math.max(1, Math.round((cue.start + cue.duration) * 1000)),
    text: cue.text,
  }));
}

export async function POST(request: NextRequest) {
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const videoId = String(body.videoId || "").trim();
    if (!validVideoId(videoId)) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });

    let sourceCues: AudioSourceCue[];
    if (body.sourceCues !== undefined) {
      sourceCues = normalizeAudioSourceCues(body.sourceCues);
    } else {
      const transcript = await getTranscript(videoId);
      if (!transcript) return NextResponse.json({ error: "Δεν υπάρχει English transcript για αυτό το βίντεο." }, { status: 404 });
      const source = transcript.englishTranscript.length ? transcript.englishTranscript : transcript.rawEnglishTranscript;
      sourceCues = normalizeAudioSourceCues(transcriptCues(source));
    }

    const transcriptVersion = Number.isInteger(Number(body.transcriptVersion))
      ? Number(body.transcriptVersion)
      : TRANSCRIPT_VERSION;
    const result = await enqueueAudioTimingJob(videoId, transcriptVersion, sourceCues);
    return NextResponse.json(result, { status: result.created ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audio timing enqueue failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = request.nextUrl.searchParams.get("job") || undefined;
  const videoId = request.nextUrl.searchParams.get("video") || undefined;
  const includePayload = request.nextUrl.searchParams.get("include") === "artifact";
  if (!jobId && (!videoId || !validVideoId(videoId))) {
    return NextResponse.json({ error: "Provide a valid job or video id" }, { status: 400 });
  }
  try {
    const state = await getAudioTimingState({ jobId, videoId, includePayload });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audio timing status failed" }, { status: 500 });
  }
}

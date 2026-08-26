import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { readFile } from "fs/promises";
import path from "path";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getTranscript, TRANSCRIPT_VERSION, type CachedCue } from "../shared-cache";
import {
  enqueueAudioTimingJob,
  getAudioTimingState,
  normalizeAudioMediaInput,
  normalizeAudioSourceCues,
  type AudioMediaInput,
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

function parseProofTime(value: string) {
  const [hours, minutes, rest] = value.split(":");
  const [seconds, milliseconds] = rest.split(",");
  return (((Number(hours) * 60 + Number(minutes)) * 60) + Number(seconds)) * 1000 + Number(milliseconds);
}

async function lockedProofSourceCues(videoId: string) {
  if (videoId !== "D2RjneeG_xA") return null;
  const source = await readFile(
    path.join(process.cwd(), "worker", "fixtures", "D2RjneeG_xA-source.srt"),
    "utf8",
  );
  const cues = source.replace(/^\uFEFF/, "").trim().split(/\n\s*\n/).map(block => {
    const lines = block.split(/\r?\n/);
    const [start, end] = lines[1].split("-->").map(value => value.trim());
    return {
      cueId: Number(lines[0]),
      startMs: parseProofTime(start),
      endMs: parseProofTime(end),
      text: lines.slice(2).join(" ").trim(),
    };
  });
  return normalizeAudioSourceCues(cues);
}

export async function POST(request: NextRequest) {
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let media: AudioMediaInput | undefined;
  try {
    const body = await request.json() as Record<string, unknown>;
    const videoId = String(body.videoId || "").trim();
    if (!validVideoId(videoId)) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
    if (body.media !== undefined) media = normalizeAudioMediaInput(body.media, videoId);

    let sourceCues: AudioSourceCue[];
    if (body.sourceCues !== undefined) {
      sourceCues = normalizeAudioSourceCues(body.sourceCues);
    } else {
      const transcript = await getTranscript(videoId);
      if (transcript) {
        const source = transcript.englishTranscript.length ? transcript.englishTranscript : transcript.rawEnglishTranscript;
        sourceCues = normalizeAudioSourceCues(transcriptCues(source));
      } else {
        const proofSource = await lockedProofSourceCues(videoId);
        if (!proofSource) return NextResponse.json({ error: "Δεν υπάρχει English transcript για αυτό το βίντεο." }, { status: 404 });
        sourceCues = proofSource;
      }
    }

    const transcriptVersion = Number.isInteger(Number(body.transcriptVersion))
      ? Number(body.transcriptVersion)
      : TRANSCRIPT_VERSION;
    const result = await enqueueAudioTimingJob(videoId, transcriptVersion, sourceCues, media);
    const disposableUrls = [
      result.replacedMediaUrl,
      media && !result.mediaAccepted ? media.url : null,
    ].filter((url): url is string => Boolean(url));
    if (disposableUrls.length) await del(disposableUrls);
    return NextResponse.json(result, { status: result.created ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (media) {
      try {
        await del(media.url);
      } catch (cleanupError) {
        console.error("Failed to delete orphaned audio timing media", cleanupError);
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audio timing enqueue failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = request.nextUrl.searchParams.get("job") || undefined;
  const videoId = request.nextUrl.searchParams.get("video") || undefined;
  const includePayload = request.nextUrl.searchParams.get("include") === "artifact";
  const downloadSrt = request.nextUrl.searchParams.get("download") === "srt";
  if (!jobId && (!videoId || !validVideoId(videoId))) {
    return NextResponse.json({ error: "Provide a valid job or video id" }, { status: 400 });
  }
  try {
    const state = await getAudioTimingState({ jobId, videoId, includePayload: includePayload || downloadSrt });
    if (downloadSrt) {
      const proofSrt = (state.artifact as { proofSrt?: unknown } | null)?.proofSrt;
      if (typeof proofSrt !== "string" || !proofSrt.trim()) {
        return NextResponse.json({ error: "Το τελικό v8.1 SRT δεν είναι διαθέσιμο επειδή το quality gate δεν πέρασε." }, { status: 409 });
      }
      return new NextResponse(proofSrt, {
        headers: {
          "Content-Type": "application/x-subrip; charset=utf-8",
          "Content-Disposition": `attachment; filename="${videoId || "proof"}-v8.1.srt"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audio timing status failed" }, { status: 500 });
  }
}

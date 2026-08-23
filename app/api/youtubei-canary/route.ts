import { NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_VIDEO = "D2RjneeG_xA";

type SegmentLike = {
  type?: string;
  start_ms?: string;
  end_ms?: string;
  snippet?: { toString?: () => string } | string;
};

function textOfSnippet(snippet: SegmentLike["snippet"]) {
  if (typeof snippet === "string") return snippet.trim();
  if (snippet && typeof snippet.toString === "function") return snippet.toString().replace(/\s+/g, " ").trim();
  return "";
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "preview-only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId")?.trim() || DEFAULT_VIDEO;
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return NextResponse.json({ error: "invalid-video-id" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const yt = await Innertube.create({
      lang: "en",
      location: "US",
      retrieve_player: false,
      generate_session_locally: true,
      enable_session_cache: false,
    });

    const info = await yt.getInfo(videoId);
    let transcript = await info.getTranscript();
    const englishLanguage = transcript.languages.find(language => /^English(?:\s|$)/i.test(language));
    if (englishLanguage && transcript.selectedLanguage !== englishLanguage) {
      transcript = await transcript.selectLanguage(englishLanguage);
    }

    const rawSegments = transcript.transcript.content?.body?.initial_segments ?? [];
    const cues = Array.from(rawSegments)
      .map(raw => raw as SegmentLike)
      .filter(segment => segment.type === "TranscriptSegment")
      .map(segment => {
        const startMs = Number(segment.start_ms);
        const endMs = Number(segment.end_ms);
        return {
          start: startMs / 1000,
          duration: Math.max(0.05, (endMs - startMs) / 1000),
          text: textOfSnippet(segment.snippet),
        };
      })
      .filter(cue => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.duration) && cue.start >= 0 && cue.duration > 0);

    if (!cues.length) throw new Error("youtubei-empty-transcript");

    const result = {
      dryRun: true,
      writesPerformed: false,
      paidProvidersTouched: false,
      videoId,
      source: "youtubei.js",
      selectedLanguage: transcript.selectedLanguage,
      availableLanguages: transcript.languages,
      cueCount: cues.length,
      firstCue: cues[0],
      lastCue: cues[cues.length - 1],
      elapsedMs: Date.now() - startedAt,
    };
    console.info("[youtubei-canary-result]", JSON.stringify(result));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (error) {
    const result = {
      dryRun: true,
      writesPerformed: false,
      paidProvidersTouched: false,
      videoId,
      error: error instanceof Error ? error.message : "youtubei-canary-failed",
      elapsedMs: Date.now() - startedAt,
    };
    console.error("[youtubei-canary-error]", JSON.stringify(result));
    return NextResponse.json(result, { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
}

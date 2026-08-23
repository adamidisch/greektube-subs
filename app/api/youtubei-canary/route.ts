import { NextResponse } from "next/server";
import { Innertube } from "youtubei.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_VIDEO = "D2RjneeG_xA";
const WEB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

type Cue = { start: number; duration: number; text: string };

type TimedTextPayload = {
  events?: {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: { utf8?: string }[];
  }[];
};

function parseJson3(body: string): Cue[] {
  const payload = JSON.parse(body) as TimedTextPayload;
  return (payload.events ?? [])
    .map(event => ({
      start: Number(event.tStartMs ?? 0) / 1000,
      duration: Math.max(0.05, Number(event.dDurationMs ?? 0) / 1000),
      text: (event.segs ?? []).map(segment => segment.utf8 ?? "").join("").replace(/\s+/g, " ").trim(),
    }))
    .filter(cue => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.duration) && cue.start >= 0 && cue.duration > 0);
}

async function fetchTimedText(baseUrl: string) {
  const trackUrl = new URL(baseUrl);
  trackUrl.searchParams.set("fmt", "json3");
  trackUrl.searchParams.delete("tlang");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(trackUrl.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": WEB_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`youtube-timedtext-http:${response.status}`);
    if (!body.trim()) throw new Error("youtube-timedtext-empty-body");
    return { cues: parseJson3(body), status: response.status, bytes: Buffer.byteLength(body) };
  } finally {
    clearTimeout(timeout);
  }
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

    // We deliberately avoid info.getTranscript(). The current YouTube transcript
    // continuation endpoint can return HTTP 400 even when the player response already
    // contains a valid timed-text caption track.
    const info = await yt.getInfo(videoId);
    const tracks = info.captions?.caption_tracks ?? [];
    const englishTracks = tracks.filter(track => {
      const language = track.language_code?.toLowerCase() || "";
      return language === "en" || language.startsWith("en-");
    });
    const autoTrack = englishTracks.find(track => track.kind === "asr");
    if (!autoTrack?.base_url) {
      throw new Error(`youtubei-no-auto-english-track:${englishTracks.map(track => `${track.language_code}:${track.kind || "manual"}`).join(",") || "none"}`);
    }

    const timedText = await fetchTimedText(autoTrack.base_url);
    if (!timedText.cues.length) throw new Error("youtubei-auto-track-empty");

    const result = {
      dryRun: true,
      writesPerformed: false,
      paidProvidersTouched: false,
      videoId,
      source: "youtubei.js-player-caption-track",
      track: {
        languageCode: autoTrack.language_code,
        kind: autoTrack.kind,
        name: autoTrack.name?.toString?.() || "English",
      },
      availableEnglishTracks: englishTracks.map(track => ({
        languageCode: track.language_code,
        kind: track.kind || "manual",
        name: track.name?.toString?.() || "",
      })),
      timedTextStatus: timedText.status,
      timedTextBytes: timedText.bytes,
      cueCount: timedText.cues.length,
      firstCue: timedText.cues[0],
      lastCue: timedText.cues[timedText.cues.length - 1],
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

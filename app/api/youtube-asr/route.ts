import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

type PlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("video") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  try {
    const playerResponse = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.youtube.com",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20260824.01.00",
              hl: "en",
              gl: "US",
            },
          },
          videoId,
        }),
      },
    );

    if (!playerResponse.ok) {
      throw new Error(`YouTube player API returned ${playerResponse.status}`);
    }

    const player = (await playerResponse.json()) as PlayerResponse;
    const tracks =
      player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track =
      tracks.find(
        (candidate) =>
          candidate.languageCode === "en" && candidate.kind === "asr",
      ) ?? tracks.find((candidate) => candidate.languageCode === "en");

    if (!track?.baseUrl) throw new Error("English ASR track not found");

    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.set("fmt", "json3");

    const captionResponse = await fetch(captionUrl, {
      cache: "no-store",
      headers: {
        Referer: `https://www.youtube.com/watch?v=${videoId}`,
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      },
    });

    if (!captionResponse.ok) {
      throw new Error(`YouTube captions returned ${captionResponse.status}`);
    }

    const raw = await captionResponse.text();
    if (!raw.trim().startsWith("{")) {
      throw new Error("YouTube captions did not return JSON3");
    }

    return NextResponse.json(
      {
        video_id: videoId,
        timing_source: "youtube_asr",
        language_code: track.languageCode,
        track_kind: track.kind ?? null,
        json3: JSON.parse(raw),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown ASR error",
        video_id: videoId,
        timing_source: "youtube_asr",
      },
      { status: 502 },
    );
  }
}

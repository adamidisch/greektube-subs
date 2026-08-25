import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
  };
};

const clients = [
  { clientName: "WEB", clientVersion: "2.20260824.01.00", hl: "en", gl: "US" },
  {
    clientName: "WEB_EMBEDDED_PLAYER",
    clientVersion: "2.20260824.01.00",
    clientScreen: "EMBED",
    hl: "en",
    gl: "US",
  },
  {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    androidSdkVersion: 35,
    hl: "en",
    gl: "US",
  },
] as const;

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("video") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  try {
    let chosenTrack: CaptionTrack | undefined;
    const diagnostics: Array<Record<string, unknown>> = [];

    for (const client of clients) {
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
              client,
              thirdParty:
                client.clientName === "WEB_EMBEDDED_PLAYER"
                  ? { embedUrl: `https://www.youtube.com/embed/${videoId}` }
                  : undefined,
            },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
          }),
        },
      );

      const player = (await playerResponse.json()) as PlayerResponse;
      const tracks =
        player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      diagnostics.push({
        client: client.clientName,
        http_status: playerResponse.status,
        playability_status: player.playabilityStatus?.status ?? null,
        reason: player.playabilityStatus?.reason ?? null,
        track_count: tracks.length,
      });

      chosenTrack =
        tracks.find(
          (candidate) =>
            candidate.languageCode === "en" && candidate.kind === "asr",
        ) ?? tracks.find((candidate) => candidate.languageCode === "en");
      if (chosenTrack?.baseUrl) break;
    }

    if (!chosenTrack?.baseUrl) {
      return NextResponse.json(
        {
          error: "English ASR track not found",
          video_id: videoId,
          timing_source: "youtube_asr",
          diagnostics,
        },
        { status: 502 },
      );
    }

    const captionUrl = new URL(chosenTrack.baseUrl);
    captionUrl.searchParams.set("fmt", "json3");
    const captionResponse = await fetch(captionUrl, {
      cache: "no-store",
      headers: {
        Referer: `https://www.youtube.com/watch?v=${videoId}`,
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      },
    });

    const raw = await captionResponse.text();
    if (!captionResponse.ok || !raw.trim().startsWith("{")) {
      throw new Error(
        `YouTube captions unavailable (status ${captionResponse.status})`,
      );
    }

    return NextResponse.json(
      {
        video_id: videoId,
        timing_source: "youtube_asr",
        language_code: chosenTrack.languageCode,
        track_kind: chosenTrack.kind ?? null,
        diagnostics,
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

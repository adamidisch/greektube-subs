import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string };
};

function extractJsonArray(html: string, marker: string): CaptionTrack[] {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error("captionTracks marker not found");
  const start = html.indexOf("[", markerIndex + marker.length);
  if (start < 0) throw new Error("captionTracks array not found");

  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }

  throw new Error("captionTracks array is incomplete");
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("video") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  try {
    const watchResponse = await fetch(
      `https://www.youtube.com/watch?v=${videoId}&hl=en`,
      {
        cache: "no-store",
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        },
      },
    );

    if (!watchResponse.ok) {
      throw new Error(`YouTube watch page returned ${watchResponse.status}`);
    }

    const html = await watchResponse.text();
    const tracks = extractJsonArray(html, '"captionTracks":');
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
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
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

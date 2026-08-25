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

type SearchParams = Promise<{
  video?: string;
  offset?: string;
  limit?: string;
}>;

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

async function loadAsr(videoId: string) {
  let chosenTrack: CaptionTrack | undefined;
  const diagnostics: Array<Record<string, unknown>> = [];

  for (const client of clients) {
    const response = await fetch(
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

    const player = (await response.json()) as PlayerResponse;
    const tracks =
      player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    diagnostics.push({
      client: client.clientName,
      http_status: response.status,
      playability_status: player.playabilityStatus?.status ?? null,
      reason: player.playabilityStatus?.reason ?? null,
      track_count: tracks.length,
    });

    chosenTrack =
      tracks.find(
        (track) => track.languageCode === "en" && track.kind === "asr",
      ) ?? tracks.find((track) => track.languageCode === "en");
    if (chosenTrack?.baseUrl) break;
  }

  if (!chosenTrack?.baseUrl) {
    return { error: "English ASR track not found", diagnostics, events: [] };
  }

  const url = new URL(chosenTrack.baseUrl);
  url.searchParams.set("fmt", "json3");
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Referer: `https://www.youtube.com/watch?v=${videoId}`,
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    },
  });
  const raw = await response.text();

  if (!response.ok || !raw.trim().startsWith("{")) {
    return {
      error: `YouTube captions unavailable (status ${response.status})`,
      diagnostics,
      events: [],
    };
  }

  const json3 = JSON.parse(raw) as { events?: unknown[] };
  return {
    diagnostics,
    language_code: chosenTrack.languageCode,
    track_kind: chosenTrack.kind ?? null,
    events: json3.events ?? [],
  };
}

export default async function AsrProbePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const videoId = params.video ?? "";
  const offset = Math.max(0, Number.parseInt(params.offset ?? "0", 10) || 0);
  const limit = Math.min(
    500,
    Math.max(1, Number.parseInt(params.limit ?? "500", 10) || 500),
  );

  const payload = /^[A-Za-z0-9_-]{11}$/.test(videoId)
    ? await loadAsr(videoId)
    : { error: "Invalid video id", diagnostics: [], events: [] };

  const output = {
    video_id: videoId,
    timing_source: "youtube_asr",
    offset,
    limit,
    total_events: payload.events.length,
    diagnostics: payload.diagnostics,
    language_code: "language_code" in payload ? payload.language_code : null,
    track_kind: "track_kind" in payload ? payload.track_kind : null,
    error: "error" in payload ? payload.error : null,
    events: payload.events.slice(offset, offset + limit),
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090b10",
        color: "#f2f3f6",
        padding: "24px",
      }}
    >
      <h1 style={{ fontSize: "18px", marginBottom: "16px" }}>
        v8.1 YouTube ASR probe
      </h1>
      <pre
        id="asr-json"
        style={{
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontSize: "13px",
          lineHeight: 1.55,
          color: "#d7dbe3",
        }}
      >
        {JSON.stringify(output)}
      </pre>
    </main>
  );
}

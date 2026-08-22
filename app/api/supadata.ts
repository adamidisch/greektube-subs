export type SupadataCue = {
  start: number;
  duration: number;
  text: string;
};

export type SupadataTranscript = {
  lang: string;
  cues: SupadataCue[];
  source?: "youtube-manual" | "youtube-auto" | "supadata-native";
};

type SupadataChunk = {
  text?: unknown;
  offset?: unknown;
  duration?: unknown;
  lang?: unknown;
};

type SupadataResult = {
  content?: unknown;
  lang?: unknown;
  availableLangs?: unknown;
  jobId?: unknown;
  status?: unknown;
  result?: unknown;
  error?: unknown;
};

type YouTubeCaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
};

type YouTubePlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: YouTubeCaptionTrack[];
    };
  };
};

const API_BASE = "https://api.supadata.ai/v1/transcript";
const YOUTUBE_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function parseYouTubeTimedText(value: string): SupadataCue[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed) as {
        events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
      };
      return (payload.events || []).map(event => ({
        start: Math.max(0, Number(event.tStartMs || 0) / 1000),
        duration: Math.max(0.05, Number(event.dDurationMs || 2800) / 1000),
        text: decodeEntities((event.segs || []).map(segment => segment.utf8 || "").join("").replace(/\s+/g, " ").trim()),
      })).filter(cue => cue.text.length > 0);
    } catch {
      return [];
    }
  }

  const cues: SupadataCue[] = [];
  const paragraph = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraph.exec(trimmed))) {
    const start = /\bt="(\d+(?:\.\d+)?)"/.exec(match[1]);
    if (!start) continue;
    const duration = /\bd="(\d+(?:\.\d+)?)"/.exec(match[1]);
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!text) continue;
    cues.push({
      start: Number(start[1]) / 1000,
      duration: duration ? Math.max(0.05, Number(duration[1]) / 1000) : 2.8,
      text,
    });
  }
  return cues;
}

function extractInitialPlayerResponse(html: string): YouTubePlayerResponse | null {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = html.indexOf(marker);
  const start = markerIndex >= 0 ? html.indexOf("{", markerIndex + marker.length) : -1;
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, index + 1)) as YouTubePlayerResponse; }
        catch { return null; }
      }
    }
  }
  return null;
}

function preferredEnglishTrack(tracks: YouTubeCaptionTrack[]) {
  return [...tracks]
    .filter(track => {
      const language = track.languageCode?.toLowerCase() || "";
      return Boolean(track.baseUrl) && (language === "en" || language.startsWith("en-"));
    })
    .sort((left, right) => {
      const languageScore = (track: YouTubeCaptionTrack) => (track.languageCode?.toLowerCase() === "en" ? 0 : 1);
      const manualScore = (track: YouTubeCaptionTrack) => (track.kind === "asr" ? 1 : 0);
      return languageScore(left) - languageScore(right) || manualScore(left) - manualScore(right);
    })[0] || null;
}

async function fetchDirectYouTubeEnglish(videoId: string): Promise<SupadataTranscript | null> {
  try {
    // One bounded native attempt only. We do not search third-party sources or
    // spend time hunting for manual captions. If YouTube exposes an English
    // track in the normal watch payload, manual wins immediately; otherwise
    // the auto-generated ASR track is used. Any failure falls straight through
    // to the existing Supadata native fallback.
    const watch = await fetchWithTimeout(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
      cache: "no-store",
      headers: { "User-Agent": YOUTUBE_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
    }, 2_500);
    if (!watch.ok) return null;
    const player = extractInitialPlayerResponse(await watch.text());
    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const track = preferredEnglishTrack(tracks);
    if (!track?.baseUrl) return null;

    for (const format of ["json3", "srv3"] as const) {
      const url = new URL(track.baseUrl);
      url.searchParams.set("fmt", format);
      const response = await fetchWithTimeout(url.toString(), {
        cache: "no-store",
        headers: { "User-Agent": YOUTUBE_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
      }, 2_500);
      if (!response.ok) continue;
      const cues = parseYouTubeTimedText(await response.text());
      if (cues.length) {
        return {
          lang: track.languageCode?.toLowerCase() || "en",
          cues,
          source: track.kind === "asr" ? "youtube-auto" : "youtube-manual",
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function apiKey() {
  const value = process.env.SUPADATA_API_KEY?.trim();
  if (!value) throw new Error("SUPADATA_API_KEY is not configured");
  return value;
}

function transcriptFromPayload(payload: SupadataResult): SupadataTranscript | null {
  const source = payload.result && typeof payload.result === "object"
    ? payload.result as SupadataResult
    : payload;
  if (!Array.isArray(source.content)) return null;

  const cues = (source.content as SupadataChunk[])
    .map((chunk) => {
      const text = typeof chunk.text === "string" ? chunk.text.replace(/\s+/g, " ").trim() : "";
      const offset = Number(chunk.offset);
      const duration = Number(chunk.duration);
      if (!text || !Number.isFinite(offset) || !Number.isFinite(duration)) return null;
      return {
        start: Math.max(0, offset / 1000),
        duration: Math.max(0.05, duration / 1000),
        text,
      } satisfies SupadataCue;
    })
    .filter((cue): cue is SupadataCue => cue !== null);

  if (!cues.length) return null;
  const lang = typeof source.lang === "string" && source.lang.trim()
    ? source.lang.trim().toLowerCase()
    : "unknown";
  return { lang, cues, source: "supadata-native" };
}

async function parseError(response: Response) {
  try {
    const body = await response.json() as SupadataResult;
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return (await response.text().catch(() => "")).slice(0, 500);
  }
}

async function pollJob(jobId: string, key: string) {
  // Bound source polling well below the Vercel function limit. A timed-out
  // source slice is retried by the checkpoint state machine, not held open.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetchWithTimeout(`${API_BASE}/${encodeURIComponent(jobId)}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supadata job ${response.status}: ${await parseError(response)}`);
    const payload = await response.json() as SupadataResult;
    const status = typeof payload.status === "string" ? payload.status : "";
    if (status === "failed") {
      throw new Error(`Supadata job failed: ${typeof payload.error === "string" ? payload.error : "unknown error"}`);
    }
    const transcript = transcriptFromPayload(payload);
    if (status === "completed" && transcript) return transcript;
  }
  throw new Error("Supadata transcript job timed out");
}

export async function fetchSupadataTranscript(videoId: string): Promise<SupadataTranscript> {
  const direct = await fetchDirectYouTubeEnglish(videoId);
  if (direct) {
    console.info("[captions:source]", JSON.stringify({ videoId, source: direct.source, cues: direct.cues.length }));
    return direct;
  }

  const key = apiKey();
  const endpoint = new URL(API_BASE);
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("text", "false");
  endpoint.searchParams.set("mode", "native");

  const response = await fetchWithTimeout(endpoint.toString(), {
    headers: { "x-api-key": key },
    cache: "no-store",
  });

  if (response.status === 202) {
    const payload = await response.json() as SupadataResult;
    if (typeof payload.jobId !== "string" || !payload.jobId) {
      throw new Error("Supadata returned 202 without a jobId");
    }
    const transcript = await pollJob(payload.jobId, key);
    console.info("[captions:source]", JSON.stringify({ videoId, source: transcript.source, cues: transcript.cues.length }));
    return transcript;
  }

  if (!response.ok) {
    throw new Error(`Supadata ${response.status}: ${await parseError(response)}`);
  }

  const payload = await response.json() as SupadataResult;
  const transcript = transcriptFromPayload(payload);
  if (!transcript) throw new Error("Supadata returned an empty native transcript");
  console.info("[captions:source]", JSON.stringify({ videoId, source: transcript.source, cues: transcript.cues.length }));
  return transcript;
}

export async function fetchYouTubeOEmbed(videoId: string) {
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    endpoint.searchParams.set("format", "json");
    const response = await fetchWithTimeout(endpoint.toString(), { cache: "no-store" }, 8_000);
    if (!response.ok) return { title: "", authorName: "" };
    const payload = await response.json() as { title?: unknown; author_name?: unknown };
    return {
      title: typeof payload.title === "string" ? payload.title : "",
      authorName: typeof payload.author_name === "string" ? payload.author_name : "",
    };
  } catch {
    return { title: "", authorName: "" };
  }
}

import type { SubtitleCue } from "./subtitle-contract";

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

type ClientProfile = {
  clientName: string;
  clientVersion: string;
  userAgent: string;
  androidSdkVersion?: number;
  deviceModel?: string;
};

const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${API_KEY}&prettyPrint=false`;
const WEB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

const CLIENTS: ClientProfile[] = [
  {
    clientName: "WEB",
    clientVersion: "2.20260723.00.00",
    userAgent: WEB_USER_AGENT,
  },
  {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    androidSdkVersion: 30,
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11)",
  },
  {
    clientName: "IOS",
    clientVersion: "20.10.4",
    deviceModel: "iPhone16,2",
    userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)",
  },
  {
    clientName: "TVHTML5",
    clientVersion: "7.20260723.18.00",
    userAgent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
  },
];

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

function parseTimedText(body: string): SubtitleCue[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed) as {
        events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[];
      };
      return (payload.events ?? [])
        .map(event => ({
          start: Number(event.tStartMs ?? 0) / 1000,
          duration: Math.max(0.05, Number(event.dDurationMs ?? 2800) / 1000),
          text: decodeEntities((event.segs ?? []).map(segment => segment.utf8 ?? "").join("").replace(/\s+/g, " ").trim()),
        }))
        .filter(cue => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.duration));
    } catch {
      return [];
    }
  }

  const cues: SubtitleCue[] = [];
  const paragraph = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraph.exec(body))) {
    const startMatch = /\bt="(\d+(?:\.\d+)?)"/.exec(match[1]);
    if (!startMatch) continue;
    const durationMatch = /\bd="(\d+(?:\.\d+)?)"/.exec(match[1]);
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!text) continue;
    cues.push({
      start: Number(startMatch[1]) / 1000,
      duration: durationMatch ? Math.max(0.05, Number(durationMatch[1]) / 1000) : 2.8,
      text,
    });
  }
  return cues;
}

async function fetchPlayer(videoId: string, profile: ClientProfile) {
  const client = {
    clientName: profile.clientName,
    clientVersion: profile.clientVersion,
    hl: "en",
    gl: "US",
    ...(profile.androidSdkVersion ? { androidSdkVersion: profile.androidSdkVersion } : {}),
    ...(profile.deviceModel ? { deviceModel: profile.deviceModel } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(PLAYER_URL, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": profile.userAgent,
        Origin: "https://www.youtube.com",
        "X-Youtube-Client-Name": profile.clientName,
        "X-Youtube-Client-Version": profile.clientVersion,
      },
      body: JSON.stringify({ videoId, context: { client }, contentCheckOk: true, racyCheckOk: true }),
    });
    if (!response.ok) throw new Error(`${profile.clientName}:${response.status}`);
    return { player: await response.json() as PlayerResponse, userAgent: profile.userAgent, clientName: profile.clientName };
  } finally {
    clearTimeout(timeout);
  }
}

function extractInitialPlayerResponse(html: string) {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = html.indexOf(marker);
  const objectStart = markerIndex >= 0 ? html.indexOf("{", markerIndex + marker.length) : -1;
  if (objectStart < 0) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = objectStart; index < html.length; index += 1) {
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
        try {
          return JSON.parse(html.slice(objectStart, index + 1)) as PlayerResponse;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchPublicPagePlayer(url: string, clientName: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": WEB_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) throw new Error(`${clientName}:${response.status}`);
    const player = extractInitialPlayerResponse(await response.text());
    if (!player) throw new Error(`${clientName}:no-player-response`);
    return { player, userAgent: WEB_USER_AGENT, clientName };
  } finally {
    clearTimeout(timeout);
  }
}

function englishTracks(tracks: CaptionTrack[]) {
  return tracks
    .filter(track => {
      const language = track.languageCode?.toLowerCase() || "";
      return Boolean(track.baseUrl) && (language === "en" || language.startsWith("en-"));
    })
    .sort((left, right) => {
      const exactEnglish = (track: CaptionTrack) => track.languageCode?.toLowerCase() === "en" ? 0 : 1;
      const automatic = (track: CaptionTrack) => track.kind === "asr" ? 1 : 0;
      return exactEnglish(left) - exactEnglish(right) || automatic(left) - automatic(right);
    });
}

async function fetchTrack(track: CaptionTrack, userAgent: string) {
  if (!track.baseUrl) return [] as SubtitleCue[];
  for (const format of ["json3", "srv3", null] as const) {
    const url = new URL(track.baseUrl);
    if (format) url.searchParams.set("fmt", format);
    else url.searchParams.delete("fmt");
    url.searchParams.delete("tlang");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        cache: "no-store",
        headers: { "User-Agent": userAgent, "Accept-Language": "en-US,en;q=0.9" },
      });
      if (!response.ok) continue;
      const cues = parseTimedText(await response.text());
      if (cues.length) return cues;
    } catch {
      // Try the next YouTube caption format. No paid provider is touched here.
    } finally {
      clearTimeout(timeout);
    }
  }
  return [] as SubtitleCue[];
}

async function usableEnglishFromCandidate(
  candidate: { player: PlayerResponse; userAgent: string; clientName: string },
  failures: string[],
) {
  const { player, userAgent, clientName } = candidate;
  if (player.playabilityStatus?.status !== "OK") {
    failures.push(`${clientName}:${player.playabilityStatus?.reason || player.playabilityStatus?.status || "not-playable"}`);
    return null;
  }

  for (const track of englishTracks(player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])) {
    const cues = await fetchTrack(track, userAgent);
    if (!cues.length) continue;
    return {
      cues,
      source: track.kind === "asr" ? "youtube-auto" as const : "youtube-manual" as const,
      languageCode: track.languageCode?.toLowerCase() || "en",
      client: clientName,
    };
  }
  failures.push(`${clientName}:no-usable-english-track`);
  return null;
}

/**
 * Free first-choice source: obtain native English timed text from public YouTube
 * surfaces before any paid provider. Manual English is preferred over ASR.
 * This function performs no database/Blob writes.
 */
export async function fetchYouTubeNativeEnglish(videoId: string) {
  const failures: string[] = [];

  for (const profile of CLIENTS) {
    try {
      const result = await usableEnglishFromCandidate(await fetchPlayer(videoId, profile), failures);
      if (result) return result;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${profile.clientName}:failed`);
    }
  }

  const publicPages = [
    {
      clientName: "WEB_PAGE",
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
    },
    {
      clientName: "EMBED_PAGE",
      url: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?hl=en&cc_load_policy=1`,
    },
    {
      clientName: "NOCOOKIE_EMBED_PAGE",
      url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?hl=en&cc_load_policy=1`,
    },
  ];

  for (const page of publicPages) {
    try {
      const result = await usableEnglishFromCandidate(await fetchPublicPagePlayer(page.url, page.clientName), failures);
      if (result) return result;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${page.clientName}:failed`);
    }
  }

  throw new Error(`youtube-native-failed:${failures.join("|")}`);
}

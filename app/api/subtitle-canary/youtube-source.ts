import type { SubtitleCue } from "../captions/subtitle-contract";

type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string; name?: { simpleText?: string; runs?: { text?: string }[] } };
type PlayerResponse = { playabilityStatus?: { status?: string; reason?: string }; captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } };
type ClientProfile = { clientName: string; clientVersion: string; userAgent: string; androidSdkVersion?: number; deviceModel?: string };

const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${API_KEY}&prettyPrint=false`;
const CLIENTS: ClientProfile[] = [
  { clientName: "WEB", clientVersion: "2.20260723.00.00", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36" },
  { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11)" },
  { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2", userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)" },
  { clientName: "TVHTML5", clientVersion: "7.20260723.18.00", userAgent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version" },
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
  if (trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed) as { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[] };
      return (payload.events ?? []).map(event => ({
        start: (event.tStartMs ?? 0) / 1000,
        duration: (event.dDurationMs ?? 2800) / 1000,
        text: decodeEntities((event.segs ?? []).map(segment => segment.utf8 ?? "").join("").replace(/\s+/g, " ").trim()),
      })).filter(cue => cue.text);
    } catch { return []; }
  }
  const cues: SubtitleCue[] = [];
  const paragraph = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraph.exec(body))) {
    const startMatch = /\bt="(\d+(?:\.\d+)?)"/.exec(match[1]);
    if (!startMatch) continue;
    const durationMatch = /\bd="(\d+(?:\.\d+)?)"/.exec(match[1]);
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (text) cues.push({ start: Number(startMatch[1]) / 1000, duration: durationMatch ? Number(durationMatch[1]) / 1000 : 2.8, text });
  }
  return cues;
}

async function fetchPlayer(videoId: string, profile: ClientProfile) {
  const client = { clientName: profile.clientName, clientVersion: profile.clientVersion, hl: "en", gl: "US", ...(profile.androidSdkVersion ? { androidSdkVersion: profile.androidSdkVersion } : {}), ...(profile.deviceModel ? { deviceModel: profile.deviceModel } : {}) };
  const response = await fetch(PLAYER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": profile.userAgent, Origin: "https://www.youtube.com", "X-Youtube-Client-Name": profile.clientName, "X-Youtube-Client-Version": profile.clientVersion },
    body: JSON.stringify({ videoId, context: { client }, contentCheckOk: true, racyCheckOk: true }),
  });
  if (!response.ok) throw new Error(`${profile.clientName}:${response.status}`);
  const player = await response.json() as PlayerResponse;
  return { player, userAgent: profile.userAgent, clientName: profile.clientName };
}

function englishTracks(tracks: CaptionTrack[]) {
  return tracks.filter(track => {
    const language = track.languageCode?.toLowerCase() || "";
    return language === "en" || language.startsWith("en-");
  }).sort((a, b) => Number(a.kind === "asr") - Number(b.kind === "asr"));
}

async function fetchTrack(track: CaptionTrack, userAgent: string) {
  if (!track.baseUrl) return [] as SubtitleCue[];
  for (const format of ["json3", "srv3", null] as const) {
    const url = new URL(track.baseUrl);
    if (format) url.searchParams.set("fmt", format); else url.searchParams.delete("fmt");
    url.searchParams.delete("tlang");
    const response = await fetch(url.toString(), { headers: { "User-Agent": userAgent, "Accept-Language": "en-US,en;q=0.9" } });
    if (!response.ok) continue;
    const cues = parseTimedText(await response.text());
    if (cues.length) return cues;
  }
  return [] as SubtitleCue[];
}

export async function fetchYouTubeEnglishSource(videoId: string) {
  const failures: string[] = [];
  for (const profile of CLIENTS) {
    try {
      const { player, userAgent, clientName } = await fetchPlayer(videoId, profile);
      if (player.playabilityStatus?.status !== "OK") {
        failures.push(`${clientName}:${player.playabilityStatus?.reason || player.playabilityStatus?.status || "not-playable"}`);
        continue;
      }
      const tracks = englishTracks(player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
      for (const track of tracks) {
        const cues = await fetchTrack(track, userAgent);
        if (cues.length) return { cues, source: track.kind === "asr" ? "youtube-auto" : "youtube-manual", client: clientName, languageCode: track.languageCode || "en" };
      }
      failures.push(`${clientName}:no-usable-english-track`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "youtube-failed");
    }
  }
  throw new Error(`youtube-direct-failed:${failures.join("|")}`);
}

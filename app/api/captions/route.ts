import { NextResponse } from "next/server";

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  name?: { simpleText?: string; runs?: { text?: string }[] };
};

const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${API_KEY}&prettyPrint=false`;
const CLIENTS = [
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
];

function extractVideoId(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{6,20}$/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/")[1] || null;
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchPlayer(videoId: string) {
  const errors: string[] = [];
  for (const profile of CLIENTS) {
    try {
      const client = {
        clientName: profile.clientName,
        clientVersion: profile.clientVersion,
        hl: "en",
        gl: "US",
        ...("androidSdkVersion" in profile ? { androidSdkVersion: profile.androidSdkVersion } : {}),
        ...("deviceModel" in profile ? { deviceModel: profile.deviceModel } : {}),
      };
      const response = await fetch(PLAYER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": profile.userAgent,
          Origin: "https://www.youtube.com",
        },
        body: JSON.stringify({
          videoId,
          context: { client },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!response.ok) {
        errors.push(`${profile.clientName}: ${response.status}`);
        continue;
      }
      const player = (await response.json()) as PlayerResponse;
      const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (player.playabilityStatus?.status === "OK" && tracks.length) return player;
      errors.push(`${profile.clientName}: ${player.playabilityStatus?.reason || "χωρίς captions"}`);
    } catch (error) {
      errors.push(`${profile.clientName}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  throw new Error(errors.join(" · "));
}

function chooseTrack(tracks: CaptionTrack[]) {
  return [...tracks].sort((a, b) => {
    const score = (track: CaptionTrack) => {
      const language = track.languageCode?.toLowerCase() || "";
      const english = language === "en" ? 0 : language.startsWith("en-") ? 1 : 4;
      const automatic = track.kind === "asr" ? 1 : 0;
      return english * 10 + automatic;
    };
    return score(a) - score(b);
  })[0];
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function parseTimedText(xml: string) {
  const cues: { start: number; duration: number; text: string }[] = [];
  const paragraph = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraph.exec(xml))) {
    const attributes = match[1];
    const startMatch = /\bt="(\d+(?:\.\d+)?)"/.exec(attributes);
    if (!startMatch) continue;
    const durationMatch = /\bd="(\d+(?:\.\d+)?)"/.exec(attributes);
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (!text) continue;
    cues.push({
      start: Number(startMatch[1]) / 1000,
      duration: durationMatch ? Number(durationMatch[1]) / 1000 : 2.8,
      text,
    });
  }
  return cues;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || body.url.length > 500) {
      return NextResponse.json({ error: "Βάλε ένα έγκυρο YouTube link." }, { status: 400 });
    }
    const videoId = extractVideoId(body.url);
    if (!videoId) {
      return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });
    }

    const player = await fetchPlayer(videoId);
    const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = chooseTrack(tracks);
    if (!track?.baseUrl) {
      return NextResponse.json({ error: "Το video δεν διαθέτει captions." }, { status: 404 });
    }

    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.set("fmt", "srv3");
    if (track.languageCode !== "el") captionUrl.searchParams.set("tlang", "el");

    const captionResponse = await fetch(captionUrl.toString(), {
      headers: { "User-Agent": CLIENTS[0].userAgent },
    });
    if (!captionResponse.ok) throw new Error(`Captions ${captionResponse.status}`);
    const cues = parseTimedText(await captionResponse.text());
    if (!cues.length) {
      return NextResponse.json(
        { error: "Τα captions βρέθηκαν αλλά η ελληνική μετάφραση δεν ήταν διαθέσιμη." },
        { status: 422 },
      );
    }

    return NextResponse.json({
      videoId,
      title: player.videoDetails?.title || "YouTube video",
      channel: player.videoDetails?.author || "YouTube",
      sourceLanguage: track.languageCode || "unknown",
      sourceType: track.kind === "asr" ? "automatic" : "manual",
      cues,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? `Δεν μπόρεσα να πάρω τα captions. ${error.message}`
            : "Δεν μπόρεσα να πάρω τα captions.",
      },
      { status: 502 },
    );
  }
}

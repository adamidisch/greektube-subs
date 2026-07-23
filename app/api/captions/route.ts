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

type CaptionCue = {
  start: number;
  duration: number;
  text: string;
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
  const cues: CaptionCue[] = [];
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

function hasGreekText(cues: CaptionCue[]) {
  const sample = cues
    .slice(0, 120)
    .map((cue) => cue.text)
    .join(" ");
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  const greek = sample.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length ?? 0;
  return letters > 0 && greek / letters > 0.22;
}

async function fetchCaptionCues(track: CaptionTrack, targetLanguage?: string) {
  if (!track.baseUrl) return [];
  const captionUrl = new URL(track.baseUrl);
  captionUrl.searchParams.set("fmt", "srv3");
  if (targetLanguage) {
    captionUrl.searchParams.set("tlang", targetLanguage);
  } else {
    captionUrl.searchParams.delete("tlang");
  }

  const response = await fetch(captionUrl.toString(), {
    headers: { "User-Agent": CLIENTS[0].userAgent },
  });
  if (!response.ok) throw new Error(`Captions ${response.status}`);
  return parseTimedText(await response.text());
}

function createTranslationBatches(cues: CaptionCue[]) {
  const batches: { index: number; text: string }[][] = [];
  let current: { index: number; text: string }[] = [];
  let length = 0;

  cues.forEach((cue, index) => {
    const itemLength = cue.text.length + 14;
    if (current.length && (current.length >= 48 || length + itemLength > 3400)) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push({ index, text: cue.text });
    length += itemLength;
  });
  if (current.length) batches.push(current);
  return batches;
}

async function translateBatch(batch: { index: number; text: string }[]) {
  const source = batch.map((item) => `[[${item.index}]] ${item.text}`).join("\n");
  const body = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: "el",
    dt: "t",
    q: source,
  });
  const response = await fetch("https://translate.googleapis.com/translate_a/single", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  if (!response.ok) throw new Error(`Translation ${response.status}`);
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error("Translation response invalid");
  }

  const translated = (payload[0] as unknown[])
    .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
    .join("");
  const results = new Map<number, string>();
  const marker = /\[\[(\d+)\]\]\s*([\s\S]*?)(?=\n?\[\[\d+\]\]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(translated))) {
    const text = match[2].replace(/\s+/g, " ").trim();
    if (text) results.set(Number(match[1]), text);
  }
  return results;
}

async function translateCuesToGreek(cues: CaptionCue[]) {
  const batches = createTranslationBatches(cues);
  const translated = new Map<number, string>();

  for (let start = 0; start < batches.length; start += 4) {
    const group = await Promise.all(batches.slice(start, start + 4).map(translateBatch));
    group.forEach((results) => {
      results.forEach((text, index) => translated.set(index, text));
    });
  }

  const missing = cues.filter((_, index) => !translated.has(index)).length;
  if (missing > Math.max(3, Math.floor(cues.length * 0.04))) {
    throw new Error("Η ελληνική μετάφραση δεν ολοκληρώθηκε");
  }

  return cues.map((cue, index) => ({
    ...cue,
    text: translated.get(index) ?? cue.text,
  }));
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

    let cues: CaptionCue[] = [];
    let translationMethod = "original_greek";

    if (track.languageCode === "el") {
      cues = await fetchCaptionCues(track);
    } else {
      try {
        const youtubeTranslated = await fetchCaptionCues(track, "el");
        if (hasGreekText(youtubeTranslated)) {
          cues = youtubeTranslated;
          translationMethod = "youtube_auto_translate";
        }
      } catch {
        // Continue with the verified translation fallback below.
      }

      if (!cues.length) {
        const sourceCues = await fetchCaptionCues(track);
        if (!sourceCues.length) throw new Error("Το αγγλικό caption track είναι κενό");
        cues = await translateCuesToGreek(sourceCues);
        translationMethod = "google_translate_fallback";
      }
    }

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
      translationMethod,
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

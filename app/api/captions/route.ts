import { NextResponse } from "next/server";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  completeTranscript,
  failTranscript,
  getTranscript,
  updateProcessingProgress,
} from "../shared-cache";
import { fetchSupadataTranscript, fetchYouTubeOEmbed } from "../supadata";

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string; lengthSeconds?: string; shortDescription?: string };
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

type ClientCachedTranscript = {
  videoId?: unknown;
  title?: unknown;
  originalTitle?: unknown;
  channel?: unknown;
  duration?: unknown;
  cues?: CaptionCue[];
  englishCues?: CaptionCue[];
  keyPoints?: string[];
  topics?: string[];
  transcriptVersion?: unknown;
};

type SpeakerProfile = {
  name: string;
  role: string;
  importance: string;
  currentWork: string;
  highlights: string[];
};

const SPEAKERS_BY_VIDEO: Record<string, SpeakerProfile> = {
  ATKu1Cxs2Pc: {
    name: "Dr Philip Ovadia",
    role: "Καρδιοθωρακοχειρουργός και ειδικός στη μεταβολική υγεία",
    importance: "Έχει πραγματοποιήσει χιλιάδες καρδιοχειρουργικές επεμβάσεις και είναι γνωστός για τη σύνδεση της μεταβολικής υγείας με την πρόληψη της καρδιοπάθειας.",
    currentWork: "Συνεχίζει ως καρδιοθωρακοχειρουργός και διευθύνει την Ovadia Heart Health με εξ αποστάσεως προγράμματα πρόληψης.",
    highlights: ["Καρδιοχειρουργική εμπειρία", "Πρόληψη καρδιοπάθειας", "Μεταβολική υγεία", "Διατροφή και τρόπος ζωής"],
  },
  NqLpQhii_fU: {
    name: "Dr Sarah Myhill",
    role: "Ιατρός με πολυετή ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",
    importance: "Είναι ευρέως γνωστή για το εκπαιδευτικό της έργο γύρω από το ME/CFS τη μιτοχονδριακή λειτουργία τη διατροφή και τον τρόπο ζωής.",
    currentWork: "Σήμερα γράφει διδάσκει και δημοσιεύει εκπαιδευτικό υλικό για τη χρόνια κόπωση τη διατροφή και τη μεταβολική υγεία.",
    highlights: ["ME/CFS και χρόνια κόπωση", "Μιτοχόνδρια και ενέργεια", "Διατροφή και μικροθρεπτικά", "Περιβαλλοντικοί παράγοντες"],
  },
  KkBy__7d9Fs: {
    name: "Dr Sarah Myhill",
    role: "Ιατρός με πολυετή ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",
    importance: "Είναι ευρέως γνωστή για το εκπαιδευτικό της έργο γύρω από το ME/CFS τη μιτοχονδριακή λειτουργία τη διατροφή και τον τρόπο ζωής.",
    currentWork: "Σήμερα γράφει διδάσκει και δημοσιεύει εκπαιδευτικό υλικό για τη χρόνια κόπωση τη διατροφή και τη μεταβολική υγεία.",
    highlights: ["ME/CFS και χρόνια κόπωση", "Μιτοχόνδρια και ενέργεια", "Διατροφή και μικροθρεπτικά", "Περιβαλλοντικοί παράγοντες"],
  },
  "0_adZSC0sFI": {
    name: "Dr Sarah Myhill",
    role: "Ιατρός με πολυετή ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",
    importance: "Είναι ευρέως γνωστή για το εκπαιδευτικό της έργο γύρω από το ME/CFS τη μιτοχονδριακή λειτουργία τη διατροφή και τον τρόπο ζωής.",
    currentWork: "Σήμερα γράφει διδάσκει και δημοσιεύει εκπαιδευτικό υλικό για τη χρόνια κόπωση τη διατροφή και τη μεταβολική υγεία.",
    highlights: ["ME/CFS και χρόνια κόπωση", "Μιτοχόνδρια και ενέργεια", "Διατροφή και μικροθρεπτικά", "Περιβαλλοντικοί παράγοντες"],
  },
  D2RjneeG_xA: {
    name: "Dr Sarah Myhill",
    role: "Ιατρός με πολυετή ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική",
    importance: "Είναι ευρέως γνωστή για το εκπαιδευτικό της έργο γύρω από το ME/CFS τη μιτοχονδριακή λειτουργία τη διατροφή και τον τρόπο ζωής.",
    currentWork: "Σήμερα γράφει διδάσκει και δημοσιεύει εκπαιδευτικό υλικό για τη χρόνια κόπωση τη διατροφή και τη μεταβολική υγεία.",
    highlights: ["ME/CFS και χρόνια κόπωση", "Μιτοχόνδρια και ενέργεια", "Διατροφή και μικροθρεπτικά", "Περιβαλλοντικοί παράγοντες"],
  },
  "fX2z-BF8Jac": {
    name: "Dr Natasha Campbell-McBride",
    role: "Ιατρός με μεταπτυχιακή εκπαίδευση στη νευρολογία και στην ανθρώπινη διατροφή",
    importance: "Είναι γνωστή διεθνώς ως δημιουργός της προσέγγισης GAPS και για το έργο της γύρω από τη σχέση εντέρου εγκεφάλου και διατροφής.",
    currentWork: "Σήμερα γράφει εκπαιδεύει επαγγελματίες και αναπτύσσει το διεθνές εκπαιδευτικό πρόγραμμα GAPS.",
    highlights: ["Σχέση εντέρου και εγκεφάλου", "Ανθρώπινη διατροφή", "Μικροβίωμα", "Εκπαίδευση GAPS"],
  },
};

function speakerProfile(videoId: string, description = "", channel = ""): SpeakerProfile {
  const known = SPEAKERS_BY_VIDEO[videoId];
  if (known) return known;
  const match = description.match(/\b(?:Dr\.?|Doctor)\s+([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})/);
  const name = match ? `Dr ${match[1]}` : channel;
  return {
    name: name || "Ομιλητής του βίντεο",
    role: "Ομιλητής και δημιουργός του περιεχομένου",
    importance: "Το προφίλ του ομιλητή δεν έχει ακόμη επιβεβαιωθεί από αρκετές αξιόπιστες πληροφορίες.",
    currentWork: "Θα προστεθούν περισσότερα στοιχεία μόλις επιβεβαιωθεί η ταυτότητα και η σημερινή δραστηριότητά του.",
    highlights: ["Ταυτότητα ομιλητή", "Επαγγελματική ιδιότητα", "Κύριο έργο", "Σημερινή δραστηριότητα"],
  };
}

const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const PLAYER_URL = `https://www.youtube.com/youtubei/v1/player?key=${API_KEY}&prettyPrint=false`;
type ClientProfile = {
  clientName: string;
  clientVersion: string;
  userAgent: string;
  androidSdkVersion?: number;
  deviceModel?: string;
};

type PlayerCandidate = {
  player: PlayerResponse;
  clientName: string;
  userAgent: string;
};

const CLIENTS: ClientProfile[] = [
  {
    clientName: "WEB",
    clientVersion: "2.20260723.00.00",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
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
    userAgent:
      "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
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

async function fetchPlayers(videoId: string) {
  const errors: string[] = [];
  const candidates: PlayerCandidate[] = [];
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
          "X-Youtube-Client-Name": profile.clientName,
          "X-Youtube-Client-Version": profile.clientVersion,
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
      if (player.playabilityStatus?.status === "OK" && tracks.length) {
        candidates.push({ player, clientName: profile.clientName, userAgent: profile.userAgent });
      } else {
        errors.push(`${profile.clientName}: ${player.playabilityStatus?.reason || "χωρίς captions"}`);
      }
    } catch (error) {
      errors.push(`${profile.clientName}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  try {
    const watchResponse = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
    );
    if (watchResponse.ok) {
      const html = await watchResponse.text();
      const marker = "ytInitialPlayerResponse";
      const markerIndex = html.indexOf(marker);
      const objectStart = markerIndex >= 0 ? html.indexOf("{", markerIndex + marker.length) : -1;
      if (objectStart >= 0) {
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
              const player = JSON.parse(html.slice(objectStart, index + 1)) as PlayerResponse;
              const tracks =
                player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
              if (tracks.length) {
                candidates.push({
                  player,
                  clientName: "WEB_PAGE",
                  userAgent: CLIENTS[0].userAgent,
                });
              }
              break;
            }
          }
        }
      }
    }
    errors.push(`WEB page: ${watchResponse.status}`);
  } catch (error) {
    errors.push(`WEB page: ${error instanceof Error ? error.message : "failed"}`);
  }
  if (candidates.length) return candidates;
  throw new Error(errors.join(" · "));
}

function orderedTracks(tracks: CaptionTrack[]) {
  return [...tracks].sort((a, b) => {
    const score = (track: CaptionTrack) => {
      const language = track.languageCode?.toLowerCase() || "";
      const english = language === "en" ? 0 : language.startsWith("en-") ? 1 : 4;
      const automatic = track.kind === "asr" ? 1 : 0;
      return english * 10 + automatic;
    };
    return score(a) - score(b);
  });
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
  const trimmed = xml.trim();
  if (trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed) as {
        events?: {
          tStartMs?: number;
          dDurationMs?: number;
          segs?: { utf8?: string }[];
        }[];
      };
      return (payload.events ?? [])
        .map((event) => ({
          start: (event.tStartMs ?? 0) / 1000,
          duration: (event.dDurationMs ?? 2800) / 1000,
          text: decodeEntities(
            (event.segs ?? [])
              .map((segment) => segment.utf8 ?? "")
              .join("")
              .replace(/\s+/g, " ")
              .trim(),
          ),
        }))
        .filter((cue) => cue.text);
    } catch {
      return [];
    }
  }

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
  if (!cues.length) {
    const textNode = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
    while ((match = textNode.exec(xml))) {
      const attributes = match[1];
      const startMatch = /\bstart="(\d+(?:\.\d+)?)"/.exec(attributes);
      if (!startMatch) continue;
      const durationMatch = /\bdur="(\d+(?:\.\d+)?)"/.exec(attributes);
      const text = decodeEntities(
        match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
      );
      if (!text) continue;
      cues.push({
        start: Number(startMatch[1]),
        duration: durationMatch ? Number(durationMatch[1]) : 2.8,
        text,
      });
    }
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

async function fetchCaptionCues(track: CaptionTrack, userAgent: string, targetLanguage?: string) {
  if (!track.baseUrl) return [];
  const formats = ["json3", "srv3", null] as const;
  const failures: string[] = [];

  for (const format of formats) {
    const captionUrl = new URL(track.baseUrl);
    if (format) captionUrl.searchParams.set("fmt", format);
    else captionUrl.searchParams.delete("fmt");
    if (targetLanguage) captionUrl.searchParams.set("tlang", targetLanguage);
    else captionUrl.searchParams.delete("tlang");

    try {
      const response = await fetch(captionUrl.toString(), {
        headers: {
          "User-Agent": userAgent,
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) {
        failures.push(`${format || "default"}: ${response.status}`);
        continue;
      }
      const cues = parseTimedText(await response.text());
      if (cues.length) return cues;
      failures.push(`${format || "default"}: κενό`);
    } catch (error) {
      failures.push(`${format || "default"}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  throw new Error(failures.join(" · "));
}

function createMeaningUnits(cues: CaptionCue[]) {
  const units: CaptionCue[] = [];
  let current: CaptionCue[] = [];
  let characters = 0;

  const flush = () => {
    if (!current.length) return;
    const start = current[0].start;
    const end = current.reduce(
      (latest, cue) => Math.max(latest, cue.start + cue.duration),
      start,
    );
    units.push({
      start,
      duration: Math.max(0.8, end - start),
      text: current.map(cue => cue.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    current = [];
    characters = 0;
  };

  cues.forEach((cue, index) => {
    const next = cues[index + 1];
    current.push(cue);
    characters += cue.text.length;
    const elapsed = cue.start + cue.duration - current[0].start;
    const sentenceEnd = /[.!?…]["')\]]?$/.test(cue.text.trim());
    const naturalPause = next ? next.start - (cue.start + cue.duration) >= 0.9 : true;
    const longEnough = elapsed >= 4.5 || characters >= 90;
    const mustSplit = elapsed >= 9 || characters >= 180;

    if (mustSplit || (longEnough && (sentenceEnd || naturalPause)) || !next) flush();
  });

  return units;
}

function cleanSubtitleText(text: string) {
  return text
    .replace(/\b([a-zα-ωάέήίόύώ])\1{3,}\b/giu, "")
    .replace(/\b(?:um+|uh+|erm+|h+m+|μμ+|χ+μ+)\b/giu, "")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([!?.,…])\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function translateText(text: string) {
  const body = new URLSearchParams({
    client: "gtx",
    sl: "en",
    tl: "el",
    dt: "t",
    q: text,
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

  return cleanSubtitleText((payload[0] as unknown[])
    .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
    .join("")
    .replace(/\s+/g, " "));
}

async function translateSingleCue(index: number, text: string) {
  try {
    const translated = await translateText(text);
    return translated ? { index, text: translated } : null;
  } catch {
    return null;
  }
}

async function translateMeaningBatch(batch: { index: number; text: string }[]) {
  const source = batch.map(item => `[[${item.index}]] ${item.text}`).join("\n");
  const translated = await translateText(source);
  const results = new Map<number, string>();
  const marker = /\[\[\s*(\d+)\s*\]\]\s*([\s\S]*?)(?=\n?\[\[\s*\d+\s*\]\]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(translated))) {
    const text = cleanSubtitleText(match[2]);
    if (text) results.set(Number(match[1]), text);
  }
  return results;
}

async function translateTitleToGreek(title: string) {
  if (!title || hasGreekText([{ start: 0, duration: 1, text: title }])) return title;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const translated = await translateSingleCue(0, title);
    if (translated?.text && hasGreekText([{ start: 0, duration: 1, text: translated.text }])) {
      return translated.text;
    }
  }
  return title;
}

async function translateCuesToGreek(cues: CaptionCue[]) {
  const translated = new Map<number, string>();
  const batches: { index: number; text: string }[][] = [];
  for (let start = 0; start < cues.length; start += 10) {
    batches.push(cues.slice(start, start + 10).map((cue, offset) => ({
      index: start + offset,
      text: cue.text,
    })));
  }
  for (let start = 0; start < batches.length; start += 3) {
    const results = await Promise.all(batches.slice(start, start + 3).map(translateMeaningBatch));
    results.forEach(batch => {
      batch.forEach((text, index) => translated.set(index, text));
    });
  }

  for (let retry = 0; retry < 2; retry += 1) {
    const pending = cues.map((_, index) => index).filter(index => !translated.has(index));
    if (!pending.length) break;
    for (const index of pending) {
      const result = await translateSingleCue(index, cues[index].text);
      if (result) translated.set(result.index, result.text);
    }
  }

  const stillMissing = cues.filter((_, index) => !translated.has(index)).length;
  if (stillMissing > 0) {
    throw new Error("Η ελληνική μετάφραση δεν ολοκληρώθηκε");
  }

  return cues.map((cue, index) => ({
    ...cue,
    text: translated.get(index) as string,
  }));
}

function validateCompleteGreekTranscript(cues: CaptionCue[], duration: number) {
  if (cues.length < 3 || !hasGreekText(cues)) {
    throw new Error("Οι ελληνικοί υπότιτλοι δεν ολοκληρώθηκαν");
  }
  const ordered = cues.every((cue, index) =>
    Number.isFinite(cue.start) &&
    Number.isFinite(cue.duration) &&
    cue.duration > 0 &&
    cue.text.trim().length > 0 &&
    (index === 0 || cue.start >= cues[index - 1].start),
  );
  if (!ordered) throw new Error("Οι χρονισμοί των υποτίτλων δεν ολοκληρώθηκαν");

  if (duration > 0) {
    const first = cues[0].start;
    const last = cues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
    const startsInTime = first <= Math.max(90, duration * 0.1);
    // Many YouTube videos end with a silent end-screen or recommendation
    // cards. Require the complete spoken portion instead of rejecting an
    // otherwise complete transcript because that outro has no captions.
    const reachesEnd = last >= duration * 0.82 || duration - last <= 180;
    if (!startsInTime || !reachesEnd) {
      throw new Error("Δεν βρέθηκαν πλήρεις υπότιτλοι για όλη τη διάρκεια του video");
    }
  }
}

function keyPoints(cues: CaptionCue[]) {
  if (!cues.length) return [];
  const step = Math.max(1, Math.floor(cues.length / 10));
  return cues.filter((_, index) => index % step === 0)
    .map(cue => cue.text.replace(/\s+/g, " ").trim())
    .filter((text, index, all) => text.length > 18 && all.indexOf(text) === index)
    .slice(0, 10);
}

async function cachedResponse(record: Awaited<ReturnType<typeof getTranscript>>) {
  if (!record) return null;
  const title = await translateTitleToGreek(record.title);
  const originalTitle = hasGreekText([{ start: 0, duration: 1, text: record.title }]) ? "" : record.title;
  return {
    status: record.status,
    progress: record.progress,
    videoId: record.videoId,
    title,
    originalTitle,
    channel: record.channel,
    duration: record.duration,
    sourceLanguage: record.originalLanguage,
    cues: record.greekTranscript,
    englishCues: record.englishTranscript,
    topics: record.topics,
    keyPoints: record.keyPoints,
    speaker: speakerProfile(record.videoId, "", record.channel),
    transcriptVersion: record.transcriptVersion,
    cached: true,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const value = url.searchParams.get("videoId") || url.searchParams.get("url") || "";
    const videoId = /^[\w-]{11}$/.test(value) ? value : extractVideoId(value);
    if (!videoId) {
      return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });
    }

    const cached = await getTranscript(videoId);
    if (!cached || cached.status !== "ready" || cached.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
    return NextResponse.json(await cachedResponse(cached), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  let lockToken: string | null = null;
  let lockedVideoId: string | null = null;
  try {
    const body = (await request.json()) as { url?: unknown; force?: unknown; cachedTranscript?: ClientCachedTranscript };
    if (typeof body.url !== "string" || body.url.length > 500) {
      return NextResponse.json({ error: "Βάλε ένα έγκυρο YouTube link." }, { status: 400 });
    }
    const videoId = extractVideoId(body.url);
    if (!videoId) {
      return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });
    }
    lockedVideoId = videoId;

    const force = body.force === true;
    const cached = await getTranscript(videoId);
    if (!force && cached?.status === "ready" && cached.transcriptVersion === TRANSCRIPT_VERSION) {
      try {
        validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
        return NextResponse.json(await cachedResponse(cached));
      } catch {
        // Rebuild stale or incomplete cached subtitles under the video lock.
      }
    }
    if (!force && body.cachedTranscript && body.cachedTranscript.videoId === videoId && body.cachedTranscript.transcriptVersion === TRANSCRIPT_VERSION) {
      const clientCues = Array.isArray(body.cachedTranscript.cues) ? body.cachedTranscript.cues : [];
      const duration = Number(body.cachedTranscript.duration || 0);
      validateCompleteGreekTranscript(clientCues, duration);
      lockToken = crypto.randomUUID();
      const acquired = await acquireProcessingLock(videoId, lockToken, true);
      if (acquired) {
        const now = new Date().toISOString();
        await completeTranscript({
          videoId,
          title: String(body.cachedTranscript.originalTitle || body.cachedTranscript.title || "YouTube video"),
          channel: String(body.cachedTranscript.channel || "YouTube"),
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: duration || clientCues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0),
          originalLanguage: "client_seed",
          englishTranscript: Array.isArray(body.cachedTranscript.englishCues) ? body.cachedTranscript.englishCues : [],
          greekTranscript: clientCues,
          timestamps: clientCues.map(cue => ({ start: cue.start, duration: cue.duration })),
          topics: Array.isArray(body.cachedTranscript.topics) ? body.cachedTranscript.topics : [],
          keyPoints: Array.isArray(body.cachedTranscript.keyPoints) ? body.cachedTranscript.keyPoints : keyPoints(clientCues),
          status: "ready",
          progress: 100,
          transcriptVersion: TRANSCRIPT_VERSION,
          createdAt: cached?.createdAt || now,
          updatedAt: now,
        }, lockToken);
        const seeded = await getTranscript(videoId);
        lockToken = null;
        return NextResponse.json(await cachedResponse(seeded));
      }
    }
    if (!force && cached?.status === "processing" && cached.transcriptVersion === TRANSCRIPT_VERSION && cached.lockExpiresAt && cached.lockExpiresAt > new Date().toISOString()) {
      return NextResponse.json(await cachedResponse(cached), { status: 202, headers: { "Retry-After": "1" } });
    }

    lockToken = crypto.randomUUID();
    const acquired = await acquireProcessingLock(videoId, lockToken, force);
    if (!acquired) {
      const active = await getTranscript(videoId);
      return NextResponse.json(await cachedResponse(active), { status: 202, headers: { "Retry-After": "1" } });
    }
    await updateProcessingProgress(videoId, lockToken, 12);

    // Prefer Supadata for native YouTube transcripts. Vercel-origin requests
    // to YouTube can be challenged with "Sign in to confirm you're not a bot".
    // Native mode keeps usage predictable: existing transcripts only.
    try {
      const supadata = await fetchSupadataTranscript(videoId);
      const sourceLanguage = supadata.lang.toLowerCase() || "unknown";
      if (!(sourceLanguage === "el" || sourceLanguage === "en" || sourceLanguage.startsWith("en-"))) {
        throw new Error(`Supadata returned unsupported source language: ${sourceLanguage}`);
      }

      await updateProcessingProgress(videoId, lockToken, 28);
      let cues: CaptionCue[] = [];
      let sourceCues: CaptionCue[] = [];
      let translationMethod = "supadata_native_original_greek";

      if (sourceLanguage === "el") {
        cues = supadata.cues;
      } else {
        sourceCues = createMeaningUnits(supadata.cues);
        if (!sourceCues.length) throw new Error("Supadata returned an empty English transcript");
        await updateProcessingProgress(videoId, lockToken, 48);
        cues = await translateCuesToGreek(sourceCues);
        translationMethod = "supadata_native_contextual_meaning_units_v3";
      }

      const duration = supadata.cues.reduce(
        (max, cue) => Math.max(max, cue.start + cue.duration),
        0,
      );
      validateCompleteGreekTranscript(cues, duration);
      await updateProcessingProgress(videoId, lockToken, 88);

      const metadata = await fetchYouTubeOEmbed(videoId);
      const originalTitle = metadata.title || cached?.title || "YouTube video";
      const channel = metadata.authorName || cached?.channel || "YouTube";
      const translatedTitle = await translateTitleToGreek(originalTitle);
      const speaker = speakerProfile(videoId, "", channel);
      const points = keyPoints(cues);
      const topics = [...new Set(points.flatMap(point => point.toLowerCase().match(/[\p{L}]{6,}/gu) || []))].slice(0, 6);
      const now = new Date().toISOString();

      await completeTranscript({
        videoId,
        title: originalTitle,
        channel,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration,
        originalLanguage: sourceLanguage,
        englishTranscript: sourceCues,
        greekTranscript: cues,
        timestamps: cues.map(cue => ({ start: cue.start, duration: cue.duration })),
        topics,
        keyPoints: points,
        status: "ready",
        progress: 100,
        transcriptVersion: TRANSCRIPT_VERSION,
        createdAt: cached?.createdAt || now,
        updatedAt: now,
      }, lockToken);

      lockToken = null;
      return NextResponse.json({
        status: "ready",
        videoId,
        title: translatedTitle,
        originalTitle,
        channel,
        duration,
        sourceLanguage,
        sourceType: "supadata_native",
        translationMethod,
        cues,
        englishCues: sourceCues,
        topics,
        keyPoints: points,
        speaker,
        transcriptVersion: TRANSCRIPT_VERSION,
        cached: false,
      });
    } catch (error) {
      console.warn(
        `[captions:${videoId}] Supadata native transcript failed; trying direct YouTube fallback: ${error instanceof Error ? error.message : "failed"}`,
      );
    }

    if (!lockToken) throw new Error("Transcript processing lock was lost");
    const players = await fetchPlayers(videoId);
    let player: PlayerResponse | null = null;
    let track: CaptionTrack | null = null;
    let rawSourceCues: CaptionCue[] = [];
    let selectedUserAgent = "";
    const captionErrors: string[] = [];

    for (const candidate of players) {
      const tracks = orderedTracks(
        candidate.player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
      );
      for (const candidateTrack of tracks) {
        if (!candidateTrack.baseUrl) continue;
        try {
          const candidateCues = await fetchCaptionCues(candidateTrack, candidate.userAgent);
          if (!candidateCues.length) continue;
          player = candidate.player;
          track = candidateTrack;
          rawSourceCues = candidateCues;
          selectedUserAgent = candidate.userAgent;
          break;
        } catch (error) {
          captionErrors.push(
            `${candidate.clientName}/${candidateTrack.languageCode || "unknown"}: ${error instanceof Error ? error.message : "failed"}`,
          );
        }
      }
      if (player && track) break;
    }

    if (!player || !track) {
      const detail = captionErrors.length ? captionErrors.join(" · ") : "Δεν βρέθηκε έγκυρο caption track";
      console.error(`[captions:${videoId}] ${detail}`);
      await failTranscript(videoId, lockToken, detail);
      lockToken = null;
      return NextResponse.json(
        { error: "Οι υπότιτλοι δεν ήταν προσωρινά διαθέσιμοι. Δοκίμασε ξανά σε λίγο." },
        { status: 502 },
      );
    }

    await updateProcessingProgress(videoId, lockToken, 28);
    let cues: CaptionCue[] = [];
    let sourceCues: CaptionCue[] = [];
    let translationMethod = "original_greek";

    const sourceLanguage = track.languageCode?.toLowerCase() || "unknown";
    if (sourceLanguage === "el") {
      cues = rawSourceCues;
    } else {
      if (!rawSourceCues.length) throw new Error("Το αγγλικό caption track είναι κενό");
      sourceCues = createMeaningUnits(rawSourceCues);
      await updateProcessingProgress(videoId, lockToken, 48);
      try {
        const youtubeGreekCues = await fetchCaptionCues(track, selectedUserAgent, "el");
        if (youtubeGreekCues.length && hasGreekText(youtubeGreekCues)) {
          cues = youtubeGreekCues;
          translationMethod = "youtube_timedtext_tlang_el";
        }
      } catch (error) {
        captionErrors.push(
          `YouTube el/${sourceLanguage}: ${error instanceof Error ? error.message : "failed"}`,
        );
      }
      if (!cues.length) {
        cues = await translateCuesToGreek(sourceCues);
        translationMethod = "contextual_meaning_units_v3";
      }
    }

    const videoDuration = Number(player.videoDetails?.lengthSeconds || 0);
    validateCompleteGreekTranscript(cues, videoDuration);
    await updateProcessingProgress(videoId, lockToken, 88);

    const now = new Date().toISOString();
    const originalTitle = player.videoDetails?.title || "YouTube video";
    const translatedTitle = await translateTitleToGreek(originalTitle);
    const speaker = speakerProfile(videoId, player.videoDetails?.shortDescription, player.videoDetails?.author);
    const points = keyPoints(cues);
    const topics = [...new Set(points.flatMap(point => point.toLowerCase().match(/[\p{L}]{6,}/gu) || []))].slice(0, 6);
    const duration = videoDuration || cues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
    await completeTranscript({
      videoId,
      title: originalTitle,
      channel: player.videoDetails?.author || "YouTube",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration,
      originalLanguage: sourceLanguage,
      englishTranscript: sourceCues,
      greekTranscript: cues,
      timestamps: cues.map(cue => ({ start: cue.start, duration: cue.duration })),
      topics,
      keyPoints: points,
      status: "ready",
      progress: 100,
      transcriptVersion: TRANSCRIPT_VERSION,
      createdAt: cached?.createdAt || now,
      updatedAt: now,
    }, lockToken);

    return NextResponse.json({
      status: "ready",
      videoId,
      title: translatedTitle,
      originalTitle,
      channel: player.videoDetails?.author || "YouTube",
      duration,
      sourceLanguage,
      sourceType: track.kind === "asr" ? "automatic" : "manual",
      translationMethod,
      cues,
      englishCues: sourceCues,
      topics,
      keyPoints: points,
      speaker,
      transcriptVersion: TRANSCRIPT_VERSION,
      cached: false,
    });
  } catch (error) {
    if (lockedVideoId && lockToken) {
      await failTranscript(lockedVideoId, lockToken, error instanceof Error ? error.message : "failed").catch(() => undefined);
    }
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

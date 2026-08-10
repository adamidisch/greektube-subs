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


async function fetchDirectNativeEnglish(videoId: string) {
  const players = await fetchPlayers(videoId);
  const failures: string[] = [];
  for (const candidate of players) {
    const tracks = orderedTracks(
      candidate.player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
    ).filter(track => {
      const language = track.languageCode?.toLowerCase() || "";
      return language === "en" || language.startsWith("en-");
    });
    for (const track of tracks) {
      if (!track.baseUrl) continue;
      try {
        const cues = await fetchCaptionCues(track, candidate.userAgent);
        if (!cues.length) continue;
        return {
          cues,
          player: candidate.player,
          track,
          userAgent: candidate.userAgent,
        };
      } catch (error) {
        failures.push(`${candidate.clientName}/${track.languageCode || "en"}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  }
  throw new Error(failures.join(" · ") || "Direct YouTube English captions unavailable");
}

function englishWordTokens(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
}

function canonicalNumberTokens(text: string) {
  const matches = text.match(/\b\d+(?:[.,]\d+)*\b/g) || [];
  return matches.map(token => {
    const compactThousands = token.replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "");
    return compactThousands.replace(",", ".");
  });
}

function protectedSourceTokens(text: string) {
  const matches = text.match(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%)?)\b/g) || [];
  return [...new Set(matches.map(token => token.replace(/\s+/g, "").toLowerCase()))];
}

function sameStringMultiset(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function repairCandidateIsSafe(source: string, candidate: string) {
  if (!candidate.trim() || /\[\[\s*\d+\s*\]\]/.test(candidate)) return false;
  const sourceWords = englishWordTokens(source);
  const candidateWords = englishWordTokens(candidate);
  // ASR repair may replace a misheard word, but it may not insert/delete/move
  // transcript material. Punctuation/casing changes do not affect token count.
  if (sourceWords.length !== candidateWords.length) return false;
  if (!sameStringMultiset(canonicalNumberTokens(source), canonicalNumberTokens(candidate))) return false;
  const candidateLower = candidate.toLowerCase().replace(/\s+/g, "");
  for (const token of protectedSourceTokens(source)) {
    if (!candidateLower.includes(token)) return false;
  }
  return true;
}

const ENGLISH_REPAIR_SYSTEM_PROMPT =
  "You repair automatically generated English captions before translation. " +
  "Each [[N]] is one immutable timed cue. Return exactly one [[N]] for every input cue in the same order. " +
  "NEVER move words from one cue to another. NEVER merge cues. NEVER add or delete meaning. " +
  "You may add punctuation and capitalization. You may replace a word only when it is a highly certain speech-recognition error strongly supported by grammar, nearby context and domain terminology. " +
  "Examples of allowed repair: an obvious medical ASR corruption such as collalation -> chelation when the context clearly refers to metal chelation. " +
  "Preserve all numbers, doses, acronyms, names and technical tokens such as MSM, B3 and IU exactly unless a non-protected ordinary word is clearly misrecognized. " +
  "If uncertain, keep the original wording unchanged. Do not paraphrase, summarize, simplify or translate. " +
  "Your job is only English transcript repair and sentence punctuation. Answer only with [[N]] lines.";

async function repairEnglishBatchWithGroq(batch: { index: number; text: string }[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !batch.length) return null;
  const expectedIds = new Set(batch.map(item => item.index));
  const numbered = batch.map(item => `[[${item.index}]] ${item.text}`).join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 3600,
        messages: [
          { role: "system", content: ENGLISH_REPAIR_SYSTEM_PROMPT },
          { role: "user", content: numbered },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content || "";
    const results = new Map<number, string>();
    const marker = /\[\[\s*(\d+)\s*\]\]\s*([\s\S]*?)(?=\n?\[\[\s*\d+\s*\]\]|$)/g;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(content))) {
      const index = Number(match[1]);
      if (!expectedIds.has(index) || results.has(index)) return null;
      const source = batch.find(item => item.index === index)?.text || "";
      const candidate = match[2].replace(/\s+/g, " ").trim();
      if (!repairCandidateIsSafe(source, candidate)) return null;
      results.set(index, candidate);
    }
    if (results.size !== batch.length || batch.some(item => !results.has(item.index))) return null;
    return results;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function splitEnglishCueAtSentenceBoundaries(cue: CaptionCue) {
  const text = cue.text.replace(/\s+/g, " ").trim();
  if (!text) return [] as CaptionCue[];
  const matches = text.match(/[^.!?…]+[.!?…]+[\"')\]]*|[^.!?…]+$/g)?.map(part => part.trim()).filter(Boolean) || [text];
  if (matches.length <= 1) return [{ ...cue, text }];

  // Avoid treating common abbreviations as sentence endings.
  const parts: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    let part = matches[index];
    while (/\b(?:Dr|Mr|Mrs|Ms|Prof|St|vs|e\.g|i\.e)\.$/i.test(part) && index + 1 < matches.length) {
      part = `${part} ${matches[index + 1]}`.replace(/\s+/g, " ").trim();
      index += 1;
    }
    parts.push(part);
  }
  if (parts.length <= 1) return [{ ...cue, text: parts[0] || text }];

  const weights = parts.map(part => Math.max(1, englishWordTokens(part).length));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let consumed = 0;
  return parts.map((part, index) => {
    const startRatio = consumed / total;
    consumed += weights[index];
    const endRatio = consumed / total;
    const start = cue.start + cue.duration * startRatio;
    const end = cue.start + cue.duration * endRatio;
    return { start, duration: Math.max(0.001, end - start), text: part };
  });
}

function clampTimedCueWindows(cues: CaptionCue[]) {
  return cues.map((cue, index) => {
    const next = cues[index + 1];
    if (!next || next.start <= cue.start) return cue;
    return { ...cue, duration: Math.max(0.001, Math.min(cue.duration, next.start - cue.start)) };
  });
}

async function prepareEnglishTimedCues(
  cues: CaptionCue[],
  onProgress?: (progress: number) => Promise<void>,
) {
  const raw = cues
    .map(cue => ({ ...cue, text: cue.text.replace(/\s+/g, " ").trim() }))
    .filter(cue => cue.text.length > 0)
    .sort((a, b) => a.start - b.start);
  if (!raw.length) return [] as CaptionCue[];

  const repaired = new Map<number, string>();
  const batchSize = 24;
  for (let start = 0; start < raw.length; start += batchSize) {
    const batch = raw.slice(start, start + batchSize).map((cue, offset) => ({ index: start + offset, text: cue.text }));
    const result = await repairEnglishBatchWithGroq(batch);
    if (result) result.forEach((text, index) => repaired.set(index, text));
    if (onProgress) {
      const completed = Math.min(raw.length, start + batch.length);
      await onProgress(Math.round(28 + 16 * (completed / raw.length)));
    }
  }

  const normalized = raw.flatMap((cue, index) =>
    splitEnglishCueAtSentenceBoundaries({ ...cue, text: repaired.get(index) || cue.text }),
  );
  return clampTimedCueWindows(normalized);
}

function cleanSubtitleText(text: string) {
  return text
    // JavaScript \b is ASCII-centric and was missing Greek filler tokens.
    // Use Unicode letter/number boundaries instead and remove only clear
    // hesitation noises, leaving meaningful words/interjections untouched.
    .replace(/(^|[^\p{L}\p{N}])(?:u+m+|u+h+|e+r+m+|h+m{2,}|m{3,}|χ+μ{2,}|μ{3,}|ε{2,}|α+χ+)(?=$|[^\p{L}\p{N}])/giu, "$1")
    // Collapse obvious ASR stutters only when the same 2+ letter word is
    // repeated three or more times in a row.
    .replace(/(^|[^\p{L}\p{N}])(\p{L}{2,})(?:\s+\2){2,}(?=$|[^\p{L}\p{N}])/giu, "$1$2")
    // Clean up doubled/orphaned punctuation left behind after filler removal
    // (e.g. "Είναι,, δύσκολο" -> "Είναι, δύσκολο", or a leading stray comma).
    .replace(/^[,;:]+\s*/, "")
    .replace(/([,;:])\s*\1+/g, "$1")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([!?.,…])\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_SYSTEM_PROMPT =
  "Μετέφρασε φυσικά και πιστά στα ελληνικά για υπότιτλους. " +
  "Το αγγλικό κείμενο έχει ήδη διορθωθεί και χρονιστεί. ΜΗΝ διορθώνεις, συμπληρώνεις ή ερμηνεύεις το source. " +
  "Κάθε [[N]] είναι ανεξάρτητο timed cue. Μετέφρασε μόνο τις λέξεις του συγκεκριμένου [[N]] και μην μεταφέρεις λέξεις ή νόημα από γειτονικό cue. " +
  "Διατήρησε ακριβώς αριθμούς, δόσεις, ακρωνύμια και τεχνικά tokens όπως MSM, B3 και IU. " +
  "Μην προσθέτεις πληροφορίες, αριθμούς, αιτίες, αρνήσεις, πρόσωπα ή τεχνικούς όρους που δεν υπάρχουν στο συγκεκριμένο αγγλικό cue. " +
  "Η ιατρική και επιστημονική ορολογία πρέπει να αποδίδεται σωστά στα ελληνικά, αλλά η πιστότητα στο source έχει προτεραιότητα. " +
  "Επέστρεψε ακριβώς έναν δείκτη [[N]] για κάθε input cue, στην ίδια σειρά, χωρίς παραλείψεις, διπλασιασμούς ή νέους δείκτες. " +
  "Απάντησε μόνο με τις μεταφρασμένες γραμμές και τους δείκτες.";

async function translateBatchWithGroq(batch: { index: number; text: string }[], precedingContext?: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const expectedIds = new Set(batch.map(item => item.index));
  const numbered = batch.map(item => `[[${item.index}]] ${item.text}`).join("\n");
  const userContent = precedingContext
    ? `Προηγούμενες μεταφρασμένες γραμμές μόνο για ορολογία και ύφος. ΜΗΝ τις μεταφράσεις ξανά και ΜΗΝ μεταφέρεις λέξεις από αυτές στα νέα cues:\n${precedingContext}\n\nΝέα timed cues προς μετάφραση. Κάθε cue μένει αυστηρά στο δικό του [[N]]:\n${numbered}`
    : `Timed cues προς μετάφραση. Κάθε cue μένει αυστηρά στο δικό του [[N]]:\n${numbered}`;
  const removeMarkerArtifacts = (value: string) => value.replace(/\[{1,2}\s*(\d+)\s*\]{1,2}/g, (full, rawId) =>
    expectedIds.has(Number(rawId)) ? "" : full,
  );

  for (let attempt = 0; attempt < 1; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.1,
          max_tokens: 4000,
          messages: [
            { role: "system", content: GROQ_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });
    } catch (error) {
      if (attempt < 1) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      throw error;
    }

    if (response.status === 429) {
      if (attempt < 1) {
        const retryAfterSeconds = Number(response.headers.get("retry-after")) || 5;
        const waitMs = Math.min(retryAfterSeconds, 8) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw new Error("Groq 429 after retries");
    }
    if (!response.ok) {
      if (response.status >= 500 && attempt < 1) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      throw new Error(`Groq ${response.status}`);
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      if (attempt < 1) continue;
      throw new Error("Groq response empty");
    }

    const results = new Map<number, string>();
    const marker = /\[\[\s*(\d+)\s*\]\]\s*([\s\S]*?)(?=\n?\[\[\s*\d+\s*\]\]|$)/g;
    let match: RegExpExecArray | null;
    let invalidMapping = false;
    while ((match = marker.exec(content))) {
      const index = Number(match[1]);
      if (!expectedIds.has(index) || results.has(index)) {
        invalidMapping = true;
        break;
      }
      const text = cleanSubtitleText(removeMarkerArtifacts(match[2]));
      if (!text) {
        invalidMapping = true;
        break;
      }
      results.set(index, text);
    }

    const completeMapping = !invalidMapping &&
      results.size === batch.length &&
      batch.every(item => results.has(item.index));
    if (completeMapping) return results;

    if (attempt < 1) {
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    throw new Error("Groq cue mapping invalid");
  }
  return null;
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

function translationProtectedTokens(text: string) {
  return protectedSourceTokens(text);
}

function translationIntegrityOK(source: string, target: string) {
  if (!target.trim()) return false;
  // Marker artefacts such as the stray [15] observed in v7.1.x are forbidden.
  if (/\[\s*\d+\s*\]/.test(target)) return false;
  if (!sameStringMultiset(canonicalNumberTokens(source), canonicalNumberTokens(target))) return false;
  const compactTarget = target.toLowerCase().replace(/\s+/g, "");
  for (const token of translationProtectedTokens(source)) {
    if (!compactTarget.includes(token)) return false;
  }
  const ordinaryEnglish = englishWordTokens(source).filter(token => !translationProtectedTokens(source).includes(token.toLowerCase()));
  if (ordinaryEnglish.length > 0 && !hasGreekText([{ start: 0, duration: 1, text: target }])) return false;
  return true;
}

function validateAlignedTranscript(english: CaptionCue[], greek: CaptionCue[]) {
  if (english.length !== greek.length) throw new Error("Ο συγχρονισμός αγγλικών και ελληνικών υποτίτλων δεν ολοκληρώθηκε");
  for (let index = 0; index < english.length; index += 1) {
    const source = english[index];
    const target = greek[index];
    if (Math.abs(source.start - target.start) > 0.002 || Math.abs(source.duration - target.duration) > 0.002) {
      throw new Error("Οι ελληνικοί υπότιτλοι μετακινήθηκαν από τα αρχικά timestamps");
    }
    if (!translationIntegrityOK(source.text, target.text)) {
      throw new Error(`Αποτυχία ελέγχου πιστότητας στο cue ${index + 1}`);
    }
    if (index > 0 && target.start < greek[index - 1].start) {
      throw new Error("Οι χρονισμοί των ελληνικών υποτίτλων δεν είναι ταξινομημένοι");
    }
  }
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

async function translateCuesToGreek(cues: CaptionCue[], onProgress?: (progress: number) => Promise<void>) {
  const translated = new Map<number, string>();
  const useGroq = Boolean(process.env.GROQ_API_KEY);
  const batchSize = useGroq ? 12 : 18;
  const batches: { index: number; text: string }[][] = [];
  for (let start = 0; start < cues.length; start += batchSize) {
    batches.push(cues.slice(start, start + batchSize).map((cue, offset) => ({ index: start + offset, text: cue.text })));
  }

  const reportProgress = async (completed: number, total: number, start: number, end: number) => {
    if (!onProgress || total <= 0) return;
    await onProgress(Math.round(start + (end - start) * Math.max(0, Math.min(1, completed / total))));
  };

  let completedPrimary = 0;
  if (useGroq) {
    for (const batch of batches) {
      try {
        const results = await translateBatchWithGroq(batch);
        if (results) {
          for (const item of batch) {
            const text = results.get(item.index);
            if (text && translationIntegrityOK(item.text, text)) translated.set(item.index, text);
          }
        }
      } catch {}
      completedPrimary += batch.length;
      await reportProgress(completedPrimary, cues.length, 48, 80);
    }

    // Bounded strict retry only for objectively invalid/missing cues.
    const strict = cues.map((cue, index) => ({ cue, index })).filter(({ index }) => !translated.has(index)).slice(0, 8);
    for (let position = 0; position < strict.length; position += 1) {
      const { cue, index } = strict[position];
      try {
        const result = await translateBatchWithGroq([{ index, text: cue.text }]);
        const text = result?.get(index);
        if (text && translationIntegrityOK(cue.text, text)) translated.set(index, text);
      } catch {}
      if (onProgress) await onProgress(Math.round(80 + 4 * ((position + 1) / Math.max(1, strict.length))));
    }
  }

  const remaining = cues.map((cue, index) => ({ cue, index })).filter(({ index }) => !translated.has(index));
  for (let start = 0; start < remaining.length; start += 6) {
    const group = remaining.slice(start, start + 6);
    const results = await Promise.all(group.map(({ cue, index }) => translateSingleCue(index, cue.text)));
    results.forEach(result => {
      if (!result) return;
      const source = cues[result.index]?.text || "";
      if (translationIntegrityOK(source, result.text)) translated.set(result.index, result.text);
    });
    await reportProgress(Math.min(remaining.length, start + group.length), remaining.length, useGroq ? 84 : 48, 88);
  }

  const missing = cues.map((_, index) => index).filter(index => !translated.has(index));
  if (missing.length) throw new Error(`Η ελληνική μετάφραση απέτυχε σε ${missing.length} cues`);

  return cues.map((cue, index) => ({ ...cue, text: translated.get(index) as string }));
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

  // Also clean already-cached transcripts so the improvement is visible
  // immediately without forcing every existing video through re-translation.
  // Keep Greek/English cue indexes paired when filler-only cues are removed.
  const cleanedPairs = record.greekTranscript
    .map((cue: CaptionCue, index: number) => ({ index, cue: { ...cue, text: cleanSubtitleText(cue.text) } }))
    .filter((item: { index: number; cue: CaptionCue }) => item.cue.text.length > 0);
  const greekTranscript = cleanedPairs.map((item: { index: number; cue: CaptionCue }) => item.cue);
  const englishTranscript: CaptionCue[] = [];
  for (const { index } of cleanedPairs) {
    const cue = record.englishTranscript[index] as CaptionCue | undefined;
    if (!cue) continue;
    const cleaned = cleanSubtitleText(cue.text);
    if (cleaned) englishTranscript.push({ ...cue, text: cleaned });
  }

  return {
    status: record.status,
    progress: record.progress,
    videoId: record.videoId,
    title,
    originalTitle,
    channel: record.channel,
    duration: record.duration,
    sourceLanguage: record.originalLanguage,
    cues: greekTranscript,
    englishCues: englishTranscript,
    topics: record.topics,
    keyPoints: keyPoints(greekTranscript),
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
    if (!cached || cached.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (cached.status === "processing") {
      return NextResponse.json(await cachedResponse(cached), {
        status: 202,
        headers: { "Cache-Control": "no-store", "Retry-After": "1" },
      });
    }
    if (cached.status !== "ready") {
      return NextResponse.json({ ready: false, status: cached.status }, { status: 409, headers: { "Cache-Control": "no-store" } });
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
          rawEnglishTranscript: Array.isArray(body.cachedTranscript.englishCues) ? body.cachedTranscript.englishCues : [],
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
        }, lockToken as string);
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
    await updateProcessingProgress(videoId, lockToken as string, 12);

    // First choice: the actual native English timed-text track from YouTube.
    // This is the closest source to what the viewer sees in YouTube's own
    // transcript UI, including punctuation and sentence boundaries. Supadata is
    // retained as a resilience fallback for Vercel environments where YouTube
    // challenges the request.
    try {
      const direct = await fetchDirectNativeEnglish(videoId);
      await updateProcessingProgress(videoId, lockToken as string, 28);
      const sourceCues = await prepareEnglishTimedCues(direct.cues, progress => updateProcessingProgress(videoId, lockToken as string, progress));
      if (!sourceCues.length) throw new Error("Direct YouTube English transcript was empty");

      await updateProcessingProgress(videoId, lockToken as string, 48);
      const cues = await translateCuesToGreek(
        sourceCues,
        progress => updateProcessingProgress(videoId, lockToken as string, progress),
      );
      const duration = direct.cues.reduce(
        (max, cue) => Math.max(max, cue.start + cue.duration),
        0,
      );
      validateAlignedTranscript(sourceCues, cues);
      validateCompleteGreekTranscript(cues, duration);
      await updateProcessingProgress(videoId, lockToken as string, 92);

      const metadata = await fetchYouTubeOEmbed(videoId);
      const originalTitle = metadata.title || direct.player.videoDetails?.title || cached?.title || "YouTube video";
      const channel = metadata.authorName || direct.player.videoDetails?.author || cached?.channel || "YouTube";
      const translatedTitle = await translateTitleToGreek(originalTitle);
      const speaker = speakerProfile(videoId, direct.player.videoDetails?.shortDescription || "", channel);
      const points = keyPoints(cues);
      const topics = [...new Set(points.flatMap(point => point.toLowerCase().match(/[\\p{L}]{6,}/gu) || []))].slice(0, 6);
      const now = new Date().toISOString();
      await updateProcessingProgress(videoId, lockToken as string, 96);

      await completeTranscript({
        videoId,
        title: originalTitle,
        channel,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration,
        originalLanguage: direct.track.languageCode?.toLowerCase() || "en",
        rawEnglishTranscript: direct.cues,
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
      }, lockToken as string);

      lockToken = null;
      return NextResponse.json({
        status: "ready",
        videoId,
        title: translatedTitle,
        originalTitle,
        channel,
        duration,
        sourceLanguage: direct.track.languageCode?.toLowerCase() || "en",
        sourceType: "youtube_native_direct",
        translationMethod: "youtube_native_repaired_timed_v7",
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
        `[captions:${videoId}] Direct YouTube native transcript unavailable; using Supadata fallback: ${error instanceof Error ? error.message : "failed"}`,
      );
    }

    // Prefer Supadata for native YouTube transcripts. Vercel-origin requests
    // to YouTube can be challenged with "Sign in to confirm you're not a bot".
    // Native mode keeps usage predictable: existing transcripts only.
    try {
      const supadata = await fetchSupadataTranscript(videoId);
      const sourceLanguage = supadata.lang.toLowerCase() || "unknown";
      if (!(sourceLanguage === "el" || sourceLanguage === "en" || sourceLanguage.startsWith("en-"))) {
        throw new Error(`Supadata returned unsupported source language: ${sourceLanguage}`);
      }

      await updateProcessingProgress(videoId, lockToken as string, 28);
      let cues: CaptionCue[] = [];
      let sourceCues: CaptionCue[] = [];
      let translationMethod = "supadata_native_original_greek";

      if (sourceLanguage === "el") {
        cues = supadata.cues;
      } else {
        sourceCues = await prepareEnglishTimedCues(supadata.cues, progress => updateProcessingProgress(videoId, lockToken as string, progress));
        if (!sourceCues.length) throw new Error("Supadata returned an empty English transcript");
        await updateProcessingProgress(videoId, lockToken as string, 48);
        cues = await translateCuesToGreek(sourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress));
        translationMethod = "supadata_repaired_timed_v7";
      }

      const duration = supadata.cues.reduce(
        (max, cue) => Math.max(max, cue.start + cue.duration),
        0,
      );
      validateAlignedTranscript(sourceCues, cues);
      validateCompleteGreekTranscript(cues, duration);
      await updateProcessingProgress(videoId, lockToken as string, 92);

      const metadata = await fetchYouTubeOEmbed(videoId);
      const originalTitle = metadata.title || cached?.title || "YouTube video";
      const channel = metadata.authorName || cached?.channel || "YouTube";
      const translatedTitle = await translateTitleToGreek(originalTitle);
      const speaker = speakerProfile(videoId, "", channel);
      const points = keyPoints(cues);
      const topics = [...new Set(points.flatMap(point => point.toLowerCase().match(/[\p{L}]{6,}/gu) || []))].slice(0, 6);
      const now = new Date().toISOString();
      await updateProcessingProgress(videoId, lockToken as string, 96);

      await completeTranscript({
        videoId,
        title: originalTitle,
        channel,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration,
        originalLanguage: sourceLanguage,
        rawEnglishTranscript: supadata.cues,
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
      }, lockToken as string);

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

    await updateProcessingProgress(videoId, lockToken as string, 28);
    let cues: CaptionCue[] = [];
    let sourceCues: CaptionCue[] = [];
    let translationMethod = "original_greek";

    const sourceLanguage = track.languageCode?.toLowerCase() || "unknown";
    if (sourceLanguage === "el") {
      cues = rawSourceCues;
    } else {
      if (!rawSourceCues.length) throw new Error("Το αγγλικό caption track είναι κενό");
      sourceCues = await prepareEnglishTimedCues(rawSourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress));
      await updateProcessingProgress(videoId, lockToken as string, 48);
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
        cues = await translateCuesToGreek(sourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress));
        translationMethod = "repaired_timed_v7";
      }
    }

    const videoDuration = Number(player.videoDetails?.lengthSeconds || 0);
    if (sourceCues.length) validateAlignedTranscript(sourceCues, cues);
    validateCompleteGreekTranscript(cues, videoDuration);
    await updateProcessingProgress(videoId, lockToken as string, 92);

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
      rawEnglishTranscript: rawSourceCues,
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
    }, lockToken as string);

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

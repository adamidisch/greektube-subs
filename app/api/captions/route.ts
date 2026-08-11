import { NextResponse } from "next/server";
import { canonicalNumberTokens, numberTokensMatch } from "@/app/api/captions/numeric-integrity";
import { splitSubtitleSentences } from "./sentence-split";
import { hasTranslatableWordTokens } from "./translation-text";
import {
  allocateSequentialCueWindows,
  effectiveSequentialRawWindows,
  recoverMalformedAlignedTimings,
  timingInversionCount,
} from "./timing";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  completeTranscript,
  failTranscript,
  getTranscript,
  MAX_TRANSIENT_RETRIES,
  recordGroqProviderSuccess,
  recordGroqRateLimit,
  recordTransientProcessingFailure,
  releaseProcessingLock,
  resetProcessingForTranslation,
  saveProcessingCheckpoint,
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

type TranslationMode = "legacy" | "google";

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

function protectedSourceTokens(text: string) {
  const matches = text.match(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%))\b/g) || [];
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
      // Keep each independently safe repair. If one cue is over-edited, only
      // that cue falls back to the untouched raw transcript instead of
      // discarding valid punctuation/ASR fixes for the whole batch.
      if (repairCandidateIsSafe(source, candidate)) results.set(index, candidate);
    }
    return results.size ? results : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function splitEnglishCueAtSentenceBoundaries(cue: CaptionCue) {
  const text = cue.text.replace(/\s+/g, " ").trim();
  if (!text) return [] as CaptionCue[];
  const parts = splitSubtitleSentences(text);
  if (parts.length <= 1) return [{ ...cue, text: parts[0] || text }];

  const timing = allocateSequentialCueWindows(cue, parts.map(part => Math.max(1, englishWordTokens(part).length)));
  return parts.map((part, index) => ({ ...cue, ...timing[index], text: part }));
}

async function prepareEnglishTimedCues(
  cues: CaptionCue[],
  onProgress?: (progress: number) => Promise<void>,
) {
  const raw = effectiveSequentialRawWindows(cues
    .map(cue => ({ ...cue, text: cue.text.replace(/\s+/g, " ").trim() }))
    .filter(cue => cue.text.length > 0));
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
  return normalized;
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

class GroqRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Groq 429 rate limited");
    this.name = "GroqRateLimitError";
  }
}

function groqRetryAfterSeconds(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? value : 30;
}

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

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16_000);
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
        signal: controller.signal,
      });
    } catch (error) {
      if (attempt < 1) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) throw new GroqRateLimitError(groqRetryAfterSeconds(response));
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const translated = await translateText(text);
      if (translated) return { index, text: translated };
    } catch {}
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return null;
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

function translationIntegrityFailure(source: string, target: string) {
  if (!target.trim()) return "empty-output";
  // Marker artefacts such as the stray [15] observed in v7.1.x are forbidden.
  if (/\[\s*\d+\s*\]/.test(target)) return "marker-artifact";
  const sourceNumbers = canonicalNumberTokens(source);
  const targetNumbers = canonicalNumberTokens(target);
  if (!numberTokensMatch(source, target)) {
    return `number-mismatch source=${JSON.stringify(sourceNumbers)} target=${JSON.stringify(targetNumbers)}`;
  }
  const compactTarget = target.toLowerCase().replace(/\s+/g, "");
  for (const token of translationProtectedTokens(source)) {
    if (!compactTarget.includes(token)) return `missing-protected-token:${token}`;
  }
  const sourceWordTokens = englishWordTokens(source);
  if (hasTranslatableWordTokens(sourceWordTokens, translationProtectedTokens(source)) &&
      !hasGreekText([{ start: 0, duration: 1, text: target }])) return "non-greek-output";
  return null;
}

function translationIntegrityOK(source: string, target: string) {
  return translationIntegrityFailure(source, target) === null;
}

type ProtectedPlaceholder = { placeholder: string; token: string };

function placeholderSuffix(index: number) {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return suffix;
}

function protectTranslationTokens(source: string) {
  // Protect every value that the integrity guard requires verbatim. The
  // deliberately non-numeric placeholders also cannot become subtitle marker
  // artefacts while Google translates the surrounding natural language.
  const protectedValue = /\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%)|\d+(?:[.,]\d+)*)\b/g;
  const values: ProtectedPlaceholder[] = [];
  const text = source.replace(protectedValue, (token) => {
    const placeholder = `ZXQPROTECT${placeholderSuffix(values.length)}`;
    values.push({ placeholder, token });
    return placeholder;
  });
  return { text, values };
}

function restoreTranslationTokens(candidate: string, values: ProtectedPlaceholder[]) {
  let restored = candidate;
  for (const { placeholder, token } of values) {
    const pattern = new RegExp(`\\b${placeholder}\\b`, "gi");
    const matches = restored.match(pattern) || [];
    if (matches.length !== 1) {
      return { text: null, reason: `placeholder-restoration-failed:${placeholder}:count=${matches.length}` };
    }
    restored = restored.replace(pattern, token);
  }
  return { text: restored, reason: null };
}

function logRejectedTranslationCue(
  videoId: string,
  index: number,
  source: string,
  provider: string,
  candidate: string | null,
  reason: string,
  restoredCandidate?: string | null,
) {
  console.warn("[captions:translation-rejected]", JSON.stringify({
    videoId, cueIndex: index, source, provider, candidate, restoredCandidate: restoredCandidate ?? null, integrityFailure: reason,
  }));
}

async function translateStrictSingleCueWithGroq(index: number, text: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const protectedTokens = [...new Set(protectTranslationTokens(text).values.map(({ token }) => token))];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 600,
        messages: [
          { role: "system", content: `${GROQ_SYSTEM_PROMPT} This is one final strict retry for a single cue. These source tokens are immutable and must appear byte-for-byte in the answer: ${protectedTokens.join(", ") || "(none)"}.` },
          { role: "user", content: `Return exactly [[${index}]] followed by the Greek translation of this one cue:\n[[${index}]] ${text}` },
        ],
      }),
    });
    if (response.status === 429) throw new GroqRateLimitError(groqRetryAfterSeconds(response));
    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content || "";
    const marker = new RegExp(`\\[\\[\\s*${index}\\s*\\]\\]\\s*([\\s\\S]*?)\\s*$`);
    const match = content.match(marker);
    if (!match) throw new Error("Groq strict cue mapping invalid");
    return cleanSubtitleText(match[1]);
  } finally {
    clearTimeout(timeout);
  }
}

async function translateSingleCueWithProtectedGoogleFallback(text: string) {
  const protectedText = protectTranslationTokens(text);
  const candidate = await translateText(protectedText.text);
  const restored = restoreTranslationTokens(candidate, protectedText.values);
  return { candidate, restoredCandidate: restored.text, restorationFailure: restored.reason };
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

async function prepareEnglishTimedChunk(raw: CaptionCue[], start: number, count: number, useGroqRepair = true) {
  // Supadata display windows overlap by design. Normalize each source window
  // before splitting so a terminal fragment never spills into the next onset.
  const slice = effectiveSequentialRawWindows(raw).slice(start, start + count);
  if (!slice.length) return [] as CaptionCue[];
  const batch = slice.map((cue, offset) => ({ index: start + offset, text: cue.text.replace(/\s+/g, " ").trim() }));
  const repaired = useGroqRepair ? await repairEnglishBatchWithGroq(batch) : null;
  const normalized = slice.flatMap((cue, offset) => {
    const absolute = start + offset;
    return splitEnglishCueAtSentenceBoundaries({
      ...cue,
      text: repaired?.get(absolute) || cue.text.replace(/\s+/g, " ").trim(),
    });
  });
  return normalized;
}

type TranslationSliceTelemetry = {
  groqMs: number;
  strictGroqMs: number;
  googleMs: number;
  checkpointMs: number;
  committedCues: number;
  groqCues: number;
  groqStrictCues: number;
  googleFallbackCues: number;
  providerPaths: { cueIndex: number; path: string }[];
};

type CommitTranslatedCue = (cue: CaptionCue, cueIndex: number, path: string) => Promise<void>;

async function translateCheckpointBatch(
  videoId: string,
  lockToken: string,
  groqCooldownUntil: string | null | undefined,
  translationMode: TranslationMode,
  cues: CaptionCue[],
  start: number,
  count: number,
  commitTranslatedCue: CommitTranslatedCue,
) {
  const slice = cues.slice(start, start + count);
  const numbered = slice.map((cue, offset) => ({ index: start + offset, text: cue.text }));
  const telemetry: TranslationSliceTelemetry = {
    groqMs: 0, strictGroqMs: 0, googleMs: 0, checkpointMs: 0,
    committedCues: 0, groqCues: 0, groqStrictCues: 0, googleFallbackCues: 0,
    providerPaths: [],
  };
  const sliceStartedAt = Date.now();
  let failure: string | null = null;
  const commitAcceptedCue = async (cue: CaptionCue, cueIndex: number, path: string) => {
    const checkpointStartedAt = Date.now();
    await commitTranslatedCue(cue, cueIndex, path);
    telemetry.checkpointMs += Date.now() - checkpointStartedAt;
    telemetry.committedCues += 1;
    telemetry.providerPaths.push({ cueIndex, path });
    if (path === "groq" || path === "groq-strict") telemetry.groqCues += 1;
    if (path === "groq-strict") telemetry.groqStrictCues += 1;
    if (path.startsWith("google")) telemetry.googleFallbackCues += 1;
  };
  try {
  if (!slice.length) return telemetry;
  const output = new Map<number, string>();

  // v7.4.0 Fast mode: one Google request sees a short window of neighbouring
  // cues for context. Every cue is still validated and durably committed in
  // order. Any cue rejected by the batch falls back to the protected-token
  // Google path before the checkpoint may advance.
  if (translationMode === "google") {
    let batchResults: Map<number, string> | null = null;
    const googleBatchStartedAt = Date.now();
    try {
      batchResults = await translateMeaningBatch(numbered);
    } catch (error) {
      console.warn("[captions:google-batch-failed]", JSON.stringify({
        videoId, start, cues: numbered.length, error: error instanceof Error ? error.message : "Google batch failed",
      }));
    } finally {
      telemetry.googleMs += Date.now() - googleBatchStartedAt;
    }

    for (const [offset, item] of numbered.entries()) {
      const sourceWordTokens = englishWordTokens(item.text);
      if (!hasTranslatableWordTokens(sourceWordTokens, translationProtectedTokens(item.text))) {
        const passthrough = item.text.trim();
        const passthroughReason = translationIntegrityFailure(item.text, passthrough);
        if (passthroughReason) throw new Error(`Translation passthrough integrity failed for cue: ${item.index}`);
        output.set(item.index, passthrough);
        await commitAcceptedCue({ ...slice[offset], text: passthrough }, item.index, "passthrough");
        continue;
      }

      const batchCandidate = batchResults?.get(item.index) || null;
      const batchReason = batchCandidate ? translationIntegrityFailure(item.text, batchCandidate) : "google-batch-missing-cue";
      if (!batchReason && batchCandidate) {
        output.set(item.index, batchCandidate);
        await commitAcceptedCue({ ...slice[offset], text: batchCandidate }, item.index, "google-batch");
        continue;
      }
      if (batchCandidate) logRejectedTranslationCue(videoId, item.index, item.text, "google-batch", batchCandidate, batchReason || "google-batch-invalid");

      const googleStartedAt = Date.now();
      try {
        const google = await translateSingleCueWithProtectedGoogleFallback(item.text);
        if (google.restorationFailure || !google.restoredCandidate) {
          throw new Error(google.restorationFailure || "placeholder-restoration-failed");
        }
        const googleReason = translationIntegrityFailure(item.text, google.restoredCandidate);
        if (googleReason) {
          logRejectedTranslationCue(videoId, item.index, item.text, "google-protected", google.candidate, googleReason, google.restoredCandidate);
          throw new Error(googleReason);
        }
        output.set(item.index, google.restoredCandidate);
        await commitAcceptedCue({ ...slice[offset], text: google.restoredCandidate }, item.index, "google-protected");
      } finally {
        telemetry.googleMs += Date.now() - googleStartedAt;
      }
    }
    return telemetry;
  }

  let groqFailure: string | null = null;
  let groqResults: Map<number, string> | null = null;
  let groqRateLimited = false;
  const groqCooling = Boolean(groqCooldownUntil && groqCooldownUntil > new Date().toISOString());
  if (process.env.GROQ_API_KEY && !groqCooling) {
    try {
      const groqStartedAt = Date.now();
      try {
        groqResults = await translateBatchWithGroq(numbered);
      } finally {
        telemetry.groqMs += Date.now() - groqStartedAt;
      }
      if (!await recordGroqProviderSuccess(videoId, lockToken)) {
        throw new Error("Processing lock was lost while recording Groq success");
      }
    } catch (error) {
      if (error instanceof GroqRateLimitError) {
        const state = await recordGroqRateLimit(videoId, lockToken, error.retryAfterSeconds);
        if (!state) throw new Error("Processing lock was lost while recording Groq rate limit");
        groqRateLimited = true;
        groqFailure = state.groq_cooldown_until && state.groq_cooldown_until > new Date().toISOString()
          ? `groq-cooldown-until:${state.groq_cooldown_until}`
          : "groq-429";
      } else {
        groqFailure = error instanceof Error ? error.message : "Groq batch failed";
      }
    }
  } else if (groqCooling) {
    groqFailure = `groq-cooldown-until:${groqCooldownUntil}`;
  }

  for (const [offset, item] of numbered.entries()) {
    const sourceWordTokens = englishWordTokens(item.text);
    if (!hasTranslatableWordTokens(sourceWordTokens, translationProtectedTokens(item.text))) {
      const passthrough = item.text.trim();
      const passthroughReason = translationIntegrityFailure(item.text, passthrough);
      if (passthroughReason) {
        logRejectedTranslationCue(videoId, item.index, item.text, "passthrough", passthrough, passthroughReason);
        throw new Error(`Translation passthrough integrity failed for cue: ${item.index}`);
      }
      output.set(item.index, passthrough);
      console.info("[captions:translation-recovered]", JSON.stringify({ videoId, cueIndex: item.index, provider: "passthrough" }));
      await commitAcceptedCue({ ...slice[offset], text: passthrough }, item.index, "passthrough");
      continue;
    }

    const groqCandidate = groqResults?.get(item.index) || null;
    const groqReason = groqCandidate
      ? translationIntegrityFailure(item.text, groqCandidate)
      : (groqFailure || (process.env.GROQ_API_KEY ? "groq-missing-cue" : "groq-not-configured"));
    if (!groqReason) {
      output.set(item.index, groqCandidate as string);
      await commitAcceptedCue({ ...slice[offset], text: groqCandidate as string }, item.index, "groq");
      continue;
    }
    logRejectedTranslationCue(videoId, item.index, item.text, "groq-batch", groqCandidate, groqReason);

    // A rate-limited provider gets no second attempt for this cue. For normal
    // integrity failures, ask Groq once more with immutable values explicit.
    let strictCandidate: string | null = null;
    if (!groqRateLimited && !groqCooling && process.env.GROQ_API_KEY) {
      try {
        const strictStartedAt = Date.now();
        try {
          strictCandidate = await translateStrictSingleCueWithGroq(item.index, item.text);
        } finally {
          telemetry.strictGroqMs += Date.now() - strictStartedAt;
        }
        if (!await recordGroqProviderSuccess(videoId, lockToken)) {
          throw new Error("Processing lock was lost while recording strict Groq success");
        }
      } catch (error) {
        if (error instanceof GroqRateLimitError) {
          const state = await recordGroqRateLimit(videoId, lockToken, error.retryAfterSeconds);
          if (!state) throw new Error("Processing lock was lost while recording strict Groq rate limit");
          groqRateLimited = true;
          logRejectedTranslationCue(videoId, item.index, item.text, "groq-strict", null,
            state.groq_cooldown_until && state.groq_cooldown_until > new Date().toISOString()
              ? `groq-cooldown-until:${state.groq_cooldown_until}`
              : "groq-429");
        } else {
          logRejectedTranslationCue(videoId, item.index, item.text, "groq-strict", null,
            error instanceof Error ? error.message : "Groq strict retry failed");
        }
      }
    }
    if (strictCandidate) {
      const strictReason = translationIntegrityFailure(item.text, strictCandidate);
      if (!strictReason) {
        output.set(item.index, strictCandidate);
        const path = "groq-strict";
        console.info("[captions:translation-recovered]", JSON.stringify({ videoId, cueIndex: item.index, provider: path }));
        await commitAcceptedCue({ ...slice[offset], text: strictCandidate }, item.index, path);
        continue;
      }
      logRejectedTranslationCue(videoId, item.index, item.text, "groq-strict", strictCandidate, strictReason);
    }

    // Google receives placeholders instead of protected tokens/numbers. They
    // are restored verbatim before the same non-relaxed integrity validation.
    const googleStartedAt = Date.now();
    try {
      const google = await translateSingleCueWithProtectedGoogleFallback(item.text);
      if (google.restorationFailure || !google.restoredCandidate) {
        logRejectedTranslationCue(videoId, item.index, item.text, "google-placeholder", google.candidate,
          google.restorationFailure || "placeholder-restoration-failed", google.restoredCandidate);
        throw new Error(google.restorationFailure || "placeholder-restoration-failed");
      }
      const googleReason = translationIntegrityFailure(item.text, google.restoredCandidate);
      if (!googleReason) {
        output.set(item.index, google.restoredCandidate);
        const path = groqCooling ? "google-placeholder:groq-cooldown"
          : groqRateLimited ? "google-placeholder:groq-429"
            : "google-placeholder:recovery";
        console.info("[captions:translation-recovered]", JSON.stringify({ videoId, cueIndex: item.index, provider: path }));
        await commitAcceptedCue({ ...slice[offset], text: google.restoredCandidate }, item.index, path);
        continue;
      }
      logRejectedTranslationCue(videoId, item.index, item.text, "google-placeholder", google.candidate, googleReason, google.restoredCandidate);
    } catch (error) {
      logRejectedTranslationCue(videoId, item.index, item.text, "google-placeholder", null,
        error instanceof Error ? error.message : "Google fallback failed");
    } finally {
      telemetry.googleMs += Date.now() - googleStartedAt;
    }
    // A later cue may be present in the provider response, but it can never
    // move the checkpoint over this unresolved cue.
    throw new Error(`Translation temporarily failed for 1 cue: ${item.index}`);
  }
  const missing = numbered.filter(item => !output.has(item.index));
  if (missing.length) throw new Error(`Η μετάφραση απέτυχε προσωρινά σε ${missing.length} cues: ${missing.map(item => item.index).join(",")}`);
  return telemetry;
  } catch (error) {
    failure = error instanceof Error ? error.message : "translation-slice-failed";
    throw error;
  } finally {
    console.info("[captions:translation-slice]", JSON.stringify({
      videoId, start, requestedCues: numbered.length, ...telemetry,
      sliceMs: Date.now() - sliceStartedAt, outcome: failure ? "failed" : "committed", failure,
    }));
  }
}

function processingTelemetry(record: NonNullable<Awaited<ReturnType<typeof getTranscript>>>) {
  const persistedStage = record.processingStage || "source";
  const stage = record.rawEnglishTranscript.length && persistedStage === "source" ? "repair" : persistedStage;
  const cues = stage === "repair"
    ? record.rawEnglishTranscript
    : stage === "source_el_finalize"
      ? record.greekTranscript
      : record.englishTranscript;
  const totalCues = cues.length;
  const cursor = Math.max(0, Math.min(record.processingCursor || 0, totalCues));
  const completed = stage === "finalize" || stage === "source_el_finalize" ? totalCues : cursor;
  const cueStart = totalCues ? cues[Math.min(cursor, totalCues - 1)]?.start ?? null : null;
  let preciseProgress = record.progress;
  if (stage === "repair" && totalCues) preciseProgress = 28 + 20 * (completed / totalCues);
  if (stage === "translate" && totalCues) preciseProgress = 48 + 42 * (completed / totalCues);
  return {
    stage,
    cursor,
    totalCues,
    currentCue: totalCues
      ? (stage === "finalize" || stage === "source_el_finalize"
        ? totalCues
        : Math.min(totalCues, cursor + 1))
      : 0,
    cueStart,
    progress: Math.round(preciseProgress * 10) / 10,
    elapsedSeconds: record.processingStartedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(record.processingStartedAt).getTime()) / 1_000))
      : 0,
    updatedAt: record.updatedAt,
  };
}

function processingResponse(record: Awaited<ReturnType<typeof getTranscript>>) {
  const telemetry = record ? processingTelemetry(record) : null;
  return {
    status: "processing",
    progress: telemetry?.progress ?? 3,
    videoId: record?.videoId || "",
    stage: telemetry?.stage || "source",
    cursor: telemetry?.cursor || 0,
    totalCues: telemetry?.totalCues || 0,
    currentCue: telemetry?.currentCue || 0,
    cueStart: telemetry?.cueStart ?? null,
    elapsedSeconds: telemetry?.elapsedSeconds || 0,
    updatedAt: telemetry?.updatedAt || null,
    retryCount: record?.retryCount || 0,
    retryAfter: record?.retryAfter || null,
    groqCooldownUntil: record?.groqCooldownUntil || null,
    keyPoints: record?.keyPoints || [],
    transcriptVersion: TRANSCRIPT_VERSION,
  };
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

  // Finalized cues are already normalized and validated. Do not filter them
  // at response time, since removing only one side would break cue alignment.
  const greekTranscript = record.greekTranscript as CaptionCue[];
  const englishTranscript = record.englishTranscript as CaptionCue[];

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
      return NextResponse.json(processingResponse(cached), {
        status: 202,
        headers: { "Cache-Control": "no-store", "Retry-After": "1" },
      });
    }
    if (cached.status !== "ready") {
      return NextResponse.json({ ready: false, status: cached.status, error: cached.error || undefined }, { status: 409, headers: { "Cache-Control": "no-store" } });
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
    const body = (await request.json()) as { url?: unknown; force?: unknown; cachedTranscript?: ClientCachedTranscript; translationMode?: unknown };
    if (typeof body.url !== "string" || body.url.length > 500) {
      return NextResponse.json({ error: "Βάλε ένα έγκυρο YouTube link." }, { status: 400 });
    }
    const videoId = extractVideoId(body.url);
    if (!videoId) return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });
    lockedVideoId = videoId;
    const force = body.force === true;
    if (body.translationMode === "manual-pro") {
      return NextResponse.json({ error: "Η PRO μετάφραση εισάγεται από το εργαλείο PRO και δεν εκτελεί αυτόματη μετάφραση." }, { status: 409 });
    }
    const translationMode: TranslationMode = body.translationMode === "google" ? "google" : "legacy";
    let cached = await getTranscript(videoId);
    const mustRestartCheckpoint = Boolean(cached && (force || cached.transcriptVersion !== TRANSCRIPT_VERSION));

    if (!force && cached?.status === "ready" && cached.transcriptVersion === TRANSCRIPT_VERSION) {
      validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
      return NextResponse.json(await cachedResponse(cached));
    }

    // If another short processing slice owns the lease, only report status.
    if (!force && cached?.status === "processing" && cached.transcriptVersion === TRANSCRIPT_VERSION &&
        cached.lockExpiresAt && cached.lockExpiresAt > new Date().toISOString()) {
      return NextResponse.json(processingResponse(cached), { status: 202, headers: { "Retry-After": "1" } });
    }
    if (!force && cached?.status === "processing" && cached.retryAfter && cached.retryAfter > new Date().toISOString()) {
      const seconds = Math.max(1, Math.ceil((new Date(cached.retryAfter).getTime() - Date.now()) / 1000));
      return NextResponse.json(processingResponse(cached), { status: 202, headers: { "Retry-After": String(seconds) } });
    }

    lockToken = crypto.randomUUID();
    const acquired = await acquireProcessingLock(videoId, lockToken, force);
    if (!acquired) {
      cached = await getTranscript(videoId);
      if (cached?.status !== "processing") {
        return NextResponse.json({ error: cached?.error || "Η προετοιμασία χρειάζεται νέα προσπάθεια." }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json(processingResponse(cached), { status: 202, headers: { "Retry-After": "1" } });
    }

    // A forced retranslation or checkpoint-schema migration replays repair +
    // translation, but never refetches an already-persisted Supadata source.
    if (mustRestartCheckpoint) {
      const keepRaw = Boolean(cached?.rawEnglishTranscript?.length);
      if (!await resetProcessingForTranslation(videoId, lockToken, keepRaw)) {
        throw new Error("Processing lock was lost before restart checkpoint persisted");
      }
      cached = await getTranscript(videoId);
    }

    // Raw English is the durable source-of-truth. Even an interrupted legacy
    // row labelled `source` must continue at repair instead of paying Supadata
    // again for the same video.
    let stage = cached?.rawEnglishTranscript?.length
      ? (cached.processingStage && cached.processingStage !== "source" ? cached.processingStage : "repair")
      : (cached?.processingStage || "source");
    let cursor = cached?.processingCursor || 0;

    // Native Greek sources have no English raw checkpoint. Their Supadata
    // cues are persisted in a dedicated durable stage before any metadata
    // enrichment, so a later oEmbed failure cannot restart source fetching.
    if (stage === "source_el_finalize") {
      cached = await getTranscript(videoId);
      if (!cached) throw new Error("Greek source checkpoint missing");
      const greek = cached.greekTranscript as CaptionCue[];
      validateCompleteGreekTranscript(greek, cached.duration);
      const metadata = await fetchYouTubeOEmbed(videoId).catch(() => ({ title: "", authorName: "" }));
      const now = new Date().toISOString();
      const points = keyPoints(greek);
      if (!await completeTranscript({
        ...cached,
        title: metadata.title || cached.title || "YouTube video",
        channel: metadata.authorName || cached.channel || "YouTube",
        thumbnail: cached.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        rawEnglishTranscript: [], englishTranscript: [], greekTranscript: greek,
        timestamps: greek.map(cue => ({ start: cue.start, duration: cue.duration })),
        topics: [], keyPoints: points, status: "ready", progress: 100, transcriptVersion: TRANSCRIPT_VERSION, updatedAt: now,
      }, lockToken)) throw new Error("Processing lock was lost before Greek final transcript persisted");
      lockToken = null;
      const ready = await getTranscript(videoId);
      return NextResponse.json(await cachedResponse(ready));
    }

    if (stage === "source") {
      // Supadata first on Vercel: direct YouTube timed-text is consistently challenged.
      // One successful fetch is persisted and never repeated during translation retries.
      const supadata = await fetchSupadataTranscript(videoId);
      const sourceLanguage = supadata.lang.toLowerCase() || "unknown";
      if (!(sourceLanguage === "el" || sourceLanguage === "en" || sourceLanguage.startsWith("en-"))) {
        throw new Error(`Supadata returned unsupported source language: ${sourceLanguage}`);
      }
      const duration = supadata.cues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
      if (sourceLanguage === "el") {
        if (!await saveProcessingCheckpoint(videoId, lockToken, {
          stage: "source_el_finalize", cursor: 0, progress: 90,
          englishTranscript: [], greekTranscript: supadata.cues, duration, originalLanguage: sourceLanguage,
          title: cached?.title || "YouTube video", channel: cached?.channel || "YouTube",
        })) throw new Error("Processing lock was lost before Greek source checkpoint persisted");
        if (!await releaseProcessingLock(videoId, lockToken)) throw new Error("Processing lock was lost before Greek source release"); lockToken = null;
        const next = await getTranscript(videoId);
        return NextResponse.json(processingResponse(next), { status: 202, headers: { "Retry-After": "1" } });
      }
      // Commit the paid Supadata response before any optional metadata work.
      // If oEmbed is unavailable, the next slice starts at repair from this
      // durable raw source and must not call Supadata again.
      if (!await saveProcessingCheckpoint(videoId, lockToken, {
        stage: "repair", cursor: 0, progress: 28, rawEnglishTranscript: supadata.cues,
        englishTranscript: [], greekTranscript: [], duration, originalLanguage: sourceLanguage,
      })) throw new Error("Processing lock was lost before source checkpoint persisted");
      const metadata = await fetchYouTubeOEmbed(videoId).catch(() => ({ title: "", authorName: "" }));
      if ((metadata.title || metadata.authorName) && !await saveProcessingCheckpoint(videoId, lockToken, {
        stage: "repair", cursor: 0, progress: 28,
        title: metadata.title || cached?.title || "YouTube video",
        channel: metadata.authorName || cached?.channel || "YouTube",
      })) throw new Error("Processing lock was lost before metadata checkpoint persisted");
      if (!await releaseProcessingLock(videoId, lockToken)) throw new Error("Processing lock was lost before source release"); lockToken = null;
      const next = await getTranscript(videoId);
      return NextResponse.json(processingResponse(next), { status: 202, headers: { "Retry-After": "1" } });
    }

    cached = await getTranscript(videoId);
    if (!cached) throw new Error("Processing checkpoint missing");

    if (stage === "repair") {
      const raw = cached.rawEnglishTranscript as CaptionCue[];
      if (!raw.length) throw new Error("Raw English transcript checkpoint is empty");
      const CHUNK = 16;
      if (cursor < raw.length) {
        const chunk = await prepareEnglishTimedChunk(raw, cursor, CHUNK, translationMode === "legacy");
        const english = [...(cached.englishTranscript as CaptionCue[]), ...chunk];
        const nextCursor = Math.min(raw.length, cursor + CHUNK);
        const done = nextCursor >= raw.length;
        const progress = done ? 48 : Math.round(28 + 20 * (nextCursor / raw.length));
        if (!await saveProcessingCheckpoint(videoId, lockToken, {
          stage: done ? "translate" : "repair", cursor: done ? 0 : nextCursor, progress, englishTranscript: english,
        })) throw new Error("Processing lock was lost before repair checkpoint persisted");
      } else {
        if (!await saveProcessingCheckpoint(videoId, lockToken, { stage: "translate", cursor: 0, progress: 48 })) throw new Error("Processing lock was lost before repair transition persisted");
      }
      if (!await releaseProcessingLock(videoId, lockToken)) throw new Error("Processing lock was lost before repair release"); lockToken = null;
      const next = await getTranscript(videoId);
      return NextResponse.json(processingResponse(next), { status: 202, headers: { "Retry-After": "1" } });
    }

    cached = await getTranscript(videoId);
    if (!cached) throw new Error("Processing checkpoint missing");
    stage = cached.processingStage || stage; cursor = cached.processingCursor || 0;

    if (stage === "translate") {
      const english = cached.englishTranscript as CaptionCue[];
      if (!english.length) throw new Error("Normalized English transcript checkpoint is empty");
      // One provider micro-batch contains exactly four cues. Each accepted
      // cue is persisted before the next one, preserving a contiguous cursor.
      const CHUNK = translationMode === "google" ? 12 : 4;
      if (cursor < english.length) {
        const translationLockToken = lockToken;
        let greek = [...(cached.greekTranscript as CaptionCue[])];
        await translateCheckpointBatch(videoId, translationLockToken, cached.groqCooldownUntil, translationMode, english, cursor, CHUNK,
          async (translatedCue, cueIndex) => {
            // Committing out of order would let a later cue hide an unresolved
            // earlier cue. Refuse it before any durable write.
            if (cueIndex !== cursor) throw new Error(`Non-contiguous translation checkpoint: expected ${cursor}, got ${cueIndex}`);
            const nextCursor = cueIndex + 1;
            const done = nextCursor >= english.length;
            const progress = done ? 90 : Math.round(48 + 42 * (nextCursor / english.length));
            const nextGreek = [...greek, translatedCue];
            // This existing durable checkpoint also extends the lease by 180s.
            // No separate heartbeat write is required.
            if (!await saveProcessingCheckpoint(videoId, translationLockToken, {
              stage: done ? "finalize" : "translate", cursor: nextCursor, progress, greekTranscript: nextGreek,
            })) throw new Error("Processing lock was lost before translation checkpoint persisted");
            greek = nextGreek;
            cursor = nextCursor;
          });
      } else {
        if (!await saveProcessingCheckpoint(videoId, lockToken, { stage: "finalize", cursor: english.length, progress: 90 })) throw new Error("Processing lock was lost before translation transition persisted");
      }
      if (!await releaseProcessingLock(videoId, lockToken)) throw new Error("Processing lock was lost before translation release"); lockToken = null;
      const next = await getTranscript(videoId);
      return NextResponse.json(processingResponse(next), { status: 202, headers: { "Retry-After": "1" } });
    }

    cached = await getTranscript(videoId);
    if (!cached) throw new Error("Processing checkpoint missing");
    if ((cached.processingStage || stage) === "finalize") {
      let english = cached.englishTranscript as CaptionCue[];
      let greek = cached.greekTranscript as CaptionCue[];
      const englishInversions = timingInversionCount(english);
      const greekInversions = timingInversionCount(greek);
      if (englishInversions || greekInversions) {
        if (!englishInversions || !greekInversions) {
          throw new Error("English/Greek checkpoint timing inversions diverged");
        }
        const recovered = recoverMalformedAlignedTimings(english, greek);
        if (!recovered.recovered) throw new Error("Malformed checkpoint timing was not recovered");
        english = recovered.english;
        greek = recovered.greek;
        if (!await saveProcessingCheckpoint(videoId, lockToken, {
          stage: "finalize", cursor: english.length, progress: 90,
          englishTranscript: english, greekTranscript: greek,
        })) throw new Error("Processing lock was lost before timing recovery checkpoint persisted");
        console.info("[captions:timing-recovered]", JSON.stringify({
          videoId, englishInversions, greekInversions, cues: english.length,
        }));
      }
      validateAlignedTranscript(english, greek);
      validateCompleteGreekTranscript(greek, cached.duration);
      if (!await updateProcessingProgress(videoId, lockToken, 94)) throw new Error("Processing lock was lost before final validation persisted");
      const translatedTitle = await translateTitleToGreek(cached.title || "YouTube video");
      const points = keyPoints(greek);
      const topics = [...new Set(points.flatMap(point => point.toLowerCase().match(/[\\p{L}]{6,}/gu) || []))].slice(0, 6);
      const now = new Date().toISOString();
      if (!await completeTranscript({
        ...cached, title: cached.title || "YouTube video", channel: cached.channel || "YouTube",
        rawEnglishTranscript: cached.rawEnglishTranscript, englishTranscript: english, greekTranscript: greek,
        timestamps: greek.map(cue => ({ start: cue.start, duration: cue.duration })), topics, keyPoints: points,
        status: "ready", progress: 100, transcriptVersion: TRANSCRIPT_VERSION, updatedAt: now,
      }, lockToken)) throw new Error("Processing lock was lost before final transcript persisted");
      lockToken = null;
      const ready = await getTranscript(videoId);
      const payload = await cachedResponse(ready);
      return NextResponse.json({ ...payload, title: translatedTitle, translationMethod: translationMode === "google" ? "google_fast_context_v1" : "resumable_repaired_timed_v8", cached: false });
    }

    throw new Error(`Unknown processing stage: ${stage}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "retry";
    console.error(`[captions:${lockedVideoId || "unknown"}] resumable slice failed`, error);
    const recoverable = /μετάφραση|translation|groq|supadata|fetch|network|timeout|abort|429|\b5\d\d\b/i.test(message);
    if (lockedVideoId && lockToken && recoverable) {
      const retry = await recordTransientProcessingFailure(lockedVideoId, lockToken, message).catch(() => null);
      lockToken = null;
      if (retry?.status === "processing") {
        const current = await getTranscript(lockedVideoId).catch(() => null);
        return NextResponse.json({ ...processingResponse(current), transientError: message }, { status: 202, headers: { "Retry-After": "2" } });
      }
      if (retry?.status === "failed") {
        return NextResponse.json({ error: message, retryLimit: MAX_TRANSIENT_RETRIES }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
    }
    if (lockedVideoId && lockToken) await failTranscript(lockedVideoId, lockToken, message).catch(() => undefined);
    return NextResponse.json({ error: message, retryLimit: MAX_TRANSIENT_RETRIES }, { status: 502 });
  }
}


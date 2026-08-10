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
  // Clean ASR hesitation/noise before grouping and translating so vocal fillers
  // do not become long Greek strings such as "χμμμμμμ...".
  const cleanedCues = cues
    .map(cue => ({ ...cue, text: cleanSubtitleText(cue.text) }))
    .filter(cue => cue.text.length > 0);

  // YouTube can place more than one sentence inside a single timed cue.
  // Split those internal sentence boundaries BEFORE grouping so punctuation
  // from the English source remains authoritative (e.g. "poisoned. MSM...").
  // Time is distributed proportionally across the source characters, while
  // keeping the original cue start/end envelope unchanged.
  const preparedCues: CaptionCue[] = cleanedCues.flatMap(cue => {
    const parts = cue.text.match(/[^.!?…]+[.!?…]+[\"')\]]*|[^.!?…]+$/g)?.map(part => part.trim()).filter(Boolean) || [cue.text];
    if (parts.length <= 1) return [cue];
    const weights = parts.map(part => Math.max(1, part.replace(/\s+/g, '').length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let elapsed = 0;
    return parts.map((part, index) => {
      const start = cue.start + elapsed;
      const remaining = Math.max(0.12, cue.duration - elapsed);
      const duration = index === parts.length - 1
        ? remaining
        : Math.max(0.12, cue.duration * (weights[index] / totalWeight));
      elapsed += duration;
      return { start, duration, text: part };
    });
  });
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

  preparedCues.forEach((cue, index) => {
    const next = preparedCues[index + 1];
    current.push(cue);
    characters += cue.text.length;
    const elapsed = cue.start + cue.duration - current[0].start;
    const sentenceEnd = /[.!?…]["')\]]?$/.test(cue.text.trim());
    const gap = next ? next.start - (cue.start + cue.duration) : Number.POSITIVE_INFINITY;
    const naturalPause = gap >= 0.65;
    const softPause = gap >= 0.25 && (elapsed >= 5.5 || characters >= 110);
    const mustSplit = elapsed >= 8 || characters >= 160;

    // The source punctuation is authoritative. If YouTube says a sentence has
    // ended (for example "poisoned."), never merge words from the next thought
    // into the same translation unit. A clear spoken pause is also a hard
    // semantic boundary. Only merge fragments while the sentence is genuinely
    // continuing.
    if (sentenceEnd || naturalPause || softPause || mustSplit || !next) flush();
  });

  // Source caption ranges can overlap. A displayed cue is only active until
  // the next cue starts, so normalize its duration to that real window.
  return units.map((unit, index) => {
    const next = units[index + 1];
    if (!next || next.start <= unit.start) return unit;
    return {
      ...unit,
      duration: Math.max(0.8, Math.min(unit.duration, next.start - unit.start)),
    };
  });
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
  "Μετέφρασε φυσικά στα ελληνικά για υπότιτλους. " +
  "Κάθε δείκτης [[N]] είναι ανεξάρτητο timed cue και πρέπει να παραμείνει δεμένος με το δικό του χρονικό σημείο. " +
  "Μετέφρασε ΜΟΝΟ τις λέξεις που υπάρχουν μετά από κάθε [[N]] μέχρι τον επόμενο δείκτη. " +
  "Μην μεταφέρεις, ολοκληρώνεις ή δανείζεσαι λέξεις και νόημα από γειτονικό cue, ακόμη και αν μια πρόταση κόβεται στη μέση. " +
  "Η τελεία, το ερωτηματικό, το θαυμαστικό και η σαφής παύση του πρωτοτύπου είναι οριστικά όρια νοήματος. Μην συνδέεις την επόμενη πρόταση με την προηγούμενη. " +
  "Ουσία, φάρμακο, συμπλήρωμα, πρόσωπο ή τεχνικός όρος που εμφανίζεται στο επόμενο cue δεν επιτρέπεται να γίνει αιτία, αντικείμενο ή υποκείμενο του προηγούμενου cue αν αυτό δεν υπάρχει ρητά στο αγγλικό κείμενο. " +
  "Διατήρησε πιστά το νόημα και την ιατρική ή επιστημονική ορολογία, με φυσικά ελληνικά αντί για κατά λέξη απόδοση. " +
  "Χρησιμοποίησε συνεπή ορολογία σε όλα τα cues και αφαίρεσε μόνο προφανή λεκτικά fillers όπως um, uh, hmm, χμ και εε. " +
  "Μην προσθέτεις πληροφορίες που δεν υπάρχουν στο πρωτότυπο. Μην αλλάζεις ποιος κάνει τι σε ποιον, αιτία και αποτέλεσμα, άρνηση, ποσότητες, επιλογές ή τεχνικούς όρους. " +
  "Η ελληνική απόδοση πρέπει να είναι πιστή στο συγκεκριμένο αγγλικό cue: πρώτα ακρίβεια νοήματος και μετά φυσικότητα ύφους. " +
  "Επέστρεψε ακριβώς έναν δείκτη [[N]] για κάθε input cue, στην ίδια σειρά, χωρίς παραλείψεις, διπλασιασμούς ή νέους δείκτες. " +
  "Απάντησε ΜΟΝΟ με τις μεταφρασμένες γραμμές και τους δείκτες, χωρίς εισαγωγή, σχόλια ή εξηγήσεις.";

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

function technicalGuardTokens(text: string) {
  const matches = text.match(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|%)?)\b/g) || [];
  return new Set(matches.map(token => token.toLowerCase()));
}

function hasEnglishNegation(text: string) {
  return /\b(?:no|not|never|without|cannot|can't|won't|wouldn't|shouldn't|couldn't|isn't|aren't|wasn't|weren't|don't|doesn't|didn't)\b/i.test(text);
}

function hasGreekNegation(text: string) {
  return /(?:^|[^\p{L}])(?:δεν|μην|μη|όχι|χωρίς|ούτε)(?=$|[^\p{L}])/iu.test(text);
}

function semanticRiskScore(text: string) {
  let score = technicalGuardTokens(text).size * 3;
  if (hasEnglishNegation(text)) score += 3;
  if (/\b\d+(?:\.\d+)?\b/.test(text)) score += 2;
  if (/\b(?:because|cause|causes|caused|due to|therefore|so that|from|by)\b/i.test(text)) score += 2;
  if (/\b(?:or|either|instead|rather|versus|vs\.?)\b/i.test(text)) score += 2;
  if (text.length >= 110) score += 1;
  return score;
}

function needsStrictSemanticRetry(cues: CaptionCue[], translated: Map<number, string>, index: number) {
  const source = cues[index]?.text || "";
  const target = translated.get(index) || "";
  if (!source || !target) return false;

  const ownTokens = technicalGuardTokens(source);
  const targetTokens = technicalGuardTokens(target);
  const neighbourTokens = new Set<string>();
  for (const neighbourIndex of [index - 1, index + 1]) {
    if (neighbourIndex < 0 || neighbourIndex >= cues.length) continue;
    for (const token of technicalGuardTokens(cues[neighbourIndex].text)) neighbourTokens.add(token);
  }

  // Catch cross-boundary borrowing such as the next cue's "MSM" being turned
  // into the cause of the previous cue's "poisoned." sentence.
  for (const token of targetTokens) {
    if (!ownTokens.has(token) && neighbourTokens.has(token)) return true;
  }

  // Added negation is another high-risk semantic change. Re-run only that cue
  // in complete isolation rather than penalising the whole transcript.
  if (!hasEnglishNegation(source) && hasGreekNegation(target)) return true;
  return false;
}

async function verifySemanticFidelity(
  cues: CaptionCue[],
  translated: Map<number, string>,
  candidateIndexes: number[],
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !candidateIndexes.length) return [] as number[];

  // Hard budget: never review the whole transcript with a second AI pass.
  // Only the highest-risk cues are checked, in at most two small requests.
  const candidates = [...new Set(candidateIndexes)]
    .filter(index => index >= 0 && index < cues.length && translated.has(index))
    .slice(0, 12);
  const suspicious: number[] = [];
  const size = 6;

  for (let start = 0; start < candidates.length; start += size) {
    const indexes = candidates.slice(start, start + size);
    const pairs = indexes
      .map(index => `[[${index}]]\nEN: ${cues[index].text}\nEL: ${translated.get(index)}`)
      .join("\n\n");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {"Content-Type":"application/json", Authorization:`Bearer ${apiKey}`},
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0,
          max_tokens: 260,
          messages: [
            {role:"system",content:"Είσαι αυστηρός ελεγκτής πιστότητας υποτίτλων. Σύγκρινε ΚΑΘΕ αγγλικό cue μόνο με το δικό του ελληνικό. Σημείωσε cue ως λάθος μόνο αν αλλάζει ουσιαστικά το νόημα: λάθος υποκείμενο/αντικείμενο, αιτία-αποτέλεσμα, άρνηση, ποσότητα, επιλογή, τεχνικός όρος ή προσθήκη/αφαίρεση σημαντικής πληροφορίας. Μικρές φυσικές αναδιατυπώσεις είναι σωστές. Απάντησε μόνο JSON array με τα αριθμητικά ids που χρειάζονται νέα μετάφραση, π.χ. [4,7] ή []."},
            {role:"user",content:pairs},
          ],
        }),
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) continue;
      const payload = await response.json() as {choices?:{message?:{content?:string}}[]};
      const raw = payload.choices?.[0]?.message?.content || "";
      const arrayText = raw.match(/\[[\s\S]*?\]/)?.[0];
      if (!arrayText) continue;
      const ids = JSON.parse(arrayText) as unknown;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (Number.isInteger(id) && indexes.includes(id as number)) suspicious.push(id as number);
      }
    } catch {}
  }
  return [...new Set(suspicious)].slice(0, 4);
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
  const batchSize = useGroq ? 8 : 25;
  const batches: { index: number; text: string }[][] = [];
  for (let start = 0; start < cues.length; start += batchSize) {
    batches.push(cues.slice(start, start + batchSize).map((cue, offset) => ({
      index: start + offset,
      text: cue.text,
    })));
  }

  const reportProgress = async (completed: number, total: number, start: number, end: number) => {
    if (!onProgress || total <= 0) return;
    const ratio = Math.max(0, Math.min(1, completed / total));
    await onProgress(Math.round(start + (end - start) * ratio));
  };

  if (useGroq) {
    // Sequential on purpose: Groq's free tier is rate-limited per minute (TPM),
    // not just per day, so batches are kept modest and run one at a time.
    let precedingContext: string | undefined;
    let completedPrimary = 0;
    for (const batch of batches) {
      try {
        const results = await translateBatchWithGroq(batch, precedingContext);
        if (results) {
          results.forEach((text, index) => translated.set(index, text));
          const tail = batch
            .map(item => translated.get(item.index))
            .filter((text): text is string => Boolean(text))
            .slice(-3);
          if (tail.length) precedingContext = tail.join(" ");
        }
      } catch {
        // fall through to Google Translate for this batch below
      } finally {
        completedPrimary += batch.length;
        await reportProgress(completedPrimary, cues.length, 48, 78);
      }
    }
    const remainingBatches = batches
      .map(batch => batch.filter(item => !translated.has(item.index)))
      .filter(batch => batch.length > 0);
    const remainingTotal = remainingBatches.reduce((sum, batch) => sum + batch.length, 0);
    let completedFallback = 0;
    for (let start = 0; start < remainingBatches.length; start += 2) {
      const group = remainingBatches.slice(start, start + 2);
      const results = await Promise.all(group.map(translateMeaningBatch));
      results.forEach(batch => {
        batch.forEach((text, index) => translated.set(index, text));
      });
      completedFallback += group.reduce((sum, batch) => sum + batch.length, 0);
      await reportProgress(completedFallback, remainingTotal, 78, 84);
    }
    if (!remainingTotal && onProgress) await onProgress(84);
  } else {
    let completed = 0;
    for (let start = 0; start < batches.length; start += 2) {
      const group = batches.slice(start, start + 2);
      const results = await Promise.all(group.map(translateMeaningBatch));
      results.forEach(batch => {
        batch.forEach((text, index) => translated.set(index, text));
      });
      completed += group.reduce((sum, batch) => sum + batch.length, 0);
      await reportProgress(completed, cues.length, 48, 84);
    }
  }

  if (useGroq) {
    const deterministic = cues
      .map((_, index) => index)
      .filter(index => translated.has(index) && needsStrictSemanticRetry(cues, translated, index));
    const riskCandidates = cues
      .map((cue, index) => ({ index, score: translated.has(index) ? semanticRiskScore(cue.text) : 0 }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.index);
    const verificationCandidates = [...new Set([...deterministic, ...riskCandidates])].slice(0, 12);
    const semantic = await verifySemanticFidelity(cues, translated, verificationCandidates);
    const suspicious = [...new Set([...deterministic, ...semantic])].slice(0, 4);
    let checked = 0;
    for (const index of suspicious) {
      try {
        // No preceding/next context on this retry: the model can only translate
        // the exact source cue, which prevents semantic borrowing across a
        // punctuation or pause boundary.
        const strict = await translateBatchWithGroq([{ index, text: cues[index].text }]);
        const replacement = strict?.get(index);
        if (replacement) translated.set(index, replacement);
      } catch {
        // Keep the already valid mapped translation if strict verification is
        // temporarily unavailable. The original mapping/fallback safeguards
        // still apply below.
      }
      checked += 1;
      if (onProgress && suspicious.length) {
        await onProgress(Math.round(84 + (2 * checked / suspicious.length)));
      }
    }
    if (onProgress && !suspicious.length) await onProgress(86);
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
        cues = await translateCuesToGreek(sourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress));
        translationMethod = "supadata_native_semantic_boundaries_v5";
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
        cues = await translateCuesToGreek(sourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress));
        translationMethod = "semantic_boundaries_v5";
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

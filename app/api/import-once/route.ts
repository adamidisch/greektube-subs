import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseManualSubtitleText } from "../manual-captions/parser";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  completeTranscript,
  getTranscript,
  releaseProcessingLock,
} from "../shared-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_ID = "n1G3xqgzB2c";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const TITLE = "Η αναστροφή της γήρανσης, η AI και το μέλλον της Αμερικής";
const BATCH_SIZE = 18;

type Cue = { start: number; duration: number; text: string };
type ProtectedValue = { placeholder: string; value: string };

function alphaLabel(index: number) {
  let value = index;
  let output = "";
  do {
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return output;
}

function cleanObviousAsr(text: string) {
  return text
    .replace(/\bthreedimensional\b/gi, "three-dimensional")
    .replace(/\bembryionic\b/gi, "embryonic")
    .replace(/\bredifferiated\b/gi, "redifferentiated")
    .replace(/\b500tory\b/gi, "500-story")
    .replace(/\bin silicone\b/gi, "in silico")
    .replace(/\bofftheshelf\b/gi, "off-the-shelf")
    .replace(/\bhealthare\b/gi, "healthcare")
    .replace(/\bRalio's\b/g, "Ray Dalio's")
    .replace(/\bSunsu's\b/g, "Sun Tzu's")
    .replace(/\bprecocious state\b/gi, "precarious state")
    .replace(/\bbedelum\b/gi, "bedlam")
    .replace(/\bappine\b/gi, "opine")
    .replace(/\bstraight of hormones\b/gi, "Strait of Hormuz")
    .replace(/\bBuddhajed\b/g, "Buttigieg")
    .replace(/\bKamla\b/g, "Kamala")
    .replace(/\bNewsome\b/g, "Newsom")
    .replace(/\bmom Donnie\b/gi, "Mamdani")
    .replace(/\bepiggenome\b/gi, "epigenome");
}

function protectText(text: string, cueIndex: number) {
  const values: ProtectedValue[] = [];
  const pattern = /\b(?:DNA|RNA|ATP|AI|AOC|DSA|SPR|G7|401k|401ks|US|UAE|TBD)\b|\d+(?:[.,]\d+)?(?:\s*%)?/gi;
  const protectedText = cleanObviousAsr(text).replace(pattern, value => {
    const placeholder = `ZXQPROTECT${alphaLabel(cueIndex)}${alphaLabel(values.length)}`;
    values.push({ placeholder, value });
    return placeholder;
  });
  return { protectedText, values };
}

function restoreText(text: string, values: ProtectedValue[]) {
  let output = text.replace(/\s+/g, " ").trim();
  for (const item of values) {
    const pattern = new RegExp(item.placeholder, "gi");
    const matches = output.match(pattern) || [];
    if (matches.length !== 1) throw new Error(`Protected token restoration failed: ${item.placeholder}`);
    output = output.replace(pattern, item.value);
  }
  return output.replace(/\s+/g, " ").trim();
}

function greekEnough(text: string) {
  const letters = text.match(/\p{L}/gu)?.length || 0;
  const greek = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters > 0 && greek / letters > 0.18;
}

async function googleTranslate(text: string) {
  const body = new URLSearchParams({ client: "gtx", sl: "en", tl: "el", dt: "t", q: text });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
    if (!response.ok) throw new Error(`Google translation ${response.status}`);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error("Google translation response invalid");
    return (payload[0] as unknown[])
      .map(part => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")
      .join("")
      .trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function translateBatch(cues: Cue[], absoluteStart: number) {
  const prepared = cues.map((cue, offset) => {
    const index = absoluteStart + offset;
    const marker = `ZXQCUE${alphaLabel(index)}`;
    const protectedCue = protectText(cue.text, index);
    return { index, marker, ...protectedCue };
  });
  const source = prepared.map(item => `${item.marker} ${item.protectedText}`).join("\n");
  const translated = await googleTranslate(source);
  const output = new Map<number, string>();

  for (let offset = 0; offset < prepared.length; offset += 1) {
    const item = prepared[offset];
    const next = prepared[offset + 1];
    const startAt = translated.toUpperCase().indexOf(item.marker.toUpperCase());
    if (startAt < 0) throw new Error(`Cue marker missing: ${item.marker}`);
    const contentStart = startAt + item.marker.length;
    const endAt = next ? translated.toUpperCase().indexOf(next.marker.toUpperCase(), contentStart) : translated.length;
    if (endAt < contentStart) throw new Error(`Cue marker order invalid: ${item.marker}`);
    const restored = restoreText(translated.slice(contentStart, endAt), item.values);
    if (!restored || !greekEnough(restored)) throw new Error(`Greek translation invalid at cue ${item.index + 1}`);
    output.set(item.index, restored);
  }
  return output;
}

async function fetchMetadata() {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(VIDEO_URL)}&format=json`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const payload = await response.json() as { title?: string; author_name?: string };
    return { originalTitle: payload.title || "", channel: payload.author_name || "YouTube" };
  } catch {
    return { originalTitle: "", channel: "YouTube" };
  }
}

export async function GET() {
  let lockToken: string | null = null;
  try {
    const sourceText = await readFile(path.join(process.cwd(), "public", "import-n1G3xqgzB2c-source.srt"), "utf8");
    const english = parseManualSubtitleText(sourceText) as Cue[];
    if (english.length < 3) return NextResponse.json({ error: "Supplied source transcript did not parse." }, { status: 500 });

    const existing = await getTranscript(VIDEO_ID);
    if (existing?.status === "ready" && existing.greekTranscript?.length === english.length) {
      return NextResponse.json({ status: "ready", progress: 100, videoId: VIDEO_ID, title: existing.title, cueCount: existing.greekTranscript.length, cached: true });
    }

    lockToken = crypto.randomUUID();
    if (!await acquireProcessingLock(VIDEO_ID, lockToken, true)) {
      return NextResponse.json({ error: "Import lock unavailable." }, { status: 409 });
    }

    const translated = new Map<number, string>();
    for (let start = 0; start < english.length; start += BATCH_SIZE) {
      const batchCues = english.slice(start, start + BATCH_SIZE);
      const batch = await translateBatch(batchCues, start);
      for (let offset = 0; offset < batchCues.length; offset += 1) {
        const index = start + offset;
        const text = batch.get(index);
        if (!text) throw new Error(`Translation missing at cue ${index + 1}`);
        translated.set(index, text);
      }
    }

    const greek = english.map((cue, index) => ({ ...cue, text: cue.text.trim() === "it up." ? "…" : translated.get(index) as string }));
    const metadata = await fetchMetadata();
    const now = new Date().toISOString();
    const duration = greek.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
    const keyStep = Math.max(1, Math.floor(greek.length / 10));
    const keyPoints = greek.filter((_, index) => index % keyStep === 0).map(cue => cue.text).slice(0, 10);
    const record = {
      videoId: VIDEO_ID,
      title: TITLE,
      channel: metadata.channel,
      thumbnail: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      duration,
      originalLanguage: "en",
      rawEnglishTranscript: english,
      englishTranscript: english,
      greekTranscript: greek,
      timestamps: greek.map(cue => ({ start: cue.start, duration: cue.duration })),
      topics: ["γήρανση", "επιγενετική", "AI", "οικονομία", "γεωπολιτική"],
      keyPoints,
      status: "ready" as const,
      progress: 100,
      transcriptVersion: TRANSCRIPT_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (!await completeTranscript(record, lockToken)) throw new Error("Transcript save failed.");
    lockToken = null;

    return NextResponse.json({
      status: "ready",
      progress: 100,
      videoId: VIDEO_ID,
      title: TITLE,
      originalTitle: metadata.originalTitle,
      channel: metadata.channel,
      duration,
      cueCount: greek.length,
      translationMode: "manual-source-google-contextual",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (lockToken) await releaseProcessingLock(VIDEO_ID, lockToken).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

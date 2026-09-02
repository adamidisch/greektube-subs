import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseManualSubtitleText } from "../manual-captions/parser";
import { publishTranscript } from "../transcript-blob";
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
const CONCURRENCY = 8;

type Cue = { start: number; duration: number; text: string };

function cleanObviousAsr(text: string) {
  return text
    .replace(/^\s*I do\.\s*$/i, "Yes.")
    .replace(/^\s*Mhm\.\s*$/i, "Yes.")
    .replace(/^\s*Uhhuh\.\s*$/i, "Yes.")
    .replace(/\bthreedimensional\b/gi, "three-dimensional")
    .replace(/\bembryionic\b/gi, "embryonic")
    .replace(/\bredifferiated\b/gi, "redifferentiated")
    .replace(/\b500tory\b/gi, "500-story")
    .replace(/\bin silicone\b/gi, "in silico")
    .replace(/\bofftheshelf\b/gi, "off-the-shelf")
    .replace(/\bhealthare\b/gi, "healthcare")
    .replace(/\bacetal markers\b/gi, "acetyl markers")
    .replace(/\bISEL\b/g, "eye cell")
    .replace(/\bcardiammyio\b/gi, "cardiac muscle")
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
    .replace(/\bepiggenome\b/gi, "epigenome")
    .replace(/\bD CEO brand\b/gi, "Diary of a CEO brand");
}

function greekEnough(text: string) {
  const letters = text.match(/\p{L}/gu)?.length || 0;
  const greek = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters > 0 && greek / letters > 0.18;
}

function cleanGreek(text: string) {
  return text
    .replace(/\bZXQ[A-Z0-9]*\b/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
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
    return cleanGreek((payload[0] as unknown[])
      .map(part => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")
      .join(""));
  } finally {
    clearTimeout(timeout);
  }
}

async function translateCue(cue: Cue, index: number) {
  if (cue.text.trim() === "it up.") return "…";
  const source = cleanObviousAsr(cue.text);
  const translated = await googleTranslate(source);
  if (!translated || !greekEnough(translated)) throw new Error(`Greek translation invalid at cue ${index + 1}`);
  return translated;
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

function blobPayload(record: NonNullable<Awaited<ReturnType<typeof getTranscript>>>) {
  return {
    status: "ready",
    progress: 100,
    videoId: record.videoId,
    title: record.title,
    originalTitle: "",
    channel: record.channel,
    duration: record.duration,
    sourceLanguage: record.originalLanguage || "en",
    cues: record.greekTranscript,
    englishCues: record.englishTranscript,
    topics: record.topics,
    keyPoints: record.keyPoints,
    transcriptVersion: record.transcriptVersion,
    cached: true,
  };
}

export async function GET() {
  let lockToken: string | null = null;
  try {
    const sourceText = await readFile(path.join(process.cwd(), "public", "import-n1G3xqgzB2c-source.srt"), "utf8");
    const english = parseManualSubtitleText(sourceText) as Cue[];
    if (english.length < 3) return NextResponse.json({ error: "Supplied source transcript did not parse." }, { status: 500 });

    const existing = await getTranscript(VIDEO_ID);
    const existingClean = existing?.status === "ready" && existing.greekTranscript?.length === english.length &&
      !existing.greekTranscript.some(cue => /ZXQ/i.test(cue.text));
    if (existingClean && existing) {
      const published = await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, blobPayload(existing));
      if (!published) throw new Error("Clean transcript Blob republish failed.");
      return NextResponse.json({ status: "ready", progress: 100, videoId: VIDEO_ID, title: existing.title, cueCount: existing.greekTranscript.length, republished: true });
    }

    lockToken = crypto.randomUUID();
    if (!await acquireProcessingLock(VIDEO_ID, lockToken, true)) {
      return NextResponse.json({ error: "Import lock unavailable." }, { status: 409 });
    }

    const greekText = new Array<string>(english.length);
    for (let start = 0; start < english.length; start += CONCURRENCY) {
      const indexes = english.slice(start, start + CONCURRENCY).map((_, offset) => start + offset);
      const values = await Promise.all(indexes.map(index => translateCue(english[index], index)));
      values.forEach((text, offset) => { greekText[indexes[offset]] = text; });
    }

    const greek = english.map((cue, index) => ({ ...cue, text: greekText[index] }));
    const leaked = greek.filter(cue => /ZXQ/i.test(cue.text));
    if (leaked.length) throw new Error(`Technical marker leak remained in ${leaked.length} cues`);
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
    const saved = await getTranscript(VIDEO_ID);
    if (!saved || saved.status !== "ready") throw new Error("Saved transcript verification failed.");
    if (!await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, blobPayload(saved))) throw new Error("Transcript Blob publish failed.");

    return NextResponse.json({
      status: "ready",
      progress: 100,
      videoId: VIDEO_ID,
      title: TITLE,
      originalTitle: metadata.originalTitle,
      channel: metadata.channel,
      duration,
      cueCount: greek.length,
      translationMode: "manual-source-google-per-cue",
      published: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (lockToken) await releaseProcessingLock(VIDEO_ID, lockToken).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

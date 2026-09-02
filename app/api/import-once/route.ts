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
const GROQ_MODEL = "openai/gpt-oss-120b";
const BATCH_SIZE = 18;

type Cue = { start: number; duration: number; text: string };
type TranslationRow = { index: number; text: string };

function numericTokens(text: string) {
  return (text.match(/\d+(?:[.,]\d+)?/g) || []).map(token => token.replace(",", "."));
}

function requiredTokens(text: string) {
  return [...new Set(text.match(/\b(?:DNA|RNA|ATP|AI|AOC|DSA|SPR|G7|401k|401ks|US|UAE|TBD)\b/gi) || [])];
}

function translationValid(source: string, target: string) {
  const clean = target.replace(/\s+/g, " ").trim();
  if (!clean || !/[\u0370-\u03ff\u1f00-\u1fff]/.test(clean)) return false;
  if (JSON.stringify(numericTokens(source)) !== JSON.stringify(numericTokens(clean))) return false;
  const lowered = clean.toLowerCase();
  return requiredTokens(source).every(token => lowered.includes(token.toLowerCase()));
}

function parseModelResponse(raw: string, expected: Set<number>) {
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(clean) as { translations?: unknown };
  const output = new Map<number, string>();
  if (!Array.isArray(parsed.translations)) return output;
  for (const row of parsed.translations) {
    if (!row || typeof row !== "object") continue;
    const value = row as { index?: unknown; text?: unknown };
    const index = Number(value.index);
    const text = typeof value.text === "string" ? value.text.replace(/\s+/g, " ").trim() : "";
    if (Number.isInteger(index) && expected.has(index) && text && !output.has(index)) output.set(index, text);
  }
  return output;
}

async function translateBatch(rows: TranslationRow[], before: TranslationRow[], after: TranslationRow[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const expected = new Set(rows.map(row => row.index));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 5000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the senior Greek subtitle translator for GreekTube. Translate spoken English into natural, precise modern Greek for subtitles. The source is an automatic YouTube transcript and contains occasional recognition errors. When the intended term is clear from context, translate the intended spoken meaning rather than preserving an obvious ASR typo, but never invent a fact or silently fact-check the speaker. Preserve claims as claims, uncertainty as uncertainty, political viewpoints as viewpoints and questions as questions. Preserve every number and quantitative value exactly. Preserve technical acronyms such as DNA, RNA, ATP, AI, AOC, DSA, SPR, G7, 401k, US and UAE where they occur. Keep every requested cue mapped to its original index and do not merge, split, omit or reorder cues. Use concise readable Greek and avoid unnecessary filler words when they carry no meaning. Return JSON only in this exact form: {\"translations\":[{\"index\":0,\"text\":\"...\"}]}.",
          },
          {
            role: "user",
            content: JSON.stringify({
              videoContext: "A long-form interview discussing epigenetic reprogramming and longevity, AI in life-science discovery, American economic and retirement claims, healthcare, US-China foreign policy, Iran and the 2028 US presidential election.",
              precedingContext: before,
              requestedCues: rows,
              followingContext: after,
            }),
          },
        ],
      }),
    });
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after") || "unknown";
      throw new Error(`Groq 429 rate limit; retry-after=${retryAfter}`);
    }
    if (!response.ok) throw new Error(`Groq translation failed: ${response.status}`);
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content || "";
    return parseModelResponse(content, expected);
  } finally {
    clearTimeout(timeout);
  }
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
      const rows = english.slice(start, start + BATCH_SIZE).map((cue, offset) => ({ index: start + offset, text: cue.text }));
      const before = english.slice(Math.max(0, start - 6), start).map((cue, offset) => ({ index: Math.max(0, start - 6) + offset, text: cue.text }));
      const end = start + rows.length;
      const after = english.slice(end, Math.min(english.length, end + 6)).map((cue, offset) => ({ index: end + offset, text: cue.text }));
      const batch = await translateBatch(rows, before, after);
      for (const row of rows) {
        const text = batch.get(row.index) || "";
        if (!translationValid(row.text, text)) {
          throw new Error(`Translation integrity failed at cue ${row.index + 1}`);
        }
        translated.set(row.index, text);
      }
    }

    const greek = english.map((cue, index) => ({ ...cue, text: translated.get(index) as string }));
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
      translationMode: "manual-source-chatgpt",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (lockToken) await releaseProcessingLock(VIDEO_ID, lockToken).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

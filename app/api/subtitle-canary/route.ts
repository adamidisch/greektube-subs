import { NextResponse } from "next/server";
import { fetchSupadataTranscript } from "../supadata";
import { validateSubtitlePair, type SubtitleCue } from "../captions/subtitle-contract";

export const maxDuration = 60;

const CANARY_VIDEO = "D2RjneeG_xA";
const GROQ_MODEL = "openai/gpt-oss-120b";
const BATCH_SIZE = 24;

type TranslationRow = { index?: unknown; text?: unknown };

function cleanEnglish(cues: SubtitleCue[]) {
  return cues
    .map(cue => ({ start: Number(cue.start), duration: Number(cue.duration), text: cue.text.replace(/\s+/g, " ").trim() }))
    .filter(cue => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.duration) && cue.start >= 0 && cue.duration > 0);
}

function inversions(cues: SubtitleCue[]) {
  let count = 0;
  for (let index = 1; index < cues.length; index += 1) if (cues[index].start < cues[index - 1].start) count += 1;
  return count;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseTranslations(value: unknown, expected: Set<number>) {
  if (!value || typeof value !== "object") return new Map<number, string>();
  const rows = (value as { translations?: unknown }).translations;
  if (!Array.isArray(rows)) return new Map<number, string>();
  const result = new Map<number, string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as TranslationRow;
    const index = Number(row.index);
    const text = typeof row.text === "string" ? row.text.replace(/\s+/g, " ").trim() : "";
    if (!Number.isInteger(index) || !expected.has(index) || result.has(index) || !text) continue;
    result.set(index, text);
  }
  return result;
}

async function translateBatch(english: SubtitleCue[], start: number) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const batch = english.slice(start, start + BATCH_SIZE);
  const expected = new Set(batch.map((_, offset) => start + offset));
  const beforeStart = Math.max(0, start - 8);
  const before = english.slice(beforeStart, start).map((cue, offset) => ({ index: beforeStart + offset, text: cue.text }));
  const afterStart = start + batch.length;
  const after = english.slice(afterStart, afterStart + 8).map((cue, offset) => ({ index: afterStart + offset, text: cue.text }));
  const requested = batch.map((cue, offset) => ({ index: start + offset, text: cue.text }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 3600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Translate English timed subtitle cues into natural, precise Greek. The English source is immutable and speaker-faithful. Context is only for disambiguation. Never add, remove or move facts between cues. Preserve negation, uncertainty, attribution, chronology, numbers, doses, units, names, acronyms and technical meaning. Return every requested index exactly once as JSON: {\"translations\":[{\"index\":N,\"text\":\"Greek\"}]}. Do not return any other text." },
          { role: "user", content: JSON.stringify({ contextBefore: before, requestedCues: requested, contextAfter: after }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    const translated = parseTranslations(parsed, expected);
    if (translated.size !== batch.length) throw new Error(`translation-count:${translated.size}:${batch.length}`);
    return batch.map((cue, offset) => ({ ...cue, text: translated.get(start + offset) || "" }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "preview-only" }, { status: 403 });
  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId")?.trim() || CANARY_VIDEO;
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return NextResponse.json({ error: "invalid-video-id" }, { status: 400 });
  const startedAt = Date.now();
  try {
    const acquired = await fetchSupadataTranscript(videoId);
    const english = cleanEnglish(acquired.cues);
    const timingInversions = inversions(english);
    if (!english.length) throw new Error("empty-english-source");
    if (timingInversions) throw new Error(`english-timing-inversions:${timingInversions}`);
    const batches = Array.from({ length: Math.ceil(english.length / BATCH_SIZE) }, (_, index) => index * BATCH_SIZE);
    const translatedBatches = await Promise.all(batches.map(start => translateBatch(english, start)));
    const greek = translatedBatches.flat();
    const validation = validateSubtitlePair(english, greek);
    const sourceHash = await sha256(english.map(cue => cue.text));
    const timestampHash = await sha256(english.map(cue => [cue.start, cue.duration]));
    const result = {
      dryRun: true,
      writesPerformed: false,
      videoId,
      source: acquired.source || "unknown",
      cueCount: english.length,
      timingInversions,
      sourceHash,
      timestampHash,
      validation,
      elapsedMs: Date.now() - startedAt,
      sample: english.slice(0, 8).map((cue, index) => ({ index, start: cue.start, duration: cue.duration, english: cue.text, greek: greek[index]?.text || "" })),
    };
    console.info("[subtitle-canary-result]", JSON.stringify({ ...result, sample: undefined }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (error) {
    const result = { dryRun: true, writesPerformed: false, videoId, error: error instanceof Error ? error.message : "canary-failed", elapsedMs: Date.now() - startedAt };
    console.error("[subtitle-canary-error]", JSON.stringify(result));
    return NextResponse.json(result, { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
}

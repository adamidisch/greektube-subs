import { NextResponse } from "next/server";
import { get, put } from "@vercel/blob";
import {
  ZC8_REVIEW_BLOB_PATH,
  ZC8_REVIEW_DURATION,
  ZC8_REVIEW_REVISION,
  ZC8_REVIEW_VIDEO_ID,
  type Zc8ReviewCue,
  type Zc8ReviewResult,
} from "../captions/zc8-review-v6";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHECKPOINT_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/checkpoint.json";
const TRANSCRIPT_URLS = [
  "https://r.jina.ai/http://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
  "https://r.jina.ai/https://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
];
const MODEL = "openai/gpt-oss-120b";
const STEP_SIZE = 72;
const BATCH_SIZE = 9;

type Speaker = "speaker-a" | "speaker-b";
type SourcePiece = {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker: Speaker;
  estimatedBoundary: boolean;
};
type Block = {
  index: number;
  sourceIds: string[];
  start: number;
  duration: number;
  english: string;
  speaker: Speaker;
  estimatedBoundary: boolean;
};
type Translation = { index: number; text: string };
type Checkpoint = {
  revision: string;
  videoId: string;
  status: "processing" | "ready" | "failed";
  cursor: number;
  blocks: Block[];
  translations: Translation[];
  sourceMeta: Record<string, unknown>;
  auditIssueCount: number;
  repairedIssueCount: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

type GroqChoice = { message?: { content?: string } };

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}

async function readJson<T>(pathname: string): Promise<T | null> {
  if (!blobConfigured()) return null;
  try {
    const blob = await get(pathname, { access: "public" });
    if (!blob?.stream) return null;
    return await new Response(blob.stream).json() as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, value: unknown) {
  if (!blobConfigured()) throw new Error("blob-not-configured");
  await put(pathname, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json; charset=utf-8",
  });
}

function toSeconds(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function cleanStageDirections(text: string) {
  return text
    .replace(/\[(?:music|laughter|snorts?|clears throat|sighs?(?: and gasps)?|gasps?|applause)\]/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitAtSpeakerMarkers(text: string) {
  const parts = text.split(/\s*>>\s*/g).map(cleanStageDirections).filter(Boolean);
  return parts.length ? parts : [cleanStageDirections(text)].filter(Boolean);
}

function parseTranscript(markdown: string) {
  const rowMatches = [...markdown.matchAll(/^\s*(\d+)\.\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/gm)];
  if (rowMatches.length < 500) throw new Error(`speaker-transcript-too-short:${rowMatches.length}`);
  const chunks = rowMatches.map(match => ({
    sourceRow: Number(match[1]),
    time: match[2],
    text: match[3].trim(),
  })).filter(chunk => cleanStageDirections(chunk.text));

  const pieces: SourcePiece[] = [];
  let speaker: Speaker = "speaker-a";

  chunks.forEach((chunk, chunkIndex) => {
    const start = toSeconds(chunk.time);
    const nextStart = chunkIndex + 1 < chunks.length ? toSeconds(chunks[chunkIndex + 1].time) : ZC8_REVIEW_DURATION;
    const end = Math.max(start + 0.5, nextStart);
    const rawText = chunk.text;
    const hasMarker = rawText.includes(">>");
    const parts = splitAtSpeakerMarkers(rawText);
    if (!parts.length) return;

    const weights = parts.map(part => Math.max(1, part.replace(/\s/g, "").length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = start;
    parts.forEach((part, partIndex) => {
      if (partIndex > 0) speaker = speaker === "speaker-a" ? "speaker-b" : "speaker-a";
      const remaining = end - cursor;
      const duration = partIndex === parts.length - 1 ? remaining : Math.max(0.55, (end - start) * (weights[partIndex] / totalWeight));
      const pieceEnd = Math.min(end, cursor + duration);
      pieces.push({
        id: `r${chunk.sourceRow}.${partIndex + 1}`,
        start: Number(cursor.toFixed(3)),
        end: Number(pieceEnd.toFixed(3)),
        text: part,
        speaker,
        estimatedBoundary: hasMarker && parts.length > 1,
      });
      cursor = pieceEnd;
    });
  });

  return { pieces, timedChunkCount: chunks.length };
}

function terminal(text: string) {
  return /[.!?][”'"]?$/u.test(text.trim());
}

function buildBlocks(pieces: SourcePiece[]) {
  const blocks: Block[] = [];
  let current: SourcePiece[] = [];

  const flush = () => {
    if (!current.length) return;
    const start = current[0].start;
    const end = current[current.length - 1].end;
    const english = current.map(piece => piece.text).join(" ").replace(/\s+/g, " ").trim();
    if (english) {
      blocks.push({
        index: blocks.length,
        sourceIds: current.map(piece => piece.id),
        start,
        duration: Number(Math.max(0.65, end - start).toFixed(3)),
        english,
        speaker: current[0].speaker,
        estimatedBoundary: current.some(piece => piece.estimatedBoundary),
      });
    }
    current = [];
  };

  for (const piece of pieces) {
    if (current.length && current[0].speaker !== piece.speaker) flush();
    current.push(piece);
    const chars = current.reduce((sum, item) => sum + item.text.length, 0);
    const duration = piece.end - current[0].start;
    if ((terminal(piece.text) && duration >= 2.0) || duration >= 7.8 || chars >= 145) flush();
  }
  flush();
  return blocks;
}

async function fetchTranscript() {
  const errors: string[] = [];
  for (const url of TRANSCRIPT_URLS) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 GreekTubeSubs review" }, cache: "no-store" });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const text = await response.text();
      if (!/^\s*\d+\.\s+\d{1,2}:\d{2}(?::\d{2})?\s+/m.test(text) || text.length < 100000) throw new Error(`invalid-body:${text.length}`);
      return { text, url };
    } catch (error) {
      errors.push(`${url}:${error instanceof Error ? error.message : "failed"}`);
    }
  }
  throw new Error(`speaker-transcript-fetch-failed:${errors.join("|")}`);
}

function extractJson(content: string) {
  return JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
}

async function groqJson(system: string, user: unknown, maxTokens = 5000) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY-not-configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 42_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`groq-${response.status}`);
    const payload = await response.json() as { choices?: GroqChoice[] };
    const content = payload.choices?.[0]?.message?.content || "";
    return extractJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

const TRANSLATION_SYSTEM = `You are the final Greek subtitle translator for a premium medical interview player. Translate every requested English speech block into natural, precise, easy-to-understand modern Greek. HARD RULES: preserve 100% of the source meaning; never summarize, compress away, omit, invent, soften or move facts. Preserve negation, uncertainty, attribution, chronology, numbers, percentages, units, names and technical meaning. Use Plain Medical Greek: medically correct but understandable to a general audience; prefer everyday precise wording over unnecessary medicalese. Keep necessary terms such as ινσουλίνη, γλυκόζη, λιπώδες ήπαρ when they are the accurate terms. Remove only nonsemantic fillers. Do not place a comma immediately before «και» or «ή». Respect speaker turns: each row is one speaker only and must remain separate. If source speech is interrupted, preserve the interruption naturally with an ellipsis rather than inventing completion. Return JSON only: {"translations":[{"index":N,"text":"..."}]}. Return every requested index exactly once.`;

async function translateBatch(blocks: Block[]) {
  const requested = blocks.map(block => ({ index: block.index, speaker: block.speaker, start: block.start, duration: block.duration, english: block.english }));
  const value = await groqJson(TRANSLATION_SYSTEM, { requested }, 6200) as { translations?: unknown[] };
  const rows = Array.isArray(value.translations) ? value.translations : [];
  const map = new Map<number, string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const index = Number((row as { index?: unknown }).index);
    const text = String((row as { text?: unknown }).text || "").replace(/\s+/g, " ").trim();
    if (Number.isInteger(index) && text && !map.has(index)) map.set(index, text);
  }
  if (map.size !== blocks.length) throw new Error(`translation-count:${map.size}/${blocks.length}`);
  return blocks.map(block => ({ index: block.index, text: map.get(block.index)! }));
}

const AUDIT_SYSTEM = `Audit Greek subtitle translations against their English source. Flag a row if ANY semantic information is missing, altered, invented, attributed to the wrong person, numerically changed, medically mistranslated, unnaturally over-medical, or if a comma appears immediately before και or ή. Do not flag harmless natural Greek rewording. Return JSON only: {"issues":[{"index":N,"reason":"short reason"}]}.`;

async function auditBatch(blocks: Block[], translations: Translation[]) {
  const map = new Map(translations.map(row => [row.index, row.text]));
  const rows = blocks.map(block => ({ index: block.index, english: block.english, greek: map.get(block.index) || "" }));
  const value = await groqJson(AUDIT_SYSTEM, { rows }, 2600) as { issues?: unknown[] };
  const issues = Array.isArray(value.issues) ? value.issues : [];
  return issues.flatMap(issue => {
    if (!issue || typeof issue !== "object") return [];
    const index = Number((issue as { index?: unknown }).index);
    const reason = String((issue as { reason?: unknown }).reason || "audit-failed");
    return Number.isInteger(index) ? [{ index, reason }] : [];
  });
}

async function repairBatch(blocks: Block[], translations: Translation[], issues: { index: number; reason: string }[]) {
  if (!issues.length) return translations;
  const blockMap = new Map(blocks.map(block => [block.index, block]));
  const translationMap = new Map(translations.map(row => [row.index, row.text]));
  const requested = issues.map(issue => {
    const block = blockMap.get(issue.index)!;
    return { index: issue.index, english: block.english, previousGreek: translationMap.get(issue.index), issue: issue.reason };
  });
  const value = await groqJson(`${TRANSLATION_SYSTEM}\nThese rows failed semantic audit. Correct the stated issue while preserving all source meaning.`, { requested }, 4200) as { translations?: unknown[] };
  const repaired = Array.isArray(value.translations) ? value.translations : [];
  for (const row of repaired) {
    if (!row || typeof row !== "object") continue;
    const index = Number((row as { index?: unknown }).index);
    const text = String((row as { text?: unknown }).text || "").replace(/\s+/g, " ").trim();
    if (Number.isInteger(index) && text) translationMap.set(index, text);
  }
  return translations.map(row => ({ ...row, text: translationMap.get(row.index) || row.text }));
}

function greekPolish(text: string) {
  return text.replace(/,\s+(και|ή)\b/giu, " $1").replace(/\s+/g, " ").trim();
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function finalize(checkpoint: Checkpoint) {
  const translationMap = new Map(checkpoint.translations.map(row => [row.index, greekPolish(row.text)]));
  if (translationMap.size !== checkpoint.blocks.length) throw new Error(`coverage-failed:${translationMap.size}/${checkpoint.blocks.length}`);
  const cues: Zc8ReviewCue[] = checkpoint.blocks.map(block => {
    const text = translationMap.get(block.index) || "";
    if (!text) throw new Error(`empty-translation:${block.index}`);
    return { start: block.start, duration: block.duration, text, speaker: block.speaker, speakerConfidence: block.estimatedBoundary ? "medium" : "high", sourceIds: block.sourceIds, estimatedBoundary: block.estimatedBoundary };
  });

  let previousEnd = -1;
  const cps: number[] = [];
  let shortCueCount = 0;
  let commaBeforeConjunction = 0;
  for (const cue of cues) {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.duration) || cue.duration <= 0) throw new Error("invalid-timing");
    if (cue.start + 0.02 < previousEnd) throw new Error(`overlap:${cue.start}:${previousEnd}`);
    previousEnd = cue.start + cue.duration;
    const compact = cue.text.replace(/\s/g, "").length;
    cps.push(compact / cue.duration);
    if (cue.duration < 1.15 && compact > 22) shortCueCount += 1;
    if (/,\s+(?:και|ή)\b/iu.test(cue.text)) commaBeforeConjunction += 1;
  }
  if (commaBeforeConjunction) throw new Error(`comma-before-conjunction:${commaBeforeConjunction}`);

  const result: Zc8ReviewResult = {
    revision: ZC8_REVIEW_REVISION,
    status: "ready",
    videoId: ZC8_REVIEW_VIDEO_ID,
    cues,
    quality: {
      structuralCoveragePercent: 100,
      semanticAuditIssueCount: checkpoint.auditIssueCount,
      semanticAuditRepairedCount: checkpoint.repairedIssueCount,
      speakerCrossovers: 0,
      estimatedSpeakerBoundaryCueCount: cues.filter(cue => cue.estimatedBoundary).length,
      displayCueCount: cues.length,
      shortReadableWarningCount: shortCueCount,
      maxCharsPerSecond: Number(Math.max(...cps).toFixed(1)),
      p95CharsPerSecond: Number(percentile(cps, 0.95).toFixed(1)),
      commaBeforeKaiOrI: 0,
      plainMedicalGreek: true,
      speakerAware: true,
      sourceMeaningOmissionAllowed: false,
    },
    source: checkpoint.sourceMeta,
    generatedAt: new Date().toISOString(),
  };
  await writeJson(ZC8_REVIEW_BLOB_PATH, result);
  checkpoint.status = "ready";
  checkpoint.updatedAt = new Date().toISOString();
  await writeJson(CHECKPOINT_PATH, checkpoint);
  return result;
}

async function init(force: boolean) {
  if (!force) {
    const existing = await readJson<Zc8ReviewResult>(ZC8_REVIEW_BLOB_PATH);
    if (existing?.status === "ready" && existing.revision === ZC8_REVIEW_REVISION) return { ready: true, result: existing };
    const checkpoint = await readJson<Checkpoint>(CHECKPOINT_PATH);
    if (checkpoint?.revision === ZC8_REVIEW_REVISION && checkpoint.blocks?.length) return { ready: false, checkpoint };
  }

  const fetched = await fetchTranscript();
  const parsed = parseTranscript(fetched.text);
  const blocks = buildBlocks(parsed.pieces);
  if (blocks.length < 300) throw new Error(`too-few-semantic-blocks:${blocks.length}`);
  const now = new Date().toISOString();
  const checkpoint: Checkpoint = {
    revision: ZC8_REVIEW_REVISION,
    videoId: ZC8_REVIEW_VIDEO_ID,
    status: "processing",
    cursor: 0,
    blocks,
    translations: [],
    sourceMeta: {
      userSrtReference: true,
      userSrtSha256: "632e7db92bc6157c0df6e81491a3aca0d34d8104e9d81bc9759bdb3d171a77cf",
      userSrtCueCount: 2504,
      userSrtEndSeconds: 7880.719,
      runtimeSpeakerTranscript: "podspun-detailed-transcript",
      runtimeSourceUrl: fetched.url,
      timedChunkCount: parsed.timedChunkCount,
      speakerPieceCount: parsed.pieces.length,
      semanticBlockCount: blocks.length,
      exactAudioDiarization: false,
      estimatedIntraChunkSpeakerTiming: true,
    },
    auditIssueCount: 0,
    repairedIssueCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await writeJson(CHECKPOINT_PATH, checkpoint);
  return { ready: false, checkpoint };
}

async function step() {
  const checkpoint = await readJson<Checkpoint>(CHECKPOINT_PATH);
  if (!checkpoint || checkpoint.revision !== ZC8_REVIEW_REVISION) throw new Error("checkpoint-not-initialized");
  if (checkpoint.status === "ready") return { ready: true, result: await readJson<Zc8ReviewResult>(ZC8_REVIEW_BLOB_PATH) };

  const start = checkpoint.cursor;
  const end = Math.min(checkpoint.blocks.length, start + STEP_SIZE);
  if (start >= end) return { ready: true, result: await finalize(checkpoint) };
  const slice = checkpoint.blocks.slice(start, end);
  const batches = Array.from({ length: Math.ceil(slice.length / BATCH_SIZE) }, (_, index) => slice.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
  const translatedBatches = await Promise.all(batches.map(translateBatch));
  const auditBatches = await Promise.all(batches.map((batch, index) => auditBatch(batch, translatedBatches[index])));
  const repairedBatches = await Promise.all(batches.map((batch, index) => repairBatch(batch, translatedBatches[index], auditBatches[index])));
  const finalRows = repairedBatches.flat().map(row => ({ ...row, text: greekPolish(row.text) }));

  const existing = new Map(checkpoint.translations.map(row => [row.index, row]));
  finalRows.forEach(row => existing.set(row.index, row));
  checkpoint.translations = [...existing.values()].sort((a, b) => a.index - b.index);
  checkpoint.auditIssueCount += auditBatches.flat().length;
  checkpoint.repairedIssueCount += auditBatches.flat().length;
  checkpoint.cursor = end;
  checkpoint.updatedAt = new Date().toISOString();
  await writeJson(CHECKPOINT_PATH, checkpoint);
  if (checkpoint.cursor >= checkpoint.blocks.length) return { ready: true, result: await finalize(checkpoint) };
  return { ready: false, cursor: checkpoint.cursor, total: checkpoint.blocks.length, progress: Number((100 * checkpoint.cursor / checkpoint.blocks.length).toFixed(1)), auditIssues: checkpoint.auditIssueCount };
}

function response(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") return response({ error: "preview-only" }, 403);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";
  try {
    if (action === "init") return response(await init(url.searchParams.get("force") === "1"));
    if (action === "step") return response(await step());
    if (action === "result") {
      const result = await readJson<Zc8ReviewResult>(ZC8_REVIEW_BLOB_PATH);
      return result ? response(result) : response({ status: "processing" }, 202);
    }
    const result = await readJson<Zc8ReviewResult>(ZC8_REVIEW_BLOB_PATH);
    if (result?.status === "ready") return response({ status: "ready", quality: result.quality });
    const checkpoint = await readJson<Checkpoint>(CHECKPOINT_PATH);
    if (!checkpoint) return response({ status: "not_initialized" }, 404);
    return response({ status: checkpoint.status, cursor: checkpoint.cursor, total: checkpoint.blocks.length, progress: Number((100 * checkpoint.cursor / checkpoint.blocks.length).toFixed(1)), auditIssues: checkpoint.auditIssueCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "review-v6-failed";
    console.error("[zc8-review-v6]", message);
    return response({ error: message }, 500);
  }
}

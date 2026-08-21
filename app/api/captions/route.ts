import { NextResponse } from "next/server";
import { canonicalNumberTokens, numberTokensMatch } from "./numeric-integrity";
import { GET as legacyGET, POST as legacyPOST } from "./legacy-route";
import {
  compactUnderstandingForPrompt,
  ensureTranslationUnderstanding,
  type TranslationUnderstanding,
} from "./translation-understanding";
import {
  TRANSCRIPT_VERSION,
  MAX_TRANSIENT_RETRIES,
  acquireProcessingLock,
  failTranscript,
  getTranscript,
  getTranscriptStatus,
  recordGroqProviderSuccess,
  recordGroqRateLimit,
  recordProviderRateLimitWait,
  recordRecoverableProcessingFailure,
  releaseProcessingLock,
  saveProcessingCheckpoint,
  updateProcessingProgress,
  type CachedCue,
} from "../shared-cache";

const GROQ_MODEL = "openai/gpt-oss-120b";
const TRANSLATION_BATCH = 12;
const LOCAL_CONTEXT = 8;
const AUTO_TRANSLATION_MODE = "auto-groq-contextual";

type TranslationRequestBody = {
  url?: unknown;
  force?: unknown;
  translationMode?: unknown;
};

type TranslationItem = { index: number; text: string };

class GroqTranslationError extends Error {
  constructor(message: string, readonly retryAfterSeconds = 8) {
    super(message);
    this.name = "GroqTranslationError";
  }
}

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

function baseStage(stage: string | null | undefined) {
  const value = stage || "source";
  return value.endsWith("_google") ? value.slice(0, -7) : value;
}

function clonePostRequest(request: Request, rawBody: string) {
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });
}

function autoHeaders(retryAfter: number | string) {
  return {
    "Retry-After": String(retryAfter),
    "X-GreekTube-Translation": "understanding-first",
    "X-GreekTube-Translation-Mode": AUTO_TRANSLATION_MODE,
  };
}

function processingStatusPayload(record: Awaited<ReturnType<typeof getTranscriptStatus>>) {
  if (!record) return { status: "processing", progress: 3, stage: "source", cursor: 0, totalCues: 0 };
  const stage = baseStage(record.rawEnglishCount && (record.processingStage || "source") === "source" ? "repair" : record.processingStage);
  const totalCues = stage === "repair" ? record.rawEnglishCount : stage === "source_el_finalize" ? record.greekCount : record.englishCount;
  const cursor = Math.max(0, Math.min(record.processingCursor || 0, totalCues));
  const completed = stage === "finalize" || stage === "source_el_finalize" ? totalCues : cursor;
  let progress = record.progress;
  if (stage === "repair" && totalCues) progress = 28 + 20 * (completed / totalCues);
  if (stage === "translate" && totalCues) progress = 48 + 42 * (completed / totalCues);
  return {
    status: "processing",
    progress: Math.round(progress * 10) / 10,
    videoId: record.videoId,
    stage,
    cursor,
    totalCues,
    currentCue: totalCues ? (stage === "finalize" ? totalCues : Math.min(totalCues, cursor + 1)) : 0,
    retryCount: record.retryCount,
    retryAfter: record.retryAfter || null,
    groqCooldownUntil: record.groqCooldownUntil || null,
    transcriptVersion: TRANSCRIPT_VERSION,
  };
}

function protectedTokens(text: string) {
  return [...new Set(text.match(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%))\b/g) || [])];
}

function translationIntegrityFailure(source: string, target: string) {
  const clean = target.replace(/\s+/g, " ").trim();
  if (!clean) return "empty-output";
  if (/\[\s*\d+\s*\]/.test(clean)) return "marker-artifact";
  if (!numberTokensMatch(source, clean)) {
    return `number-mismatch:${JSON.stringify(canonicalNumberTokens(source))}:${JSON.stringify(canonicalNumberTokens(clean))}`;
  }
  const compact = clean.toLowerCase().replace(/\s+/g, "");
  for (const token of protectedTokens(source)) {
    if (!compact.includes(token.toLowerCase().replace(/\s+/g, ""))) return `missing-protected-token:${token}`;
  }
  if (/[A-Za-z]/.test(source) && !/[\u0370-\u03ff\u1f00-\u1fff]/.test(clean)) return "non-greek-output";
  return null;
}

function localContext(english: CachedCue[], greek: CachedCue[], start: number, count: number) {
  const beforeStart = Math.max(0, start - LOCAL_CONTEXT);
  const end = Math.min(english.length, start + count);
  const afterEnd = Math.min(english.length, end + LOCAL_CONTEXT);
  return {
    precedingEnglish: english.slice(beforeStart, start).map((cue, offset) => ({ index: beforeStart + offset, text: cue.text })),
    precedingGreek: greek.slice(Math.max(0, greek.length - LOCAL_CONTEXT)).map((cue, offset) => ({
      index: Math.max(0, greek.length - LOCAL_CONTEXT) + offset,
      text: cue.text,
    })),
    followingEnglish: english.slice(end, afterEnd).map((cue, offset) => ({ index: end + offset, text: cue.text })),
  };
}

function parseTranslationResponse(value: unknown, expected: Set<number>) {
  if (!value || typeof value !== "object") return new Map<number, string>();
  const rows = (value as { translations?: unknown }).translations;
  if (!Array.isArray(rows)) return new Map<number, string>();
  const result = new Map<number, string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { index?: unknown; text?: unknown };
    const index = Number(item.index);
    const text = typeof item.text === "string" ? item.text.replace(/\s+/g, " ").trim() : "";
    if (!Number.isInteger(index) || !expected.has(index) || result.has(index) || !text) continue;
    result.set(index, text);
  }
  return result;
}

async function groqTranslate(
  items: TranslationItem[],
  understanding: TranslationUnderstanding,
  context: ReturnType<typeof localContext>,
  strict = false,
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqTranslationError("GROQ_API_KEY is required for understanding-first translation", 30);
  const expected = new Set(items.map(item => item.index));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: strict ? 900 : 3200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior professional English-to-Greek audiovisual translator. First use the global brief and nearby source context to understand what the speaker means, then translate the requested cues into natural, precise Greek. " +
              "Context is for disambiguation only: NEVER import a fact, word, negation, claim or certainty from a neighbouring cue into the current cue. Preserve who says or attributes a claim, uncertainty/hedging, negation, causality, chronology, technical meaning, irony and stance. " +
              "Never turn may/might/could into certainty, association into causation or a reported claim into the speaker's own conclusion. Preserve numbers, doses, units, acronyms, names and technical tokens exactly in meaning. " +
              "Translate the current cues as parts of one coherent discussion, not as isolated dictionary sentences, while keeping each output mapped to its original cue index for timing. " +
              "Return JSON only: {\"translations\":[{\"index\":N,\"text\":\"Greek translation\"}]}. Return every requested index exactly once and no other indexes.",
          },
          {
            role: "user",
            content: JSON.stringify({
              globalTranslationBrief: JSON.parse(compactUnderstandingForPrompt(understanding)),
              nearbyContext: context,
              requestedCues: items,
              strictRetry: strict,
            }),
          },
        ],
      }),
    });
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after"));
      throw new GroqTranslationError("Groq 429 contextual translation rate limit", Number.isFinite(retry) && retry > 0 ? retry : 30);
    }
    if (!response.ok) throw new GroqTranslationError(`Groq contextual translation ${response.status}`, response.status >= 500 ? 8 : 20);
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content || "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    } catch {
      throw new GroqTranslationError("Groq contextual translation returned invalid JSON");
    }
    return parseTranslationResponse(parsed, expected);
  } catch (error) {
    if (error instanceof GroqTranslationError) throw error;
    throw new GroqTranslationError(error instanceof Error ? error.message : "Contextual translation failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function translateContextualBatch(
  english: CachedCue[],
  greek: CachedCue[],
  start: number,
  understanding: TranslationUnderstanding,
) {
  const source = english.slice(start, start + TRANSLATION_BATCH);
  const items = source.map((cue, offset) => ({ index: start + offset, text: cue.text }));
  const context = localContext(english, greek, start, source.length);
  let result = await groqTranslate(items, understanding, context, false);

  const invalid = items.filter(item => {
    const candidate = result.get(item.index) || "";
    return translationIntegrityFailure(item.text, candidate) !== null;
  });

  // Retry only objectively invalid/missing cues. The same whole-video brief and
  // local passage are supplied so the retry remains semantic rather than literal.
  for (const item of invalid) {
    const single = await groqTranslate([item], understanding, context, true);
    const candidate = single.get(item.index) || "";
    const failure = translationIntegrityFailure(item.text, candidate);
    if (failure) throw new GroqTranslationError(`Contextual translation integrity failed at cue ${item.index}: ${failure}`);
    result.set(item.index, candidate);
  }

  const translated = items.map((item, offset) => {
    const text = result.get(item.index) || "";
    const failure = translationIntegrityFailure(item.text, text);
    if (failure) throw new GroqTranslationError(`Contextual translation integrity failed at cue ${item.index}: ${failure}`);
    const cue = source[offset];
    return { ...cue, text };
  });
  return translated;
}

export async function GET(request: Request) {
  return legacyGET(request);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let body: TranslationRequestBody;
  try {
    body = JSON.parse(rawBody) as TranslationRequestBody;
  } catch {
    return legacyPOST(clonePostRequest(request, rawBody));
  }

  // Source fetching, repair, Google-fast mode, forced resets and finalization
  // stay on the proven legacy state machine. We intercept only the semantic
  // translation stage after the complete repaired English transcript exists.
  if (body.force === true || body.translationMode === "google" || body.translationMode === "manual-pro" || typeof body.url !== "string") {
    return legacyPOST(clonePostRequest(request, rawBody));
  }
  const videoId = extractVideoId(body.url);
  if (!videoId) return legacyPOST(clonePostRequest(request, rawBody));

  let current = await getTranscript(videoId);
  if (!current || current.status !== "processing" || current.transcriptVersion !== TRANSCRIPT_VERSION || baseStage(current.processingStage) !== "translate") {
    return legacyPOST(clonePostRequest(request, rawBody));
  }

  const now = new Date().toISOString();
  if ((current.lockExpiresAt && current.lockExpiresAt > now) || (current.retryAfter && current.retryAfter > now)) {
    const status = await getTranscriptStatus(videoId);
    const retrySeconds = current.retryAfter
      ? Math.max(1, Math.ceil((new Date(current.retryAfter).getTime() - Date.now()) / 1000))
      : 1;
    return NextResponse.json(processingStatusPayload(status), { status: 202, headers: autoHeaders(retrySeconds) });
  }

  const token = crypto.randomUUID();
  const acquired = await acquireProcessingLock(videoId, token, false);
  if (!acquired) {
    const status = await getTranscriptStatus(videoId);
    return NextResponse.json(processingStatusPayload(status), { status: 202, headers: autoHeaders(1) });
  }

  let ownsLock = true;
  try {
    current = await getTranscript(videoId);
    if (!current || current.status !== "processing" || baseStage(current.processingStage) !== "translate") {
      await releaseProcessingLock(videoId, token);
      ownsLock = false;
      return legacyPOST(clonePostRequest(request, rawBody));
    }
    const english = current.englishTranscript as CachedCue[];
    const greek = current.greekTranscript as CachedCue[];
    const cursor = Math.max(0, Math.min(current.processingCursor || 0, english.length));
    if (!english.length) throw new GroqTranslationError("Repaired English transcript is empty", 15);

    const understanding = await ensureTranslationUnderstanding(
      videoId,
      TRANSCRIPT_VERSION,
      english,
      async () => {
        if (!await updateProcessingProgress(videoId, token, Math.max(48, current?.progress || 48))) {
          throw new GroqTranslationError("Processing lock was lost during global understanding", 5);
        }
      },
    );

    if (cursor >= english.length) {
      if (!await saveProcessingCheckpoint(videoId, token, { stage: "finalize", cursor: english.length, progress: 90 })) {
        throw new GroqTranslationError("Processing lock was lost before finalization transition", 5);
      }
    } else {
      const translated = await translateContextualBatch(english, greek, cursor, understanding);
      const nextGreek = [...greek, ...translated];
      const nextCursor = cursor + translated.length;
      const done = nextCursor >= english.length;
      const progress = done ? 90 : Math.round(48 + 42 * (nextCursor / english.length));
      if (!await recordGroqProviderSuccess(videoId, token)) throw new GroqTranslationError("Processing lock was lost before provider success", 5);
      if (!await saveProcessingCheckpoint(videoId, token, {
        stage: done ? "finalize" : "translate",
        cursor: nextCursor,
        progress,
        greekTranscript: nextGreek,
      })) throw new GroqTranslationError("Processing lock was lost before contextual checkpoint persisted", 5);
    }

    if (!await releaseProcessingLock(videoId, token)) throw new GroqTranslationError("Processing lock was lost before release", 5);
    ownsLock = false;
    const status = await getTranscriptStatus(videoId);
    return NextResponse.json(processingStatusPayload(status), {
      status: 202,
      headers: autoHeaders(1),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Understanding-first translation failed";
    const retryAfter = error instanceof GroqTranslationError ? error.retryAfterSeconds : /429/i.test(message) ? 30 : 8;
    const isRateLimit = /429/i.test(message);
    console.error("[captions:understanding-first-failed]", JSON.stringify({ videoId, message }));

    if (ownsLock) {
      if (isRateLimit) {
        await recordGroqRateLimit(videoId, token, retryAfter).catch(() => null);
        const retry = await recordProviderRateLimitWait(videoId, token, message, retryAfter).catch(() => null);
        ownsLock = false;
        const status = await getTranscriptStatus(videoId).catch(() => null);
        if (retry?.status === "processing") {
          return NextResponse.json({ ...processingStatusPayload(status), transientError: message }, {
            status: 202,
            headers: autoHeaders(retryAfter),
          });
        }
        return NextResponse.json({ error: message, providerRateLimit: true }, { status: 502, headers: autoHeaders(retryAfter) });
      }

      if ((current?.retryCount || 0) >= MAX_TRANSIENT_RETRIES - 1) {
        await failTranscript(videoId, token, message).catch(() => undefined);
        ownsLock = false;
        return NextResponse.json({ error: message, retryLimit: MAX_TRANSIENT_RETRIES }, { status: 502 });
      }
      const retry = await recordRecoverableProcessingFailure(videoId, token, message, retryAfter).catch(() => null);
      ownsLock = false;
      const status = await getTranscriptStatus(videoId).catch(() => null);
      if (retry?.status === "processing") {
        return NextResponse.json({ ...processingStatusPayload(status), transientError: message }, {
          status: 202,
          headers: autoHeaders(retryAfter),
        });
      }
    }
    return NextResponse.json({ error: message, retryLimit: MAX_TRANSIENT_RETRIES }, { status: 502 });
  }
}

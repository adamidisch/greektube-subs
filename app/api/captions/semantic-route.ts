import { NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "./legacy-route";
import {
  compactUnderstandingForPrompt,
  ensureTranslationUnderstanding,
  type TranslationUnderstanding,
} from "./translation-understanding";
import {
  authorApprovedSpans,
  buildSemanticSpans,
  reconstructSourceUnits,
  spanIndexForCursor,
  unitTranslationFailure,
  validateProfessionalSubtitleFile,
  type ReconstructedUnit,
  type SemanticSpan,
} from "./professional-pipeline";
import {
  TRANSCRIPT_VERSION,
  MAX_TRANSIENT_RETRIES,
  acquireProcessingLock,
  completeTranscript,
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
import { publishTranscript } from "../transcript-blob";

const GROQ_MODEL = "openai/gpt-oss-120b";
const SPAN_BATCH = 8;
const AUTO_TRANSLATION_MODE = "professional-semantic-v1";

type TranslationRequestBody = {
  url?: unknown;
  force?: unknown;
  translationMode?: unknown;
};

type UnitTranslationRow = { unitId: string; text: string };

type QaPayload = {
  status?: unknown;
  translations?: unknown;
  issues?: unknown;
};

class GroqTranslationError extends Error {
  constructor(message: string, readonly retryAfterSeconds = 8) {
    super(message);
    this.name = "GroqTranslationError";
  }
}

class ManualReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualReviewError";
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
  if (value.endsWith("_google")) return value.slice(0, -7);
  if (value.endsWith("_pro")) return value.slice(0, -4);
  return value;
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
    "X-GreekTube-Translation": "professional-semantic-spans",
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

function parseJsonObject(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new GroqTranslationError("Professional translator returned invalid JSON");
  return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
}

function expectedUnitIds(spans: SemanticSpan[]) {
  return new Set(spans.flatMap(span => span.units.map(unit => unit.id)));
}

function parseTranslations(value: unknown, expected: Set<string>) {
  if (!value || typeof value !== "object") return new Map<string, string>();
  const rows = (value as { translations?: unknown }).translations;
  if (!Array.isArray(rows)) return new Map<string, string>();
  const result = new Map<string, string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { unitId?: unknown; text?: unknown };
    const unitId = typeof item.unitId === "string" ? item.unitId : "";
    const text = typeof item.text === "string" ? item.text.replace(/\s+/g, " ").trim() : "";
    if (!unitId || !expected.has(unitId) || result.has(unitId) || !text) continue;
    result.set(unitId, text);
  }
  return result;
}

async function groqJson(system: string, user: unknown, maxTokens: number) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqTranslationError("GROQ_API_KEY is required for professional subtitle translation", 30);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 34_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
    });
    if (response.status === 429) {
      const retry = Number(response.headers.get("retry-after"));
      throw new GroqTranslationError("Groq 429 professional subtitle rate limit", Number.isFinite(retry) && retry > 0 ? retry : 30);
    }
    if (!response.ok) throw new GroqTranslationError(`Groq professional subtitle ${response.status}`, response.status >= 500 ? 8 : 20);
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    return parseJsonObject(payload.choices?.[0]?.message?.content || "");
  } catch (error) {
    if (error instanceof GroqTranslationError) throw error;
    throw new GroqTranslationError(error instanceof Error ? error.message : "Professional subtitle provider failed");
  } finally {
    clearTimeout(timeout);
  }
}

function sourceContext(spans: SemanticSpan[], start: number, count: number) {
  const before = spans[Math.max(0, start - 1)] || null;
  const after = spans[Math.min(spans.length - 1, start + count)] || null;
  return {
    precedingSpan: before && start > 0 ? before : null,
    followingSpan: after && start + count < spans.length ? after : null,
  };
}

async function translateSpans(
  spans: SemanticSpan[],
  allSpans: SemanticSpan[],
  batchStart: number,
  understanding: TranslationUnderstanding,
) {
  const expected = expectedUnitIds(spans);
  const context = sourceContext(allSpans, batchStart, spans.length);
  const result = await groqJson(
    "You are the GreekTube Professional Subtitle Translator. Translate reconstructed English discourse into concise, natural, professional Greek subtitles. " +
      "The source units are NOT isolated dictionary cues: resolve short answers, pronouns and elliptical speech from the semantic span and read-only neighbouring context. " +
      "Preserve meaning, questions and answers, negation, uncertainty, attribution, causality, chronology, numbers, units, names, acronyms and technical meaning. " +
      "Never invent facts and never turn hedging into certainty. Avoid English-shaped Greek. Keep each output mapped to the supplied reconstructed unitId so timing can be rebuilt later. " +
      "For a question such as 'Do you think ...?' followed by 'I do.', translate the answer by meaning, e.g. 'Ναι, το πιστεύω.', never literally as 'Το κάνω.'. " +
      "Return JSON only: {\"translations\":[{\"unitId\":\"u...\",\"text\":\"...\"}]}. Return every requested unit exactly once.",
    {
      globalTranslationBrief: JSON.parse(compactUnderstandingForPrompt(understanding)),
      lockedGlossary: understanding.glossary,
      readOnlyContext: context,
      semanticSpans: spans,
    },
    4200,
  );
  const translations = parseTranslations(result, expected);
  if (translations.size !== expected.size) throw new GroqTranslationError(`Professional translator returned ${translations.size}/${expected.size} reconstructed units`);
  return translations;
}

function precedingUnitFor(units: ReconstructedUnit[], unit: ReconstructedUnit) {
  const index = units.findIndex(candidate => candidate.id === unit.id);
  return index > 0 ? units[index - 1] : null;
}

function validateUnitTranslations(units: ReconstructedUnit[], spans: SemanticSpan[], translations: Map<string, string>) {
  for (const span of spans) {
    for (const unit of span.units) {
      const failure = unitTranslationFailure(unit, translations.get(unit.id) || "", precedingUnitFor(units, unit));
      if (failure) throw new GroqTranslationError(`Professional translation integrity failed at ${unit.id}: ${failure}`);
    }
  }
}

async function bilingualQa(
  spans: SemanticSpan[],
  allUnits: ReconstructedUnit[],
  translations: Map<string, string>,
  understanding: TranslationUnderstanding,
) {
  const expected = expectedUnitIds(spans);
  const proposed: UnitTranslationRow[] = [...translations].map(([unitId, text]) => ({ unitId, text }));
  const result = await groqJson(
    "You are the independent bilingual EN↔EL quality reviewer for professional audiovisual subtitles. Review the proposed Greek against the reconstructed English and its semantic dependencies. " +
      "Check meaning, question/answer logic, elliptical short answers, negation, hedging, attribution, pronouns, causality, chronology, numbers, units, names, acronyms, terminology and natural Greek. " +
      "Repair any fixable problem directly. If all issues are resolved set status='approved'. Use status='manual_review_required' only when the source itself is genuinely ambiguous and cannot be resolved safely from context. " +
      "Never approve literal machine Greek. Return JSON only: {\"status\":\"approved\",\"translations\":[{\"unitId\":\"...\",\"text\":\"...\"}],\"issues\":[]}.",
    {
      globalTranslationBrief: JSON.parse(compactUnderstandingForPrompt(understanding)),
      semanticSpans: spans,
      proposedGreek: proposed,
    },
    4200,
  ) as QaPayload;
  const status = typeof result.status === "string" ? result.status : "";
  const repaired = parseTranslations(result, expected);
  const issues = Array.isArray(result.issues) ? result.issues.map(value => String(value)).slice(0, 8) : [];
  if (status !== "approved") throw new ManualReviewError(`professional-qa:${status || "invalid"}${issues.length ? `:${issues.join(" | ")}` : ""}`);
  if (repaired.size !== expected.size) throw new GroqTranslationError(`Professional QA returned ${repaired.size}/${expected.size} units`);
  validateUnitTranslations(allUnits, spans, repaired);
  return repaired;
}

function keyPoints(cues: CachedCue[]) {
  if (!cues.length) return [] as string[];
  const step = Math.max(1, Math.floor(cues.length / 8));
  return cues.filter((_, index) => index % step === 0)
    .map(cue => cue.text.replace(/\s+/g, " ").trim())
    .filter((text, index, all) => text.length > 18 && all.indexOf(text) === index)
    .slice(0, 8);
}

function readyPayload(record: Awaited<ReturnType<typeof getTranscript>>, cached: boolean) {
  if (!record) return null;
  return {
    status: "ready",
    progress: 100,
    videoId: record.videoId,
    title: record.title,
    channel: record.channel,
    duration: record.duration,
    sourceLanguage: record.originalLanguage,
    cues: record.greekTranscript,
    englishCues: record.englishTranscript,
    topics: record.topics,
    keyPoints: record.keyPoints,
    transcriptVersion: record.transcriptVersion,
    translationMode: AUTO_TRANSLATION_MODE,
    translationMethod: "greektube_professional_semantic_v1",
    cached,
  };
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

  if (body.force === true || body.translationMode === "google" || body.translationMode === "manual-pro" || typeof body.url !== "string") {
    return legacyPOST(clonePostRequest(request, rawBody));
  }
  const videoId = extractVideoId(body.url);
  if (!videoId) return legacyPOST(clonePostRequest(request, rawBody));

  let current = await getTranscript(videoId);
  const initialStage = baseStage(current?.processingStage);
  if (!current || current.status !== "processing" || current.transcriptVersion !== TRANSCRIPT_VERSION || !["translate", "finalize"].includes(initialStage)) {
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
    if (!current || current.status !== "processing") throw new GroqTranslationError("Professional processing checkpoint missing", 5);
    const stage = baseStage(current.processingStage);
    if (!["translate", "finalize"].includes(stage)) {
      await releaseProcessingLock(videoId, token);
      ownsLock = false;
      return legacyPOST(clonePostRequest(request, rawBody));
    }

    const english = current.englishTranscript as CachedCue[];
    if (!english.length) throw new GroqTranslationError("Repaired English transcript is empty", 15);
    const units = reconstructSourceUnits(english);
    const spans = buildSemanticSpans(units);
    if (!units.length || !spans.length) throw new GroqTranslationError("Source reconstruction produced no semantic spans", 15);

    const understanding = await ensureTranslationUnderstanding(
      videoId,
      TRANSCRIPT_VERSION,
      english,
      async () => {
        if (!await updateProcessingProgress(videoId, token, Math.max(48, current?.progress || 48))) {
          throw new GroqTranslationError("Processing lock was lost during whole-video understanding", 5);
        }
      },
    );

    if (stage === "finalize") {
      const greek = current.greekTranscript as CachedCue[];
      const issues = validateProfessionalSubtitleFile(greek);
      if (issues.length) throw new ManualReviewError(`professional-final-qc:${issues.slice(0, 12).join(",")}`);
      if (!greek.length) throw new ManualReviewError("professional-final-qc:empty-greek-transcript");
      const points = keyPoints(greek);
      const updatedAt = new Date().toISOString();
      if (!await completeTranscript({
        ...current,
        greekTranscript: greek,
        timestamps: greek.map(cue => ({ start: cue.start, duration: cue.duration })),
        keyPoints: points,
        topics: current.topics.length ? current.topics : [understanding.mainTopic].filter(Boolean),
        status: "ready",
        progress: 100,
        transcriptVersion: TRANSCRIPT_VERSION,
        updatedAt,
      }, token)) throw new GroqTranslationError("Processing lock was lost before professional final publish", 5);
      ownsLock = false;
      const ready = await getTranscript(videoId);
      const payload = readyPayload(ready, false);
      if (!payload) throw new GroqTranslationError("Professional ready transcript unavailable", 5);
      await publishTranscript(videoId, TRANSCRIPT_VERSION, payload);
      return NextResponse.json(payload, { headers: { ...autoHeaders(1), "Cache-Control": "no-store" } });
    }

    const cursor = Math.max(0, Math.min(current.processingCursor || 0, english.length));
    if (cursor >= english.length) {
      if (!await saveProcessingCheckpoint(videoId, token, { stage: "finalize_pro", cursor: english.length, progress: 90 })) {
        throw new GroqTranslationError("Processing lock was lost before professional finalization transition", 5);
      }
    } else {
      const spanStart = spanIndexForCursor(spans, cursor);
      const batch = spans.slice(spanStart, spanStart + SPAN_BATCH);
      if (!batch.length) throw new GroqTranslationError(`No semantic span found for source cursor ${cursor}`, 5);
      const proposed = await translateSpans(batch, spans, spanStart, understanding);
      validateUnitTranslations(units, batch, proposed);
      const approved = await bilingualQa(batch, units, proposed, understanding);
      const previousGreek = current.greekTranscript as CachedCue[];
      const previousEnd = previousGreek.length ? previousGreek[previousGreek.length - 1].start + previousGreek[previousGreek.length - 1].duration : 0;
      const authored = authorApprovedSpans(batch, approved, previousEnd);
      const candidateGreek = [...previousGreek, ...authored];
      const fileIssues = validateProfessionalSubtitleFile(candidateGreek);
      if (fileIssues.length) throw new ManualReviewError(`professional-subtitle-qc:${fileIssues.slice(0, 12).join(",")}`);

      const nextCursor = batch[batch.length - 1].sourceEndIndex + 1;
      const done = nextCursor >= english.length;
      const progress = done ? 90 : Math.round(48 + 42 * (nextCursor / english.length));
      if (!await recordGroqProviderSuccess(videoId, token)) throw new GroqTranslationError("Processing lock was lost before provider success", 5);
      if (!await saveProcessingCheckpoint(videoId, token, {
        stage: done ? "finalize_pro" : "translate_pro",
        cursor: nextCursor,
        progress,
        greekTranscript: candidateGreek,
      })) throw new GroqTranslationError("Processing lock was lost before professional semantic checkpoint persisted", 5);
    }

    if (!await releaseProcessingLock(videoId, token)) throw new GroqTranslationError("Processing lock was lost before release", 5);
    ownsLock = false;
    const status = await getTranscriptStatus(videoId);
    return NextResponse.json(processingStatusPayload(status), {
      status: 202,
      headers: autoHeaders(1),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Professional subtitle translation failed";
    const manualReview = error instanceof ManualReviewError;
    const retryAfter = error instanceof GroqTranslationError ? error.retryAfterSeconds : /429/i.test(message) ? 30 : 8;
    const isRateLimit = /429/i.test(message);
    console.error("[captions:professional-v1-failed]", JSON.stringify({ videoId, message, manualReview }));

    if (ownsLock && manualReview) {
      await failTranscript(videoId, token, `manual_review_required:${message}`).catch(() => undefined);
      ownsLock = false;
      return NextResponse.json({ error: message, status: "manual_review_required" }, { status: 409, headers: autoHeaders(60) });
    }

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

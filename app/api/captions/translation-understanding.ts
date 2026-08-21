import { createHash } from "crypto";
import { get, put } from "@vercel/blob";

export type UnderstandingCue = { start: number; duration: number; text: string };

export type TranslationGlossaryEntry = {
  source: string;
  greek: string;
  note?: string;
};

export type TranslationUnderstanding = {
  videoId: string;
  transcriptVersion: number;
  sourceHash: string;
  cueCount: number;
  mainTopic: string;
  purpose: string;
  discussion: string[];
  claimsAndPositions: string[];
  glossary: TranslationGlossaryEntry[];
  ambiguities: string[];
  toneAndStance: string[];
  fidelityRules: string[];
  generatedAt: string;
};

type SegmentUnderstanding = {
  summary: string;
  points: string[];
  terms: TranslationGlossaryEntry[];
  ambiguities: string[];
  tone: string[];
};

const MODEL = "openai/gpt-oss-120b";
const DIRECT_MAX_CHARS = 260_000;
const SEGMENT_MAX_CHARS = 40_000;
const memory = new Map<string, TranslationUnderstanding>();

function configured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

function pathname(videoId: string, transcriptVersion: number) {
  return `transcripts/v${transcriptVersion}/context/${videoId}.json`;
}

function key(videoId: string, transcriptVersion: number) {
  return `${transcriptVersion}:${videoId}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stringList(value: unknown, max = 40) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map(normalizeText).filter(Boolean).slice(0, max);
}

function glossaryList(value: unknown) {
  if (!Array.isArray(value)) return [] as TranslationGlossaryEntry[];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const source = normalizeText(row.source);
    const greek = normalizeText(row.greek);
    const note = normalizeText(row.note);
    return source && greek ? [{ source, greek, ...(note ? { note } : {}) }] : [];
  }).slice(0, 80);
}

function validUnderstanding(
  value: unknown,
  videoId: string,
  transcriptVersion: number,
  sourceHash: string,
  cueCount: number,
): value is TranslationUnderstanding {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<TranslationUnderstanding>;
  return record.videoId === videoId &&
    record.transcriptVersion === transcriptVersion &&
    record.sourceHash === sourceHash &&
    record.cueCount === cueCount &&
    typeof record.mainTopic === "string" &&
    typeof record.purpose === "string" &&
    Array.isArray(record.discussion) &&
    Array.isArray(record.claimsAndPositions) &&
    Array.isArray(record.glossary) &&
    Array.isArray(record.ambiguities) &&
    Array.isArray(record.toneAndStance) &&
    Array.isArray(record.fidelityRules) &&
    typeof record.generatedAt === "string";
}

function transcriptHash(cues: UnderstandingCue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) {
    hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${normalizeText(cue.text)}\n`);
  }
  return hash.digest("hex");
}

async function readJson(path: string) {
  const blob = await get(path, { access: "public" });
  if (!blob?.stream) return null;
  return await new Response(blob.stream).json() as unknown;
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Understanding response was not JSON");
  return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
}

async function groqJson(system: string, user: string, maxTokens: number) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is required for understanding-first translation");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 38_000);
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
          { role: "user", content: user },
        ],
      }),
    });
    if (response.status === 429) throw new Error(`Groq 429 understanding rate limit; retry-after=${response.headers.get("retry-after") || "30"}`);
    if (!response.ok) throw new Error(`Groq understanding ${response.status}`);
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    return parseJsonObject(payload.choices?.[0]?.message?.content || "");
  } finally {
    clearTimeout(timeout);
  }
}

function timestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function transcriptForPrompt(cues: UnderstandingCue[]) {
  return cues.map((cue, index) => `[[${index} @ ${timestamp(cue.start)}]] ${normalizeText(cue.text)}`).join("\n");
}

function segmentTranscript(fullTranscript: string) {
  const lines = fullTranscript.split("\n");
  const segments: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = `${line}\n`;
    if (current && current.length + next.length > SEGMENT_MAX_CHARS) {
      segments.push(current);
      current = "";
    }
    current += next;
  }
  if (current) segments.push(current);
  return segments;
}

function normalizeSegment(value: Record<string, unknown>): SegmentUnderstanding {
  return {
    summary: normalizeText(value.summary),
    points: stringList(value.points, 24),
    terms: glossaryList(value.terms),
    ambiguities: stringList(value.ambiguities, 20),
    tone: stringList(value.tone, 12),
  };
}

function buildUnderstanding(
  videoId: string,
  transcriptVersion: number,
  sourceHash: string,
  cueCount: number,
  result: Record<string, unknown>,
) {
  const defaultRules = [
    "Preserve uncertainty, hedging and degree of confidence exactly.",
    "Preserve negation, agency, causality and who is attributing each claim.",
    "Do not turn association into causation or a possibility into a fact.",
    "Use context to disambiguate meaning, never to add information absent from the current source cue.",
    "Keep numbers, doses, units, names, acronyms and technical tokens faithful to the source.",
  ];
  return {
    videoId,
    transcriptVersion,
    sourceHash,
    cueCount,
    mainTopic: normalizeText(result.mainTopic),
    purpose: normalizeText(result.purpose),
    discussion: stringList(result.discussion, 32),
    claimsAndPositions: stringList(result.claimsAndPositions, 40),
    glossary: glossaryList(result.glossary),
    ambiguities: stringList(result.ambiguities, 32),
    toneAndStance: stringList(result.toneAndStance, 24),
    fidelityRules: [...new Set([...stringList(result.fidelityRules, 20), ...defaultRules])],
    generatedAt: new Date().toISOString(),
  } satisfies TranslationUnderstanding;
}

const GLOBAL_SYSTEM =
  "You are the senior source analyst for a professional English-to-Greek subtitle translator. " +
  "Read and understand the discussion BEFORE translation. Identify the real topic, purpose, thread of discussion, arguments/positions, terminology, references, tone, irony, uncertainty, negation and causality. " +
  "Never invent a speaker identity, fact or certainty that is not supported by the transcript. Preserve distinctions such as may/might/could versus certainty, association versus causation, hypothesis versus established claim and a speaker reporting a claim versus endorsing it. " +
  "This is analysis only: do not translate subtitle lines. Return compact JSON only with keys mainTopic, purpose, discussion, claimsAndPositions, glossary, ambiguities, toneAndStance, fidelityRules. glossary is an array of {source, greek, note}; give a Greek rendering only when contextual meaning is sufficiently clear.";

async function directGlobalUnderstanding(fullTranscript: string) {
  return groqJson(
    GLOBAL_SYSTEM,
    `The following is the COMPLETE repaired English transcript in chronological order. Read it as one conversation and build the global translation brief from the whole thing:\n\n${fullTranscript}`,
    3400,
  );
}

async function understandSegment(segment: string, part: number, total: number) {
  const result = await groqJson(
    "You are preparing one part of a source-analysis brief for a professional English-to-Greek translator. " +
    "Understand arguments, references, technical meaning, uncertainty, negation, causality, irony and changes of position. Do not translate the transcript and do not invent facts. " +
    "Return JSON only with keys summary, points, terms, ambiguities, tone. terms is an array of {source, greek, note}.",
    `This is transcript segment ${part} of ${total}. Analyse it as part of a larger ordered conversation:\n\n${segment}`,
    1600,
  );
  return normalizeSegment(result);
}

async function hierarchicalGlobalUnderstanding(
  fullTranscript: string,
  heartbeat?: (completedParts: number, totalParts: number) => Promise<void>,
) {
  const segments = segmentTranscript(fullTranscript);
  const analysed: SegmentUnderstanding[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    analysed.push(await understandSegment(segments[index], index + 1, segments.length));
    if (heartbeat) await heartbeat(index + 1, segments.length + 1);
  }
  const compact = analysed.map((segment, index) => JSON.stringify({ segment: index + 1, ...segment })).join("\n");
  const result = await groqJson(
    GLOBAL_SYSTEM,
    `These ordered segment analyses jointly cover the COMPLETE transcript. Synthesize them into one coherent global brief without dropping disagreements or ambiguity:\n\n${compact}`,
    3400,
  );
  if (heartbeat) await heartbeat(segments.length + 1, segments.length + 1);
  return result;
}

export async function readTranslationUnderstanding(
  videoId: string,
  transcriptVersion: number,
  cues: UnderstandingCue[],
) {
  if (!configured()) return null;
  const sourceHash = transcriptHash(cues);
  const cacheKey = key(videoId, transcriptVersion);
  const cached = memory.get(cacheKey);
  if (cached && validUnderstanding(cached, videoId, transcriptVersion, sourceHash, cues.length)) return cached;
  try {
    const value = await readJson(pathname(videoId, transcriptVersion));
    if (!validUnderstanding(value, videoId, transcriptVersion, sourceHash, cues.length)) return null;
    memory.set(cacheKey, value);
    return value;
  } catch {
    return null;
  }
}

export async function ensureTranslationUnderstanding(
  videoId: string,
  transcriptVersion: number,
  cues: UnderstandingCue[],
  heartbeat?: (completedParts: number, totalParts: number) => Promise<void>,
) {
  if (!configured()) throw new Error("Vercel Blob is required for understanding-first translation");
  if (!cues.length) throw new Error("Cannot understand an empty transcript");
  const existing = await readTranslationUnderstanding(videoId, transcriptVersion, cues);
  if (existing) return existing;

  const sourceHash = transcriptHash(cues);
  const fullTranscript = transcriptForPrompt(cues);
  const result = fullTranscript.length <= DIRECT_MAX_CHARS
    ? await directGlobalUnderstanding(fullTranscript)
    : await hierarchicalGlobalUnderstanding(fullTranscript, heartbeat);
  if (fullTranscript.length <= DIRECT_MAX_CHARS && heartbeat) await heartbeat(1, 1);

  const understanding = buildUnderstanding(videoId, transcriptVersion, sourceHash, cues.length, result);
  await put(pathname(videoId, transcriptVersion), JSON.stringify(understanding), {
    access: "public" as const,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 300,
    contentType: "application/json; charset=utf-8",
  });
  memory.set(key(videoId, transcriptVersion), understanding);
  return understanding;
}

export function compactUnderstandingForPrompt(understanding: TranslationUnderstanding) {
  return JSON.stringify({
    mainTopic: understanding.mainTopic,
    purpose: understanding.purpose,
    discussion: understanding.discussion,
    claimsAndPositions: understanding.claimsAndPositions,
    glossary: understanding.glossary,
    ambiguities: understanding.ambiguities,
    toneAndStance: understanding.toneAndStance,
    fidelityRules: understanding.fidelityRules,
  });
}

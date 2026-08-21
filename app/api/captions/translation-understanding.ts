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
const SEGMENT_MAX_CHARS = 22_000;
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
  const timeout = setTimeout(() => controller.abort(), 35_000);
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
    const content = payload.choices?.[0]?.message?.content || "";
    return parseJsonObject(content);
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

function segmentTranscript(cues: UnderstandingCue[]) {
  const segments: string[] = [];
  let current = "";
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const line = `[[${index} @ ${timestamp(cue.start)}]] ${normalizeText(cue.text)}\n`;
    if (current && current.length + line.length > SEGMENT_MAX_CHARS) {
      segments.push(current);
      current = "";
    }
    current += line;
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

async function understandSegment(segment: string, part: number, total: number) {
  const result = await groqJson(
    "You are preparing a source-analysis brief for a professional English-to-Greek translator. " +
    "Understand what is actually being discussed before any translation happens. Track arguments, references, technical meaning, uncertainty, negation, causality, irony and changes of position. " +
    "Do not translate the transcript. Do not invent speaker identities or facts not present in the text. If wording is ambiguous, record the ambiguity instead of resolving it by guesswork. " +
    "Return JSON only with keys summary, points, terms, ambiguities, tone. terms is an array of {source, greek, note}; give a Greek rendering only when the contextual meaning is sufficiently clear.",
    `This is transcript segment ${part} of ${total}. Analyse it in the context of a larger conversation.\n\n${segment}`,
    1800,
  );
  return normalizeSegment(result);
}

function compactSegmentForSynthesis(segment: SegmentUnderstanding, index: number) {
  return JSON.stringify({
    segment: index + 1,
    summary: segment.summary,
    points: segment.points,
    terms: segment.terms,
    ambiguities: segment.ambiguities,
    tone: segment.tone,
  });
}

async function synthesizeGlobalUnderstanding(
  videoId: string,
  transcriptVersion: number,
  sourceHash: string,
  cueCount: number,
  segments: SegmentUnderstanding[],
) {
  const result = await groqJson(
    "You are the senior source analyst for a professional English-to-Greek subtitle translator. " +
    "Synthesize the analyses of ALL transcript segments into one compact global translation brief. " +
    "The translator must understand the topic, purpose, thread of discussion, arguments/positions, terminology, references, tone and unresolved ambiguity before translating any cue. " +
    "Never invent facts or certainty. Preserve distinctions such as may/might/could versus certainty, association versus causation, hypothesis versus established claim and a speaker reporting a claim versus endorsing it. " +
    "Do not produce subtitle translations. Return JSON only with keys mainTopic, purpose, discussion, claimsAndPositions, glossary, ambiguities, toneAndStance, fidelityRules. glossary is {source, greek, note}[].",
    `Synthesize these ${segments.length} ordered segment analyses. They cover the complete repaired English transcript:\n\n${segments.map(compactSegmentForSynthesis).join("\n")}`,
    3200,
  );
  const generatedAt = new Date().toISOString();
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
    generatedAt,
  } satisfies TranslationUnderstanding;
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
  const segments = segmentTranscript(cues);
  const analysed: SegmentUnderstanding[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    analysed.push(await understandSegment(segments[index], index + 1, segments.length));
    if (heartbeat) await heartbeat(index + 1, segments.length + 1);
  }
  const understanding = await synthesizeGlobalUnderstanding(
    videoId, transcriptVersion, sourceHash, cues.length, analysed,
  );
  if (heartbeat) await heartbeat(segments.length + 1, segments.length + 1);

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

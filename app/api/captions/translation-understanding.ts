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

type PersistedSegmentUnderstanding = {
  videoId: string;
  transcriptVersion: number;
  sourceHash: string;
  segmentHash: string;
  part: number;
  total: number;
  analysis: SegmentUnderstanding;
  generatedAt: string;
};

const MODEL = "openai/gpt-oss-120b";
// Keep direct requests deliberately conservative. Provider request-size limits can
// be lower than the model context window and a 413 must never force us into a
// lower-quality cue-by-cue translation path.
const DIRECT_MAX_CHARS = 70_000;
const SEGMENT_MAX_CHARS = 28_000;
const EDGE_CONTEXT_CHARS = 2_000;
const SYNTHESIS_MAX_CHARS = 70_000;
const SYNTHESIS_GROUP_MAX_CHARS = 45_000;
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

function segmentPath(videoId: string, transcriptVersion: number, sourceHash: string, part: number) {
  return `transcripts/v${transcriptVersion}/context/${videoId}/segments/${sourceHash}/${String(part).padStart(3, "0")}.json`;
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

function glossaryList(value: unknown, max = 80) {
  if (!Array.isArray(value)) return [] as TranslationGlossaryEntry[];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const source = normalizeText(row.source);
    const greek = normalizeText(row.greek);
    const note = normalizeText(row.note);
    return source && greek ? [{ source, greek, ...(note ? { note } : {}) }] : [];
  }).slice(0, max);
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

function textHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(path: string) {
  const blob = await get(path, { access: "public" });
  if (!blob?.stream) return null;
  return await new Response(blob.stream).json() as unknown;
}

async function writeJson(path: string, value: unknown) {
  await put(path, JSON.stringify(value), {
    access: "public" as const,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 300,
    contentType: "application/json; charset=utf-8",
  });
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
    terms: glossaryList(value.terms, 24),
    ambiguities: stringList(value.ambiguities, 20),
    tone: stringList(value.tone, 12),
  };
}

function validPersistedSegment(
  value: unknown,
  videoId: string,
  transcriptVersion: number,
  sourceHash: string,
  segmentHash: string,
  part: number,
  total: number,
): value is PersistedSegmentUnderstanding {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PersistedSegmentUnderstanding>;
  const analysis = record.analysis;
  return record.videoId === videoId &&
    record.transcriptVersion === transcriptVersion &&
    record.sourceHash === sourceHash &&
    record.segmentHash === segmentHash &&
    record.part === part &&
    record.total === total &&
    Boolean(analysis) &&
    typeof analysis?.summary === "string" &&
    Array.isArray(analysis?.points) &&
    Array.isArray(analysis?.terms) &&
    Array.isArray(analysis?.ambiguities) &&
    Array.isArray(analysis?.tone);
}

async function readPersistedSegment(
  videoId: string,
  transcriptVersion: number,
  sourceHash: string,
  segmentHash: string,
  part: number,
  total: number,
) {
  try {
    const value = await readJson(segmentPath(videoId, transcriptVersion, sourceHash, part));
    return validPersistedSegment(value, videoId, transcriptVersion, sourceHash, segmentHash, part, total)
      ? value.analysis
      : null;
  } catch {
    return null;
  }
}

async function persistSegment(
  videoId: string,
  transcriptVersion: number,
  sourceHash: string,
  segmentHash: string,
  part: number,
  total: number,
  analysis: SegmentUnderstanding,
) {
  const value: PersistedSegmentUnderstanding = {
    videoId,
    transcriptVersion,
    sourceHash,
    segmentHash,
    part,
    total,
    analysis,
    generatedAt: new Date().toISOString(),
  };
  await writeJson(segmentPath(videoId, transcriptVersion, sourceHash, part), value);
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

async function understandSegment(
  segment: string,
  part: number,
  total: number,
  previousTail: string,
  nextHead: string,
) {
  const result = await groqJson(
    "You are preparing one ordered section of a source-analysis brief for a professional English-to-Greek translator. " +
    "Understand the current section's arguments, references, technical meaning, uncertainty, negation, causality, irony and changes of position. " +
    "The small preceding/following excerpts are CONTINUITY CONTEXT only. Use them to resolve references crossing a section boundary but do not treat them as part of the current section's content. " +
    "Do not translate the transcript and do not invent facts. Return compact JSON only with keys summary, points, terms, ambiguities, tone. terms is an array of {source, greek, note}.",
    JSON.stringify({
      section: `${part}/${total}`,
      precedingBoundaryContext: previousTail,
      currentSection: segment,
      followingBoundaryContext: nextHead,
    }),
    1800,
  );
  return normalizeSegment(result);
}

function compactSegmentForSynthesis(segment: SegmentUnderstanding, index: number) {
  return JSON.stringify({
    segment: index + 1,
    summary: segment.summary,
    points: segment.points.slice(0, 16),
    terms: segment.terms.slice(0, 20),
    ambiguities: segment.ambiguities.slice(0, 12),
    tone: segment.tone.slice(0, 8),
  });
}

function groupBySize(lines: string[], maxChars: number) {
  const groups: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = `${line}\n`;
    if (current && current.length + next.length > maxChars) {
      groups.push(current);
      current = "";
    }
    current += next;
  }
  if (current) groups.push(current);
  return groups;
}

async function synthesizeAnalyses(analysed: SegmentUnderstanding[]) {
  const lines = analysed.map(compactSegmentForSynthesis);
  const compact = lines.join("\n");
  if (compact.length <= SYNTHESIS_MAX_CHARS) {
    return groqJson(
      GLOBAL_SYSTEM,
      `These ordered section analyses jointly cover the COMPLETE transcript. Synthesize them into one coherent global brief without dropping disagreements, attribution, uncertainty or ambiguity:\n\n${compact}`,
      3400,
    );
  }

  // Extremely long videos get one additional hierarchy level so the final
  // synthesis request itself can never become another oversized payload.
  const groups = groupBySize(lines, SYNTHESIS_GROUP_MAX_CHARS);
  const chapterBriefs: SegmentUnderstanding[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const chapter = await groqJson(
      "You are consolidating consecutive source-analysis sections for a professional translator. Preserve chronology, disagreements, attribution, uncertainty, technical terminology and unresolved ambiguity. Do not translate subtitle lines. Return JSON only with keys summary, points, terms, ambiguities, tone.",
      `These are ordered analyses for chapter ${index + 1}/${groups.length}:\n\n${groups[index]}`,
      1800,
    );
    chapterBriefs.push(normalizeSegment(chapter));
  }
  const chapterCompact = chapterBriefs.map(compactSegmentForSynthesis).join("\n");
  return groqJson(
    GLOBAL_SYSTEM,
    `These ordered chapter analyses jointly cover the COMPLETE transcript. Build one final coherent translation brief while preserving disagreements, attribution, uncertainty and ambiguity:\n\n${chapterCompact}`,
    3400,
  );
}

async function hierarchicalGlobalUnderstanding(
  videoId: string,
  transcriptVersion: number,
  sourceHash: string,
  fullTranscript: string,
  heartbeat?: (completedParts: number, totalParts: number) => Promise<void>,
) {
  const segments = segmentTranscript(fullTranscript);
  const analysed: SegmentUnderstanding[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const currentHash = textHash(segment);
    const part = index + 1;
    let analysis = await readPersistedSegment(
      videoId,
      transcriptVersion,
      sourceHash,
      currentHash,
      part,
      segments.length,
    );
    if (!analysis) {
      analysis = await understandSegment(
        segment,
        part,
        segments.length,
        index > 0 ? segments[index - 1].slice(-EDGE_CONTEXT_CHARS) : "",
        index + 1 < segments.length ? segments[index + 1].slice(0, EDGE_CONTEXT_CHARS) : "",
      );
      await persistSegment(
        videoId,
        transcriptVersion,
        sourceHash,
        currentHash,
        part,
        segments.length,
        analysis,
      );
    }
    analysed.push(analysis);
    if (heartbeat) await heartbeat(part, segments.length + 1);
  }
  const result = await synthesizeAnalyses(analysed);
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
  let result: Record<string, unknown>;
  if (fullTranscript.length <= DIRECT_MAX_CHARS) {
    try {
      result = await directGlobalUnderstanding(fullTranscript);
      if (heartbeat) await heartbeat(1, 1);
    } catch (error) {
      // A provider may impose a body-size limit below its advertised context
      // window. Fall back to the resumable hierarchy instead of lowering quality.
      if (!/\b413\b/.test(error instanceof Error ? error.message : String(error))) throw error;
      result = await hierarchicalGlobalUnderstanding(
        videoId,
        transcriptVersion,
        sourceHash,
        fullTranscript,
        heartbeat,
      );
    }
  } else {
    result = await hierarchicalGlobalUnderstanding(
      videoId,
      transcriptVersion,
      sourceHash,
      fullTranscript,
      heartbeat,
    );
  }

  const understanding = buildUnderstanding(videoId, transcriptVersion, sourceHash, cues.length, result);
  await writeJson(pathname(videoId, transcriptVersion), understanding);
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

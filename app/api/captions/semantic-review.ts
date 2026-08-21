import { database } from "@/db/postgres";
import {
  applyValidatedCorrections,
  buildContextWindow,
  candidatePreservesHardIntegrity,
  qualityReviewSystemPrompt,
  type CueCorrection,
  type TimedTextCue,
} from "./quality-review";
import {
  compactUnderstandingForPrompt,
  ensureTranslationUnderstanding,
  readTranslationUnderstanding,
  type TranslationUnderstanding,
} from "./translation-understanding";

const REVIEW_MODEL = "openai/gpt-oss-120b";

type ReviewBatchResult = {
  corrections: CueCorrection[];
  reviewedIndexes: number[];
  raw?: string;
};

type ContextCandidate = { video_id: string; transcript_version: number };

function technicalTokens(text: string) {
  return [...new Set(
    (text.match(/\b(?:[A-Z]{2,}[A-Z0-9/-]*|[A-Za-z]+\d+[A-Za-z0-9/-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%))\b/g) || [])
      .map(token => token.replace(/\s+/g, "").toLowerCase()),
  )];
}

function preservesTechnicalTokens(sourceEnglish: string, candidateGreek: string) {
  const compactCandidate = candidateGreek.replace(/\s+/g, "").toLowerCase();
  return technicalTokens(sourceEnglish).every(token => compactCandidate.includes(token));
}

function safeCorrection(sourceEnglish: string, correction: CueCorrection) {
  return candidatePreservesHardIntegrity(sourceEnglish, correction.text) &&
    preservesTechnicalTokens(sourceEnglish, correction.text);
}

function parseCorrections(raw: string, english: TimedTextCue[], greek: TimedTextCue[]) {
  const jsonCandidate = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return [] as CueCorrection[];
  }
  if (!parsed || typeof parsed !== "object") return [] as CueCorrection[];
  const items = Array.isArray((parsed as { corrections?: unknown }).corrections)
    ? (parsed as { corrections: unknown[] }).corrections
    : [];
  const accepted: CueCorrection[] = [];
  const seen = new Set<number>();
  for (const value of items) {
    if (!value || typeof value !== "object") continue;
    const item = value as { index?: unknown; text?: unknown; reason?: unknown };
    if (!Number.isInteger(item.index) || typeof item.text !== "string") continue;
    const index = item.index as number;
    if (index < 0 || index >= greek.length || seen.has(index)) continue;
    const text = item.text.replace(/\s+/g, " ").trim();
    if (!text || text === greek[index]?.text.trim()) continue;
    const correction: CueCorrection = {
      index,
      text,
      reason: typeof item.reason === "string" ? item.reason.slice(0, 220) : undefined,
    };
    if (!safeCorrection(english[index]?.text || "", correction)) continue;
    seen.add(index);
    accepted.push(correction);
  }
  return accepted;
}

function formatWindow(english: TimedTextCue[], greek: TimedTextCue[], indexes: number[]) {
  return indexes.map(index => {
    const window = buildContextWindow(english, greek, index, 4);
    const en = window.english.map(cue => `[${cue.index}] ${cue.text}`).join("\n");
    const el = window.greek.map(cue => `[${cue.index}] ${cue.text}`).join("\n");
    return `TARGET ${index}\nENGLISH CONTEXT:\n${en}\nGREEK CONTEXT:\n${el}`;
  }).join("\n\n---\n\n");
}

async function resolveUnderstanding(
  english: TimedTextCue[],
  options?: { videoId?: string; transcriptVersion?: number },
) {
  if (options?.videoId) {
    return await ensureTranslationUnderstanding(
      options.videoId,
      options.transcriptVersion ?? 12,
      english,
    ).catch(() => null);
  }

  // The worker already knows the full aligned transcript but its historical API
  // does not pass videoId into the reviewer. Resolve candidates using only the
  // tiny integer cue counter, then verify the exact transcript hash in Blob.
  // No transcript TEXT is selected from Neon.
  try {
    const db = database();
    const candidates = await db.query(
      `SELECT video_id, transcript_version
       FROM video_transcripts
       WHERE status='ready' AND english_count=$1
       ORDER BY updated_at DESC LIMIT 8`,
      [english.length],
    ) as ContextCandidate[];
    for (const candidate of candidates) {
      const understanding = await readTranslationUnderstanding(
        candidate.video_id,
        Number(candidate.transcript_version) || 12,
        english,
      );
      if (understanding) return understanding;
    }
  } catch {
    // A missing global brief must never prevent the conservative local review.
  }
  return null;
}

async function reviewIndexesWithGroq(
  english: TimedTextCue[],
  greek: TimedTextCue[],
  indexes: number[],
  understanding: TranslationUnderstanding | null,
): Promise<ReviewBatchResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !indexes.length) return { corrections: [], reviewedIndexes: indexes };

  const globalBrief = understanding
    ? `WHOLE-VIDEO TRANSLATION BRIEF (use for meaning/disambiguation only):\n${compactUnderstandingForPrompt(understanding)}\n\n`
    : "";
  const prompt = `${qualityReviewSystemPrompt()}\n` +
    "The whole-video brief, when supplied, is authoritative context for the discussion but is NOT permission to add information to a cue. " +
    "Check especially whether uncertainty, negation, agency, attribution, causality, technical meaning, irony or the speaker's actual point changed in Greek. " +
    "For every TARGET, decide whether the CURRENT Greek cue needs correction after reading its English/Greek context and the global brief. " +
    "Do not rewrite good cues. Keep the correction inside the same cue; do not steal words from unrelated cues. " +
    "Return strict JSON only: {\"corrections\":[{\"index\":123,\"text\":\"...\",\"reason\":\"short reason\"}]}. " +
    "If nothing needs correction return {\"corrections\":[]}.\n\n" +
    globalBrief + formatWindow(english, greek, indexes);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: REVIEW_MODEL,
        temperature: 0,
        max_tokens: 2200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a conservative professional Greek subtitle quality editor. Correct meaning only when the source and context justify it. Output JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return { corrections: [], reviewedIndexes: indexes };
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const raw = payload.choices?.[0]?.message?.content || "";
    return { corrections: parseCorrections(raw, english, greek), reviewedIndexes: indexes, raw };
  } catch {
    return { corrections: [], reviewedIndexes: indexes };
  } finally {
    clearTimeout(timeout);
  }
}

export async function semanticReviewTranscript(
  english: TimedTextCue[],
  greek: TimedTextCue[],
  options?: { start?: number; end?: number; batchSize?: number; videoId?: string; transcriptVersion?: number },
) {
  if (english.length !== greek.length) throw new Error("English/Greek cue count mismatch");
  const start = Math.max(0, Math.floor(options?.start ?? 0));
  const end = Math.min(greek.length, Math.max(start, Math.floor(options?.end ?? greek.length)));
  const batchSize = Math.max(1, Math.min(8, Math.floor(options?.batchSize ?? 6)));
  const corrections: CueCorrection[] = [];
  const understanding = await resolveUnderstanding(english, options);

  for (let cursor = start; cursor < end; cursor += batchSize) {
    const indexes = Array.from({ length: Math.min(batchSize, end - cursor) }, (_, offset) => cursor + offset);
    const result = await reviewIndexesWithGroq(english, greek, indexes, understanding);
    corrections.push(...result.corrections);
  }

  const reviewedGreek = applyValidatedCorrections(english, greek, corrections);
  return {
    corrections,
    reviewedGreek,
    changed: corrections.length,
    range: { start, end },
  };
}

import { FINAL_SUBTITLE_REVIEW_PROMPT, finalReviewEvents, finalCandidateHash, validateFinalReview, assertFinalReviewBinding, type FinalSemanticReview } from "./final-subtitle-review.ts";
import { createHash } from "node:crypto";
import { validateAudioEvidence, type SubtitleAudioEvidence } from "../../subtitle-audio-evidence.ts";
import { subtitleLines } from "../../subtitle-display.ts";
import { auditSubtitleEvents, validateAuthoredEvents, type SubtitleEvent, type TimedCue } from "../../subtitle-track.ts";
import { subtitleContentHash } from "../subtitle-track.ts";

export const WORD_AUTHORING_MODEL = "openai/gpt-oss-120b";
export function wordEvidenceKey(evidence: SubtitleAudioEvidence) {
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}
export const WORD_TRANSLATION_PROMPT = `You are the GreekTube professional English-to-Greek audiovisual translator.
Read the whole-video brief, locked glossary and read-only neighbouring context. Translate the complete meaning
of the selected source into concise natural Greek. Reconstruct sentences across cue boundaries. Preserve
negation, hedging, uncertainty, attribution, causality, chronology, names, numbers and units. Never strengthen
medical claims. Existing Greek is an editable reference, not authoritative evidence. Do not omit meaningful
content to fit timing. Preserve digit-based quantities as digits and spelled-out quantities as words.
Map each semantic Greek phrase to firstWordId and
lastWordId from the supplied source words. Cover every selected source word exactly once in order. Do not
translate readOnlyContext. Never invent timestamps or infer speech timing from Greek text length.
Aim below 15.5 Greek characters/second. Hard limits: 17 CPS, two 42-character lines and 1–7 seconds per
display event. Adjacent phrases can form one event, so do not pad short phrases. Use hardBreakBefore for
speaker changes or mandatory semantic boundaries. No comma before και or ή. All-uppercase Greek has no tonos.
Return JSON only: {"phrases":[{"firstWordId":"W000001","lastWordId":"W000008","text":"...","hardBreakBefore":false}]}.
If faithful wording cannot fit, return {"status":"manual_review_required","issues":["actionable reason"]}.`;
export const WORD_REVIEW_PROMPT = FINAL_SUBTITLE_REVIEW_PROMPT;

type Phrase = { firstWordId: string; lastWordId: string; text: string; hardBreakBefore: boolean };
type PacketWord = { wordId: string; cueIndex: number; text: string; startMs: number; endMs: number };
export type WordAuthoringPacket = {
  schemaVersion: 1;
  sourceHash: string;
  translationHash: string;
  audioSha256: string;
  wordTimelineHash: string;
  sourceCueRange: [number, number];
  globalBrief: Record<string, unknown>;
  readOnlyContext: { precedingEnglish: string; followingEnglish: string };
  sourceText: string;
  existingGreek: string;
  words: PacketWord[];
  nextWordStartMs: number;
};
export type WordAuthoringResult = {
  status: "draft_ready"; modelBilingualQa: "approved"; humanAudioReview: false;
  sourceHash: string; translationHash: string; audioSha256: string; wordTimelineHash: string;
  sourceCueRange: [number, number]; phrases: Phrase[]; events: SubtitleEvent[]; finalReview: FinalSemanticReview;
};
export type WordAuthoringCheckpoint = {
  key?: string; proposed?: unknown; reviewed?: unknown; result?: WordAuthoringResult;
  status?: "translation_ready" | "draft_ready" | "manual_review_required"; issue?: string;
};
export class WordAuthoringNeedsReview extends Error {}
const fail = (message: string): never => { throw new WordAuthoringNeedsReview(message); };
const normalise = (text: string) => text.replace(/\s+/gu, " ").trim();
const wordId = (index: number) => `W${String(index + 1).padStart(6, "0")}`;

export function buildWordAuthoringPacket(source: TimedCue[], translation: TimedCue[], evidence: SubtitleAudioEvidence,
  range: [number, number], brief: Record<string, unknown>): WordAuthoringPacket {
  if (evidence.sourceHash !== subtitleContentHash(source)) fail("Audio source changed");
  if (!source.length || source.length !== translation.length) fail("Source and translation cue mapping differ");
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger) || range[0] < 0 || range[1] < range[0] || range[1] >= source.length)
    fail("Invalid semantic cue range");
  if (typeof brief.mainTopic !== "string" || !brief.mainTopic.trim() || !Array.isArray(brief.glossary)) fail("Whole-video brief and glossary are required");
  // A bad boundary elsewhere must not prevent targeted work on a healthy scope.
  // Full assembly/publication still calls the strict whole-video validator.
  const { tokens, evidence: validated } = validateAudioEvidence(evidence, source, { overlapScope: range });
  const indices = tokens.flatMap((token, index) => token.cueIndex >= range[0] && token.cueIndex <= range[1] ? [index] : []);
  if (!indices.length || indices.length > 200) fail("Select a semantic scope of at most 200 words");
  if (indices.some(index => validated.words[index][3] !== 1)) fail("Repair the scope's uncertain audio anchors before translation");
  const words = indices.map(index => ({ wordId: wordId(index), cueIndex: tokens[index].cueIndex, text: tokens[index].text,
    startMs: validated.words[index][0], endMs: validated.words[index][1] }));
  const packet: WordAuthoringPacket = { schemaVersion: 1, sourceHash: evidence.sourceHash,
    translationHash: subtitleContentHash(translation), audioSha256: evidence.audioSha256, wordTimelineHash: evidence.wordTimelineHash,
    sourceCueRange: [...range], globalBrief: brief,
    readOnlyContext: { precedingEnglish: source.slice(Math.max(0, range[0] - 2), range[0]).map(c => c.text).join(" "),
      followingEnglish: source.slice(range[1] + 1, range[1] + 3).map(c => c.text).join(" ") },
    sourceText: source.slice(range[0], range[1] + 1).map(c => c.text).join(" "),
    existingGreek: translation.slice(range[0], range[1] + 1).map(c => c.text).join(" "), words,
    nextWordStartMs: validated.words[indices.at(-1)! + 1]?.[0] ?? words.at(-1)!.endMs };
  if (JSON.stringify(packet).length > 24_000) fail("Semantic request exceeds the bounded context budget");
  return packet;
}

function numbers(text: string) {
  return (text.match(/(?<![\p{L}\p{N}])[−-]?\d+(?:[.,:/–-]\d+)*\s*%?/gu) || [])
    .map(n => n.replace(/\s/gu, "").replace(/,/gu, ".").replace(/[−–]/gu, "-"));
}
export function parseWordPhrases(value: unknown, packet: WordAuthoringPacket): Phrase[] {
  const row = value as { status?: unknown; phrases?: unknown } | null;
  if (!row || row.status === "manual_review_required" || !Array.isArray(row.phrases) || !row.phrases.length || row.phrases.length > packet.words.length)
    fail("Semantic translation needs repair");
  const indexes = new Map(packet.words.map((word, index) => [word.wordId, index]));
  let cursor = 0;
  const phrases = (row!.phrases as unknown[]).map(item => {
    if (!item || typeof item !== "object") return fail("Malformed Greek phrase");
    const p = item as Record<string, unknown>;
    if (typeof p.firstWordId !== "string" || typeof p.lastWordId !== "string" || typeof p.text !== "string" || !normalise(p.text)
      || (p.hardBreakBefore !== undefined && typeof p.hardBreakBefore !== "boolean")) return fail("Malformed Greek phrase");
    const first = indexes.get(p.firstWordId), last = indexes.get(p.lastWordId);
    if (first !== cursor || last === undefined || last < cursor) return fail("Greek phrase word coverage is incomplete or reordered");
    cursor = last + 1;
    const text = normalise(p.text);
    if (!/[\p{Script=Greek}]/u.test(text) || /,\s*(?:και|ή)(?=\s|[.;!?]|$)/iu.test(text)) return fail("Greek phrase language or punctuation needs repair");
    for (const token of text.match(/[\p{L}\p{M}]+/gu) || []) {
      if (/\p{Script=Greek}/u.test(token) && token === token.toUpperCase() && /\u0301/u.test(token.normalize("NFD")))
        return fail("All-uppercase Greek must have no tonos");
    }
    return { firstWordId: p.firstWordId, lastWordId: p.lastWordId, text, hardBreakBefore: p.hardBreakBefore === true };
  });
  if (cursor !== packet.words.length) fail("Greek phrase word coverage is incomplete");
  if (JSON.stringify(numbers(packet.sourceText)) !== JSON.stringify(numbers(phrases.map(p => p.text).join(" ")))) fail("Numeric content changed during translation");
  return phrases;
}

/** Dynamic programming over whole semantic phrases; English anchors determine every boundary. */
export function authorWordPhrases(packet: WordAuthoringPacket, phrases: Phrase[]): SubtitleEvent[] {
  const indexes = new Map(packet.words.map((word, index) => [word.wordId, index]));
  const costs = Array(phrases.length + 1).fill(Infinity) as number[];
  const paths: ({ previous: number; event: SubtitleEvent } | undefined)[] = Array(phrases.length + 1);
  costs[0] = 0;
  for (let a = 0; a < phrases.length; a++) {
    if (!Number.isFinite(costs[a])) continue;
    let text = "";
    for (let b = a; b < phrases.length; b++) {
      const first = indexes.get(phrases[a].firstWordId)!, last = indexes.get(phrases[b].lastWordId)!;
      if (b > a) {
        const previous = indexes.get(phrases[b - 1].lastWordId)!;
        if (phrases[b].hardBreakBefore || packet.words[indexes.get(phrases[b].firstWordId)!].startMs - packet.words[previous].endMs > 600) break;
      }
      text = normalise(`${text} ${phrases[b].text}`);
      if (Array.from(text).length > 84) break;
      const lines = subtitleLines(text);
      if (lines.length > 2 || lines.some(line => Array.from(line).length > 42)) continue;
      const start = packet.words[first].startMs, speechEnd = packet.words[last].endMs;
      const nextStart = packet.words[last + 1]?.startMs ?? packet.nextWordStartMs;
      const end = Math.min(speechEnd + 250, nextStart), duration = (end - start) / 1000;
      if (duration < 1 || duration > 7 || Array.from(text).length / duration > 17) continue;
      const score = costs[a] + 10 + Math.abs(Array.from(text).length - 62) / 50 - (/[.;!?]$/u.test(text) ? 2 : 0)
        + (lines.length === 2 ? Math.abs(Array.from(lines[0]).length - Array.from(lines[1]).length) / 100 : 0);
      if (score >= costs[b + 1]) continue;
      const globalFirst = Number(packet.words[first].wordId.slice(1)) - 1;
      const globalLast = Number(packet.words[last].wordId.slice(1)) - 1;
      const event: SubtitleEvent = { start: start / 1000, duration, text,
        sourceIndices: [...new Set(packet.words.slice(first, last + 1).map(word => word.cueIndex))],
        sourceWordRange: [globalFirst, globalLast], timing: "audio_aligned" };
      costs[b + 1] = score; paths[b + 1] = { previous: a, event };
    }
  }
  if (!paths[phrases.length]) fail("Greek wording does not fit its speech window; repair this scope without delaying later speech");
  const events: SubtitleEvent[] = [];
  for (let cursor = phrases.length; cursor > 0;) {
    const step = paths[cursor]!; events.push(step.event); cursor = step.previous;
  }
  events.reverse();
  if (!auditSubtitleEvents(events).readable) fail("Authored phrase events failed readability");
  return events;
}

export function wordAuthoringKey(packet: WordAuthoringPacket) {
  return createHash("sha256").update(JSON.stringify({ packet, model: WORD_AUTHORING_MODEL,
    translator: WORD_TRANSLATION_PROMPT, reviewer: WORD_REVIEW_PROMPT })).digest("hex");
}

/** Meaning review is reusable after timing repair; the final event artifact is not. */
export function wordSemanticKey(packet: WordAuthoringPacket) {
  return createHash("sha256").update(JSON.stringify({ sourceHash: packet.sourceHash, translationHash: packet.translationHash,
    range: packet.sourceCueRange, brief: packet.globalBrief, context: packet.readOnlyContext, sourceText: packet.sourceText,
    existingGreek: packet.existingGreek, words: packet.words.map(word => [word.wordId, word.cueIndex, word.text]),
    model: WORD_AUTHORING_MODEL, translator: WORD_TRANSLATION_PROMPT, reviewer: WORD_REVIEW_PROMPT })).digest("hex");
}
export type WordSemanticCheckpoint = { key: string; proposed?: unknown; reviewed?: unknown };
export function reusableWordSemantics(packet: WordAuthoringPacket, saved: WordSemanticCheckpoint | null): WordAuthoringCheckpoint {
  if (!saved || saved.key !== wordSemanticKey(packet)) return {};
  return { ...(saved.proposed === undefined ? {} : { proposed: saved.proposed }),
    ...(saved.reviewed === undefined ? {} : { reviewed: saved.reviewed }) };
}

/** Separate blocked cues so one uncertain boundary does not repeatedly bill healthy neighbours. */
export function planWordAuthoring(source: TimedCue[], translation: TimedCue[], evidence: SubtitleAudioEvidence,
  brief: Record<string, unknown>) {
  if (evidence.sourceHash !== subtitleContentHash(source) || source.length !== translation.length || !source.length)
    fail("Source or translation changed");
  if (typeof brief.mainTopic !== "string" || !brief.mainTopic.trim() || !Array.isArray(brief.glossary)) fail("Whole-video brief and glossary are required");
  const validated = validateAudioEvidence(evidence, source, { overlapScope: [-1, -1] });
  const blocked = new Set<number>();
  validated.evidence.words.forEach((word, index) => {
    if (word[3] !== 1) blocked.add(validated.tokens[index].cueIndex);
    if (index && word[0] < validated.evidence.words[index - 1][1]) {
      blocked.add(validated.tokens[index].cueIndex); blocked.add(validated.tokens[index - 1].cueIndex);
    }
  });
  const scopes: { range: [number, number]; status: "ready" | "alignment_review_required"; key?: string; issue?: string }[] = [];
  let pending: [number, number] | null = null;
  const flush = () => {
    if (!pending) return;
    const packet = buildWordAuthoringPacket(source, translation, evidence, pending, brief);
    scopes.push({ range: pending, status: "ready", key: wordAuthoringKey(packet) }); pending = null;
  };
  for (let cue = 0; cue < source.length; cue++) {
    if (blocked.has(cue)) {
      flush(); scopes.push({ range: [cue, cue], status: "alignment_review_required", issue: "Repair uncertain or overlapping audio anchors" }); continue;
    }
    let packet: WordAuthoringPacket;
    try { packet = buildWordAuthoringPacket(source, translation, evidence, [cue, cue], brief); }
    catch (error) {
      if (!(error instanceof WordAuthoringNeedsReview) && !(error instanceof Error)) throw error;
      flush(); scopes.push({ range: [cue, cue], status: "alignment_review_required", issue: error.message }); continue;
    }
    if (pending) {
      const candidate: [number, number] = [pending[0], cue];
      try {
        const combined = buildWordAuthoringPacket(source, translation, evidence, candidate, brief);
        if (combined.words.length > 120 || packet.words.at(-1)!.endMs - combined.words[0].startMs > 45_000) flush();
      } catch { flush(); }
    }
    pending = pending ? [pending[0], cue] : [cue, cue];
    const count = buildWordAuthoringPacket(source, translation, evidence, pending, brief).words.length;
    if (count >= 80 && /[.!?;]["'»)]*$/u.test(source[cue].text.trim())) flush();
  }
  flush(); return scopes;
}

/** At most ONE provider call per invocation. Exceptions propagate; no retry loop. */
export async function advanceWordAuthoring(packet: WordAuthoringPacket, cache: WordAuthoringCheckpoint,
  callJson: (system: string, input: unknown) => Promise<unknown>, checkpoint: () => Promise<void>) {
  const key = wordAuthoringKey(packet);
  if (cache.key && cache.key !== key) fail("Stale semantic checkpoint");
  cache.key = key;
  if (cache.status === "manual_review_required") fail(cache.issue || "Semantic scope requires repair");
  if (cache.result) { assertFinalReviewBinding(cache.result.finalReview, cache.result.events); return cache.result; }
  try {
    if (cache.proposed === undefined) {
      cache.proposed = await callJson(WORD_TRANSLATION_PROMPT, packet);
      parseWordPhrases(cache.proposed, packet);
      cache.status = "translation_ready"; await checkpoint();
      return { status: "translation_ready" as const, key, humanAudioReview: false as const };
    }
    const phrases = parseWordPhrases(cache.proposed, packet), events = authorWordPhrases(packet, phrases);
    const contextKey = wordSemanticKey(packet), candidateHash = finalCandidateHash(contextKey, events);
    // Reuse cached meaning review only for the exact same final text, grouping and source mapping.
    if (cache.reviewed !== undefined && (cache.reviewed as {candidateHash?: unknown})?.candidateHash !== candidateHash) {
      cache.reviewed = undefined;
    }
    if (cache.reviewed === undefined) {
      cache.reviewed = await callJson(WORD_REVIEW_PROMPT, { ...packet, candidateHash, finalEvents: finalReviewEvents(events) });
      await checkpoint(); // retain the paid output even if validation fails
    }
    let finalReview: FinalSemanticReview;
    try { finalReview = validateFinalReview(cache.reviewed, contextKey, events, packet.words.map(w => w.wordId)); }
    catch (error) { fail(error instanceof Error ? error.message : "Independent final review failed"); }
    const result: WordAuthoringResult = { status: "draft_ready", sourceHash: packet.sourceHash, translationHash: packet.translationHash,
      audioSha256: packet.audioSha256, wordTimelineHash: packet.wordTimelineHash, sourceCueRange: packet.sourceCueRange,
      modelBilingualQa: "approved", humanAudioReview: false, phrases, events, finalReview: finalReview! };
    cache.result = result; cache.status = "draft_ready"; await checkpoint(); return result;
  } catch (error) {
    if (error instanceof WordAuthoringNeedsReview) {
      cache.status = "manual_review_required"; cache.issue = error.message; await checkpoint();
    }
    throw error;
  }
}

export function assembleWordAuthoring(source: TimedCue[], translation: TimedCue[], evidence: SubtitleAudioEvidence,
  results: WordAuthoringResult[]) {
  const sourceHash = subtitleContentHash(source), translationHash = subtitleContentHash(translation);
  let nextCue = 0;
  for (const result of results) {
    if (result.status !== "draft_ready" || result.modelBilingualQa !== "approved" || result.humanAudioReview !== false
      || result.sourceHash !== sourceHash || result.translationHash !== translationHash || result.audioSha256 !== evidence.audioSha256
      || result.wordTimelineHash !== evidence.wordTimelineHash || result.sourceCueRange[0] !== nextCue
      || result.sourceCueRange[1] < nextCue) fail("Missing, reordered or stale semantic scope");
    assertFinalReviewBinding(result.finalReview, result.events);
    nextCue = result.sourceCueRange[1] + 1;
  }
  if (nextCue !== source.length) fail("Full-video semantic coverage is incomplete");
  const track = validateAuthoredEvents(results.flatMap(result => result.events), translation, { source, evidence });
  if (!track.audit.readable || track.events.some(event => event.timing !== "audio_aligned")) fail("Full-video authoring requires repair");
  return track;
}

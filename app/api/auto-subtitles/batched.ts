import { createHash, randomUUID } from "node:crypto";
import type { SubtitleAudioEvidence } from "../../subtitle-audio-evidence.ts";
import { auditSubtitleEvents, type SubtitleEvent, type TimedCue } from "../../subtitle-track.ts";
import { FINAL_SUBTITLE_REVIEW_PROMPT, finalCandidateHash, finalReviewEvents, validateFinalReview } from "../captions/final-subtitle-review.ts";
import { assembleWordAuthoring, authorWordPhrases, buildWordAuthoringPacket, parseWordPhrases, planWordAuthoring, wordSemanticKey,
  WORD_TRANSLATION_PROMPT, type WordAuthoringPacket, type WordAuthoringResult } from "../captions/word-authoring.ts";
import { WordAuthoringProviderError } from "../captions/word-authoring-provider.ts";
import { buildPublication, type AutoIssue } from "./publication.ts";
import type { CapturedToken } from "./youtube-words.ts";

/**
 * Batched automatic subtitles (Phase 2 of the storage/efficiency plan).
 *  - Character budgets are fixed before the first call: the speech is cut into slots from YouTube word timings,
 *    each with maxChars = speech time × 15.5 CPS, and the model writes one Greek text per slot.
 *  - 10 scopes (≈ 900 words) per call; one call for the brief, then translate → (budget repair) → independent review
 *    → (repair of findings → re-review) per batch.
 *  - Hard caps per run: AI calls (including retries) and permanent writes, with one write reserved for the final save.
 *    The remaining budget is checked before every call. Progress is saved once per batch, never per scope.
 *  - Valid work is reused: within a run (saved per batch) and from the previous run of the same capture (same keys).
 */

export const RUN_LIMITS = {
  full: { calls: 30, writes: 10 },
  sample: { calls: 4, writes: 3, seconds: 120 },
} as const;
export const BATCH_SCOPES = 10;
const BATCH_WORDS = 1100;
const CALL_TIME_RESERVE_MS = 65_000;
const SLOT_CPS = 15.5;
/** Monthly provider budgets; automatic flows stop at half of each (the site keeps reading). */
export const MONTHLY_LIMITS = {
  ai_calls: Number(process.env.AUTO_AI_MONTHLY_CALL_LIMIT) || 1_000,
  ai_tokens: Number(process.env.AUTO_AI_MONTHLY_TOKEN_LIMIT) || 5_000_000,
  neon_bytes: 5 * 1024 ** 3, // Neon Free: 5 GB transfer per month
};
export type UsageMetric = keyof typeof MONTHLY_LIMITS;

export type Slot = { firstWordId: string; lastWordId: string; english: string; seconds: number; maxChars: number };
export type ScopeState = {
  id: string; range: [number, number]; status: "pending" | "ready" | "flagged"; issue?: string; attempts?: number;
  texts?: string[]; budgetRepairs?: number; reviewRepairs?: number; reviewRetries?: number; result?: WordAuthoringResult;
};
export type CallLog = { label: string; ok: boolean; ms: number; inChars: number; outChars: number; retry?: boolean };
export type RunUsage = { calls: number; retries: number; failedCalls: number; writes: number; tokensIn: number; tokensOut: number; aiMs: number; log: CallLog[] };
export type RunEstimate = {
  words: number; durationSeconds: number; scopes: number; batches: number;
  calls: number; tokensIn: number; tokensOut: number; writes: number;
  limits: { calls: number; writes: number }; fitsLimits: boolean; batchesWithinLimits: number; coverageWithinLimits: number;
};
export type RunState = {
  schema: 2; kind: "full" | "sample"; videoId: string; runId: string; captureHash: string;
  status: "running" | "complete" | "held" | "budget_exhausted" | "published" | "failed";
  meta: { title: string; channel: string; duration: number };
  sourceRange: [number, number]; limits: { calls: number; writes: number };
  estimate: RunEstimate; usage: RunUsage; brief?: Record<string, unknown>; scopes?: ScopeState[];
  stopReason?: string; remaining?: AutoIssue[]; issues?: AutoIssue[]; lastError?: string;
  published?: { events: number; fastPages: number; shortPages: number; contentHash?: string };
  measurement?: Record<string, unknown>; startedAt: string; updatedAt: string; finishedAt?: string;
};
export type RunSource = { source: TimedCue[]; evidence: SubtitleAudioEvidence; tokens: CapturedToken[] };
export type AiCall = (system: string, input: unknown, maxTokens: 900 | 1600 | 4000 | 6000, model: "deepseek-flash" | "deepseek-v4-pro") => Promise<unknown>;
export type MonthUsage = Partial<Record<UsageMetric, number>>;

export class RunStop extends Error {
  readonly reason: "calls" | "writes" | "time" | "monthly" | "provider";
  constructor(reason: "calls" | "writes" | "time" | "monthly" | "provider", message: string) { super(message); this.name = "RunStop"; this.reason = reason; }
}

const wordId = (index: number) => `W${String(index + 1).padStart(6, "0")}`;
const chars = (value: unknown) => JSON.stringify(value ?? "").length;
/** Rough token counts (no usage is returned by the provider): English/JSON ≈ 3.3 chars, Greek ≈ 2.6 chars per token. */
export const tokensForInput = (inputChars: number) => Math.ceil(inputChars / 3.3);
export const tokensForOutput = (outputChars: number) => Math.ceil(outputChars / 2.6);

/* ---------------- slots: character budgets known before the first call ---------------- */

export function slotsFor(packet: WordAuthoringPacket): Slot[] {
  const slots: Slot[] = [];
  let first = 0;
  const close = (last: number) => {
    const words = packet.words.slice(first, last + 1);
    const nextStart = packet.words[last + 1]?.startMs ?? packet.nextWordStartMs;
    const seconds = Math.max(0.5, (Math.min(packet.words[last].endMs + 250, nextStart) - packet.words[first].startMs) / 1000);
    slots.push({ firstWordId: words[0].wordId, lastWordId: words.at(-1)!.wordId, english: words.map(w => w.text).join(" "),
      seconds: Math.round(seconds * 100) / 100, maxChars: Math.max(8, Math.floor(seconds * SLOT_CPS)) });
    first = last + 1;
  };
  for (let i = 0; i < packet.words.length; i++) {
    const word = packet.words[i], next = packet.words[i + 1];
    if (!next) { close(i); break; }
    const span = (word.endMs - packet.words[first].startMs) / 1000;
    const gap = next.startMs - word.endMs;
    const english = packet.words.slice(first, i + 2).map(w => w.text).join(" ").length;
    const nextSpan = (next.endMs - packet.words[first].startMs) / 1000;
    if ((gap >= 300 && span >= 1.2) || nextSpan > 5 || english > 72) close(i);
  }
  return slots;
}

/* ---------------- prompts (batched wrappers around the existing rules) ---------------- */

export const BRIEF_PROMPT = `You are the senior source analyst for a professional English-to-Greek subtitle translator.
Read the supplied English transcript excerpts (in order; gaps are marked) and return compact JSON only:
{"mainTopic":"one sentence","purpose":"at most two sentences","claimsAndPositions":["≤12 short items"],
"glossary":[{"source":"English term","greek":"Greek rendering","alternates":["other correct renderings"],"note":"optional"}],
"toneAndStance":["≤5 short items"],"fidelityRules":["≤6 short items"]}. glossary: at most 30 domain terms whose Greek
rendering must stay consistent; person names, book and product titles stay in Latin script and are not glossary entries.
Never invent facts. Preserve hedging, negation and the difference between reporting and endorsing a claim.`;

export const BATCH_TRANSLATE_PROMPT = `${WORD_TRANSLATION_PROMPT}

BATCH FORMAT (overrides the return format above). The input has globalBrief and items[]. Each item is one
continuous stretch of speech cut into slots in spoken order. Each slot has the English words spoken in it and maxChars,
the hard maximum number of Greek characters (including spaces and punctuation) that fit its real speech time.
Translate every item completely and faithfully. Write exactly one Greek text per slot, in order: meaning may flow from
one slot into the next, but each text must render the words of its own slot and stay within its maxChars. Never leave a
slot empty. Use precedingEnglish/followingEnglish only as context.
Return JSON only: {"items":[{"id":"S001","texts":["...","..."]}]}.`;

export const BATCH_BUDGET_REPAIR_PROMPT = `You are the GreekTube subtitle editor. Each item lists the Greek texts of consecutive
subtitle slots with the English words of each slot, its hard maxChars and, where present, an issue. Rewrite only what is
needed so that every text is at most its maxChars and every issue is fixed. Keep the complete meaning: negation, hedging,
numbers (as digits when the English uses digits), units, names in Latin script, attribution and causality. Never strengthen
medical claims. Prefer shorter natural spoken Greek, drop fillers and repetition, use approved glossary alternates.
No comma before και or ή. All-uppercase Greek has no tonos. Return the same number of texts per item, in order.
Return JSON only: {"items":[{"id":"S001","texts":["..."]}]}.`;

export const BATCH_REVIEW_PROMPT = `${FINAL_SUBTITLE_REVIEW_PROMPT}

BATCH FORMAT (overrides the return format above). The input has globalBrief and items[]; review every item independently.
Each item has its own candidateHash and finalEvents (eventId, displayed Greek text, the English words it renders and the
range of source word IDs). Cite sourceWordIds only from the ranges shown for that item (e.g. "W000123").
Return JSON only: {"items":[{"id":"S001","status":"approved"|"manual_review_required","candidateHash":"...",
"reviewedEventIds":["E0001"],"findings":[...]}]}.`;

export const BATCH_REVIEW_REPAIR_PROMPT = `You are the GreekTube subtitle editor. An independent bilingual reviewer listed findings for these
Greek subtitle slots. Fix every finding (meaning, omissions, negation, hedging, numbers, units, names, terminology, natural
Greek) while keeping each text within its maxChars. Never strengthen medical claims. Return the same number of texts per
item, in order. No comma before και or ή. All-uppercase Greek has no tonos.
Return JSON only: {"items":[{"id":"S001","texts":["..."]}]}.`;

/* ---------------- state ---------------- */

const emptyUsage = (): RunUsage => ({ calls: 0, retries: 0, failedCalls: 0, writes: 0, tokensIn: 0, tokensOut: 0, aiMs: 0, log: [] });

export function sampleRange(source: TimedCue[], seconds: number): [number, number] {
  let last = 0;
  while (last + 1 < source.length && source[last + 1].start < seconds) last++;
  return [0, last];
}

/** Estimate shown once before a run starts. Repairs are assumed for 60% of batches until a sample measures them. */
export function estimateRun(run: RunSource, kind: RunState["kind"], range: [number, number], measured?: { repairCallsPerBatch?: number }): RunEstimate {
  const limits = { calls: RUN_LIMITS[kind].calls, writes: RUN_LIMITS[kind].writes };
  const source = run.source.slice(range[0], range[1] + 1);
  const words = source.reduce((n, cue) => n + (cue.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0);
  const placeholderBrief = { mainTopic: "estimate", glossary: [] };
  const empty = run.source.map(cue => ({ ...cue, text: "" }));
  const scopes = planWordAuthoring(run.source, empty, run.evidence, placeholderBrief).filter(s => s.range[0] >= range[0] && s.range[1] <= range[1]).length;
  const batches = Math.ceil(scopes / BATCH_SCOPES);
  const repairs = Math.ceil(batches * (measured?.repairCallsPerBatch ?? 0.6));
  const calls = 1 + batches * 2 + repairs;
  const englishChars = source.reduce((n, cue) => n + cue.text.length + 1, 0);
  const tokensIn = tokensForInput(Math.min(englishChars, 14_000) + 1500) + tokensForInput(englishChars * 2.2 + batches * 9000) + tokensForInput(englishChars * 3.4 + batches * 11000);
  const tokensOut = 900 + tokensForOutput(englishChars * 1.2 + batches * 500) + tokensForOutput(batches * 2500);
  const writes = 1 + batches + 1;
  const callsPerBatch = 2 + repairs / Math.max(1, batches);
  const batchesWithinLimits = Math.max(0, Math.min(batches, Math.floor((limits.calls - 1) / callsPerBatch), limits.writes - 2));
  return { words, durationSeconds: Math.round((source.at(-1)!.start + source.at(-1)!.duration - source[0].start)), scopes, batches,
    calls, tokensIn, tokensOut, writes: Math.min(writes, limits.writes), limits, fitsLimits: calls <= limits.calls && writes <= limits.writes,
    batchesWithinLimits, coverageWithinLimits: batches ? Math.round(100 * batchesWithinLimits / batches) : 100 };
}

export function newRun(videoId: string, kind: RunState["kind"], run: RunSource, captureHash: string, meta: RunState["meta"], previous?: RunState | null): RunState {
  const range = kind === "sample" ? sampleRange(run.source, RUN_LIMITS.sample.seconds) : [0, run.source.length - 1] as [number, number];
  const now = new Date().toISOString();
  const state: RunState = { schema: 2, kind, videoId, runId: randomUUID(), captureHash, status: "running", meta, sourceRange: range,
    limits: { calls: RUN_LIMITS[kind].calls, writes: RUN_LIMITS[kind].writes }, estimate: estimateRun(run, kind, range), usage: emptyUsage(),
    startedAt: now, updatedAt: now };
  // Reuse: same capture → same brief → same scope keys → finished scopes need no new calls.
  if (previous && previous.captureHash === captureHash && previous.brief) {
    state.brief = previous.brief;
    state.scopes = previous.scopes?.filter(s => s.range[0] >= range[0] && s.range[1] <= range[1]).map(s => ({ ...s, attempts: 0, budgetRepairs: 0, reviewRepairs: 0, reviewRetries: 0 }));
  }
  return state;
}

/* ---------------- budget ---------------- */

export function writesLeft(state: RunState) { return state.limits.writes - state.usage.writes; }
/** A batch may start only if, after saving it, one write is still left for the final save. */
export function canStartBatch(state: RunState) { return writesLeft(state) >= 2; }

export function monthlyStop(month: MonthUsage, state: RunState, pending: { calls?: number; tokens?: number } = {}) {
  const used = { ai_calls: (month.ai_calls ?? 0) + (pending.calls ?? 0), ai_tokens: (month.ai_tokens ?? 0) + (pending.tokens ?? 0), neon_bytes: month.neon_bytes ?? 0 };
  const over = (Object.keys(MONTHLY_LIMITS) as UsageMetric[]).find(metric => used[metric] >= MONTHLY_LIMITS[metric] / 2);
  void state;
  return over ? `Μηνιαίο όριο: ${over} στο 50% (${used[over]} / ${MONTHLY_LIMITS[over]}).` : null;
}

type Ctx = { run: RunSource; call: AiCall; deadline: number; now: () => number; month: MonthUsage; sinceSave: { calls: number; tokens: number } };

async function ai(state: RunState, ctx: Ctx, label: string, system: string, input: unknown, maxTokens: 900 | 1600 | 4000 | 6000,
  model: "deepseek-flash" | "deepseek-v4-pro" = "deepseek-v4-pro") {
  for (let attempt = 0; ; attempt++) {
    // Checked before every call, retries included.
    if (state.usage.calls + 1 > state.limits.calls) throw new RunStop("calls", `Εξαντλήθηκε το όριο των ${state.limits.calls} κλήσεων AI.`);
    const monthly = monthlyStop(ctx.month, state, ctx.sinceSave);
    if (monthly) throw new RunStop("monthly", monthly);
    if (ctx.deadline - ctx.now() < CALL_TIME_RESERVE_MS) throw new RunStop("time", "Τέλος χρόνου βήματος.");
    const inChars = chars(input) + system.length, started = ctx.now();
    state.usage.calls++; ctx.sinceSave.calls++;
    if (attempt) state.usage.retries++;
    const tokensIn = tokensForInput(inChars);
    state.usage.tokensIn += tokensIn; ctx.sinceSave.tokens += tokensIn;
    try {
      const output = await ctx.call(system, input, maxTokens, model);
      const outChars = chars(output), tokensOut = tokensForOutput(outChars);
      state.usage.tokensOut += tokensOut; ctx.sinceSave.tokens += tokensOut;
      state.usage.aiMs += ctx.now() - started;
      state.usage.log.push({ label, ok: true, ms: ctx.now() - started, inChars, outChars, ...(attempt ? { retry: true } : {}) });
      return output as Record<string, unknown>;
    } catch (error) {
      state.usage.failedCalls++; state.usage.aiMs += ctx.now() - started;
      state.usage.log.push({ label, ok: false, ms: ctx.now() - started, inChars, outChars: 0, ...(attempt ? { retry: true } : {}) });
      if (!(error instanceof WordAuthoringProviderError) || attempt >= 1) throw new RunStop("provider", `Ο πάροχος απέτυχε (${label}).`);
    }
  }
}

/* ---------------- one batch ---------------- */

function briefInput(source: TimedCue[], range: [number, number]) {
  const cues = source.slice(range[0], range[1] + 1);
  const full = cues.map(c => c.text).join(" ");
  if (full.length <= 14_000) return full;
  // Long video: evenly spaced excerpts (beginning, middle, end) so terminology from the whole talk is seen.
  const parts = 7, size = Math.floor(14_000 / parts), step = Math.floor(full.length / parts);
  return Array.from({ length: parts }, (_, i) => full.slice(i * step, i * step + size)).join(" […] ");
}

function packetFor(ctx: Ctx, state: RunState, scope: ScopeState) {
  const empty = ctx.run.source.map(cue => ({ ...cue, text: "" }));
  return buildWordAuthoringPacket(ctx.run.source, empty, ctx.run.evidence, scope.range, state.brief!);
}

type Built = { packet: WordAuthoringPacket; slots: Slot[]; events?: SubtitleEvent[]; problem?: string };
function build(ctx: Ctx, state: RunState, scope: ScopeState): Built {
  const packet = packetFor(ctx, state, scope), slots = slotsFor(packet);
  if (!scope.texts || scope.texts.length !== slots.length) return { packet, slots, problem: "missing translation" };
  const over = slots.map((slot, i) => Array.from(scope.texts![i] || "").length - slot.maxChars);
  if (over.some(n => n > 0)) return { packet, slots, problem: `${over.filter(n => n > 0).length} texts over maxChars` };
  try {
    const phrases = parseWordPhrases({ phrases: slots.map((slot, i) => ({ firstWordId: slot.firstWordId, lastWordId: slot.lastWordId, text: scope.texts![i] })) }, packet);
    return { packet, slots, events: authorWordPhrases(packet, phrases) };
  } catch (error) { return { packet, slots, problem: error instanceof Error ? error.message : "invalid" }; }
}

function textsFrom(response: Record<string, unknown>, id: string, count: number) {
  const items = Array.isArray(response.items) ? response.items as { id?: unknown; texts?: unknown }[] : [];
  const item = items.find(entry => entry?.id === id);
  return Array.isArray(item?.texts) && item.texts.length === count && item.texts.every(t => typeof t === "string" && t.trim())
    ? (item.texts as string[]).map(t => t.replace(/\s+/gu, " ").trim().replace(/,\s+(και|ή)(?=\s|$)/gu, " $1")
      // All-uppercase Greek words carry no tonos (house rule, mechanical).
      .replace(/[\p{Lu}\u0386-\u038F]{2,}/gu, word => word === word.toUpperCase() ? word.normalize("NFD").replace(/\u0301/gu, "").normalize("NFC") : word)) : null;
}

const slotView = (slots: Slot[], texts?: string[]) => slots.map((slot, i) => ({ english: slot.english, maxChars: slot.maxChars, ...(texts ? { text: texts[i] } : {}) }));

function reviewItem(id: string, built: Built) {
  const contextKey = wordSemanticKey(built.packet), events = built.events!;
  return { id, candidateHash: finalCandidateHash(contextKey, events), finalEvents: finalReviewEvents(events).map((event, i) => {
    const range = events[i].sourceWordRange!;
    return { eventId: event.eventId, text: event.text, english: built.packet.words.filter(w => Number(w.wordId.slice(1)) - 1 >= range[0] && Number(w.wordId.slice(1)) - 1 <= range[1]).map(w => w.text).join(" "),
      sourceWordIds: `${wordId(range[0])}–${wordId(range[1])}` };
  }) };
}

function accept(scope: ScopeState, built: Built, review: unknown) {
  const contextKey = wordSemanticKey(built.packet);
  const finalReview = validateFinalReview(review, contextKey, built.events!, built.packet.words.map(w => w.wordId));
  const packet = built.packet;
  scope.result = { status: "draft_ready", sourceHash: packet.sourceHash, translationHash: packet.translationHash, audioSha256: packet.audioSha256,
    wordTimelineHash: packet.wordTimelineHash, sourceCueRange: packet.sourceCueRange, modelBilingualQa: "approved", humanAudioReview: false,
    phrases: built.slots.map((slot, i) => ({ firstWordId: slot.firstWordId, lastWordId: slot.lastWordId, text: scope.texts![i], hardBreakBefore: false })),
    events: built.events!, finalReview };
  scope.status = "ready"; scope.issue = undefined;
}

function itemFrom(response: Record<string, unknown>, id: string) {
  const items = Array.isArray(response.items) ? response.items as Record<string, unknown>[] : [];
  const item = items.find(entry => entry?.id === id);
  if (!item) return null;
  const { id: _id, ...review } = item; void _id;
  return review;
}

/** Advances the run by at most one batch. Mutates state; throws RunStop when a cap or the step time is reached. */
export async function advanceBatch(state: RunState, ctx: Ctx) {
  if (!state.brief) {
    const brief = await ai(state, ctx, "brief", BRIEF_PROMPT, { transcript: briefInput(ctx.run.source, state.sourceRange) }, 1600, "deepseek-flash");
    if (typeof brief.mainTopic !== "string" || !Array.isArray(brief.glossary)) throw new RunStop("provider", "Η ανάλυση του βίντεο δεν επέστρεψε σωστή μορφή.");
    state.brief = { ...brief, glossary: (brief.glossary as unknown[]).filter(entry => entry && typeof (entry as { source?: unknown }).source === "string" && typeof (entry as { greek?: unknown }).greek === "string").slice(0, 30) };
  }
  if (!state.scopes) {
    const empty = ctx.run.source.map(cue => ({ ...cue, text: "" }));
    state.scopes = planWordAuthoring(ctx.run.source, empty, ctx.run.evidence, state.brief)
      .filter(s => s.range[0] >= state.sourceRange[0] && s.range[1] <= state.sourceRange[1])
      .map((s, i) => s.status === "ready" ? { id: `S${String(i + 1).padStart(3, "0")}`, range: s.range, status: "pending" as const }
        : { id: `S${String(i + 1).padStart(3, "0")}`, range: s.range, status: "flagged" as const, issue: s.issue || "Χρειάζεται έλεγχο χρονισμού." });
  }
  const batch: ScopeState[] = [];
  let words = 0;
  for (const scope of state.scopes) {
    if (scope.status !== "pending") continue;
    const count = packetFor(ctx, state, scope).words.length;
    if (batch.length && (batch.length >= BATCH_SCOPES || words + count > BATCH_WORDS)) break;
    batch.push(scope); words += count;
  }
  if (!batch.length) return;
  const globalBrief = state.brief;

  // 1. Translate (only scopes without saved texts: paid work is never repeated).
  const untranslated = batch.filter(scope => !scope.texts);
  if (untranslated.length) {
    const items = untranslated.map(scope => { const packet = packetFor(ctx, state, scope);
      return { id: scope.id, precedingEnglish: packet.readOnlyContext.precedingEnglish, followingEnglish: packet.readOnlyContext.followingEnglish, slots: slotView(slotsFor(packet)) }; });
    const response = await ai(state, ctx, "translate", BATCH_TRANSLATE_PROMPT, { globalBrief, items }, 6000);
    for (const scope of untranslated) {
      const texts = textsFrom(response, scope.id, slotsFor(packetFor(ctx, state, scope)).length);
      if (texts) scope.texts = texts;
      else if ((scope.attempts = (scope.attempts ?? 0) + 1) >= 2) { scope.status = "flagged"; scope.issue = "Η μετάφραση δεν επέστρεψε σωστή μορφή."; }
    }
  }

  // 2. One budget/validation repair call for every translated scope that does not fit yet.
  let built = new Map(batch.filter(s => s.texts && s.status === "pending").map(scope => [scope.id, build(ctx, state, scope)]));
  const broken = batch.filter(scope => built.get(scope.id)?.problem && (scope.budgetRepairs ?? 0) < 1);
  if (broken.length) {
    const response = await ai(state, ctx, "repair", BATCH_BUDGET_REPAIR_PROMPT, { globalBrief, items: broken.map(scope => {
      const b = built.get(scope.id)!; return { id: scope.id, issue: b.problem, slots: slotView(b.slots, scope.texts) }; }) }, 6000);
    for (const scope of broken) {
      scope.budgetRepairs = (scope.budgetRepairs ?? 0) + 1;
      const texts = textsFrom(response, scope.id, built.get(scope.id)!.slots.length);
      if (texts) { scope.texts = texts; built.set(scope.id, build(ctx, state, scope)); }
    }
  }
  for (const scope of batch) {
    const b = built.get(scope.id);
    if (b?.problem && (scope.budgetRepairs ?? 0) >= 1) { scope.status = "flagged"; scope.issue = `Χρειάζεται διόρθωση: ${b.problem}`.slice(0, 300); }
  }

  // 3. Independent meaning review of every candidate, then one repair round for findings.
  for (let round = 0; round < 2; round++) {
    const candidates = batch.filter(scope => scope.status === "pending" && built.get(scope.id)?.events);
    if (!candidates.length) break;
    const response = await ai(state, ctx, round ? "re-review" : "review", BATCH_REVIEW_PROMPT,
      { globalBrief, items: candidates.map(scope => reviewItem(scope.id, built.get(scope.id)!)) }, 4000);
    const findings: { scope: ScopeState; findings: unknown[] }[] = [];
    for (const scope of candidates) {
      const review = itemFrom(response, scope.id);
      try { accept(scope, built.get(scope.id)!, review); }
      catch (error) {
        const list = Array.isArray((review as { findings?: unknown })?.findings) ? (review as { findings: unknown[] }).findings : [];
        if (list.length && (scope.reviewRepairs ?? 0) < 1) findings.push({ scope, findings: list.slice(0, 20) });
        else if (!list.length && (scope.reviewRetries = (scope.reviewRetries ?? 0) + 1) < 2) { /* malformed: reviewed again next batch */ }
        else { scope.status = "flagged"; scope.issue = (list[0] as { explanation?: string })?.explanation?.slice(0, 300) || (error instanceof Error ? error.message : "Ο έλεγχος νοήματος απέτυχε."); }
      }
    }
    if (!findings.length || round) {
      for (const { scope, findings: list } of findings) { scope.status = "flagged"; scope.issue = (list[0] as { explanation?: string })?.explanation?.slice(0, 300) || "Ευρήματα ελέγχου νοήματος."; }
      break;
    }
    const repair = await ai(state, ctx, "review-repair", BATCH_REVIEW_REPAIR_PROMPT, { globalBrief, items: findings.map(({ scope, findings: list }) => ({
      id: scope.id, findings: list, slots: slotView(built.get(scope.id)!.slots, scope.texts) })) }, 6000);
    for (const { scope } of findings) {
      scope.reviewRepairs = (scope.reviewRepairs ?? 0) + 1;
      const texts = textsFrom(repair, scope.id, built.get(scope.id)!.slots.length);
      const next = texts ? build(ctx, state, { ...scope, texts }) : null;
      if (texts && next && !next.problem) { scope.texts = texts; built.set(scope.id, next); }
      else { scope.status = "flagged"; scope.issue = "Η διόρθωση μετά τον έλεγχο νοήματος δεν χωράει."; }
    }
    built = new Map(built);
  }
}

export function remainingIssues(state: RunState, source: TimedCue[]): AutoIssue[] {
  return (state.scopes ?? []).filter(scope => scope.status !== "ready").map(scope => {
    const cues = source.slice(scope.range[0], scope.range[1] + 1);
    return { start: cues[0].start, end: cues.at(-1)!.start + cues.at(-1)!.duration, english: cues.map(c => c.text).join(" ").slice(0, 300),
      issue: scope.status === "flagged" ? scope.issue || "Χρειάζεται έλεγχο." : "Δεν μεταφράστηκε ακόμα (όριο)." };
  });
}

/** Full-run publication package (pure). Throws when anything is missing or fails a gate. */
export function publicationPackage(state: RunState, run: RunSource, model: string) {
  const results = (state.scopes ?? []).map(scope => { if (scope.status !== "ready" || !scope.result) throw Error("Λείπει ολοκληρωμένο τμήμα."); return scope.result; });
  const empty = run.source.map(cue => ({ ...cue, text: "" }));
  const track = assembleWordAuthoring(run.source, empty, run.evidence, results, { numbers: false });
  return buildPublication(track.events, run.tokens, state.captureHash, model);
}

/** Sample measurement shown before a full run. */
export function measure(state: RunState) {
  const events = (state.scopes ?? []).flatMap(scope => scope.result?.events ?? []);
  const audit = events.length ? auditSubtitleEvents(events) : null;
  const cps = events.map(e => Array.from(e.text.replace(/\s+/gu, "")).length / e.duration);
  const batches = Math.max(1, state.usage.log.filter(l => l.label === "translate").length);
  const repairs = state.usage.log.filter(l => l.label === "repair" || l.label === "review-repair" || l.label === "re-review").length;
  return {
    calls: state.usage.calls, retries: state.usage.retries, failedCalls: state.usage.failedCalls, writes: state.usage.writes,
    tokensInEstimate: state.usage.tokensIn, tokensOutEstimate: state.usage.tokensOut, aiSeconds: Math.round(state.usage.aiMs / 1000),
    scopes: state.scopes?.length ?? 0, ready: state.scopes?.filter(s => s.status === "ready").length ?? 0,
    flagged: state.scopes?.filter(s => s.status === "flagged").length ?? 0, events: events.length,
    readable: audit?.readable ?? false, fastPages: audit?.fastPages ?? null, shortPages: audit?.shortPages ?? null,
    maxCps: cps.length ? Math.round(Math.max(...cps) * 10) / 10 : null, medianCps: cps.length ? Math.round([...cps].sort((a, b) => a - b)[Math.floor(cps.length / 2)] * 10) / 10 : null,
    repairCallsPerBatch: Math.round((repairs / batches) * 100) / 100, calls_log: state.usage.log,
  };
}

export const stateDigest = (state: RunState) => createHash("sha256").update(JSON.stringify(state.scopes ?? [])).digest("hex").slice(0, 12);

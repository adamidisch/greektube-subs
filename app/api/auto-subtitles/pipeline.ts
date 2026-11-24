import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { database } from "@/db/postgres";
import type { SubtitleAudioEvidence } from "@/app/subtitle-audio-evidence";
import type { TimedCue } from "@/app/subtitle-track";
import { TRANSCRIPT_VERSION } from "../shared-cache";
import { readSubtitleDraft, saveReviewedTrack } from "../subtitle-track-store";
import { advanceTranslationUnderstanding, compactUnderstandingForPrompt, readTranslationUnderstanding } from "../captions/translation-understanding";
import { advanceWordAuthoring, assembleWordAuthoring, buildWordAuthoringPacket, planWordAuthoring, wordAuthoringKey,
  WordAuthoringNeedsReview, type WordAuthoringCheckpoint, type WordAuthoringResult } from "../captions/word-authoring";
import { foundationSubtitleJson, WordAuthoringProviderError, type SubtitleModel } from "../captions/word-authoring-provider";
import { importOwnerSourceSrt } from "../owner-translation/import-source";
import { captureHashOf, captureTokens, evidenceFor, sourceCuesFromTokens, validateCapture,
  type CapturedToken, type YoutubeAsrCapture } from "./youtube-words";
import { buildPublication, type AutoIssue } from "./publication";

/**
 * Automatic subtitles: YouTube word timings → whole-video brief → Greek phrases per scope (DeepSeek via
 * Platform Foundation, with an independent review call) → readability and number gates → publication.
 * Each step runs for a bounded time, saves its progress and starts the next step itself.
 * Anything that fails a gate is held unpublished with the exact lines that need attention.
 */

export type AutoScope = { range: [number, number]; key: string; status: "pending" | "ready" | "flagged"; issue?: string; providerErrors?: number };
export type AutoJob = {
  schema: 1; videoId: string; runId: string;
  status: "running" | "held" | "published" | "failed";
  stage: "understanding" | "authoring" | "publishing" | "done";
  model: SubtitleModel; meta: { title: string; channel: string; duration: number };
  words: number; sourceCues: number; captureHash: string;
  scopes?: AutoScope[]; providerCalls: number; steps: number;
  startedAt: string; updatedAt: string; finishedAt?: string;
  leaseUntil?: number; leaseToken?: string; lastError?: string; providerFailures?: number;
  issues?: AutoIssue[]; published?: { events: number; fastPages: number; shortPages: number };
};
type StoredSource = { source: TimedCue[]; evidence: SubtitleAudioEvidence; tokens: [string, number, number, number, 0 | 1][] };

const STEP_MS = 200_000;
const CALL_RESERVE_MS = 62_000;
const CONCURRENCY = 10;
const MAX_PROVIDER_ERRORS = 4;
const REPAIR_ROUNDS = 2;
const LEASE_MS = 295_000;
const stateKey = (videoId: string) => `auto-subtitles:${videoId}`;
const dataPrefix = (job: Pick<AutoJob, "videoId" | "runId">) => `auto-subtitles/v1/${job.videoId}/${job.runId}`;

/** Translation model. deepseek-v4-pro is slower and timed out on the whole-video analysis (Foundation allows ~55 s per call). */
export function autoModel(): SubtitleModel {
  return process.env.AUTO_SUBTITLE_MODEL === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-flash";
}

/* ---------- state (Neon app_state: small JSON with optimistic concurrency) ---------- */

export async function readJob(videoId: string): Promise<{ job: AutoJob; version: string } | null> {
  const rows = await database().query("SELECT value, updated_at FROM app_state WHERE key=$1 LIMIT 1", [stateKey(videoId)]) as { value: string; updated_at: string }[];
  if (!rows[0]) return null;
  try { return { job: JSON.parse(rows[0].value) as AutoJob, version: String(rows[0].updated_at) }; } catch { return null; }
}

async function writeJob(job: AutoJob, version: string | null) {
  const now = new Date().toISOString();
  job.updatedAt = now;
  const value = JSON.stringify(job);
  const rows = version === null
    ? await database().query(`INSERT INTO app_state (key,value,created_at,updated_at) VALUES ($1,$2,$3,$3)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at RETURNING updated_at`, [stateKey(job.videoId), value, now])
    : await database().query("UPDATE app_state SET value=$2, updated_at=$3 WHERE key=$1 AND updated_at=$4 RETURNING updated_at", [stateKey(job.videoId), value, now, version]);
  return (rows as { updated_at: string }[])[0] ? String((rows as { updated_at: string }[])[0].updated_at) : null;
}

/* ---------- start ---------- */

export async function startJob(videoId: string, value: unknown) {
  const capture = validateCapture(value, videoId);
  const existing = await readJob(videoId);
  if (existing?.job.status === "running" && (existing.job.leaseUntil ?? 0) > Date.now())
    throw Error("Η αυτόματη επεξεργασία αυτού του βίντεο τρέχει ήδη.");
  const tokens = captureTokens(capture);
  const source = sourceCuesFromTokens(tokens).map(group => group.cue);
  const captureHash = captureHashOf(capture);
  const evidence = evidenceFor(source, tokens, captureHash);
  const now = new Date().toISOString();
  const job: AutoJob = { schema: 1, videoId, runId: randomUUID(), status: "running", stage: "understanding", model: autoModel(),
    meta: { title: String(capture.title || "").slice(0, 300), channel: String(capture.channel || "").slice(0, 200),
      duration: Math.max(Number(capture.durationSeconds) || 0, Math.ceil(source.at(-1)!.start + source.at(-1)!.duration)) },
    words: tokens.length, sourceCues: source.length, captureHash, providerCalls: 0, steps: 0, startedAt: now, updatedAt: now };
  const stored: StoredSource = { source, evidence, tokens: tokens.map(t => [t.piece, t.wordIndex, t.startMs, t.endMs, t.split ? 1 : 0]) };
  await Promise.all([
    put(`${dataPrefix(job)}/capture.json`, JSON.stringify(capture), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true }),
    put(`${dataPrefix(job)}/source.json`, JSON.stringify(stored), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true }),
  ]);
  if (!await writeJob(job, existing ? existing.version : null)) throw Error("Η αυτόματη επεξεργασία ξεκίνησε ήδη από άλλο παράθυρο.");
  return job;
}

/** Makes flagged scopes eligible again (e.g. after a provider outage) without repeating finished work. */
export async function resumeJob(videoId: string) {
  const current = await readJob(videoId);
  if (!current) throw Error("Δεν υπάρχει αυτόματη επεξεργασία για αυτό το βίντεο.");
  const job = current.job;
  if (job.status === "published") return job;
  job.status = "running"; job.lastError = undefined; job.issues = undefined; job.leaseUntil = undefined;
  if (job.stage === "done") job.stage = job.scopes ? "authoring" : "understanding";
  for (const scope of job.scopes ?? []) if (scope.status === "flagged" && scope.issue?.startsWith("provider:")) { scope.status = "pending"; scope.issue = undefined; scope.providerErrors = 0; }
  if (job.scopes?.every(scope => scope.status === "ready")) job.stage = "publishing";
  if (!await writeJob(job, current.version)) throw Error("Η κατάσταση άλλαξε. Δοκίμασε ξανά.");
  return job;
}

/* ---------- one bounded step ---------- */

const sourceCache = new Map<string, StoredSource>();
async function loadSource(job: AutoJob) {
  const path = `${dataPrefix(job)}/source.json`;
  const cached = sourceCache.get(path);
  if (cached) return cached;
  const stored = await readSubtitleDraft(path) as StoredSource | null;
  if (!stored?.source?.length || !stored.evidence || !Array.isArray(stored.tokens)) throw Error("Λείπουν οι λέξεις του βίντεο.");
  sourceCache.clear(); sourceCache.set(path, stored);
  return stored;
}

function cleanPhrases(value: unknown) {
  // House rule, mechanical: no comma before «και» / «ή».
  const row = value as { phrases?: { text?: unknown }[] } | null;
  if (row && Array.isArray(row.phrases)) for (const phrase of row.phrases)
    if (phrase && typeof phrase.text === "string") phrase.text = phrase.text.replace(/,\s+(και|ή)(?=\s|$)/gu, " $1");
  return value;
}

function provider(job: AutoJob, model: SubtitleModel = job.model) {
  return async (system: string, input: unknown, maxTokens = 4000) => {
    const allowed = ([900, 1600, 4000, 6000] as const).find(limit => limit >= maxTokens) ?? 6000;
    job.providerCalls += 1;
    return cleanPhrases(await foundationSubtitleJson(system, input, { maxTokens: allowed, model }));
  };
}

function scopeIssue(source: TimedCue[], range: [number, number], issue: string): AutoIssue {
  const cues = source.slice(range[0], range[1] + 1);
  return { start: cues[0].start, end: cues.at(-1)!.start + cues.at(-1)!.duration,
    english: cues.map(cue => cue.text).join(" ").slice(0, 600), issue: issue.slice(0, 300) };
}

export async function runStep(videoId: string, runId: string) {
  const started = Date.now(), deadline = started + STEP_MS;
  const current = await readJob(videoId);
  if (!current || current.job.runId !== runId || current.job.status !== "running") return { continue: false, backoff: false, job: current?.job ?? null };
  // Another step still holds the lease (e.g. an invocation that timed out): wait for it to expire.
  if ((current.job.leaseUntil ?? 0) > Date.now()) return { continue: true, backoff: true, job: current.job };
  const job = current.job, leaseToken = randomUUID();
  job.leaseUntil = Date.now() + LEASE_MS; job.leaseToken = leaseToken; job.steps += 1;
  let version = await writeJob(job, current.version);
  if (!version) return { continue: true, backoff: true, job: null };
  try {
    const { source, evidence } = await loadSource(job);
    const translation = source.map(cue => ({ ...cue, text: "" }));
    const call = provider(job);

    if (job.stage === "understanding") {
      while (Date.now() < deadline - CALL_RESERVE_MS) {
        // The whole-video analysis always uses the fast model: long sections must answer within Foundation's time limit.
        const analyse = provider(job, "deepseek-flash");
        const result = await advanceTranslationUnderstanding(videoId, TRANSCRIPT_VERSION, source, {
          send: async (system, user, maxTokens) => await analyse(system, user, maxTokens) as Record<string, unknown>,
        });
        if (result.status === "analysis_ready") { job.stage = "authoring"; break; }
      }
    }

    if (job.stage === "authoring") {
      const understanding = await readTranslationUnderstanding(videoId, TRANSCRIPT_VERSION, source);
      if (!understanding) throw Error("Λείπει η συνολική ανάλυση του βίντεο.");
      const brief = JSON.parse(compactUnderstandingForPrompt(understanding)) as Record<string, unknown>;
      if (!job.scopes) {
        job.scopes = planWordAuthoring(source, translation, evidence, brief).map(scope => scope.status === "ready"
          ? { range: scope.range, key: scope.key!, status: "pending" as const }
          : { range: scope.range, key: "", status: "flagged" as const, issue: scope.issue || "Χρειάζεται έλεγχο χρονισμού." });
      }
      const pending = job.scopes.filter(scope => scope.status === "pending");
      const worker = async () => {
        for (let scope = pending.shift(); scope; scope = pending.shift()) await advanceScope(job, scope, source, translation, evidence, brief, call, deadline);
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
      if (job.scopes.every(scope => scope.status !== "pending")) {
        const flagged = job.scopes.filter(scope => scope.status === "flagged");
        if (flagged.length) hold(job, flagged.map(scope => scopeIssue(source, scope.range, scope.issue || "Χρειάζεται έλεγχο.")));
        else job.stage = "publishing";
      }
    }

    if (job.stage === "publishing" && job.status === "running" && Date.now() < deadline - 20_000) await publish(job, source, translation, evidence);
    job.providerFailures = 0;
  } catch (error) {
    job.lastError = error instanceof Error ? error.message.slice(0, 400) : "Άγνωστο σφάλμα";
    const providerOutage = error instanceof WordAuthoringProviderError && (job.providerFailures = (job.providerFailures ?? 0) + 1) < 6;
    if (!providerOutage) { job.status = "failed"; job.stage = "done"; job.finishedAt = new Date().toISOString(); }
    console.warn("[auto-subtitles:step-failed]", JSON.stringify({ videoId, stage: job.stage, error: job.lastError }));
  }
  job.leaseUntil = undefined; job.leaseToken = undefined;
  // Re-read to keep the optimistic version chain; the lease guarantees nobody else wrote meanwhile.
  const latest = await readJob(videoId);
  if (latest?.job.leaseToken === leaseToken) version = latest.version;
  await writeJob(job, version);
  return { continue: job.status === "running", backoff: Boolean(job.providerFailures), job };
}

function hold(job: AutoJob, issues: AutoIssue[]) {
  job.status = "held"; job.stage = "done"; job.finishedAt = new Date().toISOString();
  job.issues = issues.slice(0, 200);
}

async function advanceScope(job: AutoJob, scope: AutoScope, source: TimedCue[], translation: TimedCue[],
  evidence: SubtitleAudioEvidence, brief: Record<string, unknown>, call: ReturnType<typeof provider>, deadline: number) {
  const packet = buildWordAuthoringPacket(source, translation, evidence, scope.range, brief);
  if (wordAuthoringKey(packet) !== scope.key) { scope.status = "flagged"; scope.issue = "Το τμήμα άλλαξε."; return; }
  const path = `${dataPrefix(job)}/scopes/${scope.key}.json`;
  const cache = (await readSubtitleDraft(path).catch(() => null) as WordAuthoringCheckpoint | null) ?? {};
  const checkpoint = async () => { await put(path, JSON.stringify(cache), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true }); };
  while (Date.now() < deadline - CALL_RESERVE_MS) {
    try {
      const result = await advanceWordAuthoring(packet, cache, (system, input) => call(system, input, 4000), checkpoint, { repairRounds: REPAIR_ROUNDS });
      if (result.status === "draft_ready") { scope.status = "ready"; return; }
    } catch (error) {
      if (error instanceof WordAuthoringProviderError) {
        scope.providerErrors = (scope.providerErrors ?? 0) + 1;
        if (scope.providerErrors >= MAX_PROVIDER_ERRORS) { scope.status = "flagged"; scope.issue = `provider: ο πάροχος απέτυχε (${error.status}).`; }
        return;
      }
      scope.status = "flagged";
      scope.issue = error instanceof WordAuthoringNeedsReview || error instanceof Error ? error.message : "Χρειάζεται έλεγχο.";
      return;
    }
  }
}

/* ---------- publication ---------- */

async function publish(job: AutoJob, source: TimedCue[], translation: TimedCue[], evidence: SubtitleAudioEvidence) {
  const { tokens: rawTokens } = await loadSource(job);
  const tokens: CapturedToken[] = rawTokens.map(([piece, wordIndex, startMs, endMs, split]) => ({ piece, wordIndex, startMs, endMs, split: split === 1 }));
  const results: WordAuthoringResult[] = [];
  for (const scope of job.scopes ?? []) {
    const saved = await readSubtitleDraft(`${dataPrefix(job)}/scopes/${scope.key}.json`) as WordAuthoringCheckpoint | null;
    if (!saved?.result) throw Error("Λείπει ολοκληρωμένο τμήμα μετάφρασης.");
    results.push(saved.result);
  }
  let track: ReturnType<typeof assembleWordAuthoring>;
  // No cue-level Greek exists here: numbers were checked against the English per scope and are checked per event below.
  try { track = assembleWordAuthoring(source, translation, evidence, results, { numbers: false }); }
  catch (error) {
    const assembled = results.flatMap(result => result.events);
    hold(job, [{ start: assembled[0]?.start ?? 0, end: assembled.at(-1) ? assembled.at(-1)!.start + assembled.at(-1)!.duration : 0, english: "",
      issue: error instanceof Error ? error.message : "Η συναρμολόγηση απέτυχε." }]);
    return;
  }

  const built = buildPublication(track.events, tokens, job.captureHash, job.model);
  if (built.issues) { hold(job, built.issues); return; }
  const { reviewed, englishSrt, greekSrt } = built as Required<typeof built>;
  await saveReviewedTrack(job.videoId, reviewed);
  await importOwnerSourceSrt(job.videoId, englishSrt, greekSrt, job.meta);
  job.status = "published"; job.stage = "done"; job.finishedAt = new Date().toISOString();
  job.published = { events: reviewed.events.length, fastPages: reviewed.audit.fastPages, shortPages: reviewed.audit.shortPages };
}

/** Status for the admin UI: no texts beyond the flagged lines. */
export function jobSummary(job: AutoJob) {
  const scopes = job.scopes ?? [];
  return { videoId: job.videoId, runId: job.runId, status: job.status, stage: job.stage, model: job.model, words: job.words,
    scopes: { total: scopes.length, ready: scopes.filter(s => s.status === "ready").length, flagged: scopes.filter(s => s.status === "flagged").length },
    providerCalls: job.providerCalls, steps: job.steps, startedAt: job.startedAt, updatedAt: job.updatedAt, finishedAt: job.finishedAt,
    running: (job.leaseUntil ?? 0) > Date.now(), lastError: job.lastError, issues: job.issues, published: job.published };
}

/** No step has written for 6 minutes although the job is running: its workflow run is gone. */
export function isStalled(job: AutoJob) {
  return job.status === "running" && (job.leaseUntil ?? 0) < Date.now() && Date.now() - Date.parse(job.updatedAt) > 360_000;
}

export type { YoutubeAsrCapture };

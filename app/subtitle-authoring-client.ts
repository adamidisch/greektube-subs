import { subtitleSourceWords, validateAudioEvidence, type SubtitleAudioEvidence } from "./subtitle-audio-evidence.ts";
import type { TimedCue } from "./subtitle-track.ts";

export type AuthoringScope = { range: [number, number]; key?: string;
  status: "ready" | "alignment_review_required"; phase?: "translation_ready" | "draft_ready" | "manual_review_required" };
export type AuthoringJob = { schemaVersion: 1; videoId: string; sourceHash: string; translationHash: string;
  audioEvidence: SubtitleAudioEvidence; evidenceKey?: string; scopes: AuthoringScope[]; retryAt?: number; fileName: string };
export class AuthoringClientError extends Error {
  readonly code: string;
  readonly retryAt?: number;
  constructor(code: string, retryAt?: number) { super(code); this.code = code; this.retryAt = retryAt; }
}
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
  .map(n => n.toString(16).padStart(2, "0")).join("");

/** Raw worker diagnostics are compacted locally. No audio or transcript is sent to a model here. */
export async function importWordTiming(value: unknown, source: TimedCue[], sourceHash: string): Promise<SubtitleAudioEvidence> {
  if (!value || typeof value !== "object") throw new AuthoringClientError("format");
  const row = value as Record<string, unknown>;
  if (row.audioEvidence) {
    const evidence = row.audioEvidence as SubtitleAudioEvidence;
    if (evidence.sourceHash !== sourceHash) throw new AuthoringClientError("source");
    return validateAudioEvidence(evidence, source, { overlapScope: [-1, -1] }).evidence;
  }
  if (!Array.isArray(row.words) || !source.length) throw new AuthoringClientError("format");
  const canonical = source.map((cue, index) => `${index + 1}|${Math.round(cue.start * 1000)}|${Math.round((cue.start + cue.duration) * 1000)}|${cue.text.replace(/\s+/gu, " ").trim()}\n`).join("");
  if (await hash(canonical) !== row.sourceHash) throw new AuthoringClientError("source");
  const tokens = subtitleSourceWords(source);
  if (tokens.length !== row.words.length) throw new AuthoringClientError("coverage");
  const words = row.words.map((item: unknown, index: number) => {
    if (!item || typeof item !== "object") throw new AuthoringClientError("format");
    const w = item as Record<string, unknown>, token = tokens[index];
    if (w.source_index !== index || w.word_id !== `W${String(index + 1).padStart(6, "0")}` || w.cue_id !== token.cueIndex + 1 || w.text !== token.text)
      throw new AuthoringClientError("coverage");
    if (typeof w.confidence !== "number" || !Number.isFinite(w.confidence) || w.confidence < 0 || w.confidence > 1
      || !["forced_alignment", "estimated"].includes(String(w.timing_evidence))) throw new AuthoringClientError("format");
    return [w.start_ms, w.end_ms, Math.floor(w.confidence * 1000), w.timing_evidence === "forced_alignment" ? 1 : 0];
  });
  // The compact integer timeline has its own reproducible digest. Do not assert that this
  // digest is the worker's diagnostic JSON hash (Python and JS encode floats differently).
  const wordTimelineHash = await hash(JSON.stringify({ audioSha256: row.audioSha256, sourceHash, words }));
  return validateAudioEvidence({ schemaVersion: 1, sourceHash, audioSha256: row.audioSha256,
    wordTimelineHash, model: row.model, method: row.method, words }, source, { overlapScope: [-1, -1] }).evidence;
}

export function parseAuthoringPlan(value: unknown): AuthoringScope[] {
  const data = value as { status?: unknown; scopes?: unknown } | null;
  if (!data || data.status !== "planned" || !Array.isArray(data.scopes) || !data.scopes.length || data.scopes.length > 30_000)
    throw new AuthoringClientError("response");
  let next = 0;
  return data.scopes.map(item => {
    if (!item || typeof item !== "object") throw new AuthoringClientError("response");
    const s = item as AuthoringScope;
    if (!Array.isArray(s.range) || s.range.length !== 2 || !s.range.every(Number.isInteger) || s.range[0] !== next || s.range[1] < next
      || !["ready", "alignment_review_required"].includes(s.status) || (s.status === "ready" && (typeof s.key !== "string" || !/^[a-f0-9]{64}$/u.test(s.key))))
      throw new AuthoringClientError("response");
    next = s.range[1] + 1;
    return { range: s.range, key: s.key, status: s.status };
  });
}

export async function authoringRequest(body: unknown, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  let response: Response;
  try { response = await fetcher("/api/subtitle-authoring", { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new AuthoringClientError("network"); }
  if (!response.ok) {
    const header = response.headers.get("Retry-After");
    const seconds = header && /^\d+$/u.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : 0;
    const retryAt = seconds > 0 ? Date.now() + Math.min(seconds, 86_400) * 1000 : undefined;
    // Only stable server codes can select user-facing copy. Never display arbitrary response text.
    let serverCode: unknown;
    try { serverCode = (await response.json() as { code?: unknown }).code; } catch { /* legacy/non-JSON error */ }
    const conflictCodes = ["changed", "busy", "preview", "timing_missing", "understanding_required"];
    const conflictCode = typeof serverCode === "string" && conflictCodes.includes(serverCode) ? serverCode : "changed";
    throw new AuthoringClientError(response.status === 401 ? "auth" : response.status === 429 ? "cooldown" : response.status === 409 ? conflictCode : response.status === 422 ? "repair" : "provider", retryAt);
  }
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new AuthoringClientError("response"); }
}

export function authoringCounts(job: AuthoringJob) {
  return { ready: job.scopes.filter(s => s.status === "ready").length,
    complete: job.scopes.filter(s => s.status === "ready" && s.phase === "draft_ready").length,
    blocked: job.scopes.filter(s => s.status !== "ready" || s.phase === "manual_review_required").length,
    remaining: job.scopes.filter(s => s.status === "ready" && s.phase !== "draft_ready" && s.phase !== "manual_review_required").length };
}
const jobBody = (job: AuthoringJob) => ({ videoId: job.videoId, sourceHash: job.sourceHash,
  translationHash: job.translationHash, ...(job.evidenceKey ? { evidenceKey: job.evidenceKey } : { audioEvidence: job.audioEvidence }) });

/** Explicit foreground batch. Pause is checked between stages. No retry, timer or polling. */
export async function runAuthoringBatch(initial: AuthoringJob, limit: number, stopped: () => boolean,
  save: (job: AuthoringJob) => Promise<void>, send: typeof authoringRequest = authoringRequest): Promise<AuthoringJob> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 30_000) throw new AuthoringClientError("format");
  let job = structuredClone(initial), completed = 0;
  if (job.retryAt && job.retryAt > Date.now()) throw new AuthoringClientError("cooldown", job.retryAt);
  for (let index = 0; index < job.scopes.length && completed < limit; index++) {
    const scope = job.scopes[index];
    if (scope.status !== "ready" || scope.phase === "draft_ready" || scope.phase === "manual_review_required") continue;
    for (let stage = 0; stage < 2 && job.scopes[index].phase !== "draft_ready"; stage++) {
      if (stopped()) return job;
      try {
        const result = await send({ ...jobBody(job), action: "advance", sourceCueRange: scope.range, key: scope.key });
        if (result.key !== scope.key || JSON.stringify(result.sourceCueRange) !== JSON.stringify(scope.range)
          || !["translation_ready", "draft_ready"].includes(String(result.status))) throw new AuthoringClientError("response");
        job.scopes[index].phase = result.status as "translation_ready" | "draft_ready";
        delete job.retryAt;
        await save(structuredClone(job));
      } catch (error) {
        if (error instanceof AuthoringClientError) {
          if (error.retryAt) job.retryAt = error.retryAt;
          if (error.code === "repair") job.scopes[index].phase = "manual_review_required";
          await save(structuredClone(job));
        }
        throw error;
      }
    }
    if (job.scopes[index].phase !== "draft_ready") throw new AuthoringClientError("response");
    completed++;
    job = structuredClone(job);
  }
  return job;
}

export function authoringAssemblyBody(job: AuthoringJob) {
  const counts = authoringCounts(job);
  if (counts.blocked || counts.complete !== job.scopes.length) throw new AuthoringClientError("incomplete");
  return { ...jobBody(job), action: "assemble", scopes: job.scopes.map(s => ({ range: s.range, key: s.key })) };
}

/** IndexedDB stores the bounded local timing evidence without filling synchronous localStorage. */
export async function authoringJobStorage(videoId: string, job?: AuthoringJob): Promise<AuthoringJob | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("greektube-subtitle-authoring", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("jobs")) request.result.createObjectStore("jobs", { keyPath: "videoId" });
      if (!request.result.objectStoreNames.contains("timings")) request.result.createObjectStore("timings");
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new AuthoringClientError("storage"));
    request.onblocked = () => reject(new AuthoringClientError("storage"));
  });
  try {
    return await new Promise<AuthoringJob | null>((resolve, reject) => {
      const transaction = db.transaction(["jobs", "timings"], job ? "readwrite" : "readonly");
      const jobs = transaction.objectStore("jobs"), timings = transaction.objectStore("timings");
      let result: AuthoringJob | null = job ?? null;
      if (job) {
        const timingStorageKey = `${videoId}/${job.sourceHash}/${job.audioEvidence.wordTimelineHash}`;
        const exists = timings.getKey(timingStorageKey);
        exists.onsuccess = () => { if (exists.result === undefined) timings.put(job.audioEvidence, timingStorageKey); };
        const previous = jobs.get(videoId);
        previous.onsuccess = () => { const key = previous.result?.timingStorageKey ?? previous.result?.evidenceKey; if (key && key !== timingStorageKey) timings.delete(key); };
        const { audioEvidence: _evidence, ...metadata } = job;
        void _evidence;
        jobs.put({ ...metadata, timingStorageKey });
      } else {
        const read = jobs.get(videoId);
        read.onsuccess = () => {
          const row = read.result;
          if (!row) return;
          if (row.audioEvidence) { result = row as AuthoringJob; return; } // Earlier local draft format.
          const evidence = timings.get(row.timingStorageKey ?? row.evidenceKey);
          evidence.onsuccess = () => { if (evidence.result) { const { timingStorageKey: _key, ...metadata } = row; void _key; if (!row.timingStorageKey) delete metadata.evidenceKey; result = { ...metadata, audioEvidence: evidence.result }; } };
        };
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(new AuthoringClientError("storage"));
      transaction.onabort = () => reject(new AuthoringClientError("storage"));
    });
  } finally { db.close(); }
}

import { captureHashOf, captureTokens, evidenceFor, sourceCuesFromTokens, validateCapture, type YoutubeAsrCapture } from "./youtube-words.ts";
import { advanceBatch, canStartBatch, healFlagged, measure, monthlyStop, newRun, publicationPackage, remainingIssues, RUN_LIMITS, RunStop,
  type AiCall, type RunSource, type RunState } from "./batched.ts";
import type { createRunStore } from "./run-store.ts";

export type DriveDeps = {
  store: ReturnType<typeof createRunStore>;
  call: AiCall;
  /** Publishes a finished full run (Neon + GitHub mirror); false when the publication did not complete. */
  publish: (state: RunState, built: ReturnType<typeof publicationPackage>) => Promise<boolean>;
  stepMs?: number; now?: () => number;
};

function sourceFrom(capture: YoutubeAsrCapture): { run: RunSource; captureHash: string } {
  const tokens = captureTokens(capture);
  const source = sourceCuesFromTokens(tokens).map(group => group.cue);
  const captureHash = captureHashOf(capture);
  return { run: { source, evidence: evidenceFor(source, tokens, captureHash), tokens }, captureHash };
}

/** Starts a run (write 1). Without a capture, continues from the latest run of the same kind, reusing its work. */
export async function startRun(deps: DriveDeps, videoId: string, kind: RunState["kind"], captureValue?: unknown) {
  const now = deps.now ?? Date.now;
  const previous = await deps.store.latest(videoId, kind);
  if (previous?.state.status === "running" && now() - Date.parse(previous.state.updatedAt) < 6 * 60_000)
    throw Error("Η αυτόματη επεξεργασία αυτού του βίντεο τρέχει ήδη.");
  let run: RunSource, captureHash: string, meta: RunState["meta"];
  if (captureValue) {
    let capture = validateCapture(captureValue, videoId);
    if (kind === "sample") capture = { ...capture, events: capture.events.filter(event => event[0] < RUN_LIMITS.sample.seconds * 1000) };
    ({ run, captureHash } = sourceFrom(capture));
    meta = { title: String(capture.title || "").slice(0, 300), channel: String(capture.channel || "").slice(0, 200),
      duration: Math.max(Number(capture.durationSeconds) || 0, Math.ceil(run.source.at(-1)!.start + run.source.at(-1)!.duration)) };
  } else {
    const loaded = previous ? await deps.store.load(previous.state.runId) : null;
    if (!loaded) throw Error("Χρειάζεται η λήψη λέξεων από το YouTube.");
    run = loaded.source; captureHash = loaded.state.captureHash; meta = loaded.state.meta;
  }
  const state = newRun(videoId, kind, run, captureHash, meta, previous?.state);
  const monthly = monthlyStop(await deps.store.monthUsage(), state);
  if (monthly) throw Error(monthly);
  await deps.store.create(state, run);
  return state;
}

/** One bounded step: batches while time and the write budget allow, one save per batch, final save always possible. */
export async function runStep(deps: DriveDeps, runId: string) {
  const now = deps.now ?? Date.now;
  const loaded = await deps.store.load(runId);
  if (!loaded || loaded.state.status !== "running") return { continue: false, state: loaded?.state ?? null };
  const { state, source: run } = loaded;
  let version = loaded.version, readBytes = loaded.bytes;
  const ctx = { run, call: deps.call, deadline: now() + (deps.stepMs ?? 270_000), now, month: await deps.store.monthUsage(), sinceSave: { calls: 0, tokens: 0 } };
  const save = async () => {
    version = await deps.store.save(state, version, { ai_calls: ctx.sinceSave.calls, ai_tokens: ctx.sinceSave.tokens, neon_bytes: readBytes });
    ctx.month.ai_calls = (ctx.month.ai_calls ?? 0) + ctx.sinceSave.calls; ctx.month.ai_tokens = (ctx.month.ai_tokens ?? 0) + ctx.sinceSave.tokens;
    ctx.sinceSave = { calls: 0, tokens: 0 }; readBytes = 0;
  };
  const finish = async (status: RunState["status"], reason?: string) => {
    state.status = status; state.stopReason = reason; state.finishedAt = new Date(now()).toISOString();
    state.remaining = remainingIssues(state, run.source);
    if (state.kind === "sample") state.measurement = measure(state);
    await save();
  };
  try {
    while (state.status === "running") {
      if (!canStartBatch(state)) { await finish("budget_exhausted", `Εξαντλήθηκε το όριο των ${state.limits.writes} εγγραφών· η τελευταία κρατήθηκε για αυτή την αποθήκευση.`); break; }
      await advanceBatch(state, ctx);
      if (state.scopes && state.scopes.every(scope => scope.status !== "pending")) {
        if (state.scopes.some(scope => scope.status === "flagged")) {
          // Self-healing: flagged scopes get another measured pass inside the same caps before anyone is asked to look.
          if (healFlagged(state)) { await save(); continue; }
          await finish("held", "Κάποια τμήματα χρειάζονται έλεγχο."); break;
        }
        if (state.kind === "sample") { await finish("complete"); break; }
        try {
          const built = publicationPackage(state, run, "deepseek-v4-pro");
          if (built.issues) { state.issues = built.issues; await finish("held", "Ο έλεγχος αριθμών βρήκε διαφορές."); break; }
          if (!await deps.publish(state, built)) throw Error("Η δημοσίευση σε Neon και GitHub δεν ολοκληρώθηκε.");
          state.published = { events: built.reviewed!.events.length, fastPages: built.reviewed!.audit.fastPages, shortPages: built.reviewed!.audit.shortPages };
          await finish("published");
        } catch (error) { state.lastError = error instanceof Error ? error.message : "Η δημοσίευση απέτυχε."; await finish("held", state.lastError); }
        break;
      }
      await save(); // this batch's progress: one write
    }
  } catch (error) {
    if (error instanceof RunStop && error.reason === "time") await save();
    else if (error instanceof RunStop) await finish(error.reason === "provider" ? "held" : "budget_exhausted", error.message);
    else { state.lastError = error instanceof Error ? error.message.slice(0, 400) : "Άγνωστο σφάλμα"; await finish("failed", state.lastError); }
  }
  return { continue: state.status === "running", state };
}

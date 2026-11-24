import { sleep } from "workflow";

/**
 * Durable driver of one automatic-subtitles run (Vercel Workflow). Each step is a bounded invocation of runStep,
 * which saves progress once per batch; caps on AI calls and writes live in the run itself.
 */
export async function autoSubtitlesWorkflow(runId: string) {
  "use workflow";
  for (let step = 0; step < 40; step++) {
    const result = await autoSubtitlesStep(runId);
    if (!result.continue) return result.status;
    await sleep("5s");
  }
  return "step-limit";
}

async function autoSubtitlesStep(runId: string) {
  "use step";
  const { runStep } = await import("./runner");
  const result = await runStep(runId);
  return { continue: result.continue, status: result.state?.status ?? null };
}
// A platform retry would repeat paid calls: the run's own caps and per-batch saves handle failures instead.
autoSubtitlesStep.maxRetries = 0;

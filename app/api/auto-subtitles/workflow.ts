import { sleep } from "workflow";

/**
 * Durable driver of one automatic-subtitles job (Vercel Workflow). Each step is a separate, bounded
 * invocation of runStep; the platform schedules the next one, so there is no self-invocation chain.
 */
export async function autoSubtitlesWorkflow(videoId: string, runId: string) {
  "use workflow";
  for (let step = 0; step < 300; step++) {
    const result = await autoSubtitlesStep(videoId, runId);
    if (!result.continue) return result.status;
    if (result.backoff) await sleep("30s");
  }
  return "step-limit";
}

async function autoSubtitlesStep(videoId: string, runId: string) {
  "use step";
  const { runStep } = await import("./pipeline");
  const result = await runStep(videoId, runId);
  return { continue: result.continue, backoff: Boolean(result.backoff), status: result.job?.status ?? null };
}
// runStep keeps its own checkpoints and lease; a platform retry must not double-count provider failures.
autoSubtitlesStep.maxRetries = 2;

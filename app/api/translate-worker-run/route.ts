import { GET as runWorker } from "../translate-worker/route";
import {
  acquireProcessingLock,
  getTranscript,
  releaseProcessingLock,
  resetProcessingForTranslation,
} from "../shared-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function healStaleMarkupCheckpoint(videoId: string) {
  const record = await getTranscript(videoId);
  if (!record || record.status !== "processing" || !record.rawEnglishTranscript.length) return false;
  const staleMarkup = record.englishTranscript.some(cue => /<break\b[^>]*\/?\s*>/iu.test(cue.text));
  if (!staleMarkup) return false;

  const token = crypto.randomUUID();
  if (!await acquireProcessingLock(videoId, token, true)) return false;
  try {
    if (!await resetProcessingForTranslation(videoId, token, true)) {
      throw new Error("stale-markup-reset-failed");
    }
    if (!await releaseProcessingLock(videoId, token)) {
      throw new Error("stale-markup-reset-release-failed");
    }
    return true;
  } catch (error) {
    await releaseProcessingLock(videoId, token).catch(() => undefined);
    throw error;
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let lastResponse: Response | null = null;
  let knownVideoId: string | null = null;

  for (let attempt = 0; attempt < 48 && Date.now() - startedAt < 240_000; attempt += 1) {
    lastResponse = await runWorker(request);
    const payload = await lastResponse.clone().json().catch(() => null) as {
      retryAfter?: string | null;
      stage?: string | null;
      videoId?: string | null;
    } | null;

    if (payload?.videoId) knownVideoId = payload.videoId;

    if (lastResponse.status !== 202) {
      if (knownVideoId && /Translation temporarily failed for 1 cue/.test(String((payload as { error?: unknown } | null)?.error || ""))) {
        const healed = await healStaleMarkupCheckpoint(knownVideoId);
        if (healed) {
          await sleep(250);
          continue;
        }
      }
      return lastResponse;
    }

    if (payload?.retryAfter) {
      const retryAt = new Date(payload.retryAfter).getTime();
      if (Number.isFinite(retryAt)) {
        const waitMs = retryAt - Date.now();
        if (waitMs > 1_500) return lastResponse;
        if (waitMs > 0) await sleep(waitMs + 250);
      }
    }

    // Provider-safe pacing. Translation batches are deliberately resumable,
    // so throughput is less important than avoiding synchronized 429 bursts
    // from the primary and fallback providers.
    if (payload?.stage === "translate") await sleep(1_750);
    else await sleep(250);
  }

  return lastResponse || Response.json({ error: "translation-runner-no-response" }, { status: 500 });
}

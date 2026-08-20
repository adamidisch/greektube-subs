import { GET as runWorker } from "../translate-worker/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const startedAt = Date.now();
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < 48 && Date.now() - startedAt < 240_000; attempt += 1) {
    lastResponse = await runWorker(request);
    if (lastResponse.status !== 202) return lastResponse;

    const payload = await lastResponse.clone().json().catch(() => null) as {
      retryAfter?: string | null;
      stage?: string | null;
    } | null;

    if (payload?.retryAfter) {
      const retryAt = new Date(payload.retryAfter).getTime();
      if (Number.isFinite(retryAt) && retryAt - Date.now() > 1_500) return lastResponse;
    }
  }

  return lastResponse || Response.json({ error: "translation-runner-no-response" }, { status: 500 });
}

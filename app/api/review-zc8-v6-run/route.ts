import { GET as runReviewAction } from "../review-zc8-v6/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_GROQ_CONCURRENCY = 2;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function createRateLimitedFetch(originalFetch: typeof fetch) {
  let activeGroq = 0;
  const waiting: Array<() => void> = [];

  const acquire = async () => {
    if (activeGroq < MAX_GROQ_CONCURRENCY) {
      activeGroq += 1;
      return;
    }
    await new Promise<void>(resolve => waiting.push(resolve));
    activeGroq += 1;
  };

  const release = () => {
    activeGroq = Math.max(0, activeGroq - 1);
    waiting.shift()?.();
  };

  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const target = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (!target.startsWith("https://api.groq.com/")) {
      return originalFetch(input, init);
    }

    await acquire();
    try {
      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await originalFetch(input, init);
        if (response.status !== 429) return response;
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(8_000, retryAfter * 1_000)
          : 1_250 * (attempt + 1);
        await delay(waitMs);
      }
      return response!;
    } finally {
      release();
    }
  };
}

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL("/api/review-zc8-v6", incoming.origin);
  target.searchParams.set("action", "step");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = createRateLimitedFetch(originalFetch) as typeof fetch;
  try {
    return await runReviewAction(new Request(target.toString(), {
      method: "GET",
      headers: request.headers,
    }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

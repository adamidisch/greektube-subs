import { NextResponse } from "next/server";
import { POST as semanticPOST } from "../captions/semantic-route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_ID = "WQCO8wlldAQ";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Preview only." }, { status: 403 });
  }

  const current = new URL(request.url);
  if (current.searchParams.get("confirm") !== VIDEO_ID) {
    return NextResponse.json({ error: "Explicit confirmation required." }, { status: 400 });
  }

  const startedAt = Date.now();
  const history: unknown[] = [];

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const internalRequest = new Request(new URL("/api/captions", current.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` }),
    });
    const response = await semanticPOST(internalRequest);
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    history.push({ attempt, status: response.status, payload });

    if (response.status === 200 && payload.status === "ready") {
      return NextResponse.json({ ok: true, videoId: VIDEO_ID, elapsedMs: Date.now() - startedAt, attempts: attempt, final: payload });
    }
    if (payload.status === "failed" || response.status >= 400) {
      return NextResponse.json({ ok: false, videoId: VIDEO_ID, elapsedMs: Date.now() - startedAt, attempts: attempt, final: payload, history }, { status: 500 });
    }

    const retryValue = typeof payload.retryAfter === "string" || typeof payload.retryAfter === "number" ? Number(payload.retryAfter) : 1;
    const retryAfter = Math.max(1, Math.min(10, Number(response.headers.get("retry-after") || retryValue || 1)));
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  }

  return NextResponse.json({ ok: false, videoId: VIDEO_ID, elapsedMs: Date.now() - startedAt, error: "Timed out before ready", history }, { status: 504 });
}

import { after, NextResponse } from "next/server";
import { kickStep, runStep, validStepSignature } from "../pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Internal continuation of an automatic subtitle job. Signed by this server; answers at once and works in after(). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { videoId?: unknown; runId?: unknown } | null;
  const videoId = typeof body?.videoId === "string" && /^[A-Za-z0-9_-]{11}$/u.test(body.videoId) ? body.videoId : "";
  const runId = typeof body?.runId === "string" && /^[0-9a-f-]{36}$/u.test(body.runId) ? body.runId : "";
  const signature = request.headers.get("x-auto-subtitles-signature") || "";
  if (!videoId || !runId || !validStepSignature(videoId, runId, signature)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = new URL(request.url).origin;
  after(async () => {
    const result = await runStep(videoId, runId);
    if (!result.continue) return;
    if (result.backoff) await new Promise(resolve => setTimeout(resolve, 25_000));
    await kickStep(origin, videoId, runId);
  });
  return NextResponse.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

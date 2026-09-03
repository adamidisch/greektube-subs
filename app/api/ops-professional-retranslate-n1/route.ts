import { NextResponse } from "next/server";
import { POST as semanticPOST } from "../captions/semantic-route";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  getTranscriptStatus,
  releaseProcessingLock,
  resetProcessingForTranslation,
} from "../shared-cache";

const VIDEO_ID = "n1G3xqgzB2c";
const ACCESS = "gt-prof-v1-n1-0903";

function allowed(request: Request) {
  return new URL(request.url).searchParams.get("key") === ACCESS;
}

export async function GET(request: Request) {
  if (!allowed(request)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";

  if (action === "status") {
    const status = await getTranscriptStatus(VIDEO_ID);
    return NextResponse.json({ videoId: VIDEO_ID, transcriptVersion: TRANSCRIPT_VERSION, status });
  }

  if (action === "reset") {
    const token = crypto.randomUUID();
    const acquired = await acquireProcessingLock(VIDEO_ID, token, true);
    if (!acquired) return NextResponse.json({ error: "lock unavailable" }, { status: 409 });
    try {
      const reset = await resetProcessingForTranslation(VIDEO_ID, token, true);
      if (!reset) return NextResponse.json({ error: "raw source checkpoint unavailable" }, { status: 409 });
      const released = await releaseProcessingLock(VIDEO_ID, token);
      if (!released) return NextResponse.json({ error: "reset persisted but release failed" }, { status: 500 });
      const status = await getTranscriptStatus(VIDEO_ID);
      return NextResponse.json({ reset: true, status });
    } catch (error) {
      await releaseProcessingLock(VIDEO_ID, token).catch(() => false);
      throw error;
    }
  }

  if (action === "run") {
    const internal = new Request("https://greektubesubs.com/api/captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` }),
    });
    return semanticPOST(internal);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

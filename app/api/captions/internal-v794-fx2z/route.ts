import { NextResponse } from "next/server";
import { POST as runCaptions } from "../semantic-route";
import {
  acquireProcessingLock,
  getTranscript,
  getTranscriptStatus,
  releaseProcessingLock,
  saveProcessingCheckpoint,
} from "../../shared-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_ID = "fX2z-BF8Jac";
const MIGRATION_KEY = "v794-fx2z-4f7a9c31c6b84db8";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

function authorized(url: URL) {
  return url.searchParams.get("key") === MIGRATION_KEY;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(url)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const action = url.searchParams.get("action") || "status";

  if (action === "status") {
    const status = await getTranscriptStatus(VIDEO_ID);
    return NextResponse.json({ action, status }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "reset") {
    const current = await getTranscript(VIDEO_ID);
    if (!current || current.status !== "ready" || !current.englishTranscript.length) {
      return NextResponse.json({ error: "Ready repaired English transcript unavailable." }, { status: 409 });
    }

    const token = crypto.randomUUID();
    if (!await acquireProcessingLock(VIDEO_ID, token, true)) {
      return NextResponse.json({ error: "Could not acquire reprocessing lock." }, { status: 409 });
    }

    const persisted = await saveProcessingCheckpoint(VIDEO_ID, token, {
      stage: "translate_pro",
      cursor: 0,
      progress: 48,
      rawEnglishTranscript: current.rawEnglishTranscript,
      englishTranscript: current.englishTranscript,
      greekTranscript: [],
      title: current.title,
      channel: current.channel,
      duration: current.duration,
      originalLanguage: current.originalLanguage,
    });

    if (!persisted) {
      await releaseProcessingLock(VIDEO_ID, token).catch(() => undefined);
      return NextResponse.json({ error: "Could not persist professional restart checkpoint." }, { status: 409 });
    }

    await releaseProcessingLock(VIDEO_ID, token);
    const status = await getTranscriptStatus(VIDEO_ID);
    return NextResponse.json({
      action,
      restarted: true,
      keptEnglishCues: current.englishTranscript.length,
      status,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "run") {
    const maxStepsRaw = Number(url.searchParams.get("steps") || "8");
    const maxSteps = Math.max(1, Math.min(20, Number.isFinite(maxStepsRaw) ? Math.floor(maxStepsRaw) : 8));
    let lastPayload: unknown = null;
    let lastStatus = 202;
    let completedSteps = 0;

    for (let attempt = 0; attempt < maxSteps; attempt += 1) {
      const internalRequest = new Request(new URL("/api/captions", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: VIDEO_URL }),
      });
      const response = await runCaptions(internalRequest);
      lastStatus = response.status;
      lastPayload = await response.json().catch(() => null);
      completedSteps += 1;

      if (response.status !== 202) break;

      const payload = lastPayload && typeof lastPayload === "object"
        ? lastPayload as { retryAfter?: unknown; status?: unknown }
        : null;
      if (typeof payload?.retryAfter === "string") {
        const retryAt = new Date(payload.retryAfter).getTime();
        if (Number.isFinite(retryAt) && retryAt > Date.now() + 500) break;
      }
    }

    return NextResponse.json({
      action,
      completedSteps,
      upstreamStatus: lastStatus,
      result: lastPayload,
    }, { status: lastStatus >= 400 ? lastStatus : 200, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

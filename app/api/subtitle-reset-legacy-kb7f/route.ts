import {
  acquireProcessingLock,
  getTranscript,
  releaseProcessingLock,
  resetProcessingForTranslation,
} from "../shared-cache";

export const dynamic = "force-dynamic";

const VIDEO_ID = "KkBy__7d9Fs";

export async function GET() {
  const current = await getTranscript(VIDEO_ID);
  if (!current?.rawEnglishTranscript?.length) {
    return Response.json({ error: "raw-transcript-missing" }, { status: 409 });
  }

  const token = crypto.randomUUID();
  const acquired = await acquireProcessingLock(VIDEO_ID, token, true);
  if (!acquired) return Response.json({ error: "lock-not-acquired" }, { status: 409 });

  try {
    const reset = await resetProcessingForTranslation(VIDEO_ID, token, true);
    if (!reset) return Response.json({ error: "reset-failed" }, { status: 409 });
    const released = await releaseProcessingLock(VIDEO_ID, token);
    if (!released) return Response.json({ error: "release-failed" }, { status: 409 });
    const after = await getTranscript(VIDEO_ID);
    return Response.json({
      ok: true,
      stage: after?.processingStage,
      cursor: after?.processingCursor,
      progress: after?.progress,
      rawCues: after?.rawEnglishTranscript.length,
      status: after?.status,
    });
  } catch (error) {
    await releaseProcessingLock(VIDEO_ID, token).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "reset-error" }, { status: 500 });
  }
}

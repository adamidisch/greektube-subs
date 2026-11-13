import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { acquireProcessingLock, completeTranscript, getTranscript, releaseProcessingLock, type CachedCue } from "../../shared-cache";
import { hasValidManualCueTimings, parseManualSubtitleText } from "../../manual-captions/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SRT_BYTES = 2_000_000;

/**
 * Adds the English source to a ready video that has Greek but no English.
 * Only the transcript record's English changes; the published Greek and its revision are untouched.
 * The export v1 aligns this English to the Greek cues by time, so LOGI can extract claims.
 */
export async function POST(request: Request) {
  if (!await verifyAdminSession(request)) {
    return NextResponse.json({ error: "Απαιτείται admin authorization." }, { status: 401 });
  }
  let body: { videoId?: unknown; sourceSubtitleText?: unknown; replace?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Το request δεν μπόρεσε να διαβαστεί." }, { status: 400 });
  }
  const videoId = typeof body.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(body.videoId) ? body.videoId : null;
  if (!videoId) return NextResponse.json({ error: "Μη έγκυρο videoId." }, { status: 400 });
  if (typeof body.sourceSubtitleText !== "string" || body.sourceSubtitleText.length > MAX_SRT_BYTES) {
    return NextResponse.json({ error: "Απαιτείται αγγλικό SRT." }, { status: 400 });
  }
  const english = parseManualSubtitleText(body.sourceSubtitleText) as CachedCue[];
  if (english.length < 3 || !hasValidManualCueTimings(english) || english.some(cue => !cue.text.trim())) {
    return NextResponse.json({ error: "Το αγγλικό SRT δεν περιέχει έγκυρα timed cues." }, { status: 400 });
  }

  const record = await getTranscript(videoId).catch(() => null);
  if (!record || record.status !== "ready") {
    return NextResponse.json({ error: "Το βίντεο δεν έχει έτοιμη εγγραφή." }, { status: 409 });
  }
  if (record.englishTranscript.length && body.replace !== true) {
    return NextResponse.json({ error: "Το βίντεο έχει ήδη αγγλικό κείμενο." }, { status: 409 });
  }

  const token = crypto.randomUUID();
  if (!await acquireProcessingLock(videoId, token, true)) {
    return NextResponse.json({ error: "Το βίντεο επεξεργάζεται αυτή τη στιγμή." }, { status: 409 });
  }
  try {
    await completeTranscript({
      ...record,
      rawEnglishTranscript: record.rawEnglishTranscript.length ? record.rawEnglishTranscript : english,
      englishTranscript: english,
      updatedAt: new Date().toISOString(),
    }, token);
  } catch (error) {
    // Put the untouched record back so the video keeps serving as before.
    await completeTranscript(record, token).catch(() => undefined);
    await releaseProcessingLock(videoId, token).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Η αποθήκευση απέτυχε." }, { status: 500 });
  }
  return NextResponse.json({ status: "attached", videoId, englishCues: english.length }, { headers: { "Cache-Control": "no-store" } });
}

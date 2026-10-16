import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  acquireProcessingLock,
  completeTranscript,
  getTranscript,
  releaseProcessingLock,
  saveProcessingCheckpoint,
  type CachedCue,
} from "../../shared-cache";
import { hasValidManualCueTimings, parseManualSubtitleText } from "../../manual-captions/parser";
import {
  freezeOwnerSource,
  publishOwnerTranslation,
  validateOwnerGreek,
} from "../store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SRT_BYTES = 2_000_000;
const TIMING_TOLERANCE = 0.002;

function validVideoId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value.trim()) ? value.trim() : null;
}

function sameTimings(english: CachedCue[], greek: CachedCue[]) {
  return english.length === greek.length && english.every((cue, index) =>
    Math.abs(cue.start - greek[index].start) <= TIMING_TOLERANCE &&
    Math.abs(cue.duration - greek[index].duration) <= TIMING_TOLERANCE,
  );
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Η ασφαλής εισαγωγή source απέτυχε.";
  const status = /δεν υπάρχει|δεν ταιριάζει|επεξεργάζεται|έγκυρο|πρέπει πρώτα|απέτυχε/i.test(message) ? 409 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!await verifyAdminSession(request)) {
    return NextResponse.json({ error: "Απαιτείται admin authorization." }, { status: 401 });
  }

  let body: { videoId?: unknown; sourceSubtitleText?: unknown; subtitleText?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Το request δεν μπόρεσε να διαβαστεί." }, { status: 400 });
  }

  const videoId = validVideoId(body.videoId);
  if (!videoId) return NextResponse.json({ error: "Μη έγκυρο videoId." }, { status: 400 });
  if (typeof body.sourceSubtitleText !== "string" || typeof body.subtitleText !== "string") {
    return NextResponse.json({ error: "Απαιτούνται το καθαρό αγγλικό και το ελληνικό SRT." }, { status: 400 });
  }
  if (body.sourceSubtitleText.length > MAX_SRT_BYTES || body.subtitleText.length > MAX_SRT_BYTES) {
    return NextResponse.json({ error: "Ένα από τα SRT είναι υπερβολικά μεγάλο." }, { status: 413 });
  }

  const english = parseManualSubtitleText(body.sourceSubtitleText) as CachedCue[];
  const greek = parseManualSubtitleText(body.subtitleText) as CachedCue[];
  if (english.length < 3 || !hasValidManualCueTimings(english)) {
    return NextResponse.json({ error: "Το καθαρό αγγλικό SRT δεν περιέχει έγκυρα timed cues." }, { status: 400 });
  }
  if (greek.length < 3 || !hasValidManualCueTimings(greek)) {
    return NextResponse.json({ error: "Το ελληνικό SRT δεν περιέχει έγκυρα timed cues." }, { status: 400 });
  }
  if (!sameTimings(english, greek)) {
    return NextResponse.json({ error: "Το αγγλικό και το ελληνικό SRT πρέπει να έχουν ακριβώς τον ίδιο αριθμό και τα ίδια timestamps." }, { status: 400 });
  }

  const previous = await getTranscript(videoId);
  if (!previous) return NextResponse.json({ error: "Δεν υπάρχει υπάρχον transcript record για αυτό το βίντεο." }, { status: 409 });

  const token = crypto.randomUUID();
  let staged = false;
  try {
    if (!await acquireProcessingLock(videoId, token, true)) {
      throw new Error("Το βίντεο επεξεργάζεται αυτή τη στιγμή.");
    }

    const now = new Date().toISOString();
    const saved = await saveProcessingCheckpoint(videoId, token, {
      stage: "owner_source_import",
      cursor: english.length,
      progress: 90,
      rawEnglishTranscript: english,
      englishTranscript: english,
      greekTranscript: [],
      title: previous.title,
      channel: previous.channel,
      duration: Math.max(previous.duration, english.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0)),
      originalLanguage: "en",
    });
    if (!saved) throw new Error("Δεν αποθηκεύτηκε το canonical source checkpoint.");
    staged = true;

    await releaseProcessingLock(videoId, token);
    const frozen = await freezeOwnerSource(videoId, true);
    const validated = await validateOwnerGreek(videoId, body.subtitleText);
    if (!validated.validation.ok) throw new Error("Το ελληνικό SRT απέτυχε στο owner validation.");
    const published = await publishOwnerTranslation(videoId);

    return NextResponse.json({
      status: "published",
      manifest: published.manifest,
      validation: validated.validation,
      sourceCueCount: english.length,
      updatedAt: now,
      sourceRevisionCreated: frozen.created,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (staged) {
      const rollbackToken = crypto.randomUUID();
      if (await acquireProcessingLock(videoId, rollbackToken, true)) {
        await completeTranscript(previous, rollbackToken).catch(() => undefined);
      }
    }
    await releaseProcessingLock(videoId, token).catch(() => undefined);
    return errorResponse(error);
  }
}

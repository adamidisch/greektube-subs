import { NextResponse } from "next/server";
import { POST as semanticPOST } from "../captions/semantic-route";
import { validateProfessionalSubtitleFile } from "../captions/professional-pipeline";
import { publishTranscript, readPublishedTranscript } from "../transcript-blob";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  completeTranscript,
  getTranscript,
  getTranscriptStatus,
  releaseProcessingLock,
  resetProcessingForTranslation,
  type CachedCue,
} from "../shared-cache";
import cues0 from "./final-cues-0";
import cues1 from "./final-cues-1";
import cues2 from "./final-cues-2";
import cues3 from "./final-cues-3";
import cues4 from "./final-cues-4";

const VIDEO_ID = "n1G3xqgzB2c";
const ACCESS = "gt-prof-v1-n1-0903";
const CURATED_TOPICS = ["γήρανση", "επιγενετική", "AI", "βιοεπιστήμες", "οικονομία", "γεωπολιτική"];
const FINAL_CUES: CachedCue[] = [...cues0, ...cues1, ...cues2, ...cues3, ...cues4].map(cue => ({ ...cue }));

function allowed(request: Request) {
  return new URL(request.url).searchParams.get("key") === ACCESS;
}

function auditFinalCues() {
  const issues = validateProfessionalSubtitleFile(FINAL_CUES);
  const end = FINAL_CUES.length ? FINAL_CUES[FINAL_CUES.length - 1].start + FINAL_CUES[FINAL_CUES.length - 1].duration : 0;
  const answer = FINAL_CUES.find(cue => Math.abs(cue.start - 6) < 0.01);
  const maxCps = FINAL_CUES.reduce((max, cue) => Math.max(max, cue.duration > 0 ? cue.text.length / cue.duration : Infinity), 0);
  if (FINAL_CUES.length !== 259) issues.push(`expected-259-cues:${FINAL_CUES.length}`);
  if (Math.abs(end - 1238) > 0.02) issues.push(`unexpected-end:${end}`);
  if (!answer || !/^Ναι, το πιστεύω\./u.test(answer.text)) issues.push("regression-0:06-answer");
  return { issues, end, answer: answer?.text || null, maxCps };
}

export async function GET(request: Request) {
  if (!allowed(request)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";

  if (action === "status") {
    const status = await getTranscriptStatus(VIDEO_ID);
    return NextResponse.json({ videoId: VIDEO_ID, transcriptVersion: TRANSCRIPT_VERSION, status, curatedAudit: auditFinalCues() });
  }

  if (action === "audit") {
    const audit = auditFinalCues();
    return NextResponse.json({ videoId: VIDEO_ID, cueCount: FINAL_CUES.length, topics: CURATED_TOPICS, ...audit }, { status: audit.issues.length ? 409 : 200 });
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

  if (action === "publish") {
    const audit = auditFinalCues();
    if (audit.issues.length) return NextResponse.json({ error: "curated audit failed", audit }, { status: 409 });

    const existing = await getTranscript(VIDEO_ID);
    if (!existing) return NextResponse.json({ error: "transcript checkpoint unavailable" }, { status: 409 });
    if (!existing.rawEnglishTranscript.length || !existing.englishTranscript.length) {
      return NextResponse.json({ error: "source checkpoints are incomplete" }, { status: 409 });
    }

    const previousPublished = await readPublishedTranscript(VIDEO_ID, TRANSCRIPT_VERSION, true);
    const token = crypto.randomUUID();
    const acquired = await acquireProcessingLock(VIDEO_ID, token, false);
    if (!acquired) return NextResponse.json({ error: "lock unavailable" }, { status: 409 });

    try {
      const updatedAt = new Date().toISOString();
      const keyPoints = [0, 52, 103, 155, 207, 227, 238, 252]
        .map(index => FINAL_CUES[index]?.text || "")
        .filter(Boolean);
      const completed = await completeTranscript({
        ...existing,
        greekTranscript: FINAL_CUES,
        timestamps: FINAL_CUES.map(cue => ({ start: cue.start, duration: cue.duration })),
        topics: CURATED_TOPICS,
        keyPoints,
        status: "ready",
        progress: 100,
        processingStage: null,
        processingCursor: 0,
        retryCount: 0,
        retryAfter: null,
        groq429Streak: 0,
        groqCooldownUntil: null,
        error: null,
        transcriptVersion: TRANSCRIPT_VERSION,
        updatedAt,
      }, token);
      if (!completed) {
        await releaseProcessingLock(VIDEO_ID, token).catch(() => false);
        return NextResponse.json({ error: "completeTranscript failed" }, { status: 500 });
      }

      const payload = {
        ...(previousPublished && typeof previousPublished === "object" ? previousPublished : {}),
        status: "ready",
        progress: 100,
        videoId: VIDEO_ID,
        title: existing.title,
        channel: existing.channel,
        duration: existing.duration,
        sourceLanguage: existing.originalLanguage || "en",
        cues: FINAL_CUES,
        englishCues: existing.englishTranscript,
        topics: CURATED_TOPICS,
        keyPoints,
        transcriptVersion: TRANSCRIPT_VERSION,
        translationMode: "professional-curated-v1",
        translationMethod: "greektube_professional_subtitle_translator_v1",
        cached: false,
      };
      const published = await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, payload);
      if (!published) return NextResponse.json({ error: "published transcript blob write failed" }, { status: 500 });

      const verification = await readPublishedTranscript(VIDEO_ID, TRANSCRIPT_VERSION, false) as { cues?: CachedCue[]; topics?: string[] } | null;
      const liveCues = Array.isArray(verification?.cues) ? verification.cues : [];
      const liveAnswer = liveCues.find(cue => Math.abs(cue.start - 6) < 0.01)?.text || null;
      const liveEnd = liveCues.length ? liveCues[liveCues.length - 1].start + liveCues[liveCues.length - 1].duration : 0;
      if (liveCues.length !== 259 || !liveAnswer?.startsWith("Ναι, το πιστεύω.") || Math.abs(liveEnd - 1238) > 0.02) {
        return NextResponse.json({ error: "post-publish verification pending cache propagation", liveCueCount: liveCues.length, liveAnswer, liveEnd }, { status: 202 });
      }

      return NextResponse.json({
        published: true,
        videoId: VIDEO_ID,
        cueCount: liveCues.length,
        end: liveEnd,
        answerAt006: liveAnswer,
        topics: CURATED_TOPICS,
        maxCps: audit.maxCps,
        translationMethod: "greektube_professional_subtitle_translator_v1",
      });
    } catch (error) {
      await releaseProcessingLock(VIDEO_ID, token).catch(() => false);
      throw error;
    }
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

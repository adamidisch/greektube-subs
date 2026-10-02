import { NextResponse } from "next/server";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  completeTranscript,
  getTranscript,
} from "../../shared-cache";
import {
  publishTranscript,
  readPublishedTranscript,
} from "../../transcript-blob";
import {
  materializeStableSubtitleEvents,
} from "@/app/subtitle-display";
import { validateProfessionalSubtitleFile } from "../professional-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_ID = "fX2z-BF8Jac";
const MIGRATION_KEY = "v794-fx2z-4f7a9c31c6b84db8";

function normalizedText(cues: { text: string }[]) {
  return cues.map(cue => cue.text.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== MIGRATION_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const current = await getTranscript(VIDEO_ID);
  if (!current || current.status !== "ready") {
    return NextResponse.json({ error: "Ready transcript unavailable." }, { status: 409 });
  }

  const migrated = materializeStableSubtitleEvents(current.greekTranscript);
  const issues = validateProfessionalSubtitleFile(migrated);
  const packedSource = normalizedText(materializeStableSubtitleEvents(current.greekTranscript));
  const migratedText = normalizedText(migrated);
  const textPreserved = packedSource === migratedText;

  const diagnostics = {
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    beforeCues: current.greekTranscript.length,
    afterCues: migrated.length,
    issues: issues.slice(0, 30),
    textPreserved,
    shortestSeconds: migrated.length ? Math.min(...migrated.map(cue => cue.duration)) : 0,
    longestSeconds: migrated.length ? Math.max(...migrated.map(cue => cue.duration)) : 0,
    maxCharacters: migrated.length ? Math.max(...migrated.map(cue => cue.text.length)) : 0,
    maxCps: migrated.length ? Math.max(...migrated.map(cue => cue.text.length / Math.max(0.001, cue.duration))) : 0,
  };

  if (url.searchParams.get("apply") !== "1") {
    return NextResponse.json({ mode: "dry-run", ...diagnostics }, { headers: { "Cache-Control": "no-store" } });
  }

  if (issues.length || !textPreserved) {
    return NextResponse.json({ error: "Migration validation failed.", ...diagnostics }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }

  const alreadyProfessional = current.greekTranscript.length === migrated.length
    && current.greekTranscript.every((cue, index) => {
      const next = migrated[index];
      return next
        && Math.abs(cue.start - next.start) < 1e-6
        && Math.abs(cue.duration - next.duration) < 1e-6
        && cue.text.replace(/\s+/g, " ").trim() === next.text;
    });
  if (alreadyProfessional) {
    return NextResponse.json({ mode: "already-migrated", ...diagnostics }, { headers: { "Cache-Control": "no-store" } });
  }

  const published = await readPublishedTranscript(VIDEO_ID, TRANSCRIPT_VERSION, true);
  if (!published) {
    return NextResponse.json({ error: "Published transcript unavailable." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const lockToken = crypto.randomUUID();
  const acquired = await acquireProcessingLock(VIDEO_ID, lockToken, true);
  if (!acquired) {
    return NextResponse.json({ error: "Could not acquire migration lock." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const updatedAt = new Date().toISOString();
  const completed = await completeTranscript({
    ...current,
    greekTranscript: migrated,
    timestamps: migrated.map(cue => ({ start: cue.start, duration: cue.duration })),
    status: "ready",
    progress: 100,
    transcriptVersion: TRANSCRIPT_VERSION,
    updatedAt,
  }, lockToken);

  if (!completed) {
    return NextResponse.json({ error: "Could not persist migrated transcript." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const republished = await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, {
    ...published,
    status: "ready",
    progress: 100,
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    cues: migrated,
    englishCues: current.englishTranscript,
    cached: false,
  });

  if (!republished) {
    return NextResponse.json({ error: "Database migration completed but published transcript refresh failed.", ...diagnostics }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ mode: "applied", ...diagnostics, updatedAt }, { headers: { "Cache-Control": "no-store" } });
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  acquireProcessingLock,
  completeTranscript,
  getTranscript,
  TRANSCRIPT_VERSION,
  type CachedCue,
} from "../shared-cache";
import { publishTranscript, readPublishedTranscript } from "../transcript-blob";
import { validateProfessionalSubtitleFile } from "../captions/professional-pipeline";

export const dynamic = "force-dynamic";

const VIDEO_ID = "n1G3xqgzB2c";
const SECRET = "n1-boundary-fix-20260903-6f4d7a91";
const DUPLICATED = "χάσει. Αυτή είναι μεγάλη διαφορά ανάμεσα στον τρόπο που";
const FIXED = "Αυτή είναι μεγάλη διαφορά ανάμεσα στον τρόπο που";

type CuePatch = {
  cues: CachedCue[];
  changed: boolean;
  index: number;
  before: string | null;
  after: string | null;
};

function patchKnownBoundary(cues: CachedCue[]): CuePatch {
  const copy = cues.map(cue => ({ ...cue }));
  const index = copy.findIndex(cue =>
    Math.abs(Number(cue.start) - 831) < 0.3 && cue.text.trim() === DUPLICATED,
  );

  if (index < 0) {
    const alreadyFixedIndex = copy.findIndex(cue =>
      Math.abs(Number(cue.start) - 831) < 0.3 && cue.text.trim() === FIXED,
    );
    return {
      cues: copy,
      changed: false,
      index: alreadyFixedIndex,
      before: alreadyFixedIndex >= 0 ? FIXED : null,
      after: alreadyFixedIndex >= 0 ? FIXED : null,
    };
  }

  const previous = copy[index - 1];
  if (!previous || !/χάσει\.[”"']?$/iu.test(previous.text.trim())) {
    throw new Error("guard-failed:preceding-cue-does-not-end-with-xasei");
  }

  copy[index] = { ...copy[index], text: FIXED };
  return { cues: copy, changed: true, index, before: DUPLICATED, after: FIXED };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }

  const dbRecord = await getTranscript(VIDEO_ID);
  const publicRecord = await readPublishedTranscript(VIDEO_ID, TRANSCRIPT_VERSION, false) as Record<string, unknown> | null;
  if (!dbRecord || !publicRecord || !Array.isArray(publicRecord.cues)) {
    return NextResponse.json({ error: "canonical-record-missing" }, { status: 404 });
  }
  if (dbRecord.greekTranscript.length !== 259 || publicRecord.cues.length !== 259) {
    return NextResponse.json({
      error: "unexpected-cue-count",
      dbCount: dbRecord.greekTranscript.length,
      publicCount: publicRecord.cues.length,
    }, { status: 409 });
  }

  let dbPatch: CuePatch;
  let publicPatch: CuePatch;
  try {
    dbPatch = patchKnownBoundary(dbRecord.greekTranscript);
    publicPatch = patchKnownBoundary(publicRecord.cues as CachedCue[]);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "guard-failed",
    }, { status: 409 });
  }

  if (dbPatch.index < 0 || publicPatch.index < 0) {
    return NextResponse.json({
      error: "target-cue-not-found",
      dbIndex: dbPatch.index,
      publicIndex: publicPatch.index,
    }, { status: 409 });
  }

  const dbIssues = validateProfessionalSubtitleFile(dbPatch.cues);
  const publicIssues = validateProfessionalSubtitleFile(publicPatch.cues);
  if (dbIssues.length || publicIssues.length) {
    return NextResponse.json({
      error: "professional-qc-failed",
      dbIssues,
      publicIssues,
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  if (dbPatch.changed) {
    const lockToken = `ops-n1-boundary-${randomUUID()}`;
    if (!await acquireProcessingLock(VIDEO_ID, lockToken, true)) {
      return NextResponse.json({ error: "lock-failed" }, { status: 423 });
    }
    const completed = await completeTranscript({
      ...dbRecord,
      greekTranscript: dbPatch.cues,
      status: "ready",
      progress: 100,
      processingStage: null,
      processingCursor: 0,
      retryCount: 0,
      retryAfter: null,
      error: null,
      transcriptVersion: TRANSCRIPT_VERSION,
      updatedAt: now,
    }, lockToken);
    if (!completed) {
      return NextResponse.json({ error: "canonical-complete-failed" }, { status: 500 });
    }
  }

  if (publicPatch.changed) {
    const published = await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, {
      ...publicRecord,
      status: "ready",
      videoId: VIDEO_ID,
      transcriptVersion: TRANSCRIPT_VERSION,
      cues: publicPatch.cues,
    });
    if (!published) {
      return NextResponse.json({ error: "public-publish-failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    dbChanged: dbPatch.changed,
    publicChanged: publicPatch.changed,
    cueIndex: publicPatch.index,
    before: publicPatch.before,
    after: publicPatch.after,
    qcIssues: [],
  });
}

import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { publishTranscript, publishTranscriptCheckpoint, readPublishedTranscript, readTranscriptCheckpoint } from "../../transcript-blob";
import { TRANSCRIPT_VERSION } from "../../shared-cache";
import { correctPublishedOwnerCue, getOwnerTranslationManifest } from "../../owner-translation/store";

type CueEditRequest = {
  videoId?: unknown;
  transcriptVersion?: unknown;
  cueIndex?: unknown;
  text?: unknown;
  expectedText?: unknown;
};

export async function PATCH(request: Request) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ error: "Μη εξουσιοδοτημένο." }, { status: 401 });
  }

  const body = await request.json() as CueEditRequest;
  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
  const transcriptVersion = typeof body.transcriptVersion === "number" ? body.transcriptVersion : NaN;
  const cueIndex = typeof body.cueIndex === "number" ? body.cueIndex : NaN;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const expectedText = typeof body.expectedText === "string" ? body.expectedText : null;

  if (!videoId || transcriptVersion !== TRANSCRIPT_VERSION || !Number.isInteger(cueIndex) || cueIndex < 0 || expectedText === null) {
    return NextResponse.json({ error: "Μη έγκυρο αίτημα." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Το κείμενο δεν μπορεί να είναι κενό." }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: "Το κείμενο είναι πολύ μεγάλο." }, { status: 400 });
  }

  // A published owner revision may receive a small Greek-only correction
  // without creating a whole new revision. The canonical English source and
  // timestamps remain immutable and the owner manifest is updated atomically.
  const ownerManifest = await getOwnerTranslationManifest(videoId).catch(() => null);
  if (ownerManifest) {
    try {
      const corrected = await correctPublishedOwnerCue(videoId, cueIndex, expectedText, text);
      if (!corrected) return NextResponse.json({ error: "Δεν βρέθηκε owner transcript." }, { status: 404 });
      return NextResponse.json({ ok: true, cue: corrected.cue, ownerRevision: corrected.manifest.revision });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.";
      const status = /άλλαξε|επεξεργάζεται|δεν είναι δημοσιευμένη|integrity|canonical source/i.test(message) ? 409 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  // English is intentionally not read/touched — this endpoint only ever
  // writes the Greek Blob.
  //
  // Concurrency note: this is a single fresh read compared against the
  // text the client had on screen when editing began (expectedText). It is
  // stale-write protection, not an atomic compare-and-swap — there's a
  // window between this read and the publish() write below where another
  // request could still interleave. That's an accepted tradeoff for a
  // single-admin editing workflow, not a guarantee under real concurrent
  // writers.
  const record = await readPublishedTranscript(videoId, transcriptVersion, false);
  if (!record || !Array.isArray(record.cues) || cueIndex >= record.cues.length) {
    return NextResponse.json({ error: "Δεν βρέθηκε η μεταγραφή." }, { status: 404 });
  }
  const currentCue = record.cues[cueIndex] as { start?: unknown; duration?: unknown; text?: unknown };
  if (String(currentCue?.text ?? "") !== expectedText) {
    return NextResponse.json({ error: "Το cue άλλαξε στο μεταξύ. Φόρτωσε ξανά και προσπάθησε πάλι." }, { status: 409 });
  }

  const updatedCue = { start: currentCue.start, duration: currentCue.duration, text };
  const updatedCues = record.cues.slice();
  updatedCues[cueIndex] = updatedCue;
  const updatedRecord = { ...record, cues: updatedCues };

  const published = await publishTranscript(videoId, transcriptVersion, updatedRecord);
  if (!published) {
    return NextResponse.json({ error: "Η αποθήκευση απέτυχε." }, { status: 500 });
  }

  // Keep the ready checkpoint aligned with the published Blob so future
  // server-side reads cannot resurrect the old Greek wording.
  const checkpoint = await readTranscriptCheckpoint(videoId, transcriptVersion, true).catch(() => null);
  if (checkpoint?.status === "ready" && checkpoint.greekTranscript.length === updatedCues.length) {
    const synced = await publishTranscriptCheckpoint(videoId, transcriptVersion, {
      ...checkpoint,
      greekTranscript: updatedCues,
      timestamps: updatedCues.map(cue => {
        const value = cue as { start?: unknown; duration?: unknown };
        return { start: Number(value.start) || 0, duration: Number(value.duration) || 0 };
      }),
      updatedAt: new Date().toISOString(),
    });
    if (!synced) {
      await publishTranscript(videoId, transcriptVersion, record).catch(() => undefined);
      return NextResponse.json({ error: "Η διόρθωση δεν μπόρεσε να συγχρονιστεί με το transcript checkpoint." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, cue: updatedCue });
}

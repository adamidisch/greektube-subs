import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { TRANSCRIPT_VERSION } from "../../shared-cache";
import { restoredSnapshot } from "../../published-subtitles-core";
import { writeNeonPublished } from "../../published-subtitles";
import sarahPreview from "../../../../public/previews/xYB6uYyRjCA.json";

export const dynamic = "force-dynamic";

const PREVIEWS: Record<string, { events: unknown }> = { xYB6uYyRjCA: sarahPreview };

/** Owner-only: puts an approved pre-Blob-suspension version into Neon. No AI calls. */
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Μη έγκυρη προέλευση." }, { status: 403 });
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, { status: 401 });
  if (process.env.VERCEL_ENV === "preview") return NextResponse.json({ error: "Η επαναφορά είναι απενεργοποιημένη στο preview." }, { status: 409 });
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_000_000) return NextResponse.json({ error: "Το αρχείο είναι πολύ μεγάλο." }, { status: 413 });
    const body = JSON.parse(raw) as { videoId?: unknown; englishCues?: unknown; title?: unknown; channel?: unknown; duration?: unknown };
    const videoId = typeof body.videoId === "string" ? body.videoId : "";
    const preview = PREVIEWS[videoId];
    if (!preview) return NextResponse.json({ error: "Δεν υπάρχει εγκεκριμένη έκδοση για επαναφορά." }, { status: 404 });
    const snapshot = restoredSnapshot(videoId, TRANSCRIPT_VERSION, preview.events, body.englishCues, body);
    const contentHash = await writeNeonPublished(videoId, TRANSCRIPT_VERSION, snapshot.payload, snapshot.englishCues, "restore");
    return NextResponse.json({ ok: true, videoId, contentHash, events: snapshot.payload.subtitleTrack.events.length, englishCues: snapshot.englishCues.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Η επαναφορά απέτυχε." }, { status: 422 });
  }
}

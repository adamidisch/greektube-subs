import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { TRANSCRIPT_VERSION } from "../../shared-cache";
import { syncPublishedMirror } from "../../published-subtitles";

export const dynamic = "force-dynamic";

/** Owner-only: copies the live Neon version of a video to the private GitHub mirror and reports both hashes. */
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Μη έγκυρη προέλευση." }, { status: 403 });
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Απαιτείται εξουσιοδότηση διαχειριστή." }, { status: 401 });
  try {
    const body = await request.json() as { videoId?: unknown };
    const videoId = typeof body.videoId === "string" && /^[\w-]{11}$/u.test(body.videoId) ? body.videoId : "";
    if (!videoId) return NextResponse.json({ error: "Μη έγκυρο βίντεο." }, { status: 400 });
    const result = await syncPublishedMirror(videoId, TRANSCRIPT_VERSION);
    if (!result) return NextResponse.json({ error: "Δεν υπάρχει δημοσιευμένη έκδοση στη Neon." }, { status: 404 });
    return NextResponse.json({ videoId, ...result, same: result.neon === result.mirror }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ο συγχρονισμός απέτυχε." }, { status: 502 });
  }
}

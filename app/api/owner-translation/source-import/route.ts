import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { importOwnerSourceSrt, OwnerImportError } from "../import-source";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_SRT_BYTES = 2_000_000;
function validVideoId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value.trim()) ? value.trim() : null;
}

function errorResponse(error: unknown) {
  if (error instanceof OwnerImportError) return NextResponse.json({ error: error.message }, { status: error.status });
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

  try {
    const result = await importOwnerSourceSrt(videoId, body.sourceSubtitleText, body.subtitleText);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

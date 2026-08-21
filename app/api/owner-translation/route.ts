import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  freezeOwnerSource,
  getOwnerTranslationManifest,
  ownerTranslationPackage,
  publishOwnerTranslation,
  validateOwnerGreek,
} from "./store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validVideoId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value.trim()) ? value.trim() : null;
}

function errorResponse(error: unknown, fallbackStatus = 500) {
  const message = error instanceof Error ? error.message : "Η ενέργεια owner translation απέτυχε.";
  const status = /δεν υπάρχει|Κάνε πρώτα|πρέπει πρώτα|επεξεργάζεται|δεν είναι διαθέσιμο|δεν ταιριάζει/i.test(message) ? 409 : fallbackStatus;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Απαιτείται admin authorization." }, { status: 401 });
  const url = new URL(request.url);
  const videoId = validVideoId(url.searchParams.get("videoId"));
  if (!videoId) return NextResponse.json({ error: "Μη έγκυρο videoId." }, { status: 400 });
  try {
    if (url.searchParams.get("download") === "package") {
      const pack = await ownerTranslationPackage(videoId);
      return new Response(JSON.stringify(pack, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="greektube-owner-${videoId}-r${pack.manifest.revision}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const manifest = await getOwnerTranslationManifest(videoId);
    return NextResponse.json({ manifest }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Απαιτείται admin authorization." }, { status: 401 });
  let body: { action?: unknown; videoId?: unknown; subtitleText?: unknown; newRevision?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Το request δεν μπόρεσε να διαβαστεί." }, { status: 400 });
  }
  const videoId = validVideoId(body.videoId);
  const action = typeof body.action === "string" ? body.action : "";
  if (!videoId) return NextResponse.json({ error: "Μη έγκυρο videoId." }, { status: 400 });

  try {
    if (action === "freeze") {
      const result = await freezeOwnerSource(videoId, body.newRevision === true);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "validate") {
      if (typeof body.subtitleText !== "string") return NextResponse.json({ error: "Λείπει το ελληνικό SRT." }, { status: 400 });
      const result = await validateOwnerGreek(videoId, body.subtitleText);
      return NextResponse.json(result, { status: result.validation.ok ? 200 : 422, headers: { "Cache-Control": "no-store" } });
    }
    if (action === "publish") {
      const result = await publishOwnerTranslation(videoId);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Μη υποστηριζόμενη ενέργεια." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

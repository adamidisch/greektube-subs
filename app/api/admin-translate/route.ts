import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { POST as runCaptions } from "../captions/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function normalizeVideoUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.youtube.com/watch?v=${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "greektubesubs.com" || parsed.hostname.endsWith(".greektubesubs.com")) {
      const videoId = parsed.searchParams.get("video") || "";
      return /^[A-Za-z0-9_-]{11}$/.test(videoId)
        ? `https://www.youtube.com/watch?v=${videoId}`
        : "";
    }
    return trimmed;
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  if (!await verifyAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    url?: unknown;
    videoId?: unknown;
    force?: unknown;
    translationMode?: unknown;
  };

  const input = typeof body.url === "string"
    ? body.url
    : typeof body.videoId === "string"
      ? body.videoId
      : "";
  const url = normalizeVideoUrl(input);
  if (!url) {
    return NextResponse.json({ error: "Invalid video URL or video ID" }, { status: 400 });
  }

  const translationMode = body.translationMode === "legacy" ? "legacy" : "google";
  const force = body.force === true;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const internalRequest = new Request(new URL("/api/captions", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, force: attempt === 0 ? force : false, translationMode }),
    });

    lastResponse = await runCaptions(internalRequest);
    if (lastResponse.status !== 202) return lastResponse;
  }

  return lastResponse ?? NextResponse.json({ error: "No translation response" }, { status: 500 });
}

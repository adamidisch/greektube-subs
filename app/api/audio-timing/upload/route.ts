import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { claimAudioMediaCleanup, releaseAudioMediaCleanup } from "../store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MEDIA_BYTES = 250 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "audio/webm",
  "video/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
];

function validVideoId(value: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

export async function POST(request: NextRequest) {
  if (!await verifyAdminSession(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let videoId = "";
        try {
          const payload = JSON.parse(clientPayload || "{}") as { videoId?: unknown };
          videoId = String(payload.videoId || "").trim();
        } catch {
          throw new Error("Invalid upload payload");
        }
        const requiredPrefix = `audio-timing-inputs/v1/${videoId}/`;
        if (!validVideoId(videoId) || !pathname.startsWith(requiredPrefix)) {
          throw new Error("Invalid audio timing upload path");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_MEDIA_BYTES,
          addRandomSuffix: true,
          cacheControlMaxAge: 60,
          tokenPayload: JSON.stringify({ videoId }),
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audio upload failed" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  let jobId = "";
  let cleanupToken = "";
  try {
    const body = await request.json() as Record<string, unknown>;
    jobId = String(body.jobId || "");
    cleanupToken = String(body.cleanupToken || "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[0-9a-f-]{36}$/i.test(cleanupToken)) {
      return NextResponse.json({ error: "Invalid cleanup request" }, { status: 400 });
    }
    const media = await claimAudioMediaCleanup(jobId, cleanupToken);
    if (!media) return NextResponse.json({ deleted: false }, { status: 200 });
    await del(media.media_url);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (jobId && cleanupToken) {
      try {
        await releaseAudioMediaCleanup(jobId, cleanupToken);
      } catch (releaseError) {
        console.error("Failed to release audio cleanup claim", releaseError);
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Audio cleanup failed" }, { status: 500 });
  }
}

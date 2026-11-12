import { exportJson, exportVideo, refuseUnauthorized, validVideoId } from "@/lib/export/v1";

export const dynamic = "force-dynamic";

/** GET /api/export/v1/videos/:youtubeId — English source and Greek subtitles with shared timings. Read-only. */
export async function GET(request: Request, context: { params: Promise<{ videoId: string }> }) {
  const refused = refuseUnauthorized(request);
  if (refused) return refused;
  const { videoId } = await context.params;
  if (!validVideoId(videoId)) return exportJson({ error: "invalid_video_id" }, 400);
  try {
    const payload = await exportVideo(videoId);
    if (!payload) return exportJson({ error: "not_found" }, 404);
    return exportJson(payload);
  } catch (error) {
    console.error("[export v1] video failed", videoId, error instanceof Error ? error.message : error);
    return exportJson({ error: "export_failed" }, 500);
  }
}

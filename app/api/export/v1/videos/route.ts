import { EXPORT_SCHEMA, exportJson, listExportVideos, refuseUnauthorized } from "@/lib/export/v1";

export const dynamic = "force-dynamic";

/** GET /api/export/v1/videos — every video with ready Greek subtitles. Read-only. */
export async function GET(request: Request) {
  const refused = refuseUnauthorized(request);
  if (refused) return refused;
  try {
    const videos = await listExportVideos();
    return exportJson({ schema: EXPORT_SCHEMA, count: videos.length, videos });
  } catch (error) {
    console.error("[export v1] list failed", error instanceof Error ? error.message : error);
    return exportJson({ error: "export_failed" }, 500);
  }
}

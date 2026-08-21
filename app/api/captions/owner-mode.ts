import { database } from "@/db/postgres";

export async function isOwnerChatgptVideo(videoId: string) {
  const db = database();
  try {
    const ownerRows = await db.query(
      `SELECT 1
       FROM owner_translation_manifests
       WHERE video_id=$1
       LIMIT 1`,
      [videoId],
    ) as { "?column?": number }[];
    if (ownerRows.length > 0) return true;
  } catch (error) {
    // Deployments created before the generic owner workflow may not have the
    // additive manifest table yet. Fall through to the legacy owner marker.
    if ((error as { code?: string } | null)?.code !== "42P01") throw error;
  }

  try {
    const rows = await db.query(
      `SELECT 1
       FROM translation_commands
       WHERE video_id=$1 AND status='owner_chatgpt'
       LIMIT 1`,
      [videoId],
    ) as { "?column?": number }[];
    return rows.length > 0;
  } catch (error) {
    // Fresh/test environments may not have the legacy command table yet. Only
    // that expected condition falls back to the normal automated pipeline.
    if ((error as { code?: string } | null)?.code === "42P01") return false;
    throw error;
  }
}

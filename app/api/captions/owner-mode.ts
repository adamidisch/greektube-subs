import { database } from "@/db/postgres";

export async function isOwnerChatgptVideo(videoId: string) {
  try {
    const db = database();
    const rows = await db.query(
      `SELECT 1
       FROM translation_commands
       WHERE video_id=$1 AND status='owner_chatgpt'
       LIMIT 1`,
      [videoId],
    ) as { "?column?": number }[];
    return rows.length > 0;
  } catch (error) {
    // Fresh/test environments may not have the command table yet. Only that
    // expected condition falls back to the normal automated pipeline.
    if ((error as { code?: string } | null)?.code === "42P01") return false;
    throw error;
  }
}

import { database } from "@/db/postgres";
import { ensureOwnerTranslationTable } from "../owner-translation/store";

export async function isOwnerChatgptVideo(videoId: string) {
  await ensureOwnerTranslationTable();
  const db = database();
  const ownerRows = await db.query(
    `SELECT 1
     FROM owner_translation_manifests
     WHERE video_id=$1
     LIMIT 1`,
    [videoId],
  ) as { "?column?": number }[];
  if (ownerRows.length > 0) return true;

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

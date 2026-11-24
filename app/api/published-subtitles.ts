import { database } from "@/db/postgres";
import { createPublishedStore, type Sql } from "./published-store";
import { githubMirror } from "./published-mirror-github";
import { markVerifiedSnapshotTrack } from "./subtitle-track";

export { SubtitlesUnavailable, PublicationIncomplete } from "./published-store";

const sql: Sql = async (text, params) => await database().query(text, params ?? []) as Record<string, unknown>[];
let store: ReturnType<typeof createPublishedStore> | null = null;
const published = () => store ??= createPublishedStore({ sql, mirror: githubMirror() });
const served = new WeakMap<object, "neon" | "mirror">();

/** Where this payload object was read from in this request: "neon", "mirror" or undefined (legacy Blob). */
export function publishedSource(value: unknown) {
  return value && typeof value === "object" ? served.get(value) : undefined;
}

/** Hash-verified read: Neon, then the GitHub mirror. Throws SubtitlesUnavailable when neither answers. */
export async function readPublished(videoId: string, transcriptVersion: number, includeEnglish: boolean) {
  const stored = await published().read(videoId, transcriptVersion, includeEnglish);
  if (!stored) return null;
  const payload = { ...stored.payload };
  markVerifiedSnapshotTrack(payload.subtitleTrack);
  served.set(payload, stored.source);
  return { payload, englishCues: stored.englishCues, contentHash: stored.contentHash, source: stored.source };
}

/** Same text and hash in Neon and the mirror; readers stay on the last confirmed version if any step fails. */
export async function publishVerified(videoId: string, transcriptVersion: number, greekPayload: Record<string, unknown>, englishCues: unknown[], origin: "publish" | "restore") {
  return await published().publish(videoId, transcriptVersion, greekPayload, englishCues, origin);
}

export async function syncPublishedMirror(videoId: string, transcriptVersion: number) {
  return await published().syncMirror(videoId, transcriptVersion);
}

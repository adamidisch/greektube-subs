import { canonicalSpeakerForVideo } from "@/app/speaker-catalog";
import { timingSafeEqual } from "node:crypto";
import { database } from "@/db/postgres";
import { getTranscript, getTranscriptRowMeta, ensureTranscriptTable, TRANSCRIPT_VERSION } from "@/app/api/shared-cache";
import { readPublishedTranscript } from "@/app/api/transcript-blob";

/**
 * GreekTube export contract v1 — read-only, one-way.
 * Consumers (e.g. LOGI/MIE) pull published videos; GreekTube never knows who reads.
 * Changing the response shape means a new version (v2); v1 stays as is.
 */
export const EXPORT_SCHEMA = "greektube.export.v1";

const JSON_HEADERS = { "Cache-Control": "no-store", "X-Export-Schema": EXPORT_SCHEMA };
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function exportJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: JSON_HEADERS });
}

/** Bearer token from EXPORT_API_TOKEN. Returns a Response when access is refused, otherwise null. */
export function refuseUnauthorized(request: Request): Response | null {
  const expected = process.env.EXPORT_API_TOKEN || "";
  if (expected.length < 32) return exportJson({ error: "export_not_configured" }, 503);
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return exportJson({ error: "unauthorized" }, 401);
  return null;
}

export function validVideoId(value: string) {
  return VIDEO_ID.test(value);
}

type PublishedRevision = { revision: number; sourceHash: string; publishedAt: string | null } | null;

async function publishedRevisions(videoIds?: string[]): Promise<Map<string, PublishedRevision>> {
  const map = new Map<string, PublishedRevision>();
  try {
    const rows = await database().query(
      `SELECT DISTINCT ON (video_id) video_id, revision, source_hash, published_at
         FROM owner_translation_manifests
        WHERE status = 'published' ${videoIds ? "AND video_id = ANY($1)" : ""}
        ORDER BY video_id, revision DESC`,
      videoIds ? [videoIds] : [],
    ) as { video_id: string; revision: number; source_hash: string; published_at: string | null }[];
    for (const row of rows) map.set(row.video_id, { revision: Number(row.revision), sourceHash: row.source_hash, publishedAt: row.published_at });
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "42P01") throw error;
  }
  return map;
}


/** Category and speaker as curated in the shared library (the owner sets "Medical" in the editor). */
async function libraryMeta() {
  const map = new Map<string, { category: string; speaker: string }>();
  try {
    const rows = await database().query("SELECT value FROM app_state WHERE key = $1 LIMIT 1", ["greektube-shared-library-v1"]) as { value: string }[];
    const parsed = rows[0] ? JSON.parse(rows[0].value) as { videos?: Record<string, unknown>[] } : {};
    for (const video of Array.isArray(parsed.videos) ? parsed.videos : []) {
      const id = String(video.id || "");
      if (!id) continue;
      const speaker = video.speaker && typeof video.speaker === "object" ? String((video.speaker as { name?: unknown }).name || "") : "";
      map.set(id, { category: typeof video.category === "string" ? video.category : "", speaker });
    }
  } catch { /* library not available */ }
  return map;
}

function speakerName(videoId: string, fromLibrary: string, channel: string) {
  return canonicalSpeakerForVideo(videoId, fromLibrary, channel)?.name || "";
}

export async function listExportVideos() {
  await ensureTranscriptTable();
  const rows = await database().query(
    `SELECT video_id, title, channel, duration, transcript_version, updated_at
       FROM video_transcripts
      WHERE status = 'ready' AND greek_count > 0
      ORDER BY updated_at DESC`,
  ) as { video_id: string; title: string; channel: string; duration: number; transcript_version: number; updated_at: string }[];
  const revisions = await publishedRevisions();
  const library = await libraryMeta();
  // Rows saved without a title or channel: published transcript first, then YouTube oEmbed, and remember it.
  const fallbacks = new Map<string, { title: string; channel: string }>();
  await Promise.all(rows.filter(row => !row.title?.trim() || !row.channel?.trim()).map(async row => {
    let title = row.title?.trim() || "";
    let channel = row.channel?.trim() || "";
    try {
      if (!title) title = (await loadSubtitles(row.video_id))?.title || "";
    } catch { /* continue */ }
    if (!title || !channel) {
      try {
        const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${row.video_id}`)}`, { cache: "no-store" });
        if (response.ok) {
          const meta = await response.json() as { title?: string; author_name?: string };
          title = title || meta.title || "";
          channel = channel || meta.author_name || "";
        }
      } catch { /* keep what we have */ }
    }
    if (title || channel) {
      fallbacks.set(row.video_id, { title, channel });
      try {
        await database().query(
          `UPDATE video_transcripts SET title = CASE WHEN COALESCE(title,'')='' THEN $2 ELSE title END, channel = CASE WHEN COALESCE(channel,'')='' THEN $3 ELSE channel END WHERE video_id = $1`,
          [row.video_id, title, channel],
        );
      } catch { /* best effort */ }
    }
  }));
  return rows.map(row => {
    const published = revisions.get(row.video_id) || null;
    return {
      youtubeId: row.video_id,
      title: row.title?.trim() || fallbacks.get(row.video_id)?.title || "",
      channel: row.channel?.trim() || fallbacks.get(row.video_id)?.channel || "",
      durationSeconds: Number(row.duration) || 0,
      transcriptVersion: Number(row.transcript_version) || 0,
      category: library.get(row.video_id)?.category || "",
      speaker: speakerName(row.video_id, library.get(row.video_id)?.speaker || "", row.channel || ""),
      greekSource: published ? "owner_reviewed" : "automatic",
      publishedRevision: published?.revision ?? null,
      updatedAt: published?.publishedAt || row.updated_at,
      url: `https://greektubesubs.com/?video=${row.video_id}`,
    };
  });
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

type TimedText = { start: number; duration: number; text: string };

function timedList(value: unknown): TimedText[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const cue = item as Record<string, unknown>;
    const start = Number(cue.start);
    const end = Number(cue.end);
    const duration = Number.isFinite(Number(cue.duration)) ? Number(cue.duration) : (Number.isFinite(end) ? end - start : 0);
    if (!Number.isFinite(start)) return [];
    return [{ start, duration: Math.max(0, duration), text: typeof cue.text === "string" ? cue.text : "" }];
  });
}

/** Same source the player uses: the published Blob transcript, falling back to the transcript record. */
async function loadSubtitles(videoId: string) {
  const published = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, true);
  if (published) {
    const greek = timedList(published.cues);
    const english = timedList(published.englishCues);
    if (greek.length) {
      return {
        greek,
        english,
        title: typeof published.title === "string" ? published.title : "",
        channel: typeof published.channel === "string" ? published.channel : "",
        duration: Number(published.duration) || 0,
        originalLanguage: typeof published.sourceLanguage === "string" ? published.sourceLanguage : "en",
        updatedAt: typeof published.updatedAt === "string" ? published.updatedAt : null,
      };
    }
  }
  const record = await getTranscript(videoId);
  if (!record || record.status !== "ready" || record.greekTranscript.length === 0) return null;
  const timing = record.timestamps.length === record.greekTranscript.length ? record.timestamps : record.greekTranscript;
  return {
    greek: record.greekTranscript.map((cue, index) => ({ start: timing[index].start, duration: timing[index].duration, text: cue.text })),
    english: record.englishTranscript.map(cue => ({ start: cue.start, duration: cue.duration, text: cue.text })),
    title: record.title,
    channel: record.channel,
    duration: Number(record.duration) || 0,
    originalLanguage: record.originalLanguage || "en",
    updatedAt: record.updatedAt,
  };
}

export async function exportVideo(videoId: string) {
  const loaded = await loadSubtitles(videoId);
  if (!loaded) return null;
  const meta = await getTranscriptRowMeta(videoId).catch(() => null);
  const published = (await publishedRevisions([videoId])).get(videoId) || null;
  const { greek, english } = loaded;
  const cues = greek.map((cue, index) => ({
    index,
    start: round(cue.start),
    end: round(cue.start + cue.duration),
    en: english[index]?.text ?? "",
    el: cue.text,
  }));
  return {
    schema: EXPORT_SCHEMA,
    youtubeId: videoId,
    title: loaded.title || meta?.title || "",
    channel: loaded.channel || meta?.channel || "",
    durationSeconds: loaded.duration || meta?.duration || 0,
    originalLanguage: loaded.originalLanguage,
    transcriptVersion: TRANSCRIPT_VERSION,
    greekSource: published ? "owner_reviewed" : "automatic",
    publishedRevision: published?.revision ?? null,
    sourceHash: published?.sourceHash ?? null,
    updatedAt: published?.publishedAt || loaded.updatedAt,
    url: `https://greektubesubs.com/?video=${videoId}`,
    cueCount: cues.length,
    englishAligned: english.length === greek.length,
    cues,
  };
}

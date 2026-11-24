import { publishedBodies, sha256, verifiedBody, type PublishedBodies } from "./published-subtitles-core.ts";

/**
 * Published subtitles: Neon (primary) + a private GitHub mirror (fallback), same text, same SHA-256.
 *
 * Publication order, each step idempotent so the same publication can simply be retried:
 *   1. Neon row inserted as pending (not served).
 *   2. Mirror files written by content hash and read back.
 *   3. Neon row confirmed (served from now on).
 *   4. Mirror pointer moved to the new hash and read back.
 * A failure at any step leaves readers on the last confirmed version.
 */
export type Sql = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export type Mirror = {
  /** Text of the file, null when it does not exist; throws when the mirror cannot answer. */
  get(path: string): Promise<string | null>;
  put(path: string, text: string, message: string): Promise<void>;
};
export type StoredPublication = { payload: Record<string, unknown>; englishCues?: unknown[]; contentHash: string; source: "neon" | "mirror" };
export class SubtitlesUnavailable extends Error {
  constructor() { super("Οι υπότιτλοι είναι προσωρινά μη διαθέσιμοι."); this.name = "SubtitlesUnavailable"; }
}
export class PublicationIncomplete extends Error {
  readonly step: "neon" | "mirror" | "confirm" | "pointer";
  constructor(step: "neon" | "mirror" | "confirm" | "pointer", cause: unknown) {
    super(`Η δημοσίευση δεν ολοκληρώθηκε (${step}): ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PublicationIncomplete"; this.step = step;
  }
}

type Pointer = { videoId: string; transcriptVersion: number; contentHash: string; greekHash: string; englishHash: string };

export const mirrorPaths = (videoId: string, version: number, contentHash = "") => ({
  pointer: `subtitles/v${version}/${videoId}/latest.json`,
  greek: `subtitles/v${version}/${videoId}/${contentHash}/greek.json`,
  english: `subtitles/v${version}/${videoId}/${contentHash}/english.json`,
});

const NEON_CACHE_MS = 60_000;
const MIRROR_CACHE_MS = 10 * 60_000;

export function createPublishedStore(deps: { sql: Sql; mirror: Mirror | null; now?: () => number }) {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { at: number; value: StoredPublication }>();
  let ensured: Promise<void> | null = null;

  function ensureTable() {
    ensured ??= (async () => {
      await deps.sql(`CREATE TABLE IF NOT EXISTS published_subtitles (
        id BIGSERIAL PRIMARY KEY,
        video_id TEXT NOT NULL,
        transcript_version INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        greek_hash TEXT NOT NULL,
        english_hash TEXT NOT NULL,
        greek_body TEXT NOT NULL,
        english_body TEXT NOT NULL,
        origin TEXT NOT NULL,
        published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        confirmed BOOLEAN NOT NULL DEFAULT false,
        UNIQUE (video_id, transcript_version, content_hash)
      )`);
      const column = await deps.sql("SELECT 1 FROM information_schema.columns WHERE table_name = 'published_subtitles' AND column_name = 'confirmed'");
      if (!column.length) {
        // Rows written before the mirror existed (7.26.0) were already served: they stay confirmed.
        await deps.sql("ALTER TABLE published_subtitles ADD COLUMN confirmed BOOLEAN NOT NULL DEFAULT true");
        await deps.sql("ALTER TABLE published_subtitles ALTER COLUMN confirmed SET DEFAULT false");
      }
      await deps.sql("CREATE INDEX IF NOT EXISTS published_subtitles_latest_idx ON published_subtitles (video_id, transcript_version, published_at DESC, id DESC)");
    })().catch(error => { ensured = null; throw error; });
    return ensured;
  }

  const key = (source: string, videoId: string, version: number, english: boolean) => `${source}:${version}:${videoId}:${english ? "en" : "el"}`;
  function remember(source: "neon" | "mirror", videoId: string, version: number, english: boolean, value: StoredPublication) {
    cache.set(key(source, videoId, version, english), { at: now(), value });
    return value;
  }
  function recalled(source: "neon" | "mirror", videoId: string, version: number, english: boolean, maxAge: number) {
    const hit = cache.get(key(source, videoId, version, english));
    return hit && now() - hit.at < maxAge ? hit.value : null;
  }
  function forget(videoId: string, version: number) {
    for (const source of ["neon", "mirror"]) for (const english of [true, false]) cache.delete(key(source, videoId, version, english));
  }

  function checked(payload: unknown, videoId: string, version: number) {
    const row = payload as Record<string, unknown>;
    if (row?.videoId !== videoId || row.transcriptVersion !== version) throw Error("Published subtitles do not match their video");
    return row;
  }

  async function readNeon(videoId: string, version: number, english: boolean): Promise<StoredPublication | null> {
    const hit = recalled("neon", videoId, version, english, NEON_CACHE_MS);
    if (hit) return hit;
    await ensureTable();
    const columns = english ? "content_hash, greek_hash, greek_body, english_hash, english_body" : "content_hash, greek_hash, greek_body";
    const rows = await deps.sql(`SELECT ${columns} FROM published_subtitles WHERE video_id = $1 AND transcript_version = $2 AND confirmed
      ORDER BY published_at DESC, id DESC LIMIT 1`, [videoId, version]);
    if (!rows[0]) return null;
    const payload = checked(verifiedBody(rows[0].greek_body, rows[0].greek_hash), videoId, version);
    const englishCues = english ? verifiedBody(rows[0].english_body, rows[0].english_hash) as unknown[] : undefined;
    return remember("neon", videoId, version, english, { payload, englishCues, contentHash: String(rows[0].content_hash), source: "neon" });
  }

  async function readMirror(videoId: string, version: number, english: boolean): Promise<StoredPublication | null> {
    const hit = recalled("mirror", videoId, version, english, MIRROR_CACHE_MS);
    if (hit) return hit;
    if (!deps.mirror) throw Error("Mirror not configured");
    const pointerText = await deps.mirror.get(mirrorPaths(videoId, version).pointer);
    if (pointerText === null) return null;
    const pointer = JSON.parse(pointerText) as Pointer;
    if (pointer.videoId !== videoId || pointer.transcriptVersion !== version || sha256(`${pointer.greekHash}:${pointer.englishHash}`) !== pointer.contentHash)
      throw Error("Mirror pointer is invalid");
    const paths = mirrorPaths(videoId, version, pointer.contentHash);
    const payload = checked(verifiedBody(await deps.mirror.get(paths.greek), pointer.greekHash), videoId, version);
    const englishCues = english ? verifiedBody(await deps.mirror.get(paths.english), pointer.englishHash) as unknown[] : undefined;
    return remember("mirror", videoId, version, english, { payload, englishCues, contentHash: pointer.contentHash, source: "mirror" });
  }

  /** Neon first; when Neon does not answer, the mirror (cached); when both fail, SubtitlesUnavailable. */
  async function read(videoId: string, version: number, english: boolean): Promise<StoredPublication | null> {
    try {
      return await readNeon(videoId, version, english);
    } catch (neonError) {
      try {
        return await readMirror(videoId, version, english);
      } catch {
        // Last copy this instance confirmed, however old: better than nothing during a double outage.
        const stale = cache.get(key("neon", videoId, version, english)) ?? cache.get(key("mirror", videoId, version, english));
        if (stale) return stale.value;
        console.warn("[published-subtitles:unavailable]", JSON.stringify({ videoId, error: neonError instanceof Error ? neonError.message : "unknown" }));
        throw new SubtitlesUnavailable();
      }
    }
  }

  async function mirrorVersion(videoId: string, version: number, bodies: Pick<PublishedBodies, "greekBody" | "englishBody" | "greekHash" | "englishHash" | "contentHash">) {
    if (!deps.mirror) throw Error("Mirror not configured");
    const paths = mirrorPaths(videoId, version, bodies.contentHash);
    for (const [path, text, hash] of [[paths.greek, bodies.greekBody, bodies.greekHash], [paths.english, bodies.englishBody, bodies.englishHash]] as const) {
      const existing = await deps.mirror.get(path);
      if (existing !== null && sha256(existing) === hash) continue;
      await deps.mirror.put(path, text, `${videoId} v${version} ${bodies.contentHash.slice(0, 12)}`);
      const back = await deps.mirror.get(path);
      if (back === null || sha256(back) !== hash) throw Error("Mirror read-back hash mismatch");
    }
  }

  async function movePointer(videoId: string, version: number, bodies: Pick<PublishedBodies, "greekHash" | "englishHash" | "contentHash">) {
    if (!deps.mirror) throw Error("Mirror not configured");
    const pointer: Pointer = { videoId, transcriptVersion: version, contentHash: bodies.contentHash, greekHash: bodies.greekHash, englishHash: bodies.englishHash };
    const path = mirrorPaths(videoId, version).pointer, text = JSON.stringify(pointer);
    const existing = await deps.mirror.get(path);
    if (existing === text) return;
    await deps.mirror.put(path, text, `${videoId} v${version} → ${bodies.contentHash.slice(0, 12)}`);
    if (await deps.mirror.get(path) !== text) throw Error("Mirror pointer read-back mismatch");
  }

  async function publish(videoId: string, version: number, greekPayload: Record<string, unknown>, englishCues: unknown[], origin: string) {
    const bodies = publishedBodies(greekPayload, englishCues);
    try {
      await ensureTable();
      await deps.sql(`INSERT INTO published_subtitles (video_id, transcript_version, content_hash, greek_hash, english_hash, greek_body, english_body, origin, confirmed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false) ON CONFLICT (video_id, transcript_version, content_hash) DO NOTHING`,
        [videoId, version, bodies.contentHash, bodies.greekHash, bodies.englishHash, bodies.greekBody, bodies.englishBody, origin]);
    } catch (error) { throw new PublicationIncomplete("neon", error); }
    try { await mirrorVersion(videoId, version, bodies); } catch (error) { throw new PublicationIncomplete("mirror", error); }
    try {
      const rows = await deps.sql(`UPDATE published_subtitles SET confirmed = true, published_at = now()
        WHERE video_id = $1 AND transcript_version = $2 AND content_hash = $3 AND greek_hash = $4 AND english_hash = $5 RETURNING id`,
        [videoId, version, bodies.contentHash, bodies.greekHash, bodies.englishHash]);
      if (rows.length !== 1) throw Error("Neon row missing");
    } catch (error) { throw new PublicationIncomplete("confirm", error); }
    forget(videoId, version);
    try { await movePointer(videoId, version, bodies); } catch (error) { throw new PublicationIncomplete("pointer", error); }
    const stored = await readNeon(videoId, version, true);
    if (stored?.contentHash !== bodies.contentHash) throw new PublicationIncomplete("confirm", "read-back differs");
    return bodies.contentHash;
  }

  /** Copies the live Neon version to the mirror (repair, or first mirror of an older publication). */
  async function syncMirror(videoId: string, version: number) {
    forget(videoId, version);
    await ensureTable();
    const rows = await deps.sql(`SELECT content_hash, greek_hash, greek_body, english_hash, english_body FROM published_subtitles
      WHERE video_id = $1 AND transcript_version = $2 AND confirmed ORDER BY published_at DESC, id DESC LIMIT 1`, [videoId, version]);
    const row = rows[0];
    if (!row) return null;
    verifiedBody(row.greek_body, row.greek_hash); verifiedBody(row.english_body, row.english_hash);
    const bodies = { greekBody: String(row.greek_body), englishBody: String(row.english_body), greekHash: String(row.greek_hash),
      englishHash: String(row.english_hash), contentHash: String(row.content_hash) };
    await mirrorVersion(videoId, version, bodies);
    await movePointer(videoId, version, bodies);
    forget(videoId, version);
    const mirrored = await readMirror(videoId, version, true);
    return { neon: bodies.contentHash, mirror: mirrored?.contentHash ?? null };
  }

  return { read, publish, syncMirror, readNeon, readMirror, ensureTable, forget };
}

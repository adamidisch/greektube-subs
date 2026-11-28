import { database } from "@/db/postgres";
export type SupadataCue = {
  start: number;
  duration: number;
  text: string;
};

export type SupadataTranscript = {
  lang: string;
  cues: SupadataCue[];
};

type SupadataChunk = {
  text?: unknown;
  offset?: unknown;
  duration?: unknown;
  lang?: unknown;
};

type SupadataResult = {
  content?: unknown;
  lang?: unknown;
  availableLangs?: unknown;
  jobId?: unknown;
  status?: unknown;
  result?: unknown;
  error?: unknown;
};

const API_BASE = "https://api.supadata.ai/v1/transcript";

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function apiKey() {
  const value = process.env.SUPADATA_API_KEY?.trim();
  if (!value) throw new Error("SUPADATA_API_KEY is not configured");
  return value;
}

function transcriptFromPayload(payload: SupadataResult): SupadataTranscript | null {
  const source = payload.result && typeof payload.result === "object"
    ? payload.result as SupadataResult
    : payload;
  if (!Array.isArray(source.content)) return null;

  const cues = (source.content as SupadataChunk[])
    .map((chunk) => {
      const text = typeof chunk.text === "string" ? chunk.text.replace(/\s+/g, " ").trim() : "";
      const offset = Number(chunk.offset);
      const duration = Number(chunk.duration);
      if (!text || !Number.isFinite(offset) || !Number.isFinite(duration)) return null;
      return {
        start: Math.max(0, offset / 1000),
        duration: Math.max(0.05, duration / 1000),
        text,
      } satisfies SupadataCue;
    })
    .filter((cue): cue is SupadataCue => cue !== null);

  if (!cues.length) return null;
  const lang = typeof source.lang === "string" && source.lang.trim()
    ? source.lang.trim().toLowerCase()
    : "unknown";
  return { lang, cues };
}

async function parseError(response: Response) {
  try {
    const body = await response.json() as SupadataResult;
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return (await response.text().catch(() => "")).slice(0, 500);
  }
}

async function pollJob(jobId: string, key: string) {
  // Bound source polling well below the Vercel function limit. A timed-out
  // source slice is retried by the checkpoint state machine, not held open.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetchWithTimeout(`${API_BASE}/${encodeURIComponent(jobId)}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supadata job ${response.status}: ${await parseError(response)}`);
    const payload = await response.json() as SupadataResult;
    const status = typeof payload.status === "string" ? payload.status : "";
    if (status === "failed") {
      throw new Error(`Supadata job failed: ${typeof payload.error === "string" ? payload.error : "unknown error"}`);
    }
    const transcript = transcriptFromPayload(payload);
    if (status === "completed" && transcript) return transcript;
  }
  throw new Error("Supadata transcript job timed out");
}

// Cost guard. Every Supadata transcript call is a paid credit, so:
// 1. a video whose English source is already stored is never fetched again;
// 2. new fetches are capped per UTC day (SUPADATA_DAILY_LIMIT, default 5);
// 3. if the database is unreachable the cap fails closed, so no credit is spent blind.
const DAILY_LIMIT = Math.max(1, Number(process.env.SUPADATA_DAILY_LIMIT) || 5);
let guardTablesReady = false;

export class SupadataLimitError extends Error {
  constructor() {
    super("Supadata daily limit reached");
    this.name = "SupadataLimitError";
  }
}

async function ensureGuardTables() {
  if (guardTablesReady) return;
  const db = database();
  await db.query(`CREATE TABLE IF NOT EXISTS supadata_source_cache (
    video_id text PRIMARY KEY,
    lang text NOT NULL,
    cues jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS supadata_daily_usage (
    day date PRIMARY KEY,
    calls integer NOT NULL DEFAULT 0
  )`);
  guardTablesReady = true;
}

async function readStoredSource(videoId: string): Promise<SupadataTranscript | null> {
  try {
    await ensureGuardTables();
    const rows = (await database().query(
      `SELECT lang, cues FROM supadata_source_cache WHERE video_id = $1`,
      [videoId],
    )) as { lang: string; cues: SupadataCue[] }[];
    const row = rows[0];
    if (!row || !Array.isArray(row.cues) || !row.cues.length) return null;
    return { lang: row.lang, cues: row.cues };
  } catch {
    return null;
  }
}

async function storeSource(videoId: string, transcript: SupadataTranscript) {
  try {
    await database().query(
      `INSERT INTO supadata_source_cache (video_id, lang, cues) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (video_id) DO NOTHING`,
      [videoId, transcript.lang, JSON.stringify(transcript.cues)],
    );
  } catch {
    // Storing is best effort: the transcript was already paid for and is returned to the caller.
  }
}

async function reserveDailyCall() {
  await ensureGuardTables();
  // Atomic: the counter only moves while it is under the limit, so a blocked
  // request does not keep inflating the number.
  const rows = (await database().query(
    `INSERT INTO supadata_daily_usage (day, calls) VALUES (CURRENT_DATE, 1)
     ON CONFLICT (day) DO UPDATE SET calls = supadata_daily_usage.calls + 1
     WHERE supadata_daily_usage.calls < $1
     RETURNING calls`,
    [DAILY_LIMIT],
  )) as { calls: number }[];
  if (!rows.length) throw new SupadataLimitError();
}

async function fetchSupadataTranscriptUncached(videoId: string): Promise<SupadataTranscript> {
  const key = apiKey();
  const endpoint = new URL(API_BASE);
  endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("text", "false");
  endpoint.searchParams.set("mode", "native");

  const response = await fetchWithTimeout(endpoint.toString(), {
    headers: { "x-api-key": key },
    cache: "no-store",
  });

  if (response.status === 202) {
    const payload = await response.json() as SupadataResult;
    if (typeof payload.jobId !== "string" || !payload.jobId) {
      throw new Error("Supadata returned 202 without a jobId");
    }
    return pollJob(payload.jobId, key);
  }

  if (!response.ok) {
    throw new Error(`Supadata ${response.status}: ${await parseError(response)}`);
  }

  const payload = await response.json() as SupadataResult;
  const transcript = transcriptFromPayload(payload);
  if (!transcript) throw new Error("Supadata returned an empty native transcript");
  return transcript;
}

export async function fetchSupadataTranscript(videoId: string): Promise<SupadataTranscript> {
  const stored = await readStoredSource(videoId);
  if (stored) return stored;
  await reserveDailyCall();
  const transcript = await fetchSupadataTranscriptUncached(videoId);
  await storeSource(videoId, transcript);
  return transcript;
}

export async function fetchYouTubeOEmbed(videoId: string) {
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    endpoint.searchParams.set("format", "json");
    const response = await fetchWithTimeout(endpoint.toString(), { cache: "no-store" }, 8_000);
    if (!response.ok) return { title: "", authorName: "" };
    const payload = await response.json() as { title?: unknown; author_name?: unknown };
    return {
      title: typeof payload.title === "string" ? payload.title : "",
      authorName: typeof payload.author_name === "string" ? payload.author_name : "",
    };
  } catch {
    return { title: "", authorName: "" };
  }
}

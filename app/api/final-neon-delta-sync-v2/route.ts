import { NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLES = [
  ["app_state", "key"],
  ["personal_states", "owner_key"],
  ["video_transcripts", "video_id"],
  ["user_profiles", "public_id"],
  ["analytics_events", "id"],
  ["translation_commands", "issue_number"],
  ["translation_quality_reviews", "video_id"],
] as const;

function previewOnly() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/final-neon-sync-v2";
}

function safeJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function transcriptCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (typeof value !== "string" || !value.trim()) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function nativeHashSql(table: string, orderBy: string, source = false) {
  if (table === "analytics_events") {
    return `SELECT md5(COALESCE(string_agg(md5(concat_ws(E'\\x1f',
      id::text,
      (round(extract(epoch FROM created_at) * 1000000)::bigint)::text,
      COALESCE((round(extract(epoch FROM client_ts) * 1000000)::bigint)::text, ''),
      session_id,
      event_name,
      path,
      video_id,
      referrer_host,
      country,
      city,
      device,
      browser,
      properties::text
    )), '' ORDER BY id), '')) AS hash, COUNT(*)::int AS count FROM analytics_events`;
  }
  if (table === "video_transcripts" && source) {
    return `SELECT md5(COALESCE(string_agg(md5((to_jsonb(t) || jsonb_build_object(
      'raw_english_count', jsonb_array_length(COALESCE(NULLIF(raw_english_transcript, ''), '[]')::jsonb),
      'english_count', jsonb_array_length(COALESCE(NULLIF(english_transcript, ''), '[]')::jsonb),
      'greek_count', jsonb_array_length(COALESCE(NULLIF(greek_transcript, ''), '[]')::jsonb)
    ))::text), '' ORDER BY ${orderBy}), '')) AS hash, COUNT(*)::int AS count FROM ${table} t`;
  }
  return `SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY ${orderBy}), '')) AS hash, COUNT(*)::int AS count FROM ${table} t`;
}

async function rowsForCopy(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }, table: string, orderBy: string) {
  if (table === "analytics_events") {
    return (await client.query(`SELECT id, created_at::text AS created_at, client_ts::text AS client_ts, session_id, event_name, path, video_id, referrer_host, country, city, device, browser, properties FROM analytics_events ORDER BY id`)).rows;
  }
  const rows = (await client.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`)).rows;
  if (table !== "video_transcripts") return rows;
  return rows.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      ...row,
      raw_english_count: transcriptCount(row.raw_english_transcript),
      english_count: transcriptCount(row.english_transcript),
      greek_count: transcriptCount(row.greek_transcript),
    };
  });
}

async function nativeHash(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }, table: string, orderBy: string, source = false) {
  const result = await client.query(nativeHashSql(table, orderBy, source));
  return (result.rows[0] as { hash: string; count: number } | undefined) ?? { hash: "", count: 0 };
}

export async function GET(request: Request) {
  if (!previewOnly()) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "final-sync") return new Response(null, { status: 404 });

  const sourceUrl = process.env.DATABASE_URL || "";
  const targetUrl = process.env.DATABASE_URL_STANDBY || "";
  if (!sourceUrl || !targetUrl) return NextResponse.json({ ok: false, error: "database-url-missing" }, { status: 500 });
  if (sourceUrl === targetUrl) return NextResponse.json({ ok: false, error: "source-and-target-are-identical" }, { status: 500 });

  const sourcePool = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const targetPool = new Pool({ connectionString: targetUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const source = await sourcePool.connect();
  const target = await targetPool.connect();
  const counts: Record<string, number> = {};
  const hashes: Record<string, { source: string; target: string }> = {};

  try {
    await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await target.query("BEGIN");
    await target.query(`TRUNCATE TABLE ${TABLES.map(([table]) => table).join(", ")} RESTART IDENTITY`);

    for (const [table, orderBy] of TABLES) {
      const sourceRows = await rowsForCopy(source, table, orderBy);
      const sourceCheck = await nativeHash(source, table, orderBy, true);
      if (sourceRows.length !== sourceCheck.count) throw new Error(`source-count-mismatch:${table}`);
      if (sourceRows.length > 0) {
        await target.query(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`, [safeJson(sourceRows)]);
      }
      const targetCheck = await nativeHash(target, table, orderBy, false);
      if (sourceCheck.count !== targetCheck.count || sourceCheck.hash !== targetCheck.hash) throw new Error(`parity-failed:${table}`);
      counts[table] = sourceCheck.count;
      hashes[table] = { source: sourceCheck.hash, target: targetCheck.hash };
    }

    const sourceProfileSeq = (await source.query("SELECT last_value::text AS last_value, is_called FROM user_profiles_public_id_seq")).rows[0] as { last_value: string; is_called: boolean };
    const sourceAnalyticsSeq = (await source.query("SELECT last_value::text AS last_value, is_called FROM analytics_events_id_seq")).rows[0] as { last_value: string; is_called: boolean };
    await target.query("SELECT setval('user_profiles_public_id_seq', $1::bigint, $2::boolean)", [sourceProfileSeq.last_value, sourceProfileSeq.is_called]);
    await target.query("SELECT setval('analytics_events_id_seq', $1::bigint, $2::boolean)", [sourceAnalyticsSeq.last_value, sourceAnalyticsSeq.is_called]);

    await target.query("COMMIT");
    await source.query("COMMIT");
    return NextResponse.json({ ok: true, parity: true, counts, hashes }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  } catch (error) {
    await target.query("ROLLBACK").catch(() => undefined);
    await source.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), counts }, { status: 500, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  } finally {
    source.release();
    target.release();
    await sourcePool.end().catch(() => undefined);
    await targetPool.end().catch(() => undefined);
  }
}

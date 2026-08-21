import { Pool } from "@neondatabase/serverless";

const TABLES = [
  ["app_state", "key"],
  ["personal_states", "owner_key"],
  ["video_transcripts", "video_id"],
  ["user_profiles", "public_id"],
  ["analytics_events", "id"],
  ["translation_commands", "issue_number"],
  ["translation_quality_reviews", "video_id"],
];

if (process.env.VERCEL_ENV !== "production") {
  console.log("[final-neon-delta] skipped outside production");
  process.exit(0);
}

const sourceUrl = process.env.DATABASE_URL || "";
const targetUrl = process.env.DATABASE_URL_STANDBY || "";
if (!sourceUrl || !targetUrl) throw new Error("[final-neon-delta] required production database environment is missing");
if (sourceUrl === targetUrl) throw new Error("[final-neon-delta] source and target are identical");

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function transcriptCount(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value !== "string" || !value.trim()) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function nativeHashSql(table, orderBy, source = false) {
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

async function nativeHash(client, table, orderBy, source = false) {
  const result = await client.query(nativeHashSql(table, orderBy, source));
  return result.rows[0] ?? { hash: "", count: 0 };
}

async function rowsForCopy(client, table, orderBy) {
  if (table === "analytics_events") {
    return (await client.query(`SELECT id, created_at::text AS created_at, client_ts::text AS client_ts, session_id, event_name, path, video_id, referrer_host, country, city, device, browser, properties FROM analytics_events ORDER BY id`)).rows;
  }
  const rows = (await client.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`)).rows;
  if (table !== "video_transcripts") return rows;
  return rows.map((row) => ({
    ...row,
    raw_english_count: transcriptCount(row.raw_english_transcript),
    english_count: transcriptCount(row.english_transcript),
    greek_count: transcriptCount(row.greek_transcript),
  }));
}

const sourcePool = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 10_000 });
const targetPool = new Pool({ connectionString: targetUrl, max: 1, connectionTimeoutMillis: 10_000 });
const source = await sourcePool.connect();
const target = await targetPool.connect();

try {
  await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await target.query("BEGIN");

  const checks = new Map();
  for (const [table, orderBy] of TABLES) {
    const sourceCheck = await nativeHash(source, table, orderBy, true);
    const targetCheck = await nativeHash(target, table, orderBy, false);
    checks.set(table, { sourceCheck, targetCheck, orderBy });
  }

  for (const [table] of TABLES) {
    const { sourceCheck, targetCheck, orderBy } = checks.get(table);
    if (sourceCheck.count === targetCheck.count && sourceCheck.hash === targetCheck.hash) {
      console.log(`[final-neon-delta] ${table}: unchanged (${sourceCheck.count})`);
      continue;
    }

    const sourceRows = await rowsForCopy(source, table, orderBy);
    if (sourceRows.length !== sourceCheck.count) throw new Error(`[final-neon-delta] source count changed inside snapshot: ${table}`);

    await target.query(`TRUNCATE TABLE ${table} RESTART IDENTITY`);
    if (sourceRows.length > 0) {
      await target.query(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`, [safeJson(sourceRows)]);
    }

    const copiedCheck = await nativeHash(target, table, orderBy, false);
    if (sourceCheck.count !== copiedCheck.count || sourceCheck.hash !== copiedCheck.hash) {
      throw new Error(`[final-neon-delta] parity failed: ${table}`);
    }
    console.log(`[final-neon-delta] ${table}: synced (${sourceCheck.count})`);
  }

  const sourceProfileSeq = (await source.query("SELECT last_value::text AS last_value, is_called FROM user_profiles_public_id_seq")).rows[0];
  const sourceAnalyticsSeq = (await source.query("SELECT last_value::text AS last_value, is_called FROM analytics_events_id_seq")).rows[0];
  await target.query("SELECT setval('user_profiles_public_id_seq', $1::bigint, $2::boolean)", [sourceProfileSeq.last_value, sourceProfileSeq.is_called]);
  await target.query("SELECT setval('analytics_events_id_seq', $1::bigint, $2::boolean)", [sourceAnalyticsSeq.last_value, sourceAnalyticsSeq.is_called]);

  for (const [table, orderBy] of TABLES) {
    const sourceCheck = checks.get(table).sourceCheck;
    const finalCheck = await nativeHash(target, table, orderBy, false);
    if (sourceCheck.count !== finalCheck.count || sourceCheck.hash !== finalCheck.hash) {
      throw new Error(`[final-neon-delta] final parity failed: ${table}`);
    }
  }

  await target.query("COMMIT");
  await source.query("COMMIT");
  console.log("[final-neon-delta] SUCCESS: strict parity across all 7 tables");
} catch (error) {
  await target.query("ROLLBACK").catch(() => undefined);
  await source.query("ROLLBACK").catch(() => undefined);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  source.release();
  target.release();
  await sourcePool.end().catch(() => undefined);
  await targetPool.end().catch(() => undefined);
}

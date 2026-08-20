import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { database } from "@/db/postgres";

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
    process.env.VERCEL_GIT_COMMIT_REF === "codex/neon-source-export-audit";
}

function safeJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function hashRows(rows: unknown) {
  return createHash("sha256").update(safeJson(rows)).digest("hex");
}

type TargetConfig = { host?: unknown; db?: unknown; user?: unknown; secret?: unknown };

function parseConfig(value: string | null) {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as TargetConfig;
    if (typeof parsed.host !== "string" || typeof parsed.user !== "string" || typeof parsed.secret !== "string") return null;
    return {
      host: parsed.host,
      db: typeof parsed.db === "string" && parsed.db ? parsed.db : "neondb",
      user: parsed.user,
      password: parsed.secret,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!previewOnly()) return new Response(null, { status: 404 });

  const url = new URL(request.url);
  const config = parseConfig(url.searchParams.get("cfg"));
  if (!config) return NextResponse.json({ ok: false, error: "missing-target" }, { status: 400 });

  const targetUrl = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}/${encodeURIComponent(config.db)}?sslmode=require`;
  const pool = new Pool({ connectionString: targetUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const source = database();
  const client = await pool.connect();

  const sourceHashes: Record<string, string> = {};
  const targetHashes: Record<string, string> = {};
  const counts: Record<string, number> = {};

  try {
    await client.query("BEGIN");

    for (const [table, orderBy] of TABLES) {
      const sourceRows = await source.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`) as unknown[];
      counts[table] = sourceRows.length;
      sourceHashes[table] = hashRows(sourceRows);

      if (sourceRows.length > 0) {
        const payload = safeJson(sourceRows);
        await client.query(
          `INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`,
          [payload],
        );
      }

      const targetResult = await client.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      targetHashes[table] = hashRows(targetResult.rows);
      if (targetResult.rows.length !== sourceRows.length || targetHashes[table] !== sourceHashes[table]) {
        throw new Error(`parity-failed:${table}`);
      }
    }

    const sequences = {
      user_profiles_public_id_seq: (await source.query("SELECT last_value, is_called FROM user_profiles_public_id_seq") as unknown[])[0] ?? null,
      analytics_events_id_seq: (await source.query("SELECT last_value, is_called FROM analytics_events_id_seq") as unknown[])[0] ?? null,
    };

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      counts,
      sourceHashes,
      targetHashes,
      parity: Object.keys(sourceHashes).every(key => sourceHashes[key] === targetHashes[key]),
      sequences,
    }, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      counts,
      sourceHashes,
      targetHashes,
    }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

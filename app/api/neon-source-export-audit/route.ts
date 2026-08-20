import { NextResponse } from "next/server";
import { Pool } from "@neondatabase/serverless";
import { database } from "@/db/postgres";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TABLES = [
  "app_state",
  "personal_states",
  "video_transcripts",
  "user_profiles",
  "analytics_events",
  "translation_commands",
  "translation_quality_reviews",
] as const;

type AllowedTable = (typeof ALLOWED_TABLES)[number];

function previewOnly() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/neon-source-export-audit";
}

function sourceIdentity() {
  const raw = process.env.DATABASE_URL || "";
  if (!raw) return { configured: false as const };
  try {
    const parsed = new URL(raw);
    return {
      configured: true as const,
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, ""),
      user: decodeURIComponent(parsed.username || ""),
    };
  } catch {
    return { configured: true as const, host: "invalid-url", database: "", user: "" };
  }
}

function safeJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

async function directTransportProbe() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const result = await pool.query("SELECT current_database() AS database, current_user AS user, 1 AS ok");
    return result.rows;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function existingTables() {
  const db = database();
  const rows = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [ALLOWED_TABLES],
  ) as { table_name: string }[];
  return new Set(rows.map(row => row.table_name));
}

async function tableCount(table: AllowedTable) {
  const db = database();
  switch (table) {
    case "app_state": return Number((await db.query("SELECT COUNT(*) AS count FROM app_state") as { count: string | number }[])[0]?.count || 0);
    case "personal_states": return Number((await db.query("SELECT COUNT(*) AS count FROM personal_states") as { count: string | number }[])[0]?.count || 0);
    case "video_transcripts": return Number((await db.query("SELECT COUNT(*) AS count FROM video_transcripts") as { count: string | number }[])[0]?.count || 0);
    case "user_profiles": return Number((await db.query("SELECT COUNT(*) AS count FROM user_profiles") as { count: string | number }[])[0]?.count || 0);
    case "analytics_events": return Number((await db.query("SELECT COUNT(*) AS count FROM analytics_events") as { count: string | number }[])[0]?.count || 0);
    case "translation_commands": return Number((await db.query("SELECT COUNT(*) AS count FROM translation_commands") as { count: string | number }[])[0]?.count || 0);
    case "translation_quality_reviews": return Number((await db.query("SELECT COUNT(*) AS count FROM translation_quality_reviews") as { count: string | number }[])[0]?.count || 0);
  }
}

async function exportRows(table: AllowedTable, limit: number, offset: number) {
  const db = database();
  switch (table) {
    case "app_state": return db.query("SELECT * FROM app_state ORDER BY key LIMIT $1 OFFSET $2", [limit, offset]);
    case "personal_states": return db.query("SELECT * FROM personal_states ORDER BY owner_key LIMIT $1 OFFSET $2", [limit, offset]);
    case "video_transcripts": return db.query("SELECT * FROM video_transcripts ORDER BY video_id LIMIT $1 OFFSET $2", [limit, offset]);
    case "user_profiles": return db.query("SELECT * FROM user_profiles ORDER BY public_id LIMIT $1 OFFSET $2", [limit, offset]);
    case "analytics_events": return db.query("SELECT * FROM analytics_events ORDER BY id LIMIT $1 OFFSET $2", [limit, offset]);
    case "translation_commands": return db.query("SELECT * FROM translation_commands ORDER BY issue_number LIMIT $1 OFFSET $2", [limit, offset]);
    case "translation_quality_reviews": return db.query("SELECT * FROM translation_quality_reviews ORDER BY video_id LIMIT $1 OFFSET $2", [limit, offset]);
  }
}

export async function GET(request: Request) {
  if (!previewOnly()) return new Response(null, { status: 404 });

  const url = new URL(request.url);
  const requestedTable = url.searchParams.get("table") as AllowedTable | null;

  if (url.searchParams.get("transport") === "ws") {
    try {
      const rows = await directTransportProbe();
      return new Response(safeJson({ source: sourceIdentity(), transport: "pool", rows }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ source: sourceIdentity(), transport: "pool", error: message.slice(0, 1000) }, {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  }

  try {
    const present = await existingTables();

    if (!requestedTable) {
      const counts: Record<string, number | null> = {};
      for (const table of ALLOWED_TABLES) {
        counts[table] = present.has(table) ? await tableCount(table) : null;
      }
      return new Response(safeJson({ source: sourceIdentity(), tables: [...present], counts }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
      });
    }

    if (!ALLOWED_TABLES.includes(requestedTable) || !present.has(requestedTable)) {
      return NextResponse.json({ error: "table-not-available" }, { status: 404 });
    }

    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const rows = await exportRows(requestedTable, limit, offset);
    return new Response(safeJson({ table: requestedTable, offset, limit, rows }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ source: sourceIdentity(), error: message.slice(0, 1000) }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

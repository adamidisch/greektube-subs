import { NextResponse } from "next/server";
import { database } from "@/db/postgres";
import { verifyAdminSession } from "@/lib/admin-auth";

// Per-IP fixed-window limit for endpoints that spend Supadata / Groq / YouTube quota.
// Lives in Postgres so it works across serverless instances and needs no Vercel Firewall access.
// The owner (admin session) is never limited. Database errors fail open so the site keeps working.

const WINDOW_SECONDS = 600;
const DEFAULT_LIMIT = 60;
let tableReady = false;

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim().slice(0, 64);
}

export async function rateLimit(request: Request, bucket: string, limit = DEFAULT_LIMIT) {
  if (await verifyAdminSession(request).catch(() => false)) return null;
  const ip = clientIp(request);
  const windowStart = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  try {
    const db = database();
    if (!tableReady) {
      await db.query(`CREATE TABLE IF NOT EXISTS rate_limits (
        bucket text NOT NULL,
        ip text NOT NULL,
        window_start bigint NOT NULL,
        hits integer NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket, ip, window_start)
      )`);
      tableReady = true;
    }
    const rows = (await db.query(
      `INSERT INTO rate_limits (bucket, ip, window_start, hits) VALUES ($1, $2, $3, 1)
       ON CONFLICT (bucket, ip, window_start) DO UPDATE SET hits = rate_limits.hits + 1
       RETURNING hits`,
      [bucket, ip, windowStart],
    )) as { hits: number }[];
    if (Math.random() < 0.02) {
      await db.query(`DELETE FROM rate_limits WHERE window_start < $1`, [windowStart - WINDOW_SECONDS * 6]);
    }
    const hits = Number(rows[0]?.hits ?? 0);
    if (hits <= limit) return null;
    const retryAfter = windowStart + WINDOW_SECONDS - Math.floor(Date.now() / 1000);
    return NextResponse.json(
      { error: "Πάρα πολλά αιτήματα. Δοκίμασε ξανά σε λίγα λεπτά." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
    );
  } catch {
    return null;
  }
}

import { NextResponse } from "next/server";

const DEFAULT_KEY = "greektube-library-v2";

async function database() {
  const workers = await import("cloudflare:workers");
  return workers.env.DB;
}

async function ensureTable() {
  const db = await database();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

export async function GET() {
  try {
    await ensureTable();
    const db = await database();
    const row = await db.prepare("SELECT value FROM app_state WHERE key = ?")
      .bind(DEFAULT_KEY)
      .first<{ value: string }>();
    return NextResponse.json({ state: row ? JSON.parse(row.value) : null });
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η φόρτωση της βιβλιοθήκης." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const serialized = JSON.stringify(body);
    if (serialized.length > 4_500_000) {
      return NextResponse.json({ error: "Η βιβλιοθήκη είναι πολύ μεγάλη." }, { status: 413 });
    }
    await ensureTable();
    const db = await database();
    await db.prepare(
      `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
      .bind(DEFAULT_KEY, serialized, new Date().toISOString())
      .run();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η αποθήκευση." }, { status: 500 });
  }
}

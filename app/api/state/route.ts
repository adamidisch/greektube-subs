import { NextResponse } from "next/server";

const LEGACY_KEY = "greektube-library-v2";
const COOKIE = "greektube-user";

async function database() {
  const workers = await import("cloudflare:workers");
  return workers.env.DB;
}

async function ensureTable() {
  const db = await database();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS personal_states (
      owner_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
}

async function ownerKey(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email");
  if (email) {
    const bytes = new TextEncoder().encode(email.trim().toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return { key: `user:${Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("")}`, cookie: null };
  }
  const cookie = request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  const id = cookie && /^[a-zA-Z0-9-]{12,80}$/.test(cookie) ? cookie : crypto.randomUUID();
  return { key: `anon:${id}`, cookie: cookie ? null : id };
}

function sanitizePersonalState(input: unknown) {
  if (!input || typeof input !== "object") return input;
  const state = structuredClone(input) as { videos?: Array<Record<string, unknown>> };
  if (Array.isArray(state.videos)) {
    state.videos = state.videos.map(video => {
      const personalVideo = { ...video };
      delete personalVideo.captions;
      return personalVideo;
    });
  }
  return state;
}

function withIdentityCookie(response: NextResponse, value: string | null) {
  if (value) response.cookies.set(COOKIE, value, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365, path: "/" });
  return response;
}

export async function GET(request: Request) {
  try {
    await ensureTable();
    const identity = await ownerKey(request);
    const db = await database();
    const row = await db.prepare("SELECT value FROM personal_states WHERE owner_key = ?")
      .bind(identity.key).first<{ value: string }>();
    if (row) return withIdentityCookie(NextResponse.json({ state: JSON.parse(row.value) }), identity.cookie);

    // One-time migration of the previous single-user state. The first real
    // visitor receives it and it is then removed from the shared legacy key.
    const legacy = await db.prepare("SELECT value FROM app_state WHERE key = ?")
      .bind(LEGACY_KEY).first<{ value: string }>();
    if (legacy) {
      const now = new Date().toISOString();
      const value = JSON.stringify(sanitizePersonalState(JSON.parse(legacy.value)));
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO personal_states (owner_key, value, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(identity.key, value, now, now),
        db.prepare("DELETE FROM app_state WHERE key = ?").bind(LEGACY_KEY),
      ]);
      return withIdentityCookie(NextResponse.json({ state: JSON.parse(value) }), identity.cookie);
    }
    return withIdentityCookie(NextResponse.json({ state: null }), identity.cookie);
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η φόρτωση της βιβλιοθήκης." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await ownerKey(request);
    const body = sanitizePersonalState(await request.json());
    const serialized = JSON.stringify(body);
    if (serialized.length > 1_500_000) return NextResponse.json({ error: "Η προσωπική βιβλιοθήκη είναι πολύ μεγάλη." }, { status: 413 });
    await ensureTable();
    const db = await database();
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO personal_states (owner_key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(identity.key, serialized, now, now).run();
    return withIdentityCookie(NextResponse.json({ ok: true }), identity.cookie);
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η αποθήκευση." }, { status: 500 });
  }
}

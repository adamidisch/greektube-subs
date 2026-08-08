import { NextResponse } from "next/server";
import { database } from "@/db/postgres";

const LEGACY_KEY = "greektube-library-v2";
const SHARED_LIBRARY_KEY = "greektube-shared-library-v1";
const COOKIE = "greektube-user";
const ADMIN_COOKIE = "greektube-admin";
const ADMIN_SESSION_MESSAGE = "greektube-edit-authorized";
type VideoRecord = Record<string, unknown> & { id?: unknown };
type PersonalState = { videos?: VideoRecord[]; moments?: unknown[]; settings?: Record<string, unknown> };

async function ensureTable() {
  const db = database();
  await db.query(`CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS personal_states (
    owner_key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
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

async function adminSecret() {
  return String(process.env.ADMIN_EDIT_PASSWORD || "");
}

async function adminSessionToken(password: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ADMIN_SESSION_MESSAGE));
  return Array.from(new Uint8Array(signature)).map(value => value.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function isAdminRequest(request: Request) {
  const password = await adminSecret();
  if (!password) return false;
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim())
    .find(value => value.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1) || "";
  return safeEqual(cookie, await adminSessionToken(password));
}

function sanitizePersonalState(input: unknown) {
  if (!input || typeof input !== "object") return input;
  const state = structuredClone(input) as PersonalState;
  if (Array.isArray(state.videos)) {
    state.videos = state.videos.map(video => {
      const personalVideo = { ...video };
      delete personalVideo.captions;
      return personalVideo;
    });
  }
  return state;
}

function sanitizeSharedVideo(video: VideoRecord) {
  const sharedVideo = { ...video };
  delete sharedVideo.captions;
  sharedVideo.favorite = false;
  sharedVideo.lastPosition = 0;
  sharedVideo.progress = 0;
  delete sharedVideo.lastWatched;
  delete sharedVideo.views;
  return sharedVideo;
}

function mergeState(personal: PersonalState | null, sharedVideos: VideoRecord[]) {
  const personalVideos = Array.isArray(personal?.videos) ? personal!.videos! : [];
  const personalById = new Map(personalVideos.filter(video => typeof video.id === "string").map(video => [String(video.id), video]));
  const sharedById = new Map(sharedVideos.filter(video => typeof video.id === "string").map(video => [String(video.id), video]));
  personalById.forEach((video, id) => {
    if (!sharedById.has(id)) sharedById.set(id, sanitizeSharedVideo(video));
  });
  const videos = Array.from(sharedById.values()).map(video => {
    const personalVideo = typeof video.id === "string" ? personalById.get(video.id) : null;
    return {
      ...video,
      favorite: Boolean(personalVideo?.favorite),
      lastPosition: Number(personalVideo?.lastPosition || 0),
      progress: Number(personalVideo?.progress || 0),
      lastWatched: typeof personalVideo?.lastWatched === "string" ? personalVideo.lastWatched : undefined,
      views: Number(personalVideo?.views || 0),
    };
  }).sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
  return { settings: personal?.settings, moments: personal?.moments || [], videos };
}

async function getSharedVideos() {
  const db = database();
  const rows = await db.query("SELECT value FROM app_state WHERE key = $1 LIMIT 1", [SHARED_LIBRARY_KEY]) as { value: string }[];
  const row = rows[0];
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value) as { videos?: VideoRecord[] };
    return Array.isArray(parsed.videos) ? parsed.videos : [];
  } catch {
    return [];
  }
}

async function saveSharedVideos(videos: VideoRecord[]) {
  const db = database();
  const existing = await getSharedVideos();
  const byId = new Map(existing.filter(video => typeof video.id === "string").map(video => [String(video.id), video]));
  videos.filter(video => typeof video.id === "string").forEach(video => {
    byId.set(String(video.id), sanitizeSharedVideo(video));
  });
  const value = JSON.stringify({ videos: Array.from(byId.values()) });
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO app_state (key, value, created_at, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [SHARED_LIBRARY_KEY, value, now, now],
  );
}

function withIdentityCookie(response: NextResponse, value: string | null) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  if (value) response.cookies.set(COOKIE, value, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365*5, path: "/" });
  return response;
}

export async function GET(request: Request) {
  try {
    await ensureTable();
    const identity = await ownerKey(request);
    const db = database();
    const personalRows = await db.query("SELECT value FROM personal_states WHERE owner_key = $1 LIMIT 1", [identity.key]) as { value: string }[];
    const row = personalRows[0];
    const sharedVideos = await getSharedVideos();
    if (row) return withIdentityCookie(NextResponse.json({ state: mergeState(JSON.parse(row.value), sharedVideos) }), identity.cookie);

    const legacyRows = await db.query("SELECT value FROM app_state WHERE key = $1 LIMIT 1", [LEGACY_KEY]) as { value: string }[];
    const legacy = legacyRows[0];
    if (legacy) {
      const now = new Date().toISOString();
      const value = JSON.stringify(sanitizePersonalState(JSON.parse(legacy.value)));
      const legacyState = JSON.parse(value) as PersonalState;
      await saveSharedVideos(Array.isArray(legacyState.videos) ? legacyState.videos : []);
      await db.query(
        "INSERT INTO personal_states (owner_key, value, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT(owner_key) DO NOTHING",
        [identity.key, value, now, now],
      );
      await db.query("DELETE FROM app_state WHERE key = $1", [LEGACY_KEY]);
      return withIdentityCookie(NextResponse.json({ state: mergeState(legacyState, await getSharedVideos()) }), identity.cookie);
    }
    if (sharedVideos.length) {
      return withIdentityCookie(NextResponse.json({ state: mergeState(null, sharedVideos) }), identity.cookie);
    }
    return withIdentityCookie(NextResponse.json({ state: null }), identity.cookie);
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η φόρτωση της βιβλιοθήκης." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await ownerKey(request);
    const incoming = await request.json();
    const wantsSharedWrite = request.headers.get("x-greektube-shared-write") === "1";
    const canWriteShared = await isAdminRequest(request);
    let sharedSaved = false;
    let sharedVideoCount = 0;
    if (incoming && typeof incoming === "object" && Array.isArray((incoming as PersonalState).videos) && wantsSharedWrite && !canWriteShared) {
      return NextResponse.json({ error: "Απαιτείται κωδικός για συγχρονισμό της κοινής βιβλιοθήκης." }, { status: 401 });
    }
    if (incoming && typeof incoming === "object" && Array.isArray((incoming as PersonalState).videos) && canWriteShared) {
      await ensureTable();
      await saveSharedVideos((incoming as PersonalState).videos!);
      sharedSaved = true;
      sharedVideoCount = (incoming as PersonalState).videos!.length;
    }
    const body = sanitizePersonalState(incoming);
    const serialized = JSON.stringify(body);
    if (serialized.length > 1_500_000) return NextResponse.json({ error: "Η προσωπική βιβλιοθήκη είναι πολύ μεγάλη." }, { status: 413 });
    await ensureTable();
    const db = database();
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO personal_states (owner_key, value, created_at, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT(owner_key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [identity.key, serialized, now, now],
    );
    return withIdentityCookie(NextResponse.json({ ok: true, sharedSaved, sharedVideoCount }), identity.cookie);
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η αποθήκευση." }, { status: 500 });
  }
}

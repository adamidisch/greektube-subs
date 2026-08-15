import { NextResponse } from "next/server";
import { database } from "@/db/postgres";

const COOKIE = "greektube-user";
const USERNAME_MIN = 3;
const USERNAME_MAX = 24;

type ProfileRow = {
  public_id: string | number;
  owner_key: string;
  username: string | null;
  username_key: string | null;
  created_at: string;
  updated_at: string;
};

async function ensureTable() {
  const db = database();
  await db.query(`CREATE TABLE IF NOT EXISTS user_profiles (
    public_id BIGSERIAL PRIMARY KEY,
    owner_key TEXT NOT NULL UNIQUE,
    username TEXT UNIQUE,
    username_key TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

function readCookie(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1) || null;
}

async function ownerKey(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email");
  if (email) {
    const bytes = new TextEncoder().encode(email.trim().toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join("");
    return `user:${hash}`;
  }
  const cookie = readCookie(request);
  if (!cookie || !/^[a-zA-Z0-9-]{12,80}$/.test(cookie)) return null;
  return `anon:${cookie}`;
}

function usernameKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function validateUsername(value: string) {
  const username = value.normalize("NFKC").trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { ok: false as const, error: `Το όνομα πρέπει να έχει ${USERNAME_MIN}–${USERNAME_MAX} χαρακτήρες.` };
  }
  if (!/^[\p{L}\p{N}_-]+$/u.test(username)) {
    return { ok: false as const, error: "Χρησιμοποίησε μόνο γράμματα, αριθμούς, _ ή -." };
  }
  return { ok: true as const, username, key: usernameKey(username) };
}

async function getOrCreateProfile(owner: string) {
  await ensureTable();
  const db = database();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO user_profiles (owner_key, username, username_key, created_at, updated_at)
     VALUES ($1, NULL, NULL, $2, $2)
     ON CONFLICT(owner_key) DO NOTHING`,
    [owner, now],
  );
  let rows = await db.query(
    "SELECT public_id, owner_key, username, username_key, created_at, updated_at FROM user_profiles WHERE owner_key = $1 LIMIT 1",
    [owner],
  ) as ProfileRow[];
  let profile = rows[0];
  if (!profile) throw new Error("Profile was not created.");
  if (!profile.username) {
    const generated = `User${Number(profile.public_id) + 1000}`;
    await db.query(
      "UPDATE user_profiles SET username = $1, username_key = $2, updated_at = $3 WHERE owner_key = $4",
      [generated, usernameKey(generated), now, owner],
    );
    rows = await db.query(
      "SELECT public_id, owner_key, username, username_key, created_at, updated_at FROM user_profiles WHERE owner_key = $1 LIMIT 1",
      [owner],
    ) as ProfileRow[];
    profile = rows[0];
  }
  return profile;
}

function publicProfile(profile: ProfileRow) {
  return {
    username: profile.username,
    anonymous: profile.owner_key.startsWith("anon:"),
    createdAt: profile.created_at,
  };
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}

export async function GET(request: Request) {
  try {
    const owner = await ownerKey(request);
    if (!owner) {
      return NextResponse.json({ error: "identity_pending" }, { status: 409, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }
    const profile = await getOrCreateProfile(owner);
    const url = new URL(request.url);
    const check = url.searchParams.get("check");
    if (check !== null) {
      const validation = validateUsername(check);
      if (!validation.ok) return NextResponse.json({ available: false, valid: false, error: validation.error });
      if (/^user\d+$/i.test(validation.username) && validation.key !== profile.username_key) {
        return NextResponse.json({ available: false, valid: true, reserved: true });
      }
      const db = database();
      const rows = await db.query(
        "SELECT owner_key FROM user_profiles WHERE username_key = $1 LIMIT 1",
        [validation.key],
      ) as { owner_key: string }[];
      const available = !rows[0] || rows[0].owner_key === owner;
      return NextResponse.json({ available, valid: true });
    }
    return NextResponse.json({ profile: publicProfile(profile) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η φόρτωση του προφίλ." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await ownerKey(request);
    if (!owner) return NextResponse.json({ error: "Η ταυτότητα χρήστη δεν είναι ακόμη έτοιμη." }, { status: 409 });
    const profile = await getOrCreateProfile(owner);
    const body = await request.json().catch(() => null) as { username?: unknown } | null;
    if (!body || typeof body.username !== "string") return NextResponse.json({ error: "Μη έγκυρο όνομα χρήστη." }, { status: 400 });
    const validation = validateUsername(body.username);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    if (/^user\d+$/i.test(validation.username) && validation.key !== profile.username_key) {
      return NextResponse.json({ error: "Τα ονόματα τύπου User1234 κρατούνται για αυτόματα προφίλ." }, { status: 409 });
    }
    const db = database();
    const now = new Date().toISOString();
    try {
      const rows = await db.query(
        `UPDATE user_profiles
         SET username = $1, username_key = $2, updated_at = $3
         WHERE owner_key = $4
         RETURNING public_id, owner_key, username, username_key, created_at, updated_at`,
        [validation.username, validation.key, now, owner],
      ) as ProfileRow[];
      const updated = rows[0];
      if (!updated) return NextResponse.json({ error: "Δεν βρέθηκε το προφίλ." }, { status: 404 });
      return NextResponse.json({ profile: publicProfile(updated) });
    } catch (error) {
      if (isUniqueViolation(error)) return NextResponse.json({ error: "Το όνομα χρησιμοποιείται ήδη." }, { status: 409 });
      throw error;
    }
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η αλλαγή του ονόματος." }, { status: 500 });
  }
}

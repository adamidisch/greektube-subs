import { NextResponse } from "next/server";
import { database } from "@/db/postgres";
import { automaticUsername, profileOwnerKey, usernameKey, validateUsername } from "@/app/profile-domain";

type ProfileRow = {
  public_id: string | number;
  owner_key: string;
  username: string | null;
  username_key: string | null;
  created_at: string;
  updated_at: string;
};

async function getOrCreateProfile(owner: string) {
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
    const generated = automaticUsername(profile.public_id);
    await db.query(
      `UPDATE user_profiles
       SET username = $1, username_key = $2, updated_at = $3
       WHERE owner_key = $4 AND username IS NULL AND username_key IS NULL`,
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
    const owner = await profileOwnerKey(request);
    if (!owner) {
      return NextResponse.json(
        { error: "identity_pending", code: "identity_pending" },
        { status: 409, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
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
    const owner = await profileOwnerKey(request);
    if (!owner) return NextResponse.json({ error: "Η ταυτότητα χρήστη δεν είναι ακόμη έτοιμη.", code: "identity_pending" }, { status: 409 });
    const profile = await getOrCreateProfile(owner);
    const body = await request.json().catch(() => null) as { username?: unknown; currentUsername?: unknown } | null;
    if (!body || typeof body.username !== "string") return NextResponse.json({ error: "Μη έγκυρο όνομα χρήστη." }, { status: 400 });
    const validation = validateUsername(body.username);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    const expectedUsernameKey = typeof body.currentUsername === "string" ? usernameKey(body.currentUsername) : profile.username_key;
    if (expectedUsernameKey !== profile.username_key) {
      return NextResponse.json(
        { error: "Το προφίλ άλλαξε σε άλλη καρτέλα. Έγινε επαναφόρτωση του τρέχοντος ονόματος.", code: "profile_changed", profile: publicProfile(profile) },
        { status: 409 },
      );
    }
    if (/^user\d+$/i.test(validation.username) && validation.key !== profile.username_key) {
      return NextResponse.json({ error: "Τα ονόματα τύπου User1234 κρατούνται για αυτόματα προφίλ." }, { status: 409 });
    }
    const db = database();
    const now = new Date().toISOString();
    try {
      const rows = await db.query(
        `UPDATE user_profiles
         SET username = $1, username_key = $2, updated_at = $3
         WHERE owner_key = $4 AND username_key = $5
         RETURNING public_id, owner_key, username, username_key, created_at, updated_at`,
        [validation.username, validation.key, now, owner, expectedUsernameKey],
      ) as ProfileRow[];
      const updated = rows[0];
      if (!updated) {
        const currentRows = await db.query(
          "SELECT public_id, owner_key, username, username_key, created_at, updated_at FROM user_profiles WHERE owner_key = $1 LIMIT 1",
          [owner],
        ) as ProfileRow[];
        const current = currentRows[0];
        return NextResponse.json(
          { error: "Το προφίλ άλλαξε σε άλλη καρτέλα. Έγινε επαναφόρτωση του τρέχοντος ονόματος.", code: "profile_changed", profile: current ? publicProfile(current) : undefined },
          { status: 409 },
        );
      }
      return NextResponse.json({ profile: publicProfile(updated) });
    } catch (error) {
      if (isUniqueViolation(error)) return NextResponse.json({ error: "Το όνομα χρησιμοποιείται ήδη." }, { status: 409 });
      throw error;
    }
  } catch {
    return NextResponse.json({ error: "Δεν ήταν δυνατή η αλλαγή του ονόματος." }, { status: 500 });
  }
}

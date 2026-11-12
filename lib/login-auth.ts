import { database } from "@/db/postgres";
import { PROFILE_COOKIE } from "@/app/profile-domain";

export const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5;

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

let tablesReady: Promise<void> | null = null;

export function ensureAuthTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await database().query(`CREATE TABLE IF NOT EXISTS auth_accounts (
        email TEXT PRIMARY KEY,
        owner_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      )`);
    })().catch(error => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.normalize("NFKC").trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function setProfileCookie(response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }, anonymousId: string) {
  response.cookies.set(PROFILE_COOKIE, anonymousId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: PROFILE_COOKIE_MAX_AGE,
    path: "/",
  });
}

type PersonalState = { videos?: Array<Record<string, unknown>>; moments?: unknown[]; settings?: Record<string, unknown> } & Record<string, unknown>;

function parseState(value: string | undefined): PersonalState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as PersonalState : null;
  } catch {
    return null;
  }
}

export function mergePersonalStates(account: PersonalState | null, guest: PersonalState | null): PersonalState | null {
  if (!guest) return account;
  if (!account) return guest;
  const videos = [...(account.videos || [])];
  const ids = new Set(videos.map(video => String(video.id ?? "")));
  for (const video of guest.videos || []) {
    const id = String(video.id ?? "");
    if (id && !ids.has(id)) {
      ids.add(id);
      videos.push(video);
    }
  }
  const moments = [...(account.moments || [])];
  const seen = new Set(moments.map(moment => JSON.stringify(moment)));
  for (const moment of guest.moments || []) {
    const key = JSON.stringify(moment);
    if (!seen.has(key)) {
      seen.add(key);
      moments.push(moment);
    }
  }
  return { ...guest, ...account, videos, moments, settings: { ...(guest.settings || {}), ...(account.settings || {}) } };
}

/** Brings any guest data from the current browser profile into the account profile. */
export async function mergeGuestIntoAccount(guestOwner: string, accountOwner: string) {
  if (guestOwner === accountOwner) return;
  const db = database();
  const rows = await db.query(
    "SELECT owner_key, value FROM personal_states WHERE owner_key = ANY($1)",
    [[guestOwner, accountOwner]],
  ) as { owner_key: string; value: string }[];
  const guest = parseState(rows.find(row => row.owner_key === guestOwner)?.value);
  if (!guest || (!(guest.videos || []).length && !(guest.moments || []).length)) return;
  const account = parseState(rows.find(row => row.owner_key === accountOwner)?.value);
  const merged = mergePersonalStates(account, guest);
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO personal_states (owner_key, value, created_at, updated_at) VALUES ($1, $2, $3, $3)
     ON CONFLICT (owner_key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [accountOwner, JSON.stringify(merged), now],
  );
}

export async function accountEmailForOwner(owner: string) {
  try {
    await ensureAuthTables();
    const rows = await database().query("SELECT email FROM auth_accounts WHERE owner_key = $1 LIMIT 1", [owner]) as { email: string }[];
    return rows[0]?.email || null;
  } catch {
    return null;
  }
}


/**
 * Finds or creates the account for a verified email and returns its profile owner key.
 * First sign-in adopts this browser's guest profile, so nothing the visitor saved is lost;
 * later sign-ins from a new device merge that device's guest data into the account.
 */
export async function completeSignIn(email: string, guestOwner: string | null) {
  await ensureAuthTables();
  const db = database();
  const existing = await db.query("SELECT owner_key FROM auth_accounts WHERE email = $1", [email]) as { owner_key: string }[];
  if (existing[0]) {
    await db.query("UPDATE auth_accounts SET last_login_at = now() WHERE email = $1", [email]);
    const owner = existing[0].owner_key;
    if (guestOwner && guestOwner !== owner) {
      const guestIsAccount = (await db.query("SELECT 1 FROM auth_accounts WHERE owner_key = $1", [guestOwner]) as unknown[]).length > 0;
      if (!guestIsAccount) await mergeGuestIntoAccount(guestOwner, owner).catch(() => undefined);
    }
    return owner;
  }
  const guestTaken = guestOwner
    ? (await db.query("SELECT 1 FROM auth_accounts WHERE owner_key = $1", [guestOwner]) as unknown[]).length > 0
    : true;
  const owner = !guestTaken && guestOwner ? guestOwner : `anon:${crypto.randomUUID()}`;
  await db.query(
    "INSERT INTO auth_accounts (email, owner_key, last_login_at) VALUES ($1, $2, now()) ON CONFLICT (email) DO NOTHING",
    [email, owner],
  );
  const stored = await db.query("SELECT owner_key FROM auth_accounts WHERE email = $1", [email]) as { owner_key: string }[];
  return stored[0].owner_key;
}

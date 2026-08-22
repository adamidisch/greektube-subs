import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  automaticUsername,
  profileOwnerKey,
  readAnonymousId,
  usernameKey,
  validAnonymousId,
  validateUsername,
} from "../app/profile-domain.ts";

const anonymousId = "3b62d0de-9895-4ff7-b9d5-19075125c0bb";
assert.equal(validAnonymousId(anonymousId), true);
assert.equal(validAnonymousId("short"), false);
assert.equal(validAnonymousId("unsafe cookie"), false);

const anonymousRequest = new Request("https://greektubesubs.com/api/profile", {
  headers: { cookie: `other=1; greektube-user=${anonymousId}` },
});
assert.equal(readAnonymousId(anonymousRequest), anonymousId);
assert.equal(await profileOwnerKey(anonymousRequest), `anon:${anonymousId}`);
assert.equal(await profileOwnerKey(new Request("https://greektubesubs.com/api/profile")), null);

const authenticatedRequest = new Request("https://greektubesubs.com/api/profile", {
  headers: { "oai-authenticated-user-email": " USER@example.com " },
});
const authenticatedOwner = await profileOwnerKey(authenticatedRequest);
assert.match(authenticatedOwner || "", /^user:[0-9a-f]{64}$/);
assert.equal(authenticatedOwner, await profileOwnerKey(new Request("https://greektubesubs.com/api/profile", {
  headers: { "oai-authenticated-user-email": "user@example.com" },
})));

assert.deepEqual(validateUsername("  Δοκιμή_12  "), {
  ok: true,
  username: "Δοκιμή_12",
  key: "δοκιμή_12",
});
assert.equal(validateUsername("ab").ok, false);
assert.equal(validateUsername("bad name").ok, false);
assert.equal(usernameKey("  SameName  "), "samename");
assert.equal(automaticUsername(294), "User1294");

const migration = await readFile(new URL("../db/migrations/20260822_user_profile_recovery.sql", import.meta.url), "utf8");
const backfill = await readFile(new URL("../db/backfills/20260822_missing_user_profiles.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("../db/backfills/20260822_missing_user_profiles.rollback.sql", import.meta.url), "utf8");
const profileRoute = await readFile(new URL("../app/api/profile/route.ts", import.meta.url), "utf8");

assert.match(migration, /CREATE TABLE IF NOT EXISTS user_profile_backfill_log/);
assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE)\b/i);
assert.match(backfill, /LEFT JOIN user_profiles AS profile USING \(owner_key\)/);
assert.match(backfill, /ON CONFLICT \(owner_key\) DO NOTHING/);
assert.match(backfill, /personal\.owner_key ~ '\^\(anon:/);
assert.doesNotMatch(backfill, /(?:UPDATE|DELETE FROM)\s+personal_states/i);
assert.match(rollback, /profile\.updated_at = log\.updated_at/);
assert.match(profileRoute, /AND username IS NULL AND username_key IS NULL/);
assert.match(profileRoute, /WHERE owner_key = \$4 AND username_key = \$5/);
assert.doesNotMatch(profileRoute, /CREATE TABLE IF NOT EXISTS/);

console.log("profile recovery tests passed");

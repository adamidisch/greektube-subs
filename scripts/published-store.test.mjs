// Run with: npm run test:published-store  (temporary local PostgreSQL, no production credentials)
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPublishedStore, mirrorPaths, PublicationIncomplete, SubtitlesUnavailable } from '../app/api/published-store.ts';
import { sha256 } from '../app/api/published-subtitles-core.ts';

// ---- Isolation guard: refuse anything that could be the live database. ----
const forbidden = Object.keys(process.env).filter(k => /DATABASE|POSTGRES|PGHOST|PGPASSWORD|NEON|GREEKTUBE_DATA_TOKEN|BLOB/u.test(k) && k !== 'TEST_DATABASE_URL');
assert.deepEqual(forbidden, [], `production-like variables present: ${forbidden.join(', ')}`);
const testUrl = new URL(process.env.TEST_DATABASE_URL || 'postgres://missing');
assert.ok(['127.0.0.1', 'localhost'].includes(testUrl.hostname), 'tests only run against a local temporary PostgreSQL');
assert.ok(!/neon/iu.test(testUrl.href));

const client = new pg.Client({ connectionString: testUrl.href });
await client.connect();

// SQL with failure injection by statement prefix.
const fail = { neon: false, insert: false, confirm: false };
const sql = async (text, params = []) => {
  if (fail.neon) throw Error('neon down');
  if (fail.insert && /^\s*INSERT/u.test(text)) throw Error('insert failed');
  if (fail.confirm && /^\s*UPDATE/u.test(text)) throw Error('confirm failed');
  return (await client.query(text, params)).rows;
};
// In-memory GitHub mirror with failure injection.
const files = new Map();
const mfail = { down: false, putMatch: null, writes: 0 };
const mirror = {
  async get(path) { if (mfail.down) throw Error('github down'); return files.has(path) ? files.get(path) : null; },
  async put(path, text) { if (mfail.down || (mfail.putMatch && mfail.putMatch.test(path))) throw Error('github put failed'); mfail.writes++; files.set(path, text); },
};
let clock = 1_000_000;
const store = createPublishedStore({ sql, mirror, now: () => clock });
const later = () => { clock += 11 * 60_000; }; // past every cache
const V = 'xYB6uYyRjCA', N = 12;
const payload = tag => ({ status: 'ready', videoId: V, transcriptVersion: N, cues: [{ start: 0, duration: 2, text: `Γεια ${tag}` }, { start: 2, duration: 2, text: 'σας' }, { start: 4, duration: 2, text: 'όλους' }] });
const english = [{ start: 0, duration: 6, text: 'Hello everyone' }];
const rows = async () => (await client.query('SELECT content_hash, confirmed FROM published_subtitles ORDER BY id')).rows;
const both = async () => { later(); const n = await store.read(V, N, true); fail.neon = true; later(); const m = await store.read(V, N, true); fail.neon = false; later(); return [n, m]; };

// 1. A normal publication: same hash in Neon and in the mirror; the mirror serves it when Neon is down.
const h1 = await store.publish(V, N, payload('v1'), english, 'publish');
let [neon, fallback] = await both();
assert.equal(neon.source, 'neon'); assert.equal(fallback.source, 'mirror');
assert.equal(neon.contentHash, h1); assert.equal(fallback.contentHash, h1);
assert.deepEqual(fallback.payload, neon.payload); assert.deepEqual(fallback.englishCues, english);
assert.equal(sha256(files.get(mirrorPaths(V, N, h1).greek)), JSON.parse(files.get(mirrorPaths(V, N).pointer)).greekHash);

// 2. Every write step can fail; readers stay on the last confirmed version (v1) in both copies, and a retry completes.
for (const [step, inject, clear] of [
  ['neon', () => { fail.insert = true; }, () => { fail.insert = false; }],
  ['mirror', () => { mfail.putMatch = /greek\.json$/u; }, () => { mfail.putMatch = null; }],
  ['confirm', () => { fail.confirm = true; }, () => { fail.confirm = false; }],
  ['pointer', () => { mfail.putMatch = /latest\.json$/u; }, () => { mfail.putMatch = null; }],
]) {
  const next = payload(`after-${step}`);
  const previous = (await store.read(V, N, true)).contentHash;
  inject();
  await assert.rejects(store.publish(V, N, next, english, 'publish'), e => e instanceof PublicationIncomplete && e.step === step);
  clear();
  [neon, fallback] = await both();
  if (step === 'pointer') {
    // Neon already confirmed the new version; the mirror keeps the previous confirmed one until the retry.
    assert.notEqual(neon.contentHash, previous); assert.equal(fallback.contentHash, previous);
  } else {
    assert.equal(neon.contentHash, previous, `${step}: Neon still serves the last confirmed version`);
    assert.equal(fallback.contentHash, previous, `${step}: mirror still serves the last confirmed version`);
  }
  // Retrying the same publication is idempotent and ends with the same hash in both copies.
  const retried = await store.publish(V, N, next, english, 'publish');
  const retriedAgain = await store.publish(V, N, next, english, 'publish');
  assert.equal(retried, retriedAgain);
  [neon, fallback] = await both();
  assert.equal(neon.contentHash, retried); assert.equal(fallback.contentHash, retried);
}
const all = await rows();
assert.equal(new Set(all.map(r => r.content_hash)).size, all.length, 'retries never duplicate a publication');
assert.ok(all.every(r => r.confirmed), 'after the retries every publication is confirmed');

// 3. Neon down: the mirror copy is cached, so a following mirror outage still serves it.
fail.neon = true; later();
const cached = await store.read(V, N, false);
mfail.down = true;
assert.equal((await store.read(V, N, false)).contentHash, cached.contentHash);
// 4. Both down with nothing cached on this instance → "temporarily unavailable".
const fresh = createPublishedStore({ sql, mirror, now: () => clock });
await assert.rejects(fresh.read(V, N, false), SubtitlesUnavailable);
fail.neon = false; mfail.down = false;

// 5. A damaged mirror file is never served.
const live = (await store.read(V, N, true)).contentHash;
files.set(mirrorPaths(V, N, live).greek, files.get(mirrorPaths(V, N, live).greek).replace('Γεια', 'Γειά'));
fail.neon = true; later();
await assert.rejects(createPublishedStore({ sql, mirror, now: () => clock }).read(V, N, false), SubtitlesUnavailable);
fail.neon = false;
// syncMirror repairs it from Neon and reports the same hash in both copies.
const synced = await store.syncMirror(V, N);
assert.equal(synced.neon, live); assert.equal(synced.mirror, live);

// 6. A video that was never published reads as null (legacy path), not as an outage.
assert.equal(await store.read('NDeaXZ5KpM4', N, false), null);
fail.neon = true; later();
assert.equal(await createPublishedStore({ sql, mirror, now: () => clock }).read('NDeaXZ5KpM4', N, false), null);
fail.neon = false;

// 7. Rows written before the mirror existed (7.26.0) stay confirmed after the migration.
await client.query('DROP TABLE published_subtitles');
await client.query(`CREATE TABLE published_subtitles (id BIGSERIAL PRIMARY KEY, video_id TEXT NOT NULL, transcript_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL, greek_hash TEXT NOT NULL, english_hash TEXT NOT NULL, greek_body TEXT NOT NULL, english_body TEXT NOT NULL,
  origin TEXT NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (video_id, transcript_version, content_hash))`);
const old = JSON.stringify(payload('old')), oldEn = JSON.stringify(english);
const oldHash = sha256(`${sha256(old)}:${sha256(oldEn)}`);
await client.query(`INSERT INTO published_subtitles (video_id, transcript_version, content_hash, greek_hash, english_hash, greek_body, english_body, origin)
  VALUES ($1,$2,$3,$4,$5,$6,$7,'restore')`, [V, N, oldHash, sha256(old), sha256(oldEn), old, oldEn]);
const migrated = createPublishedStore({ sql, mirror, now: () => clock });
assert.equal((await migrated.read(V, N, false)).contentHash, oldHash);
const s2 = await migrated.syncMirror(V, N);
assert.equal(s2.neon, oldHash); assert.equal(s2.mirror, oldHash);

await client.end();
console.log(`published-store: ok (${mfail.writes} mirror writes)`);

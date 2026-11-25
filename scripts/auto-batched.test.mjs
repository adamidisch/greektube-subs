// Run with: npm run test:auto-batched  (temporary local PostgreSQL, no production credentials, fake AI provider)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { createRunStore } from '../app/api/auto-subtitles/run-store.ts';
import { runStep, startRun } from '../app/api/auto-subtitles/drive.ts';
import { referenceWords, REFERENCE_RULES, BATCH_BUDGET_REPAIR_PROMPT, BATCH_REVIEW_PROMPT, BATCH_REVIEW_REPAIR_PROMPT, BATCH_TRANSLATE_PROMPT, BRIEF_PROMPT, RUN_LIMITS } from '../app/api/auto-subtitles/batched.ts';
import { WordAuthoringProviderError } from '../app/api/captions/word-authoring-provider.ts';

// References: pronoun-like English words are handed to the model, and the rules reach the translate and review prompts.
assert.deepEqual(referenceWords("and iodine is there's no microbe that is resistant to them"), ['them']);
assert.deepEqual(referenceWords('the joy of both vitamin C and iodine'), ['both']);
assert.deepEqual(referenceWords('This is central'), ['this']);
assert.deepEqual(referenceWords('we eat meat and fish'), []);
assert.ok(BATCH_TRANSLATE_PROMPT.includes(REFERENCE_RULES) && /ambiguous_reference/u.test(BATCH_REVIEW_PROMPT) && /refs/u.test(BATCH_BUDGET_REPAIR_PROMPT));

const forbidden = Object.keys(process.env).filter(k => /DATABASE|POSTGRES|PGHOST|PGPASSWORD|NEON|FOUNDATION|DEEPSEEK|GREEKTUBE_DATA_TOKEN|BLOB/u.test(k) && k !== 'TEST_DATABASE_URL');
assert.deepEqual(forbidden, [], `production-like variables present: ${forbidden.join(', ')}`);
const testUrl = new URL(process.env.TEST_DATABASE_URL || 'postgres://missing');
assert.ok(['127.0.0.1', 'localhost'].includes(testUrl.hostname), 'only a local temporary PostgreSQL');
const client = new pg.Client({ connectionString: testUrl.href });
await client.connect();
const sql = async (text, params = []) => (await client.query(text, params)).rows;
const store = createRunStore(sql);

const full = JSON.parse(fs.readFileSync(new URL('../public/previews/xYB6uYyRjCA-words.json', import.meta.url), 'utf8'));
const short = { ...full, videoId: 'AAAAAAAAAAA', events: full.events.filter(e => e[0] < 120_000) };

// ---- fake provider + clock ----
let clock = Date.parse('2026-11-25T10:00:00Z');
const now = () => clock;
function greek(slot) {
  // Short Greek text that keeps the slot's numbers (digit tokens of one number are rejoined).
  const digits = slot.english.match(/\d+(?: \d+)*/gu)?.map(n => n.replace(/ /gu, ',')).join(' ');
  return digits ? `λέξη ${digits}` : 'λόγια';
}
function greekItem(item) {
  const texts = item.slots.map(greek);
  // Approved glossary rendering for thyroid terms, placed where it fits.
  if (item.slots.some(slot => /thyroid/iu.test(slot.english))) {
    const roomy = item.slots.map((slot, i) => [slot.maxChars - texts[i].length, i]).sort((a, b) => b[0] - a[0])[0][1];
    texts[roomy] = `${texts[roomy]} υποθυρεοειδισμός`;
  }
  return texts;
}
function makeProvider(options = {}) {
  const calls = { total: 0, by: {}, translatedIds: [] };
  const reviewed = new Set();
  const fn = async (system, input) => {
    calls.total++; clock += options.callMs ?? 20_000;
    const label = system === BRIEF_PROMPT ? 'brief' : system === BATCH_TRANSLATE_PROMPT ? 'translate' : system === BATCH_BUDGET_REPAIR_PROMPT ? 'repair'
      : system === BATCH_REVIEW_PROMPT ? 'review' : system === BATCH_REVIEW_REPAIR_PROMPT ? 'review-repair' : 'other';
    calls.by[label] = (calls.by[label] ?? 0) + 1;
    if (options.failFirst === label && calls.by[label] === 1) throw new WordAuthoringProviderError(502, 30);
    if (label === 'brief') return { mainTopic: 'Η Sarah Myhill για την κόπωση', glossary: [] };
    if (label === 'translate') calls.translatedIds.push(...input.items.map(i => i.id));
    if (label === 'translate') return { items: input.items.map(item => ({ id: item.id, texts: options.overBudget ? item.slots.map(slot => 'α'.repeat(slot.hardChars + 10)) : greekItem(item) })) };
    if (label === 'repair' && options.stubbornRepair && calls.by.repair <= (options.stubbornRounds ?? 1)) return { items: input.items.map(item => ({ id: item.id, texts: item.slots.map(slot => 'α'.repeat(slot.hardChars + 8)) })) };
    if (label === 'repair' || label === 'review-repair') return { items: input.items.map(item => ({ id: item.id, texts: greekItem(item) })) };
    if (label === 'review') return { items: input.items.map(item => {
      const firstTime = options.findings && !reviewed.has(item.id); reviewed.add(item.id);
      const first = item.finalEvents[0];
      return { id: item.id, status: firstTime ? 'manual_review_required' : 'approved', candidateHash: item.candidateHash, reviewedEventIds: item.finalEvents.map(e => e.eventId),
        findings: firstTime ? [{ eventIds: [first.eventId], sourceWordIds: [first.sourceWordIds.split('–')[0]], category: 'omission', severity: 'major',
          sourceExcerpt: first.english, greekExcerpt: first.text, explanation: 'Λείπει μια λέξη.', suggestedRepair: 'Πρόσθεσέ την.' }] : [] };
    }) };
    throw Error(`unexpected prompt ${label}`);
  };
  return { fn, calls };
}
const published = [];
const deps = provider => ({ store, call: provider.fn, now, stepMs: 270_000, publish: async (state, built) => { published.push({ state, built }); return true; } });
async function drive(d, runId) {
  let result, steps = 0;
  do { result = await runStep(d, runId); steps++; clock += 5_000; } while (result.continue && steps < 50);
  return { ...result, steps };
}
const dbState = async runId => JSON.parse((await sql('SELECT state FROM auto_subtitle_runs WHERE run_id = $1', [runId]))[0].state);

// A. Whole Sarah video: the estimate is made once, the write cap stops the run with its final save, calls stay ≤ 30.
let readyA;
{
  const p = makeProvider(), d = deps(p);
  const state = await startRun(d, 'xYB6uYyRjCA', 'full', full);
  const estimate = structuredClone(state.estimate);
  assert.ok(estimate.batches > 8 && !estimate.fitsLimits, 'Sarah needs more than one capped run, and the estimate says so up front');
  assert.ok(estimate.coverageWithinLimits > 0 && estimate.coverageWithinLimits < 100);
  const result = await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.equal(saved.status, 'budget_exhausted'); assert.match(saved.stopReason, /εγγραφών/u);
  assert.equal(saved.usage.writes, RUN_LIMITS.full.writes, 'all 10 writes used, the last one for the final save');
  assert.ok(saved.usage.calls <= RUN_LIMITS.full.calls && p.calls.total === saved.usage.calls, 'every provider call is counted');
  assert.deepEqual(saved.estimate, estimate, 'the estimate is not recomputed during the run');
  readyA = saved.scopes.filter(s => s.status === 'ready').length;
  const doneA = saved.scopes.filter(s => s.status !== 'pending').length;
  assert.ok(readyA > 40 && doneA <= 8 * 10, 'eight batches of at most ten scopes, saved once per batch');
  assert.ok(saved.remaining.length > 0 && saved.remaining.every(r => r.issue));
  assert.equal(result.state.status, 'budget_exhausted');
  const usage = Object.fromEntries((await sql('SELECT metric, used FROM usage_budget')).map(r => [r.metric, Number(r.used)]));
  assert.equal(usage.ai_calls, saved.usage.calls, 'monthly counters are updated inside the run saves');

  // D. Continuing reuses the brief and every finished scope: no new brief call, ready scopes are never re-translated.
  const before = { ...p.calls.by };
  const next = await startRun(d, 'xYB6uYyRjCA', 'full');
  assert.equal(next.scopes.filter(s => s.status === 'ready').length, readyA);
  await runStep(d, next.runId);
  assert.equal(p.calls.by.brief, before.brief, 'brief reused');
  const continued = await dbState(next.runId);
  assert.equal(continued.scopes.filter(s => s.status === 'ready').length >= readyA, true);
  assert.equal(continued.usage.log[0].label, 'translate');
}

// B. Expensive batches (every text over budget, every review with findings): the call cap stops the run before call 31.
{
  await sql('DELETE FROM usage_budget');
  const p = makeProvider({ overBudget: true, findings: true }), d = deps(p);
  const state = await startRun(d, 'BBBBBBBBBBB', 'full', { ...full, videoId: 'BBBBBBBBBBB' });
  await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.equal(saved.status, 'budget_exhausted'); assert.match(saved.stopReason, /κλήσεων/u);
  assert.equal(p.calls.total, saved.usage.calls);
  assert.ok(saved.usage.calls <= 30, `${saved.usage.calls} calls`);
  assert.ok(saved.usage.writes <= 10);
  assert.ok(saved.scopes.some(s => s.status === 'ready') && saved.remaining.length);
}

// C. Retries are counted and checked against the remaining budget (sample cap: 6 calls).
{
  await sql('DELETE FROM usage_budget');
  const p = makeProvider({ failFirst: 'translate' }), d = deps(p);
  const state = await startRun(d, 'AAAAAAAAAAA', 'sample', short);
  await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.equal(saved.usage.retries, 1); assert.equal(saved.usage.failedCalls, 1);
  assert.equal(saved.usage.calls, p.calls.total, 'the failed call and its retry both count');
  assert.ok(p.calls.total <= RUN_LIMITS.sample.calls);
}
{
  const p = makeProvider({ failFirst: 'translate', findings: true }), d = deps(p);
  const state = await startRun(d, 'CCCCCCCCCCC', 'sample', { ...short, videoId: 'CCCCCCCCCCC' });
  await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.ok(p.calls.total <= RUN_LIMITS.sample.calls, 'a call beyond the sample cap is refused before it is made');
  assert.equal(saved.usage.calls, p.calls.total, 'the failed call and its retry both count');
  assert.ok(saved.usage.writes <= RUN_LIMITS.sample.writes);
  assert.ok(saved.measurement, 'the measurement is saved even when the cap stops the sample');
}

// E. Step time: a batch that cannot fit is saved and continued in the next step, without repeating paid translations.
{
  const p = makeProvider({ callMs: 60_000 }), d = { ...deps(p), stepMs: 200_000 };
  const state = await startRun(d, 'DDDDDDDDDDD', 'full', { ...full, videoId: 'DDDDDDDDDDD' });
  const first = await runStep(d, state.runId);
  assert.equal(first.continue, true);
  const saved = await dbState(state.runId);
  assert.ok(saved.scopes.some(s => s.texts && s.status === 'pending'), 'paid translations are saved when time runs out');
  const translated = p.calls.by.translate;
  clock += 5_000; await runStep(d, state.runId);
  const after = await dbState(state.runId);
  const carried = saved.scopes.filter(s => s.texts && s.status === 'pending').map(s => s.id);
  assert.ok(carried.every(id => after.scopes.find(s => s.id === id).status !== 'pending'), 'the saved texts are finished in the next step');
  const translatedOnce = p.calls.translatedIds.filter(id => carried.includes(id));
  assert.equal(translatedOnce.length, carried.length, 'carried scopes were translated exactly once (no paid work repeated)');
  assert.ok(p.calls.by.translate >= translated);
}

// F. Sample: ≤ 6 calls, ≤ 3 writes, measurement ready, never published.
{
  await sql('DELETE FROM usage_budget');
  published.length = 0;
  const p = makeProvider(), d = deps(p);
  const state = await startRun(d, 'EEEEEEEEEEE', 'sample', { ...short, videoId: 'EEEEEEEEEEE' });
  assert.ok(state.estimate.fitsLimits, 'a 2-minute sample fits its caps');
  await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.equal(saved.status, 'complete');
  assert.ok(saved.usage.calls <= 6 && saved.usage.writes <= 3);
  assert.equal(saved.measurement.calls, saved.usage.calls);
  assert.ok(saved.measurement.events > 0 && saved.measurement.readable !== undefined);
  assert.equal(published.length, 0, 'a sample is never published');
}

// G2. The model cannot count characters: a second, freshly measured repair round fixes what the first left over.
{
  await sql('DELETE FROM usage_budget');
  const p = makeProvider({ overBudget: true, stubbornRepair: true }), d = deps(p);
  const state = await startRun(d, 'FFFFFFFFFFF', 'full', { ...short, videoId: 'FFFFFFFFFFF' });
  await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.equal(p.calls.by.repair, 2, 'two measured repair rounds');
  assert.ok(saved.scopes.every(s => s.status === 'ready'), 'the second round fixed every scope');
  // Sample (6 calls): both measured repair rounds fit, and the review call stays reserved.
  const q = makeProvider({ overBudget: true, stubbornRepair: true }), e = deps(q);
  const sample = await startRun(e, 'GGGGGGGGGGG', 'sample', { ...short, videoId: 'GGGGGGGGGGG' });
  await drive(e, sample.runId);
  const sampled = await dbState(sample.runId);
  assert.ok(q.calls.total <= RUN_LIMITS.sample.calls);
  assert.equal(q.calls.by.repair, 2, 'the sample now has room for both measured repair rounds');
  assert.ok(sampled.scopes.every(s => s.status === 'ready'), 'the second round fixed every scope within the sample cap');
}

// H. A short full run completes and hands a verified auto_checked track to the publisher.
{
  published.length = 0;
  const p = makeProvider(), d = deps(p);
  const state = await startRun(d, 'FFFFFFFFFFF', 'full', { ...short, videoId: 'FFFFFFFFFFF' });
  await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.equal(saved.status, 'published', saved.stopReason || saved.lastError);
  assert.equal(published.length, 1);
  assert.equal(published[0].built.reviewed.approvalLevel, 'auto_checked');
  assert.ok(saved.usage.writes <= 10 && saved.usage.calls <= 30);
}

// I. Self-healing: scopes that stay over budget after both measured rounds get another pass inside the same run and the video publishes without anyone checking flagged parts.
{
  await sql('DELETE FROM usage_budget');
  published.length = 0;
  const p = makeProvider({ overBudget: true, stubbornRepair: true, stubbornRounds: 2 }), d = deps(p);
  const state = await startRun(d, 'HHHHHHHHHHH', 'full', { ...short, videoId: 'HHHHHHHHHHH' });
  await drive(d, state.runId);
  const saved = await dbState(state.runId);
  assert.equal(saved.status, 'published', saved.stopReason || saved.lastError);
  assert.equal(saved.heals, 1, 'one healing pass was enough');
  assert.ok(saved.scopes.every(s => s.status === 'ready'));
  assert.ok(saved.usage.calls <= 30 && saved.usage.writes <= 10 && p.calls.total === saved.usage.calls);
  assert.equal(published.length, 1);
  // A sample never heals: its measurement must show the real first-pass result.
  const q = makeProvider({ overBudget: true, stubbornRepair: true, stubbornRounds: 5 }), e = deps(q);
  const sample = await startRun(e, 'JJJJJJJJJJJ', 'sample', { ...short, videoId: 'JJJJJJJJJJJ' });
  await drive(e, sample.runId);
  assert.equal((await dbState(sample.runId)).heals ?? 0, 0);
}

// G. Monthly budgets: at 50% of a provider limit no new automatic run starts.
{
  await sql("INSERT INTO usage_budget (period, metric, used) VALUES ($1, 'ai_calls', 500) ON CONFLICT (period, metric) DO UPDATE SET used = 500", [new Date().toISOString().slice(0, 7)]);
  await assert.rejects(startRun(deps(makeProvider()), 'GGGGGGGGGGG', 'sample', { ...short, videoId: 'GGGGGGGGGGG' }), /50%/u);
}

await client.end();
console.log('auto-batched: ok');

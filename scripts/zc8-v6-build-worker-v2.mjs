import { get, put } from "@vercel/blob";

const VIDEO_ID = "zc8Nh4TMB1s";
const RESULT_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/result.json";
const CHECKPOINT_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/build-checkpoint-speakerfix-2.json";
const WORKER_REVISION = "zc8-v6-speakerfix-2";
const PUBLIC_REVISION = "zc8-v6";
const DURATION = 7885;
const SOURCE_URLS = [
  "https://r.jina.ai/http://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
  "https://r.jina.ai/https://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
];
const TRANSLATION_MODEL = "openai/gpt-oss-120b";
const AUDIT_MODEL = "openai/gpt-oss-20b";
const BATCH_SIZE = 20;
const MIN_INTERVAL_MS = 17_000;
const SRT = { sha256: "632e7db92bc6157c0df6e81491a3aca0d34d8104e9d81bc9759bdb3d171a77cf", cueCount: 2504, endSeconds: 7880.719 };

if (!(process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "review/zc8-subtitle-v6")) {
  console.log("[zc8-v6-v2] preview worker skipped");
  process.exit(0);
}
if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing");
if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)) throw new Error("Blob not configured");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastCall = new Map();
const clean = value => String(value || "").replace(/\s+/g, " ").trim();

async function readJson(path) {
  try {
    const blob = await get(path, { access: "public" });
    return blob?.stream ? await new Response(blob.stream).json() : null;
  } catch { return null; }
}
async function writeJson(path, value) {
  await put(path, JSON.stringify(value), { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json; charset=utf-8" });
}
function parseJson(text) {
  const value = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = value.indexOf("{");
  const b = value.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("model-output-not-json");
  return JSON.parse(value.slice(a, b + 1));
}
function retryMs(response, body) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000) + 1000;
  const text = clean(body);
  const ms = text.match(/try again in\s+([\d.]+)ms/i); if (ms) return Math.ceil(Number(ms[1])) + 1500;
  const sec = text.match(/try again in\s+([\d.]+)s/i); if (sec) return Math.ceil(Number(sec[1]) * 1000) + 1500;
  const min = text.match(/try again in\s+([\d.]+)m/i); if (min) return Math.ceil(Number(min[1]) * 60000) + 1500;
  return 22000;
}
async function throttle(model) {
  const wait = MIN_INTERVAL_MS - (Date.now() - (lastCall.get(model) || 0));
  if (wait > 0) await sleep(wait);
  lastCall.set(model, Date.now());
}
async function groqJson(model, system, user, maxTokens) {
  let structured = true;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await throttle(model);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 48000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: maxTokens,
          ...(structured ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: structured ? system : `${system} Return ONLY one valid JSON object, with no markdown or prose outside it.` },
            { role: "user", content: JSON.stringify(user) },
          ],
        }),
      });
      const raw = await response.text();
      if (response.status === 429) {
        const wait = retryMs(response, raw);
        console.log(`[zc8-v6-v2] ${model} 429 wait=${Math.ceil(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (response.status === 400 && /failed to (?:validate|generate) json|json_validate_failed/i.test(raw) && structured) {
        structured = false;
        console.log(`[zc8-v6-v2] ${model} switching to plain JSON mode`);
        await sleep(2500);
        continue;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < 12) { await sleep(Math.min(30000, attempt * 3000)); continue; }
        throw new Error(`${model}-${response.status}:${raw.slice(0, 260)}`);
      }
      const payload = JSON.parse(raw);
      return parseJson(payload.choices?.[0]?.message?.content || "");
    } catch (error) {
      if (attempt >= 12) throw error;
      console.log(`[zc8-v6-v2] ${model} retry=${attempt} ${error instanceof Error ? error.message : error}`);
      await sleep(Math.min(30000, attempt * 3000));
    } finally { clearTimeout(timeout); }
  }
  throw new Error(`${model}-retry-exhausted`);
}

function seconds(value) {
  const p = value.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}
function stripDirections(text) {
  return clean(text).replace(/\[(?:music|laughter|snorts?|clears throat|sighs?(?: and gasps)?|gasps?|applause)\]/giu, " ").replace(/\s+/g, " ").trim();
}
async function fetchSource() {
  const errors = [];
  for (const url of SOURCE_URLS) {
    try {
      const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 GreekTubeSubs v6" } });
      if (!r.ok) throw new Error(`http-${r.status}`);
      const text = await r.text();
      if (text.length < 100000 || !/^\s*\d+\.\s+\d{1,2}:\d{2}(?::\d{2})?\s+/m.test(text)) throw new Error(`invalid:${text.length}`);
      return { text, url };
    } catch (e) { errors.push(`${url}:${e instanceof Error ? e.message : e}`); }
  }
  throw new Error(`source-fetch:${errors.join("|")}`);
}
function parseSource(markdown) {
  const matches = [...markdown.matchAll(/^\s*(\d+)\.\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/gm)];
  if (matches.length < 500) throw new Error(`source-rows:${matches.length}`);
  const rows = matches.map(m => ({ row: Number(m[1]), start: seconds(m[2]), text: clean(m[3]) })).filter(x => stripDirections(x.text));
  const pieces = [];
  let speaker = "speaker-a";
  let boundaries = 0;
  let estimated = 0;
  rows.forEach((row, i) => {
    const start = row.start;
    const end = Math.max(start + 0.5, i + 1 < rows.length ? rows[i + 1].start : DURATION);
    const leading = /^\s*>>/.test(row.text);
    const markers = (row.text.match(/>>/g) || []).length;
    const parts = row.text.split(/\s*>>\s*/g).map(stripDirections).filter(Boolean);
    if (!parts.length) return;
    if (leading) { speaker = speaker === "speaker-a" ? "speaker-b" : "speaker-a"; boundaries += 1; }
    const weights = parts.map(x => Math.max(1, x.replace(/\s/g, "").length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = start;
    parts.forEach((text, partIndex) => {
      if (partIndex > 0) { speaker = speaker === "speaker-a" ? "speaker-b" : "speaker-a"; boundaries += 1; estimated += 1; }
      const pieceEnd = partIndex === parts.length - 1 ? end : Math.min(end, cursor + Math.max(0.55, (end - start) * weights[partIndex] / total));
      pieces.push({ id: `r${row.row}.${partIndex + 1}`, start: Number(cursor.toFixed(3)), end: Number(pieceEnd.toFixed(3)), text, speaker, confidence: partIndex > 0 ? "medium" : "high" });
      cursor = pieceEnd;
    });
    if (markers !== (leading ? 1 : 0) + Math.max(0, parts.length - 1)) throw new Error(`marker-accounting:${row.row}`);
  });
  return { pieces, rowCount: rows.length, boundaries, estimated };
}
function terminal(text) { return /[.!?][”'"]?$/u.test(clean(text)); }
function blocksFrom(pieces) {
  const blocks = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const first = current[0], last = current[current.length - 1];
    const english = clean(current.map(x => x.text).join(" "));
    if (english) blocks.push({ index: blocks.length, sourceIds: current.map(x => x.id), start: first.start, duration: Number(Math.max(0.65, last.end - first.start).toFixed(3)), english, speaker: first.speaker, speakerConfidence: current.some(x => x.confidence === "medium") ? "medium" : "high" });
    current = [];
  };
  for (const piece of pieces) {
    if (current.length && current[0].speaker !== piece.speaker) flush();
    current.push(piece);
    const duration = piece.end - current[0].start;
    const chars = current.reduce((sum, x) => sum + x.text.length, 0);
    if ((terminal(piece.text) && duration >= 1.8) || duration >= 6.3 || chars >= 100) flush();
  }
  flush();
  return blocks;
}
function verifyCoverage(pieces, blocks) {
  const expected = new Set(pieces.map(x => x.id));
  const counts = new Map();
  for (const id of blocks.flatMap(x => x.sourceIds)) counts.set(id, (counts.get(id) || 0) + 1);
  const bad = [...expected].filter(id => counts.get(id) !== 1);
  const extra = [...counts.keys()].filter(id => !expected.has(id));
  if (bad.length || extra.length) throw new Error(`structural-coverage bad=${bad.length} extra=${extra.length}`);
}
function nums(text) {
  return (text.match(/\b\d+(?:[.,]\d+)*(?:s\b)?/gi) || []).map(t => (/s$/i.test(t) ? t.slice(0, -1) : t).replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".")).sort();
}
function numbersMatch(a, b) { const x = nums(a), y = nums(b); return x.length === y.length && x.every((v, i) => v === y[i]); }
function polish(text) { return clean(text).replace(/,\s+(και|ή)\b/giu, " $1").replace(/\s+/g, " ").trim(); }

const TRANSLATE = `Translate the requested ONE-SPEAKER English subtitle blocks into professional natural modern Greek. Preserve 100% of meaning: no omissions, summaries, invented facts, changed attribution, negation, certainty, causality, chronology, numbers, units, names or medical meaning. Use Plain Medical Greek: medically correct but easy for a general audience, avoiding needless medical jargon. Remove only meaningless fillers. Never merge rows or speakers. Do not put a comma immediately before «και» or «ή». Keep wording concise for subtitles without deleting meaning. JSON only: {"translations":[{"index":N,"text":"..."}]}. Every requested index exactly once.`;
const AUDIT = `Audit English-to-Greek subtitle rows. Flag ANY omission, added information, altered attribution/negation/certainty/causality/number/unit/name/medical meaning, unnecessarily difficult Greek, unnatural Greek, or comma immediately before και/ή. Faithful natural rewording is fine. JSON only: {"issues":[{"index":N,"reason":"specific short reason"}]}.`;

async function translate(batch, repair = null) {
  const requested = batch.map(b => repair?.has(b.index) ? { index: b.index, english: b.english, previousGreek: repair.get(b.index).greek, auditIssue: repair.get(b.index).reason } : { index: b.index, english: b.english, speaker: b.speaker, start: b.start, duration: b.duration });
  const value = await groqJson(TRANSLATION_MODEL, repair ? `${TRANSLATE} Correct the supplied audit failure while retaining all source meaning.` : TRANSLATE, { requested }, repair ? 3200 : 4200);
  const rows = Array.isArray(value.translations) ? value.translations : [];
  const map = new Map();
  for (const row of rows) { const i = Number(row?.index), text = polish(row?.text); if (Number.isInteger(i) && text && !map.has(i)) map.set(i, text); }
  if (map.size !== batch.length) throw new Error(`translation-count:${map.size}/${batch.length}`);
  return batch.map(b => ({ index: b.index, text: map.get(b.index) }));
}
async function audit(batch, translations) {
  const translated = new Map(translations.map(x => [x.index, x.text]));
  const value = await groqJson(AUDIT_MODEL, AUDIT, { rows: batch.map(b => ({ index: b.index, english: b.english, greek: translated.get(b.index) || "" })) }, 2200);
  return (Array.isArray(value.issues) ? value.issues : []).flatMap(x => Number.isInteger(Number(x?.index)) ? [{ index: Number(x.index), reason: clean(x.reason) || "semantic-audit" }] : []);
}

async function main() {
  const source = await fetchSource();
  const parsed = parseSource(source.text);
  const blocks = blocksFrom(parsed.pieces);
  verifyCoverage(parsed.pieces, blocks);
  console.log(`[zc8-v6-v2] rows=${parsed.rowCount} pieces=${parsed.pieces.length} blocks=${blocks.length} speakerBoundaries=${parsed.boundaries}`);
  if (blocks.length < 600) throw new Error(`too-few-blocks:${blocks.length}`);

  const saved = await readJson(CHECKPOINT_PATH);
  const cp = saved?.revision === WORKER_REVISION && saved?.blockCount === blocks.length ? saved : { revision: WORKER_REVISION, videoId: VIDEO_ID, blockCount: blocks.length, cursor: 0, translations: [], auditIssueCount: 0, repairedIssueCount: 0, createdAt: new Date().toISOString() };
  const translatedMap = new Map((cp.translations || []).map(x => [x.index, x]));
  let cursor = Math.max(0, Math.min(Number(cp.cursor) || 0, blocks.length));

  while (cursor < blocks.length) {
    const batch = blocks.slice(cursor, Math.min(blocks.length, cursor + BATCH_SIZE));
    let tr = await translate(batch);
    const deterministic = batch.flatMap(b => {
      const g = tr.find(x => x.index === b.index)?.text || "";
      const issues = [];
      if (!numbersMatch(b.english, g)) issues.push({ index: b.index, reason: "numeric mismatch" });
      if (/,\s+(?:και|ή)\b/iu.test(g)) issues.push({ index: b.index, reason: "comma before και/ή" });
      return issues;
    });
    const semantic = await audit(batch, tr);
    const issueMap = new Map([...deterministic, ...semantic].map(x => [x.index, x]));
    const issues = [...issueMap.values()];
    if (issues.length) {
      const currentGreek = new Map(tr.map(x => [x.index, x.text]));
      const repairMap = new Map(issues.map(x => [x.index, { reason: x.reason, greek: currentGreek.get(x.index) || "" }]));
      const issueBlocks = batch.filter(b => repairMap.has(b.index));
      const repairedRows = await translate(issueBlocks, repairMap);
      const repairedMap = new Map(repairedRows.map(x => [x.index, x.text]));
      tr = tr.map(x => repairedMap.has(x.index) ? { ...x, text: repairedMap.get(x.index) } : x);
      const det2 = batch.flatMap(b => {
        const g = tr.find(x => x.index === b.index)?.text || "";
        return [...(!numbersMatch(b.english, g) ? [{ index: b.index, reason: "numeric mismatch after repair" }] : []), ...( /,\s+(?:και|ή)\b/iu.test(g) ? [{ index: b.index, reason: "comma after repair" }] : [])];
      });
      const sem2 = await audit(batch, tr);
      if (det2.length || sem2.length) throw new Error(`unresolved-audit:${JSON.stringify([...det2, ...sem2].slice(0, 10))}`);
      cp.auditIssueCount += issues.length;
      cp.repairedIssueCount += issues.length;
    }
    tr.forEach(x => translatedMap.set(x.index, x));
    cursor += batch.length;
    cp.cursor = cursor;
    cp.translations = [...translatedMap.values()].sort((a, b) => a.index - b.index);
    cp.updatedAt = new Date().toISOString();
    await writeJson(CHECKPOINT_PATH, cp);
    console.log(`[zc8-v6-v2] ${cursor}/${blocks.length} ${(100 * cursor / blocks.length).toFixed(1)}% issues=${cp.auditIssueCount}`);
  }

  if (translatedMap.size !== blocks.length) throw new Error(`translation-coverage:${translatedMap.size}/${blocks.length}`);
  const cues = blocks.map(b => ({ start: b.start, duration: b.duration, text: polish(translatedMap.get(b.index)?.text), speaker: b.speaker, speakerConfidence: b.speakerConfidence, sourceIds: b.sourceIds, estimatedBoundary: b.speakerConfidence === "medium" }));
  let previousEnd = -1, maxCps = 0, longWarnings = 0;
  const speeds = [];
  for (const cue of cues) {
    if (!cue.text) throw new Error("empty-final-cue");
    if (cue.start + 0.02 < previousEnd) throw new Error(`overlap:${cue.start}`);
    previousEnd = cue.start + cue.duration;
    const cps = cue.text.replace(/\s/g, "").length / Math.max(0.65, cue.duration);
    speeds.push(cps); maxCps = Math.max(maxCps, cps);
    if (cue.text.length > 96) longWarnings += 1;
    if (cps > 20) throw new Error(`reading-speed:${cps.toFixed(1)}@${cue.start}`);
    if (/,\s+(?:και|ή)\b/iu.test(cue.text)) throw new Error(`comma-before-conjunction@${cue.start}`);
  }
  const sorted = [...speeds].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95))] || 0;
  const result = {
    revision: PUBLIC_REVISION, status: "ready", videoId: VIDEO_ID, cues,
    quality: {
      runtimeSpeakerPieceCoveragePercent: 100, sourcePieceCount: parsed.pieces.length, semanticBlockCount: blocks.length, displayCueCount: cues.length,
      semanticAuditIssueCount: cp.auditIssueCount, semanticAuditRepairedCount: cp.repairedIssueCount, unresolvedSemanticAuditIssues: 0,
      speakerCrossovers: 0, detectedSpeakerBoundaryCount: parsed.boundaries, estimatedIntraRowSpeakerBoundaryCount: parsed.estimated,
      exactAudioDiarization: false, maxCharsPerSecond: Number(maxCps.toFixed(1)), p95CharsPerSecond: Number(p95.toFixed(1)), over20CharsPerSecond: 0,
      longDisplayWarningCount: longWarnings, commaBeforeKaiOrI: 0, plainMedicalGreek: true, sourceMeaningOmissionAllowed: false,
    },
    source: {
      userSrtReference: true, userSrtSha256: SRT.sha256, userSrtCueCount: SRT.cueCount, userSrtEndSeconds: SRT.endSeconds,
      runtimeSpeakerTranscript: "podspun-detailed-transcript", runtimeSourceUrl: source.url, timedChunkCount: parsed.rowCount, runtimeSpeakerPieceCount: parsed.pieces.length,
      exactAudioDiarization: false,
      note: "100% structural/semantic review coverage refers to the speaker-marked runtime transcript used for v6 segmentation. The uploaded SRT remains the canonical timing reference; no false byte-level SRT semantic mapping is claimed.",
    }, generatedAt: new Date().toISOString(),
  };
  await writeJson(RESULT_PATH, result);
  await writeJson(CHECKPOINT_PATH, { ...cp, status: "ready", updatedAt: new Date().toISOString() });
  console.log(`[zc8-v6-v2] READY cues=${cues.length} maxCps=${result.quality.maxCharsPerSecond} p95=${result.quality.p95CharsPerSecond}`);
}

await main();

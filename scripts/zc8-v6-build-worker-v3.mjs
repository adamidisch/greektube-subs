import { get, put } from "@vercel/blob";

const VIDEO_ID = "zc8Nh4TMB1s";
const PUBLIC_REVISION = "zc8-v6";
const WORKER_REVISION = "zc8-v6-phase-worker-3";
const RESULT_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/result.json";
const CHECKPOINT_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/build-checkpoint-phase-worker-3.json";
const DURATION = 7885;
const SOURCE_URLS = [
  "https://r.jina.ai/http://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
  "https://r.jina.ai/https://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
];
const MODEL = "openai/gpt-oss-120b";
const TRANSLATE_BATCH = 24;
const AUDIT_BATCH = 34;
const REPAIR_BATCH = 18;
const MAX_MODEL_CALLS_PER_BUILD = 25;
const MIN_CALL_INTERVAL_MS = 22_000;
const SRT = {
  sha256: "632e7db92bc6157c0df6e81491a3aca0d34d8104e9d81bc9759bdb3d171a77cf",
  cueCount: 2504,
  endSeconds: 7880.719,
};

if (!(process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "review/zc8-subtitle-v6")) {
  console.log("[zc8-v6-v3] preview worker skipped");
  process.exit(0);
}
if (!process.env.GROQ_API_KEY) throw new Error("[zc8-v6-v3] GROQ_API_KEY missing");
if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)) {
  throw new Error("[zc8-v6-v3] Blob not configured");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value || "").replace(/\s+/g, " ").trim();
let modelCalls = 0;
let lastCallAt = 0;

async function readJson(pathname) {
  try {
    const blob = await get(pathname, { access: "public" });
    return blob?.stream ? await new Response(blob.stream).json() : null;
  } catch {
    return null;
  }
}

async function writeJson(pathname, value) {
  await put(pathname, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json; charset=utf-8",
  });
}

function parseRetryMs(response, body) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000) + 1200;
  const text = clean(body);
  const ms = text.match(/try again in\s+([\d.]+)ms/i);
  if (ms) return Math.ceil(Number(ms[1])) + 1500;
  const sec = text.match(/try again in\s+([\d.]+)s/i);
  if (sec) return Math.ceil(Number(sec[1]) * 1000) + 1500;
  const min = text.match(/try again in\s+([\d.]+)m/i);
  if (min) return Math.ceil(Number(min[1]) * 60_000) + 1500;
  return 24_000;
}

function parseJsonObject(value) {
  const raw = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("model-output-not-json");
  return JSON.parse(raw.slice(first, last + 1));
}

async function throttle() {
  const wait = MIN_CALL_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

async function groqJson(system, user, maxTokens) {
  if (modelCalls >= MAX_MODEL_CALLS_PER_BUILD) return { exhausted: true, value: null };

  for (let attempt = 1; attempt <= 7; attempt += 1) {
    if (modelCalls >= MAX_MODEL_CALLS_PER_BUILD) return { exhausted: true, value: null };
    await throttle();
    modelCalls += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(user) },
          ],
        }),
      });
      const raw = await response.text();
      if (response.status === 429) {
        const wait = parseRetryMs(response, raw);
        console.log(`[zc8-v6-v3] 429 attempt=${attempt} wait=${Math.ceil(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!response.ok) {
        console.log(`[zc8-v6-v3] model http=${response.status} attempt=${attempt}`);
        if (response.status >= 500 && attempt < 7) {
          await sleep(Math.min(30_000, attempt * 3500));
          continue;
        }
        throw new Error(`model-http-${response.status}:${raw.slice(0, 220)}`);
      }
      const payload = JSON.parse(raw);
      try {
        return { exhausted: false, value: parseJsonObject(payload.choices?.[0]?.message?.content || "") };
      } catch (error) {
        console.log(`[zc8-v6-v3] invalid-json attempt=${attempt}: ${error instanceof Error ? error.message : error}`);
        if (attempt < 7) continue;
        throw error;
      }
    } catch (error) {
      if (attempt >= 7) throw error;
      console.log(`[zc8-v6-v3] retry attempt=${attempt}: ${error instanceof Error ? error.message : error}`);
      await sleep(Math.min(30_000, attempt * 3500));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("model-retry-exhausted");
}

function seconds(value) {
  const p = value.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

function stripDirections(text) {
  return clean(text)
    .replace(/\[(?:music|laughter|snorts?|clears throat|sighs?(?: and gasps)?|gasps?|applause)\]/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSource() {
  const failures = [];
  for (const url of SOURCE_URLS) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 GreekTubeSubs v6 review" },
      });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const text = await response.text();
      if (text.length < 100_000 || !/^\s*\d+\.\s+\d{1,2}:\d{2}(?::\d{2})?\s+/m.test(text)) {
        throw new Error(`invalid-body:${text.length}`);
      }
      return { text, url };
    } catch (error) {
      failures.push(`${url}:${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`source-fetch-failed:${failures.join("|")}`);
}

function parseSource(markdown) {
  const matches = [...markdown.matchAll(/^\s*(\d+)\.\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/gm)];
  if (matches.length < 500) throw new Error(`source-too-short:${matches.length}`);
  const rows = matches
    .map(match => ({ row: Number(match[1]), start: seconds(match[2]), text: clean(match[3]) }))
    .filter(row => stripDirections(row.text));

  const pieces = [];
  let speaker = "speaker-a";
  let boundaryCount = 0;
  let estimatedBoundaryCount = 0;

  rows.forEach((row, index) => {
    const start = row.start;
    const end = Math.max(start + 0.5, index + 1 < rows.length ? rows[index + 1].start : DURATION);
    const leadingMarker = /^\s*>>/.test(row.text);
    const markerCount = (row.text.match(/>>/g) || []).length;
    const parts = row.text.split(/\s*>>\s*/g).map(stripDirections).filter(Boolean);
    if (!parts.length) return;

    if (leadingMarker) {
      speaker = speaker === "speaker-a" ? "speaker-b" : "speaker-a";
      boundaryCount += 1;
    }

    const weights = parts.map(part => Math.max(1, part.replace(/\s/g, "").length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = start;

    parts.forEach((text, partIndex) => {
      if (partIndex > 0) {
        speaker = speaker === "speaker-a" ? "speaker-b" : "speaker-a";
        boundaryCount += 1;
        estimatedBoundaryCount += 1;
      }
      const endAt = partIndex === parts.length - 1
        ? end
        : Math.min(end, cursor + Math.max(0.55, (end - start) * weights[partIndex] / totalWeight));
      pieces.push({
        id: `r${row.row}.${partIndex + 1}`,
        start: Number(cursor.toFixed(3)),
        end: Number(endAt.toFixed(3)),
        text,
        speaker,
        confidence: partIndex > 0 ? "medium" : "high",
      });
      cursor = endAt;
    });

    const expected = markerCount;
    const accounted = (leadingMarker ? 1 : 0) + Math.max(0, parts.length - 1);
    if (expected !== accounted) throw new Error(`speaker-marker-accounting:${row.row}:${expected}/${accounted}`);
  });

  return { pieces, rowCount: rows.length, boundaryCount, estimatedBoundaryCount };
}

function terminal(text) {
  return /[.!?][”'"]?$/u.test(clean(text));
}

function buildBlocks(pieces) {
  const blocks = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const first = current[0];
    const last = current[current.length - 1];
    const english = clean(current.map(piece => piece.text).join(" "));
    if (english) {
      blocks.push({
        index: blocks.length,
        sourceIds: current.map(piece => piece.id),
        start: first.start,
        duration: Number(Math.max(0.65, last.end - first.start).toFixed(3)),
        english,
        speaker: first.speaker,
        speakerConfidence: current.some(piece => piece.confidence === "medium") ? "medium" : "high",
      });
    }
    current = [];
  };

  for (const piece of pieces) {
    if (current.length && current[0].speaker !== piece.speaker) flush();
    current.push(piece);
    const duration = piece.end - current[0].start;
    const chars = current.reduce((sum, item) => sum + item.text.length, 0);
    if ((terminal(piece.text) && duration >= 1.8) || duration >= 6.3 || chars >= 100) flush();
  }
  flush();
  return blocks;
}

function verifyStructuralCoverage(pieces, blocks) {
  const expected = new Set(pieces.map(piece => piece.id));
  const counts = new Map();
  for (const id of blocks.flatMap(block => block.sourceIds)) counts.set(id, (counts.get(id) || 0) + 1);
  const missingOrDuplicate = [...expected].filter(id => counts.get(id) !== 1);
  const extra = [...counts.keys()].filter(id => !expected.has(id));
  if (missingOrDuplicate.length || extra.length) {
    throw new Error(`structural-coverage-failed:${missingOrDuplicate.length}:${extra.length}`);
  }
}

function numberTokens(text) {
  return (text.match(/\b\d+(?:[.,]\d+)*(?:s\b)?/gi) || [])
    .map(token => (/s$/i.test(token) ? token.slice(0, -1) : token)
      .replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "")
      .replace(",", "."))
    .sort();
}

function numbersMatch(source, target) {
  const left = numberTokens(source);
  const right = numberTokens(target);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function polishGreek(text) {
  return clean(text).replace(/,\s+(και|ή)\b/giu, " $1").replace(/\s+/g, " ").trim();
}

const TRANSLATION_SYSTEM = `You are a senior English-to-Greek audiovisual translator for a premium medical interview player. Translate each requested ONE-SPEAKER block into natural, precise, easy modern Greek. Preserve 100% of source meaning: do not summarize, omit, invent, soften, strengthen or move facts. Preserve negation, uncertainty, attribution, causality, chronology, numbers, percentages, units, names and medical meaning. Use Plain Medical Greek: medically correct but understandable to a general audience; prefer familiar precise wording over unnecessary medical jargon. Remove only meaningless spoken fillers. Never merge rows or speakers. Do not put a comma immediately before «και» or «ή». Keep wording concise enough for subtitles without deleting meaning. Return JSON only: {"translations":[{"index":N,"text":"..."}]}. Return every requested index exactly once and no other indexes.`;

const AUDIT_SYSTEM = `You are a strict bilingual subtitle quality auditor. Compare each English source row with its Greek translation. Mark an index BAD if any source meaning is missing, invented, attributed to the wrong person, made more or less certain, negated incorrectly, causality or chronology changes, a number/unit/name changes, medical meaning is wrong, Greek is unnecessarily technical for a general audience, or Greek is clearly unnatural. Faithful natural rewording is GOOD. Return JSON only in this compact form: {"bad":[N,N,...]}. If every row is faithful and natural return {"bad":[]}. Do not include explanations.`;

const REPAIR_SYSTEM = `Correct only the supplied English-to-Greek subtitle rows that failed quality audit. Preserve every source fact, qualifier, attribution, number, unit and medical meaning. Use natural Plain Medical Greek understandable to a general audience. Remove only meaningless fillers. Do not put a comma immediately before «και» or «ή». Return JSON only: {"translations":[{"index":N,"text":"..."}]}. Return every supplied index exactly once.`;

async function translateBatch(blocks) {
  const result = await groqJson(TRANSLATION_SYSTEM, {
    requested: blocks.map(block => ({
      index: block.index,
      speaker: block.speaker,
      start: block.start,
      duration: block.duration,
      english: block.english,
    })),
  }, 4300);
  if (result.exhausted) return null;
  const rows = Array.isArray(result.value?.translations) ? result.value.translations : [];
  const map = new Map();
  for (const row of rows) {
    const index = Number(row?.index);
    const text = polishGreek(row?.text);
    if (Number.isInteger(index) && text && !map.has(index)) map.set(index, text);
  }
  if (map.size !== blocks.length) throw new Error(`translation-count:${map.size}/${blocks.length}`);
  return blocks.map(block => ({ index: block.index, text: map.get(block.index) }));
}

async function auditBatch(blocks, translationsByIndex) {
  const result = await groqJson(AUDIT_SYSTEM, {
    rows: blocks.map(block => ({
      index: block.index,
      english: block.english,
      greek: translationsByIndex.get(block.index) || "",
    })),
  }, 1300);
  if (result.exhausted) return null;
  const valid = new Set(blocks.map(block => block.index));
  const bad = Array.isArray(result.value?.bad) ? result.value.bad : [];
  return [...new Set(bad.map(Number).filter(index => Number.isInteger(index) && valid.has(index)))];
}

async function repairBatch(blocks, translationsByIndex) {
  const result = await groqJson(REPAIR_SYSTEM, {
    requested: blocks.map(block => ({
      index: block.index,
      english: block.english,
      previousGreek: translationsByIndex.get(block.index) || "",
    })),
  }, 3600);
  if (result.exhausted) return null;
  const rows = Array.isArray(result.value?.translations) ? result.value.translations : [];
  const map = new Map();
  for (const row of rows) {
    const index = Number(row?.index);
    const text = polishGreek(row?.text);
    if (Number.isInteger(index) && text && !map.has(index)) map.set(index, text);
  }
  if (map.size !== blocks.length) throw new Error(`repair-count:${map.size}/${blocks.length}`);
  return blocks.map(block => ({ index: block.index, text: map.get(block.index) }));
}

function freshCheckpoint(blocks) {
  return {
    revision: WORKER_REVISION,
    videoId: VIDEO_ID,
    blockCount: blocks.length,
    phase: "translate",
    translateCursor: 0,
    auditCursor: 0,
    repairCursor: 0,
    translations: [],
    issueIndexes: [],
    auditIssueCount: 0,
    repairedIssueCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function persistCheckpoint(checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  await writeJson(CHECKPOINT_PATH, checkpoint);
}

function translationMap(checkpoint) {
  return new Map((checkpoint.translations || []).map(row => [row.index, row.text]));
}

function setTranslations(checkpoint, map) {
  checkpoint.translations = [...map.entries()]
    .map(([index, text]) => ({ index, text }))
    .sort((a, b) => a.index - b.index);
}

function deterministicIssues(blocks, translationsByIndex) {
  const issues = new Set();
  for (const block of blocks) {
    const greek = translationsByIndex.get(block.index) || "";
    if (!greek) issues.add(block.index);
    if (!numbersMatch(block.english, greek)) issues.add(block.index);
    if (/,\s+(?:και|ή)\b/iu.test(greek)) issues.add(block.index);
  }
  return issues;
}

async function finalize(checkpoint, blocks, parsed, sourceUrl) {
  const map = translationMap(checkpoint);
  if (map.size !== blocks.length) throw new Error(`final-translation-coverage:${map.size}/${blocks.length}`);
  const deterministic = deterministicIssues(blocks, map);
  if (deterministic.size) throw new Error(`final-deterministic-issues:${deterministic.size}`);
  if ((checkpoint.issueIndexes || []).length) throw new Error(`final-unresolved-audit:${checkpoint.issueIndexes.length}`);

  const cues = blocks.map(block => ({
    start: block.start,
    duration: block.duration,
    text: polishGreek(map.get(block.index)),
    speaker: block.speaker,
    speakerConfidence: block.speakerConfidence,
    sourceIds: block.sourceIds,
    estimatedBoundary: block.speakerConfidence === "medium",
  }));

  let previousEnd = -1;
  const cpsValues = [];
  let over20 = 0;
  let longDisplayWarnings = 0;
  for (const cue of cues) {
    if (cue.start + 0.02 < previousEnd) throw new Error(`final-overlap:${cue.start}:${previousEnd}`);
    previousEnd = cue.start + cue.duration;
    const cps = cue.text.replace(/\s/g, "").length / Math.max(0.65, cue.duration);
    cpsValues.push(cps);
    if (cps > 20) over20 += 1;
    if (cue.text.length > 96) longDisplayWarnings += 1;
  }
  if (over20) throw new Error(`reading-speed-hard-fail:${over20}`);

  const sorted = [...cpsValues].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95))] || 0;
  const max = sorted[sorted.length - 1] || 0;
  const result = {
    revision: PUBLIC_REVISION,
    status: "ready",
    videoId: VIDEO_ID,
    cues,
    quality: {
      runtimeSpeakerPieceCoveragePercent: 100,
      sourcePieceCount: parsed.pieces.length,
      semanticBlockCount: blocks.length,
      displayCueCount: cues.length,
      semanticAuditIssueCount: checkpoint.auditIssueCount,
      semanticAuditRepairedCount: checkpoint.repairedIssueCount,
      unresolvedSemanticAuditIssues: 0,
      speakerCrossovers: 0,
      detectedSpeakerBoundaryCount: parsed.boundaryCount,
      estimatedIntraRowSpeakerBoundaryCount: parsed.estimatedBoundaryCount,
      exactAudioDiarization: false,
      maxCharsPerSecond: Number(max.toFixed(1)),
      p95CharsPerSecond: Number(p95.toFixed(1)),
      over20CharsPerSecond: 0,
      longDisplayWarningCount: longDisplayWarnings,
      commaBeforeKaiOrI: 0,
      plainMedicalGreek: true,
      sourceMeaningOmissionAllowed: false,
    },
    source: {
      userSrtReference: true,
      userSrtSha256: SRT.sha256,
      userSrtCueCount: SRT.cueCount,
      userSrtEndSeconds: SRT.endSeconds,
      runtimeSpeakerTranscript: "podspun-detailed-transcript",
      runtimeSourceUrl: sourceUrl,
      timedChunkCount: parsed.rowCount,
      runtimeSpeakerPieceCount: parsed.pieces.length,
      exactAudioDiarization: false,
      note: "The uploaded SRT remains the canonical timing/source reference. Speaker-aware display segmentation is calibrated against the speaker-marked runtime transcript; intra-row speaker boundaries are estimated and are not presented as audio-diarization precision.",
    },
    generatedAt: new Date().toISOString(),
  };
  await writeJson(RESULT_PATH, result);
  checkpoint.phase = "ready";
  checkpoint.lastError = null;
  await persistCheckpoint(checkpoint);
  console.log(`[zc8-v6-v3] READY cues=${cues.length} maxCps=${result.quality.maxCharsPerSecond} p95=${result.quality.p95CharsPerSecond}`);
}

async function run() {
  const source = await fetchSource();
  const parsed = parseSource(source.text);
  const blocks = buildBlocks(parsed.pieces);
  verifyStructuralCoverage(parsed.pieces, blocks);
  if (blocks.length < 600) throw new Error(`too-few-blocks:${blocks.length}`);
  console.log(`[zc8-v6-v3] rows=${parsed.rowCount} pieces=${parsed.pieces.length} blocks=${blocks.length} speakerBoundaries=${parsed.boundaryCount}`);

  const saved = await readJson(CHECKPOINT_PATH);
  const checkpoint = saved?.revision === WORKER_REVISION && saved?.blockCount === blocks.length
    ? saved
    : freshCheckpoint(blocks);
  const map = translationMap(checkpoint);

  if (checkpoint.phase === "ready") {
    console.log("[zc8-v6-v3] already ready");
    return;
  }

  while (modelCalls < MAX_MODEL_CALLS_PER_BUILD) {
    if (checkpoint.phase === "translate") {
      if (checkpoint.translateCursor >= blocks.length) {
        checkpoint.phase = "audit";
        checkpoint.auditCursor = 0;
        checkpoint.lastError = null;
        await persistCheckpoint(checkpoint);
        continue;
      }
      const batch = blocks.slice(checkpoint.translateCursor, checkpoint.translateCursor + TRANSLATE_BATCH);
      const translated = await translateBatch(batch);
      if (!translated) break;
      for (const row of translated) map.set(row.index, row.text);
      checkpoint.translateCursor += batch.length;
      setTranslations(checkpoint, map);
      checkpoint.lastError = null;
      await persistCheckpoint(checkpoint);
      console.log(`[zc8-v6-v3] translate ${checkpoint.translateCursor}/${blocks.length} calls=${modelCalls}`);
      continue;
    }

    if (checkpoint.phase === "audit") {
      if (checkpoint.auditCursor >= blocks.length) {
        checkpoint.phase = (checkpoint.issueIndexes || []).length ? "repair" : "finalize";
        checkpoint.repairCursor = 0;
        checkpoint.lastError = null;
        await persistCheckpoint(checkpoint);
        continue;
      }
      const batch = blocks.slice(checkpoint.auditCursor, checkpoint.auditCursor + AUDIT_BATCH);
      const semanticBad = await auditBatch(batch, map);
      if (!semanticBad) break;
      const deterministic = deterministicIssues(batch, map);
      const merged = new Set(checkpoint.issueIndexes || []);
      for (const index of semanticBad) merged.add(index);
      for (const index of deterministic) merged.add(index);
      checkpoint.issueIndexes = [...merged].sort((a, b) => a - b);
      checkpoint.auditIssueCount = checkpoint.issueIndexes.length;
      checkpoint.auditCursor += batch.length;
      checkpoint.lastError = null;
      await persistCheckpoint(checkpoint);
      console.log(`[zc8-v6-v3] audit ${checkpoint.auditCursor}/${blocks.length} issues=${checkpoint.issueIndexes.length} calls=${modelCalls}`);
      continue;
    }

    if (checkpoint.phase === "repair") {
      const issues = checkpoint.issueIndexes || [];
      if (!issues.length) {
        checkpoint.phase = "finalize";
        await persistCheckpoint(checkpoint);
        continue;
      }
      const repairIndexes = issues.slice(0, REPAIR_BATCH);
      const repairBlocks = repairIndexes.map(index => blocks[index]).filter(Boolean);
      const repaired = await repairBatch(repairBlocks, map);
      if (!repaired) break;
      for (const row of repaired) map.set(row.index, row.text);
      setTranslations(checkpoint, map);

      const semanticBad = await auditBatch(repairBlocks, map);
      if (!semanticBad) break;
      const deterministic = deterministicIssues(repairBlocks, map);
      const remainingInBatch = new Set([...semanticBad, ...deterministic]);
      const nextIssues = issues.filter(index => !repairIndexes.includes(index) || remainingInBatch.has(index));
      const repairedCount = repairIndexes.length - remainingInBatch.size;
      checkpoint.repairedIssueCount += Math.max(0, repairedCount);
      checkpoint.issueIndexes = [...new Set(nextIssues)].sort((a, b) => a - b);
      checkpoint.lastError = null;
      await persistCheckpoint(checkpoint);
      console.log(`[zc8-v6-v3] repair attempted=${repairIndexes.length} fixed=${repairedCount} remaining=${checkpoint.issueIndexes.length} calls=${modelCalls}`);
      if (remainingInBatch.size === repairIndexes.length) {
        checkpoint.lastError = `repair-no-progress:${[...remainingInBatch].slice(0, 10).join(",")}`;
        await persistCheckpoint(checkpoint);
        break;
      }
      continue;
    }

    if (checkpoint.phase === "finalize") {
      await finalize(checkpoint, blocks, parsed, source.url);
      return;
    }

    throw new Error(`unknown-phase:${checkpoint.phase}`);
  }

  await persistCheckpoint(checkpoint);
  console.log(`[zc8-v6-v3] checkpoint phase=${checkpoint.phase} translate=${checkpoint.translateCursor}/${blocks.length} audit=${checkpoint.auditCursor}/${blocks.length} issues=${(checkpoint.issueIndexes || []).length} modelCalls=${modelCalls}`);
}

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[zc8-v6-v3] paused safely: ${message}`);
  const checkpoint = await readJson(CHECKPOINT_PATH);
  if (checkpoint?.revision === WORKER_REVISION) {
    checkpoint.lastError = message;
    checkpoint.updatedAt = new Date().toISOString();
    await writeJson(CHECKPOINT_PATH, checkpoint).catch(() => {});
  }
  process.exit(0);
}

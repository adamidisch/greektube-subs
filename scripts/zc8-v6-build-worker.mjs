import { get, put } from "@vercel/blob";

const VIDEO_ID = "zc8Nh4TMB1s";
const REVISION = "zc8-v6-speakerfix-1";
const RESULT_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/result.json";
const CHECKPOINT_PATH = "subtitle-reviews/zc8Nh4TMB1s/v6/build-checkpoint-speakerfix-1.json";
const DURATION = 7885;
const SOURCE_URLS = [
  "https://r.jina.ai/http://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
  "https://r.jina.ai/https://podspun.com/%40TheDiaryOfACEO/episode/zc8Nh4TMB1s",
];
const TRANSLATION_MODEL = "openai/gpt-oss-120b";
const AUDIT_MODEL = "openai/gpt-oss-20b";
const BATCH_SIZE = 32;
const MIN_MODEL_INTERVAL_MS = 16_000;
const USER_SRT_SHA256 = "632e7db92bc6157c0df6e81491a3aca0d34d8104e9d81bc9759bdb3d171a77cf";
const USER_SRT_CUE_COUNT = 2504;
const USER_SRT_END_SECONDS = 7880.719;

const shouldRun = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "review/zc8-subtitle-v6";
if (!shouldRun) {
  console.log(`[zc8-v6-worker] skipped env=${process.env.VERCEL_ENV || "local"} ref=${process.env.VERCEL_GIT_COMMIT_REF || "none"}`);
  process.exit(0);
}
if (!process.env.GROQ_API_KEY) throw new Error("[zc8-v6-worker] GROQ_API_KEY missing");
if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)) {
  throw new Error("[zc8-v6-worker] Vercel Blob is not configured");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const lastModelCall = new Map();

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function readJson(pathname) {
  try {
    const blob = await get(pathname, { access: "public" });
    if (!blob?.stream) return null;
    return await new Response(blob.stream).json();
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

function parseRetryAfter(response, body) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000);
  const text = normalize(body);
  const ms = text.match(/try again in\s+([\d.]+)ms/i);
  if (ms) return Math.ceil(Number(ms[1]) + 1200);
  const sec = text.match(/try again in\s+([\d.]+)s/i);
  if (sec) return Math.ceil(Number(sec[1]) * 1000 + 1200);
  const min = text.match(/try again in\s+([\d.]+)m/i);
  if (min) return Math.ceil(Number(min[1]) * 60_000 + 1200);
  return 20_000;
}

async function throttle(model) {
  const previous = lastModelCall.get(model) || 0;
  const wait = MIN_MODEL_INTERVAL_MS - (Date.now() - previous);
  if (wait > 0) await sleep(wait);
  lastModelCall.set(model, Date.now());
}

function extractJson(content) {
  const cleaned = normalize(content).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("model-output-not-json");
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function groqJson(model, system, user, maxTokens = 4200) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    await throttle(model);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model,
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
        const wait = parseRetryAfter(response, raw);
        console.log(`[zc8-v6-worker] ${model} 429 attempt=${attempt} wait=${Math.ceil(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < 10) {
          await sleep(Math.min(30_000, 3000 * attempt));
          continue;
        }
        throw new Error(`${model}-http-${response.status}:${raw.slice(0, 240)}`);
      }
      const payload = JSON.parse(raw);
      return extractJson(payload.choices?.[0]?.message?.content || "");
    } catch (error) {
      if (attempt >= 10) throw error;
      console.log(`[zc8-v6-worker] ${model} retry ${attempt}: ${error instanceof Error ? error.message : error}`);
      await sleep(Math.min(30_000, 3000 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${model}-retry-exhausted`);
}

function toSeconds(value) {
  const parts = value.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function cleanStageDirections(text) {
  return normalize(text).replace(/\[(?:music|laughter|snorts?|clears throat|sighs?(?: and gasps)?|gasps?|applause)\]/giu, " ").replace(/\s+/g, " ").trim();
}

async function fetchSpeakerTranscript() {
  const failures = [];
  for (const url of SOURCE_URLS) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 GreekTubeSubs v6 review" }, cache: "no-store" });
      if (!response.ok) throw new Error(`http-${response.status}`);
      const text = await response.text();
      if (text.length < 100_000 || !/^\s*\d+\.\s+\d{1,2}:\d{2}(?::\d{2})?\s+/m.test(text)) throw new Error(`invalid-body:${text.length}`);
      return { text, url };
    } catch (error) {
      failures.push(`${url}:${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`speaker-transcript-fetch-failed:${failures.join("|")}`);
}

function parseSpeakerTranscript(markdown) {
  const matches = [...markdown.matchAll(/^\s*(\d+)\.\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/gm)];
  if (matches.length < 500) throw new Error(`speaker-transcript-too-short:${matches.length}`);
  const chunks = matches.map(match => ({ sourceRow: Number(match[1]), start: toSeconds(match[2]), text: normalize(match[3]) }))
    .filter(row => cleanStageDirections(row.text));
  const pieces = [];
  let speaker = "speaker-a";
  let boundaryCount = 0;
  let estimatedBoundaryCount = 0;

  chunks.forEach((chunk, index) => {
    const rowStart = chunk.start;
    const rowEnd = Math.max(rowStart + 0.5, index + 1 < chunks.length ? chunks[index + 1].start : DURATION);
    const raw = chunk.text;
    const leadingMarker = /^\s*>>/.test(raw);
    const markerCount = (raw.match(/>>/g) || []).length;
    const parts = raw.split(/\s*>>\s*/g).map(cleanStageDirections).filter(Boolean);
    if (!parts.length) return;

    if (leadingMarker) {
      speaker = speaker === "speaker-a" ? "speaker-b" : "speaker-a";
      boundaryCount += 1;
    }
    const weights = parts.map(part => Math.max(1, part.replace(/\s/g, "").length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = rowStart;

    parts.forEach((part, partIndex) => {
      if (partIndex > 0) {
        speaker = speaker === "speaker-a" ? "speaker-b" : "speaker-a";
        boundaryCount += 1;
        estimatedBoundaryCount += 1;
      }
      const fraction = weights[partIndex] / totalWeight;
      const end = partIndex === parts.length - 1 ? rowEnd : Math.min(rowEnd, cursor + Math.max(0.55, (rowEnd - rowStart) * fraction));
      pieces.push({
        id: `r${chunk.sourceRow}.${partIndex + 1}`,
        start: Number(cursor.toFixed(3)),
        end: Number(end.toFixed(3)),
        text: part,
        speaker,
        boundaryConfidence: partIndex > 0 ? "medium" : leadingMarker && partIndex === 0 ? "high" : "none",
      });
      cursor = end;
    });

    const expectedToggles = markerCount;
    const actualToggles = (leadingMarker ? 1 : 0) + Math.max(0, parts.length - 1);
    if (expectedToggles !== actualToggles) throw new Error(`speaker-marker-accounting:${chunk.sourceRow}:${expectedToggles}/${actualToggles}`);
  });

  return { pieces, timedChunkCount: chunks.length, speakerBoundaryCount: boundaryCount, estimatedBoundaryCount };
}

function terminal(text) {
  return /[.!?][”'"]?$/u.test(normalize(text));
}

function buildBlocks(pieces) {
  const blocks = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const first = current[0];
    const last = current[current.length - 1];
    const english = normalize(current.map(piece => piece.text).join(" "));
    if (english) blocks.push({
      index: blocks.length,
      sourceIds: current.map(piece => piece.id),
      start: first.start,
      duration: Number(Math.max(0.65, last.end - first.start).toFixed(3)),
      english,
      speaker: first.speaker,
      speakerConfidence: current.some(piece => piece.boundaryConfidence === "medium") ? "medium" : "high",
    });
    current = [];
  };

  for (const piece of pieces) {
    if (current.length && current[0].speaker !== piece.speaker) flush();
    current.push(piece);
    const chars = current.reduce((sum, item) => sum + item.text.length, 0);
    const duration = piece.end - current[0].start;
    if ((terminal(piece.text) && duration >= 2.0) || duration >= 6.8 || chars >= 112) flush();
  }
  flush();
  return blocks;
}

function verifyPieceCoverage(pieces, blocks) {
  const expected = new Set(pieces.map(piece => piece.id));
  const seen = new Map();
  blocks.flatMap(block => block.sourceIds).forEach(id => seen.set(id, (seen.get(id) || 0) + 1));
  const missing = [...expected].filter(id => !seen.has(id));
  const duplicate = [...seen].filter(([, count]) => count !== 1).map(([id]) => id);
  const extra = [...seen.keys()].filter(id => !expected.has(id));
  if (missing.length || duplicate.length || extra.length) {
    throw new Error(`source-piece-coverage-failed missing=${missing.length} duplicate=${duplicate.length} extra=${extra.length}`);
  }
}

function canonicalNumberTokens(text) {
  const matches = text.match(/\b\d+(?:[.,]\d+)*(?:s\b)?/gi) || [];
  return matches.map(token => {
    const numeric = /s$/i.test(token) ? token.slice(0, -1) : token;
    return numeric.replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  }).sort();
}

function numericIntegrity(source, target) {
  const left = canonicalNumberTokens(source);
  const right = canonicalNumberTokens(target);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function greekPolish(text) {
  return normalize(text).replace(/,\s+(και|ή)\b/giu, " $1").replace(/\s+/g, " ").trim();
}

const TRANSLATION_SYSTEM = `You are a senior English-to-Greek audiovisual translator for a premium medical interview player. Translate every requested block into natural, precise, easy modern Greek. HARD RULES: preserve 100% of source meaning. Never summarize, compress away, omit, invent, soften, strengthen or move facts. Preserve negation, uncertainty, attribution, chronology, causality, numbers, percentages, units, names and technical meaning. Use Plain Medical Greek: medically correct but understandable to a general audience; prefer familiar precise wording over unnecessary medical jargon. Remove only nonsemantic speech fillers. Each row contains ONE speaker only; never merge content between rows. Do not put a comma immediately before «και» or «ή». Keep the Greek concise enough for subtitles without deleting meaning. Return JSON only: {"translations":[{"index":N,"text":"..."}]}. Return every requested index exactly once.`;

async function translateBlocks(blocks) {
  const value = await groqJson(TRANSLATION_MODEL, TRANSLATION_SYSTEM, {
    requested: blocks.map(block => ({ index: block.index, speaker: block.speaker, start: block.start, duration: block.duration, english: block.english })),
  }, 4700);
  const rows = Array.isArray(value.translations) ? value.translations : [];
  const map = new Map();
  for (const row of rows) {
    const index = Number(row?.index);
    const text = greekPolish(row?.text);
    if (Number.isInteger(index) && text && !map.has(index)) map.set(index, text);
  }
  if (map.size !== blocks.length) throw new Error(`translation-count:${map.size}/${blocks.length}`);
  return blocks.map(block => ({ index: block.index, text: map.get(block.index) }));
}

const AUDIT_SYSTEM = `Audit each Greek subtitle translation against its English source. Flag a row for ANY missing semantic information, invented information, changed negation, uncertainty, attribution, causality, chronology, number/unit/name, medically wrong wording, unnecessarily difficult medical Greek, or comma immediately before και/ή. Also flag wording that is not natural understandable Greek. Do not flag faithful natural rephrasing. Return JSON only: {"issues":[{"index":N,"reason":"short specific reason"}]}.`;

async function auditBlocks(blocks, translations) {
  const map = new Map(translations.map(row => [row.index, row.text]));
  const value = await groqJson(AUDIT_MODEL, AUDIT_SYSTEM, {
    rows: blocks.map(block => ({ index: block.index, english: block.english, greek: map.get(block.index) || "" })),
  }, 2800);
  const issues = Array.isArray(value.issues) ? value.issues : [];
  return issues.flatMap(issue => Number.isInteger(Number(issue?.index)) ? [{ index: Number(issue.index), reason: normalize(issue.reason) || "semantic-audit" }] : []);
}

async function repairIssues(blocks, translations, issues) {
  if (!issues.length) return translations;
  const blockMap = new Map(blocks.map(block => [block.index, block]));
  const translationMap = new Map(translations.map(row => [row.index, row.text]));
  const requested = issues.map(issue => ({
    index: issue.index,
    english: blockMap.get(issue.index)?.english || "",
    previousGreek: translationMap.get(issue.index) || "",
    auditIssue: issue.reason,
  }));
  const value = await groqJson(TRANSLATION_MODEL, `${TRANSLATION_SYSTEM}\nThe supplied rows failed audit. Correct the stated issue while preserving every source fact.`, { requested }, 3800);
  const repaired = Array.isArray(value.translations) ? value.translations : [];
  for (const row of repaired) {
    const index = Number(row?.index);
    const text = greekPolish(row?.text);
    if (Number.isInteger(index) && text) translationMap.set(index, text);
  }
  return translations.map(row => ({ index: row.index, text: translationMap.get(row.index) || row.text }));
}

function checkpointValid(value, blocks) {
  return value?.revision === REVISION && value?.videoId === VIDEO_ID && Array.isArray(value.translations) && value.blockCount === blocks.length;
}

async function main() {
  console.log("[zc8-v6-worker] starting speaker-fixed v6 build worker");
  const fetched = await fetchSpeakerTranscript();
  const parsed = parseSpeakerTranscript(fetched.text);
  const blocks = buildBlocks(parsed.pieces);
  verifyPieceCoverage(parsed.pieces, blocks);
  if (blocks.length < 500) throw new Error(`too-few-blocks:${blocks.length}`);
  console.log(`[zc8-v6-worker] source rows=${parsed.timedChunkCount} pieces=${parsed.pieces.length} blocks=${blocks.length} speakerBoundaries=${parsed.speakerBoundaryCount}`);

  const old = await readJson(CHECKPOINT_PATH);
  const checkpoint = checkpointValid(old, blocks) ? old : {
    revision: REVISION,
    videoId: VIDEO_ID,
    blockCount: blocks.length,
    cursor: 0,
    translations: [],
    auditIssueCount: 0,
    repairedIssueCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const translatedMap = new Map(checkpoint.translations.map(row => [row.index, row]));
  let cursor = Math.max(0, Math.min(Number(checkpoint.cursor) || 0, blocks.length));

  while (cursor < blocks.length) {
    const batch = blocks.slice(cursor, Math.min(blocks.length, cursor + BATCH_SIZE));
    let translated = await translateBlocks(batch);

    const deterministicIssues = batch.flatMap(block => {
      const greek = translated.find(row => row.index === block.index)?.text || "";
      const issues = [];
      if (!numericIntegrity(block.english, greek)) issues.push({ index: block.index, reason: "numeric tokens do not match source" });
      if (/,\s+(?:και|ή)\b/iu.test(greek)) issues.push({ index: block.index, reason: "comma before και/ή" });
      return issues;
    });
    const semanticIssues = await auditBlocks(batch, translated);
    const issueMap = new Map();
    [...deterministicIssues, ...semanticIssues].forEach(issue => issueMap.set(issue.index, issue));
    const issues = [...issueMap.values()];

    if (issues.length) {
      translated = await repairIssues(batch, translated, issues);
      const recheck = [];
      for (const block of batch) {
        const greek = translated.find(row => row.index === block.index)?.text || "";
        if (!numericIntegrity(block.english, greek)) recheck.push({ index: block.index, reason: "numeric-integrity-after-repair" });
        if (/,\s+(?:και|ή)\b/iu.test(greek)) recheck.push({ index: block.index, reason: "comma-before-conjunction-after-repair" });
      }
      const repairedAudit = await auditBlocks(batch, translated);
      const remaining = [...recheck, ...repairedAudit];
      if (remaining.length) throw new Error(`unresolved-audit:${JSON.stringify(remaining.slice(0, 8))}`);
      checkpoint.auditIssueCount += issues.length;
      checkpoint.repairedIssueCount += issues.length;
    }

    translated.forEach(row => translatedMap.set(row.index, row));
    cursor += batch.length;
    checkpoint.cursor = cursor;
    checkpoint.translations = [...translatedMap.values()].sort((a, b) => a.index - b.index);
    checkpoint.updatedAt = new Date().toISOString();
    await writeJson(CHECKPOINT_PATH, checkpoint);
    console.log(`[zc8-v6-worker] ${cursor}/${blocks.length} (${(100 * cursor / blocks.length).toFixed(1)}%) audit=${checkpoint.auditIssueCount}`);
  }

  if (translatedMap.size !== blocks.length) throw new Error(`translation-coverage:${translatedMap.size}/${blocks.length}`);
  const cues = blocks.map(block => {
    const text = greekPolish(translatedMap.get(block.index)?.text || "");
    if (!text) throw new Error(`empty-translation:${block.index}`);
    return {
      start: block.start,
      duration: block.duration,
      text,
      speaker: block.speaker,
      speakerConfidence: block.speakerConfidence,
      sourceIds: block.sourceIds,
      estimatedBoundary: block.speakerConfidence === "medium",
    };
  });

  let previousEnd = -1;
  let maxCps = 0;
  const cpsValues = [];
  let over20 = 0;
  let longDisplayWarnings = 0;
  for (const cue of cues) {
    if (cue.start + 0.02 < previousEnd) throw new Error(`overlap:${cue.start}:${previousEnd}`);
    previousEnd = cue.start + cue.duration;
    const compact = cue.text.replace(/\s/g, "").length;
    const cps = compact / Math.max(0.65, cue.duration);
    cpsValues.push(cps);
    maxCps = Math.max(maxCps, cps);
    if (cps > 20) over20 += 1;
    if (cue.text.length > 96) longDisplayWarnings += 1;
    if (/,\s+(?:και|ή)\b/iu.test(cue.text)) throw new Error("comma-before-conjunction-final");
  }
  if (over20) throw new Error(`reading-speed-hard-fail:${over20}`);
  const sortedCps = [...cpsValues].sort((a, b) => a - b);
  const p95 = sortedCps[Math.min(sortedCps.length - 1, Math.floor((sortedCps.length - 1) * 0.95))] || 0;

  const result = {
    revision: "zc8-v6",
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
      detectedSpeakerBoundaryCount: parsed.speakerBoundaryCount,
      estimatedIntraRowSpeakerBoundaryCount: parsed.estimatedBoundaryCount,
      exactAudioDiarization: false,
      maxCharsPerSecond: Number(maxCps.toFixed(1)),
      p95CharsPerSecond: Number(p95.toFixed(1)),
      over20CharsPerSecond: 0,
      longDisplayWarningCount: longDisplayWarnings,
      commaBeforeKaiOrI: 0,
      plainMedicalGreek: true,
      sourceMeaningOmissionAllowed: false,
    },
    source: {
      userSrtReference: true,
      userSrtSha256: USER_SRT_SHA256,
      userSrtCueCount: USER_SRT_CUE_COUNT,
      userSrtEndSeconds: USER_SRT_END_SECONDS,
      runtimeSpeakerTranscript: "podspun-detailed-transcript",
      runtimeSourceUrl: fetched.url,
      timedChunkCount: parsed.timedChunkCount,
      runtimeSpeakerPieceCount: parsed.pieces.length,
      exactAudioDiarization: false,
      note: "Display translation coverage is validated against the runtime speaker-marked transcript; the uploaded SRT remains the canonical timing/source reference and is not falsely claimed as semantically byte-mapped here.",
    },
    generatedAt: new Date().toISOString(),
  };

  await writeJson(RESULT_PATH, result);
  await writeJson(CHECKPOINT_PATH, { ...checkpoint, status: "ready", updatedAt: new Date().toISOString() });
  console.log(`[zc8-v6-worker] READY cues=${cues.length} maxCps=${result.quality.maxCharsPerSecond} p95=${result.quality.p95CharsPerSecond}`);
}

await main();

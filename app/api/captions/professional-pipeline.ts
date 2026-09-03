import { canonicalNumberTokens, numberTokensMatch } from "./numeric-integrity.ts";
import type { CachedCue } from "../shared-cache.ts";

export type ReconstructedUnit = {
  id: string;
  sourceCueIndexes: number[];
  sourceStartIndex: number;
  sourceEndIndex: number;
  start: number;
  end: number;
  type: "statement" | "question" | "answer" | "continuation" | "other";
  text: string;
};

export type SemanticSpan = {
  id: string;
  sourceStartIndex: number;
  sourceEndIndex: number;
  start: number;
  end: number;
  units: ReconstructedUnit[];
};

export type UnitTranslation = { unitId: string; text: string };

export type ProfessionalCue = CachedCue & {
  semanticSpanId: string;
  sourceStartIndex: number;
  sourceEndIndex: number;
};

const TERMINAL = /[.!?…]["'”’)]?$/u;
const GREEK = /[\u0370-\u03ff\u1f00-\u1fff]/u;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cueEnd(cue: CachedCue) {
  return cue.start + Math.max(0, cue.duration);
}

function normalizedMicro(text: string) {
  return clean(text).toLowerCase().replace(/[.!?…,"'“”‘’():;]+/gu, "").trim();
}

export function isContextDependentMicroUtterance(text: string) {
  return /^(?:i do|i don't|i dont|i did|i didn't|i didnt|it is|it isn't|it isnt|it can|it could|they do|they did|we do|we did|yes|no|exactly|absolutely|right|sure|not necessarily|probably|maybe|that's why|thats why|because)$/u.test(normalizedMicro(text));
}

function startsWithDependentAnswer(text: string) {
  return /^(?:i do|i don't|i dont|i did|i didn't|i didnt|it is|it isn't|it isnt|it can|it could|they do|they did|we do|we did|yes|no|exactly|absolutely|not necessarily)\b/iu.test(clean(text));
}

export function reconstructSourceUnits(cues: CachedCue[]) {
  const units: ReconstructedUnit[] = [];
  let index = 0;
  while (index < cues.length) {
    const indexes = [index];
    let endIndex = index;
    let text = clean(cues[index]?.text || "");
    const start = cues[index]?.start || 0;
    let end = cueEnd(cues[index]);

    while (endIndex + 1 < cues.length && !TERMINAL.test(text)) {
      const next = cues[endIndex + 1];
      const nextText = clean(next.text);
      const gap = next.start - end;
      const combined = clean(`${text} ${nextText}`);
      if (gap > 1.25 || combined.length > 520 || cueEnd(next) - start > 18 || indexes.length >= 6) break;
      endIndex += 1;
      indexes.push(endIndex);
      text = combined;
      end = Math.max(end, cueEnd(next));
    }

    const previous = units.at(-1);
    const question = /\?["'”’)]?$/u.test(text);
    const answer = Boolean(previous?.type === "question" && (isContextDependentMicroUtterance(text) || startsWithDependentAnswer(text) || text.length <= 110));
    units.push({
      id: `u${index}-${endIndex}`,
      sourceCueIndexes: indexes,
      sourceStartIndex: index,
      sourceEndIndex: endIndex,
      start,
      end,
      type: question ? "question" : answer ? "answer" : TERMINAL.test(text) ? "statement" : "continuation",
      text,
    });
    index = endIndex + 1;
  }
  return units;
}

export function buildSemanticSpans(units: ReconstructedUnit[]) {
  const spans: SemanticSpan[] = [];
  let index = 0;
  while (index < units.length) {
    const current = units[index];
    const selected = [current];
    const next = units[index + 1];
    if (next && current.type === "question" && (next.type === "answer" || isContextDependentMicroUtterance(next.text) || startsWithDependentAnswer(next.text))) {
      selected.push(next);
    } else if (next && isContextDependentMicroUtterance(current.text)) {
      selected.push(next);
    }
    const last = selected.at(-1) as ReconstructedUnit;
    spans.push({
      id: `s${current.sourceStartIndex}-${last.sourceEndIndex}`,
      sourceStartIndex: current.sourceStartIndex,
      sourceEndIndex: last.sourceEndIndex,
      start: current.start,
      end: last.end,
      units: selected,
    });
    index += selected.length;
  }
  return spans;
}

export function spanIndexForCursor(spans: SemanticSpan[], cursor: number) {
  const exact = spans.findIndex(span => span.sourceStartIndex >= cursor);
  if (exact >= 0) return exact;
  return spans.length;
}

function protectedTokens(text: string) {
  return [...new Set(text.match(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%))\b/g) || [])];
}

export function unitTranslationFailure(unit: ReconstructedUnit, target: string, precedingUnit?: ReconstructedUnit | null) {
  const candidate = clean(target);
  if (!candidate) return "empty-output";
  if (/ZXQ|\[\[|\]\]/i.test(candidate)) return "translation-artifact";
  if (!numberTokensMatch(unit.text, candidate)) {
    return `number-mismatch:${JSON.stringify(canonicalNumberTokens(unit.text))}:${JSON.stringify(canonicalNumberTokens(candidate))}`;
  }
  const compact = candidate.toLowerCase().replace(/\s+/g, "");
  for (const token of protectedTokens(unit.text)) {
    if (!compact.includes(token.toLowerCase().replace(/\s+/g, ""))) return `missing-protected-token:${token}`;
  }
  if (/[A-Za-z]/.test(unit.text) && !GREEK.test(candidate) && protectedTokens(unit.text).join("") !== clean(unit.text)) return "non-greek-output";

  const micro = normalizedMicro(unit.text);
  if (precedingUnit?.type === "question" && ["i do", "i don't", "i dont", "i did", "i didn't", "i didnt"].includes(micro)) {
    if (/(^|[^\p{L}\p{N}])(?:(?:το)\s+)?κάν(?:ω|εις|ει|ουμε|ετε|ουν)(?=$|[^\p{L}\p{N}])|(^|[^\p{L}\p{N}])έκανα(?=$|[^\p{L}\p{N}])/iu.test(candidate)) {
      return "literal-dependent-answer";
    }
  }
  return null;
}

function splitToSubtitleChunks(text: string, maxChars = 84) {
  const normalized = clean(text);
  if (!normalized) return [] as string[];
  const sentences = normalized.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    const words = sentence.split(/\s+/u);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && next.length > maxChars) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

function minimumReadingSeconds(text: string) {
  return Math.max(1, clean(text).length / 17);
}

type DisplayUnit = {
  semanticSpanId: string;
  sourceStartIndex: number;
  sourceEndIndex: number;
  start: number;
  end: number;
  text: string;
};

function coalesceTightUnits(rows: DisplayUnit[]) {
  const work = rows.map(row => ({ ...row }));
  const result: DisplayUnit[] = [];
  for (let index = 0; index < work.length; index += 1) {
    const row = work[index];
    const available = row.end - row.start;
    if ((available < 1 || minimumReadingSeconds(row.text) > available) && index + 1 < work.length) {
      const next = work[index + 1];
      work[index + 1] = {
        ...next,
        semanticSpanId: row.semanticSpanId,
        sourceStartIndex: row.sourceStartIndex,
        start: row.start,
        text: clean(`${row.text} ${next.text}`),
      };
      continue;
    }
    if ((available < 1 || minimumReadingSeconds(row.text) > available) && result.length) {
      const previous = result[result.length - 1];
      previous.end = Math.max(previous.end, row.end);
      previous.sourceEndIndex = row.sourceEndIndex;
      previous.text = clean(`${previous.text} ${row.text}`);
      continue;
    }
    result.push(row);
  }
  return result;
}

export function authorApprovedSpans(spans: SemanticSpan[], translations: Map<string, string>, floorStart = 0) {
  const display = coalesceTightUnits(spans.flatMap(span => span.units.map(unit => ({
    semanticSpanId: span.id,
    sourceStartIndex: unit.sourceStartIndex,
    sourceEndIndex: unit.sourceEndIndex,
    start: unit.start,
    end: unit.end,
    text: translations.get(unit.id) || "",
  }))));

  const cues: ProfessionalCue[] = [];
  let timeline = Math.max(0, floorStart);
  for (const row of display) {
    const parts = splitToSubtitleChunks(row.text);
    if (!parts.length) throw new Error(`Professional subtitle authoring produced empty text for ${row.semanticSpanId}`);
    const start = Math.max(row.start, timeline);
    const window = row.end - start;
    const minimums = parts.map(minimumReadingSeconds);
    const required = minimums.reduce((sum, value) => sum + value, 0);
    if (window + 0.02 < required) {
      throw new Error(`professional-reading-speed:${row.semanticSpanId}:required=${required.toFixed(2)}:available=${window.toFixed(2)}`);
    }
    const targetTotal = Math.min(window, parts.length * 7);
    const extra = Math.max(0, targetTotal - required);
    const weight = minimums.reduce((sum, value) => sum + value, 0) || 1;
    let position = start;
    parts.forEach((text, index) => {
      const duration = Math.min(7, minimums[index] + extra * (minimums[index] / weight));
      cues.push({
        start: position,
        duration,
        text: clean(text),
        semanticSpanId: row.semanticSpanId,
        sourceStartIndex: row.sourceStartIndex,
        sourceEndIndex: row.sourceEndIndex,
      });
      position += duration;
    });
    timeline = Math.max(timeline, position);
  }
  return cues;
}

function normalizedBoundaryWord(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function boundaryWords(value: string) {
  return clean(value).match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) || [];
}

export function validateProfessionalSubtitleFile(cues: CachedCue[]) {
  const issues: string[] = [];
  let previousEnd = -1;
  let previousText = "";
  cues.forEach((cue, index) => {
    const text = clean(cue.text);
    const duration = Number(cue.duration);
    if (!Number.isFinite(cue.start) || cue.start < 0) issues.push(`invalid-start:${index}`);
    if (!Number.isFinite(duration) || duration < 0.999) issues.push(`duration-under-1s:${index}`);
    if (duration > 7.001) issues.push(`duration-over-7s:${index}`);
    if (cue.start + 0.002 < previousEnd) issues.push(`overlap:${index}`);
    if (!text) issues.push(`empty:${index}`);
    if (text.length > 84) issues.push(`over-84-chars:${index}`);
    if (duration > 0 && text.length / duration > 17.05) issues.push(`reading-speed:${index}`);
    if (/ZXQ|\[\[|\]\]/i.test(text)) issues.push(`artifact:${index}`);

    if (index > 0 && cue.start - previousEnd <= 0.05 && /[.!?…]["'”’)]?$/u.test(previousText)) {
      const previousWords = boundaryWords(previousText);
      const currentWords = boundaryWords(text);
      const previousWord = normalizedBoundaryWord(previousWords.at(-1) || "");
      const currentWord = normalizedBoundaryWord(currentWords[0] || "");
      if (previousWord.length >= 4 && previousWord === currentWord) {
        issues.push(`boundary-repeat:${index - 1}-${index}:${previousWord}`);
      }
    }

    previousEnd = Math.max(previousEnd, cue.start + Math.max(0, duration));
    previousText = text;
  });
  return issues;
}

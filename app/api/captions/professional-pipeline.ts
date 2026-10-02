import { canonicalNumberTokens, numberTokensMatch } from "./numeric-integrity.ts";
import type { CachedCue } from "../shared-cache.ts";

export type SourceTimingAnchor = {
  sourceIndex: number;
  start: number;
  end: number;
  text: string;
  terminal: boolean;
};

export type ReconstructedUnit = {
  id: string;
  sourceCueIndexes: number[];
  sourceStartIndex: number;
  sourceEndIndex: number;
  sourceAnchors: SourceTimingAnchor[];
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
const MIN_EVENT_SECONDS = 1;
const MAX_EVENT_SECONDS = 7;
const MAX_READING_CPS = 17;
const MAX_LINE_CHARACTERS = 42;
const MAX_EVENT_CHARACTERS = 84;
const TARGET_EVENT_CHARACTERS = 62;
const MAX_ANCHOR_DRIFT_SECONDS = 0.12;

const TRAILING_BREAK_PENALTY = new Set([
  "ο", "η", "το", "οι", "τα", "του", "της", "των", "τον", "την", "τους", "τις",
  "ένας", "μια", "μία", "ένα", "έναν", "μιας", "ενός",
  "και", "κι", "ή", "αλλά", "όμως", "ενώ", "αν", "όταν", "γιατί", "ότι", "πως",
  "που", "να", "θα", "δεν", "μη", "μην", "ας", "για",
  "σε", "με", "από", "προς", "ως", "κατά", "μετά", "πριν", "χωρίς", "μέχρι",
  "στο", "στη", "στην", "στον", "στα", "στις", "στους",
  "μου", "σου", "μας", "σας",
]);
const SENTENCE_END = /[.!?…][»"'”’)\]]*$/u;
const SOFT_BREAK = /[,·:;—–][»"'”’)\]]*$/u;
const INTENTIONAL_SHORT = /^(?:ναι|όχι|οκ|εντάξει|σωστά|ακριβώς|βέβαια|φυσικά)[.!?…]*$/iu;

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
    const sourceAnchors = indexes.map(sourceIndex => {
      const cue = cues[sourceIndex];
      return {
        sourceIndex,
        start: cue.start,
        end: cueEnd(cue),
        text: clean(cue.text),
        terminal: TERMINAL.test(clean(cue.text)),
      } satisfies SourceTimingAnchor;
    });

    units.push({
      id: `u${index}-${endIndex}`,
      sourceCueIndexes: indexes,
      sourceStartIndex: index,
      sourceEndIndex: endIndex,
      sourceAnchors,
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

function stripBreakPunctuation(word: string) {
  return word.replace(/[«»"'()\[\].,!;?:…—–]/gu, "").toLocaleLowerCase("el-GR");
}

function professionalLineLayout(text: string) {
  const normalized = clean(text);
  if (!normalized) return [] as string[];
  if (normalized.length <= MAX_LINE_CHARACTERS) return [normalized];

  const words = normalized.split(/\s+/u);
  let best: { lines: string[]; score: number } | null = null;
  for (let split = 1; split < words.length; split += 1) {
    const first = words.slice(0, split).join(" ");
    const second = words.slice(split).join(" ");
    if (first.length > MAX_LINE_CHARACTERS || second.length > MAX_LINE_CHARACTERS) continue;

    let score = Math.abs(first.length - second.length);
    if (SENTENCE_END.test(first)) score -= 28;
    else if (SOFT_BREAK.test(first)) score -= 12;
    if (TRAILING_BREAK_PENALTY.has(stripBreakPunctuation(words[split - 1]))) score += 34;
    if (!best || score < best.score) best = { lines: [first, second], score };
  }
  return best?.lines || [];
}

function fitsProfessionalEvent(text: string) {
  const normalized = clean(text);
  if (!normalized || normalized.length > MAX_EVENT_CHARACTERS) return false;
  const lines = professionalLineLayout(normalized);
  return lines.length > 0 && lines.length <= 2 && lines.every(line => line.length <= MAX_LINE_CHARACTERS);
}

function chunkBreakScore(segment: string, segmentWords: number, remainingWords: number) {
  let score = -Math.abs(segment.length - TARGET_EVENT_CHARACTERS);
  if (SENTENCE_END.test(segment)) score += 64;
  else if (SOFT_BREAK.test(segment)) score += 26;
  if (TRAILING_BREAK_PENALTY.has(stripBreakPunctuation(segment.split(/\s+/u).at(-1) || ""))) score -= 45;
  if (segmentWords <= 2 && !INTENTIONAL_SHORT.test(segment)) score -= 80;
  if (remainingWords > 0 && remainingWords <= 2) score -= 90;
  return score;
}

function splitToSubtitleChunks(text: string, maxChars = MAX_EVENT_CHARACTERS) {
  const normalized = clean(text);
  if (!normalized) return [] as string[];
  if (normalized.length <= maxChars && fitsProfessionalEvent(normalized)) return [normalized];

  const words = normalized.split(/\s+/u);
  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const remaining = words.slice(start).join(" ");
    if (remaining.length <= maxChars && fitsProfessionalEvent(remaining)) {
      chunks.push(remaining);
      break;
    }

    let best: { end: number; text: string; score: number } | null = null;
    for (let end = start + 1; end <= words.length; end += 1) {
      const candidate = words.slice(start, end).join(" ");
      if (candidate.length > maxChars) break;
      if (!fitsProfessionalEvent(candidate)) continue;
      const segmentWords = end - start;
      const remainingWords = words.length - end;
      const score = chunkBreakScore(candidate, segmentWords, remainingWords);
      if (!best || score > best.score || (score === best.score && candidate.length > best.text.length)) {
        best = { end, text: candidate, score };
      }
    }

    if (!best) {
      // A pathological token wider than the professional line envelope should
      // fail validation later rather than being silently dropped or rewritten.
      const fallbackEnd = Math.min(words.length, start + Math.max(1, Math.floor(maxChars / 8)));
      chunks.push(words.slice(start, fallbackEnd).join(" "));
      start = fallbackEnd;
      continue;
    }

    chunks.push(best.text);
    start = best.end;
  }

  if (chunks.length >= 2) {
    const finalWords = chunks.at(-1)?.split(/\s+/u).filter(Boolean) || [];
    if (finalWords.length <= 2 && !INTENTIONAL_SHORT.test(chunks.at(-1) || "")) {
      const previousWords = chunks[chunks.length - 2].split(/\s+/u).filter(Boolean);
      const combined = [...previousWords, ...finalWords];
      let best: { left: string; right: string; score: number } | null = null;
      for (let split = 3; split <= combined.length - 3; split += 1) {
        const left = combined.slice(0, split).join(" ");
        const right = combined.slice(split).join(" ");
        if (!fitsProfessionalEvent(left) || !fitsProfessionalEvent(right)) continue;
        const score = chunkBreakScore(left, split, combined.length - split)
          + chunkBreakScore(right, combined.length - split, 0);
        if (!best || score > best.score) best = { left, right, score };
      }
      if (best) {
        chunks[chunks.length - 2] = best.left;
        chunks[chunks.length - 1] = best.right;
      }
    }
  }

  return chunks.filter(Boolean);
}

function minimumReadingSeconds(text: string) {
  return Math.max(MIN_EVENT_SECONDS, clean(text).length / MAX_READING_CPS);
}

type DisplayUnit = {
  semanticSpanId: string;
  sourceStartIndex: number;
  sourceEndIndex: number;
  sourceAnchors: SourceTimingAnchor[];
  start: number;
  end: number;
  text: string;
};

function coalesceTightUnits(rows: DisplayUnit[]) {
  const work = rows.map(row => ({ ...row, sourceAnchors: [...row.sourceAnchors] }));
  const result: DisplayUnit[] = [];
  for (let index = 0; index < work.length; index += 1) {
    const row = work[index];
    const available = row.end - row.start;
    if ((available < MIN_EVENT_SECONDS || minimumReadingSeconds(row.text) > available) && index + 1 < work.length) {
      const next = work[index + 1];
      work[index + 1] = {
        ...next,
        semanticSpanId: row.semanticSpanId,
        sourceStartIndex: row.sourceStartIndex,
        sourceAnchors: [...row.sourceAnchors, ...next.sourceAnchors],
        start: row.start,
        text: clean(`${row.text} ${next.text}`),
      };
      continue;
    }
    if ((available < MIN_EVENT_SECONDS || minimumReadingSeconds(row.text) > available) && result.length) {
      const previous = result[result.length - 1];
      previous.end = Math.max(previous.end, row.end);
      previous.sourceEndIndex = row.sourceEndIndex;
      previous.sourceAnchors.push(...row.sourceAnchors);
      previous.text = clean(`${previous.text} ${row.text}`);
      continue;
    }
    result.push(row);
  }
  return result;
}

function desiredPartBoundaries(row: DisplayUnit, parts: string[]) {
  if (parts.length <= 1) return [] as number[];
  const weights = parts.map(part => Math.max(1, clean(part).length));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let accumulated = 0;
  return weights.slice(0, -1).map(weight => {
    accumulated += weight;
    return row.start + (row.end - row.start) * (accumulated / total);
  });
}

/**
 * Prefer immutable raw/source cue boundaries over character-proportional
 * interpolation. If there are enough authored events to represent every raw
 * boundary, every boundary is retained. Otherwise choose the source boundaries
 * closest to the desired semantic split positions.
 */
function speechAnchoredBoundaries(row: DisplayUnit, parts: string[]) {
  const count = Math.max(0, parts.length - 1);
  if (!count) return [] as number[];
  if (row.end - row.start + 1e-6 < parts.length * MIN_EVENT_SECONDS) {
    throw new Error(`professional-anchor-duration-budget:${row.semanticSpanId}:parts=${parts.length}:available=${(row.end-row.start).toFixed(2)}`);
  }

  const desired = desiredPartBoundaries(row, parts);
  const hard = [...new Set(row.sourceAnchors.slice(0, -1).map(anchor => anchor.end))]
    .filter(value => value > row.start + 1e-6 && value < row.end - 1e-6)
    .sort((a, b) => a - b);

  const selected: number[] = [];
  let previous = row.start;
  for (let slot = 0; slot < count; slot += 1) {
    const minimum = Math.max(previous + MIN_EVENT_SECONDS, row.start + MIN_EVENT_SECONDS * (slot + 1));
    const remainingEvents = count - slot;
    const maximum = row.end - MIN_EVENT_SECONDS * remainingEvents;
    const target = Math.min(maximum, Math.max(minimum, desired[slot]));

    const candidates = hard.filter(value =>
      value >= minimum - 1e-6 &&
      value <= maximum + 1e-6 &&
      value > previous + 1e-6 &&
      !selected.includes(value)
    );
    const chosen = candidates.length
      ? candidates.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, candidates[0])
      : target;

    selected.push(chosen);
    previous = chosen;
  }
  return selected;
}

function authoredWindows(row: DisplayUnit, parts: string[]) {
  const boundaries = speechAnchoredBoundaries(row, parts);
  const points = [row.start, ...boundaries, row.end];
  if (points.length !== parts.length + 1) {
    throw new Error(`professional-anchor-allocation:${row.semanticSpanId}`);
  }
  return parts.map((text, index) => ({
    text,
    start: points[index],
    end: points[index + 1],
  }));
}

export function authorApprovedSpans(spans: SemanticSpan[], translations: Map<string, string>, floorStart = 0) {
  const display = coalesceTightUnits(spans.flatMap(span => span.units.map(unit => ({
    semanticSpanId: span.id,
    sourceStartIndex: unit.sourceStartIndex,
    sourceEndIndex: unit.sourceEndIndex,
    sourceAnchors: unit.sourceAnchors,
    start: unit.start,
    end: unit.end,
    text: translations.get(unit.id) || "",
  }))));

  const cues: ProfessionalCue[] = [];
  let timeline = Math.max(0, floorStart);
  for (const row of display) {
    // v1 silently used max(row.start, timeline), which could move a subtitle
    // later than the speech that owns it. v1.1 treats that as a hard alignment
    // failure. The wording must be compressed/resegmented instead of delaying
    // the next semantic phrase.
    if (timeline > row.start + MAX_ANCHOR_DRIFT_SECONDS) {
      throw new Error(`professional-anchor-drift:${row.semanticSpanId}:source=${row.start.toFixed(3)}:timeline=${timeline.toFixed(3)}`);
    }

    const parts = splitToSubtitleChunks(row.text);
    if (!parts.length) throw new Error(`Professional subtitle authoring produced empty text for ${row.semanticSpanId}`);
    const windows = authoredWindows(row, parts);

    for (const window of windows) {
      const duration = window.end - window.start;
      const minimum = minimumReadingSeconds(window.text);
      if (duration < MIN_EVENT_SECONDS - 0.001) {
        throw new Error(`professional-anchor-duration:${row.semanticSpanId}:duration=${duration.toFixed(2)}`);
      }
      if (duration > MAX_EVENT_SECONDS + 0.001) {
        throw new Error(`professional-anchor-duration-over:${row.semanticSpanId}:duration=${duration.toFixed(2)}`);
      }
      if (duration + 0.02 < minimum) {
        throw new Error(`professional-anchor-reading-speed:${row.semanticSpanId}:required=${minimum.toFixed(2)}:available=${duration.toFixed(2)}`);
      }

      cues.push({
        start: window.start,
        duration,
        text: clean(window.text),
        semanticSpanId: row.semanticSpanId,
        sourceStartIndex: row.sourceStartIndex,
        sourceEndIndex: row.sourceEndIndex,
      });
    }
    timeline = row.end;
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
    if (text.length > MAX_EVENT_CHARACTERS) issues.push(`over-84-chars:${index}`);
    const lines = professionalLineLayout(text);
    if (text && (!lines.length || lines.length > 2 || lines.some(line => line.length > MAX_LINE_CHARACTERS))) {
      issues.push(`line-layout:${index}`);
    }
    if (duration > 0 && text.length / duration > MAX_READING_CPS + 0.05) issues.push(`reading-speed:${index}`);
    if (/ZXQ|\[\[|\]\]/i.test(text)) issues.push(`artifact:${index}`);

    const words = text.split(/\s+/u).filter(Boolean);
    const nextCue = cues[index + 1];
    const touchesPrevious = index > 0 && cue.start - previousEnd <= 0.05;
    const touchesNext = Boolean(nextCue && nextCue.start - (cue.start + duration) <= 0.05);
    if (words.length <= 2 && text.length < 18 && !INTENTIONAL_SHORT.test(text) && (touchesPrevious || touchesNext)) {
      issues.push(`orphan-event:${index}`);
    }

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

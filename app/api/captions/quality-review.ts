import { canonicalNumberTokens } from "./numeric-integrity";

export type TimedTextCue = {
  start: number;
  duration: number;
  text: string;
};

export type ReviewWindow = {
  targetIndex: number;
  english: Array<{ index: number; text: string }>;
  greek: Array<{ index: number; text: string }>;
};

export type CueCorrection = {
  index: number;
  text: string;
  reason?: string;
};

function sameStringMultiset(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function hasGreekLetters(text: string) {
  return /[\u0370-\u03ff\u1f00-\u1fff]/u.test(text);
}

export function obviousGreekFluencyIssue(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  // Flag, do not auto-rewrite. These patterns are strong indicators that a
  // translation needs contextual review, while still leaving the final edit to
  // a meaning-aware pass.
  return /\b(?:σε|με|για|από|προς)\s+(?:αυτοί|αυτές)\b/iu.test(normalized) ||
    /\b(?:σε|με|για|από|προς)\s+αυτά\s+(?:ο|η|οι|τους|τις)\b/iu.test(normalized) ||
    /\b(?:είναι|ήταν|ήταν)\s+καλά\s+σε\s*$/iu.test(normalized) ||
    /\s+[aα]\s*$/u.test(normalized);
}

export function buildContextWindow(
  english: TimedTextCue[],
  greek: TimedTextCue[],
  targetIndex: number,
  radius = 2,
): ReviewWindow {
  const start = Math.max(0, targetIndex - radius);
  const end = Math.min(Math.max(english.length, greek.length), targetIndex + radius + 1);
  const toIndexed = (items: TimedTextCue[]) => items
    .slice(start, end)
    .map((cue, offset) => ({ index: start + offset, text: cue.text }));

  return {
    targetIndex,
    english: toIndexed(english),
    greek: toIndexed(greek),
  };
}

export function candidatePreservesHardIntegrity(sourceEnglish: string, candidateGreek: string) {
  const candidate = candidateGreek.replace(/\s+/g, " ").trim();
  if (!candidate || !hasGreekLetters(candidate)) return false;
  return sameStringMultiset(canonicalNumberTokens(sourceEnglish), canonicalNumberTokens(candidate));
}

export function applyValidatedCorrections(
  english: TimedTextCue[],
  greek: TimedTextCue[],
  corrections: CueCorrection[],
) {
  const byIndex = new Map<number, CueCorrection>();
  for (const correction of corrections) {
    if (!Number.isInteger(correction.index) || correction.index < 0 || correction.index >= greek.length) continue;
    if (byIndex.has(correction.index)) continue;
    const source = english[correction.index]?.text || "";
    if (!candidatePreservesHardIntegrity(source, correction.text)) continue;
    byIndex.set(correction.index, { ...correction, text: correction.text.replace(/\s+/g, " ").trim() });
  }

  return greek.map((cue, index) => {
    const correction = byIndex.get(index);
    if (!correction) return cue;
    // Timings and cue identity are immutable in the quality-review stage.
    return { ...cue, text: correction.text };
  });
}

export function qualityReviewSystemPrompt() {
  return [
    "You are the final Greek subtitle editor, not the primary translator.",
    "Read the surrounding English and Greek cues to understand the full sentence and discourse context.",
    "Correct only objectively wrong Greek meaning, grammar, case, agreement, broken cross-cue syntax, or clear subtitle artefacts.",
    "Never invent information, summarize, embellish, or change technical meaning.",
    "Preserve all numbers, doses, acronyms, names and technical tokens exactly.",
    "Never change cue order, cue IDs, timestamps, or move content to unrelated cues.",
    "Return only explicit cue corrections; leave already-good cues unchanged.",
  ].join(" ");
}

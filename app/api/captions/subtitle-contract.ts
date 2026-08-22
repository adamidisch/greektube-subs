import { canonicalNumberTokens, numberTokensMatch } from "./numeric-integrity.ts";

export type SubtitleCue = { start: number; duration: number; text: string };

export type SubtitlePairValidation = {
  ok: boolean;
  cueCount: number;
  timestampMismatches: number;
  emptyEnglish: number;
  emptyGreek: number;
  numericMismatches: number;
  orderMismatches: number;
  greekRatio: number;
  errors: string[];
};

const TIMING_TOLERANCE_SECONDS = 0.002;

function finiteCue(cue: SubtitleCue) {
  return Number.isFinite(cue.start) && Number.isFinite(cue.duration) && cue.start >= 0 && cue.duration > 0;
}

function greekLetterRatio(cues: SubtitleCue[]) {
  const sample = cues.slice(0, 160).map(cue => cue.text).join(" ");
  const letters = sample.match(/\p{L}/gu)?.length || 0;
  const greek = sample.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters ? greek / letters : 0;
}

/**
 * Final publication contract for GreekTube subtitle pairs.
 *
 * English owns the timing map. Greek must map one-to-one onto exactly the same
 * cues: same count, same start, same duration and same order. Translation may
 * change wording only. Numeric meaning is checked per cue as an objective guard.
 */
export function validateSubtitlePair(
  english: SubtitleCue[],
  greek: SubtitleCue[],
  tolerance = TIMING_TOLERANCE_SECONDS,
): SubtitlePairValidation {
  const errors: string[] = [];
  let timestampMismatches = 0;
  let emptyEnglish = 0;
  let emptyGreek = 0;
  let numericMismatches = 0;
  let orderMismatches = 0;

  if (!english.length) errors.push("english-empty");
  if (english.length !== greek.length) errors.push(`cue-count:${english.length}:${greek.length}`);

  let previousEnglishStart = -Infinity;
  let previousGreekStart = -Infinity;
  const common = Math.min(english.length, greek.length);

  for (let index = 0; index < common; index += 1) {
    const source = english[index];
    const target = greek[index];

    if (!finiteCue(source)) errors.push(`english-timing:${index}`);
    if (!finiteCue(target)) errors.push(`greek-timing:${index}`);
    if (!source.text.trim()) emptyEnglish += 1;
    if (!target.text.trim()) emptyGreek += 1;

    if (source.start + tolerance < previousEnglishStart || target.start + tolerance < previousGreekStart) {
      orderMismatches += 1;
    }
    previousEnglishStart = Math.max(previousEnglishStart, source.start);
    previousGreekStart = Math.max(previousGreekStart, target.start);

    if (Math.abs(source.start - target.start) > tolerance || Math.abs(source.duration - target.duration) > tolerance) {
      timestampMismatches += 1;
    }

    if (!numberTokensMatch(source.text, target.text)) {
      numericMismatches += 1;
      errors.push(`numeric:${index}:${JSON.stringify(canonicalNumberTokens(source.text))}:${JSON.stringify(canonicalNumberTokens(target.text))}`);
    }
  }

  if (timestampMismatches) errors.push(`timestamps:${timestampMismatches}`);
  if (emptyEnglish) errors.push(`empty-english:${emptyEnglish}`);
  if (emptyGreek) errors.push(`empty-greek:${emptyGreek}`);
  if (orderMismatches) errors.push(`order:${orderMismatches}`);

  const greekRatio = greekLetterRatio(greek);
  if (greek.length && greekRatio < 0.2) errors.push(`greek-ratio:${greekRatio.toFixed(4)}`);

  return {
    ok: errors.length === 0,
    cueCount: common,
    timestampMismatches,
    emptyEnglish,
    emptyGreek,
    numericMismatches,
    orderMismatches,
    greekRatio,
    errors,
  };
}

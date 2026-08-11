export type TimedCue = {
  start: number;
  duration: number;
  text: string;
};

type TimingWindow = Pick<TimedCue, "start" | "duration">;

const EPSILON = 1e-9;

/**
 * Supadata's adjacent display spans commonly overlap even though its cue
 * starts are in spoken-text order. For a single subtitle stream, the next
 * start is the latest safe end for the current cue. This never reorders cues,
 * manufactures starts, or removes natural gaps.
 */
export function effectiveSequentialRawWindows<T extends TimedCue>(cues: T[]): T[] {
  return cues.map((cue, index) => {
    const next = cues[index + 1];
    const naturalEnd = cue.start + cue.duration;
    if (!next || next.start <= cue.start || next.start >= naturalEnd) return { ...cue };
    return { ...cue, duration: next.start - cue.start };
  });
}

/** Allocate ordered fragments only inside an already validated cue window. */
export function allocateSequentialCueWindows(cue: TimingWindow, weights: number[]): TimingWindow[] {
  const normalizedWeights = weights.map(weight => Math.max(1, weight));
  const total = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  if (!normalizedWeights.length || !Number.isFinite(total) || total <= 0 || cue.duration <= 0) {
    throw new Error("Invalid cue timing allocation");
  }
  let consumed = 0;
  return normalizedWeights.map(weight => {
    const start = cue.start + cue.duration * (consumed / total);
    consumed += weight;
    const end = cue.start + cue.duration * (consumed / total);
    return { start, duration: Math.max(0.001, end - start) };
  });
}

export function timingInversionCount(cues: TimingWindow[]) {
  let count = 0;
  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index].start < cues[index - 1].start) count += 1;
  }
  return count;
}

function cueWordWeight(text: string) {
  return Math.max(1, text.match(/[\p{L}\p{N}]+/gu)?.length || 0);
}

function allocationForConflictGroup(cues: TimedCue[]) {
  const start = Math.min(...cues.map(cue => cue.start));
  const end = Math.max(...cues.map(cue => cue.start + cue.duration));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= EPSILON) {
    throw new Error("Malformed checkpoint timing group cannot be safely recovered");
  }
  return allocateSequentialCueWindows({ start, duration: end - start }, cues.map(cue => cueWordWeight(cue.text)));
}

/**
 * Recovery for checkpoints created before effective raw windows existed.
 * It preserves cue/text order and adjusts English and Greek with one shared
 * timing plan. It never sorts the transcript or accepts an invalid timeline.
 */
export function recoverMalformedAlignedTimings<T extends TimedCue>(english: T[], greek: T[]) {
  if (english.length !== greek.length) throw new Error("Cannot recover unaligned checkpoint timing");
  const recoveredEnglish = english.map(cue => ({ ...cue }));
  const recoveredGreek = greek.map(cue => ({ ...cue }));
  let recovered = false;

  for (let cursor = 1; cursor < recoveredEnglish.length; cursor += 1) {
    if (recoveredEnglish[cursor].start >= recoveredEnglish[cursor - 1].start) continue;

    let groupStart = cursor - 1;
    let groupEnd = cursor;
    let timing: TimingWindow[];
    while (true) {
      timing = allocationForConflictGroup(english.slice(groupStart, groupEnd + 1));
      const previousStart = groupStart > 0 ? recoveredEnglish[groupStart - 1].start : -Infinity;
      const nextStart = groupEnd + 1 < recoveredEnglish.length ? recoveredEnglish[groupEnd + 1].start : Infinity;
      if (timing[0].start < previousStart) {
        groupStart -= 1;
        continue;
      }
      if (nextStart < timing[timing.length - 1].start) {
        groupEnd += 1;
        continue;
      }
      break;
    }

    timing.forEach((window, offset) => {
      const index = groupStart + offset;
      recoveredEnglish[index] = { ...recoveredEnglish[index], ...window };
      recoveredGreek[index] = { ...recoveredGreek[index], ...window };
    });
    recovered = true;
    cursor = groupEnd;
  }

  if (timingInversionCount(recoveredEnglish) || timingInversionCount(recoveredGreek)) {
    throw new Error("Malformed checkpoint timing recovery did not produce a monotonic timeline");
  }
  return { english: recoveredEnglish, greek: recoveredGreek, recovered };
}

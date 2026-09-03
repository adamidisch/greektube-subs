// Subtitle display layer.
//
// Presentation only. Source cues, database timing and SRT exports are never
// rewritten here. The overlay may group adjacent cues for readability, but it
// must preserve source chronology and must never invent an arbitrary page pace.

export const MAX_LINE_CHARACTERS = 42;

const TRAILING_PENALTY = new Set([
  "ο", "η", "το", "οι", "τα", "του", "της", "των", "τον", "την", "τους", "τις",
  "ένας", "μια", "μία", "ένα", "έναν", "μιας", "ενός",
  "και", "κι", "ή", "αλλά", "όμως", "ενώ", "αν", "όταν", "γιατί", "ότι", "πως",
  "που", "να", "θα", "δεν", "μη", "μην", "ας", "για",
  "σε", "με", "από", "προς", "ως", "κατά", "μετά", "πριν", "χωρίς", "μέχρι",
  "στο", "στη", "στην", "στον", "στα", "στις", "στους",
  "μου", "σου", "μας", "σας", "του",
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for",
  "with", "from", "by", "as", "that", "this", "is", "was", "are", "were",
]);

const SENTENCE_END = /[.!;?…][»"')\]]*$/;
const SOFT_BREAK = /[,·:—–][»"')\]]*$/;
const LEADING_HESITATION = /^(?:ε+|uh+|um+|erm+)[,;:.…—-]*\s+/i;

function normalise(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function displayText(text: string) {
  return normalise(text).replace(LEADING_HESITATION, "").trim();
}

function stripPunctuation(word: string) {
  return word.replace(/[«»"'()\[\].,!;?:…—–]/g, "").toLowerCase();
}

function greedyLines(words: string[], maxLineCharacters: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxLineCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function balanceLines(text: string, maxLineCharacters = MAX_LINE_CHARACTERS): string[] {
  const clean = normalise(text);
  if (!clean) return [];
  if (clean.length <= maxLineCharacters) return [clean];

  const words = clean.split(" ");
  if (words.length < 2) return [clean];

  let best: { lines: string[]; score: number } | null = null;
  for (let split = 1; split < words.length; split += 1) {
    const head = words.slice(0, split).join(" ");
    const tail = words.slice(split).join(" ");
    if (head.length > maxLineCharacters || tail.length > maxLineCharacters) continue;

    let score = Math.abs(head.length - tail.length);
    if (SENTENCE_END.test(head)) score -= 30;
    else if (SOFT_BREAK.test(head)) score -= 12;
    if (TRAILING_PENALTY.has(stripPunctuation(words[split - 1]))) score += 25;

    if (!best || score < best.score) best = { lines: [head, tail], score };
  }

  return best ? best.lines : greedyLines(words, maxLineCharacters);
}

export function subtitleLines(text: string, maxLineCharacters = MAX_LINE_CHARACTERS): string[] {
  const clean = normalise(text);
  if (!clean) return [];
  if (clean.length <= maxLineCharacters * 2) return balanceLines(clean, maxLineCharacters);

  const lines = greedyLines(clean.split(" "), maxLineCharacters);

  // First-pass protection against a tiny final line.
  if (lines.length >= 3 && lines.length % 2 === 1 && lines[lines.length - 1].length < 24) {
    const previous = lines[lines.length - 2].split(" ");
    let last = lines[lines.length - 1];
    while (previous.length > 2 && last.length < 28) {
      const moved = previous.pop();
      if (!moved) break;
      last = `${moved} ${last}`;
    }
    lines[lines.length - 2] = previous.join(" ");
    lines[lines.length - 1] = last;
  }

  return lines;
}

function framePlainText(frame: string) {
  return normalise(frame.replace(/\n/g, " "));
}

function frameWords(frame: string) {
  const text = framePlainText(frame);
  return text ? text.split(" ") : [];
}

function fitsOnePage(text: string) {
  const lines = subtitleLines(text);
  return lines.length > 0
    && lines.length <= 2
    && lines.every(line => line.length <= MAX_LINE_CHARACTERS);
}

/**
 * Rebalances the final two pages so a long cue never ends with a single word or
 * a two-word fragment when the same words can be distributed across two valid
 * two-line pages. Wording and order stay immutable.
 */
function rebalanceFinalOrphan(frames: string[]) {
  if (frames.length < 2) return frames;
  const last = frames.at(-1) as string;
  const lastWords = frameWords(last);
  if (lastWords.length >= 3 && framePlainText(last).length >= 18) return frames;

  const previous = frames.at(-2) as string;
  const words = [...frameWords(previous), ...lastWords];
  if (words.length < 6) return frames;

  let best: { left: string; right: string; score: number } | null = null;
  for (let split = 2; split <= words.length - 3; split += 1) {
    const left = words.slice(0, split).join(" ");
    const right = words.slice(split).join(" ");
    if (!fitsOnePage(left) || !fitsOnePage(right)) continue;
    const rightCount = words.length - split;
    if (rightCount < 3) continue;
    const score = Math.abs(left.length - right.length)
      + (SENTENCE_END.test(left) ? -12 : 0)
      + (SOFT_BREAK.test(left) ? -5 : 0);
    if (!best || score < best.score) best = { left, right, score };
  }

  if (!best) return frames;
  const output = frames.slice(0, -2);
  output.push(subtitleLines(best.left).join("\n"));
  output.push(subtitleLines(best.right).join("\n"));
  return output;
}

function twoLineFrames(text: string) {
  const lines = subtitleLines(text);
  const frames: string[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    frames.push(lines.slice(index, index + 2).join("\n"));
  }
  return rebalanceFinalOrphan(frames);
}

export type PackableCue = { start: number; duration: number; text: string };
export type PackStage = { at: number; text: string };

export type SubtitlePack = {
  start: number;
  duration: number;
  text: string;
  sourceIndices: number[];
  cps: number;
  dense: boolean;
  stages: PackStage[];
  pages: PackStage[];
};

export type PackedSubtitles = {
  packs: SubtitlePack[];
  packOfCue: number[];
};

export const MAX_PACK_DURATION = 4;
export const ORPHAN_MAX_PACK_DURATION = 5.5;
export const ORPHAN_MAX_WORDS = 2;
export const ORPHAN_MAX_DURATION = 1.2;
export const MAX_PACK_CHARACTERS = 84;
export const MAX_PACK_LINES = 2;
export const MAX_PACK_GAP = 1;
export const PACK_MERGE_THRESHOLD = 3;
export const DIAGNOSTIC_CPS_LIMIT = 25;
export const MIN_DISPLAY_SECONDS = 1;
export const MAX_READABILITY_RESCUE_DURATION = 8;
export const MAX_READABILITY_RESCUE_CHARACTERS = 252;
export const MAX_READABILITY_RESCUE_LINES = 6;

/** Small visual lead; enough to avoid feeling late without displaying a phrase early. */
export const PAGE_SPEECH_LEAD_SECONDS = 0.08;

const STANDALONE = /^[«"'(\[]*(?:ε{2,}|α{2,}|χμ+|μμ+|ω{2,}|ναι|όχι|οκ|εντάξει|ναι ναι|uh+|um+|hmm+|yeah|yes|no|ok|okay)[.,!;?…»"')\]]*$/i;

function characterCount(text: string) {
  return Array.from(displayText(text)).length;
}

function isStandalone(text: string) {
  return STANDALONE.test(normalise(text));
}

function endsSentence(text: string) {
  return SENTENCE_END.test(normalise(text));
}

function cueEnd(cue: PackableCue) {
  return cue.start + Math.max(0, cue.duration);
}

function wordCount(text: string) {
  const clean = displayText(text);
  return clean ? clean.split(" ").length : 0;
}

function isSmallTail(cue: PackableCue) {
  return wordCount(cue.text) <= ORPHAN_MAX_WORDS || cue.duration < ORPHAN_MAX_DURATION;
}

function buildStages(cues: PackableCue[], indices: number[]): PackStage[] {
  const texts = indices.map(index => displayText(cues[index].text)).filter(Boolean);
  const lines = subtitleLines(texts.join(" "));
  const counts = texts.map(text => text.split(" ").length);

  const stages: PackStage[] = [];
  let visible = 0;
  for (let step = 0; step < indices.length; step += 1) {
    visible += counts[step] ?? 0;
    let consumed = 0;
    const shown = lines.map(line => {
      const words = line.split(" ");
      const take = Math.max(0, Math.min(words.length, visible - consumed));
      consumed += words.length;
      return words.slice(0, take).join(" ") || "\u00A0";
    });
    stages.push({ at: cues[indices[step]].start, text: shown.join("\n") });
  }
  return stages;
}

/**
 * Approximate each word's spoken onset inside its own source cue. YouTube often
 * gives one 4–8 second cue containing several display pages; assigning every
 * word the cue's start makes those pages race ahead of speech. Linear position
 * inside the immutable source time window is a conservative fallback until
 * true word-level alignment is available.
 */
function estimatedWordStarts(cues: PackableCue[], indices: number[]) {
  const starts: number[] = [];
  for (const index of indices) {
    const text = displayText(cues[index].text);
    const words = text ? text.split(" ") : [];
    if (!words.length) continue;
    const cue = cues[index];
    const duration = Math.max(0, cue.duration);
    words.forEach((_, wordIndex) => {
      const fraction = wordIndex / words.length;
      starts.push(cue.start + duration * fraction);
    });
  }
  return starts;
}

function buildPages(cues: PackableCue[], indices: number[]): PackStage[] {
  const texts = indices.map(index => displayText(cues[index].text));
  const merged = texts.filter(Boolean).join(" ");
  const frames = twoLineFrames(merged);
  if (frames.length <= 1) {
    return frames.length ? [{ at: cues[indices[0]].start, text: frames[0] }] : [];
  }

  const wordStarts = estimatedWordStarts(cues, indices);
  const sourceEnd = cueEnd(cues[indices[indices.length - 1]]);
  const pages: PackStage[] = [];
  let wordOffset = 0;
  let previousAt = Number.NEGATIVE_INFINITY;

  frames.forEach((frame, pageIndex) => {
    const words = framePlainText(frame).split(/\s+/).filter(Boolean);
    const estimated = wordStarts[wordOffset] ?? cues[indices[0]].start;
    const speechAligned = Math.max(cues[indices[0]].start, estimated - PAGE_SPEECH_LEAD_SECONDS);
    let at = pageIndex === 0
      ? cues[indices[0]].start
      : Math.max(speechAligned, previousAt + MIN_DISPLAY_SECONDS);

    // Protect the final page's minimum display window. Readability rescue may
    // later absorb another source cue if this clamping still cannot make it fit.
    if (pageIndex === frames.length - 1) {
      at = Math.min(at, Math.max(cues[indices[0]].start, sourceEnd - MIN_DISPLAY_SECONDS));
      if (pages.length) at = Math.max(at, pages[pages.length - 1].at + MIN_DISPLAY_SECONDS);
    }

    pages.push({ at, text: frame });
    previousAt = at;
    wordOffset += words.length;
  });

  return pages;
}

function displayTextForIndices(cues: PackableCue[], indices: number[]) {
  return indices.map(index => displayText(cues[index].text)).filter(Boolean).join(" ");
}

function sourceEndForIndices(cues: PackableCue[], indices: number[]) {
  return cueEnd(cues[indices[indices.length - 1]]);
}

function hasReadableWindow(cues: PackableCue[], indices: number[]) {
  const start = cues[indices[0]].start;
  const sourceEnd = sourceEndForIndices(cues, indices);
  const pages = buildPages(cues, indices);
  if (!pages.length) return sourceEnd - start >= MIN_DISPLAY_SECONDS;
  const lastStart = pages[pages.length - 1].at;
  return sourceEnd + 1e-6 >= lastStart + MIN_DISPLAY_SECONDS;
}

function makePack(cues: PackableCue[], indices: number[]): SubtitlePack {
  const first = cues[indices[0]];
  const last = cues[indices[indices.length - 1]];
  const start = first.start;
  const duration = Math.max(0.001, cueEnd(last) - start);
  const text = displayTextForIndices(cues, indices);
  const cps = characterCount(text) / duration;
  return {
    start,
    duration,
    text,
    sourceIndices: [...indices],
    cps,
    dense: cps > DIAGNOSTIC_CPS_LIMIT,
    stages: buildStages(cues, indices),
    pages: buildPages(cues, indices),
  };
}

export function packSubtitles(cues: PackableCue[] | undefined | null): PackedSubtitles {
  const source = cues ?? [];
  const packs: SubtitlePack[] = [];
  const packOfCue: number[] = new Array(source.length).fill(0);

  let index = 0;
  while (index < source.length) {
    const indices = [index];
    let text = displayText(source[index].text);
    let end = cueEnd(source[index]);
    let next = index + 1;

    if (!isStandalone(source[index].text)) {
      while (next < source.length) {
        const candidate = source[next];
        const candidateText = displayText(candidate.text);
        const packDuration = end - source[index].start;
        const tail = isSmallTail(candidate);

        if (packDuration >= PACK_MERGE_THRESHOLD && !tail) break;
        if (endsSentence(text)) break;
        if (isStandalone(candidate.text)) break;
        if (candidate.start - end > MAX_PACK_GAP) break;

        const mergedEnd = Math.max(end, cueEnd(candidate));
        const cap = tail ? ORPHAN_MAX_PACK_DURATION : MAX_PACK_DURATION;
        if (mergedEnd - source[index].start > cap) break;

        const mergedText = candidateText ? `${text} ${candidateText}`.trim() : text;
        if (characterCount(mergedText) > MAX_PACK_CHARACTERS) break;
        if (subtitleLines(mergedText).length > MAX_PACK_LINES) break;

        indices.push(next);
        text = mergedText;
        end = mergedEnd;
        next += 1;
      }
    }

    while (!hasReadableWindow(source, indices) && next < source.length) {
      const candidate = source[next];
      if (candidate.start - end > MAX_PACK_GAP) break;
      const mergedEnd = Math.max(end, cueEnd(candidate));
      if (mergedEnd - source[index].start > MAX_READABILITY_RESCUE_DURATION) break;

      const candidateText = displayText(candidate.text);
      const mergedText = candidateText ? `${text} ${candidateText}`.trim() : text;
      if (characterCount(mergedText) > MAX_READABILITY_RESCUE_CHARACTERS) break;
      if (subtitleLines(mergedText).length > MAX_READABILITY_RESCUE_LINES) break;

      indices.push(next);
      text = mergedText;
      end = mergedEnd;
      next += 1;
    }

    const pack = makePack(source, indices);
    for (const cueIndex of indices) packOfCue[cueIndex] = packs.length;
    packs.push(pack);
    index = indices[indices.length - 1] + 1;
  }

  return { packs, packOfCue };
}

export function packAlongside(
  cues: PackableCue[] | undefined | null,
  grouping: PackedSubtitles,
): PackedSubtitles {
  const source = cues ?? [];
  if (!source.length) return { packs: [], packOfCue: [] };

  const packs: SubtitlePack[] = [];
  const packOfCue: number[] = new Array(source.length).fill(0);
  for (const pack of grouping.packs) {
    const indices = pack.sourceIndices.filter(cueIndex => cueIndex < source.length);
    if (!indices.length) continue;
    for (const cueIndex of indices) packOfCue[cueIndex] = packs.length;
    packs.push(makePack(source, indices));
  }
  return { packs, packOfCue };
}

export function packTextAt(pack: SubtitlePack, currentTime: number) {
  if (pack.pages.length > 1) {
    let text = pack.pages[0].text;
    for (const page of pack.pages) {
      if (currentTime + 1e-6 < page.at) break;
      text = page.text;
    }
    return text;
  }

  let text = pack.stages[0]?.text ?? pack.pages[0]?.text ?? pack.text;
  for (const stage of pack.stages) {
    if (currentTime + 1e-6 < stage.at) break;
    text = stage.text;
  }
  return text;
}

export function packAt(packed: PackedSubtitles, cueIndex: number): SubtitlePack | undefined {
  if (cueIndex < 0 || cueIndex >= packed.packOfCue.length) return undefined;
  return packed.packs[packed.packOfCue[cueIndex]];
}

export function packAfter(packed: PackedSubtitles, cueIndex: number): SubtitlePack | undefined {
  if (cueIndex < 0 || cueIndex >= packed.packOfCue.length) return undefined;
  return packed.packs[packed.packOfCue[cueIndex] + 1];
}

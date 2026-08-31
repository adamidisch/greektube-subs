// Subtitle display layer.
//
// Two concerns, both presentation only. `packSubtitles` groups consecutive
// over-fragmented cues into readable overlay packs; `subtitleLines` decides
// where that text wraps. Neither touches the underlying cue array, its ids, its
// timestamps, the SRT export, the database or the transcript sidebar.
//
// Normal packs preserve source cue timing exactly. Readability rescues may group
// extra consecutive cues into the same display pack so a visible frame never
// flashes for less than the minimum reading window. The source cues themselves
// remain unchanged.

export const MAX_LINE_CHARACTERS = 42;

/** Words that must not be left at the end of a line — they bind to what follows. */
const TRAILING_PENALTY = new Set([
  // Greek articles
  "ο", "η", "το", "οι", "τα", "του", "της", "των", "τον", "την", "τους", "τις",
  "ένας", "μια", "μία", "ένα", "έναν", "μιας", "ενός",
  // Greek conjunctions and particles
  "και", "κι", "ή", "αλλά", "όμως", "ενώ", "αν", "όταν", "γιατί", "ότι", "πως",
  "που", "να", "θα", "δεν", "μη", "μην", "ας", "για",
  // Greek prepositions
  "σε", "με", "από", "προς", "ως", "κατά", "μετά", "πριν", "χωρίς", "μέχρι",
  "στο", "στη", "στην", "στον", "στα", "στις", "στους",
  // Greek clitic pronouns — they lean on the verb that follows
  "μου", "σου", "μας", "σας", "τoυ",
  // English equivalents, for the English and dual tracks
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for",
  "with", "from", "by", "as", "that", "this", "is", "was", "are", "were",
]);

const SENTENCE_END = /[.!;?…][»"')\]]*$/;
const SOFT_BREAK = /[,·:—–][»"')\]]*$/;
const LEADING_HESITATION = /^(?:ε+|uh+|um+|erm+)[,;:.…—-]*\s+/i;

function normalise(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Overlay-only cleanup. A leading hesitation such as «ε,» is speech noise rather
 * than useful subtitle content. It stays in the source transcript and exports
 * but does not consume reading space in the video overlay.
 */
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
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Best two-line split, or a single line when the text already fits.
 * Falls back to greedy wrapping when no split keeps both halves inside the
 * character limit.
 */
export function balanceLines(text: string, maxLineCharacters = MAX_LINE_CHARACTERS): string[] {
  const clean = normalise(text);
  if (!clean) return [];
  if (clean.length <= maxLineCharacters) return [clean];

  const words = clean.split(" ");
  if (words.length < 2) return [clean];

  let best: { lines: string[]; score: number } | null = null;

  for (let split = 1; split < words.length; split++) {
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

/**
 * Full line list for a subtitle of any length. Texts that fit in two lines are
 * balanced; longer ones keep the established greedy behaviour and are paged by
 * the overlay into two-line frames.
 */
export function subtitleLines(text: string, maxLineCharacters = MAX_LINE_CHARACTERS): string[] {
  const clean = normalise(text);
  if (!clean) return [];
  if (clean.length <= maxLineCharacters * 2) return balanceLines(clean, maxLineCharacters);

  const lines = greedyLines(clean.split(" "), maxLineCharacters);

  // Avoid a tiny orphan line at the end when the previous line has room to share.
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

function twoLineFrames(text: string) {
  const lines = subtitleLines(text);
  const frames: string[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    frames.push(lines.slice(index, index + 2).join("\n"));
  }
  return frames;
}

// ---------------------------------------------------------------------------

export type PackableCue = { start: number; duration: number; text: string };

/** One reveal or page step of a pack. */
export type PackStage = { at: number; text: string };

export type SubtitlePack = {
  start: number;
  duration: number;
  text: string;
  /** Indices of the original cues that make up this pack, in order. */
  sourceIndices: number[];
  /** Characters per second. Diagnostic only — never gates packing. */
  cps: number;
  /** True when cps exceeds DIAGNOSTIC_CPS_LIMIT. Diagnostic only. */
  dense: boolean;
  /** Progressive reveal for ordinary one/two-line packs. */
  stages: PackStage[];
  /**
   * Stable two-line pages for oversized or readability-rescue packs. When this
   * list has more than one item it takes precedence over progressive reveal.
   */
  pages: PackStage[];
};

export type PackedSubtitles = {
  packs: SubtitlePack[];
  /** Original cue index -> pack index. */
  packOfCue: number[];
};

export const MAX_PACK_DURATION = 4;
/**
 * A one- or two-word tail that completes the previous phrase may push a pack
 * this far. It applies only to that case: such a tail adds a handful of
 * characters, so the extra time lowers the reading density rather than raising
 * it, and the character and line limits below still apply unchanged.
 */
export const ORPHAN_MAX_PACK_DURATION = 5.5;
export const ORPHAN_MAX_WORDS = 2;
export const ORPHAN_MAX_DURATION = 1.2;
export const MAX_PACK_CHARACTERS = 84;
export const MAX_PACK_LINES = 2;
export const MAX_PACK_GAP = 1;
/** A pack shorter than this looks for a partner; at or above it stands alone. */
export const PACK_MERGE_THRESHOLD = 3;
export const DIAGNOSTIC_CPS_LIMIT = 25;

/** No distinct visible subtitle frame should flash for less than this. */
export const MIN_DISPLAY_SECONDS = 1;
/** Readability rescue is display-only and deliberately bounded. */
export const MAX_READABILITY_RESCUE_DURATION = 8;
export const MAX_READABILITY_RESCUE_CHARACTERS = 252;
export const MAX_READABILITY_RESCUE_LINES = 6;

/** Fillers and standalone acknowledgements are not normally absorbed. */
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

/** A short tail that cannot stand on its own as a subtitle. */
function isSmallTail(cue: PackableCue) {
  return wordCount(cue.text) <= ORPHAN_MAX_WORDS || cue.duration < ORPHAN_MAX_DURATION;
}

/**
 * Wraps the final text once, then hides the words that have not been spoken
 * yet. Every stage keeps the same number of lines, blank ones held open with a
 * non-breaking space, so the overlay box keeps its final size throughout.
 */
function buildStages(cues: PackableCue[], indices: number[]): PackStage[] {
  const texts = indices.map((index) => displayText(cues[index].text)).filter(Boolean);
  const lines = subtitleLines(texts.join(" "));
  const counts = texts.map((text) => text.split(" ").length);

  const stages: PackStage[] = [];
  let visible = 0;
  for (let step = 0; step < indices.length; step++) {
    visible += counts[step] ?? 0;
    let consumed = 0;
    const shown = lines.map((line) => {
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
 * Builds stable one/two-line pages for text that is too large for one overlay.
 * A page never starts before the first source word it contains and consecutive
 * pages are at least MIN_DISPLAY_SECONDS apart.
 */
function buildPages(cues: PackableCue[], indices: number[]): PackStage[] {
  const texts = indices.map((index) => displayText(cues[index].text));
  const merged = texts.filter(Boolean).join(" ");
  const frames = twoLineFrames(merged);
  if (frames.length <= 1) return frames.length ? [{ at: cues[indices[0]].start, text: frames[0] }] : [];

  const wordStarts: number[] = [];
  for (let sourceIndex = 0; sourceIndex < indices.length; sourceIndex += 1) {
    const text = texts[sourceIndex];
    if (!text) continue;
    const start = cues[indices[sourceIndex]].start;
    for (const _word of text.split(" ")) wordStarts.push(start);
  }

  const pages: PackStage[] = [];
  let wordOffset = 0;
  let previousAt = Number.NEGATIVE_INFINITY;
  frames.forEach((frame, pageIndex) => {
    const words = frame.replace(/\n/g, " ").split(/\s+/).filter(Boolean);
    const sourceAt = wordStarts[wordOffset] ?? cues[indices[0]].start;
    const at = pageIndex === 0
      ? cues[indices[0]].start
      : Math.max(sourceAt, previousAt + MIN_DISPLAY_SECONDS);
    pages.push({ at, text: frame });
    previousAt = at;
    wordOffset += words.length;
  });
  return pages;
}

function displayTextForIndices(cues: PackableCue[], indices: number[]) {
  return indices.map((index) => displayText(cues[index].text)).filter(Boolean).join(" ");
}

function sourceEndForIndices(cues: PackableCue[], indices: number[]) {
  return cueEnd(cues[indices[indices.length - 1]]);
}

/** Whether every resulting visible page gets its full minimum reading window. */
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
  const pages = buildPages(cues, indices);
  return {
    start, duration, text, sourceIndices: [...indices], cps,
    dense: cps > DIAGNOSTIC_CPS_LIMIT,
    stages: buildStages(cues, indices),
    pages,
  };
}

/**
 * Conservative packing for ordinary cues plus a bounded readability rescue.
 * The rescue is used only when the current display would otherwise be shorter
 * than one second or an oversized cue needs multiple two-line pages.
 */
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
        // A short tail completing the current phrase is worth taking even when
        // the pack is already long enough to read on its own; leaving it behind
        // strands a word or two on screen for a fraction of a second.
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
        // The character budget is necessary but not sufficient: word boundaries
        // decide whether the text actually wraps into two lines. A pack that
        // would spill onto a third line is handled by the readability rescue.
        if (subtitleLines(mergedText).length > MAX_PACK_LINES) break;

        indices.push(next);
        text = mergedText;
        end = mergedEnd;
        next += 1;
      }
    }

    // A short display or a legacy cue that spans >2 lines must not flash or fill
    // half the phone. Pull in consecutive source cues only as far as necessary
    // to provide stable two-line pages with at least one second per page.
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

/**
 * Applies an existing pack grouping to a parallel, index-aligned cue track
 * (the English cues). Keeps both tracks switching at the same moments in dual
 * mode instead of drifting apart.
 */
export function packAlongside(
  cues: PackableCue[] | undefined | null,
  grouping: PackedSubtitles,
): PackedSubtitles {
  const source = cues ?? [];
  if (!source.length) return { packs: [], packOfCue: [] };

  const packs: SubtitlePack[] = [];
  const packOfCue: number[] = new Array(source.length).fill(0);

  for (const pack of grouping.packs) {
    const indices = pack.sourceIndices.filter((cueIndex) => cueIndex < source.length);
    if (!indices.length) continue;
    for (const cueIndex of indices) packOfCue[cueIndex] = packs.length;
    packs.push(makePack(source, indices));
  }

  return { packs, packOfCue };
}

/**
 * Text to show at `currentTime`. Oversized/readability-rescue packs use stable
 * two-line pages. Ordinary packs retain the established cue-safe reveal.
 */
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

/** Pack containing the given original cue index. */
export function packAt(packed: PackedSubtitles, cueIndex: number): SubtitlePack | undefined {
  if (cueIndex < 0 || cueIndex >= packed.packOfCue.length) return undefined;
  return packed.packs[packed.packOfCue[cueIndex]];
}

/** Pack that follows the one containing the given original cue index. */
export function packAfter(packed: PackedSubtitles, cueIndex: number): SubtitlePack | undefined {
  if (cueIndex < 0 || cueIndex >= packed.packOfCue.length) return undefined;
  return packed.packs[packed.packOfCue[cueIndex] + 1];
}

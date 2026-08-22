export function hasTranslatableWordTokens(tokens: string[], protectedTokens: string[]) {
  const protectedSet = new Set(protectedTokens.map(token => token.toLowerCase()));
  return tokens.some(token => /\p{L}/u.test(token) && !protectedSet.has(token.toLowerCase()));
}

/**
 * Normalize text that is allowed to appear in the stored/display English track.
 *
 * Contract: this function may remove non-spoken markup and repair whitespace or
 * punctuation artifacts, but it must never remove spoken words. In particular,
 * hesitation words such as "um", "uh" and "erm" are part of the verbatim source
 * and stay in the English subtitle track.
 */
export function stripEnglishSpeechFillers(text: string) {
  return text
    // Supadata/YouTube can occasionally expose SSML-style silence markers as
    // transcript text. They are timing metadata rather than spoken words.
    .replace(/<break\b[^>]*\/?\s*>/giu, " ")
    .replace(/^[,;:]+\s*/, "")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([,;:])\s*\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Translation-only normalization. This is deliberately separate from the
 * English display-track contract above: translation context may drop isolated
 * hesitation noises to improve semantic continuity, but those words are never
 * deleted from the canonical English subtitles stored for the user.
 */
function stripTranslationSpeechFillers(text: string) {
  return stripEnglishSpeechFillers(text)
    .replace(/(^|[^\p{L}\p{N}])(?:u+m+|u+h+|e+r+m+|h+m+|a+h+)(?=$|[^\p{L}\p{N}])/giu, "$1")
    .replace(/^[,;:]+\s*/, "")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([,;:])\s*\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export type ContextCue = { start: number; duration: number; text: string };

export function groupEnglishCuesForContext(
  cues: ContextCue[],
  options: { maxCues?: number; maxChars?: number; maxDuration?: number; maxGap?: number } = {},
) {
  const maxCues = options.maxCues ?? 4;
  const maxChars = options.maxChars ?? 120;
  const maxDuration = options.maxDuration ?? 7.5;
  const maxGap = options.maxGap ?? 0.8;
  const result: ContextCue[] = [];
  let block: ContextCue[] = [];

  const flush = () => {
    if (!block.length) return;
    const first = block[0];
    const last = block[block.length - 1];
    const end = Math.max(first.start + first.duration, last.start + last.duration);
    result.push({
      start: first.start,
      duration: Math.max(0.1, end - first.start),
      text: block.map(cue => cue.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    block = [];
  };

  for (const cue of cues) {
    const clean = stripTranslationSpeechFillers(cue.text);
    if (!clean) continue;
    const next = { ...cue, text: clean };
    if (!block.length) { block.push(next); continue; }

    const first = block[0];
    const previous = block[block.length - 1];
    const currentText = block.map(item => item.text).join(" ");
    const gap = Math.max(0, next.start - (previous.start + previous.duration));
    const projectedEnd = Math.max(previous.start + previous.duration, next.start + next.duration);
    const projectedDuration = projectedEnd - first.start;
    const sentenceComplete = /[.!?][\"'’”)]*$/.test(currentText.trim());
    const shouldBreak = sentenceComplete || gap > maxGap || block.length >= maxCues ||
      projectedDuration > maxDuration || `${currentText} ${next.text}`.length > maxChars;
    if (shouldBreak) flush();
    block.push(next);
  }
  flush();
  return result;
}

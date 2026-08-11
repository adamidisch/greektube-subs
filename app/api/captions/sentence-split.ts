const DECIMAL_POINT_SENTINEL = "\uE000";

export function splitSubtitleSentences(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return [] as string[];

  // A period between digits is part of a decimal/version token, not a sentence
  // boundary. Protect it only for segmentation, then restore it verbatim.
  const protectedText = text.replace(/(\d)\.(?=\d)/g, `$1${DECIMAL_POINT_SENTINEL}`);
  const matches = protectedText
    .match(/[^.!?…]+[.!?…]+[\"')\]]*|[^.!?…]+$/g)
    ?.map(part => part.replaceAll(DECIMAL_POINT_SENTINEL, ".").trim())
    .filter(Boolean) || [text];

  if (matches.length <= 1) return matches;

  // Preserve the abbreviation behaviour of the existing splitter.
  const parts: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    let part = matches[index];
    while (/\b(?:Dr|Mr|Mrs|Ms|Prof|St|vs|e\.g|i\.e)\.$/i.test(part) && index + 1 < matches.length) {
      part = `${part} ${matches[index + 1]}`.replace(/\s+/g, " ").trim();
      index += 1;
    }
    parts.push(part);
  }
  return parts;
}

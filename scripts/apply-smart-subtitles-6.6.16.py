from pathlib import Path

# One-shot patch for smart subtitle cleanup.
path = Path("app/api/captions/route.ts")
text = path.read_text()

old = '''function createMeaningUnits(cues: CaptionCue[]) {
  const units: CaptionCue[] = [];
  let current: CaptionCue[] = [];
  let characters = 0;
'''
new = '''function createMeaningUnits(cues: CaptionCue[]) {
  // Clean ASR hesitation/noise before grouping and translating so vocal fillers
  // do not become long Greek strings such as "χμμμμμμ...".
  const preparedCues = cues
    .map(cue => ({ ...cue, text: cleanSubtitleText(cue.text) }))
    .filter(cue => cue.text.length > 0);
  const units: CaptionCue[] = [];
  let current: CaptionCue[] = [];
  let characters = 0;
'''
assert old in text, "createMeaningUnits header not found"
text = text.replace(old, new, 1)

old = '''  cues.forEach((cue, index) => {
    const next = cues[index + 1];
'''
new = '''  preparedCues.forEach((cue, index) => {
    const next = preparedCues[index + 1];
'''
assert old in text, "createMeaningUnits loop not found"
text = text.replace(old, new, 1)

old = '''function cleanSubtitleText(text: string) {
  return text
    .replace(/\\b([a-zα-ωάέήίόύώ])\\1{3,}\\b/giu, "")
    .replace(/\\b(?:um+|uh+|erm+|h+m+|μμ+|χ+μ+)\\b/giu, "")
    .replace(/\\s+([,.;:!?…])/g, "$1")
    .replace(/([!?.,…])\\1{2,}/g, "$1")
    .replace(/\\s+/g, " ")
    .trim();
}
'''
new = '''function cleanSubtitleText(text: string) {
  return text
    // JavaScript \\b is ASCII-centric and was missing Greek filler tokens.
    // Use Unicode letter/number boundaries instead and remove only clear
    // hesitation noises, leaving meaningful words/interjections untouched.
    .replace(/(^|[^\\p{L}\\p{N}])(?:u+m+|u+h+|e+r+m+|h+m{2,}|m{3,}|χ+μ{2,}|μ{3,})(?=$|[^\\p{L}\\p{N}])/giu, "$1")
    // Collapse obvious ASR stutters only when the same 2+ letter word is
    // repeated three or more times in a row.
    .replace(/(^|[^\\p{L}\\p{N}])(\\p{L}{2,})(?:\\s+\\2){2,}(?=$|[^\\p{L}\\p{N}])/giu, "$1$2")
    .replace(/\\s+([,.;:!?…])/g, "$1")
    .replace(/([!?.,…])\\1{2,}/g, "$1")
    .replace(/\\s+/g, " ")
    .trim();
}
'''
assert old in text, "cleanSubtitleText block not found"
text = text.replace(old, new, 1)

old = '''async function cachedResponse(record: Awaited<ReturnType<typeof getTranscript>>) {
  if (!record) return null;
  const title = await translateTitleToGreek(record.title);
  const originalTitle = hasGreekText([{ start: 0, duration: 1, text: record.title }]) ? "" : record.title;
  return {
'''
new = '''async function cachedResponse(record: Awaited<ReturnType<typeof getTranscript>>) {
  if (!record) return null;
  const title = await translateTitleToGreek(record.title);
  const originalTitle = hasGreekText([{ start: 0, duration: 1, text: record.title }]) ? "" : record.title;

  // Also clean already-cached transcripts so the improvement is visible
  // immediately without forcing every existing video through re-translation.
  // Keep Greek/English cue indexes paired when filler-only cues are removed.
  const cleanedPairs = record.greekTranscript
    .map((cue, index) => ({ index, cue: { ...cue, text: cleanSubtitleText(cue.text) } }))
    .filter(item => item.cue.text.length > 0);
  const greekTranscript = cleanedPairs.map(item => item.cue);
  const englishTranscript: CaptionCue[] = [];
  for (const { index } of cleanedPairs) {
    const cue = record.englishTranscript[index];
    if (!cue) continue;
    const cleaned = cleanSubtitleText(cue.text);
    if (cleaned) englishTranscript.push({ ...cue, text: cleaned });
  }

  return {
'''
assert old in text, "cachedResponse header not found"
text = text.replace(old, new, 1)

old = '''    cues: record.greekTranscript,
    englishCues: record.englishTranscript,
    topics: record.topics,
    keyPoints: record.keyPoints,
'''
new = '''    cues: greekTranscript,
    englishCues: englishTranscript,
    topics: record.topics,
    keyPoints: keyPoints(greekTranscript),
'''
assert old in text, "cachedResponse cue fields not found"
text = text.replace(old, new, 1)

path.write_text(text)

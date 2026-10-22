import type { TimedCue } from "./subtitle-track.ts";

/** Imported alignment evidence is a reviewable declaration, not proof of human listening. */
export type AudioWord = [startMs: number, endMs: number, confidencePermille: number, direct: 0 | 1];
export type SubtitleAudioEvidence = {
  schemaVersion: 1;
  sourceHash: string;
  audioSha256: string;
  wordTimelineHash: string;
  model: string;
  method: string;
  words: AudioWord[];
};
export type SourceWord = { cueIndex: number; text: string };

/** Matches the worker's lexical tokens, including contractions and hyphenated subwords. */
export function subtitleSourceWords(source: TimedCue[]): SourceWord[] {
  return source.flatMap((cue, cueIndex) =>
    (cue.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || []).map(text => ({ cueIndex, text })));
}

export function validateAudioEvidence(value: unknown, source: TimedCue[], options?: { overlapScope: [number, number] }): { evidence: SubtitleAudioEvidence; tokens: SourceWord[] } {
  if (!value || typeof value !== "object") throw Error("Missing audio evidence");
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1) throw Error("Unsupported audio evidence");
  for (const field of ["sourceHash", "audioSha256", "wordTimelineHash"])
    if (typeof row[field] !== "string" || !/^[a-f0-9]{64}$/.test(row[field])) throw Error(`Invalid audio ${field}`);
  for (const field of ["model", "method"])
    if (typeof row[field] !== "string" || !row[field].trim() || row[field].length > 160) throw Error(`Invalid audio ${field}`);
  const tokens = subtitleSourceWords(source);
  if (!tokens.length || tokens.length > 100_000 || !Array.isArray(row.words) || row.words.length !== tokens.length)
    throw Error("Audio word coverage is incomplete");
  let previousEnd = -1;
  const words: AudioWord[] = row.words.map((entry: unknown, index: number) => {
    if (!Array.isArray(entry) || entry.length !== 4 || entry.some(n => typeof n !== "number" || !Number.isSafeInteger(n)))
      throw Error(`Invalid audio word ${index + 1}`);
    const [start, end, confidence, direct] = entry as number[];
    const cue = source[tokens[index].cueIndex];
    const inScope = (cueIndex: number) => !options || cueIndex >= options.overlapScope[0] && cueIndex <= options.overlapScope[1];
    const relevantOverlap = start < previousEnd && (inScope(tokens[index].cueIndex) || inScope(tokens[index - 1]?.cueIndex ?? -1));
    if (start < 0 || end <= start || relevantOverlap || confidence < 0 || confidence > 1000 || (direct !== 0 && direct !== 1))
      throw Error(`Invalid or overlapping audio word ${index + 1}`);
    if (start < Math.max(0, Math.round(cue.start * 1000) - 750) || end > Math.round((cue.start + cue.duration) * 1000) + 750)
      throw Error(`Audio word outside source context ${index + 1}`);
    if (direct && (confidence < 500 || end - start > 2000)) throw Error(`Unsupported direct audio word ${index + 1}`);
    previousEnd = end;
    return [start, end, confidence, direct];
  });
  return { evidence: { schemaVersion: 1, sourceHash: row.sourceHash as string, audioSha256: row.audioSha256 as string,
    wordTimelineHash: row.wordTimelineHash as string, model: row.model as string, method: row.method as string, words }, tokens };
}

import { createHash } from "node:crypto";
import type { AudioWord, SubtitleAudioEvidence } from "../../subtitle-audio-evidence.ts";
import type { TimedCue } from "../../subtitle-track.ts";
import { subtitleContentHash } from "../subtitle-track.ts";

/**
 * Word timings captured from YouTube's own player (json3, automatic English captions).
 * Same compact schema as public/previews/xYB6uYyRjCA-words.json:
 * events = [tStartMs, dDurationMs, [[offsetMs, text, asrConfidence|null], …]].
 */
export type YoutubeAsrCapture = {
  schema: "youtube-asr-words-v1";
  videoId: string;
  lang: string;
  kind: "asr";
  capturedAt: string;
  title?: string;
  channel?: string;
  durationSeconds?: number;
  events: [number, number, [number, string, number | null][]][];
};

/** One lexical token, exactly as `subtitleSourceWords` tokenizes cue text. */
export type CapturedToken = { piece: string; wordIndex: number; startMs: number; endMs: number; split: boolean };

const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu;
const MIN_STEP_MS = 20;
const MIN_WORD_MS = 250;
const MAX_WORD_MS = 1800;
const MAX_WORDS = 60_000;

export function validateCapture(value: unknown, videoId: string): YoutubeAsrCapture {
  const row = value as Partial<YoutubeAsrCapture> | null;
  if (!row || row.schema !== "youtube-asr-words-v1" || row.videoId !== videoId || row.kind !== "asr" || !Array.isArray(row.events))
    throw Error("Μη έγκυρη λήψη λέξεων από το YouTube.");
  if (typeof row.lang !== "string" || !/^en\b/iu.test(row.lang)) throw Error("Χρειάζονται οι αυτόματοι αγγλικοί υπότιτλοι του YouTube.");
  let words = 0;
  for (const event of row.events) {
    if (!Array.isArray(event) || event.length !== 3 || !Number.isSafeInteger(event[0]) || !Number.isSafeInteger(event[1]) || event[0] < 0 || !Array.isArray(event[2]))
      throw Error("Μη έγκυρη λήψη λέξεων από το YouTube.");
    for (const seg of event[2]) {
      if (!Array.isArray(seg) || !Number.isSafeInteger(seg[0]) || seg[0] < 0 || typeof seg[1] !== "string" || seg[1].length > 200)
        throw Error("Μη έγκυρη λήψη λέξεων από το YouTube.");
      words += 1;
    }
  }
  if (words < 50) throw Error("Το βίντεο δεν έχει αρκετές αγγλικές λέξεις με χρόνους.");
  if (words > MAX_WORDS) throw Error("Το βίντεο είναι πολύ μεγάλο για αυτόματη επεξεργασία.");
  return row as YoutubeAsrCapture;
}

/** Spoken words in time order. Sound tags such as [music] are not speech. */
export function captureTokens(capture: YoutubeAsrCapture): CapturedToken[] {
  const words = capture.events.flatMap(([start, , segs]) => segs.map(([offset, text]) => ({ startMs: start + offset, text: text.trim() })))
    .filter(word => word.text && !/^\[.*\]$/u.test(word.text) && word.text.match(TOKEN))
    .sort((a, b) => a.startMs - b.startMs);
  // Strictly increasing starts: the player sometimes reports two words at the same millisecond.
  for (let index = 1; index < words.length; index++)
    if (words[index].startMs < words[index - 1].startMs + MIN_STEP_MS) words[index].startMs = words[index - 1].startMs + MIN_STEP_MS;
  const tokens: CapturedToken[] = [];
  words.forEach((word, wordIndex) => {
    const nextStart = words[wordIndex + 1]?.startMs ?? word.startMs + MAX_WORD_MS;
    // YouTube gives each word's start only. The end is the next word's start, capped by a length-based estimate.
    const estimate = Math.min(MAX_WORD_MS, Math.max(MIN_WORD_MS, 120 + 85 * Array.from(word.text).length));
    const endMs = Math.min(nextStart, word.startMs + estimate);
    const matches = [...word.text.matchAll(TOKEN)];
    const letters = matches.reduce((sum, match) => sum + Array.from(match[0]).length, 0);
    let cursor = word.startMs;
    matches.forEach((match, index) => {
      // Each piece tokenizes to exactly one token, so "fat-burn." → "fat-" + "burn.".
      const from = index === 0 ? 0 : match.index!;
      const to = matches[index + 1]?.index ?? word.text.length;
      const last = index === matches.length - 1;
      const share = Math.round((endMs - word.startMs) * Array.from(match[0]).length / letters);
      const tokenEnd = last ? endMs : Math.max(cursor + 1, Math.min(endMs - (matches.length - index - 1), cursor + share));
      tokens.push({ piece: word.text.slice(from, to), wordIndex, startMs: cursor, endMs: tokenEnd, split: matches.length > 1 });
      cursor = tokenEnd;
    });
  });
  return tokens;
}

/** Joins tokens into cue text; pieces of one spoken word stay glued together. */
export function tokensText(tokens: CapturedToken[]) {
  return tokens.map((token, index) => (index && token.wordIndex !== tokens[index - 1].wordIndex ? " " : "") + token.piece).join("");
}

/** Sentence-sized English cues straight from the spoken words: breaks at sentence ends, pauses and length. */
export function sourceCuesFromTokens(tokens: CapturedToken[]) {
  const groups: CapturedToken[][] = [];
  let current: CapturedToken[] = [];
  const wordsIn = (group: CapturedToken[]) => new Set(group.map(token => token.wordIndex)).size;
  tokens.forEach((token, index) => {
    current.push(token);
    const next = tokens[index + 1];
    if (!next) return;
    if (next.wordIndex === token.wordIndex) return;
    const count = wordsIn(current), gap = next.startMs - token.endMs;
    const sentenceEnd = /[.!?]["'”»)]*$/u.test(token.piece), clauseEnd = /[,;:]["'”»)]*$/u.test(token.piece);
    if ((sentenceEnd && count >= 3) || gap >= 1200 || (clauseEnd && count >= 16) || count >= 26) { groups.push(current); current = []; }
  });
  if (current.length) groups.push(current);
  return groups.map(group => ({ tokens: group, cue: cueFor(group) }));
}

function cueFor(group: CapturedToken[]): TimedCue {
  const start = group[0].startMs, end = group.at(-1)!.endMs;
  return { start: start / 1000, duration: (end - start) / 1000, text: tokensText(group) };
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }

/** Evidence binding the captured timings to a source revision. Every token keeps its own measured window. */
export function evidenceFor(source: TimedCue[], tokens: CapturedToken[], captureHash: string): SubtitleAudioEvidence {
  const words: AudioWord[] = tokens.map(token => [token.startMs, token.endMs, token.split ? 600 : 900, 1]);
  return { schemaVersion: 1, sourceHash: subtitleContentHash(source), audioSha256: captureHash,
    wordTimelineHash: sha256(JSON.stringify(words)), model: "youtube-asr-json3", method: "youtube-player-word-offsets-v1", words };
}

export function captureHashOf(capture: YoutubeAsrCapture) {
  return sha256(JSON.stringify(capture.events));
}

/** SRT with exact millisecond boundaries (end = start + duration), so content hashes survive the round trip. */
export function exactSrt(cues: TimedCue[]) {
  const stamp = (ms: number) => `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  return cues.map((cue, index) => {
    const start = Math.round(cue.start * 1000), end = start + Math.round(cue.duration * 1000);
    return `${index + 1}\n${stamp(start)} --> ${stamp(end)}\n${cue.text.replace(/\s+/gu, " ").trim()}\n`;
  }).join("\n");
}

import type { SubtitleEvent, TimedCue } from "../../subtitle-track.ts";
import { reviewedTrack, subtitleContentHash } from "../subtitle-track.ts";
import { parseManualSubtitleText } from "../manual-captions/parser.ts";
import { numberTokensMatch } from "../captions/numeric-integrity.ts";
import { evidenceFor, exactSrt, tokensText, type CapturedToken } from "./youtube-words.ts";

export type AutoIssue = { start: number; end: number; english: string; issue: string };

/** Pure: one English cue and one Greek cue per display event, approved at the auto_checked level. */
export function buildPublication(trackEvents: SubtitleEvent[], tokens: CapturedToken[], captureHash: string, model: string) {
  // The transcript panel, the SRT exports and the numeric check all line up with exactly what is on screen.
  const events = trackEvents as (SubtitleEvent & { sourceWordRange: [number, number] })[];
  const english: TimedCue[] = events.map(event => ({ start: event.start, duration: event.duration,
    text: tokensText(tokens.slice(event.sourceWordRange[0], event.sourceWordRange[1] + 1)) }));
  const greek: TimedCue[] = events.map(event => ({ start: event.start, duration: event.duration, text: event.text }));
  const issues: AutoIssue[] = events.flatMap((event, index) => numberTokensMatch(english[index].text, event.text) ? [] :
    [{ start: event.start, end: event.start + event.duration, english: english[index].text, issue: `Οι αριθμοί διαφέρουν: «${event.text}»` }]);
  if (issues.length) return { issues };
  const regroupedEvidence = evidenceFor(english, tokens, captureHash);
  const regroupedEvents = events.map((event, index) => ({ ...event, sourceIndices: [index] }));
  const reviewNote = `Αυτόματη ροή GreekTube: χρόνοι λέξεων από το YouTube, μετάφραση και ανεξάρτητος έλεγχος νοήματος από ${model} μέσω Platform Foundation, έλεγχοι αναγνωσιμότητας και αριθμών. Δεν έγινε ακρόαση από άνθρωπο.`;
  const reviewed = reviewedTrack(english, greek, regroupedEvents, "approved", reviewNote, regroupedEvidence, "auto_checked");
  const englishSrt = exactSrt(english), greekSrt = exactSrt(greek);
  if (subtitleContentHash(parseManualSubtitleText(englishSrt) as TimedCue[]) !== reviewed.sourceHash
    || subtitleContentHash(parseManualSubtitleText(greekSrt) as TimedCue[]) !== reviewed.translationHash)
    throw Error("Τα SRT δεν ταιριάζουν με το εγκεκριμένο timeline.");
  return { english, greek, reviewed, englishSrt, greekSrt };
}


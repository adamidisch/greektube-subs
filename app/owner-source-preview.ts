import { numberTokensMatch } from "./api/captions/numeric-integrity.ts";
import { hasValidManualCueTimings, parseManualSubtitleText } from "./api/manual-captions/parser.ts";
import { displaySubtitleTrack } from "./subtitle-track.ts";

export const MAX_OWNER_SRT_SIZE = 2_000_000;
const TIMING_TOLERANCE = 0.002;

export function prepareOwnerSourcePreview(sourceSubtitleText: string, subtitleText: string) {
  if (sourceSubtitleText.length > MAX_OWNER_SRT_SIZE || subtitleText.length > MAX_OWNER_SRT_SIZE) {
    return { error: "size" } as const;
  }

  const english = parseManualSubtitleText(sourceSubtitleText);
  const greek = parseManualSubtitleText(subtitleText);
  if (english.length < 3 || !hasValidManualCueTimings(english)) return { error: "english" } as const;
  if (greek.length < 3 || !hasValidManualCueTimings(greek)) return { error: "greek" } as const;
  const sample = greek.slice(0, 200).map(cue => cue.text).join(" ");
  const letterCount = sample.match(/\p{L}/gu)?.length || 0;
  const greekCount = sample.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  if (!letterCount || greekCount / letterCount < 0.2) return { error: "greek" } as const;

  if (english.length !== greek.length || english.some((cue, index) =>
    Math.abs(cue.start - greek[index].start) > TIMING_TOLERANCE ||
    Math.abs(cue.duration - greek[index].duration) > TIMING_TOLERANCE
  )) return { error: "timing" } as const;

  const numericCue = english.findIndex((cue, index) => !numberTokensMatch(cue.text, greek[index].text));
  if (numericCue >= 0) return { error: "number", cue: numericCue + 1 } as const;

  return { sourceSubtitleText, subtitleText, sourceCueCount: english.length, track: displaySubtitleTrack(greek) };
}

export type OwnerSourceCandidate = Extract<ReturnType<typeof prepareOwnerSourcePreview>, { track: unknown }>;

export const SUBTITLE_TARGET_CPS = 17;
export const SUBTITLE_HARD_MAX_CPS = 20;
export const SUBTITLE_MAX_LINE_CHARACTERS = 42;
export const SUBTITLE_MIN_DURATION_MS = 1_000;
export const SUBTITLE_MAX_DURATION_MS = 7_000;
export const SUBTITLE_MAX_PAUSE_EXTENSION_MS = 500;
export const SUBTITLE_RESERVED_GAP_MS = 120;

export type SubtitleReadabilityInput = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  lineCount?: number;
  longestLineCharacters?: number;
  followingPauseMs?: number;
  speakerChangeAfter?: boolean;
};

export type SubtitleReadabilityAudit = {
  id: string;
  ok: boolean;
  durationMs: number;
  displayCharacters: number;
  charactersPerSecond: number;
  safeExtensionMs: number;
  charactersPerSecondAfterExtension: number;
  requiredTargetDurationMs: number;
  flags: string[];
  action: "pass" | "extend" | "split" | "retime" | "retime_or_condense" | "review";
};

function displayCharacterCount(text: string) {
  return Array.from(text.replace(/\s+/g, " ").trim()).length;
}

export function auditSubtitleReadability(input: SubtitleReadabilityInput): SubtitleReadabilityAudit {
  const durationMs = Math.max(0, Math.round(input.endMs - input.startMs));
  const displayCharacters = displayCharacterCount(input.text);
  const charactersPerSecond = durationMs > 0 ? displayCharacters / (durationMs / 1000) : Number.POSITIVE_INFINITY;
  const safeExtensionMs = input.speakerChangeAfter ? 0 : Math.min(
    SUBTITLE_MAX_PAUSE_EXTENSION_MS,
    Math.max(0, Math.round(input.followingPauseMs || 0) - SUBTITLE_RESERVED_GAP_MS),
  );
  const extendedDurationMs = durationMs + safeExtensionMs;
  const charactersPerSecondAfterExtension = extendedDurationMs > 0
    ? displayCharacters / (extendedDurationMs / 1000)
    : Number.POSITIVE_INFINITY;
  const requiredTargetDurationMs = Math.ceil((displayCharacters / SUBTITLE_TARGET_CPS) * 1000);
  const flags: string[] = [];
  if (durationMs < SUBTITLE_MIN_DURATION_MS) flags.push("TOO_SHORT");
  if (durationMs > SUBTITLE_MAX_DURATION_MS) flags.push("TOO_LONG");
  if (charactersPerSecond > SUBTITLE_HARD_MAX_CPS) flags.push("HARD_CPS_EXCEEDED");
  else if (charactersPerSecond > SUBTITLE_TARGET_CPS) flags.push("TARGET_CPS_EXCEEDED");
  if ((input.lineCount || 1) > 2) flags.push("MORE_THAN_TWO_LINES");
  if ((input.longestLineCharacters || 0) > SUBTITLE_MAX_LINE_CHARACTERS) flags.push("LINE_TOO_LONG");

  let action: SubtitleReadabilityAudit["action"] = "pass";
  if (flags.includes("MORE_THAN_TWO_LINES") || flags.includes("LINE_TOO_LONG")) action = "split";
  if (flags.includes("HARD_CPS_EXCEEDED")) {
    action = charactersPerSecondAfterExtension <= SUBTITLE_HARD_MAX_CPS ? "extend" : "retime_or_condense";
  } else if (flags.includes("TARGET_CPS_EXCEEDED")) {
    action = charactersPerSecondAfterExtension <= SUBTITLE_TARGET_CPS ? "extend" : "retime";
  } else if (flags.length) action = "review";
  return {
    id: input.id,
    ok: flags.length === 0,
    durationMs,
    displayCharacters,
    charactersPerSecond: Number.isFinite(charactersPerSecond) ? Number(charactersPerSecond.toFixed(2)) : charactersPerSecond,
    safeExtensionMs,
    charactersPerSecondAfterExtension: Number.isFinite(charactersPerSecondAfterExtension)
      ? Number(charactersPerSecondAfterExtension.toFixed(2))
      : charactersPerSecondAfterExtension,
    requiredTargetDurationMs,
    flags,
    action,
  };
}

export function auditSubtitleSequence(inputs: SubtitleReadabilityInput[]) {
  const cues = inputs.map(auditSubtitleReadability);
  return {
    ok: cues.every(cue => cue.ok),
    cueCount: cues.length,
    hardCpsFailures: cues.filter(cue => cue.flags.includes("HARD_CPS_EXCEEDED")).length,
    targetCpsWarnings: cues.filter(cue => cue.flags.includes("TARGET_CPS_EXCEEDED")).length,
    cues,
  };
}

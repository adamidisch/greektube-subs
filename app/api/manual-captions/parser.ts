export type ManualCue = { start: number; duration: number; text: string };

function timestampSeconds(value: string) {
  const normalized = value.trim().replace(/,/g, ".").replace(/^\[|\]$/g, "");
  const parts = normalized.split(":").map(Number);
  if (parts.some(part => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function cleanText(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalize(cues: { start: number; end?: number; text: string }[]) {
  const result: ManualCue[] = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const next = cues[index + 1];
    if (!Number.isFinite(cue.start) || cue.start < 0 || !cue.text.trim()) continue;
    const suppliedEnd = Number.isFinite(cue.end) ? cue.end as number : null;
    const nextStart = next && Number.isFinite(next.start) && next.start > cue.start ? next.start : null;
    // Explicit SRT/VTT end times are source data and must remain untouched.
    // Timed transcripts without end times still derive their duration from
    // the next later cue when one is available.
    let end = suppliedEnd && suppliedEnd > cue.start ? suppliedEnd : (nextStart ?? cue.start + 4);
    if (end <= cue.start) end = cue.start + 0.25;
    // A valid explicit SRT/VTT range may legitimately be shorter than 250 ms.
    // Preserve that duration exactly so a downloaded source SRT round-trips
    // through manual import without being changed by the parser.
    result.push({ start: cue.start, duration: end - cue.start, text: cleanText(cue.text) });
  }
  return result;
}

export function hasValidManualCueTimings(cues: ManualCue[]) {
  return cues.every(cue => Number.isFinite(cue.start) && cue.start >= 0 && Number.isFinite(cue.duration) && cue.duration > 0);
}

export function parseManualSubtitleText(input: string) {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [] as ManualCue[];
  const lines = text.split("\n");
  const ranged: { start: number; end?: number; text: string }[] = [];
  let active: { start: number; end?: number; text: string } | null = null;

  const rangePattern = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*(?:\|\s*)?(.*)$/;
  const flush = () => {
    if (active && cleanText(active.text)) ranged.push({ ...active, text: cleanText(active.text) });
    active = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const range = line.match(rangePattern);
    if (range) {
      flush();
      const start = timestampSeconds(range[1]);
      const end = timestampSeconds(range[2]);
      if (start !== null && end !== null && end > start) active = { start, end, text: range[3] || "" };
      continue;
    }
    if (!active) {
      if (!line || /^WEBVTT$/i.test(line) || /^\d+$/.test(line) || /^NOTE\b/i.test(line)) continue;
      continue;
    }
    if (!line) { flush(); continue; }
    if (!/^\d+$/.test(line)) active.text = `${active.text} ${line}`.trim();
  }
  flush();
  if (ranged.length) return normalize(ranged);

  // Fallback for the common YouTube transcript copy format: a timestamp line
  // followed by one or more text lines. Durations are derived from the next
  // timestamp so the imported transcript remains synchronized without guessing
  // arbitrary fixed windows between cues.
  const starts: { start: number; text: string }[] = [];
  let current: { start: number; text: string } | null = null;
  const startPattern = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*(?:\|\s*)?(.*)$/;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(startPattern);
    if (match) {
      const start = timestampSeconds(match[1]);
      if (start !== null) {
        if (current && cleanText(current.text)) starts.push({ ...current, text: cleanText(current.text) });
        current = { start, text: match[2] || "" };
        continue;
      }
    }
    if (current && !/^\d+$/.test(line)) current.text = `${current.text} ${line}`.trim();
  }
  if (current && cleanText(current.text)) starts.push({ ...current, text: cleanText(current.text) });
  return normalize(starts);
}

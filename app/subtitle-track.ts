import { packSubtitles, subtitleLines } from "./subtitle-display.ts";

export type TimedCue = { start: number; duration: number; text: string };
export type TimingEvidence = "source_cue" | "estimated" | "audio_aligned" | "audio_reviewed";
export type SubtitleEvent = TimedCue & { sourceIndices: number[]; timing: TimingEvidence };
export type SubtitleIssue = { event: number; code: string; value?: number };
export type SubtitleAudit = {
  readable: boolean;
  speechVerified: boolean;
  professionalReady: boolean;
  eventCount: number;
  shortPages: number;
  fastPages: number;
  issues: SubtitleIssue[];
};
export type SubtitleTrack = {
  schemaVersion: 1;
  inputKey: string;
  origin: "legacy" | "authored";
  events: SubtitleEvent[];
  audit: SubtitleAudit;
};

const normalise = (text: string) => text.replace(/\s+/gu, " ").trim();
const characterCount = (text: string) => Array.from(normalise(text)).length;

/** Cache invalidator only. Server approval uses SHA-256 independently. */
export function subtitleInputKey(cues: TimedCue[]): string {
  const input=JSON.stringify(cues.map(c=>[Math.round(c.start*1000),Math.round(c.duration*1000),normalise(c.text)]));
  let hash=2166136261;
  for(let i=0;i<input.length;i++)hash=Math.imul(hash^input.charCodeAt(i),16777619);
  return `${cues.length}:${input.length}:${hash>>>0}`;
}

export function displaySubtitleTrack(cues:TimedCue[],candidate?:SubtitleTrack):SubtitleTrack {
  return candidate?.schemaVersion===1&&candidate.inputKey===subtitleInputKey(cues)?candidate:legacySubtitleTrack(cues);
}

/** Checks the actual overlay events. Completeness of a source SRT is a different check. */
export function auditSubtitleEvents(events: SubtitleEvent[]): SubtitleAudit {
  const issues: SubtitleIssue[] = [];
  if (!events.length) issues.push({ event: -1, code: "empty_track" });
  let previousEnd = -Infinity;
  let shortPages = 0;
  let fastPages = 0;
  let speechVerified = events.length > 0;
  events.forEach((event, index) => {
    const duration = event.duration;
    const characters = characterCount(event.text);
    const lines = subtitleLines(normalise(event.text));
    const add = (code: string, value?: number) => issues.push({ event: index, code, ...(value === undefined ? {} : { value }) });
    if (!Number.isFinite(event.start) || event.start < 0) add("invalid_start");
    if (!Number.isFinite(duration) || duration <= 0) add("invalid_duration");
    else {
      if (duration < 0.999) add("under_1s", duration);
      if (duration > 7.001) add("over_7s", duration);
      if (duration < 1.5) shortPages += 1;
      if (characters / duration > 17.05) { add("reading_speed", characters / duration); fastPages += 1; }
    }
    if (event.start < previousEnd - .002) add("overlap", previousEnd - event.start);
    previousEnd = Math.max(previousEnd, event.start + duration);
    if (!characters) add("empty_text");
    if (characters > 84 || lines.length > 2 || lines.some(line => Array.from(line).length > 42)) add("line_layout");
    if (!event.sourceIndices.length || event.sourceIndices.some(value => !Number.isInteger(value) || value < 0)) add("source_mapping");
    if (event.timing !== "audio_aligned" && event.timing !== "audio_reviewed") speechVerified = false;
  });
  const readable = issues.length === 0;
  return { readable, speechVerified, professionalReady: readable && speechVerified, eventCount: events.length, shortPages, fastPages, issues };
}

/** Legacy timing is compiled once and honestly labelled as an estimate, never an audio proof. */
export function legacySubtitleTrack(cues: TimedCue[]): SubtitleTrack {
  const direct:SubtitleEvent[]=cues.map((cue,index)=>({...cue,text:normalise(cue.text),sourceIndices:[index],timing:"source_cue"}));
  const directAudit=auditSubtitleEvents(direct);
  // Already readable authored SRTs must not be resegmented by the fallback packer.
  if(directAudit.readable)return {schemaVersion:1,inputKey:subtitleInputKey(cues),origin:"legacy",events:direct,audit:directAudit};
  const runs:{cues:TimedCue[];offset:number}[]=[];
  cues.forEach((cue,index)=>{const previous=cues[index-1];if(!previous||cue.start>previous.start+previous.duration+.002)runs.push({cues:[cue],offset:index});else runs[runs.length-1].cues.push(cue)});
  const packs=runs.flatMap(run=>packSubtitles(run.cues).packs.map(pack=>({...pack,sourceIndices:pack.sourceIndices.map(index=>index+run.offset)})));
  const events: SubtitleEvent[] = packs.flatMap(pack => {
    const pages = pack.pages.length ? pack.pages : [{ at: pack.start, text: pack.text }];
    return pages.map((page, index) => ({
      start: Number(page.at.toFixed(3)),
      duration: Math.max(0,Number((Number((pages[index + 1]?.at ?? pack.start + pack.duration).toFixed(3))-Number(page.at.toFixed(3))).toFixed(3))),
      text: normalise(page.text),
      sourceIndices: [...pack.sourceIndices],
      timing: (pages.length === 1 ? "source_cue" : "estimated") as TimingEvidence,
    }));
  });
  return { schemaVersion: 1, inputKey:subtitleInputKey(cues), origin: "legacy", events, audit: auditSubtitleEvents(events) };
}

/** Explicit authored events may resegment a translation but must remain tied to source speech windows. */
export function validateAuthoredEvents(value: unknown, source: TimedCue[]): SubtitleTrack {
  if (!Array.isArray(value) || !value.length || value.length > 30_000) throw new Error("Invalid subtitle event list");
  const allowed = new Set<TimingEvidence>(["source_cue", "estimated", "audio_aligned", "audio_reviewed"]);
  const covered = new Set<number>();
  let previousSource = -1;
  const events = value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Invalid event ${index + 1}`);
    const row = item as Record<string, unknown>;
    if (typeof row.text !== "string" || !Array.isArray(row.sourceIndices) || !row.sourceIndices.length) throw new Error(`Missing event mapping ${index + 1}`);
    const indices = row.sourceIndices as number[];
    if (indices.some((n, i) => !Number.isInteger(n) || n < 0 || n >= source.length || (i > 0 && n !== indices[i - 1] + 1))) throw new Error(`Invalid source mapping ${index + 1}`);
    if (indices[0] < previousSource) throw new Error(`Reordered source mapping ${index + 1}`);
    previousSource = indices[0];
    indices.forEach(n => covered.add(n));
    const start = Number(row.start), duration = Number(row.duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid event timing ${index + 1}`);
    const first = source[indices[0]], last = source[indices[indices.length - 1]];
    if (start < first.start - .12 || start + duration > last.start + last.duration + .12) throw new Error(`Event outside source speech window ${index + 1}`);
    const timing = row.timing as TimingEvidence;
    if (!allowed.has(timing)) throw new Error(`Missing timing evidence ${index + 1}`);
    const roundedStart=Number(start.toFixed(3)),roundedEnd=Number((start+duration).toFixed(3));
    return { start:roundedStart, duration:Number((roundedEnd-roundedStart).toFixed(3)), text: normalise(row.text), sourceIndices: [...indices], timing };
  });
  if (covered.size !== source.length) throw new Error("Source coverage is incomplete");
  // Every numeric expression in the approved translation must survive resegmentation.
  const numbers=(text:string)=>text.match(/\d+(?:[.,:/–-]\d+)*\s*%?/gu)?.map(n=>n.replace(/\s/gu,"" )).sort()||[];
  if(JSON.stringify(numbers(source.map(c=>c.text).join(" ")))!==JSON.stringify(numbers(events.map(c=>c.text).join(" "))))throw new Error("Numeric content changed during subtitle authoring");
  return { schemaVersion: 1, inputKey:subtitleInputKey(source), origin: "authored", events, audit: auditSubtitleEvents(events) };
}

/** Time lookup honours out-points and gaps. Track indexes are never shared across languages. */
export function subtitleEventAt(events: TimedCue[], time: number): number {
  if (!Number.isFinite(time)) return -1;
  let lo = 0, hi = events.length - 1, answer = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].start <= time) { answer = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return answer >= 0 && time < events[answer].start + events[answer].duration ? answer : -1;
}

export function subtitleTrackSrt(events: TimedCue[]): string {
  const timestamp = (seconds: number) => {
    const ms = Math.max(0, Math.round(seconds * 1000));
    return `${String(Math.floor(ms / 3600000)).padStart(2,"0")}:${String(Math.floor(ms / 60000) % 60).padStart(2,"0")}:${String(Math.floor(ms / 1000) % 60).padStart(2,"0")},${String(ms % 1000).padStart(3,"0")}`;
  };
  return events.map((event, index) => `${index + 1}\n${timestamp(event.start)} --> ${timestamp(event.start + event.duration)}\n${subtitleLines(normalise(event.text)).join("\n")}\n`).join("\n");
}

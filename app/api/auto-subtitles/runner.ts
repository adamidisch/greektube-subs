import { database } from "@/db/postgres";
import { TRANSCRIPT_VERSION } from "../shared-cache";
import { publishTranscript } from "../transcript-blob";
import type { Sql } from "../published-store";
import { foundationSubtitleJson } from "../captions/word-authoring-provider";
import type { RunState } from "./batched";
import { createRunStore } from "./run-store";
import { runStep as driveStep, startRun as driveStart, type DriveDeps } from "./drive";

const sql: Sql = async (text, params) => await database().query(text, params ?? []) as Record<string, unknown>[];
const store = createRunStore(sql);
const deps: DriveDeps = {
  store,
  call: async (system, input, maxTokens, model) => await foundationSubtitleJson(system, input, { maxTokens, model }),
  publish: async (state, built) => await publishTranscript(state.videoId, TRANSCRIPT_VERSION, { status: "ready", videoId: state.videoId,
    transcriptVersion: TRANSCRIPT_VERSION, title: state.meta.title, channel: state.meta.channel, duration: state.meta.duration, sourceLanguage: "en",
    cues: built.greek, englishCues: built.english, subtitleTrack: built.reviewed }),
};

export const startRun = (videoId: string, kind: RunState["kind"], capture?: unknown) => driveStart(deps, videoId, kind, capture);
export const runStep = (runId: string) => driveStep(deps, runId);
export const monthUsage = () => store.monthUsage();

export async function runSummary(videoId: string, kind?: RunState["kind"]) {
  const latest = await store.latest(videoId, kind);
  if (!latest) return null;
  const { scopes, brief, ...rest } = latest.state;
  void brief;
  return { ...rest, scopes: { total: scopes?.length ?? 0, ready: scopes?.filter(s => s.status === "ready").length ?? 0,
    flagged: scopes?.filter(s => s.status === "flagged").length ?? 0, pending: scopes?.filter(s => s.status === "pending").length ?? 0 },
    // Owner-only diagnostics: the Greek texts of scopes that did not pass, so the failing slots can be inspected.
    flaggedTexts: scopes?.filter(s => s.status === "flagged" && s.texts).map(s => ({ id: s.id, issue: s.issue, texts: s.texts })) ?? [],
    ...(latest.state.kind === "sample" ? { sampleEvents: scopes?.flatMap(s => s.result?.events.map(e => ({ start: e.start, duration: e.duration, text: e.text })) ?? []) } : {}) };
}

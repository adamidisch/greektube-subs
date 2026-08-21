import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { splitSubtitleSentences } from "../captions/sentence-split";
import { stripEnglishSpeechFillers } from "../captions/translation-text";
import { allocateSequentialCueWindows, effectiveSequentialRawWindows, timingInversionCount } from "../captions/timing";
import { isOwnerChatgptVideo } from "../captions/owner-mode";
import {
  TRANSCRIPT_VERSION,
  acquireProcessingLock,
  getTranscript,
  releaseProcessingLock,
  saveProcessingCheckpoint,
  type CachedCue,
} from "../shared-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_ID = "fX2z-BF8Jac";
const EXPECTED_RAW_COUNT = 2868;
const EXPECTED_NORMALIZED_COUNT = 3086;

type Cue = { start: number; duration: number; text: string };

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function englishWordTokens(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
}

function splitEnglishCueAtSentenceBoundaries(cue: Cue) {
  const text = normalizeText(cue.text);
  if (!text) return [] as Cue[];
  const parts = splitSubtitleSentences(text);
  if (parts.length <= 1) return [{ ...cue, text: parts[0] || text }];
  const timing = allocateSequentialCueWindows(cue, parts.map(part => Math.max(1, englishWordTokens(part).length)));
  return parts.map((part, index) => ({ ...cue, ...timing[index], text: part }));
}

function canonicalize(rawCues: CachedCue[]) {
  const raw = effectiveSequentialRawWindows(
    rawCues
      .map(cue => ({ ...cue, text: normalizeText(cue.text) }))
      .filter(cue => cue.text.length > 0),
  );
  return raw.flatMap(cue =>
    splitEnglishCueAtSentenceBoundaries({ ...cue, text: stripEnglishSpeechFillers(cue.text) }),
  );
}

function hashCues(cues: Cue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) {
    hash.update(`${cue.start.toFixed(3)}|${cue.duration.toFixed(3)}|${normalizeText(cue.text)}\n`);
  }
  return hash.digest("hex");
}

export async function GET(request: Request) {
  if (!await isOwnerChatgptVideo(VIDEO_ID)) {
    return NextResponse.json({ error: "Natasha is not in owner ChatGPT mode" }, { status: 409 });
  }
  const record = await getTranscript(VIDEO_ID);
  if (!record || record.transcriptVersion !== TRANSCRIPT_VERSION) {
    return NextResponse.json({ error: "Natasha transcript state unavailable" }, { status: 404 });
  }
  if (record.rawEnglishTranscript.length !== EXPECTED_RAW_COUNT) {
    return NextResponse.json({ error: "Unexpected raw cue count", rawEnglishCount: record.rawEnglishTranscript.length }, { status: 409 });
  }

  const normalized = canonicalize(record.rawEnglishTranscript);
  const inversions = timingInversionCount(normalized);
  const hash = hashCues(normalized);
  const commit = new URL(request.url).searchParams.get("commit") === "1";

  if (!commit) {
    return NextResponse.json({
      videoId: VIDEO_ID,
      dryRun: true,
      rawEnglishCount: record.rawEnglishTranscript.length,
      normalizedCount: normalized.length,
      expectedNormalizedCount: EXPECTED_NORMALIZED_COUNT,
      sourceHash: hash,
      timingInversions: inversions,
      wouldCommit: normalized.length === EXPECTED_NORMALIZED_COUNT && inversions === 0,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (normalized.length !== EXPECTED_NORMALIZED_COUNT || inversions !== 0) {
    return NextResponse.json({
      error: "Deterministic normalization did not match the verified structure",
      normalizedCount: normalized.length,
      expectedNormalizedCount: EXPECTED_NORMALIZED_COUNT,
      sourceHash: hash,
      timingInversions: inversions,
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const token = crypto.randomUUID();
  if (!await acquireProcessingLock(VIDEO_ID, token, false)) {
    return NextResponse.json({ error: "Natasha processing lock busy" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const saved = await saveProcessingCheckpoint(VIDEO_ID, token, {
      stage: "translate",
      cursor: 0,
      progress: 48,
      englishTranscript: normalized,
      greekTranscript: [],
    });
    if (!saved) throw new Error("Failed to persist deterministic owner checkpoint");
    if (!await releaseProcessingLock(VIDEO_ID, token)) throw new Error("Failed to release owner normalization lock");
    return NextResponse.json({
      videoId: VIDEO_ID,
      committed: true,
      rawEnglishCount: record.rawEnglishTranscript.length,
      englishCount: normalized.length,
      greekCount: 0,
      processingStage: "translate",
      sourceHash: hash,
      timingInversions: inversions,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await releaseProcessingLock(VIDEO_ID, token).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Owner normalization failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

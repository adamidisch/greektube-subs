import { createHash } from "crypto";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getTranscript, TRANSCRIPT_VERSION, type CachedCue } from "../shared-cache";

export const dynamic = "force-dynamic";

const VIDEO_ID = "fX2z-BF8Jac";
const PAGE_SIZE = 400;

type Cue = { start: number; duration: number; text: string };

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function hashCues(cues: Cue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) {
    hash.update(`${Number(cue.start).toFixed(3)}|${Number(cue.duration).toFixed(3)}|${normalizeText(cue.text)}\n`);
  }
  return hash.digest("hex");
}

async function readJson(path: string) {
  const blob = await get(path, { access: "public" });
  if (!blob?.stream) return null;
  return await new Response(blob.stream).json() as unknown;
}

function cuesFrom(value: unknown, key: "englishCues" | "englishTranscript") {
  if (!value || typeof value !== "object") return [] as Cue[];
  const rows = (value as Record<string, unknown>)[key];
  if (!Array.isArray(rows)) return [] as Cue[];
  return rows.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const cue = item as Record<string, unknown>;
    const start = Number(cue.start);
    const duration = Number(cue.duration);
    const text = normalizeText(cue.text);
    return Number.isFinite(start) && Number.isFinite(duration) && text ? [{ start, duration, text }] : [];
  });
}

async function artifactCues(source: string) {
  if (source === "published") {
    const value = await readJson(`transcripts/v${TRANSCRIPT_VERSION}/english/${VIDEO_ID}.json`).catch(() => null);
    return cuesFrom(value, "englishCues");
  }
  if (source === "legacy") {
    const value = await readJson(`transcripts/v${TRANSCRIPT_VERSION}/${VIDEO_ID}.json`).catch(() => null);
    return cuesFrom(value, "englishCues");
  }
  if (source === "checkpoint-direct") {
    const value = await readJson(`transcripts/v${TRANSCRIPT_VERSION}/checkpoints/${VIDEO_ID}.json`).catch(() => null);
    return cuesFrom(value, "englishTranscript");
  }
  const record = await getTranscript(VIDEO_ID).catch(() => null);
  return (record?.englishTranscript || []) as CachedCue[];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "current";

  if (url.searchParams.get("audit") === "1") {
    const [current, checkpointDirect, published, legacy] = await Promise.all([
      artifactCues("current"),
      artifactCues("checkpoint-direct"),
      artifactCues("published"),
      artifactCues("legacy"),
    ]);
    const summary = (cues: Cue[]) => ({ count: cues.length, hash: cues.length ? hashCues(cues) : null });
    return NextResponse.json({
      videoId: VIDEO_ID,
      transcriptVersion: TRANSCRIPT_VERSION,
      current: summary(current),
      checkpointDirect: summary(checkpointDirect),
      published: summary(published),
      legacy: summary(legacy),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const cues = await artifactCues(source);
  if (!cues.length) {
    return NextResponse.json({ error: "Canonical English transcript unavailable", source }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const page = Math.max(0, Math.min(7, Number(url.searchParams.get("page") || 0) || 0));
  const start = page * PAGE_SIZE;
  const pageCues = cues.slice(start, start + PAGE_SIZE).map((cue, offset) => ({
    index: start + offset + 1,
    start: cue.start,
    duration: cue.duration,
    text: cue.text,
  }));
  return NextResponse.json({
    videoId: VIDEO_ID,
    transcriptVersion: TRANSCRIPT_VERSION,
    source,
    totalCues: cues.length,
    sourceHash: hashCues(cues),
    page,
    startIndex: start + 1,
    endIndex: start + pageCues.length,
    cues: pageCues,
  }, { headers: { "Cache-Control": "no-store" } });
}

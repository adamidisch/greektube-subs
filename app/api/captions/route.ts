import { NextResponse } from "next/server";
import { GET as semanticGET, POST as semanticPOST } from "./semantic-route";
import { getTranscript, getTranscriptStatus, TRANSCRIPT_VERSION } from "../shared-cache";
import { isOwnerChatgptVideo } from "./owner-mode";
import { WQCO_REVIEW_VIDEO_ID, WQCO_REVIEW_V3_CUES, WQCO_REVIEW_V3_QUALITY } from "./wqco-review-v3";

type TranslationRequestBody = {
  url?: unknown;
  force?: unknown;
};

function extractVideoId(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{6,20}$/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/")[1] || null;
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

function clonePostRequest(request: Request, rawBody: string) {
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });
}

function baseStage(stage: string | null | undefined) {
  const value = stage || "source";
  return value.endsWith("_google") ? value.slice(0, -7) : value;
}

function ownerStatusPayload(record: Awaited<ReturnType<typeof getTranscriptStatus>>) {
  if (!record) return { status: "processing", progress: 3, stage: "source", cursor: 0, totalCues: 0, transcriptVersion: TRANSCRIPT_VERSION };
  const stage = baseStage(record.rawEnglishCount && (record.processingStage || "source") === "source" ? "repair" : record.processingStage);
  const totalCues = stage === "repair" ? record.rawEnglishCount : stage === "source_el_finalize" ? record.greekCount : record.englishCount;
  const cursor = Math.max(0, Math.min(record.processingCursor || 0, totalCues));
  const completed = stage === "finalize" || stage === "source_el_finalize" ? totalCues : cursor;
  let progress = record.progress;
  if (stage === "repair" && totalCues) progress = 28 + 20 * (completed / totalCues);
  if (stage === "translate" && totalCues) progress = 48 + 42 * (completed / totalCues);
  return {
    status: "processing",
    progress: Math.round(progress * 10) / 10,
    videoId: record.videoId,
    stage,
    cursor,
    totalCues,
    currentCue: totalCues ? (stage === "finalize" || stage === "source_el_finalize" ? totalCues : Math.min(totalCues, cursor + 1)) : 0,
    retryCount: record.retryCount,
    retryAfter: record.retryAfter || null,
    transcriptVersion: TRANSCRIPT_VERSION,
  };
}

function isPreviewReviewVideo(videoId: string | null) {
  return process.env.VERCEL_ENV === "preview" && videoId === WQCO_REVIEW_VIDEO_ID;
}

function reviewHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-GreekTube-Subtitle-Review": "wqco-v3",
    "X-GreekTube-Translation-Mode": "review-v3",
  };
}

async function reviewPayload(videoId: string) {
  const record = await getTranscript(videoId);
  if (!record) return null;
  return {
    status: "ready",
    progress: 100,
    videoId,
    title: record.title,
    originalTitle: record.title,
    channel: record.channel,
    duration: record.duration,
    sourceLanguage: record.originalLanguage || "en",
    cues: WQCO_REVIEW_V3_CUES,
    englishCues: record.englishTranscript,
    keyPoints: record.keyPoints,
    topics: record.topics,
    transcriptVersion: record.transcriptVersion,
    translationMode: "review-v3",
    translationMethod: "manual_semantic_timing_v3",
    reviewRevision: "wqco-v3",
    reviewQuality: WQCO_REVIEW_V3_QUALITY,
    cached: true,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const candidate = url.searchParams.get("videoId") || url.searchParams.get("video") || url.searchParams.get("id") || url.searchParams.get("url") || "";
  const videoId = extractVideoId(candidate);
  if (isPreviewReviewVideo(videoId)) {
    const payload = await reviewPayload(videoId!);
    if (payload) return NextResponse.json(payload, { headers: reviewHeaders() });
  }
  return semanticGET(request);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let body: TranslationRequestBody;
  try {
    body = JSON.parse(rawBody) as TranslationRequestBody;
  } catch {
    return semanticPOST(clonePostRequest(request, rawBody));
  }

  if (typeof body.url === "string") {
    const videoId = extractVideoId(body.url);

    // Preview review must never start or mutate the production translation pipeline.
    if (isPreviewReviewVideo(videoId)) {
      const payload = await reviewPayload(videoId!);
      if (payload) return NextResponse.json(payload, { headers: reviewHeaders() });
    }

    if (videoId && await isOwnerChatgptVideo(videoId)) {
      const status = await getTranscriptStatus(videoId);
      const ownerHeaders = { "Cache-Control": "no-store", "X-GreekTube-Translation-Mode": "owner-chatgpt" };
      if (status?.status === "processing") {
        return NextResponse.json(ownerStatusPayload(status), { status: 202, headers: { ...ownerHeaders, "Retry-After": "60" } });
      }
      if (status?.status === "ready") {
        const record = await getTranscript(videoId);
        if (!record) return NextResponse.json({ error: "Owner transcript unavailable." }, { status: 409, headers: ownerHeaders });
        return NextResponse.json({
          status: "ready", progress: 100, videoId, title: record.title, channel: record.channel, duration: record.duration,
          sourceLanguage: record.originalLanguage || "en", cues: record.greekTranscript, englishCues: record.englishTranscript,
          keyPoints: record.keyPoints, topics: record.topics, transcriptVersion: record.transcriptVersion,
          translationMode: "owner-chatgpt", translationMethod: "manual_chatgpt_pro_v1", cached: true,
        }, { headers: ownerHeaders });
      }
      if (status?.status === "failed") {
        return NextResponse.json({ status: "failed", progress: status.progress, videoId, error: "Owner-managed transcript is locked and requires admin action." }, { status: 409, headers: ownerHeaders });
      }
      return NextResponse.json({ status: "owner_locked", progress: 0, videoId, error: "Owner-managed transcript is locked and requires admin action." }, { status: 409, headers: ownerHeaders });
    }
  }

  return semanticPOST(clonePostRequest(request, rawBody));
}
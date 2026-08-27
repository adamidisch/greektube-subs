import type { Metadata } from "next";
import { database } from "@/db/postgres";
import NavigationAwareGreekTubePlayer from "./NavigationAwareGreekTubePlayer";
import GreekTubePlayer from "./GreekTubePlayer";
import TranscriptPerformanceEnhancer from "./TranscriptPerformanceEnhancer";
import CueEditEnhancer from "./CueEditEnhancer";
import ThemeToggleEnhancer from "./ThemeToggleEnhancer";
import NavigationUXEnhancer from "./NavigationUXEnhancer";
import VersionAboutSystem from "./VersionAboutSystem";
import LogoPreferenceSystem from "./LogoPreferenceSystem";
import PlayerUIAuditEnhancer from "./PlayerUIAuditEnhancer";
import MobileUXFixesEnhancer from "./MobileUXFixesEnhancer";
import VideoEditorDemoEnhancer from "./VideoEditorDemoEnhancer";
import SkipRangeTransferEnhancer from "./SkipRangeTransferEnhancer";
import NextVideosEnhancer from "./NextVideosEnhancer";
import AnalyticsEnhancer from "./AnalyticsEnhancer";
import EditorProductionPolishEnhancer from "./EditorProductionPolishEnhancer";
import GtsFooter from "./GtsFooter";
import {
  ALIGNMENT_PROOF_QUERY_VALUE,
  ALIGNMENT_PROOF_VIDEO_ID,
  ALIGNMENT_V81_PROOF_QUERY_VALUE,
} from "./alignment-proof";

const SITE_URL = "https://greektubesubs.com";
const BRAND_REV = "7820";
const SHARED_LIBRARY_KEY = "greektube-shared-library-v1";

type SharedVideo = {
  id?: unknown;
  title?: unknown;
};

async function getSharedVideo(videoId: string): Promise<SharedVideo | null> {
  try {
    const db = database();
    const rows = await db.query(
      "SELECT value FROM app_state WHERE key = $1 LIMIT 1",
      [SHARED_LIBRARY_KEY],
    ) as { value: string }[];
    if (!rows[0]) return null;
    const parsed = JSON.parse(rows[0].value) as { videos?: SharedVideo[] };
    return parsed.videos?.find(video => String(video.id || "") === videoId) || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const rawVideo = Array.isArray(params.video) ? params.video[0] : params.video;
  const videoId = String(rawVideo || "").trim();
  const rawProof = Array.isArray(params.proof) ? params.proof[0] : params.proof;

  if (videoId === ALIGNMENT_PROOF_VIDEO_ID
    && [ALIGNMENT_PROOF_QUERY_VALUE, ALIGNMENT_V81_PROOF_QUERY_VALUE].includes(String(rawProof || ""))) {
    const proofVersion = rawProof === ALIGNMENT_V81_PROOF_QUERY_VALUE ? "v8.1" : "v8";
    return {
      title: `Δοκιμή συγχρονισμού ${proofVersion} · GreekTube Subs`,
      description: `Πραγματικό video με το semantic alignment ${proofVersion} των ελληνικών υποτίτλων.`,
      robots: { index: false, follow: false },
    };
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return {};

  const record = await getSharedVideo(videoId);
  const videoTitle = typeof record?.title === "string" && record.title.trim()
    ? record.title.trim()
    : "Βίντεο με ελληνικούς υπότιτλους";

  const shareUrl = new URL(SITE_URL);
  shareUrl.searchParams.set("video", videoId);
  for (const key of ["t", "speed"] as const) {
    const value = Array.isArray(params[key]) ? params[key]?.[0] : params[key];
    if (value) shareUrl.searchParams.set(key, value);
  }

  const shareImage = new URL("/api/share-card", SITE_URL);
  shareImage.searchParams.set("video", videoId);
  shareImage.searchParams.set("title", videoTitle);
  shareImage.searchParams.set("v", BRAND_REV);

  const description = "Δες το με ελληνικούς υπότιτλους στο GreekTube Subs · greektubesubs.com";

  return {
    title: `${videoTitle} · GreekTube Subs`,
    description,
    alternates: { canonical: shareUrl.toString() },
    openGraph: {
      type: "website",
      url: shareUrl.toString(),
      siteName: "GreekTube Subs",
      title: videoTitle,
      description,
      images: [{
        url: shareImage.toString(),
        width: 1200,
        height: 630,
        alt: `${videoTitle} · GreekTube Subs`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: videoTitle,
      description,
      images: [shareImage.toString()],
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawVideo = Array.isArray(params.video) ? params.video[0] : params.video;
  const rawProof = Array.isArray(params.proof) ? params.proof[0] : params.proof;
  const proofMode = rawVideo === ALIGNMENT_PROOF_VIDEO_ID
    && [ALIGNMENT_PROOF_QUERY_VALUE, ALIGNMENT_V81_PROOF_QUERY_VALUE].includes(String(rawProof || ""));

  if (proofMode) {
    return (
      <>
        <GreekTubePlayer />
        <GtsFooter />
      </>
    );
  }

  return (
    <>
      <NavigationAwareGreekTubePlayer />
      <TranscriptPerformanceEnhancer />
      <CueEditEnhancer />
      <ThemeToggleEnhancer />
      <NavigationUXEnhancer />
      <VersionAboutSystem />
      <LogoPreferenceSystem />
      <PlayerUIAuditEnhancer />
      <MobileUXFixesEnhancer />
      <VideoEditorDemoEnhancer />
      <SkipRangeTransferEnhancer />
      <NextVideosEnhancer />
      <AnalyticsEnhancer />
      <EditorProductionPolishEnhancer />
      <GtsFooter />
    </>
  );
}

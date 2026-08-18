import type { Metadata } from "next";
import { database } from "@/db/postgres";
import GreekTubePlayer from "./GreekTubePlayer";
import TranscriptPerformanceEnhancer from "./TranscriptPerformanceEnhancer";
import CueEditEnhancer from "./CueEditEnhancer";
import SkipRangesEnhancer from "./SkipRangesEnhancer";
import ThemeToggleEnhancer from "./ThemeToggleEnhancer";
import NavigationUXEnhancer from "./NavigationUXEnhancer";
import VersionAboutSystem from "./VersionAboutSystem";
import LogoPreferenceSystem from "./LogoPreferenceSystem";
import PlayerUIAuditEnhancer from "./PlayerUIAuditEnhancer";
import MobileUXFixesEnhancer from "./MobileUXFixesEnhancer";
import VideoEditorDemoEnhancer from "./VideoEditorDemoEnhancer";
import DemoSkipPlaybackEnhancer from "./DemoSkipPlaybackEnhancer";
import SimpleFooterEnhancer from "./SimpleFooterEnhancer";
import NextVideosEnhancer from "./NextVideosEnhancer";

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

export default function Home() {
  return (
    <>
      <GreekTubePlayer />
      <TranscriptPerformanceEnhancer />
      <CueEditEnhancer />
      <SkipRangesEnhancer />
      <ThemeToggleEnhancer />
      <NavigationUXEnhancer />
      <VersionAboutSystem />
      <LogoPreferenceSystem />
      <PlayerUIAuditEnhancer />
      <MobileUXFixesEnhancer />
      <VideoEditorDemoEnhancer />
      <DemoSkipPlaybackEnhancer />
      <SimpleFooterEnhancer />
      <NextVideosEnhancer />
    </>
  );
}

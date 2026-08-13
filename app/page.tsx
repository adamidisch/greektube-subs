import type { Metadata } from "next";
import { database } from "@/db/postgres";
import GreekTubePlayer from "./GreekTubePlayer";
import CueEditEnhancer from "./CueEditEnhancer";
import PlayerUXEnhancer from "./PlayerUXEnhancer";
import FullscreenExitEnhancer from "./FullscreenExitEnhancer";
import PlayerInteractionEnhancer from "./PlayerInteractionEnhancer";
import SkipRangesEnhancer from "./SkipRangesEnhancer";

const SITE_URL = "https://greektubesubs.com";
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

  const image = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
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
      images: [{ url: image, width: 480, height: 360, alt: videoTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: videoTitle,
      description,
      images: [image],
    },
  };
}

export default function Home() {
  return (
    <>
      <GreekTubePlayer />
      <CueEditEnhancer />
      <PlayerUXEnhancer />
      <FullscreenExitEnhancer />
      <PlayerInteractionEnhancer />
      <SkipRangesEnhancer />
    </>
  );
}

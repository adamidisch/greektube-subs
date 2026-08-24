import type { Metadata } from "next";
import { database } from "@/db/postgres";
import NavigationAwareGreekTubePlayer from "./NavigationAwareGreekTubePlayer";
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

const SITE_URL = "https://greektubesubs.com";
const BRAND_REV = "7820";
const SHARED_LIBRARY_KEY = "greektube-shared-library-v1";

const REVIEW_VIDEOS = {
  WQCO8wlldAQ: {
    id: "WQCO8wlldAQ",
    url: "https://www.youtube.com/watch?v=WQCO8wlldAQ",
    title: "Δίαιτα Αποκλεισμού 2 Εβδομάδων: Τι να Τρώτε και Πώς να Επανεισάγετε Τροφές",
    originalTitle: "Follow This 2 WEEK PROTOCOL to Reduce Inflammation & HEAL THE BODY | Dr. Elizabeth Bright",
    channel: "Jesse Chappus",
    channelUrl: "",
    originalVideoUrl: "https://www.youtube.com/watch?v=WQCO8wlldAQ",
    category: "Medical",
    tags: ["υγεία", "διατροφή", "elimination diet"],
    notes: "",
    description: "Πρωτόκολλο αποκλεισμού δύο εβδομάδων, επανεισαγωγή τροφών και εξατομίκευση με βάση την απόκριση του οργανισμού.",
    duration: 550,
    addedAt: "2026-08-23T15:17:00.000Z",
    favorite: false,
    lastPosition: 0,
    progress: 0,
    speakerName: "Dr. Elizabeth Bright",
    speakerRole: "Ιατρός",
    metadataVersion: 6,
    translationMode: "manual-pro",
  },
  zc8Nh4TMB1s: {
    id: "zc8Nh4TMB1s",
    url: "https://www.youtube.com/watch?v=zc8Nh4TMB1s",
    title: "Λιπώδες Ήπαρ: Η Κρυφή Ζάχαρη που Επιβαρύνει το Συκώτι",
    originalTitle: "Fatty Liver Expert: Your Liver Is Filling With Fat Right Now - Dr David Unwin",
    channel: "The Diary Of A CEO",
    channelUrl: "",
    originalVideoUrl: "https://www.youtube.com/watch?v=zc8Nh4TMB1s",
    category: "Medical",
    tags: ["υγεία", "διαβήτης", "λιπώδες ήπαρ", "διατροφή"],
    notes: "",
    description: "Ο Dr. David Unwin εξηγεί το λιπώδες ήπαρ, την ινσουλινοαντίσταση, τον διαβήτη τύπου 2 και πώς οι καθημερινές διατροφικές επιλογές επηρεάζουν τη μεταβολική υγεία.",
    duration: 7885,
    addedAt: "2026-08-24T12:00:00.000Z",
    favorite: false,
    lastPosition: 0,
    progress: 0,
    speakerName: "Dr. David Unwin",
    speakerRole: "Ιατρός",
    metadataVersion: 6,
    translationMode: "manual-pro",
  },
} as const;

type ReviewVideo = (typeof REVIEW_VIDEOS)[keyof typeof REVIEW_VIDEOS];

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

  const reviewRecord = REVIEW_VIDEOS[videoId as keyof typeof REVIEW_VIDEOS];
  const record = reviewRecord || await getSharedVideo(videoId);
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

function ReviewVideoBootstrap({ video }: { video: ReviewVideo }) {
  const payload = JSON.stringify(video).replace(/</g, "\\u003c");
  const script = `(()=>{try{const key="greektube-personal-state:v1";const video=${payload};let state={videos:[],moments:[],settings:{}};try{const parsed=JSON.parse(localStorage.getItem(key)||"null");if(parsed&&typeof parsed==="object")state=parsed;}catch{}if(!Array.isArray(state.videos))state.videos=[];const index=state.videos.findIndex(item=>item&&item.id===video.id);if(index>=0)state.videos[index]={...state.videos[index],...video};else state.videos.unshift(video);if(!Array.isArray(state.moments))state.moments=[];if(!state.settings||typeof state.settings!=="object")state.settings={};localStorage.setItem(key,JSON.stringify(state));}catch{}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawVideo = Array.isArray(params.video) ? params.video[0] : params.video;
  const requestedId = String(rawVideo || "").trim();
  const reviewVideo = REVIEW_VIDEOS[requestedId as keyof typeof REVIEW_VIDEOS];

  return (
    <>
      {reviewVideo ? <ReviewVideoBootstrap video={reviewVideo} /> : null}
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

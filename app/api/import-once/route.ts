import { NextResponse } from "next/server";
import { database } from "@/db/postgres";
import { publishTranscript } from "../transcript-blob";
import { getTranscript, TRANSCRIPT_VERSION } from "../shared-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VIDEO_ID = "n1G3xqgzB2c";
const SHARED_LIBRARY_KEY = "greektube-shared-library-v1";
const TITLE = "Η αναστροφή της γήρανσης, η AI και το μέλλον της Αμερικής";
const ORIGINAL_TITLE = "The REAL Reason Scientists Can Now Reverse Aging";

export async function GET() {
  try {
    const transcript = await getTranscript(VIDEO_ID);
    if (!transcript || transcript.status !== "ready" || transcript.greekTranscript.length !== 174) {
      return NextResponse.json({ error: "Clean transcript is not ready." }, { status: 409 });
    }
    if (transcript.greekTranscript.some(cue => /ZXQ/i.test(cue.text))) {
      return NextResponse.json({ error: "Technical subtitle marker detected." }, { status: 409 });
    }

    const payload = {
      status: "ready",
      progress: 100,
      videoId: VIDEO_ID,
      title: TITLE,
      originalTitle: ORIGINAL_TITLE,
      channel: transcript.channel,
      duration: transcript.duration,
      sourceLanguage: transcript.originalLanguage || "en",
      cues: transcript.greekTranscript,
      englishCues: transcript.englishTranscript,
      topics: transcript.topics,
      keyPoints: transcript.keyPoints,
      transcriptVersion: TRANSCRIPT_VERSION,
      cached: true,
    };
    if (!await publishTranscript(VIDEO_ID, TRANSCRIPT_VERSION, payload)) {
      return NextResponse.json({ error: "Transcript publish failed." }, { status: 500 });
    }

    const db = database();
    const rows = await db.query(
      "SELECT value FROM app_state WHERE key = $1 LIMIT 1",
      [SHARED_LIBRARY_KEY],
    ) as { value: string }[];
    const current = rows[0]?.value ? JSON.parse(rows[0].value) as { videos?: Record<string, unknown>[] } : { videos: [] };
    const videos = Array.isArray(current.videos) ? current.videos : [];
    const newVideo = {
      id: VIDEO_ID,
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      title: TITLE,
      originalTitle: ORIGINAL_TITLE,
      channel: transcript.channel || "The Diary Of A CEO Clips",
      channelUrl: "https://www.youtube.com/@TheDiaryOfACEOClips",
      originalVideoUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      category: "Medical",
      tags: ["γήρανση", "επιγενετική", "AI", "μακροζωία"],
      notes: "",
      description: "Συζήτηση για την επιγενετική επαναπρογραμματισμού και τη γήρανση, τον ρόλο της AI στις βιοεπιστήμες και στη συνέχεια για οικονομία, συντάξεις και γεωπολιτική.",
      duration: transcript.duration,
      addedAt: "2026-09-02T16:56:00.000Z",
      favorite: false,
      lastPosition: 0,
      progress: 0,
      metadataVersion: 6,
      translationMode: "manual-source-google-per-cue",
      thumbnail: `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`,
      views: 0,
    };
    const nextVideos = [newVideo, ...videos.filter(video => String(video.id || "") !== VIDEO_ID)];
    const now = new Date().toISOString();
    const value = JSON.stringify({ videos: nextVideos });
    await db.query(
      `INSERT INTO app_state (key, value, created_at, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [SHARED_LIBRARY_KEY, value, now, now],
    );

    return NextResponse.json({
      status: "ready",
      videoId: VIDEO_ID,
      title: TITLE,
      cueCount: transcript.greekTranscript.length,
      libraryCount: nextVideos.length,
      librarySaved: true,
      published: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Library sync failed." }, { status: 500 });
  }
}

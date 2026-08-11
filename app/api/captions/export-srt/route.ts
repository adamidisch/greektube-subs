import { NextResponse } from "next/server";
import { getTranscript, TRANSCRIPT_VERSION } from "../../shared-cache";
import { fetchSupadataTranscript } from "../../supadata";

// Read-only export for the PRO translation workflow. This route never writes
// to video_transcripts, never acquires a processing lock, and never calls a
// translation engine — it only formats an already-known English transcript
// (or, for a video with no cached transcript yet, a fresh source-only fetch)
// as a standard .srt file with stable cue numbers and untouched timestamps.

function extractVideoId(value: string) {
  const trimmed = value.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/")[1] || null;
    if (host.endsWith("youtube.com")) return url.searchParams.get("v");
    return null;
  } catch {
    return null;
  }
}

function pad(value: number, size = 2) {
  return String(Math.trunc(value)).padStart(size, "0");
}

function srtTimestamp(seconds: number) {
  const totalMillis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMillis / 3_600_000);
  const minutes = Math.floor((totalMillis % 3_600_000) / 60_000);
  const secs = Math.floor((totalMillis % 60_000) / 1000);
  const millis = totalMillis % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

function toSrt(cues: { start: number; duration: number; text: string }[]) {
  return cues
    .map((cue, index) => {
      const start = srtTimestamp(cue.start);
      const end = srtTimestamp(cue.start + cue.duration);
      return `${index + 1}\n${start} --> ${end}\n${cue.text.replace(/\s+/g, " ").trim()}`;
    })
    .join("\n\n") + "\n";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("videoId") || url.searchParams.get("url") || "";
    const videoId = extractVideoId(raw);
    if (!videoId) {
      return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });
    }

    const cached = await getTranscript(videoId).catch(() => null);
    let cues = (cached && cached.transcriptVersion === TRANSCRIPT_VERSION
      ? (cached.englishTranscript?.length ? cached.englishTranscript : cached.rawEnglishTranscript)
      : null) || [];

    if (!cues.length) {
      // No cached transcript yet (brand-new video): fetch the English
      // source directly. This never touches video_transcripts or the
      // processing lock — it is a plain read for export purposes only.
      const source = await fetchSupadataTranscript(videoId).catch(() => null);
      if (source?.cues.length) cues = source.cues;
    }

    if (!cues.length) {
      return NextResponse.json(
        { error: "Το αγγλικό transcript δεν είναι ακόμα διαθέσιμο για αυτό το βίντεο." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = toSrt(cues);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-subrip; charset=utf-8",
        "Content-Disposition": `attachment; filename="${videoId}-english.srt"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Η λήψη του αγγλικού transcript απέτυχε." }, { status: 500 });
  }
}

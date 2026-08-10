from pathlib import Path

p=Path('app/api/captions/route.ts')
s=p.read_text()

insert_after='''async function fetchCaptionCues(track: CaptionTrack, userAgent: string, targetLanguage?: string) {
'''
# Insert helper after the full fetchCaptionCues function, immediately before createMeaningUnits.
marker='''\nfunction createMeaningUnits(cues: CaptionCue[]) {'''
if marker not in s:
    raise SystemExit('createMeaningUnits marker missing')
helper=r'''

async function fetchDirectNativeEnglish(videoId: string) {
  const players = await fetchPlayers(videoId);
  const failures: string[] = [];
  for (const candidate of players) {
    const tracks = orderedTracks(
      candidate.player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
    ).filter(track => {
      const language = track.languageCode?.toLowerCase() || "";
      return language === "en" || language.startsWith("en-");
    });
    for (const track of tracks) {
      if (!track.baseUrl) continue;
      try {
        const cues = await fetchCaptionCues(track, candidate.userAgent);
        if (!cues.length) continue;
        return {
          cues,
          player: candidate.player,
          track,
          userAgent: candidate.userAgent,
        };
      } catch (error) {
        failures.push(`${candidate.clientName}/${track.languageCode || "en"}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  }
  throw new Error(failures.join(" · ") || "Direct YouTube English captions unavailable");
}
'''
s=s.replace(marker,helper+marker,1)

needle='''    await updateProcessingProgress(videoId, lockToken, 12);\n\n    // Prefer Supadata for native YouTube transcripts.'''
if needle not in s:
    raise SystemExit('POST source-priority insertion point missing')
block=r'''    await updateProcessingProgress(videoId, lockToken, 12);

    // First choice: the actual native English timed-text track from YouTube.
    // This is the closest source to what the viewer sees in YouTube's own
    // transcript UI, including punctuation and sentence boundaries. Supadata is
    // retained as a resilience fallback for Vercel environments where YouTube
    // challenges the request.
    try {
      const direct = await fetchDirectNativeEnglish(videoId);
      await updateProcessingProgress(videoId, lockToken, 28);
      const sourceCues = createMeaningUnits(direct.cues);
      if (!sourceCues.length) throw new Error("Direct YouTube English transcript was empty");

      await updateProcessingProgress(videoId, lockToken, 48);
      const cues = await translateCuesToGreek(
        sourceCues,
        progress => updateProcessingProgress(videoId, lockToken as string, progress),
      );
      const duration = direct.cues.reduce(
        (max, cue) => Math.max(max, cue.start + cue.duration),
        0,
      );
      validateCompleteGreekTranscript(cues, duration);
      await updateProcessingProgress(videoId, lockToken, 88);

      const metadata = await fetchYouTubeOEmbed(videoId);
      const originalTitle = metadata.title || direct.player.videoDetails?.title || cached?.title || "YouTube video";
      const channel = metadata.authorName || direct.player.videoDetails?.author || cached?.channel || "YouTube";
      const translatedTitle = await translateTitleToGreek(originalTitle);
      const speaker = speakerProfile(videoId, direct.player.videoDetails?.shortDescription || "", channel);
      const points = keyPoints(cues);
      const topics = [...new Set(points.flatMap(point => point.toLowerCase().match(/[\\p{L}]{6,}/gu) || []))].slice(0, 6);
      const now = new Date().toISOString();
      await updateProcessingProgress(videoId, lockToken, 96);

      await completeTranscript({
        videoId,
        title: originalTitle,
        channel,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration,
        originalLanguage: direct.track.languageCode?.toLowerCase() || "en",
        englishTranscript: sourceCues,
        greekTranscript: cues,
        timestamps: cues.map(cue => ({ start: cue.start, duration: cue.duration })),
        topics,
        keyPoints: points,
        status: "ready",
        progress: 100,
        transcriptVersion: TRANSCRIPT_VERSION,
        createdAt: cached?.createdAt || now,
        updatedAt: now,
      }, lockToken);

      lockToken = null;
      return NextResponse.json({
        status: "ready",
        videoId,
        title: translatedTitle,
        originalTitle,
        channel,
        duration,
        sourceLanguage: direct.track.languageCode?.toLowerCase() || "en",
        sourceType: "youtube_native_direct",
        translationMethod: "youtube_native_sentence_faithful_v6",
        cues,
        englishCues: sourceCues,
        topics,
        keyPoints: points,
        speaker,
        transcriptVersion: TRANSCRIPT_VERSION,
        cached: false,
      });
    } catch (error) {
      console.warn(
        `[captions:${videoId}] Direct YouTube native transcript unavailable; using Supadata fallback: ${error instanceof Error ? error.message : "failed"}`,
      );
    }

    // Prefer Supadata for native YouTube transcripts.'''
s=s.replace(needle,block,1)
p.write_text(s)
print('direct YouTube English source priority applied')

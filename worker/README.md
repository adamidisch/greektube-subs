# GreekTube Subs v8.1 audio timing worker

This worker is deliberately separate from Vercel. It downloads temporary YouTube audio, converts it to 16 kHz mono WAV, runs WhisperX word alignment and optionally diarization, maps the authoritative English source words onto the audio anchors and persists only a versioned `WordTimeline` plus `ProsodyMap` in Neon.

Audio is stored only inside a `TemporaryDirectory` and is deleted after each job, including failures.

## Integrity rules

- Source cue text is never silently replaced by Whisper text.
- Exact or fuzzy source-to-ASR matches inherit real audio word timestamps.
- Missing words receive a small local fallback bounded by neighboring anchors and the source cue window.
- Every fallback remains explicitly labeled.
- Speaker changes and uncertain prosody boundaries are `pending_review`.
- An artifact can be stored for inspection when its validation is false but downstream subtitle rendering must not auto-apply it.
- The locked v8 translation remains unchanged. v8.1 changes only the timing/prosody input.

## Run tests

```bash
cd worker
python -m unittest discover -s tests -v
```

The core tests do not import WhisperX and therefore run without model downloads.

## Build and run

```bash
docker build -t greektube-audio-timing-v81 .
docker run --env-file .env -p 8080:8080 greektube-audio-timing-v81
```

Required environment variable: `AUDIO_TIMING_DATABASE_URL`. Use a Neon connection string with SSL. `HF_TOKEN` enables speaker diarization. `YTDLP_COOKIES_FILE` is an optional escape hatch for YouTube bot challenges.

Health endpoint: `GET /` on `PORT` (default `8080`).

## Job flow

1. The admin-only Vercel route queues `video_id + source_hash + source_cues`.
2. One worker claims the job with `FOR UPDATE SKIP LOCKED`.
3. Lease heartbeats make restarts and retries safe.
4. `yt-dlp` downloads audio into a temporary directory.
5. FFmpeg creates a 16 kHz mono WAV.
6. WhisperX generates audio word anchors and optional speaker IDs.
7. The source transcript is aligned to those anchors.
8. Validation, `WordTimeline` and `ProsodyMap` are committed atomically.
9. Temporary audio is deleted.

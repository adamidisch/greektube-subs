# GreekTube Subs v8.1 audio timing worker

This worker is deliberately separate from Vercel. Its preferred input is a temporary owner-authorized browser capture uploaded directly to Vercel Blob. It converts that media to 16 kHz mono WAV, runs WhisperX word alignment and optionally diarization, maps the authoritative English source words onto the audio anchors and persists a versioned `WordTimeline`, `ProsodyMap` and gated proof output in Neon. YouTube download remains only as a backwards-compatible fallback.

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

Required environment variable: `AUDIO_TIMING_DATABASE_URL`. Use a Neon connection string with SSL. `AUDIO_TIMING_CLEANUP_URL` must point to the isolated preview endpoint `/api/audio-timing/upload` so uploaded media is deleted after success or terminal failure. `HF_TOKEN` enables speaker diarization. `YTDLP_COOKIES_FILE` is an optional legacy escape hatch.

Health endpoint: `GET /` on `PORT` (default `8080`).

## Job flow

1. The admin captures current-tab audio and uploads it through a short-lived scoped Blob token.
2. The admin-only Vercel route queues `video_id + source_hash + source_cues + temporary media`.
3. One worker claims the job with `FOR UPDATE SKIP LOCKED`.
4. Lease heartbeats make restarts and retries safe.
5. FFmpeg creates a 16 kHz mono WAV inside a temporary directory.
6. WhisperX generates audio word anchors and optional speaker IDs.
7. The source transcript is aligned to those anchors.
8. Validation, `WordTimeline`, `ProsodyMap` and the CPS-gated proof are committed atomically.
9. The Blob object and local temporary audio are deleted.

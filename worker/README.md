# GreekTube Subs v8.1 audio timing worker

## Local transcript-first alignment and authoring

`scripts.align_local` is a separate one-shot workbench. It requires no database,
queue, capture service or paid transcription API. It aligns the existing English
source directly to an owner-provided local recording with WhisperX's CTC model.
Install the worker requirements and the English NLTK `punkt_tab` tokenizer data
before the first run. Model weights are downloaded once and reused.

```bash
python -m scripts.align_local --audio owner.mp3 --source source.srt \
  --duration 120 --output sample-alignment.json --checkpoint audio-checkpoint.json
python -m scripts.author_local --alignment sample-alignment.json \
  --phrases translated-phrases.json --output sample-draft.json
```

`scripts.repair_local` can run a single bounded pass over overlapping adjacent
cue boundaries. It defaults to at most five groups, with at most 25 seconds of
source per group. It compares each repair with neighbouring cues as well as
the group itself, so it cannot merely move the overlap elsewhere. Existing
groups are reused. A larger explicit `--limit` is a separate resource decision.

The alignment command selects complete cues inside the requested range. It
decodes only that range plus 750 ms of context on each side. Cue-local alignment
prevents repeated words elsewhere in the transcript from supplying an unrelated
timestamp. Hyphenated compounds are separated only for phonetic alignment; the
original transcript stays intact. Missing model timings are never silently
interpolated into verified evidence. Source, audio, model and method identities
bind the checkpoint. Each completed cue is saved atomically and reused.

`translated-phrases.json` must carry the alignment's `sourceHash`, `audioSha256`
and `wordTimelineHash`, an ordered `sourceCueIds` scope and a `phrases` list:

```json
{
  "sourceHash": "COPY_FROM_ALIGNMENT",
  "audioSha256": "COPY_FROM_ALIGNMENT",
  "wordTimelineHash": "COPY_FROM_ALIGNMENT",
  "sourceCueIds": [1],
  "phrases": [
    {"firstWordId": "W000001", "lastWordId": "W000008", "text": "Ελληνική φράση."}
  ]
}
```

The translation stage assigns semantic source-word ranges to concise Greek
phrases. It must preserve meaning, uncertainty, attribution and quantities.
`semantic_authoring.py` supplies the provider-neutral packet, translation and
independent bilingual-review contract. Its caller must provide the existing
whole-video brief/glossary and an explicitly configured JSON model callback.
It caches translation and review separately, stops immediately on provider
failure and resumes without repeating a successful model stage. Failed
bilingual QA or authoring retains a repair-required checkpoint. Core tests use
an injected fake callback and consume no model credits.
Every source word in the selected scope must be represented exactly once, in
order. Set `hardBreakBefore` on speaker changes and mandatory semantic breaks.
The authorer optimizes groups of whole translated phrases; it never estimates
English timing from Greek character positions. It enforces two 42-character
lines, 84 characters/event, 1–7 seconds and at most 17 CPS. Holds use at most
250 ms of actual available silence. There is no accumulated delay: each event
starts at its first source word. An impossible fit raises a repair request.

Outputs are SRT plus JSON review drafts, with word references and evidence
labels. They do not assert bilingual or human acoustic approval and are not
automatically imported into production. CTC confidence is a diagnostic, not an
independent proof that the transcript was spoken correctly. Whole-video source
review, bilingual QA and audio review remain required before professional
publication. The web review keeps legacy source-window checks and validates imported
audio-anchored events against their explicit word evidence instead.

### Import a complete authored draft into web review

```bash
python -m scripts.export_web_review --alignment full-alignment.json \
  --draft full-draft.json --report downloaded-review.json --output web-review.json
```

The downloaded report supplies the current app source/translation SHA hashes.
The converter also checks the worker's source and raw word timeline hashes,
requires complete ordered word coverage and rejects overlapping anchors. It
never converts a partial pilot into a full-video import. Compact output must
remain within 4 MB. Import it in the existing subtitle review panel, save/resume
as a draft and perform bilingual plus per-event acoustic review before approval.
No network, model call or application write occurs in the converter.

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

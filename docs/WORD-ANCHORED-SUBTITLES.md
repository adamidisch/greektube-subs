# Word-anchored subtitle authoring: measured pilot

The local workbench aligns the authoritative English transcript directly to
owner-provided audio, then authors Greek display events from explicitly mapped
semantic phrases. The review import, draft storage and payload validation now carry compact
audio evidence. Production has not been migrated or published. This is an implementation milestone, not a completed production
migration or a claim of full-video acoustic review.

## Measured Sarah Myhill opening

Video: `xYB6uYyRjCA`. Source cues 1–4, approximately 25 seconds.

| Metric | Published legacy timeline | Word-anchored draft |
| --- | ---: | ---: |
| Display events | 8 | 6 |
| Events above 17.05 CPS | 7 | 0 |
| Events below 1.5 seconds | 2 | 0 |
| Maximum draft CPS | — | 15.37 |

All 70 source words in this opening scope received cue-local CTC anchors with
scores at or above 0.5. This is model confidence, not human acoustic approval.
The Greek phrases were edited for concise meaning and mapped explicitly to
source word ranges. Layout and timing were then selected deterministically.
No LLM calls were made by the new local workbench during this pilot.

The source cue ending at 24.151 seconds contains a final word whose aligned
out-point is 24.761 seconds. This demonstrates why original SRT boundaries must
remain evidence while final speech timing can come from an audio alignment.
The web review retains the original-window rule for legacy artifacts. Audio
imports use explicit ordered word ranges and validated audio windows instead.
The four-cue pilot is an isolated regression fixture: its source hash cannot
replace the full-video source.

## Implemented

- Local forced alignment without a second ASR transcription.
- 750 ms audio context around each cue, without replacing original text.
- Cue-local token matching and explicit low-confidence/fallback labels.
- Audio/source/model-bound per-cue checkpoints; completed cues are reused.
- Semantic phrase input bound to the exact word timeline hash.
- Provider-neutral semantic translation and independent bilingual-QA contract,
  with separate checkpoints and immediate provider-cooldown propagation.
- Complete ordered source-word coverage for every translated scope.
- Dynamic-programming grouping of whole Greek phrases.
- Two lines, 42 characters/line, 84 characters/event and 1–7 seconds.
- At most 17 CPS; at most 250 ms hold using actual available silence.
- Numeric-content preservation check before authoring.
- Repair-required failure when text cannot fit, rather than accumulating delay.
- Separate draft status, model evidence and human-review status.

## Before whole-video publication

1. Repair the full-video alignment flags with targeted acoustic processing.
2. Generate and review the complete Greek phrase track with the configured
   provider, then assemble it through the existing full-coverage gates.
3. Verify the authenticated production provider/storage path. Browser tests
   exercise the compiled frontend with isolated API fixtures, not real model calls.
4. Complete whole-video language and acoustic review before subtitle approval.
5. Automatic audio alignment still requires the standalone local worker or a
   separately provisioned audio compute host. The new app control imports word
   timing JSON; it does not align an uploaded MP3 inside Vercel.

The old isolated worker must not be launched against the production queue.
The local commands do not create a queue, poll a service or publish content.

## Full recording alignment checkpoint

The one-shot CPU pass covered 1073 source cues and 18,770 words
in 904.91 seconds. 17,034 words (90.75%) met
the model-confidence threshold; this is not an accuracy score. There are
1,736 word-confidence flags and 293 overlap flags. The whole-video track is
therefore **review required**, not acoustically approved. The complete source,
word evidence and per-cue repair worklist were retained for targeted editing.

A separate bounded boundary-repair command aligns only implicated adjacent
cues together. Repairs are accepted only when overlap decreases across the
group **and its neighbours**, without losing direct-confidence word coverage.
In a five-group trial, three repairs were accepted. This does not claim that
the remaining whole-video boundaries were repaired. Completed groups resume
from their own checkpoint. No full second model pass was launched.

## Web review integration (continuation)

`worker/scripts/export_web_review.py` converts a complete worker draft and the
current downloaded review report into a compact web import. It validates source,
translation and raw word hashes before conversion, maps every source word once
and refuses partial pilots or overlapping word anchors. It never asserts human
review. Word tuples contain integer start/end milliseconds, confidence permille
and a direct-evidence flag. Token text and cue indices are reconstructed from
the immutable English source. The full recording's word tuples occupy 443,868
bytes rather than the 8,669,106-byte raw diagnostic artifact.

`audioEvidence` survives client import, edits, draft POST/storage, resumed editing,
server approval and published payload validation. `sourceWordRange` binds each
event to consecutive English word indices. Each event starts on its first word,
covers its final word and holds for at most 250 ms without entering subsequent
speech. The server preserves the existing source/translation SHA checks, admin
authentication, same-origin check and video lease. Requests above 4 MB fail.

Evidence includes an audio digest and model/method provenance supplied by the
operator. The server validates structural consistency; it does not independently
re-run the acoustic model or prove that the digest belongs to the YouTube video.
Model confidence is never human listening. Only all-`audio_reviewed` events plus
bilingual approval and a substantive review note may be published. Legacy
artifacts keep their original source-window checks. Changed source/translation
hashes invalidate either path.

The real first-70-word fixture passes the shared app validator and retains the
24.761-second final out-point. Regression checks reject skipped/repeated words,
stale revisions, overlapping anchors, confidence promotion, extra hold and
publication of model-only events. Shared player lookup and SRT serialization
use those exact event boundaries. The fixture is an isolated four-cue source,
not a full-video production artifact.

Full-video parity check: all 18,770 source token texts and cue mappings agree
between Python and TypeScript. Worker source SHA and both app content SHAs
match the retained current report. The UI continuation below adds browser
interaction and visual verification. Native iPhone Safari keyboard verification
remains unavailable.


## Semantic service continuation

The app now has an authenticated `POST /api/subtitle-authoring` adapter with
three explicit actions: `plan`, `advance` and `assemble`. It uses the existing
configured Groq account and GPT-OSS 120B model. No provider request was executed
during implementation; transport tests inject HTTP responses. This endpoint is
not a new background job and never publishes subtitles. Preview execution is
blocked. The UI continuation below connects this endpoint to the editor.

`plan` validates the current source and translation revisions and reuses the
persisted whole-video understanding. It makes no model calls and does not
regenerate the brief. It isolates uncertain/overlapping cues, then groups healthy
complete cues into bounded semantic scopes. Only overlaps within a selected
scope or its immediate boundary block work on that scope. Final assembly still
requires the strict whole-video audio validator; unrelated bad boundaries are
never silently approved. A dry run on the actual full retained timeline took
4.34 seconds: 159 healthy scopes and 840 blocked source cues. A minimal planning
brief was used for this dry run; no semantic text was generated or reviewed.

`advance` makes at most one provider request: first translation, then independent
bilingual review on a separate explicit invocation. Phrases reference immutable
English word IDs. Both stages are cached. Numeric expressions, ordered coverage,
Greek punctuation and uppercase accents are checked. A dynamic-programming
authorer groups whole Greek phrases against real word anchors with no timing
debt. The actual 70-word opening produces the same six event texts, word ranges
and times as the Python worker. Failure to fit stops that scope for repair.

Provider requests have one HTTP attempt, a 50-second timeout and no JSON-mode
fallback request. Rate limits persist a cooldown immediately while preserving
ready transcript status. Existing saved translation survives a failed reviewer
request. Manual-review scopes do not automatically retry. A separate semantic
cache binds source text, translation reference, whole-video brief, glossary,
context, word IDs, model and prompts. It can reuse bilingual-reviewed phrases
after timing-only repair. New times must still pass fresh deterministic authoring
and produce a newly bound final artifact. Source or glossary changes invalidate
that semantic reuse.

`assemble` loads the exact saved scope checkpoints in order, requires full-video
coverage and current source/translation/audio bindings and revalidates the whole
event track. It saves an ordinary pending review draft. Human audio review,
bilingual sign-off and existing publication checks remain mandatory. Writes use
the existing admin session, same-origin gate and video lease. No schema migration
or new credential is needed.

Validation includes actual-opening parity, stage-by-stage checkpoint replay,
reviewer failure/resume, stale source/audio/glossary rejection, numeric sign
preservation, punctuation/uppercase checks, impossible-fit failures, partial and
duplicate scope rejection, timing-only semantic reuse and single-attempt HTTP
400/429/500/truncated-output cases. Whole-video human review remains unverified.
Full-video alignment repairs and Greek editing are still outstanding.

The compiled Next.js route also passed admin-session, cross-origin, preview,
oversized-body and invalid-action gate tests with network access replaced by
a failing test stub. These tests made no provider or database requests. They
exercise the compiled route directly, not a live HTTP deployment. The UI continuation below adds a foreground preview-server/browser test. No
positive authenticated production provider call is claimed.


## Editor controls and mobile transfer budget — 7.11.0

The existing Video Editor's Subtitle Quality panel now includes audio-timing
import, scope progress, explicit foreground batches of 1/5/all ready sections,
pause between provider stages, persisted resume, cooldown display and draft
assembly. There is no auto-resume, polling, recurring task or background queue.
The upper bound on provider requests is visible before a batch starts. Import
only plans the work and never starts translation. Blocked scopes cannot assemble.

The raw full worker diagnostic JSON can be imported up to 12 MB. The client
checks the worker source digest and every lexical token/cue mapping, then compacts
times to integer tuples with a new reproducible compact digest. It does not
pretend to reproduce Python's floating-point JSON serialization hash. The actual
18,770-word recording imported in 43 ms and produced 444,225 bytes of compact
evidence without a model call. This is a local timing import, not acoustic review.

The server stores timing evidence by its actual content SHA during planning.
Later stage and assembly requests use the returned evidence reference rather
than retransmitting the full video timeline. Warm functions keep a bounded
eight-entry immutable-evidence cache. Every reference is constrained to the
current video/source/translation path and its content digest is verified on read.
Advance requests also carry the exact planned packet key; a changed glossary or
packet is rejected before a new provider request.

IndexedDB stores large timing data separately from small progress metadata.
Provider reference keys and local storage keys are distinct and survive reload.
An earlier local draft format can still be read. A timing replacement removes
the superseded local timing row. Saved model stages remain on the server if
local storage is unavailable; processing stops instead of silently losing progress.

Browser verification used the compiled preview frontend at 390/768/1280 px,
Greek and English, dark and light themes. Fixtures intercepted API traffic.
Passed: file chooser/import, no translation on import, pause after translation,
reload without auto-resume, exact next-stage continuation, separate IndexedDB
storage, tiny evidence-reference stage requests, stale file rejection, blocked
assembly, draft-to-review flow, per-event publication gate, HTTP 429 stop and
reload-persistent cooldown. There were no runtime errors or horizontal overflow.
Visible buttons measured at least 44 px and the focused selector 16 px; viewport
scale stayed 1 after focus/blur. Rendered screenshots were inspected. Light-theme
focus/field contrast and progress colors use the existing purple palette. Native
iPhone Safari keyboard behavior has not been exercised.

Run the browser suite after a preview build:

```bash
VERCEL_ENV=preview npm run build
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium \
  node --experimental-strip-types scripts/subtitle-authoring-ui.browser-test.mjs
```

The suite starts and stops its own foreground server. It never calls a real
provider, writes production subtitles or supplies production credentials.

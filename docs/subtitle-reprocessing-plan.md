# Controlled subtitle reprocessing plan

## Purpose

Rebuild every legacy transcript through one final, repeatable subtitle workflow without silently trusting existing `ready` rows and without overwriting production evidence before a replacement revision is validated.

The quality contract is the same for a short video and a multi-hour video. Long videos only use more resumable slices/checkpoints.

## Final workflow

`ACQUIRE_RAW -> VERIFY_ENGLISH -> FREEZE_SOURCE -> TRANSLATE_GREEK -> VALIDATE_PAIR -> PUBLISH_REVISION`

### 1. ACQUIRE_RAW

- First make one bounded attempt to read the English caption track directly from YouTube.
- If YouTube exposes both manual English and auto-generated English in that same response, prefer manual English immediately.
- Otherwise use YouTube auto-generated English immediately.
- Do not search external sites for manual captions.
- If the bounded direct YouTube attempt fails, use the existing Supadata native fallback.
- Persist the acquired raw source before repair or translation work.
- Record source provenance (`youtube-manual`, `youtube-auto`, or fallback source), acquisition time and source hash.

### 2. VERIFY_ENGLISH

The display English track is speaker-faithful. Structural cleanup is allowed; semantic rewriting is not.

Allowed:
- decode entities and remove non-spoken markup;
- normalize whitespace and malformed punctuation artifacts;
- remove exact duplicate caption events;
- repair objectively malformed timing metadata;
- conservative segmentation when timing evidence supports it;
- preserve spoken hesitation words such as `um`, `uh`, `erm`;
- preserve numbers, units, names and spoken wording.

Not allowed:
- paraphrasing;
- summarizing;
- replacing the speaker's wording with more polished English;
- silently guessing words that are not supported by the acquired source;
- inventing precise micro-timestamps merely to make prettier cues.

Any future ASR correction that changes spoken lexical content must be an explicit audited correction and must create a new source revision.

### 3. FREEZE_SOURCE

Freeze only after English structural validation passes.

A frozen revision binds:
- `videoId`;
- revision number;
- canonical English cues;
- cue count;
- immutable timing map;
- source/content hash;
- timestamp hash;
- raw-source provenance and raw-source hash.

Once frozen, automatic retries must not silently replace its English text or timing map.

### 4. TRANSLATE_GREEK

- Translate only from the frozen English revision.
- Use global video context plus local batch context for terminology and consistency.
- Long videos are processed in resumable batches/checkpoints.
- Translation context may internally normalize hesitation noise, but this must never modify the stored/display English track.
- Greek wording may be natural and polished but must not add, remove, negate or reinterpret source meaning.
- Greek cue identity and timing are inherited from the frozen English map.

### 5. VALIDATE_PAIR

Hard requirements before publication:
- English cue count equals Greek cue count;
- same cue order;
- same `start` and `duration` within 2 ms tolerance;
- no empty English or Greek cue;
- no invalid/negative/non-finite timing;
- no timing inversion in the final canonical timing map;
- numeric/unit integrity per cue;
- Greek-language sanity check;
- source hash and timestamp hash still match the frozen revision.

If English changes after Greek translation, the Greek revision becomes stale immediately and must be retranslated or revalidated against the new English revision.

### 6. PUBLISH_REVISION

Publication is revision-based, never destructive replacement of source evidence.

A published revision must bind:
- raw source artifact;
- frozen English artifact;
- Greek artifact;
- shared timing map;
- source hash;
- timestamp hash;
- validation result;
- translation method/version;
- publication timestamp.

The Blob publication boundary must reject an invalid English/Greek pair even if an earlier stage failed to catch it.

## Storage responsibilities

### Neon

Use Neon as the control plane only:
- video/revision identity;
- state/status;
- source provenance;
- cue counts;
- hashes;
- published revision pointer;
- processing cursor/retry/lease information;
- validation summary.

### Vercel Blob

Use Blob for the large immutable artifacts:
- raw acquired transcript;
- frozen English revision;
- Greek draft/final revision;
- processing checkpoints;
- historical published revisions.

## Safety gates for legacy migration

Before any legacy video is reprocessed:

1. **Read-only inventory** — classify the current DB/Blob state.
2. **Evidence preservation** — retain the old raw/English/Greek payloads as legacy evidence until the replacement revision is published and verified.
3. **No in-place trust** — `status=ready` or matching cue counts do not make a legacy transcript verified.
4. **No blind resume** — failed legacy translation checkpoints are not resumed if they were produced under the old workflow.
5. **Owner lock safety** — owner-managed or legacy `owner_chatgpt` videos are migrated explicitly and are never auto-overwritten.
6. **Dry-run validation** — build the candidate English revision and run all structural checks before translation/publish writes.
7. **One-video canary** — complete one normal legacy video end-to-end before batch migration.
8. **Independent problem canaries** — separately test the known timing-anomaly video and the owner-managed legacy video.
9. **Batch migration** — only after canaries pass, process the remaining normal videos.
10. **Post-publish read-back** — re-read Blob + Neon and verify hashes, revision pointer, cue counts and timing contract.

## Current seven-video migration order

### Phase A — normal canary

#### `D2RjneeG_xA`

Current legacy state: ready, 100 English / 100 Greek, no current structural mismatch found.

Why first:
- small transcript;
- clean structural baseline;
- fastest way to prove the entire new acquisition -> freeze -> translate -> validate -> publish path.

Action:
- do not treat current Greek as verified;
- reacquire raw source;
- create a new frozen English revision;
- translate from scratch;
- validate and publish only if the full contract passes;
- compare the new revision with the legacy result for regression review.

### Phase B — additional normal legacy rows

Process after the canary succeeds:

1. `Tk47F--QyY8` — 107 / 107
2. `ZpfFabBsGlw` — 520 / 520
3. `0_adZSC0sFI` — 542 / 542

For each:
- reacquire raw source;
- rebuild speaker-faithful English;
- freeze new revision;
- retranslate Greek from scratch;
- run the hard publication contract;
- preserve the legacy artifacts for comparison/rollback evidence.

### Phase C — known timing anomaly

#### `BbGv7GTbRN8`

Current legacy state: 4214 English / 4214 Greek with matching English↔Greek timestamps, but read-only audit found 484 local timing inversions in both tracks.

Action:
- do not repair the legacy pair in place;
- reacquire raw source and construct a fresh canonical English timing map;
- explicitly verify there are zero inversions before Freeze Source;
- translate Greek only after the new timing map is frozen;
- reject publication if any inversion remains.

This is the timing-integrity canary for the final pipeline.

### Phase D — failed partial legacy translation

#### `KkBy__7d9Fs`

Current legacy state: failed, 947 English / 128 Greek, old stage `translate_google`, error `non-greek-output`.

Action:
- preserve the failed checkpoint as legacy evidence;
- do **not** resume from cue 128;
- reacquire/rebuild/freeze the English source under the new workflow;
- start Greek translation from cue 0 of the new frozen revision;
- use resumable checkpoints only within the new revision;
- publish only after complete pair validation.

### Phase E — controlled owner migration

#### `fX2z-BF8Jac`

Current legacy state: `owner_chatgpt` lock exists but no modern owner manifest. The current legacy database representation is not sufficient evidence of a modern frozen/published owner revision.

Action:
- never let automatic reprocessing overwrite it;
- preserve all existing owner/legacy artifacts first;
- reacquire/build the candidate English source in dry-run mode;
- review/compare against the owner-managed English source;
- create the first modern owner Freeze Source revision only through the owner workflow;
- validate/retranslate Greek against that exact frozen revision;
- publish through the owner workflow and retain the legacy owner artifacts.

This video is migrated last because it requires explicit owner-state reconciliation rather than normal automatic processing.

## Required migration report per video

Every migrated video must produce a compact audit record containing:

- video ID;
- previous legacy state/version;
- source provenance;
- raw cue count;
- frozen English cue count;
- Greek cue count;
- source hash;
- timestamp hash;
- timing inversion count;
- numeric mismatch count;
- validation result;
- published revision;
- read-back result;
- any ASR correction records, if present.

## Stop conditions

Stop the migration immediately for that video if any of the following occurs:

- source provenance cannot be established;
- canonical English lexical content is being changed by a mechanical repair stage;
- timing repair requires unsupported/invented precision;
- cue map contains inversions after canonicalization;
- English/Greek cue counts diverge;
- numeric/unit integrity fails;
- source or timestamp hashes change after Freeze Source;
- owner-managed state is ambiguous;
- post-publish read-back differs from the revision that was validated.

Do not auto-fix around a stop condition. Keep the previous published revision active and investigate the cause.

## Rollout decision

No legacy production transcript is rewritten merely because this plan exists. Actual migration writes begin only after the new workflow has passed the canary sequence and the production write step is explicitly approved.
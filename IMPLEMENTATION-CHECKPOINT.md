# GreekTube professional subtitle workflow

Production baseline: `255c334d834ba5dc1d580b76bba7a8f4f3df3fcd` (7.9.19).
Canonical production: https://greektubesubs.com — Vercel project `prj_E5iHARRHcYGCrENZrY2WizhA83Ed`.
Do not deploy the historical Sites checkout to this project.

## Accepted release requirements

1. Preserve original English and Greek translation cues as immutable source evidence.
2. Build one explicit subtitle event timeline, shared by the overlay, transcript and display SRT export.
3. Audit the actual displayed events, not only source cue count and timestamps.
4. Preserve real timing gaps and resolve English and Greek by time independently.
5. Bind any reviewed final track to its source and translation content hashes; invalidate it after edits.
6. Require readable events and documented timing evidence before a new professional track can be published.
7. Keep imports that fail professional QC as reviewable drafts, with actionable issues.
8. Move Add video into the user menu, add Account and safe logout and expose independent app language.
9. Verify against the production xYB6uYyRjCA transcript and preserve the known 1:50 regression.

## Evidence baseline

The source has 1,073 cues, rendered as 1,878 pages by the legacy display packer.
122 pages last under 1.5 seconds; 380 under 2 seconds; 838 exceed 17 CPS.
The source and Greek cue timestamps match, which does not establish audio synchronization.
Existing packing tests pass despite these live-data defects.

## Audio boundary

The repository has a WhisperX worker but the production database has no audio timing tables.
Do not claim audio verification or launch the legacy isolated workflow as a production worker.
Any missing audio/evidence must remain explicit in QC and completion reports.

## Working checklist

- [x] Shared timeline and quality model
- [x] Production data regression and review gates
- [x] Import/owner publishing gates and reviewed timeline support
- [x] Shared player/transcript/export timeline
- [x] Account menu, analytics and independent core-app language
- [x] Build, type and targeted lint/tests
- [x] Desktop browser and 390px/768px iframe layout checks
- [ ] Native iPhone Safari keyboard/viewport verification (not available in this browser)
- [ ] Reviewed commit and verified production deployment

The old source cue at 110.290 seconds is covered by a regression fixture. The actual production audit still reports 838 fast pages and 122 under 1.5 seconds. This release makes that debt visible and reviewable; it does not falsely mark the video acoustically verified.

Implemented: source/translation hash binding, client invalidation, same-origin authenticated review writes with video leases, per-event audio review, inline text/timing editor, draft retention, safe logout and per-device account metrics. No new translation provider work was launched. Preview-only `/qa` provides 390px and 768px iframe viewports; production returns 404.

Final audit also routed new Auto Translate actions to the semantic professional pipeline, applied readability gates to both legacy and professional finalization, made manual imports validate canonical source and numbers, preserved original raw English evidence and added guarded publication plus origin read-back of the actual Blob. Forced operations can no longer steal an active video lease. Its actual UPSERT passed local SQLite conflict-semantics regressions; production Postgres mutations were not exercised.

The account remains a device profile, not a new credential-based authentication system. Logout explicitly explains the loss of browser access and offers data export before confirmation. Public contact/legal copy and core application labels have independent EL/EN translations. Video subtitle language remains separate.

Resume audit (2026-10-22): fixed English All-category filtering by using a language-independent category ID. Direct published-video links now resolve ready cached captions even when the current device library lacks that video. The resolver never starts translation. Final preview account was visually inspected at 390px and 768px: header 62px, first content 82px, title 26px, body 14px and editable input 16px at mobile width with no horizontal overflow. Native iPhone Safari keyboard verification remains unavailable.

## Local word-anchored workbench (2026-10-22, draft branch)

See `docs/WORD-ANCHORED-SUBTITLES.md` for measured evidence and the remaining
production integration. New local commands perform direct CTC alignment,
bounded adjacent-boundary repair and semantic-phrase authoring without starting
the isolated queued worker. A provider-neutral translation plus independent
bilingual-QA contract is covered with injected test providers; no new LLM
provider calls were launched.

Actual Sarah Myhill audio was aligned across all 1,073 source cues and 18,770
words in 904.91 seconds. 17,034 words met the model-confidence threshold;
1,736 confidence flags and 293 overlap flags remain. Full-video acoustic
approval is still absent. A retained per-cue worklist identifies 491 existing
Greek cues over the 17 CPS audio-window budget.

The manually edited opening scope (source cues 1–4, 70 source words) produces
six readable draft events, maximum 15.37 CPS, no event below 1.5 seconds and no
alignment flags. The existing live timeline has eight events in that scope,
seven over 17.05 CPS and two below 1.5 seconds. A 25-second audio/video preview
and SRT were generated. These are a pilot, not a full-video finished track.

Validation: 33 Python worker tests, Python compilation, diff whitespace check,
Greek uppercase audit of the pilot fixture, actual CPU model execution,
cache-only replay and a rendered preview frame. No UI or production data was
changed. The word-evidence import schema, original-window reconciliation and
existing semantic service still need integration before live use.

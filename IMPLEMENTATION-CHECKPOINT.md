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

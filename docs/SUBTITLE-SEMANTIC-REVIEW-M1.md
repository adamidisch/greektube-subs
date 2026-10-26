# Melis — M0/M1 implementation checkpoint

Blueprint: https://app.notion.com/p/40425b0f2c8b81828346df457b68ad25
Shared rules: https://app.notion.com/p/40225b0f2c8b814ead83c43d65914316

## Implemented

Reuse the existing source-bound whole-video brief/glossary, word translation,
foreground provider adapter, scoped checkpoints and manual publication safeguards.
The new final review first deterministically authors the proposed phrases into
the exact display events. It reviews those events without rewriting them.
Findings carry event/source-word IDs, category, severity, evidence and suggested
repair. Missing or duplicate event coverage, stale candidate hashes, malformed
findings and replacement phrases cannot be accepted. Any finding requires repair
in this first slice; warning dispositions and bounded automated repair are not
implemented yet.

Store the approved review with each scope result. Bind it to context/source/
translation/model/prompt identity and the final text, grouping and source mapping.
Assembly rejects edited or unreviewed scope events. Timing-only repairs can reuse
meaning review only when the displayed wording/grouping/mapping stay identical.
Existing strict timing checks still govern the actual event artifact.

Model alignment no longer sets speechVerified. Only audio_reviewed events can do
so; existing server publication still requires that explicit per-event review.
The legacy live fallback is unchanged.

The Sarah v2 fixture restores “κιβώτιο ταχυτήτων” without changing word mappings
or proposed media times. It remains an estimated, unapproved partial pilot.
Original v1 fixtures are retained. v2 has maximum 16.30 CPS and no reading/layout
blockers under the shared validator. No new MP4/browser playback was produced
for this wording repair.

## Verification and limits

Passed targeted word-authoring, audio-evidence, client checkpoint/cooldown,
shared-track and Sarah v1/v2 regressions; TypeScript and scoped ESLint passed.
The full npm production build passed including its existing regression suite.
No real provider invocation or production subtitle write occurred.

Vercel project metadata confirms GROQ_API_KEY exists as a sensitive variable.
Its single-variable read did not expose a usable value, so no local real-provider
trial was attempted. Do not repeatedly request the secret or claim missing
production configuration. Use the configured server environment for the next
real integration trial after deploying the reviewed candidate safely.

## Next slice

1. Verify the candidate in an isolated configured preview/server context and
   run a small real provider review, retaining raw output/checkpoints. Include
   a deliberately degraded and a faithful candidate to assess reviewer behavior;
   mocked provider checks do not measure translation accuracy.
2. Add explicit bounded repair/disposition support and carry structured findings
   into the existing review experience without weakening publication gates.
3. Produce the corrected Sarah playback preview and verify desktop/mobile,
   actual audio/offset and a genuine short answer. Record user sample acceptance.
4. Test another available real video excerpt through the generic pipeline.
5. Apply the accepted process to the whole Sarah track, then publish with rollback.

This checkpoint records a working first slice, not completion of M2–M4 or the
entire v1.1 design. No new AI SDK/provider migration or unrelated UI work was done.

# Sarah stable subtitle pilot — 2026-10-25

Blueprint: https://app.notion.com/p/40425b0f2c8b81828346df457b68ad25

Status: reviewable partial candidate, not published or acoustically approved.

The live public subtitle-review report was retrieved successfully today. Its
source/translation hashes match the retained baseline. Live still uses 1,878
legacy events derived from 1,073 cues. The v6.5 export has 1,029 cues: it is a
separate source revision. Never reuse a cue index across those revisions without
an explicit map.

`scripts/fixtures/sarah-stable-pilot.json` contains 13 proposed events for
01:27–02:20. Each maps to immutable live source cue indices, cached word IDs and
v6.5 cue IDs. The candidate preserves all mapped source words as evidence while
Greek wording is concise. No automatic proportional timing is used.

Cached full-recording CTC boundaries plus the existing independent base.en pilot
recognition were reused. The unreliable 01:56–02:02 region and the adrenal onset
use independent cached recognition onsets, with no new model execution. These
remain proposals. Low-confidence regions and all listening checks stay open.
The evidence method does not establish word-level accuracy or source/audio offset
verification. Speech ends may hold for at most 250 ms before the next proposed
event. No overlap or reading/layout issue remains in the candidate under the
shared app validator; maximum reading speed is 15.85 CPS and minimum duration
1.956 seconds. These figures are not audio validation.

`sourceStableSubtitleTrack` creates an explicit source-preserving preview track
without falling through to legacy temporal paging. It keeps audit failures
visible. This helper existed as an uncommitted change at session start and now
has targeted regression coverage. Production defaults are unchanged.

Validation:

    node --experimental-strip-types scripts/subtitle-track.test.mjs
    node --experimental-strip-types scripts/sarah-stable-pilot.test.mjs

A 53-second 1280×540 MP4 compares the actual current live events on the left
with the candidate on the right, using the owner-provided MP3. It contains audio
and subtitle panels, not the YouTube picture. The output has been probed for
H.264/AAC and duration and a representative rendered frame has been inspected.
This is artifact verification, not desktop/mobile player playback testing.

Remaining gate: real listening, source/audio offset confirmation, desktop/mobile
playback, a genuine short-answer supplemental sample and user sample acceptance.
Do not scale or publish this partial track as the full recording. Full-video
subtitle generation, deployment and production writes have not occurred.

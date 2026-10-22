# Professional subtitle workflow

## One source, one display timeline

Keep canonical English and approved Greek cues intact. Cue-for-cue translation is an intermediate artifact. It is not proof that the display is readable or synchronized with speech.

`app/subtitle-track.ts` produces explicit events shared by the player, transcript, editor preview and display SRT. Languages resolve their own event by time. End points are exclusive and gaps remain empty. The English source SRT export remains a separate immutable translation input.

## Quality gates

- Source coverage, contiguous source mapping and chronological order.
- Valid speech windows, no overlapping events and no lost numeric expressions during authoring.
- 1–7 seconds per event, at most 17.05 characters/second and two lines of at most 42 characters.
- Events below 1.5 seconds appear in the review report even when otherwise valid.
- Source-derived and estimated timing never qualifies as audio verification.
- A professional approval requires every event to be acoustically reviewed plus an explicit bilingual approval and a review note.

The reviewer is responsible for meaning, terminology, negation and audible timing. Mechanical checks cannot certify these. A future alignment worker must provide verifiable artifacts before automatic `audio_aligned` approval is enabled.

## Import and review

1. Freeze the English source. Translate with whole-video context and preserve canonical numbering and timestamps.
2. Import the Greek SRT. Structural checks run first, followed by an audit of actual display events.
3. An unreadable import is saved under its source and translation SHA-256 hashes as a draft. Existing publication remains intact.
4. In the video editor, open **Subtitle quality → Review import draft**. Review events against the audio, edit text and timing and mark each acoustically checked event. The original English context is shown by time overlap, never by assuming matching language indexes.
5. Save a draft as needed. Editing reports can also be downloaded and reimported with identical revision hashes.
6. Approve the reviewed timeline with a bilingual review note. For an import draft, retry publication of the exact same Greek SRT. The approval is resolved by exact content hashes and attached to the publication automatically.
7. For an existing publication, timeline approval updates the display artifact directly. It preserves canonical cues.

Admin authorization, same-origin checks and the existing per-video lease protect timeline writes. Preview deployments cannot approve or publish timelines. Source changes invalidate approval on the server. Local text/timing edits also invalidate the client display artifact.

New Auto Translate actions use the semantic professional route. Existing legacy work can resume but its final display also passes the readability gate. Already readable authored SRT boundaries are preserved. Fallback packing cannot bridge source gaps. Manual imports validate numbers and the canonical English revision, retain original raw English evidence and switch the published Blob before acknowledging completion. Publication is read back from origin storage; mutable review artifacts also bypass stale CDN content. Force means restart after acquiring a lease, not take over another active writer.

## Regression and release evidence

Run `npm run build`, `npm run test:subtitle-track` and targeted lint. The shared-timeline suite includes the actual xYB6uYyRjCA 110.290-second cue, gaps, independent language timing, numeric preservation, source coverage and stale-artifact invalidation.

Baseline production video: 1,073 source cues become 1,878 legacy display events. 838 are too fast and 122 last under 1.5 seconds. These figures must not be presented as fixed merely because player and transcript now agree.

The source audio could not be downloaded in this workspace. No acoustic approval or full-video retiming has been performed. The production worker has not been provisioned or started. Existing translations are reused and no provider translation jobs are launched by this release.

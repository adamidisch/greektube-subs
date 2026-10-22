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

## Remaining production integration

1. Extend the existing semantic translator and bilingual reviewer to return
   Greek phrases with explicit source word ranges. Reuse the existing global
   understanding and locked glossary. Preserve uncertainty, attribution,
   numbers, units and negation; repair only the failing scope.
2. Complete the full-video alignment repairs and semantic phrase editing. The
   compact audio-evidence import and web review validation are implemented;
   imported model evidence remains a draft until every event has audio review.
3. Exercise the complete path in isolation, including source changes,
   translation edits, provider cooldown, stale artifacts, playback and export.
4. Review the final full-video Greek wording and audio before publication.

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
match the retained current report. Browser interaction/visual verification was
not completed: the available browser archive download was invalid and the local
server hit an environment network-interface error. No native iPhone Safari
keyboard verification or production deployment is claimed.

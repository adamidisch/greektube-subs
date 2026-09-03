# GreekTube Professional Subtitle Translator v1.1

## Purpose

This is the canonical translation, subtitle-authoring and timing specification for GreekTube.

The objective is professional Greek audiovisual subtitles: semantically faithful, idiomatic, readable and synchronized to the speech. The system must never trade semantic accuracy for speed and must never hide timing problems by simply delaying later subtitles.

**Correct or block publication. Never silently degrade.**

Canonical production pipeline:

**RAW SOURCE → SOURCE NORMALIZATION → SOURCE RECONSTRUCTION → WHOLE-VIDEO UNDERSTANDING → SEMANTIC SPANS → PROFESSIONAL GREEK TRANSLATION → BILINGUAL QA → SPEECH-ANCHORED AUTHORING → DISPLAY PAGING → TIMING/READABILITY QC → FULL-VIDEO QC → PUBLISH**

No production stage may be skipped.

---

## 1. Non-negotiable principles

1. **Meaning comes before cue boundaries.** Raw YouTube/SRT cues are not assumed to be sentences.
2. **Understand first. Translate second.** The complete reconstructed discussion must be understood before final translation.
3. **Translate semantic spans, not isolated cues.** Context-dependent micro-utterances require their question/answer context.
4. **Source timings are immutable evidence.** Original cue starts/ends remain traceable throughout the pipeline.
5. **Speech timing comes before reading-speed convenience.** If text cannot fit its speech window, compress wording or require review. Never push the next semantic phrase later just to make the previous subtitle easier to read.
6. **Natural modern Greek over English-shaped Greek.** Preserve meaning while writing idiomatic subtitle Greek.
7. **No invention. No silent factual correction.** Context may disambiguate but may not add unsupported information.
8. **Preserve epistemic strength.** `may`, `might`, `could`, `probably`, `I think`, `it appears` and equivalents must retain their strength.
9. **Preserve negation exactly.** Lost or invented negation is a hard failure.
10. **Preserve attribution exactly.** Reported claims must remain attributed to the correct speaker/source.
11. **No orphan subtitle events or display pages.** A single stranded word or tiny two-word tail is a hard readability defect when redistribution is possible.
12. **Quality failure blocks publication.** If semantic translation, alignment or QA is uncertain, set `translation_pending` or `manual_review_required`.

---

## 2. Source model

Normalize every source cue to:

```ts
type RawCue = {
  id: string;
  start: number;
  end: number;
  text: string;
};
```

For every reconstructed unit retain the original anchors:

```ts
type SourceTimingAnchor = {
  sourceIndex: number;
  start: number;
  end: number;
  text: string;
  terminal: boolean;
};
```

The original cue ID, words and start/end must remain recoverable through translation and final authoring.

---

## 3. Stage A — Source normalization

Normalize without translating:

- decode entities
- normalize whitespace
- preserve trustworthy punctuation
- detect malformed/zero-duration cues
- preserve numbers, units, names and acronyms
- remove only obvious technical artifacts
- mark suspicious ASR words instead of guessing silently
- keep relevant non-verbal events

Fillers may be removed only if they carry no semantic or tonal value.

---

## 4. Stage B — Source reconstruction

Rebuild raw timed fragments into coherent source-language discourse while retaining every source anchor.

Merge when cues are fragments of:

- one sentence
- one question
- one answer
- a split clause
- a phrasal verb
- a noun phrase
- quoted speech
- a context-dependent speaker turn

Do not merge across a genuine semantic sentence/turn boundary merely to simplify timing.

Required output:

```ts
type ReconstructedUnit = {
  id: string;
  sourceCueIds: string[];
  sourceAnchors: SourceTimingAnchor[];
  start: number;
  end: number;
  speaker?: string;
  type: "statement" | "question" | "answer" | "continuation" | "other";
  text: string;
};
```

Example:

```text
00:00 Do you think we'll be able to live forever soon
00:04 or at least significantly extend life in the next two decades?
00:06 I do.
00:07 And I think the reason is that...
```

Reconstructed:

```text
Q: Do you think we'll be able to live forever soon or at least significantly extend life in the next two decades?
A: I do. And I think the reason is that...
```

The answer retains the 00:06 source speech anchor.

---

## 5. Stage C — Whole-video understanding

Analyze the complete reconstructed transcript before translation.

The global brief must include:

- main topic and purpose
- speakers and roles
- section structure
- claims/positions by speaker
- question/answer dependencies
- locked technical glossary
- names and acronyms
- pronoun/reference ambiguities
- irony/jokes when relevant
- tone and stance
- uncertainty/hedging
- suspicious ASR passages
- important numerical facts and units

Long videos may be analyzed hierarchically but the final brief must represent the entire discussion.

---

## 6. Stage D — Semantic span construction

A semantic span contains enough context to express one coherent meaning.

Prefer boundaries at:

- completed thoughts
- sentence boundaries
- speaker-turn boundaries
- question + short dependent answer
- closely linked clauses

Never translate these in isolation when context determines their meaning:

```text
I do.
I don't.
I did.
So do I.
It does.
It could.
Exactly.
Not necessarily.
Because...
```

Each translation request receives:

- whole-video understanding brief
- glossary
- previous source span
- previous approved Greek span
- current span
- following source span
- speaker context
- source timing anchors

Neighbouring spans are disambiguation context only and must not leak facts into the current span.

---

## 7. Stage E — Professional Greek translation

Translate **meaning → concise natural Greek**, not word sequence → word sequence.

Preserve:

- factual meaning
- question/answer logic
- speaker attribution
- negation
- uncertainty
- causality
- chronology
- quantities
- percentages
- dates
- units/doses
- names/acronyms
- technical meaning
- relevant emotional tone and humour

Greek must:

- sound professionally authored
- avoid literal English syntax/calques
- use modern idiomatic Greek
- preserve technical precision
- remain concise enough for subtitles
- use correct accents/punctuation

Example:

```text
Q: Do you think it will work?
A: I do.
```

Correct:

```text
Πιστεύετε ότι θα λειτουργήσει;
Ναι, το πιστεύω.
```

Hard failure:

```text
Το κάνω.
```

---

## 8. Stage F — Independent bilingual QA

Every translated span receives a second EN↔EL review.

Reject/repair when:

- meaning changed
- negation changed
- uncertainty changed
- Q/A dependency mistranslated
- pronoun/reference resolved incorrectly
- attribution changed
- association became causation
- chronology changed
- number/unit/name/acronym changed
- technical terminology is inconsistent
- Greek is machine-like or grammatically broken
- meaningful content was omitted
- unsupported content was added

Outcomes:

- `approved`
- `repair_required`
- `manual_review_required`

Only `approved` continues automatically.

---

## 9. Stage G — Speech-anchored Greek subtitle authoring

This is a separate stage from translation.

Final subtitle events are based on:

**semantic meaning + actual source speech anchors + Greek syntax + readability**

### Timing hierarchy

Prefer evidence in this order:

1. word-level audio alignment
2. reliable source word timestamps
3. reconstructed-unit/raw-cue boundaries
4. conservative interpolation inside one immutable source cue

### Hard anchor rule

When a new semantic phrase begins at a known source cue/speaker boundary, the Greek phrase must begin at that boundary (or within a tiny presentation tolerance, normally ≤120 ms).

Never do this:

```text
source phrase starts 65.000
Greek phrase starts 67.500 because previous subtitle needed more reading time
```

Instead:

- shorten/compress the previous Greek wording
- resegment it
- merge intelligently where semantics allow
- or require manual review

**Do not accumulate timing debt.**

### Authoring constraints

- max 2 lines
- target max 42 characters/line
- max 84 characters/event
- minimum 1.0 s/event
- maximum 7.0 s/event by default
- target maximum 17 CPS
- no overlaps/inversions
- no zero-duration events
- no accidental duplicated boundary words
- no one/two-word orphan event when redistribution is possible

---

## 10. Stage H — Display paging inside a subtitle event

An authored event may still require more than one overlay page on small screens. Display paging is presentation-only and may not change source/SRT data.

### Critical v1.1 rule

**Never assign every word in a multi-second source cue the cue's start time.**

If true word-level timing is unavailable, estimate each word's onset conservatively from its relative position inside the immutable cue window. Page changes must follow this estimated speech progression.

Bad behavior:

```text
62.000 large 5.5-second cue begins
62.000 page 1
63.000 page 2
64.000 page 3: "πρωτεΐνες"
```

This races ahead of the actual speech and creates a stranded final word.

Required behavior:

- page 1 begins with the source cue
- later pages begin near the words they contain
- consecutive pages still receive ≥1 s when possible
- small visual lead may be used (roughly 0–150 ms)
- no page may contain only one word or a tiny two-word tail if the final two pages can be rebalanced
- word order and wording remain immutable in the display layer

### Orphan-page rule

If the final page contains <3 words or is visually tiny, rebalance the final two pages while preserving:

- all words exactly once
- original word order
- max 2 lines/page
- line-length rules

The screenshot regression around `n1G3xqgzB2c` 1:02, where the overlay collapsed to only **«πρωτεΐνες»**, is a permanent regression fixture.

---

## 11. Timing alignment principles

- preserve chronology
- preserve source coverage
- keep Q/A on the correct speaker turn
- prefer pauses and semantic boundaries
- do not switch mid-phrase when a better boundary exists
- never duplicate/drop words to solve timing
- never invent time outside the source span
- never solve reading speed by shifting the next semantic phrase late

If text does not fit the available window:

```text
compress meaning-preservingly → re-author → QA again
```

If it still does not fit:

```text
manual_review_required
```

---

## 12. Full-video QC

### Semantic integrity

- all meaningful source content covered
- no unsupported additions
- no duplicated ideas
- no literal dependent-answer errors
- consistent terminology

### Numerical integrity

Compare source ↔ Greek for:

- numbers
- percentages
- currencies
- dates
- ages
- measurements
- doses
- scientific units

Any unexplained mismatch is a hard failure.

### Timing integrity

- monotonic chronology
- no overlaps
- no negative/zero duration
- no event <1 s
- no event >7 s without explicit exemption
- no semantic phrase delayed beyond its source anchor tolerance
- no accumulated timing debt
- complete mapping to source anchors

### Readability/display integrity

- max 2 lines
- target 42 chars/line
- ≤17 CPS by default
- natural Greek line breaks
- no orphan events
- no orphan display pages
- no one-word final page such as «πρωτεΐνες» when rebalancing is possible
- no technical markers/placeholders
- no accidental uppercase/accent artifacts

---

## 13. Publication gate

Production publish requires:

```text
source_normalized = true
source_reconstructed = true
whole_video_understanding = ready
semantic_spans = complete
translation = complete
bilingual_qa = passed
speech_anchored_authoring = passed
display_paging_qc = passed
timing_qc = passed
semantic_qc = passed
readability_qc = passed
artifact_scan = clean
```

Otherwise:

```text
translation_pending | review_required | failed
```

Never silently publish a lower-quality fallback.

---

## 14. Provider fallback policy

Allowed:

```text
semantic model unavailable
→ cooldown/wait
→ approved equivalent semantic model
→ resume checkpoint
```

Forbidden for final production:

```text
semantic model unavailable
→ isolated literal/per-cue translator
→ publish
```

Literal translation may exist only as an explicitly labelled preview.

---

## 15. Checkpoints and efficiency

Persist:

- source hash
- normalized source
- reconstructed units + source anchors
- whole-video understanding
- glossary
- semantic spans
- approved translations
- bilingual QA results
- authored speech-aligned events
- final QC result

Resume from the latest valid checkpoint. Do not retranslate approved spans unless source/glossary/context changed or QA requires it.

---

## 16. Permanent regression suite

### A. Context-dependent answer

```text
Do you think it will work?
I do.
```

Must produce contextual Greek such as:

```text
Ναι, το πιστεύω.
```

Never `Το κάνω.`

### B. Source-anchor fidelity

If the answer starts at `06.000`, the Greek answer must start at `06.000` within the allowed presentation tolerance. Previous reading-time pressure may not move it to `07.000+`.

### C. Boundary duplication

```text
Έχεις ήδη χάσει.
Χάσει. Αυτή είναι η διαφορά.
```

Must fail QC.

### D. Orphan authored event

A continuous subtitle sequence ending in a standalone one/two-word event must fail when the words can be redistributed safely.

### E. n1 protein display regression

Source window around 1:02 contains a multi-second phrase ending with `...την πρωτεΐνη. Οι πρωτεΐνες...`.

The overlay must never advance to a page containing only:

```text
πρωτεΐνες
```

Page changes must follow speech progress inside the cue and the final pages must be rebalanced.

### F. Numbers and uncertainty

`10`, `75%`, `might`, `could`, `I think`, `not` and equivalents must survive translation with the same meaning.

---

## 17. Definition of professional-ready

A subtitle file is professional-ready only when a reviewer can watch normally without noticing the subtitle system.

The viewer should experience:

- the right meaning
- at the right spoken moment
- in natural Greek
- in readable two-line units
- without flashes, lag, racing pages, orphan words or machine-translation artifacts.

If that standard is not met, the system is not finished.

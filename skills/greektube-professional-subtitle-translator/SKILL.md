# GreekTube Professional Subtitle Translator v1

## Purpose

This skill defines the canonical translation and subtitle-authoring pipeline for GreekTube.

The goal is not literal cue-by-cue translation. The goal is professional Greek subtitles that preserve the speaker's meaning and read naturally while remaining faithful to the original timing.

The source subtitle file is treated as **timing evidence plus source words**. It is not assumed to contain valid sentence boundaries.

The canonical pipeline is:

**RAW SOURCE → SOURCE RECONSTRUCTION → WHOLE-VIDEO UNDERSTANDING → SEMANTIC SPANS → PROFESSIONAL GREEK TRANSLATION → BILINGUAL QA → SUBTITLE AUTHORING → TIMING ALIGNMENT → FINAL QC → PUBLISH**

No stage may be skipped for production-quality subtitles.

---

## 1. Non-negotiable principles

1. **Meaning comes before cue boundaries.**
   Never assume that one YouTube/SRT cue equals one sentence or one translation unit.

2. **Understand first. Translate second.**
   The full reconstructed source transcript must be understood before final translation begins.

3. **Translate semantic spans rather than isolated cues.**
   Short dependent answers such as `I do`, `I don't`, `Exactly`, `It can`, `They did`, `That's why` or `Not necessarily` must be interpreted from their conversational context.

4. **Original timestamps are immutable evidence.**
   They may be reallocated for final subtitle events but their chronological source relationship must never be lost.

5. **Natural Greek over English-shaped Greek.**
   Translate the intended meaning into idiomatic modern Greek while preserving factual content and speaker intent.

6. **No invention. No silent correction of claims.**
   Context may disambiguate meaning but must never introduce information not supported by the source.

7. **Preserve epistemic strength exactly.**
   `may`, `might`, `could`, `probably`, `I think`, `it appears` and similar hedging must not become certainty.

8. **Preserve negation exactly.**
   A lost `not`, `never`, `no`, `without` or equivalent is a hard failure.

9. **Preserve attribution exactly.**
   `He claims`, `research suggests`, `they believe` and similar reported statements must not become the current speaker's own claim.

10. **Quality failure blocks publication.**
    If the semantic translator or QA stage is unavailable the video remains `translation_pending`. Do not publish a literal fallback as final production subtitles.

---

## 2. Inputs

Accepted source inputs may include:

- YouTube timed captions
- SRT
- VTT
- timestamped plain text
- manually supplied transcript with timing anchors
- ASR transcript with timestamps

Every source cue must be normalized internally to:

```ts
type RawCue = {
  id: string;
  start: number;
  end: number;
  text: string;
};
```

The original cue ID and original timing must remain traceable through the entire pipeline.

---

## 3. Stage A — Source normalization

Normalize the incoming source without translating it.

Required operations:

- decode entities
- normalize whitespace
- preserve meaningful punctuation when trustworthy
- remove obvious technical artifacts
- identify zero-duration or malformed cues
- preserve non-verbal information only when relevant to the viewer
- preserve numbers and units exactly
- preserve names and acronyms
- mark suspicious ASR tokens rather than guessing silently

Do not yet rewrite the transcript into Greek.

### Fillers

Speech fillers may be removed only when all of the following are true:

- they carry no semantic meaning
- they do not signal hesitation that matters to tone
- removal does not change the speaker's stance
- removal improves subtitle readability

Examples that may often be omitted: isolated `um`, `uh`, repeated false starts.

Examples that may matter and therefore require judgment: `well`, `actually`, `I mean`, `you know`, `so`.

---

## 4. Stage B — Source reconstruction

The raw timed cues must be reconstructed into coherent source-language discourse before translation.

### Objective

Produce a repaired English transcript containing real sentences and conversational turns while retaining a mapping to the original timing anchors.

### Reconstruction rules

Merge adjacent cues when they are parts of the same semantic unit such as:

- one sentence split by automatic captions
- a question split across cues
- an answer whose meaning depends on the previous question
- a clause ending in the next cue
- a phrasal verb split by a cue boundary
- noun phrases split by a cue boundary
- quoted speech split arbitrarily
- a speaker turn whose first words depend on the previous turn

Do not merge across a genuine topic transition or clear speaker transition unless needed for context.

### Required output

```ts
type ReconstructedUnit = {
  id: string;
  sourceCueIds: string[];
  start: number;
  end: number;
  speaker?: string;
  type: "statement" | "question" | "answer" | "continuation" | "other";
  text: string;
};
```

### Example

Raw cues:

```text
00:00 Do you think we'll be able to live forever soon
00:04 or at least significantly extend life in the next two decades?
00:06 I do.
00:07 And I think the reason is that we've discovered the mechanism of aging.
```

Reconstructed discourse:

```text
Q: Do you think we'll be able to live forever soon or at least significantly extend life in the next two decades?
A: I do. And I think the reason is that we've discovered the mechanism of aging.
```

The raw cue boundaries must not force translation boundaries.

---

## 5. Stage C — Whole-video understanding

Before final translation the complete reconstructed transcript must be analyzed as one discussion.

For long videos this may be built hierarchically from segments but the final translation brief must represent the whole video.

### Required understanding brief

The brief must contain:

- main topic
- purpose of the discussion
- speakers and roles when identifiable
- major sections/topics
- claims and positions by speaker
- question/answer relationships
- recurring terminology
- technical glossary
- proper names
- acronyms
- pronoun/reference ambiguities
- jokes and irony where relevant
- tone and stance
- uncertainty/hedging patterns
- known transcription ambiguities
- important numerical facts and units

### Translation glossary

Create one locked glossary before translation when recurring terminology exists.

Example:

```text
epigenetic reprogramming → επιγενετικός επαναπρογραμματισμός
Yamanaka factors → παράγοντες Yamanaka
ribosome → ριβόσωμα
mitochondria → μιτοχόνδρια
```

A glossary may be revised only when later context proves an earlier interpretation wrong. Any revision must apply consistently across the complete subtitle file.

---

## 6. Stage D — Semantic span construction

This is the core translation unit.

A **semantic span** contains enough source context to express one coherent meaning.

A semantic span may contain one reconstructed unit or several closely connected units.

### Span boundaries should prefer

- completed thoughts
- sentence boundaries
- question + short dependent answer
- closely linked clauses
- one speaker's coherent turn
- short back-and-forth exchanges where dependency is strong

### Never isolate context-dependent micro-utterances

Examples:

```text
Do you think...? / I do.
You don't agree? / I do.
Did they finish? / They did.
Could it work? / It could.
Why? / Because...
```

The translator must receive the dependency that resolves the meaning.

### Span context package

For every translation request provide:

- whole-video understanding brief
- locked glossary
- preceding semantic span in source
- preceding approved Greek span when available
- current semantic span
- following semantic span in source
- speaker information
- source timing anchors

The preceding and following context are **read-only disambiguation context**. They must never leak facts into the current span.

---

## 7. Stage E — Professional Greek translation

Translate meaning into natural modern Greek.

### Fidelity requirements

Preserve:

- factual meaning
- who says what
- questions and answers
- negation
- uncertainty
- causal direction
- chronology
- quantities
- percentages
- dates
- doses
- units
- names
- acronyms
- technical meaning
- emotional tone when relevant
- humour and irony when translatable

### Greek quality requirements

The Greek must:

- sound written by a professional Greek audiovisual translator
- avoid literal English syntax
- avoid unnatural calques
- use concise spoken Greek appropriate for subtitles
- preserve technical precision
- be internally consistent
- use correct accents and punctuation
- avoid unnecessary verbosity
- reduce wording only when required for reading speed without losing essential meaning

### Context-sensitive translation example

Source:

```text
Q: Do you think we'll be able to significantly extend human life?
A: I do.
```

Correct:

```text
Πιστεύετε ότι θα μπορέσουμε να παρατείνουμε σημαντικά την ανθρώπινη ζωή;
Ναι, το πιστεύω.
```

Hard failure:

```text
Το κάνω.
```

### Another ambiguity example

Source:

```text
Q: You don't think this will fail?
A: I do.
```

The translator must resolve what `I do` refers to from the actual discourse. It must not apply a fixed dictionary replacement.

---

## 8. Stage F — Bilingual QA pass

Every translated span must pass a second EN↔EL semantic review before subtitle authoring.

The reviewer sees the reconstructed English and the proposed Greek plus the relevant context.

### Hard QA checks

Reject or repair when any of these occur:

- meaning changed
- negation lost or invented
- uncertainty strengthened or weakened
- question/answer relationship mistranslated
- pronoun/reference resolved incorrectly
- speaker attribution changed
- association changed into causation
- chronology changed
- number changed
- unit changed
- name changed incorrectly
- acronym corrupted
- technical term inconsistent
- sentence is grammatically broken
- Greek sounds like literal machine translation
- content omitted without readability justification
- unsupported content added

### Special ambiguity watch list

Always inspect carefully:

- do / does / did as short answers
- can / could
- will / would
- may / might
- should
- neither / either
- not / no / never
- pronouns such as it / they / this / that
- reported speech
- rhetorical questions
- irony and sarcasm
- interrupted sentences
- corrections and false starts

### QA outcome

Each span receives one of:

- `approved`
- `repair_required`
- `manual_review_required`

Only approved spans continue automatically.

---

## 9. Stage G — Greek subtitle authoring

Only after the Greek semantic translation is approved do we create final display subtitles.

The final subtitle boundaries are based on:

**meaning + speech timing + readability + Greek syntax**

They are not copied blindly from YouTube cue boundaries.

### GreekTube display rules

Hard rules:

- maximum 2 lines
- target maximum 42 characters per line
- minimum event duration 1.0 second
- maximum event duration 7.0 seconds unless a documented exceptional case requires otherwise
- adult reading speed target: maximum 17 characters per second
- no overlapping subtitle events
- no timing inversion
- no zero-duration events
- no flashing micro-subtitles

GreekTube intentionally uses a 1.0-second minimum even though some professional delivery standards allow slightly shorter events.

### Line breaking

Prefer one line when possible.

When two lines are needed break at natural grammatical boundaries.

Prefer breaks:

- after punctuation
- before conjunctions when natural
- before prepositional phrases when natural
- between complete syntactic chunks

Do not separate:

- article from noun
- adjective from noun when they form one phrase
- first name from last name
- subject pronoun from verb
- auxiliary from main verb
- negation from verb
- preposition from its required complement when avoidable

When multiple valid layouts exist prefer a balanced or slightly bottom-heavy subtitle rather than leaving one or two orphan words on a line.

---

## 10. Stage H — Timing alignment

The approved Greek semantic text must be aligned back to the source audio using the original timing anchors.

### Alignment invariants

- preserve chronological order
- preserve source coverage
- never swap semantic order to fit timings
- never drop content silently
- never duplicate content across adjacent events
- keep question and answer timing attached to the correct speaker turn
- use pauses and speech boundaries when available
- avoid subtitle changes in the middle of a tightly connected phrase when a better boundary exists

### Timing hierarchy

Prefer alignment evidence in this order when available:

1. word-level audio alignment
2. repaired source cue timings
3. original raw cue timings
4. interpolation inside an anchored semantic span

Never invent timings outside the source span merely to make text fit.

If reading-speed requirements cannot be satisfied within the available audio window then condense the Greek wording while preserving meaning. If this remains impossible flag the span for review.

---

## 11. Final full-video QC

Before publication run full-file validation across four layers.

### A. Semantic integrity

- all meaningful source content covered
- no duplicated ideas from alignment
- no unsupported additions
- no obvious mistranslations
- no context-dependent short answers translated literally
- no contradictory terminology

### B. Numerical integrity

Validate source against Greek for:

- numbers
- percentages
- currencies
- dates
- ages
- measurements
- doses
- scientific units

Any unexplained mismatch is a hard failure.

### C. Subtitle timing integrity

Validate:

- chronological monotonicity
- no overlaps
- no negative duration
- no event below 1.0 second
- no event above 7.0 seconds without explicit exemption
- no malformed timestamps
- complete coverage mapping back to source spans

### D. Readability integrity

Validate:

- maximum 2 lines
- approximately 42 characters maximum per line
- adult reading speed ≤17 CPS by default
- syntactically sound line breaks
- no orphan words when avoidable
- no accidental all-caps text
- no technical markers or placeholders
- no translation-engine artifacts

---

## 12. Publication gate

A video may become `published` only if:

```text
source_normalized = true
source_reconstructed = true
whole_video_understanding = ready
semantic_spans = complete
translation = complete
bilingual_qa = passed
subtitle_authoring = complete
timing_qc = passed
semantic_qc = passed
readability_qc = passed
artifact_scan = clean
```

If any required stage fails:

```text
publication_status = translation_pending | review_required | failed
```

Do not silently downgrade to a literal translator.

---

## 13. Provider fallback policy

Provider availability must never determine subtitle quality.

Allowed:

```text
primary semantic model unavailable
→ wait/cooldown
→ approved equivalent semantic model
→ resume from checkpoint
```

Forbidden for final publication:

```text
semantic model unavailable
→ isolated Google/per-cue translation
→ publish
```

Fast literal translation may exist only as an explicitly labelled preview mode and must never overwrite an approved professional translation.

---

## 14. Checkpoints and credit efficiency

Persist validated work at every expensive stage:

- normalized source hash
- reconstructed transcript
- whole-video understanding brief
- glossary
- semantic spans
- approved translated spans
- QA results
- final subtitle events

On retry resume from the latest valid checkpoint.

Never retranslate already approved spans unless:

- source changed
- glossary changed in a way that affects the span
- QA detected a semantic dependency requiring revision
- the user explicitly requests a new translation

Provider 429 or transient errors must respect cooldowns. Do not loop aggressively.

---

## 15. Regression test suite

The following classes of examples must always remain in automated or fixture-based regression tests.

### Test 1 — Dependent affirmative answer

```text
EN Q: Do you think it will work?
EN A: I do.
```

Expected meaning:

```text
EL: Πιστεύετε ότι θα λειτουργήσει;
EL: Ναι, το πιστεύω.
```

Never:

```text
EL: Το κάνω.
```

### Test 2 — Dependent negative answer

```text
EN Q: Do you think it will work?
EN A: I don't.
```

Expected:

```text
EL: Όχι, δεν το πιστεύω.
```

### Test 3 — Modal uncertainty

```text
EN: This could increase the risk.
```

Expected meaning:

```text
EL: Αυτό θα μπορούσε να αυξήσει τον κίνδυνο.
```

Never convert to certainty:

```text
EL: Αυτό αυξάνει τον κίνδυνο.
```

### Test 4 — Reported claim

```text
EN: He claims the treatment reverses aging.
```

Expected meaning:

```text
EL: Ισχυρίζεται ότι η θεραπεία αντιστρέφει τη γήρανση.
```

Never:

```text
EL: Η θεραπεία αντιστρέφει τη γήρανση.
```

### Test 5 — Split sentence

```text
Cue A: The reason this matters is
Cue B: that the cells stop producing the right protein.
```

Must be reconstructed as one sentence before translation.

### Test 6 — Numerical integrity

```text
EN: 10 mg twice a day for 14 days.
```

Greek must preserve `10 mg`, frequency and `14 days` exactly in meaning.

### Test 7 — Subtitle duration

Any authored event below `1.0s` must fail automatic QC unless merged or retimed.

### Test 8 — Line count

Any display subtitle exceeding 2 lines must fail automatic QC and be reauthored.

### Test 9 — CPS

Any normal adult subtitle above 17 CPS must be condensed or retimed before publication.

### Test 10 — No technical artifacts

Reject outputs containing placeholder markers such as:

```text
ZXQCUE
[[12]]
<TRANSLATE_ME>
```

unless they are literally present in quoted source content.

---

## 16. Validation fixture for n1G3xqgzB2c

The first 60–90 seconds of `n1G3xqgzB2c` are the initial GreekTube v1 regression fixture.

The opening interaction must be reconstructed as a question followed by an affirmative answer.

At approximately `0:06`, `I do` must resolve semantically to:

```text
Ναι, το πιστεύω.
```

Any output equivalent to `Το κάνω` is an automatic semantic QA failure.

This fixture must be tested whenever reconstruction, semantic-span building, translation prompts, alignment logic or subtitle authoring changes.

---

## 17. Professional style reference

GreekTube uses its own product rules but should remain compatible with established professional subtitle practice where appropriate.

Reference principles incorporated into this skill include:

- source subtitle templates should be edited and context-aware rather than assumed verbatim
- maximum two display lines
- approximately 42 characters per line for Greek
- Greek adult reading speed up to 17 characters per second
- syntactic line breaking
- duration and audio synchronization discipline

Official reference material:

- Netflix Greek Timed Text Style Guide: https://partnerhelp.netflixstudios.com/hc/en-us/articles/235511047-Greek-Timed-Text-Style-Guide
- Netflix Timed Text Style Guide — General Requirements: https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements
- Netflix Subtitle Templates: https://partnerhelp.netflixstudios.com/hc/en-us/articles/219375728-Timed-Text-Style-Guide-Subtitle-Templates
- Netflix Subtitle Timing Guidelines: https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines

These references inform quality targets. GreekTube remains responsible for its own implementation and validation rules.

---

## 18. Definition of done

A GreekTube translation is done only when a viewer can watch the entire video without noticing the translation machinery.

The subtitles should feel as if a skilled Greek subtitler understood the complete conversation and authored the Greek subtitles deliberately for the screen.

**The final objective is not translated cues. It is a coherent Greek viewing experience.**

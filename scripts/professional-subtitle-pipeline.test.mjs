import assert from "node:assert/strict";
import {
  authorApprovedSpans,
  buildSemanticSpans,
  reconstructSourceUnits,
  unitTranslationFailure,
  validateProfessionalSubtitleFile,
} from "../app/api/captions/professional-pipeline.ts";

const source = [
  { start: 0, duration: 3, text: "Do you think it will" },
  { start: 3, duration: 3, text: "work?" },
  { start: 6, duration: 1.5, text: "I do." },
  { start: 7.5, duration: 4, text: "And I think the reason is simple." },
];

const units = reconstructSourceUnits(source);
assert.equal(units.length, 3, "split YouTube cues are reconstructed into real sentence units");
assert.equal(units[0].text, "Do you think it will work?");
assert.equal(units[0].type, "question");
assert.equal(units[1].text, "I do.");
assert.equal(units[1].type, "answer");
assert.deepEqual(
  units[0].sourceAnchors.map(anchor => [anchor.start, anchor.end]),
  [[0, 3], [3, 6]],
  "source timing anchors survive reconstruction",
);

const spans = buildSemanticSpans(units);
assert.equal(spans[0].units.length, 2, "question and context-dependent short answer share one semantic span");
assert.equal(spans[0].units[0].type, "question");
assert.equal(spans[0].units[1].type, "answer");

assert.equal(
  unitTranslationFailure(units[1], "Το κάνω.", units[0]),
  "literal-dependent-answer",
  "I do after Do you think must never survive as literal Το κάνω",
);
assert.equal(
  unitTranslationFailure(units[1], "Ναι, το πιστεύω.", units[0]),
  null,
  "contextual affirmative answer is accepted",
);

const translations = new Map([
  [units[0].id, "Πιστεύετε ότι θα λειτουργήσει;"],
  [units[1].id, "Ναι, το πιστεύω."],
]);
const authored = authorApprovedSpans([spans[0]], translations);
assert.ok(authored.length >= 2, "approved semantic span is authored back into timed Greek subtitle events");
assert.deepEqual(validateProfessionalSubtitleFile(authored), [], "authored events pass professional timing/readability gates");
assert.ok(authored.every(cue => cue.duration >= 1), "no authored subtitle is below one second");
assert.ok(authored.every(cue => cue.text.length <= 84), "subtitle events fit the two-line character envelope");
assert.equal(authored.find(cue => cue.text === "Ναι, το πιστεύω.")?.start, 6, "dependent answer starts on its real source speech anchor");

// v1 used max(sourceStart, previousTimeline), which could silently shift a new
// semantic phrase later than its speech. v1.1 must fail rather than drift.
assert.throws(
  () => authorApprovedSpans([spans[0]], translations, 0.5),
  /professional-anchor-drift/,
  "authoring must never hide timing debt by delaying the next semantic phrase",
);

const boundaryDuplicate = [
  { start: 0, duration: 2, text: "Έχεις ήδη χάσει." },
  { start: 2, duration: 2, text: "Χάσει. Αυτή είναι η διαφορά." },
];
assert.ok(
  validateProfessionalSubtitleFile(boundaryDuplicate).some(issue => issue.startsWith("boundary-repeat:0-1:χασει")),
  "accidental repeated terminal word across adjacent subtitle boundaries is rejected",
);
assert.deepEqual(
  validateProfessionalSubtitleFile([
    { start: 0, duration: 2, text: "Έχεις ήδη χάσει." },
    { start: 2, duration: 2, text: "Αυτή είναι η διαφορά." },
  ]),
  [],
  "clean sentence continuation across subtitle boundaries is accepted",
);

assert.ok(
  validateProfessionalSubtitleFile([
    { start: 0, duration: 2, text: "Μια πρωτεΐνη είναι αλυσίδα αμινοξέων." },
    { start: 2, duration: 1, text: "Οι πρωτεΐνες" },
  ]).some(issue => issue === "orphan-event:1"),
  "one/two-word terminal subtitle events are rejected when attached to continuous speech",
);

console.log("professional subtitle pipeline regression checks passed");

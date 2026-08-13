import assert from "node:assert/strict";
import {
  applyValidatedCorrections,
  buildContextWindow,
  candidatePreservesHardIntegrity,
  obviousGreekFluencyIssue,
} from "../app/api/captions/quality-review.ts";

const english = [
  { start: 211, duration: 6, text: "the T3 and T4, the active and inactive thyroid hormone levels, are good in" },
  { start: 217, duration: 4, text: "these people. They produce enough thyroid hormone." },
];
const greek = [
  { start: 211, duration: 6, text: "το T3 και το T4, τα ενεργά και ανενεργά επίπεδα θυρεοειδικής ορμόνης, είναι καλά σε" },
  { start: 217, duration: 4, text: "αυτοί οι άνθρωποι. Εκεί παράγουν αρκετή θυρεοειδική ορμόνη." },
];

assert.equal(obviousGreekFluencyIssue(greek[0].text), true, "dangling 'είναι καλά σε' should be reviewed contextually");
assert.equal(obviousGreekFluencyIssue(greek[1].text), false, "nominative alone is not enough to auto-flag without a governing preposition in the same cue");

const window = buildContextWindow(english, greek, 1, 1);
assert.deepEqual(window.english.map(item => item.index), [0, 1], "review window must include neighbouring English context");
assert.deepEqual(window.greek.map(item => item.index), [0, 1], "review window must include neighbouring Greek context");

assert.equal(
  candidatePreservesHardIntegrity(english[1].text, "αυτούς τους ανθρώπους. Παράγουν αρκετή θυρεοειδική ορμόνη."),
  true,
  "meaning-aware Greek correction with unchanged numeric integrity should be accepted",
);

const corrected = applyValidatedCorrections(english, greek, [
  { index: 1, text: "αυτούς τους ανθρώπους. Παράγουν αρκετή θυρεοειδική ορμόνη.", reason: "case agreement across cue boundary" },
]);
assert.equal(corrected[1].text, "αυτούς τους ανθρώπους. Παράγουν αρκετή θυρεοειδική ορμόνη.");
assert.equal(corrected[1].start, greek[1].start, "review must never change cue start time");
assert.equal(corrected[1].duration, greek[1].duration, "review must never change cue duration");

const numericEnglish = [{ start: 0, duration: 3, text: "Take 25 mg and T3." }];
const numericGreek = [{ start: 0, duration: 3, text: "Πάρτε 25 mg και T3." }];
const rejected = applyValidatedCorrections(numericEnglish, numericGreek, [
  { index: 0, text: "Πάρτε 50 mg και T3." },
]);
assert.equal(rejected[0].text, numericGreek[0].text, "review must reject changed numeric meaning");

console.log("caption contextual quality-review regression checks passed");

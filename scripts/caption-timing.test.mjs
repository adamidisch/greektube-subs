import assert from "node:assert/strict";
import {
  allocateSequentialCueWindows,
  effectiveSequentialRawWindows,
  recoverMalformedAlignedTimings,
  timingInversionCount,
} from "../app/api/captions/timing.ts";

const near = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
};

// Exact persisted Supadata evidence. Its display windows overlap, but the
// next raw start is the next spoken-text onset for a sequential subtitle cue.
const raw = [
  { start: 40.48, duration: 5.28, text: "you get um uh uh uh keto flu. Uh" },
  { start: 43.44, duration: 4.08, text: "sometimes if you're um you know allergic" },
];
const effective = effectiveSequentialRawWindows(raw);
near(effective[0].start, 40.48, "first source onset is preserved");
near(effective[0].duration, 2.96, "first source span ends at the next raw onset");
near(effective[1].duration, 4.08, "second span remains natural");

const splitExact = allocateSequentialCueWindows(effective[0], [8, 1]);
near(splitExact[0].start, 40.48, "first fragment starts at source onset");
near(splitExact[1].start, 43.111111111111114, "terminal Uh stays inside the effective source span");
near(splitExact[1].start + splitExact[1].duration, 43.44, "terminal Uh cannot spill into the next source cue");

const threeFragments = allocateSequentialCueWindows({ start: 10, duration: 6 }, [2, 3, 1]);
assert.deepEqual(threeFragments, [
  { start: 10, duration: 2 },
  { start: 12, duration: 3 },
  { start: 15, duration: 1 },
]);

const withGap = effectiveSequentialRawWindows([
  { start: 0, duration: 2, text: "first" },
  { start: 4, duration: 1, text: "second" },
]);
near(withGap[0].duration, 2, "natural gap is preserved");

// Exact malformed repaired pair 22 -> 23. Recovery is only for old durable
// checkpoints: text remains unchanged and Greek receives the English plan.
const english = [
  { start: 45.17333333333333, duration: 0.586666666666666, text: "Uh" },
  { start: 43.44, duration: 2.3200000000000003, text: "sometimes if you're um you know allergic" },
  { start: 45.76, duration: 1, text: "next cue" },
];
const greek = [
  { ...english[0], text: "Ε" },
  { ...english[1], text: "Μερικές φορές, αν είσαι αλλεργικός" },
  { ...english[2], text: "επόμενο cue" },
];
const recovered = recoverMalformedAlignedTimings(english, greek);
assert.equal(recovered.recovered, true);
assert.equal(timingInversionCount(recovered.english), 0);
assert.equal(timingInversionCount(recovered.greek), 0);
assert.deepEqual(recovered.english.map(cue => cue.text), english.map(cue => cue.text));
assert.deepEqual(recovered.greek.map(cue => cue.text), greek.map(cue => cue.text));
recovered.english.forEach((cue, index) => {
  near(cue.start, recovered.greek[index].start, "English/Greek recovered starts stay aligned");
  near(cue.duration, recovered.greek[index].duration, "English/Greek recovered durations stay aligned");
});
near(recovered.english[0].start, 43.44, "recovery preserves the conflict group's outer start");
near(recovered.english[1].start + recovered.english[1].duration, 45.76, "recovery preserves the conflict group's outer end");

console.log("caption timing tests passed");

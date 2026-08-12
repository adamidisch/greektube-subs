import assert from "node:assert/strict";
import { groupEnglishCuesForContext, stripEnglishSpeechFillers } from "../app/api/captions/translation-text.ts";

assert.equal(stripEnglishSpeechFillers("Um, this is important."), "this is important.");
assert.equal(stripEnglishSpeechFillers("uh this is important"), "this is important");
assert.equal(stripEnglishSpeechFillers("hmm, this is important"), "this is important");
assert.equal(stripEnglishSpeechFillers("ah, this is important"), "this is important");
assert.equal(stripEnglishSpeechFillers("MSM is useful"), "MSM is useful");

const grouped = groupEnglishCuesForContext([
  { start: 0, duration: 1.0, text: "the business of" },
  { start: 1.0, duration: 1.0, text: "digesting fat is" },
  { start: 2.0, duration: 1.2, text: "enormously demanding of energy." },
  { start: 3.4, duration: 1.0, text: "The next sentence starts here." },
]);

assert.equal(grouped.length, 2);
assert.equal(grouped[0].text, "the business of digesting fat is enormously demanding of energy.");
assert.equal(grouped[0].start, 0);
assert.ok(Math.abs(grouped[0].duration - 3.2) < 0.001);
assert.equal(grouped[1].text, "The next sentence starts here.");

console.log("v7.4.1 quality/reliability tests passed");

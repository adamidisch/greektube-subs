import assert from "node:assert/strict";
import { auditSubtitleSequence } from "../app/api/audio-timing/readability.ts";

const screenshotWindow = auditSubtitleSequence([
  {
    id: "5:03",
    startMs: 303_200,
    endMs: 306_080,
    text: "έτσι. Χρειάζεται δουλειά και ξέρετε εμείς εδώ μπορούμε να τα",
    lineCount: 3,
    longestLineCharacters: 24,
  },
  {
    id: "5:06",
    startMs: 306_080,
    endMs: 308_075,
    text: "συζητάμε, αλλά μετά αυτός ο άνθρωπος πρέπει",
    lineCount: 3,
    longestLineCharacters: 19,
  },
  {
    id: "5:08",
    startMs: 308_075,
    endMs: 310_320,
    text: "να φύγει και να τα εφαρμόσει πραγματικά",
    lineCount: 2,
    longestLineCharacters: 23,
  },
]);

assert.equal(screenshotWindow.ok, false);
assert.equal(screenshotWindow.hardCpsFailures, 2);
assert.equal(screenshotWindow.cues[0].action, "retime_or_condense");
assert.equal(screenshotWindow.cues[1].action, "retime_or_condense");
assert.equal(screenshotWindow.cues[2].action, "retime");

const clean = auditSubtitleSequence([{
  id: "clean",
  startMs: 0,
  endMs: 3_000,
  text: "Αυτός ο υπότιτλος διαβάζεται άνετα.",
  lineCount: 1,
  longestLineCharacters: 37,
}]);
assert.equal(clean.ok, true);

console.log("audio timing readability tests passed");

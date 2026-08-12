import assert from "node:assert/strict";
import { canonicalNumberTokens, numberTokensMatch } from "../app/api/captions/numeric-integrity.ts";

assert.deepEqual(canonicalNumberTokens("early 1980s"), ["1980"]);
assert.deepEqual(canonicalNumberTokens("in the 1990s"), ["1990"]);
assert.deepEqual(canonicalNumberTokens("during the 2000s"), ["2000"]);

assert.equal(numberTokensMatch("early 1980s", "στις αρχές της δεκαετίας του 1980"), true);
assert.equal(numberTokensMatch("in the 1990s", "τη δεκαετία του 1990"), true);
assert.equal(numberTokensMatch("during the 2000s", "κατά τη δεκαετία του 2000"), true);
assert.equal(
  numberTokensMatch("GP in the 19 early 1980s, it was", "Το GP στις αρχές της δεκαετίας του 1980 του 19, ήταν"),
  true,
);
assert.equal(numberTokensMatch("early 1980s", "στις αρχές της δεκαετίας του 1990"), false);

console.log("caption numeric integrity regressions passed");

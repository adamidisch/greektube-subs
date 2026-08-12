import assert from "node:assert/strict";
import { splitSubtitleSentences } from "../app/api/captions/sentence-split.ts";
import { hasTranslatableWordTokens } from "../app/api/captions/translation-text.ts";

assert.deepEqual(
  splitSubtitleSentences("but it's SIBO 2.0."),
  ["but it's SIBO 2.0."],
  "decimal 2.0 must remain inside one sentence cue",
);
assert.deepEqual(
  splitSubtitleSentences("Dose 3.5 mg. Then continue."),
  ["Dose 3.5 mg.", "Then continue."],
  "decimal dose must not create an orphan numeric cue",
);
assert.deepEqual(
  splitSubtitleSentences("Version 2.0.1 works. Next."),
  ["Version 2.0.1 works.", "Next."],
  "multiple digit-separated periods must be preserved",
);
assert.deepEqual(
  splitSubtitleSentences("Dr. Smith agrees. Next."),
  ["Dr. Smith agrees.", "Next."],
  "existing abbreviation merge behaviour must remain",
);

assert.equal(hasTranslatableWordTokens(["0"], []), false, "numeric-only cue is passthrough-safe");
assert.equal(hasTranslatableWordTokens(["SIBO", "2"], ["sibo"]), false, "protected acronym plus number needs no Greek letters");
assert.equal(hasTranslatableWordTokens(["B3"], ["b3"]), false, "protected technical token is passthrough-safe");
assert.equal(hasTranslatableWordTokens(["Fungi"], []), true, "ordinary English word still requires translation");
assert.equal(hasTranslatableWordTokens(["MSM", "and", "B3"], ["msm", "b3"]), true, "mixed protected tokens and English prose still require translation");

console.log("caption translation edge-case regression checks passed");

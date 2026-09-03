import assert from "node:assert/strict";
import {
  MIN_DISPLAY_SECONDS,
  PAGE_SPEECH_LEAD_SECONDS,
  packSubtitles,
  packTextAt,
} from "../app/subtitle-display.ts";

const cue = (start, duration, text) => ({ start, duration, text });

// Regression from n1G3xqgzB2c around 1:02. Before v1.1 every word in this
// 5.523-second source cue inherited 1:02 as its word start. Multi-page display
// then advanced at 1-second intervals and could leave only «πρωτεΐνες» on
// screen. Page changes must instead follow estimated speech position.
const proteinCue = cue(
  62,
  5.523,
  "τα αμινοξέα αναδιπλώνονται σε μια τρισδιάστατη μηχανή: την πρωτεΐνη. Οι πρωτεΐνες",
);
const proteinPack = packSubtitles([proteinCue]).packs[0];
assert.ok(proteinPack, "protein regression cue must produce a display pack");
assert.ok(proteinPack.pages.length >= 2, "long protein cue should use stable display pages");

for (const page of proteinPack.pages) {
  const words = page.text.replace(/\n/g, " ").trim().split(/\s+/).filter(Boolean);
  assert.ok(words.length >= 3, `no display page may be an orphan fragment: ${page.text}`);
}

assert.ok(
  packTextAt(proteinPack, 64).replace(/\n/g, " ").trim().split(/\s+/).length >= 3,
  "at 1:04 the overlay must never collapse to the single word «πρωτεΐνες»",
);

for (let index = 1; index < proteinPack.pages.length; index += 1) {
  assert.ok(
    proteinPack.pages[index].at - proteinPack.pages[index - 1].at >= MIN_DISPLAY_SECONDS - 1e-9,
    "pages retain the one-second minimum reading window",
  );
}

// A single source cue containing two pages must not schedule page two merely
// at cueStart + 1s. Its start should be influenced by the word position inside
// the source timing window.
if (proteinPack.pages.length === 2) {
  assert.ok(
    proteinPack.pages[1].at > proteinCue.start + MIN_DISPLAY_SECONDS + PAGE_SPEECH_LEAD_SECONDS,
    "second page should follow speech progress instead of an arbitrary one-second ticker",
  );
}

// Text and chronology remain immutable.
const renderedWords = proteinPack.pages
  .map(page => page.text.replace(/\n/g, " ").trim())
  .join(" ")
  .replace(/\s+/g, " ")
  .trim();
assert.equal(renderedWords, proteinCue.text, "page balancing must preserve every word exactly once and in order");
assert.equal(proteinPack.start, proteinCue.start, "source start stays immutable");
assert.equal(proteinPack.start + proteinPack.duration, proteinCue.start + proteinCue.duration, "source end stays immutable");

console.log("subtitle speech-alignment v1.1 regression checks passed");

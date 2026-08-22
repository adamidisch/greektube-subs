import assert from "node:assert/strict";
import { groupEnglishCuesForContext, stripEnglishSpeechFillers } from "../app/api/captions/translation-text.ts";
import { validateSubtitlePair } from "../app/api/captions/subtitle-contract.ts";

{
  const source = "Um, I think this is 5 mg, uh, daily.";
  assert.equal(
    stripEnglishSpeechFillers(source),
    source,
    "stored/display English must preserve spoken hesitation words",
  );
}

{
  assert.equal(
    stripEnglishSpeechFillers("<break time=\"500ms\"/>  Hello   world  !"),
    "Hello world!",
    "non-spoken markup and whitespace artifacts may be normalized",
  );
}

{
  const context = groupEnglishCuesForContext([
    { start: 0, duration: 1.5, text: "Um, I think" },
    { start: 1.5, duration: 1.5, text: "this is correct." },
  ]);
  assert.equal(context.length, 1);
  assert.equal(context[0].text, "I think this is correct.", "translation-only context may drop isolated fillers");
}

{
  const english = [
    { start: 0, duration: 2, text: "Take 5 mg daily." },
    { start: 2, duration: 2, text: "Vitamin D may help." },
  ];
  const greek = [
    { start: 0, duration: 2, text: "Πάρε 5 mg καθημερινά." },
    { start: 2, duration: 2, text: "Η βιταμίνη D μπορεί να βοηθήσει." },
  ];
  assert.equal(validateSubtitlePair(english, greek).ok, true);
}

{
  const english = [{ start: 10, duration: 3, text: "Take 5 mg daily." }];
  const greek = [{ start: 10.02, duration: 3, text: "Πάρε 10 mg καθημερινά." }];
  const result = validateSubtitlePair(english, greek);
  assert.equal(result.ok, false);
  assert.equal(result.timestampMismatches, 1);
  assert.equal(result.numericMismatches, 1);
}

console.log("subtitle-contract tests passed");

import assert from "node:assert/strict";
import {conciseEnglishVideoTitle,editorExportStem} from "../app/editor-export-filename.ts";

assert.equal(
  conciseEnglishVideoTitle(
    "Let Food Be Thy Medicine: EAT THESE FOODS to Heal Your Microbiome | Dr. Natasha Campbell-McBride",
    "fX2z-BF8Jac",
  ),
  "Let Food Be Thy Medicine",
);
assert.equal(
  editorExportStem({
    originalTitle:"Let Food Be Thy Medicine: EAT THESE FOODS to Heal Your Microbiome | Dr. Natasha Campbell-McBride",
    speakerName:"Dr. Natasha Campbell-McBride",
    fallback:"fX2z-BF8Jac",
  }),
  "Let Food Be Thy Medicine - Dr Natasha Campbell-McBride",
);
assert.equal(
  editorExportStem({originalTitle:"",speakerName:"",fallback:"fX2z-BF8Jac"}),
  "fX2z-BF8Jac",
);
console.log("editor export filename tests passed");

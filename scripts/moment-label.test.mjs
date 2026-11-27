import assert from "node:assert/strict";
import { momentLabel } from "../app/moment-label.ts";
const FB = "Αποθηκευμένη στιγμή";
const label = text => momentLabel(text, FB);
const words = s => s.split(" ").length;
for (const text of [
  "Η αντίσταση στην ινσουλίνη είναι η αιτία των περισσότερων προβλημάτων.",
  "Και τότε ο θυρεοειδής παράγει λιγότερη ενέργεια στα κύτταρα",
  "You need your mitochondrial engine to produce energy.",
  "Έτσι θα το κάνουμε αυτό και μετά θα δούμε",
]) {
  const out = label(text);
  assert.ok(words(out) >= 2 && words(out) <= 3, `2–3 λέξεις: «${out}»`);
  assert.ok(out.length <= 34, `μήκος: «${out}»`);
  assert.equal(out, out.charAt(0).toLocaleUpperCase() + out.slice(1), "κεφαλαίο αρχικό");
}
assert.match(label("Η αντίσταση στην ινσουλίνη είναι η αιτία"), /ινσουλίν/i, "κρατά την ουσιαστική λέξη");
assert.equal(label(""), FB, "κενός υπότιτλος → fallback");
assert.equal(label("και να το"), FB, "μόνο stopwords → fallback");
console.log("moment label tests passed");

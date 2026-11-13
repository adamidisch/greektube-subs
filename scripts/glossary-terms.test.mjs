import assert from "node:assert/strict";
import { glossaryViolations, withApprovedEquivalents, acceptedRenderings } from "../app/api/captions/glossary-terms.ts";
import { parseWordPhrases } from "../app/api/captions/word-authoring.ts";

const glossary = withApprovedEquivalents([{ source: "ketosis", greek: "κέτωση" }]);
const thyroid = glossary.find(entry => entry.source === "underactive thyroid");
assert.deepEqual(acceptedRenderings(thyroid), ["υποθυρεοειδισμός", "υπολειτουργικός θυρεοειδής"], "owner-approved equivalents are added");

const source = "People who get into ketosis but still feel dreadful, that's often a sign of the underactive thyroid.";
assert.deepEqual(glossaryViolations(source, "Όποιος μπαίνει σε κέτωση αλλά νιώθει χάλια, συχνά έχει υποθυρεοειδισμό.", glossary), [], "short equivalent in another case passes");
assert.deepEqual(glossaryViolations(source, "Όποιος μπαίνει σε κέτωση αλλά νιώθει χάλια, συχνά έχει υπολειτουργικό θυρεοειδή.", glossary), [], "full equivalent in another case passes");
assert.deepEqual(glossaryViolations(source, "Όποιος μπαίνει σε κέτωση αλλά νιώθει χάλια, συχνά έχει πρόβλημα στον αδένα.", glossary).map(v => v.source), ["underactive thyroid"], "unapproved rendering is flagged");
assert.deepEqual(glossaryViolations(source, "Όποιος κάνει δίαιτα αλλά νιώθει χάλια, συχνά έχει υποθυρεοειδισμό.", glossary).map(v => v.source), ["ketosis"], "model glossary terms are enforced too");
assert.deepEqual(glossaryViolations("Diagnosing hypothyroidism is not just blood tests.", "Ο υποθυρεοειδισμός δεν διαγιγνώσκεται μόνο από εξετάσεις.", glossary), [], "overlapping source spellings share one rendering");
assert.deepEqual(glossaryViolations("We talk about energy.", "Μιλάμε για ενέργεια.", glossary), [], "absent terms are not required");

const long = [{ source: "wired but tired", greek: "κουρασμένος αλλά σε διαρκή υπερένταση" }];
assert.deepEqual(glossaryViolations("the wired but tired feeling", "νιώθουμε εξαντλημένοι", long), [], "explanatory phrases longer than three words are not enforced");

const packet = { sourceText: "often a sign of the underactive thyroid", globalBrief: { glossary },
  words: ["often", "a", "sign", "of", "the", "underactive", "thyroid"].map((text, i) => ({ wordId: `W${String(i + 1).padStart(6, "0")}`, cueIndex: 0, text, startMs: i * 300, endMs: i * 300 + 250 })) };
const phrase = text => ({ phrases: [{ firstWordId: "W000001", lastWordId: "W000007", text }] });
assert.equal(parseWordPhrases(phrase("συχνά σημάδι υποθυρεοειδισμού"), packet)[0].text, "συχνά σημάδι υποθυρεοειδισμού");
assert.throws(() => parseWordPhrases(phrase("συχνά σημάδι θυρεοειδικού προβλήματος"), packet), /Glossary term not rendered/u, "authoring blocks an unapproved term");
console.log("glossary-terms: ok");

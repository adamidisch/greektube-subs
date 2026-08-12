from pathlib import Path
import json

route_path = Path("app/api/captions/route.ts")
route = route_path.read_text()

old_import = 'import { canonicalNumberTokens, numberTokensMatch } from "@/app/api/captions/numeric-integrity";\n'
new_import = old_import + 'import { splitSubtitleSentences } from "./sentence-split";\nimport { hasTranslatableWordTokens } from "./translation-text";\n'
if old_import not in route:
    raise SystemExit("Expected numeric-integrity import not found")
if 'from "./sentence-split"' not in route:
    route = route.replace(old_import, new_import, 1)

old_split = '''  const matches = text.match(/[^.!?…]+[.!?…]+[\\"')\\]]*|[^.!?…]+$/g)?.map(part => part.trim()).filter(Boolean) || [text];
  if (matches.length <= 1) return [{ ...cue, text }];

  // Avoid treating common abbreviations as sentence endings.
  const parts: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    let part = matches[index];
    while (/\\b(?:Dr|Mr|Mrs|Ms|Prof|St|vs|e\\.g|i\\.e)\\.$/i.test(part) && index + 1 < matches.length) {
      part = `${part} ${matches[index + 1]}`.replace(/\\s+/g, " ").trim();
      index += 1;
    }
    parts.push(part);
  }
  if (parts.length <= 1) return [{ ...cue, text: parts[0] || text }];
'''
new_split = '''  const parts = splitSubtitleSentences(text);
  if (parts.length <= 1) return [{ ...cue, text: parts[0] || text }];
'''
if old_split not in route:
    raise SystemExit("Expected sentence split block not found")
route = route.replace(old_split, new_split, 1)

old_validation = '''  const ordinaryEnglish = englishWordTokens(source).filter(token => !translationProtectedTokens(source).includes(token.toLowerCase()));
  if (ordinaryEnglish.length > 0 && !hasGreekText([{ start: 0, duration: 1, text: target }])) return "non-greek-output";
'''
new_validation = '''  const sourceWordTokens = englishWordTokens(source);
  if (hasTranslatableWordTokens(sourceWordTokens, translationProtectedTokens(source)) &&
      !hasGreekText([{ start: 0, duration: 1, text: target }])) return "non-greek-output";
'''
if old_validation not in route:
    raise SystemExit("Expected non-greek validation block not found")
route = route.replace(old_validation, new_validation, 1)

old_loop = '''  for (const [offset, item] of numbered.entries()) {
    const groqCandidate = groqResults?.get(item.index) || null;
'''
new_loop = '''  for (const [offset, item] of numbered.entries()) {
    const sourceWordTokens = englishWordTokens(item.text);
    if (!hasTranslatableWordTokens(sourceWordTokens, translationProtectedTokens(item.text))) {
      const passthrough = item.text.trim();
      const passthroughReason = translationIntegrityFailure(item.text, passthrough);
      if (passthroughReason) {
        logRejectedTranslationCue(videoId, item.index, item.text, "passthrough", passthrough, passthroughReason);
        throw new Error(`Translation passthrough integrity failed for cue: ${item.index}`);
      }
      output.set(item.index, passthrough);
      console.info("[captions:translation-recovered]", JSON.stringify({ videoId, cueIndex: item.index, provider: "passthrough" }));
      await commitAcceptedCue({ ...slice[offset], text: passthrough }, item.index, "passthrough");
      continue;
    }

    const groqCandidate = groqResults?.get(item.index) || null;
'''
if old_loop not in route:
    raise SystemExit("Expected translation per-cue loop not found")
route = route.replace(old_loop, new_loop, 1)
route_path.write_text(route)

Path("app/api/captions/sentence-split.ts").write_text(r'''const DECIMAL_POINT_SENTINEL = "\uE000";

export function splitSubtitleSentences(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return [] as string[];

  // A period between digits is part of a decimal/version token, not a sentence
  // boundary. Protect it only for segmentation, then restore it verbatim.
  const protectedText = text.replace(/(\d)\.(?=\d)/g, `$1${DECIMAL_POINT_SENTINEL}`);
  const matches = protectedText
    .match(/[^.!?…]+[.!?…]+[\"')\]]*|[^.!?…]+$/g)
    ?.map(part => part.replaceAll(DECIMAL_POINT_SENTINEL, ".").trim())
    .filter(Boolean) || [text];

  if (matches.length <= 1) return matches;

  // Preserve the abbreviation behaviour of the existing splitter.
  const parts: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    let part = matches[index];
    while (/\b(?:Dr|Mr|Mrs|Ms|Prof|St|vs|e\.g|i\.e)\.$/i.test(part) && index + 1 < matches.length) {
      part = `${part} ${matches[index + 1]}`.replace(/\s+/g, " ").trim();
      index += 1;
    }
    parts.push(part);
  }
  return parts;
}
''')

Path("app/api/captions/translation-text.ts").write_text(r'''export function hasTranslatableWordTokens(tokens: string[], protectedTokens: string[]) {
  const protectedSet = new Set(protectedTokens.map(token => token.toLowerCase()));
  return tokens.some(token => /\p{L}/u.test(token) && !protectedSet.has(token.toLowerCase()));
}
''')

Path("scripts/caption-translation-edgecases.test.mjs").write_text(r'''import assert from "node:assert/strict";
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
''')

package_path = Path("package.json")
package = json.loads(package_path.read_text())
if package.get("version") != "7.1.13":
    raise SystemExit(f"Unexpected package version: {package.get('version')}")
package["version"] = "7.1.14"
package.setdefault("scripts", {})["test:caption-edgecases"] = "node --experimental-strip-types scripts/caption-translation-edgecases.test.mjs"
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n")

player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()
if "ver 7.1.13" not in player:
    raise SystemExit("Expected player version label ver 7.1.13 not found")
player = player.replace("ver 7.1.13", "ver 7.1.14")
player_path.write_text(player)

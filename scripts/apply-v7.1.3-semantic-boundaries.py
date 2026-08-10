from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)

route_path = Path("app/api/captions/route.ts")
route = route_path.read_text()

old_grouping = '''  preparedCues.forEach((cue, index) => {
    const next = preparedCues[index + 1];
    current.push(cue);
    characters += cue.text.length;
    const elapsed = cue.start + cue.duration - current[0].start;
    const sentenceEnd = /[.!?…]["')\\]]?$/.test(cue.text.trim());
    const naturalPause = next ? next.start - (cue.start + cue.duration) >= 0.9 : true;
    const longEnough = elapsed >= 4.5 || characters >= 90;
    const mustSplit = elapsed >= 9 || characters >= 180;

    if (mustSplit || (longEnough && (sentenceEnd || naturalPause)) || !next) flush();
  });'''
new_grouping = '''  preparedCues.forEach((cue, index) => {
    const next = preparedCues[index + 1];
    current.push(cue);
    characters += cue.text.length;
    const elapsed = cue.start + cue.duration - current[0].start;
    const sentenceEnd = /[.!?…]["')\\]]?$/.test(cue.text.trim());
    const gap = next ? next.start - (cue.start + cue.duration) : Number.POSITIVE_INFINITY;
    const naturalPause = gap >= 0.65;
    const softPause = gap >= 0.25 && (elapsed >= 5.5 || characters >= 110);
    const mustSplit = elapsed >= 8 || characters >= 160;

    // The source punctuation is authoritative. If YouTube says a sentence has
    // ended (for example "poisoned."), never merge words from the next thought
    // into the same translation unit. A clear spoken pause is also a hard
    // semantic boundary. Only merge fragments while the sentence is genuinely
    // continuing.
    if (sentenceEnd || naturalPause || softPause || mustSplit || !next) flush();
  });'''
route = replace_once(route, old_grouping, new_grouping, "punctuation-aware meaning units")

old_prompt = '''  "Μην μεταφέρεις, ολοκληρώνεις ή δανείζεσαι λέξεις και νόημα από γειτονικό cue, ακόμη και αν μια πρόταση κόβεται στη μέση. " +
  "Διατήρησε πιστά το νόημα και την ιατρική ή επιστημονική ορολογία, με φυσικά ελληνικά αντί για κατά λέξη απόδοση. " +'''
new_prompt = '''  "Μην μεταφέρεις, ολοκληρώνεις ή δανείζεσαι λέξεις και νόημα από γειτονικό cue, ακόμη και αν μια πρόταση κόβεται στη μέση. " +
  "Η τελεία, το ερωτηματικό, το θαυμαστικό και η σαφής παύση του πρωτοτύπου είναι οριστικά όρια νοήματος. Μην συνδέεις την επόμενη πρόταση με την προηγούμενη. " +
  "Ουσία, φάρμακο, συμπλήρωμα, πρόσωπο ή τεχνικός όρος που εμφανίζεται στο επόμενο cue δεν επιτρέπεται να γίνει αιτία, αντικείμενο ή υποκείμενο του προηγούμενου cue αν αυτό δεν υπάρχει ρητά στο αγγλικό κείμενο. " +
  "Διατήρησε πιστά το νόημα και την ιατρική ή επιστημονική ορολογία, με φυσικά ελληνικά αντί για κατά λέξη απόδοση. " +'''
route = replace_once(route, old_prompt, new_prompt, "anti-inference Groq prompt")

insert_after = '''async function translateMeaningBatch(batch: { index: number; text: string }[]) {
  const source = batch.map(item => `[[${item.index}]] ${item.text}`).join("\\n");
  const translated = await translateText(source);
  const results = new Map<number, string>();
  const marker = /\\[\\[\\s*(\\d+)\\s*\\]\\]\\s*([\\s\\S]*?)(?=\\n?\\[\\[\\s*\\d+\\s*\\]\\]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(translated))) {
    const text = cleanSubtitleText(match[2]);
    if (text) results.set(Number(match[1]), text);
  }
  return results;
}
'''
semantic_helpers = insert_after + '''
function technicalGuardTokens(text: string) {
  const matches = text.match(/\\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\\d+[A-Za-z0-9-]*|\\d+(?:\\.\\d+)?(?:mg|mcg|g|ml|iu|%)?)\\b/g) || [];
  return new Set(matches.map(token => token.toLowerCase()));
}

function hasEnglishNegation(text: string) {
  return /\\b(?:no|not|never|without|cannot|can't|won't|wouldn't|shouldn't|couldn't|isn't|aren't|wasn't|weren't|don't|doesn't|didn't)\\b/i.test(text);
}

function hasGreekNegation(text: string) {
  return /(?:^|[^\\p{L}])(?:δεν|μην|μη|όχι|χωρίς|ούτε)(?=$|[^\\p{L}])/iu.test(text);
}

function needsStrictSemanticRetry(cues: CaptionCue[], translated: Map<number, string>, index: number) {
  const source = cues[index]?.text || "";
  const target = translated.get(index) || "";
  if (!source || !target) return false;

  const ownTokens = technicalGuardTokens(source);
  const targetTokens = technicalGuardTokens(target);
  const neighbourTokens = new Set<string>();
  for (const neighbourIndex of [index - 1, index + 1]) {
    if (neighbourIndex < 0 || neighbourIndex >= cues.length) continue;
    for (const token of technicalGuardTokens(cues[neighbourIndex].text)) neighbourTokens.add(token);
  }

  // Catch cross-boundary borrowing such as the next cue's "MSM" being turned
  // into the cause of the previous cue's "poisoned." sentence.
  for (const token of targetTokens) {
    if (!ownTokens.has(token) && neighbourTokens.has(token)) return true;
  }

  // Added negation is another high-risk semantic change. Re-run only that cue
  // in complete isolation rather than penalising the whole transcript.
  if (!hasEnglishNegation(source) && hasGreekNegation(target)) return true;
  return false;
}
'''
route = replace_once(route, insert_after, semantic_helpers, "selective semantic guard helpers")

old_before_retries = '''  for (let retry = 0; retry < 2; retry += 1) {
    const pending = cues.map((_, index) => index).filter(index => !translated.has(index));'''
new_before_retries = '''  if (useGroq) {
    const suspicious = cues
      .map((_, index) => index)
      .filter(index => translated.has(index) && needsStrictSemanticRetry(cues, translated, index));
    let checked = 0;
    for (const index of suspicious) {
      try {
        // No preceding/next context on this retry: the model can only translate
        // the exact source cue, which prevents semantic borrowing across a
        // punctuation or pause boundary.
        const strict = await translateBatchWithGroq([{ index, text: cues[index].text }]);
        const replacement = strict?.get(index);
        if (replacement) translated.set(index, replacement);
      } catch {
        // Keep the already valid mapped translation if strict verification is
        // temporarily unavailable. The original mapping/fallback safeguards
        // still apply below.
      }
      checked += 1;
      if (onProgress && suspicious.length) {
        await onProgress(Math.round(84 + (2 * checked / suspicious.length)));
      }
    }
    if (onProgress && !suspicious.length) await onProgress(86);
  }

  for (let retry = 0; retry < 2; retry += 1) {
    const pending = cues.map((_, index) => index).filter(index => !translated.has(index));'''
route = replace_once(route, old_before_retries, new_before_retries, "selective semantic retry pass")

route = route.replace('translationMethod = "supadata_native_contextual_meaning_units_v4";', 'translationMethod = "supadata_native_semantic_boundaries_v5";')
route = route.replace('translationMethod = "contextual_meaning_units_v3";', 'translationMethod = "semantic_boundaries_v5";')
route_path.write_text(route)

player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()
if player.count(":v6") < 1:
    raise SystemExit("expected v6 browser transcript cache references")
player = player.replace(":v6", ":v7")
if "data.transcriptVersion!==6" not in player:
    raise SystemExit("expected transcriptVersion 6 client validator")
player = player.replace("data.transcriptVersion!==6", "data.transcriptVersion!==7")
player_path.write_text(player)

cache_path = Path("app/api/shared-cache.ts")
cache = cache_path.read_text()
cache = replace_once(cache, "export const TRANSCRIPT_VERSION = 6;", "export const TRANSCRIPT_VERSION = 7;", "server transcript version")
cache_path.write_text(cache)

package_path = Path("package.json")
package = package_path.read_text()
package = replace_once(package, '"version": "7.1.2"', '"version": "7.1.3"', "package version")
package_path.write_text(package)

layout_path = Path("app/layout.tsx")
layout = layout_path.read_text()
layout = replace_once(layout, '"codex-preview": "final-v7.1.2"', '"codex-preview": "final-v7.1.3"', "preview metadata")
layout = replace_once(layout, '"app-version": "7.1.2"', '"app-version": "7.1.3"', "app version metadata")
layout_path.write_text(layout)

# Visible compact header badge currently uses the minor v7.1 label; keep that
# visual convention unchanged. Ensure no stale transcript v6 references remain.
for path in [Path("app/GreekTubePlayer.tsx"), Path("app/api/shared-cache.ts")]:
    text = path.read_text()
    if ":v6" in text or "transcriptVersion!==6" in text or "TRANSCRIPT_VERSION = 6" in text:
        raise SystemExit(f"stale transcript v6 reference remains in {path}")

print("Applied GreekTube Subs v7.1.3 semantic-boundary translation pipeline")

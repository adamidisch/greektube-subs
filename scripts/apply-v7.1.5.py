from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_required(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing expected pattern: {label}")
    return text.replace(old, new)

# Client: fix transcript version consistency and visible release label.
p = Path("app/GreekTubePlayer.tsx")
s = p.read_text()
s = replace_required(s, "data.transcriptVersion!==7", "data.transcriptVersion!==8", "client transcript version 7->8")
s = s.replace("ver 7.1.4", "ver 7.1.5")
p.write_text(s)

# Server: keep abandoned locks short enough to recover automatically after a killed function.
p = Path("app/api/shared-cache.ts")
s = p.read_text()
s = s.replace("600_000", "180_000")
p.write_text(s)

# Translation pipeline: retain strict source boundaries but replace the expensive full-transcript
# semantic second pass with a bounded risk-based verification pass.
p = Path("app/api/captions/route.ts")
s = p.read_text()

# Keep primary Groq calls from consuming most of the Vercel runtime on repeated rate limits.
start = s.index("async function translateBatchWithGroq(")
end = s.index("\nasync function translateText", start)
chunk = s[start:end]
chunk = chunk.replace("for (let attempt = 0; attempt < 3; attempt += 1)", "for (let attempt = 0; attempt < 2; attempt += 1)")
chunk = chunk.replace("attempt < 2", "attempt < 1")
chunk = chunk.replace("Math.min(retryAfterSeconds, 20)", "Math.min(retryAfterSeconds, 8)")
s = s[:start] + chunk + s[end:]

needle = '''function hasGreekNegation(text: string) {
  return /(?:^|[^\\p{L}])(?:δεν|μην|μη|όχι|χωρίς|ούτε)(?=$|[^\\p{L}])/iu.test(text);
}
'''
insert = needle + '''
function semanticRiskScore(text: string) {
  let score = technicalGuardTokens(text).size * 3;
  if (hasEnglishNegation(text)) score += 3;
  if (/\\b\\d+(?:\\.\\d+)?\\b/.test(text)) score += 2;
  if (/\\b(?:because|cause|causes|caused|due to|therefore|so that|from|by)\\b/i.test(text)) score += 2;
  if (/\\b(?:or|either|instead|rather|versus|vs\\.?)\\b/i.test(text)) score += 2;
  if (text.length >= 110) score += 1;
  return score;
}
'''
if needle not in s:
    raise SystemExit("Missing hasGreekNegation insertion point")
s = s.replace(needle, insert, 1)

verify_start = s.index("async function verifySemanticFidelity(")
verify_end = s.index("\nasync function translateTitleToGreek", verify_start)
new_verify = '''async function verifySemanticFidelity(
  cues: CaptionCue[],
  translated: Map<number, string>,
  candidateIndexes: number[],
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !candidateIndexes.length) return [] as number[];

  // Hard budget: never review the whole transcript with a second AI pass.
  // Only the highest-risk cues are checked, in at most two small requests.
  const candidates = [...new Set(candidateIndexes)]
    .filter(index => index >= 0 && index < cues.length && translated.has(index))
    .slice(0, 12);
  const suspicious: number[] = [];
  const size = 6;

  for (let start = 0; start < candidates.length; start += size) {
    const indexes = candidates.slice(start, start + size);
    const pairs = indexes
      .map(index => `[[${index}]]\\nEN: ${cues[index].text}\\nEL: ${translated.get(index)}`)
      .join("\\n\\n");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {"Content-Type":"application/json", Authorization:`Bearer ${apiKey}`},
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0,
          max_tokens: 260,
          messages: [
            {role:"system",content:"Είσαι αυστηρός ελεγκτής πιστότητας υποτίτλων. Σύγκρινε ΚΑΘΕ αγγλικό cue μόνο με το δικό του ελληνικό. Σημείωσε cue ως λάθος μόνο αν αλλάζει ουσιαστικά το νόημα: λάθος υποκείμενο/αντικείμενο, αιτία-αποτέλεσμα, άρνηση, ποσότητα, επιλογή, τεχνικός όρος ή προσθήκη/αφαίρεση σημαντικής πληροφορίας. Μικρές φυσικές αναδιατυπώσεις είναι σωστές. Απάντησε μόνο JSON array με τα αριθμητικά ids που χρειάζονται νέα μετάφραση, π.χ. [4,7] ή []."},
            {role:"user",content:pairs},
          ],
        }),
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) continue;
      const payload = await response.json() as {choices?:{message?:{content?:string}}[]};
      const raw = payload.choices?.[0]?.message?.content || "";
      const arrayText = raw.match(/\\[[\\s\\S]*?\\]/)?.[0];
      if (!arrayText) continue;
      const ids = JSON.parse(arrayText) as unknown;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (Number.isInteger(id) && indexes.includes(id as number)) suspicious.push(id as number);
      }
    } catch {}
  }
  return [...new Set(suspicious)].slice(0, 4);
}
'''
s = s[:verify_start] + new_verify + s[verify_end:]

old_block = '''  if (useGroq) {
    const deterministic = cues
      .map((_, index) => index)
      .filter(index => translated.has(index) && needsStrictSemanticRetry(cues, translated, index));
    const semantic = await verifySemanticFidelity(cues, translated);
    const suspicious = [...new Set([...deterministic, ...semantic])];
    let checked = 0;
'''
new_block = '''  if (useGroq) {
    const deterministic = cues
      .map((_, index) => index)
      .filter(index => translated.has(index) && needsStrictSemanticRetry(cues, translated, index));
    const riskCandidates = cues
      .map((cue, index) => ({ index, score: translated.has(index) ? semanticRiskScore(cue.text) : 0 }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.index);
    const verificationCandidates = [...new Set([...deterministic, ...riskCandidates])].slice(0, 12);
    const semantic = await verifySemanticFidelity(cues, translated, verificationCandidates);
    const suspicious = [...new Set([...deterministic, ...semantic])].slice(0, 4);
    let checked = 0;
'''
if old_block not in s:
    raise SystemExit("Missing semantic verification call block")
s = s.replace(old_block, new_block, 1)
p.write_text(s)

# Release metadata.
p = Path("package.json")
s = p.read_text()
s = replace_required(s, '"version": "7.1.4"', '"version": "7.1.5"', "package version")
p.write_text(s)

p = Path("app/layout.tsx")
s = p.read_text().replace('final-v7.1.4', 'final-v7.1.5').replace('7.1.4', '7.1.5')
p.write_text(s)

# Reinstate the compact premium metadata/title/source presentation below the player.
p = Path("app/content-areas-final.css")
s = p.read_text()
marker = "/* v7.1.5 player heading restoration */"
if marker not in s:
    s += r'''

/* v7.1.5 player heading restoration */
html body .app-shell.app-shell.app-shell .video-heading{
  display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:18px!important;
  align-items:start!important;margin:20px 0 0!important;padding:0!important;background:transparent!important;border:0!important;
}
html body .app-shell.app-shell.app-shell .video-meta-kicker{
  display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:7px!important;
  margin:0 0 8px!important;color:#8f949e!important;font-family:inherit!important;font-size:11.5px!important;line-height:1.35!important;
}
html body .app-shell.app-shell.app-shell .video-meta-kicker strong{
  color:#f3f4f6!important;font-weight:650!important;font-size:11.5px!important;
}
html body .app-shell.app-shell.app-shell .speaker-divider{color:#555b65!important}
html body .app-shell.app-shell.app-shell .speaker-role{color:#9ca1ab!important;font-weight:500!important}
html body .app-shell.app-shell.app-shell .video-category-label{
  display:inline-flex!important;align-items:center!important;min-height:22px!important;margin-left:3px!important;padding:3px 8px!important;
  border:1px solid rgba(227,162,60,.32)!important;border-radius:7px!important;background:rgba(227,162,60,.10)!important;
  color:#e9ae51!important;font-size:10px!important;font-weight:700!important;letter-spacing:.035em!important;text-transform:uppercase!important;
}
html body .app-shell.app-shell.app-shell .player-greek-title{
  max-width:860px!important;margin:0!important;color:#f4f5f7!important;background:none!important;
  -webkit-text-fill-color:currentColor!important;font-family:inherit!important;font-size:24px!important;line-height:1.2!important;
  font-weight:650!important;letter-spacing:-.025em!important;text-wrap:balance!important;
}
html body .app-shell.app-shell.app-shell .video-source-row{
  display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:7px 10px!important;
  width:auto!important;max-width:100%!important;margin:9px 0 0!important;padding:0!important;
  border:0!important;background:transparent!important;box-shadow:none!important;border-radius:0!important;
  color:#858b96!important;font-size:11.5px!important;line-height:1.35!important;
}
html body .app-shell.app-shell.app-shell .video-source-row>span{
  display:inline-flex!important;align-items:center!important;min-height:20px!important;padding:2px 7px!important;
  border:1px solid rgba(124,116,224,.28)!important;border-radius:6px!important;background:rgba(124,116,224,.10)!important;
  color:#aaa3f0!important;font-size:9.5px!important;font-weight:750!important;letter-spacing:.08em!important;
}
html body .app-shell.app-shell.app-shell .video-source-row a,
html body .app-shell.app-shell.app-shell .video-source-row strong{
  color:#aeb3bc!important;font-weight:500!important;text-decoration:none!important;
}
html body .app-shell.app-shell.app-shell .video-source-row a:hover{color:#ddd9ff!important}
@media(max-width:620px){
  html body .app-shell.app-shell.app-shell .video-heading{display:block!important;margin-top:14px!important}
  html body .app-shell.app-shell.app-shell .player-greek-title{font-size:20px!important;line-height:1.22!important}
  html body .app-shell.app-shell.app-shell .video-meta-kicker{font-size:10.5px!important;margin-bottom:7px!important}
  html body .app-shell.app-shell.app-shell .video-source-row{font-size:10.5px!important;gap:6px 8px!important}
}
'''
p.write_text(s)

print("v7.1.5 changes applied")

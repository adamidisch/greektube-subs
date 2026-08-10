from pathlib import Path


def replace_once(text, old, new, label):
    n=text.count(old)
    if n!=1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
    return text.replace(old,new,1)

# API translation pipeline
p=Path('app/api/captions/route.ts')
s=p.read_text()
old='''  const preparedCues = cues\n    .map(cue => ({ ...cue, text: cleanSubtitleText(cue.text) }))\n    .filter(cue => cue.text.length > 0);\n  const units: CaptionCue[] = [];\n'''
new='''  const cleanedCues = cues\n    .map(cue => ({ ...cue, text: cleanSubtitleText(cue.text) }))\n    .filter(cue => cue.text.length > 0);\n\n  // YouTube can place more than one sentence inside a single timed cue.\n  // Split those internal sentence boundaries BEFORE grouping so punctuation\n  // from the English source remains authoritative (e.g. "poisoned. MSM...").\n  // Time is distributed proportionally across the source characters, while\n  // keeping the original cue start/end envelope unchanged.\n  const preparedCues: CaptionCue[] = cleanedCues.flatMap(cue => {\n    const parts = cue.text.match(/[^.!?…]+[.!?…]+[\\"')\\]]*|[^.!?…]+$/g)?.map(part => part.trim()).filter(Boolean) || [cue.text];\n    if (parts.length <= 1) return [cue];\n    const weights = parts.map(part => Math.max(1, part.replace(/\\s+/g, '').length));\n    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);\n    let elapsed = 0;\n    return parts.map((part, index) => {\n      const start = cue.start + elapsed;\n      const remaining = Math.max(0.12, cue.duration - elapsed);\n      const duration = index === parts.length - 1\n        ? remaining\n        : Math.max(0.12, cue.duration * (weights[index] / totalWeight));\n      elapsed += duration;\n      return { start, duration, text: part };\n    });\n  });\n  const units: CaptionCue[] = [];\n'''
s=replace_once(s,old,new,'sentence split')

# Stronger fidelity prompt
old='''  "Μην προσθέτεις πληροφορίες που δεν υπάρχουν στο πρωτότυπο. " +\n  "Επέστρεψε ακριβώς έναν δείκτη [[N]] για κάθε input cue, στην ίδια σειρά, χωρίς παραλείψεις, διπλασιασμούς ή νέους δείκτες. " +'''
new='''  "Μην προσθέτεις πληροφορίες που δεν υπάρχουν στο πρωτότυπο. Μην αλλάζεις ποιος κάνει τι σε ποιον, αιτία και αποτέλεσμα, άρνηση, ποσότητες, επιλογές ή τεχνικούς όρους. " +\n  "Η ελληνική απόδοση πρέπει να είναι πιστή στο συγκεκριμένο αγγλικό cue: πρώτα ακρίβεια νοήματος και μετά φυσικότητα ύφους. " +\n  "Επέστρεψε ακριβώς έναν δείκτη [[N]] για κάθε input cue, στην ίδια σειρά, χωρίς παραλείψεις, διπλασιασμούς ή νέους δείκτες. " +'''
s=replace_once(s,old,new,'prompt fidelity')

# Add semantic verifier before title translator
needle='''async function translateTitleToGreek(title: string) {'''
verifier=r'''async function verifySemanticFidelity(cues: CaptionCue[], translated: Map<number, string>) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return [] as number[];
  const suspicious: number[] = [];
  const size = 6;
  for (let start = 0; start < cues.length; start += size) {
    const indexes = cues.slice(start, start + size).map((_, offset) => start + offset).filter(index => translated.has(index));
    if (!indexes.length) continue;
    const pairs = indexes.map(index => `[[${index}]]\nEN: ${cues[index].text}\nEL: ${translated.get(index)}`).join("\n\n");
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {"Content-Type":"application/json", Authorization:`Bearer ${apiKey}`},
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0,
          max_tokens: 350,
          messages: [
            {role:"system",content:"Είσαι αυστηρός ελεγκτής πιστότητας υποτίτλων. Σύγκρινε ΚΑΘΕ αγγλικό cue μόνο με το δικό του ελληνικό. Σημείωσε cue ως λάθος μόνο αν αλλάζει ουσιαστικά το νόημα: λάθος υποκείμενο/αντικείμενο, αιτία-αποτέλεσμα, άρνηση, ποσότητα, επιλογή, τεχνικός όρος ή προσθήκη/αφαίρεση σημαντικής πληροφορίας. Μικρές φυσικές αναδιατυπώσεις είναι σωστές. Απάντησε μόνο JSON array με τα αριθμητικά ids που χρειάζονται νέα μετάφραση, π.χ. [4,7] ή []."},
            {role:"user",content:pairs},
          ],
        }),
      });
      if (!response.ok) continue;
      const payload = await response.json() as {choices?:{message?:{content?:string}}[]};
      const raw = payload.choices?.[0]?.message?.content || "";
      const arrayText = raw.match(/\[[\s\S]*?\]/)?.[0];
      if (!arrayText) continue;
      const ids = JSON.parse(arrayText) as unknown;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) if (Number.isInteger(id) && indexes.includes(id as number)) suspicious.push(id as number);
    } catch {}
  }
  return [...new Set(suspicious)];
}

'''
s=replace_once(s,needle,verifier+needle,'semantic verifier insertion')

# Replace existing suspicious block with union of deterministic + semantic verification
old='''  if (useGroq) {\n    const suspicious = cues\n      .map((_, index) => index)\n      .filter(index => translated.has(index) && needsStrictSemanticRetry(cues, translated, index));\n    let checked = 0;\n    for (const index of suspicious) {'''
new='''  if (useGroq) {\n    const deterministic = cues\n      .map((_, index) => index)\n      .filter(index => translated.has(index) && needsStrictSemanticRetry(cues, translated, index));\n    const semantic = await verifySemanticFidelity(cues, translated);\n    const suspicious = [...new Set([...deterministic, ...semantic])];\n    let checked = 0;\n    for (const index of suspicious) {'''
s=replace_once(s,old,new,'verifier union')
p.write_text(s)

# Transcript version bump
p=Path('app/api/shared-cache.ts')
s=p.read_text().replace('export const TRANSCRIPT_VERSION = 7;','export const TRANSCRIPT_VERSION = 8;')
p.write_text(s)

# Player UI: cache, badge, explicit steps
p=Path('app/GreekTubePlayer.tsx')
s=p.read_text()
s=s.replace(':v7`', ':v8`')
s=s.replace('transcriptVersion !== 7', 'transcriptVersion !== 8')
s=s.replace('ver 7.1.2','ver 7.1.4')
old='''const PREPARATION_STAGES_EL=[\n  {at:4,label:"Ανάγνωση στοιχείων βίντεο"},\n  {at:12,label:"Εντοπισμός αρχικών υποτίτλων"},\n  {at:28,label:"Μετάφραση υποτίτλων στα ελληνικά"},\n  {at:88,label:"Έλεγχος συγχρονισμού και πληρότητας"},\n];'''
new='''const PREPARATION_STAGES_EL=[\n  {at:4,label:"Ανάκτηση στοιχείων βίντεο"},\n  {at:12,label:"Ανάκτηση αγγλικών υποτίτλων"},\n  {at:28,label:"Καθαρισμός και οργάνωση κειμένου"},\n  {at:48,label:"Μετάφραση στα ελληνικά"},\n  {at:84,label:"Έλεγχος νοήματος και συγχρονισμού"},\n  {at:96,label:"Ολοκλήρωση υποτίτλων"},\n];'''
s=replace_once(s,old,new,'preparation stages')
old='''          <div className={`preparation-status ${progress>=100?"done":""}`} aria-live="polite"><i aria-hidden="true">{progress>=100?"✓":""}</i><span key={preparationStage}>{preparationStage}</span></div>\n          <section className="speaker-loading-card"><h2>{speaker.name}</h2><strong>{speaker.role}</strong></section>'''
new='''          <div className={`preparation-status ${progress>=100?"done":""}`} aria-live="polite"><i aria-hidden="true">{progress>=100?"✓":""}</i><span key={preparationStage}>{preparationStage}</span></div>\n          <ol className="preparation-steps" aria-label="Στάδια προετοιμασίας υποτίτλων">{PREPARATION_STAGES_EL.map((stage,index)=>{const next=PREPARATION_STAGES_EL[index+1];const done=progress>=100||Boolean(next&&progress>=next.at);const active=!done&&progress>=stage.at;return <li key={stage.at} className={`${done?"done":""} ${active?"active":""}`}><i aria-hidden="true">{done?"✓":String(index+1).padStart(2,"0")}</i><span>{stage.label}</span></li>})}</ol>\n          <section className="speaker-loading-card"><h2>{speaker.name}</h2><strong>{speaker.role}</strong></section>'''
s=replace_once(s,old,new,'preparation steps UI')
p.write_text(s)

# Restore premium video-heading design and style preparation steps
p=Path('app/content-areas-final.css')
s=p.read_text()
s += r'''

/* ===== v7.1.4 — restore premium player heading + explicit preparation steps ===== */
html body .app-shell.app-shell.app-shell .video-heading{padding:18px 3px 16px!important}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker{
  display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:5px 7px!important;
  margin:0 0 8px!important;color:#969ca7!important;font-family:inherit!important;font-size:12px!important;
  line-height:1.4!important;font-weight:520!important;letter-spacing:.01em!important;text-transform:none!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker strong{color:#f4f5f7!important;font-weight:700!important}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker .speaker-divider{color:#555d6a!important;font-weight:500!important}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker .speaker-role{color:#aeb4bf!important;font-weight:520!important}
html body .app-shell.app-shell.app-shell .video-heading .player-greek-title{
  margin:0!important;max-width:980px!important;color:#f6f3ec!important;font-family:inherit!important;
  font-size:24px!important;font-weight:650!important;line-height:1.16!important;letter-spacing:-.028em!important;
  text-wrap:balance!important;overflow-wrap:break-word!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label{
  display:inline-flex!important;align-items:center!important;min-height:22px!important;padding:3px 8px!important;
  border:1px solid rgba(255,255,255,.12)!important;border-radius:7px!important;background:rgba(255,255,255,.055)!important;
  color:#c7cbd2!important;font-size:9.5px!important;font-weight:750!important;line-height:1!important;letter-spacing:.055em!important;text-transform:uppercase!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Medical"]{border-color:rgba(227,162,60,.32)!important;background:rgba(227,162,60,.11)!important;color:#e7b96f!important}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Tech"]{border-color:rgba(80,159,225,.32)!important;background:rgba(80,159,225,.11)!important;color:#87bfea!important}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Podcasts"]{border-color:rgba(143,127,240,.32)!important;background:rgba(143,127,240,.11)!important;color:#bbb1ff!important}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Education"]{border-color:rgba(91,174,120,.32)!important;background:rgba(91,174,120,.11)!important;color:#96d3a8!important}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Documentaries"]{border-color:rgba(61,177,169,.32)!important;background:rgba(61,177,169,.11)!important;color:#8fd8d2!important}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Comedy"]{border-color:rgba(226,113,104,.32)!important;background:rgba(226,113,104,.11)!important;color:#f0a39d!important}
html body .app-shell.app-shell.app-shell .video-source-row{margin-top:11px!important;padding-top:10px!important;border-top:1px solid rgba(255,255,255,.075)!important}

html body .app-shell.app-shell.app-shell .preparation-steps{display:grid!important;gap:6px!important;margin:12px 0 14px!important;padding:0!important;list-style:none!important}
html body .app-shell.app-shell.app-shell .preparation-steps li{display:grid!important;grid-template-columns:28px minmax(0,1fr)!important;align-items:center!important;gap:9px!important;min-height:34px!important;padding:6px 8px!important;border:1px solid transparent!important;border-radius:10px!important;color:#737985!important;font-size:11.5px!important;line-height:1.25!important}
html body .app-shell.app-shell.app-shell .preparation-steps li i{width:24px!important;height:24px!important;display:grid!important;place-items:center!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:8px!important;background:rgba(255,255,255,.035)!important;color:#777e8b!important;font-size:9px!important;font-style:normal!important;font-weight:750!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.active{border-color:rgba(143,127,240,.28)!important;background:rgba(143,127,240,.09)!important;color:#f0eefb!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.active i{border-color:rgba(143,127,240,.42)!important;background:rgba(143,127,240,.18)!important;color:#c8c0ff!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.done{color:#9aa1aa!important}
html body .app-shell.app-shell.app-shell .preparation-steps li.done i{border-color:rgba(105,177,129,.28)!important;background:rgba(105,177,129,.12)!important;color:#8fd0a5!important}
@media(max-width:620px){
 html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker{gap:5px 6px!important;margin-bottom:7px!important;font-size:11.5px!important}
 html body .app-shell.app-shell.app-shell .video-heading .player-greek-title{font-size:22px!important;line-height:1.2!important;letter-spacing:-.022em!important}
 html body .app-shell.app-shell.app-shell .video-heading .video-category-label{min-height:20px!important;padding:3px 7px!important;font-size:9px!important}
 html body .app-shell.app-shell.app-shell .preparation-steps{gap:5px!important;margin-top:10px!important}
}
'''
p.write_text(s)

# Release metadata
p=Path('package.json'); s=p.read_text().replace('"version": "7.1.3"','"version": "7.1.4"'); p.write_text(s)
p=Path('app/layout.tsx'); s=p.read_text().replace('final-v7.1.3','final-v7.1.4').replace('"app-version": "7.1.3"','"app-version": "7.1.4"'); p.write_text(s)

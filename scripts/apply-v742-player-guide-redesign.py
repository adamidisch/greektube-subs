from pathlib import Path

p=Path('app/GreekTubePlayer.tsx')
s=p.read_text()

def replace_once(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing target: {label}')
    s=s.replace(old,new,1)

replace_once(
    'type GuideItem = { time:number; text:string };',
    'type GuideItem = { time:number; title:string; summary:string; comment?:string };',
    'guide-item-type'
)

old='''function cleanGuideText(text:string) {\n  return text.replace(/\\s+/g," ").replace(/\\bhttps?:\\/\\/\\S+/gi,"").replace(/^[\\d\\s:.)-]+/,"").trim();\n}\nfunction videoGuide(captions:Captions|null|undefined):GuideItem[] {\n  if(!captions?.cues?.length)return [];\n  const cues=captions.cues.filter(cue=>cleanGuideText(cue.text).length>28);\n  if(!cues.length)return [];\n  const used=new Set<number>();\n  const items:GuideItem[]=[];\n  const targets=[.08,.24,.42,.6,.78];\n  (captions.keyPoints||[]).map(cleanGuideText).filter(point=>point.length>12).forEach((point,pointIndex)=>{\n    if(items.length>=5)return;\n    const needle=point.slice(0,38).toLowerCase();\n    const match=cues.findIndex((cue,index)=>!used.has(index)&&cleanGuideText(cue.text).toLowerCase().includes(needle));\n    if(match>=0){\n      used.add(match);\n      items.push({time:cues[match].start,text:point});\n      return;\n    }\n    const fallbackIndex=Math.min(cues.length-1,Math.max(0,Math.round((cues.length-1)*(targets[pointIndex]||.5))));\n    const fallback=cues[fallbackIndex];\n    if(fallback){used.add(fallbackIndex);items.push({time:fallback.start,text:point});}\n  });\n  targets.forEach(target=>{\n    if(items.length>=5)return;\n    const index=Math.min(cues.length-1,Math.max(0,Math.round((cues.length-1)*target)));\n    const cue=cues.slice(index).find((_,offset)=>!used.has(index+offset))||cues[index];\n    const cueIndex=cues.indexOf(cue);\n    if(cueIndex>=0)used.add(cueIndex);\n    items.push({time:cue.start,text:`Σημείο συζήτησης: ${cleanGuideText(cue.text)}`});\n  });\n  return items.filter((item,index,list)=>item.text&&list.findIndex(other=>other.text===item.text)===index).slice(0,5);\n}\n'''
new='''function cleanGuideText(text:string) {\n  return text.replace(/\\s+/g," ").replace(/\\bhttps?:\\/\\/\\S+/gi,"").replace(/^[\\d\\s:.)-]+/,"").trim();\n}\nconst EDITORIAL_GUIDES:Record<string,GuideItem[]>={\n  D2RjneeG_xA:[\n    {time:26,title:"Πόσο γρήγορα πρέπει να γίνει η μετάβαση",summary:"Η ομιλήτρια εξηγεί ότι ο ρυθμός αλλαγής εξαρτάται από την κατάσταση του οργανισμού. Όσο πιο καταπονημένος ή άρρωστος είναι κάποιος τόσο πιο σταδιακή μπορεί να χρειάζεται να είναι η μετάβαση.",comment:"Βασικό πλαίσιο για όλο το υπόλοιπο βίντεο: δεν υπάρχει ένας ίδιος ρυθμός για όλους."},\n    {time:70,title:"Γιατί κάποιοι δυσκολεύονται με μια διατροφή υψηλή σε λίπος",summary:"Η πέψη του λίπους απαιτεί σημαντική παραγωγή παγκρεατικών ενζύμων και επαρκή χολή. Σε ανθρώπους που βασίζονταν για χρόνια κυρίως σε υδατάνθρακες η προσαρμογή μπορεί να χρειάζεται χρόνο."},\n    {time:121,title:"Πότε αρχίζουν να φαίνονται αλλαγές",summary:"Σύμφωνα με την ομιλήτρια με την είσοδο σε κέτωση ορισμένες αλλαγές μπορούν να εμφανιστούν μέσα σε ημέρες ή εβδομάδες όπως πιο σταθερά επίπεδα ενέργειας και καλύτερος ύπνος.",comment:"Εδώ περιγράφεται ο αναμενόμενος χρονικός ορίζοντας που δίνει η ίδια η ομιλήτρια."},\n    {time:246,title:"Κρεατίνη και methylene blue",summary:"Η κρεατίνη παρουσιάζεται ως χρήσιμη για τη μυϊκή λειτουργία και τους μηχανισμούς παροχής ενέργειας. Για το methylene blue η ομιλήτρια αναφέρει ότι δεν θα το έβαζε ως πρώτο βήμα."},\n    {time:293,title:"Το πρόβλημα με τα quick fixes",summary:"Το βασικό μήνυμα είναι ότι ένα μεμονωμένο supplement δεν αντικαθιστά τις βασικές αλλαγές. Η έμφαση μεταφέρεται στη συνέπεια και στην εφαρμογή των θεμελιωδών παρεμβάσεων.",comment:"Ένα από τα πιο καθαρά κεντρικά μηνύματα του αποσπάσματος."},\n    {time:426,title:"Το απλούστερο πρωτόκολλο που προτείνει",summary:"Η συζήτηση καταλήγει σε ένα απλοποιημένο πλάνο με ketogenic diet, vitamin C, iodine, βασικά supplements, χρονικά περιορισμένη διατροφή και άσκηση."}\n  ]\n};\nfunction conciseGuideTitle(text:string,index:number){\n  const clean=cleanGuideText(text).replace(/^Σημείο συζήτησης:\\s*/i,"");\n  const sentence=clean.split(/[.!?]/)[0]?.trim()||clean;\n  const short=sentence.length>74?`${sentence.slice(0,71).trim()}…`:sentence;\n  return short||`Κύριο σημείο ${index+1}`;\n}\nfunction videoGuide(captions:Captions|null|undefined,videoId?:string):GuideItem[] {\n  if(videoId&&EDITORIAL_GUIDES[videoId])return EDITORIAL_GUIDES[videoId];\n  if(!captions?.cues?.length)return [];\n  const cues=captions.cues.filter(cue=>cleanGuideText(cue.text).length>28);\n  if(!cues.length)return [];\n  const targets=[.08,.24,.42,.6,.78];\n  const points=(captions.keyPoints||[]).map(cleanGuideText).filter(point=>point.length>12).slice(0,5);\n  if(points.length){\n    return points.map((point,index)=>{\n      const needle=point.slice(0,38).toLowerCase();\n      const match=cues.find(cue=>cleanGuideText(cue.text).toLowerCase().includes(needle));\n      const fallback=cues[Math.min(cues.length-1,Math.max(0,Math.round((cues.length-1)*(targets[index]||.5))))];\n      return {time:(match||fallback).start,title:conciseGuideTitle(point,index),summary:point};\n    });\n  }\n  return [];\n}\n'''
replace_once(old,new,'semantic-video-guide')

replace_once(
    '  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);',
    '  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);\n  const [guideOpen,setGuideOpen]=useState(false);',
    'guide-open-state'
)

replace_once(
    '    const guideItems=videoGuide(captions);',
    '    const guideItems=videoGuide(captions,selected.id);',
    'guide-video-id'
)

replace_once(
    '''                  <button className="fullscreen-toggle fullscreen-primary" aria-label="Πλήρης οθόνη" onClick={()=>void toggleFullscreen()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m11 0h3a2 2 0 002-2v-3"/></svg><span>Πλήρης οθόνη</span></button>''',
    '''                  <label className="speed-control" aria-label="Ταχύτητα αναπαραγωγής"><span>Ταχύτητα</span><select value={state.settings.speed} onChange={event=>{const next=Number(event.target.value);setState(current=>({...current,settings:{...current.settings,speed:next}}));currentPlayer()?.setPlaybackRate(next);}}><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={1.75}>1.75×</option><option value={2}>2×</option></select></label>\n                  <button className="fullscreen-toggle fullscreen-primary" aria-label="Πλήρης οθόνη" onClick={()=>void toggleFullscreen()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m11 0h3a2 2 0 002-2v-3"/></svg><span>Πλήρης οθόνη</span></button>''',
    'speed-control'
)

replace_once(
    '''<div className="mobile-watch-summary"><p>{selected.channel} · {CATEGORY_LABELS[selected.category]} · {selected.views||0} προβολές</p><section><span>{(speaker.name||selected.speakerName||selected.channel).slice(0,1)}</span><div><strong>{displaySpeakerName}</strong><small>{displaySpeakerRole}</small></div><button type="button" aria-label="Επεξεργασία βίντεο" onClick={()=>void requestEdit(selected)}>✎</button><button type="button" aria-label="Αγαπημένο" className={selected.favorite?"active":""} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♡</button></section></div>''',
    '''<div className="mobile-watch-summary"><p>{selected.channel} · {CATEGORY_LABELS[selected.category]} · {selected.views||0} προβολές</p><section><span>{(speaker.name||selected.speakerName||selected.channel).slice(0,1)}</span><div><strong>{displaySpeakerName}</strong><small>{displaySpeakerRole}</small></div><button type="button" aria-label="Διαχείριση υποτίτλων" onClick={()=>setTranslationChoiceVideo(selected)}>CC</button><button type="button" aria-label="Επεξεργασία βίντεο" onClick={()=>void requestEdit(selected)}>✎</button><button type="button" aria-label="Αγαπημένο" className={selected.favorite?"active":""} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♡</button></section></div>''',
    'mobile-cc-access'
)

replace_once(
    '''            <section className="video-guide"><div className="section-title"><h2>Οδηγός βίντεο</h2><small>{guideItems.length}</small></div><p className="guide-intro">Τα βασικά σημεία του βίντεο με χρόνους, για να πας γρήγορα στο κομμάτι που σε ενδιαφέρει.</p><div className="guide-list">{guideItems.map((item,index)=><button key={`${item.time}-${index}`} onClick={()=>seek(item.time)}><time>{clock(item.time)}</time><span>{item.text}</span></button>)}</div></section>''',
    '''            <section className={`video-guide editorial-guide ${guideOpen?"open":""}`}><button type="button" className="guide-toggle" aria-expanded={guideOpen} onClick={()=>setGuideOpen(open=>!open)}><span><small>EDITORIAL GUIDE</small><strong>Οδηγός βίντεο</strong></span><span className="guide-toggle-meta">{guideItems.length?`${guideItems.length} βασικά σημεία`:"Υπό επιμέλεια"}<i aria-hidden="true">⌄</i></span></button>{guideOpen&&<div className="guide-content"><p className="guide-intro">Επιλεγμένα σημεία με σύντομη περίληψη και context ώστε να πηγαίνεις κατευθείαν στην ουσία χωρίς raw αποσπάσματα υποτίτλων.</p>{guideItems.length?<div className="guide-list editorial-guide-list">{guideItems.map((item,index)=><button key={`${item.time}-${index}`} onClick={()=>seek(item.time)}><time>{clock(item.time)}</time><span><strong>{item.title}</strong><small>{item.summary}</small>{item.comment&&<em><b>Σχόλιο</b>{item.comment}</em>}</span><i aria-hidden="true">▶</i></button>)}</div>:<div className="guide-empty">Ο οδηγός δεν έχει ακόμη επιμεληθεί για αυτό το βίντεο. Δεν εμφανίζουμε αυτόματα raw subtitle fragments.</div>}</div>}</section>''',
    'collapsible-editorial-guide'
)

# Version bump in component if present.
s=s.replace('7.4.1','7.4.2')
p.write_text(s)

layout=Path('app/layout.tsx')
ls=layout.read_text()
if 'import "./v7-4-2.css";' not in ls:
    ls=ls.replace('import "./v7-4-0.css";','import "./v7-4-0.css";\nimport "./v7-4-2.css";')
ls=ls.replace('v7.4.1-dual-translation-modes','v7.4.2-editorial-guide-player')
ls=ls.replace('"app-version": "7.4.1"','"app-version": "7.4.2"')
layout.write_text(ls)

pkg=Path('package.json')
ps=pkg.read_text().replace('"version": "7.4.1"','"version": "7.4.2"')
pkg.write_text(ps)

css=Path('app/v7-4-2.css')
css.write_text(r'''
/* v7.4.2 — premium player information hierarchy + editorial guide */
.watch-main{min-width:0}
.video-heading{margin-top:14px;padding:18px 20px;border:1px solid rgba(255,255,255,.075);border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012));box-shadow:0 18px 54px rgba(0,0,0,.12)}
.video-heading .player-greek-title{letter-spacing:-.025em;line-height:1.08}
.player-tools{border-radius:0 0 18px 18px;background:linear-gradient(180deg,rgba(18,19,24,.96),rgba(13,14,18,.98))}
.controls-top-row{gap:10px}
.speed-control{display:flex;align-items:center;gap:8px;height:42px;padding:0 9px 0 12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.035);color:inherit;transition:border-color .18s ease,background .18s ease}
.speed-control:hover{border-color:rgba(151,133,255,.34);background:rgba(255,255,255,.055)}
.speed-control>span{font-size:9px;font-weight:760;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#9ca3af)}
.speed-control select{appearance:none;min-width:68px;padding:7px 23px 7px 8px;border:0;border-radius:8px;background:rgba(255,255,255,.055) linear-gradient(45deg,transparent 50%,currentColor 50%) calc(100% - 12px) 52%/5px 5px no-repeat;color:inherit;font:700 11px/1 var(--font-geist-sans),sans-serif;outline:none;cursor:pointer}
.speed-control select:focus-visible{box-shadow:0 0 0 2px rgba(142,124,255,.45)}
.moments,.editorial-guide{margin-top:14px;border:1px solid rgba(255,255,255,.075);border-radius:18px;background:rgba(255,255,255,.018)}
.moments{padding:16px 18px}
.editorial-guide{overflow:hidden;padding:0}
.guide-toggle{display:flex;align-items:center;justify-content:space-between;gap:20px;width:100%;padding:17px 18px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;transition:background .18s ease}
.guide-toggle:hover{background:rgba(255,255,255,.026)}
.guide-toggle>span:first-child{display:grid;gap:3px}
.guide-toggle small{font-size:8px;font-weight:800;letter-spacing:.14em;color:#a99dff}
.guide-toggle strong{font-size:14px;letter-spacing:-.015em}
.guide-toggle-meta{display:flex;align-items:center;gap:10px;font-size:10px;color:var(--muted,#9ca3af)}
.guide-toggle-meta i{display:grid;place-items:center;width:27px;height:27px;border:1px solid rgba(255,255,255,.09);border-radius:9px;font-size:14px;font-style:normal;transition:transform .22s ease,background .18s ease}
.editorial-guide.open .guide-toggle-meta i{transform:rotate(180deg);background:rgba(142,124,255,.10)}
.guide-content{padding:0 18px 18px;border-top:1px solid rgba(255,255,255,.06);animation:guideReveal .22s ease both}
@keyframes guideReveal{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.guide-content .guide-intro{max-width:720px;margin:14px 0 13px;font-size:11px;line-height:1.55;color:var(--muted,#9ca3af)}
.editorial-guide-list{display:grid;gap:8px}
.editorial-guide-list>button{display:grid;grid-template-columns:58px 1fr 28px;align-items:start;gap:12px;width:100%;padding:13px 14px;border:1px solid rgba(255,255,255,.065);border-radius:14px;background:rgba(255,255,255,.018);color:inherit;text-align:left;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
.editorial-guide-list>button:hover{transform:translateY(-1px);border-color:rgba(142,124,255,.28);background:rgba(255,255,255,.032);box-shadow:0 10px 28px rgba(0,0,0,.12)}
.editorial-guide-list>button:active{transform:scale(.99)}
.editorial-guide-list time{display:inline-grid;place-items:center;min-height:27px;padding:0 8px;border-radius:8px;background:rgba(142,124,255,.11);font:760 10px/1 var(--font-geist-mono),monospace;color:#c9c2ff}
.editorial-guide-list>button>span{display:grid;gap:4px;min-width:0}
.editorial-guide-list strong{font-size:12.5px;line-height:1.35;letter-spacing:-.01em}
.editorial-guide-list small{font-size:10.5px;line-height:1.55;color:var(--muted,#a1a7b2)}
.editorial-guide-list em{display:flex;align-items:flex-start;gap:7px;margin-top:3px;padding:8px 9px;border-left:2px solid rgba(116,211,153,.55);border-radius:0 8px 8px 0;background:rgba(72,187,120,.055);font-size:10px;line-height:1.45;font-style:normal;color:#b8cfc0}
.editorial-guide-list em b{flex:0 0 auto;font-size:8px;letter-spacing:.09em;text-transform:uppercase;color:#87d7a7}
.editorial-guide-list>button>i{display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:rgba(255,255,255,.035);font-size:9px;font-style:normal;color:#a99dff}
.guide-empty{padding:15px;border:1px dashed rgba(255,255,255,.09);border-radius:12px;font-size:11px;line-height:1.55;color:var(--muted,#9299a5)}
.heading-actions .subtitle-manage>span{font-size:9px;font-weight:850;letter-spacing:-.03em}
@media(max-width:820px){
  .video-heading{margin-top:10px;padding:14px;border-radius:16px}
  .controls-top-row{display:grid;grid-template-columns:1fr auto auto;align-items:center}
  .speed-control{height:40px;padding-left:9px}
  .speed-control>span{display:none}
  .speed-control select{min-width:62px}
  .moments{padding:13px}
  .guide-toggle{padding:14px}
  .guide-toggle-meta{font-size:9px}
  .guide-toggle-meta{gap:7px}
  .guide-content{padding:0 12px 13px}
  .editorial-guide-list>button{grid-template-columns:48px 1fr 24px;gap:9px;padding:11px}
  .editorial-guide-list time{padding:0 5px}
  .editorial-guide-list small{font-size:10px}
}
@media(max-width:520px){
  .guide-toggle-meta{font-size:0}
  .guide-toggle-meta i{font-size:14px}
  .editorial-guide-list>button{grid-template-columns:45px 1fr}
  .editorial-guide-list>button>i{display:none}
  .editorial-guide-list em{display:grid;gap:3px}
}
''')

# Invariant test for the new UX.
test=Path('scripts/v742-player-guide.test.mjs')
test.write_text(r'''import fs from 'node:fs';
const src=fs.readFileSync('app/GreekTubePlayer.tsx','utf8');
const css=fs.readFileSync('app/v7-4-2.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const checks=[
  ['editorial guide model',src.includes('type GuideItem = { time:number; title:string; summary:string; comment?:string };')],
  ['curated current video',src.includes('D2RjneeG_xA:[')&&src.includes('Το πρόβλημα με τα quick fixes')],
  ['no raw fallback',src.includes('Δεν εμφανίζουμε αυτόματα raw subtitle fragments.')],
  ['collapsed guide',src.includes('aria-expanded={guideOpen}')&&src.includes('setGuideOpen(open=>!open)')],
  ['speed control',src.includes('className="speed-control"')&&src.includes('currentPlayer()?.setPlaybackRate(next)')],
  ['mobile subtitle access',src.includes('aria-label="Διαχείριση υποτίτλων"')],
  ['css imported',layout.includes('import "./v7-4-2.css";')],
  ['version',pkg.version==='7.4.2'&&layout.includes('"app-version": "7.4.2"')],
  ['premium css',css.includes('.editorial-guide-list>button')&&css.includes('.speed-control')],
];
for(const [label,ok] of checks){if(!ok)throw new Error(`v7.4.2 invariant failed: ${label}`)}
console.log(`v7.4.2 player/guide invariants passed (${checks.length})`);
''')

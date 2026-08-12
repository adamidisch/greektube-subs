import fs from 'node:fs';
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
  ['safe SRT filename',src.includes('function srtFilename(video:Video)')&&src.match(/link\.download=srtFilename\(video\)/g)?.length===2],
  ['closed-modal fallback',src.includes('className="empty translation-needed"')&&src.includes('Επιλογή μετάφρασης')],
  ['single active translation modal',src.match(/onOpenManual=\{\(\)=>\{setProImportVideo\(translationChoiceVideo\);setTranslationChoiceVideo\(null\);\}\}/g)?.length===2],
  ['translation mode labels',src.includes('<h3>Auto Translate</h3>')&&src.includes('<h3>Manual Translate</h3>')],
  ['css imported',layout.includes('import "./v7-4-2.css";')],
  ['version',pkg.version==='7.4.3'&&layout.includes('"app-version": "7.4.3"')],
  ['premium css',css.includes('.editorial-guide-list>button')&&css.includes('.speed-control')],
];
for(const [label,ok] of checks){if(!ok)throw new Error(`v7.4.3 invariant failed: ${label}`)}
console.log(`v7.4.3 player/guide invariants passed (${checks.length})`);

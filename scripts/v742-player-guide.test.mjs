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
  ['css imported',layout.includes('import "./v7-4-2.css";')],
  ['version',pkg.version==='7.4.2'&&layout.includes('"app-version": "7.4.2"')],
  ['premium css',css.includes('.editorial-guide-list>button')&&css.includes('.speed-control')],
];
for(const [label,ok] of checks){if(!ok)throw new Error(`v7.4.2 invariant failed: ${label}`)}
console.log(`v7.4.2 player/guide invariants passed (${checks.length})`);

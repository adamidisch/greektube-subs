import fs from 'node:fs';
const src=fs.readFileSync('app/GreekTubePlayer.tsx','utf8');
const css=fs.readFileSync('app/v7-4-2.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const progressRoute=fs.readFileSync('app/api/manual-captions/progress/route.ts','utf8');
const captionsRoute=fs.readFileSync('app/api/captions/route.ts','utf8');
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
  ['single active translation modal',src.match(/onOpenManual=\{\(\)=>void requestManualImport\(translationChoiceVideo\)\}/g)?.length===2],
  ['translation mode labels',src.includes('<h3>Auto Translate</h3>')&&src.includes('<h3>Manual Translate</h3>')],
  ['css imported',layout.includes('import "./v7-4-2.css";')],
  ['real import progress',src.includes('/api/manual-captions/progress')&&src.includes('manual-import-progress')&&progressRoute.includes('Σύγκριση cues και timestamps')&&progressRoute.includes('currentCue: completed')],
  ['stream completion',progressRoute.includes('type: "complete"')&&progressRoute.includes('application/x-ndjson')],
  ['protected active import',src.includes('busy={importing}')&&src.includes('aria-busy={busy}')],
  ['manual import auth gate',src.includes('async function requestManualImport(video:Video)')&&src.includes('manualImportRequest&&<EditPassword')&&src.includes('onOpenManual={()=>void requestManualImport(translationChoiceVideo)}')],
  ['auth before file picker',src.includes('async function chooseImportFile()')&&src.includes('onClick={()=>void chooseImportFile()}')],
  ['source timing integrity',progressRoute.includes('hasValidManualCueTimings')&&!progressRoute.includes('cue.start >= cues[index - 1].start')],
  ['same source snapshot',src.includes('setSourceSubtitleText(text)')&&src.includes('subtitleText:text,sourceSubtitleText')&&src.match(/sessionStorage\.setItem\(`manual-source-srt:\$\{video\.id\}`/g)?.length===2&&progressRoute.includes('parseManualSubtitleText(body.sourceSubtitleText as string)')],
  ['cached source timing integrity',captionsRoute.includes('Source subtitle tracks can legitimately overlap')&&!captionsRoute.includes('cue.start >= cues[index - 1].start')],
  ['version',pkg.version==='7.4.8'&&layout.includes('"app-version": "7.4.8"')],
  ['premium css',css.includes('.editorial-guide-list>button')&&css.includes('.speed-control')],
];
for(const [label,ok] of checks){if(!ok)throw new Error(`v7.4.8 invariant failed: ${label}`)}
console.log(`v7.4.8 player/guide invariants passed (${checks.length})`);

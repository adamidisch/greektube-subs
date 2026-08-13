from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Package version is the single source of truth.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = "7.6.1"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

write(
    "app/version.ts",
    'import packageJson from "../package.json";\n\nexport const APP_VERSION = packageJson.version;\n',
)

# YouTube creator chapters: parse description, remove the 0:00 intro point, keep max five spread across the video.
metadata = read("app/api/metadata/route.ts")
chapter_helpers = r'''
type CreatorChapter = { time: number; title: string; summary: string };

function chapterSeconds(value: string) {
  const parts = value.split(":").map(part => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isFinite(part) || part < 0)) return null;
  const seconds = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  return Number.isFinite(seconds) ? seconds : null;
}

function limitCreatorChapters(items: CreatorChapter[]) {
  const meaningful = items
    .filter(item => item.time >= 15 && item.title.trim().length >= 2)
    .sort((a, b) => a.time - b.time)
    .filter((item, index, list) => index === 0 || Math.abs(item.time - list[index - 1].time) >= 8);
  if (meaningful.length <= 5) return meaningful;
  const last = meaningful.length - 1;
  const indexes = [0, Math.round(last * 0.25), Math.round(last * 0.5), Math.round(last * 0.75), last];
  return [...new Set(indexes)].map(index => meaningful[index]).slice(0, 5);
}

function creatorChaptersFromDescription(description: string, duration = 0) {
  const chapters: CreatorChapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const match = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*(?:[-–—|•·:]\s*)?(.{2,140}?)\s*$/);
    if (!match) continue;
    const time = chapterSeconds(match[1]);
    const title = match[2].replace(/\s+/g, " ").trim();
    if (time === null || !title || (duration > 0 && time >= duration)) continue;
    chapters.push({ time, title, summary: "" });
  }
  const deduped = chapters.filter((item, index, list) => list.findIndex(other => other.time === item.time) === index);
  return limitCreatorChapters(deduped);
}
'''
metadata = replace_once(metadata, 'function isGreek(value: string) {\n', chapter_helpers + '\nfunction isGreek(value: string) {\n', "metadata chapter helpers")
metadata = replace_once(
    metadata,
    '    const category = categoryFor(originalTitle, details.description, speakerName);\n    return NextResponse.json({\n',
    '    const category = categoryFor(originalTitle, details.description, speakerName);\n    const creatorChapterSource = creatorChaptersFromDescription(details.description, details.duration);\n    const creatorChapters = await Promise.all(creatorChapterSource.map(async chapter => ({\n      ...chapter,\n      title: await greekTitle(chapter.title),\n    })));\n    return NextResponse.json({\n',
    "metadata chapter extraction",
)
metadata = replace_once(metadata, '      tags: [category === "Medical" ? "υγεία" : category.toLowerCase(), speakerName].filter(Boolean),\n      thumbnail:', '      tags: [category === "Medical" ? "υγεία" : category.toLowerCase(), speakerName].filter(Boolean),\n      creatorChapters,\n      thumbnail:', "metadata chapter response")
metadata = replace_once(metadata, '        tags: [],\n        thumbnail:', '        tags: [],\n        creatorChapters: [],\n        thumbnail:', "metadata pending chapter response")
write("app/api/metadata/route.ts", metadata)

# Native React readiness + volume drag + guide quality + version source.
player = read("app/GreekTubePlayer.tsx")
player = replace_once(player, 'import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";\n', 'import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";\nimport { APP_VERSION } from "./version";\n', "player version import")
player = replace_once(player, '  speakerName?:string; speakerRole?:string; channelUrl?:string; originalVideoUrl?:string; views?:number; metadataVersion?:number;\n', '  speakerName?:string; speakerRole?:string; channelUrl?:string; originalVideoUrl?:string; views?:number; metadataVersion?:number; creatorChapters?:GuideItem[];\n', "video creator chapters type")

old_complete = '''function isCompleteGreekTranscript(data:Captions|null|undefined,duration=0) {
  if(!data?.cues?.length||data.transcriptVersion!==12)return false;
  const cues=data.cues;
  const ordered=cues.length>=3&&cues.every((cue,index)=>Number.isFinite(cue.start)&&Number.isFinite(cue.duration)&&cue.duration>0&&cue.text.trim().length>0&&(index===0||cue.start>=cues[index-1].start));
  if(!ordered)return false;
'''
new_complete = '''function isCompleteGreekTranscript(data:Captions|null|undefined,duration=0) {
  if(!data?.cues?.length||data.transcriptVersion!==12)return false;
  const cues=data.cues;
  let latestStart=-Infinity;
  const ordered=cues.length>=3&&cues.every(cue=>{
    const valid=Number.isFinite(cue.start)&&Number.isFinite(cue.duration)&&cue.duration>0&&cue.text.trim().length>0;
    if(!valid||cue.start<latestStart-5)return false;
    latestStart=Math.max(latestStart,cue.start);
    return true;
  });
  if(!ordered)return false;
'''
player = replace_once(player, old_complete, new_complete, "transcript tolerance")

old_guide = '''function videoGuide(captions:Captions|null|undefined,videoId?:string):GuideItem[] {
  if(videoId&&EDITORIAL_GUIDES[videoId])return EDITORIAL_GUIDES[videoId];
  if(!captions?.cues?.length)return [];
  const cues=captions.cues.filter(cue=>cleanGuideText(cue.text).length>28);
  if(!cues.length)return [];
  const targets=[.08,.24,.42,.6,.78];
  const points=(captions.keyPoints||[]).map(cleanGuideText).filter(point=>point.length>12).slice(0,5);
  if(points.length){
    return points.map((point,index)=>{
      const needle=point.slice(0,38).toLowerCase();
      const match=cues.find(cue=>cleanGuideText(cue.text).toLowerCase().includes(needle));
      const fallback=cues[Math.min(cues.length-1,Math.max(0,Math.round((cues.length-1)*(targets[index]||.5))))];
      return {time:(match||fallback).start,title:conciseGuideTitle(point,index),summary:point};
    });
  }
  return [];
}
'''
new_guide = '''function limitGuideItems(items:GuideItem[]) {
  const clean=items.filter(item=>Number.isFinite(item.time)&&item.time>=15&&cleanGuideText(item.title).length>=2).sort((a,b)=>a.time-b.time);
  if(clean.length<=5)return clean;
  const last=clean.length-1;
  const indexes=[0,Math.round(last*.25),Math.round(last*.5),Math.round(last*.75),last];
  return [...new Set(indexes)].map(index=>clean[index]).slice(0,5);
}
function videoGuide(_captions:Captions|null|undefined,videoId?:string,creatorChapters:GuideItem[]=[]):GuideItem[] {
  const creator=limitGuideItems(creatorChapters);
  if(creator.length)return creator;
  if(videoId&&EDITORIAL_GUIDES[videoId])return limitGuideItems(EDITORIAL_GUIDES[videoId]);
  return [];
}
'''
player = replace_once(player, old_guide, new_guide, "quality guide logic")

player = replace_once(player, '  const [loading,setLoading]=useState(false);\n', '  const [loading,setLoading]=useState(false);\n  const [checkingReady,setCheckingReady]=useState(false);\n', "native readiness state")
player = replace_once(player, '  const controlsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n', '  const controlsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n  const volumeDragging=useRef(false);\n', "volume drag ref")

player = player.replace('metadataVersion!==5', 'metadataVersion!==6')
player = player.replace('metadataVersion:5', 'metadataVersion:6')
player = re.sub(r'tags\?:string\[\]\}', 'tags?:string[];creatorChapters?:GuideItem[]}', player)
player = replace_once(player, 'tags:metadata.tags?.length?Array.from(new Set([...video.tags,...metadata.tags])):video.tags,metadataVersion:6', 'tags:metadata.tags?.length?Array.from(new Set([...video.tags,...metadata.tags])):video.tags,creatorChapters:metadata.creatorChapters?.length?metadata.creatorChapters:video.creatorChapters,metadataVersion:6', "metadata chapters merge")
player = replace_once(player, 'metadataVersion:6,translationMode:mode};', 'metadataVersion:6,creatorChapters:metadata.creatorChapters,translationMode:mode};', "new video chapters")

player = replace_once(player, '    history.replaceState(null,"",`/?video=${video.id}${start?`&t=${Math.floor(start)}`:""}`);\n    if(readyCaptions){\n', '    history.replaceState(null,"",`/?video=${video.id}${start?`&t=${Math.floor(start)}`:""}`);\n    setCheckingReady(!readyCaptions&&!forceTranslation);\n    if(readyCaptions){\n', "readiness start")
player = replace_once(player, 'setProgress(100);setCaptions(readyCaptions);setLoading(false);', 'setProgress(100);setCaptions(readyCaptions);setLoading(false);setCheckingReady(false);', "ready captions clears check")
player = replace_once(player, 'setProgress(100);setCaptions(ready);setLoading(false);', 'setProgress(100);setCaptions(ready);setLoading(false);setCheckingReady(false);', "server ready clears check")
player = replace_once(player, 'setProgress(100);setCaptions(cached);setLoading(false);', 'setProgress(100);setCaptions(cached);setLoading(false);setCheckingReady(false);', "local ready clears check")
player = replace_once(player, 'setLoading(false);setProgress(0);setCaptions(null);return;', 'setCheckingReady(false);setLoading(false);setProgress(0);setCaptions(null);return;', "unavailable clears check")
player = replace_once(player, '    setLoading(false); setProgress(3); setCaptions(null);\n', '    setCheckingReady(false); setLoading(false); setProgress(3); setCaptions(null);\n', "translation clears check")

player = replace_once(player, '    const guideItems=videoGuide(captions,selected.id);\n', '    const guideItems=videoGuide(captions,selected.id,selected.creatorChapters||[]);\n', "guide creator source")

player = replace_once(player, '      {loading&&<section className="content-loading">\n', '      {checkingReady&&<section className="readiness-check" role="status" aria-live="polite"><span className="readiness-spinner" aria-hidden="true"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18"/></svg></span><small>ΕΛΕΓΧΟΣ ΕΛΛΗΝΙΚΩΝ ΥΠΟΤΙΤΛΩΝ</small></section>}\n      {!checkingReady&&loading&&<section className="content-loading">\n', "native readiness UI")
player = replace_once(player, '      {error&&<section className="empty">', '      {!checkingReady&&error&&<section className="empty">', "error readiness gate")
player = replace_once(player, '      {!loading&&!captions&&!error&&<section className="video-details">', '      {!checkingReady&&!loading&&!captions&&!error&&<section className="video-details">', "details readiness gate")
player = replace_once(player, '      {!loading&&captions&&<>', '      {!checkingReady&&!loading&&captions&&<>', "player readiness gate")

old_volume = '''                            {volumeSliderOpen&&<div className="volume-popup" onMouseLeave={()=>setVolumeSliderOpen(false)}>
                              <button className="volume-mute-btn" aria-label={isMuted?"Ενεργοποίηση ήχου":"Σίγαση"} onClick={toggleMute}>{isMuted||volume===0?"🔇":"🔊"}</button>
                              <input type="range" min={0} max={100} value={isMuted?0:volume} onChange={e=>changeVolume(Number(e.target.value))} aria-label="Ένταση ήχου"/>
                            </div>}
'''
new_volume = '''                            {volumeSliderOpen&&<div className="volume-popup" onMouseLeave={()=>{if(!volumeDragging.current)setVolumeSliderOpen(false)}}>
                              <button className="volume-mute-btn" aria-label={isMuted?"Ενεργοποίηση ήχου":"Σίγαση"} onClick={toggleMute}>{isMuted||volume===0?"🔇":"🔊"}</button>
                              <input type="range" min={0} max={100} value={isMuted?0:volume} onPointerDown={event=>{volumeDragging.current=true;try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}}} onPointerUp={()=>{volumeDragging.current=false}} onPointerCancel={()=>{volumeDragging.current=false}} onChange={e=>changeVolume(Number(e.target.value))} aria-label="Ένταση ήχου"/>
                            </div>}
'''
player = replace_once(player, old_volume, new_volume, "volume drag behavior")

player = player.replace('<small>EDITORIAL GUIDE</small>', '<small>{selected.creatorChapters?.length?"YOUTUBE CHAPTERS":"EDITORIAL GUIDE"}</small>')
player = player.replace('<small>{item.summary}</small>', '{item.summary&&<small>{item.summary}</small>}')
player = player.replace('Επιλεγμένα σημεία με σύντομη περίληψη και context ώστε να πηγαίνεις κατευθείαν στην ουσία χωρίς raw αποσπάσματα υποτίτλων.', '{selected.creatorChapters?.length?"Κεφάλαια που έχει ορίσει ο δημιουργός του βίντεο στο YouTube.":"Επιλεγμένα σημεία με σύντομη περίληψη και context ώστε να πηγαίνεις κατευθείαν στην ουσία."}')
lines = player.splitlines()
guide_lines = [index for index, line in enumerate(lines) if 'className={`video-guide editorial-guide' in line]
if len(guide_lines) != 1:
    raise RuntimeError(f"guide render: expected one line, found {len(guide_lines)}")
idx = guide_lines[0]
indent = lines[idx][:len(lines[idx]) - len(lines[idx].lstrip())]
lines[idx] = indent + '{guideItems.length>0&&' + lines[idx].lstrip() + '}'
player = "\n".join(lines) + ("\n" if player.endswith("\n") else "")

player = replace_once(player, 'function Brand({home}:{home:()=>void}){return <button className="brand brand-home" aria-label="Αρχική σελίδα" onClick={home}><span className="brand-mark"><i aria-hidden="true"/>▶</span><span>GreekTube <b>Subs</b></span><small className="brand-version">ver 7.4.11</small></button>;}\n', 'function Brand({home}:{home:()=>void}){return <button className="brand brand-home" aria-label="Αρχική σελίδα" onClick={home}><span className="brand-mark"><i aria-hidden="true"/>▶</span><span>GreekTube <b>Subs</b></span><small className="brand-version">{`ver ${APP_VERSION}`}</small></button>;}\n', "brand package version")
player = replace_once(player, 'function close(){player.current?.destroy();player.current=null;setIsPseudoFullscreen(false);setSelectedId(null);setCaptions(null);setTranscriptOpen(false);setError("");history.replaceState(null,"","/");}', 'function close(){player.current?.destroy();player.current=null;setIsPseudoFullscreen(false);setCheckingReady(false);setSelectedId(null);setCaptions(null);setTranscriptOpen(false);setError("");history.replaceState(null,"","/");}', "close readiness cleanup")
write("app/GreekTubePlayer.tsx", player)

# Persist chapter-aware metadata in personal state until shared metadata is synced by admin.
state_route = read("app/api/state/route.ts")
state_route = replace_once(state_route, '      views: Number(personalVideo?.views || 0),\n', '      views: Number(personalVideo?.views || 0),\n      creatorChapters: Array.isArray(personalVideo?.creatorChapters) ? personalVideo.creatorChapters : video.creatorChapters,\n      metadataVersion: Math.max(Number(video.metadataVersion || 0), Number(personalVideo?.metadataVersion || 0)),\n', "state chapter persistence")
write("app/api/state/route.ts", state_route)

# Remove RuntimePolish workaround; layout reads version from package.
layout = read("app/layout.tsx")
layout = layout.replace('import RuntimePolish from "./RuntimePolish";\n', '')
layout = replace_once(layout, 'import { Geist, Geist_Mono } from "next/font/google";\n', 'import { Geist, Geist_Mono } from "next/font/google";\nimport { APP_VERSION } from "./version";\n', "layout version import")
layout = replace_once(layout, 'import "./v7-6-0.css";\n', 'import "./v7-6-0.css";\nimport "./v7-6-1.css";\n', "layout final css")
layout = layout.replace('"codex-preview": "v7.6.0-runtime-readiness-ui-polish",', '"codex-preview": `v${APP_VERSION}-production-cleanup`,')
layout = layout.replace('"app-version": "7.6.0",', '"app-version": APP_VERSION,')
layout = layout.replace('        <RuntimePolish />\n', '')
write("app/layout.tsx", layout)

runtime = ROOT / "app/RuntimePolish.tsx"
if runtime.exists():
    runtime.unlink()

write(
    "app/v7-6-1.css",
    '''/* v7.6.1 — production cleanup: native readiness + creator chapters */
.readiness-check{
  min-height:calc(100svh - 60px);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:15px;
  background:var(--bg);
  color:var(--muted);
}
.readiness-spinner{width:50px;height:50px;color:var(--accent2)}
.readiness-spinner svg{width:100%;height:100%;animation:v761-ready-spin 1.05s linear infinite}
.readiness-spinner circle{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-dasharray:88;stroke-dashoffset:66;opacity:.92}
.readiness-check small{font-size:9px;font-weight:650;letter-spacing:.09em;white-space:nowrap}
@keyframes v761-ready-spin{to{transform:rotate(360deg)}}
.runtime-readiness-overlay{display:none!important}
.editorial-guide-list button span:has(>strong:only-child) strong{margin-bottom:0}
@media(max-width:620px){
  .readiness-check{min-height:calc(100svh - 59px)}
  .readiness-spinner{width:44px;height:44px}
  .readiness-check small{font-size:8px}
}
@media(prefers-reduced-motion:reduce){.readiness-spinner svg{animation:none}}
''',
)

final_player = read("app/GreekTubePlayer.tsx")
for needle, label in [
    ('import { APP_VERSION } from "./version";', "APP_VERSION import"),
    ('const [checkingReady,setCheckingReady]=useState(false);', "native readiness state"),
    ('creatorChapters?:GuideItem[]', "creator chapters field"),
    ('setCheckingReady(!readyCaptions&&!forceTranslation)', "readiness start"),
    ('volumeDragging.current=true', "volume drag"),
    ('YOUTUBE CHAPTERS', "creator chapter label"),
    ('{`ver ${APP_VERSION}`}', "brand version"),
]:
    if needle not in final_player:
        raise RuntimeError(f"Missing invariant: {label}")
if "RuntimePolish" in read("app/layout.tsx"):
    raise RuntimeError("RuntimePolish still wired in layout")
if (ROOT / "app/RuntimePolish.tsx").exists():
    raise RuntimeError("RuntimePolish file still exists")

print("v7.6.1 production cleanup applied")

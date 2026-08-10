from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()
player = replace_once(
    player,
    "function subtitleWindow(cue:Cue|undefined,currentTime:number){",
    "function subtitleWindow(cue:Cue|undefined,currentTime:number,nextCue?:Cue){",
    "subtitleWindow signature",
)
player = replace_once(
    player,
    "  const duration=Math.max(.1,cue.duration);",
    "  const nextBoundary=nextCue&&nextCue.start>cue.start?nextCue.start-cue.start:cue.duration;\n  const duration=Math.max(.1,Math.min(cue.duration,nextBoundary));",
    "effective subtitle duration",
)

old_render = '''{state.settings.subtitles&&active>=0&&<div className={`subtitles ${state.settings.subtitlePosition}`} style={{"--subtitle-size":`${state.settings.subtitleSize}px`,background:`rgba(0,0,0,${state.settings.opacity})`} as CSSProperties}>{state.settings.subtitleMode==="en"?subtitleWindow(captions.englishCues?.[active]||captions.cues[active],playhead):state.settings.subtitleMode==="dual"?<><span>{subtitleWindow(captions.cues[active],playhead)}</span>{captions.englishCues?.[active]?.text&&<small>{subtitleWindow(captions.englishCues[active],playhead)}</small>}</>:subtitleWindow(captions.cues[active],playhead)}</div>}'''
new_render = '''{state.settings.subtitles&&active>=0&&<div className={`subtitles ${state.settings.subtitlePosition}`} style={{"--subtitle-size":`${state.settings.subtitleSize}px`,background:`rgba(0,0,0,${state.settings.opacity})`} as CSSProperties}>{state.settings.subtitleMode==="en"?subtitleWindow(captions.englishCues?.[active]||captions.cues[active],playhead,captions.englishCues?.[active+1]||captions.cues[active+1]):state.settings.subtitleMode==="dual"?<><span>{subtitleWindow(captions.cues[active],playhead,captions.cues[active+1])}</span>{captions.englishCues?.[active]?.text&&<small>{subtitleWindow(captions.englishCues[active],playhead,captions.englishCues?.[active+1]||captions.cues[active+1])}</small>}</>:subtitleWindow(captions.cues[active],playhead,captions.cues[active+1])}</div>}'''
player = replace_once(player, old_render, new_render, "subtitle render calls")
player_path.write_text(player)


route_path = Path("app/api/captions/route.ts")
route = route_path.read_text()
old_return = '''  preparedCues.forEach((cue, index) => {
    const next = preparedCues[index + 1];
    current.push(cue);
    characters += cue.text.length;
    const elapsed = cue.start + cue.duration - current[0].start;
    const sentenceEnd = /[.!?…]["')\\]]?$/.test(cue.text.trim());
    const naturalPause = next ? next.start - (cue.start + cue.duration) >= 0.9 : true;
    const longEnough = elapsed >= 4.5 || characters >= 90;
    const mustSplit = elapsed >= 9 || characters >= 180;

    if (mustSplit || (longEnough && (sentenceEnd || naturalPause)) || !next) flush();
  });

  return units;
}'''
new_return = '''  preparedCues.forEach((cue, index) => {
    const next = preparedCues[index + 1];
    current.push(cue);
    characters += cue.text.length;
    const elapsed = cue.start + cue.duration - current[0].start;
    const sentenceEnd = /[.!?…]["')\\]]?$/.test(cue.text.trim());
    const naturalPause = next ? next.start - (cue.start + cue.duration) >= 0.9 : true;
    const longEnough = elapsed >= 4.5 || characters >= 90;
    const mustSplit = elapsed >= 9 || characters >= 180;

    if (mustSplit || (longEnough && (sentenceEnd || naturalPause)) || !next) flush();
  });

  // Source caption ranges can overlap. A displayed cue is only active until
  // the next cue starts, so normalize its duration to that real window.
  return units.map((unit, index) => {
    const next = units[index + 1];
    if (!next || next.start <= unit.start) return unit;
    return {
      ...unit,
      duration: Math.max(0.8, Math.min(unit.duration, next.start - unit.start)),
    };
  });
}'''
route = replace_once(route, old_return, new_return, "meaning-unit overlap normalization")
route_path.write_text(route)

print("Applied v7.1.2 overlap-aware subtitle timing refinement")

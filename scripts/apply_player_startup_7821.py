from pathlib import Path
import json

player_path = Path('app/GreekTubePlayer.tsx')
css_path = Path('app/screen-isolation.css')
package_path = Path('package.json')

player = player_path.read_text()
css = css_path.read_text()
package = json.loads(package_path.read_text())


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)

player = replace_once(
    player,
    '  const [isPlaying,setIsPlaying]=useState(false);\n  const [volume,setVolumeState]=useState(100);',
    '  const [isPlaying,setIsPlaying]=useState(false);\n  const [playerReady,setPlayerReady]=useState(false);\n  const [volume,setVolumeState]=useState(100);',
    'playerReady state',
)

player = replace_once(
    player,
    '  const selected=state.videos.find(v=>v.id===selectedId)||null;\n\n  useEffect(()=>{\n    if(!selectedId||!captions||state.settings.subtitleMode==="el"||captions.englishCues?.length)return;',
    '''  const selected=state.videos.find(v=>v.id===selectedId)||null;\n\n  useEffect(()=>{\n    // Warm the YouTube API while the user is still browsing the library so the\n    // first playback does not pay the script-download cost after the click.\n    for(const href of ["https://www.youtube.com","https://i.ytimg.com"]){\n      if(document.head.querySelector(`link[rel="preconnect"][href="${href}"]`))continue;\n      const link=document.createElement("link");\n      link.rel="preconnect";link.href=href;link.crossOrigin="anonymous";\n      document.head.appendChild(link);\n    }\n    if(window.YT?.Player||document.querySelector('script[src="https://www.youtube.com/iframe_api"]'))return;\n    const script=document.createElement("script");\n    script.src="https://www.youtube.com/iframe_api";script.async=true;\n    document.head.appendChild(script);\n  },[]);\n\n  useEffect(()=>{\n    if(!selectedId||!captions||state.settings.subtitleMode==="el"||captions.englishCues?.length)return;''',
    'youtube warmup effect',
)

player = replace_once(
    player,
    '    patchVideo(video.id,{views:(video.views||0)+1});\n    setSelectedId(video.id); setView("library"); setError(""); setLoadingDescription(video.description||"Ετοιμάζουμε την ελληνική περιγραφή του βίντεο."); setLoadingPoints(knownPoints); setTranscriptOpen(showTranscript); setProcessingTelemetry(null); lastTelemetryUpdatedAt.current=null;',
    '    patchVideo(video.id,{views:(video.views||0)+1});\n    player.current?.destroy();player.current=null;setPlayerReady(false);setIsPlaying(false);\n    setSelectedId(video.id); setView("library"); setError(""); setLoadingDescription(video.description||"Ετοιμάζουμε την ελληνική περιγραφή του βίντεο."); setLoadingPoints(knownPoints); setTranscriptOpen(showTranscript); setProcessingTelemetry(null); lastTelemetryUpdatedAt.current=null;',
    'openVideo lifecycle reset',
)

player = player.replace('window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),80);', 'window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),0);')
if player.count('window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),80);'):
    raise SystemExit('ready-player delay replacement incomplete')

old_ready = 'events:{onReady:({target}:{target:Player})=>{disableYouTubeCaptions(target);window.setTimeout(()=>disableYouTubeCaptions(target),350);const appliedRate=pendingShareSpeed.current??state.settings.speed;target.setPlaybackRate(appliedRate);pendingShareSpeed.current=null;if(state.settings.autoplay||playWhenReady.current){playWhenReady.current=false;target.playVideo();}},onApiChange:'
new_ready = 'events:{onReady:({target}:{target:Player})=>{setPlayerReady(true);disableYouTubeCaptions(target);window.setTimeout(()=>disableYouTubeCaptions(target),350);const appliedRate=pendingShareSpeed.current??state.settings.speed;target.setPlaybackRate(appliedRate);pendingShareSpeed.current=null;if(state.settings.autoplay||playWhenReady.current){playWhenReady.current=false;target.playVideo();}},onApiChange:'
player = replace_once(player, old_ready, new_ready, 'player onReady')

player = replace_once(
    player,
    '  function close(){player.current?.destroy();player.current=null;setIsPseudoFullscreen(false);setCheckingReady(false);setSelectedId(null);setCaptions(null);setTranscriptOpen(false);setError("");history.replaceState(null,"","/");}',
    '  function close(){player.current?.destroy();player.current=null;setPlayerReady(false);setIsPlaying(false);setIsPseudoFullscreen(false);setCheckingReady(false);setSelectedId(null);setCaptions(null);setTranscriptOpen(false);setError("");history.replaceState(null,"","/");}',
    'close player lifecycle',
)

player = replace_once(
    player,
    '      {checkingReady&&<section className="readiness-check" role="status" aria-live="polite"><span className="readiness-spinner" aria-hidden="true"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18"/></svg></span><small>ΕΛΕΓΧΟΣ ΕΛΛΗΝΙΚΩΝ ΥΠΟΤΙΤΛΩΝ</small></section>}',
    '      {checkingReady&&<section className="player-startup-shell" role="status" aria-live="polite"><div className="player-startup-frame"><img src={`https://i.ytimg.com/vi/${selected.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`}} alt=""/><div className="player-startup-scrim"/><div className="player-startup-status"><span className="player-startup-spinner" aria-hidden="true"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18"/></svg></span><strong>ΕΤΟΙΜΑΖΟΥΜΕ ΤΟ ΒΙΝΤΕΟ</strong><small>ΕΛΕΓΧΟΣ ΕΛΛΗΝΙΚΩΝ ΥΠΟΤΙΤΛΩΝ</small></div></div></section>}',
    'readiness loader',
)

player = replace_once(
    player,
    '{showPlayerCover&&<button className="player-cover" aria-label="Αναπαραγωγή βίντεο" onClick={togglePlayback}><img src={`https://i.ytimg.com/vi/${selected.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`}} alt=""/><span className="cover-play">▶</span><span className="cover-caption"><small>{displaySpeakerLabel}</small><strong>{greekTitle(selected)}</strong></span></button>}',
    '{showPlayerCover&&<button className={`player-cover ${playerReady?"":"is-loading"}`} aria-label={playerReady?"Αναπαραγωγή βίντεο":"Το βίντεο ετοιμάζεται"} onClick={togglePlayback}><img src={`https://i.ytimg.com/vi/${selected.id}/maxresdefault.jpg`} onError={e=>{e.currentTarget.src=`https://i.ytimg.com/vi/${selected.id}/hqdefault.jpg`}} alt=""/>{playerReady?<span className="cover-play">▶</span>:<span className="cover-loading" aria-hidden="true"><i/><small>ΕΤΟΙΜΑΖΟΥΜΕ ΤΟ ΒΙΝΤΕΟ</small></span>}<span className="cover-caption"><small>{displaySpeakerLabel}</small><strong>{greekTitle(selected)}</strong></span></button>}',
    'player cover loader',
)

player = replace_once(
    player,
    '<label>Διαφάνεια φόντου<input type="range" min="0" max="100" step="10" value={transparency} onPointerUp={blurAfterPointer} onChange={e=>update({opacity:1-(+e.target.value/100)})}/><output>{transparency}% διαφάνεια</output></label><div className="subtitle-settings-preview" aria-label="Προεπισκόπηση υποτίτλων"><span style={{background:`rgba(0,0,0,${settings.opacity})`,fontSize:`${Math.min(22,settings.subtitleSize)}px`}}>Προεπισκόπηση ελληνικών υποτίτλων</span></div><label>Καθυστέρηση υποτίτλων',
    '<label>Διαφάνεια φόντου<input type="range" min="0" max="100" step="10" value={transparency} onPointerUp={blurAfterPointer} onChange={e=>update({opacity:1-(+e.target.value/100)})}/><output>{transparency}% διαφάνεια</output></label><label>Καθυστέρηση υποτίτλων',
    'remove subtitle preview',
)

preview_css = '''.subtitle-settings-preview{\n  min-height:92px;\n  display:grid;\n  place-items:center;\n  margin-top:-2px;\n  padding:16px;\n  overflow:hidden;\n  border:1px solid var(--line);\n  border-radius:12px;\n  background:linear-gradient(145deg,#5e6570,#89919d);\n}\n.subtitle-settings-preview>span{\n  max-width:min(92%,560px);\n  padding:7px 12px;\n  border-radius:7px;\n  color:#fff;\n  font-weight:650;\n  line-height:1.35;\n  text-align:center;\n  text-shadow:0 1px 2px rgba(0,0,0,.4);\n}\n'''
if preview_css not in css:
    raise SystemExit('subtitle preview css block not found')
css = css.replace(preview_css, '', 1)

startup_css = r'''

/* Fast player-open feedback. The thumbnail appears immediately while the
   transcript readiness check and YouTube iframe initialization complete. */
.player-startup-shell{
  width:min(100%,1120px);
  margin:24px auto 40px;
  padding:0 clamp(0px,1vw,10px);
}
.player-startup-frame{
  position:relative;
  width:100%;
  aspect-ratio:16/9;
  overflow:hidden;
  border:1px solid var(--line);
  border-radius:14px;
  background:#090a0d;
  box-shadow:0 20px 55px rgba(0,0,0,.18);
}
.player-startup-frame>img{
  width:100%;height:100%;display:block;object-fit:cover;
  filter:saturate(.82) brightness(.72);
  transform:scale(1.01);
}
.player-startup-scrim{
  position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(5,6,9,.16),rgba(5,6,9,.46));
}
.player-startup-status{
  position:absolute;inset:0;
  display:grid;place-items:center;align-content:center;gap:8px;
  padding:24px;text-align:center;color:#fff;
}
.player-startup-status strong{
  font-size:13px;font-weight:760;letter-spacing:.08em;
}
.player-startup-status small{
  color:rgba(255,255,255,.68);font-size:9px;font-weight:700;letter-spacing:.1em;
}
.player-startup-spinner{
  width:42px;height:42px;display:block;margin-bottom:4px;
}
.player-startup-spinner svg{width:100%;height:100%;animation:gtsStartupSpin .85s linear infinite}
.player-startup-spinner circle{fill:none;stroke:rgba(255,255,255,.22);stroke-width:3.5;stroke-linecap:round;stroke-dasharray:78 35}
.player-cover.is-loading{cursor:progress}
.player-cover .cover-loading{
  position:absolute;left:50%;top:50%;z-index:3;
  transform:translate(-50%,-50%);
  display:grid;place-items:center;gap:9px;
  color:#fff;text-align:center;pointer-events:none;
}
.player-cover .cover-loading i{
  width:38px;height:38px;border-radius:50%;
  border:3px solid rgba(255,255,255,.23);border-top-color:#fff;
  animation:gtsStartupSpin .8s linear infinite;
}
.player-cover .cover-loading small{
  font-size:9px;font-weight:760;letter-spacing:.09em;
  text-shadow:0 2px 12px rgba(0,0,0,.55);
}
@keyframes gtsStartupSpin{to{transform:rotate(360deg)}}
@media(max-width:620px){
  .player-startup-shell{margin:14px auto 26px;padding:0}
  .player-startup-frame{border-radius:10px}
  .player-startup-status strong{font-size:11px}
  .player-startup-spinner{width:36px;height:36px}
}
'''
if 'player-startup-shell{' in css:
    raise SystemExit('startup css already present')
css = css.rstrip() + startup_css + '\n'

if package.get('version') != '7.8.20':
    raise SystemExit(f'unexpected version: {package.get("version")}')
package['version'] = '7.8.21'

player_path.write_text(player)
css_path.write_text(css)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')
print('Applied player startup 7.8.21 migration')

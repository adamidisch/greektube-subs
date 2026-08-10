from pathlib import Path

path = Path("app/GreekTubePlayer.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    '  getOptions: () => string[];\n};',
    '  getOptions: () => string[];\n  setVolume: (volume: number) => void; getVolume: () => number;\n  mute: () => void; unMute: () => void; isMuted: () => boolean;\n};',
    "Player volume methods",
)

replace_once(
    '  const [isPlaying,setIsPlaying]=useState(false);\n  const [showFsExit,setShowFsExit]=useState(true);',
    '  const [isPlaying,setIsPlaying]=useState(false);\n  const [volume,setVolumeState]=useState(100);\n  const [isMuted,setIsMuted]=useState(false);\n  const [volumeSliderOpen,setVolumeSliderOpen]=useState(false);\n  const [showFsExit,setShowFsExit]=useState(true);',
    "volume state",
)

replace_once(
    '''  function revealFsExit(){
    setShowFsExit(true);
    if(fsExitTimer.current)clearTimeout(fsExitTimer.current);
    if(isPlaying)fsExitTimer.current=setTimeout(()=>setShowFsExit(false),2200);
  }
  async function toggleFullscreen(){''',
    '''  function revealFsExit(){
    setShowFsExit(true);
    if(fsExitTimer.current)clearTimeout(fsExitTimer.current);
    if(isPlaying)fsExitTimer.current=setTimeout(()=>setShowFsExit(false),2200);
  }
  function toggleMute(){
    const target=currentPlayer();if(!target||typeof target.mute!=="function")return;
    if(isMuted||volume===0){target.unMute();if(volume===0){target.setVolume(70);setVolumeState(70)}setIsMuted(false);}
    else{target.mute();setIsMuted(true);}
  }
  function changeVolume(next:number){
    const target=currentPlayer();if(!target||typeof target.setVolume!=="function")return;
    const clamped=Math.max(0,Math.min(100,next));
    target.setVolume(clamped);setVolumeState(clamped);
    if(clamped===0){target.mute();setIsMuted(true);}else if(isMuted){target.unMute();setIsMuted(false);}
  }
  async function toggleFullscreen(){''',
    "volume handlers",
)

replace_once(
    '    if(isAppleMobile){setIsPseudoFullscreen(true);return;}',
    '    if(isAppleMobile){window.scrollTo(0,0);setIsPseudoFullscreen(true);return;}',
    "iOS fullscreen scroll reset",
)

replace_once(
    '                {(isFullscreen||isPseudoFullscreen)&&<button className={`custom-fullscreen${showFsExit?"":" fs-exit-hidden"}`} title="Έξοδος από πλήρη οθόνη" aria-label="Έξοδος από πλήρη οθόνη" onClick={()=>void toggleFullscreen()}>↙</button>}',
    '                {(isFullscreen||isPseudoFullscreen)&&<button className={`custom-fullscreen${showFsExit?"":" fs-exit-hidden"}`} title="Έξοδος από πλήρη οθόνη" aria-label="Έξοδος από πλήρη οθόνη" onClick={e=>{e.preventDefault();e.stopPropagation();void toggleFullscreen();}} onTouchEnd={e=>{e.preventDefault();e.stopPropagation();void toggleFullscreen();}}>↙</button>}',
    "fullscreen exit ghost-click guard",
)

replace_once(
    '                          <button className="skip-button" aria-label="Μπροστά 10 δευτερόλεπτα" onClick={()=>skip(10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M13 5l7 7-7 7M20 12h-9a5 5 0 010-10"/></svg><small>10s</small></button>',
    '''                          <button className="skip-button" aria-label="Μπροστά 10 δευτερόλεπτα" onClick={()=>skip(10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M13 5l7 7-7 7M20 12h-9a5 5 0 010-10"/></svg><small>10s</small></button>
                          <div className="volume-control">
                            <button className="volume-toggle" aria-label={isMuted||volume===0?"Ενεργοποίηση ήχου":"Ρύθμιση/σίγαση ήχου"} onClick={()=>setVolumeSliderOpen(o=>!o)}>
                              {isMuted||volume===0?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16 9l5 5M21 9l-5 5"/></svg>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8 8 0 010 12"/></svg>}
                            </button>
                            {volumeSliderOpen&&<div className="volume-popup" onMouseLeave={()=>setVolumeSliderOpen(false)}>
                              <button className="volume-mute-btn" aria-label={isMuted?"Ενεργοποίηση ήχου":"Σίγαση"} onClick={toggleMute}>{isMuted||volume===0?"🔇":"🔊"}</button>
                              <input type="range" min={0} max={100} value={isMuted?0:volume} onChange={e=>changeVolume(Number(e.target.value))} aria-label="Ένταση ήχου"/>
                            </div>}
                          </div>''',
    "volume control markup",
)

replace_once(
    '<small className="brand-version">ver 6.6.14</small>',
    '<small className="brand-version">ver 6.6.15</small>',
    "brand version",
)

replace_once(
    '<button aria-label="Αγαπημένο" className={`heart ${video.favorite?"active":""}`} onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();patch(video.id,{favorite:!video.favorite})}}>♥</button>{video.progress>0&&<i className="card-progress"',
    '<div className="thumb-top-right"><span className="card-category">{CATEGORY_LABELS[video.category]}</span><button aria-label="Αγαπημένο" className={`heart ${video.favorite?"active":""}`} onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();patch(video.id,{favorite:!video.favorite})}}>♥</button></div>{video.progress>0&&<i className="card-progress"',
    "thumbnail category badge",
)

replace_once(
    '<small>{variant==="continue"?(totalMinutes>0?`${watchedMinutes} / ${totalMinutes} λεπτά`:"Η διάρκεια υπολογίζεται…"):CATEGORY_LABELS[video.category]}</small>{variant==="library"&&settings.descriptions',
    '{variant==="continue"&&<small>{totalMinutes>0?`${watchedMinutes} / ${totalMinutes} λεπτά`:"Η διάρκεια υπολογίζεται…"}</small>}{variant==="library"&&settings.descriptions',
    "remove duplicate category line",
)

path.write_text(text, encoding="utf-8")
print("GreekTubePlayer.tsx patched successfully")

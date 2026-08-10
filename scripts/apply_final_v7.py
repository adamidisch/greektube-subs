from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing pattern: {label}")
    return text.replace(old, new, 1)

# ---------------- GreekTubePlayer.tsx ----------------
player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()

# concise thresholds / paging
anchor = 'function watchProgressLabel(video:Video) {\n'
constants = '''const WATCHED_THRESHOLD=90;\nconst CONTINUE_MIN_SECONDS=30;\nconst CONTINUE_MIN_PROGRESS=2;\nconst PAGE_SIZE=12;\n\n'''
player = replace_once(player, anchor, constants + anchor, "v7 constants")
player = player.replace('if(progress>=96)return "Ολοκληρωμένο";', 'if(progress>=WATCHED_THRESHOLD)return "✓ Προβλήθηκε";')
player = player.replace('  if(progress>0&&progress<5)return "Μόλις ξεκίνησες";\n', '')

# state additions
old = '  const [playhead,setPlayhead]=useState(0);\n  const [search,setSearch]=useState("");\n'
new = '  const [playhead,setPlayhead]=useState(0);\n  const [controlsVisible,setControlsVisible]=useState(true);\n  const [seekPreview,setSeekPreview]=useState<number|null>(null);\n  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);\n  const [search,setSearch]=useState("");\n'
player = replace_once(player, old, new, "player ui state")
old = '  const fsExitTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);\n'
new = '  const fsExitTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n  const controlsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);\n'
player = replace_once(player, old, new, "controls timer")

# metadata version refresh and concise fallback speaker roles
player = player.replace('metadataVersion!==4', 'metadataVersion!==5')
player = player.replace('metadataVersion:4', 'metadataVersion:5')
player = player.replace('role:"Ιατρός με ενασχόληση στη χρόνια κόπωση και στην οικολογική ιατρική"', 'role:"Physician"')
player = player.replace('role:"Καρδιοθωρακοχειρουργός και ειδικός στη μεταβολική υγεία"', 'role:"Cardiothoracic Surgeon"')
player = player.replace('role:"Ιατρός με εκπαίδευση στη νευρολογία και στην ανθρώπινη διατροφή"', 'role:"Physician"')
player = player.replace('Dr Sarah Myhill', 'Dr. Sarah Myhill')
player = player.replace('Dr Philip Ovadia', 'Dr. Philip Ovadia')
player = player.replace('Dr Natasha Campbell-McBride', 'Dr. Natasha Campbell-McBride')
# Stasha fallback for this known source video; role stays concise/manual-editable.
speaker_anchor = 'const SPEAKERS:Record<string,SpeakerProfile>={\n'
if 'BbGv7GTbRN8:{name:"Dr. Stasha Gominak"' not in player:
    player = replace_once(player, speaker_anchor, speaker_anchor + '  BbGv7GTbRN8:{name:"Dr. Stasha Gominak",role:"Neurologist",importance:"",currentWork:"",highlights:[]},\n', "Stasha fallback")

# paging reset and better continue-watching threshold
old = '  const continueVideos=state.videos.filter(v=>v.progress>0&&v.progress<96).sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||"")).slice(0,5);\n'
new = '  const visibleVideos=filtered.slice(0,visibleCount);\n  const continueVideos=state.videos.filter(v=>v.lastPosition>=CONTINUE_MIN_SECONDS&&v.progress>=CONTINUE_MIN_PROGRESS&&v.progress<WATCHED_THRESHOLD).sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||"")).slice(0,5);\n'
player = replace_once(player, old, new, "continue watching threshold")
player = player.replace('state.videos.filter(v=>v.progress>0&&v.progress<96&&v.lastWatched)', 'state.videos.filter(v=>v.lastPosition>=CONTINUE_MIN_SECONDS&&v.progress>=CONTINUE_MIN_PROGRESS&&v.progress<WATCHED_THRESHOLD&&v.lastWatched)')
player = player.replace('v=>v.progress>=96&&v.lastWatched', 'v=>v.progress>=WATCHED_THRESHOLD&&v.lastWatched')
player = player.replace('video=>video.id!==selected.id&&video.progress<96', 'video=>video.id!==selected.id&&video.progress<WATCHED_THRESHOLD')

# reset paging when query/filter changes
anchor = '  const featuredMoments=featured?state.moments.filter(m=>m.videoId===featured.id):[];\n\n'
insert = '''  const featuredMoments=featured?state.moments.filter(m=>m.videoId===featured.id):[];\n  useEffect(()=>setVisibleCount(PAGE_SIZE),[search,category,sort,filter]);\n\n'''
player = replace_once(player, anchor, insert, "paging reset")

# reveal / auto-hide player seek UI; pause keeps visible
anchor = '  function togglePlayback(){\n'
helpers = '''  function revealPlayerUi(){\n    setControlsVisible(true);\n    if(controlsTimer.current)clearTimeout(controlsTimer.current);\n    if(isPlaying)controlsTimer.current=setTimeout(()=>setControlsVisible(false),3600);\n  }\n  function updateSeekPreview(event:React.PointerEvent<HTMLInputElement>,duration:number){\n    if(duration<=0)return;\n    const rect=event.currentTarget.getBoundingClientRect();\n    const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));\n    setSeekPreview(ratio*duration);\n    revealPlayerUi();\n  }\n  function togglePlayback(){\n'''
player = replace_once(player, anchor, helpers, "player UI helpers")
# effect after fullscreen visibility effect
anchor = '  useEffect(()=>{\n    if(!mobileMenu&&!subtitleMenuOpen)return;\n'
insert = '''  useEffect(()=>{\n    if(controlsTimer.current)clearTimeout(controlsTimer.current);\n    if(!isPlaying){setControlsVisible(true);return;}\n    setControlsVisible(true);\n    controlsTimer.current=setTimeout(()=>setControlsVisible(false),3600);\n    return()=>{if(controlsTimer.current)clearTimeout(controlsTimer.current);};\n  },[isPlaying,selectedId]);\n  useEffect(()=>{\n    if(!mobileMenu&&!subtitleMenuOpen)return;\n'''
player = replace_once(player, anchor, insert, "auto hide player ui effect")

# replace seek bar with grouped seek UI + current/total + preview
old = '                <input className="player-seek-bar" type="range" min={0} max={Math.max(1,seekDuration)} step="0.1" value={Math.min(playhead,Math.max(1,seekDuration))} disabled={seekDuration<=0} aria-label="Μετακίνηση στο βίντεο" style={{"--seek-progress":`${seekDuration>0?Math.min(100,(playhead/seekDuration)*100):0}%`} as CSSProperties} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onChange={event=>{const nextTime=Number(event.currentTarget.value);setPlayhead(nextTime);currentPlayer()?.seekTo(nextTime,true);}}/>\n'
new = '''                <div className={`player-seek-ui ${controlsVisible||!isPlaying?"visible":"hidden"}`} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>\n                  <span className="player-time-label">{clock(Math.max(0,playhead))} / {clock(Math.max(0,seekDuration))}</span>\n                  {seekPreview!==null&&seekDuration>0&&<output className="seek-preview" style={{"--seek-preview-position":`${Math.min(100,Math.max(0,(seekPreview/seekDuration)*100))}%`} as CSSProperties}>{clock(seekPreview)}</output>}\n                  <input className="player-seek-bar" type="range" min={0} max={Math.max(1,seekDuration)} step="0.1" value={Math.min(playhead,Math.max(1,seekDuration))} disabled={seekDuration<=0} aria-label="Μετακίνηση στο βίντεο" style={{"--seek-progress":`${seekDuration>0?Math.min(100,(playhead/seekDuration)*100):0}%`} as CSSProperties} onPointerDown={event=>{event.stopPropagation();updateSeekPreview(event,seekDuration);}} onPointerMove={event=>updateSeekPreview(event,seekDuration)} onPointerUp={()=>{setSeekPreview(null);revealPlayerUi();}} onPointerCancel={()=>setSeekPreview(null)} onPointerLeave={()=>setSeekPreview(null)} onClick={event=>event.stopPropagation()} onChange={event=>{const nextTime=Number(event.currentTarget.value);setPlayhead(nextTime);currentPlayer()?.seekTo(nextTime,true);revealPlayerUi();}}/>\n                </div>\n'''
player = replace_once(player, old, new, "seek UI")
# parent frame reveals on interaction; subtitles remain independent
old = '              <div className={`video-frame ${isPseudoFullscreen?"pseudo-fullscreen":""}`} ref={fullscreenHost}>\n'
new = '              <div className={`video-frame ${isPseudoFullscreen?"pseudo-fullscreen":""} ${controlsVisible||!isPlaying?"player-ui-visible":"player-ui-hidden"}`} ref={fullscreenHost} onPointerMove={()=>revealPlayerUi()} onPointerDown={()=>revealPlayerUi()} onMouseLeave={()=>{if(isPlaying&&controlsTimer.current)controlsTimer.current=setTimeout(()=>setControlsVisible(false),900);}}>\n'
player = replace_once(player, old, new, "video frame player ui classes")
player = player.replace('onClick={()=>{togglePlayback();revealFsExit();}}/>', 'onClick={()=>{revealPlayerUi();togglePlayback();revealFsExit();}}/>', 1)

# Remove old featured status row / time remaining clutter; keep action progress inside CTA.
old = '          <div className="featured-details"><span>{watchProgressLabel(featured)}</span>{featured.duration>0&&featured.progress<96&&<span>{clock(Math.max(0,featured.duration-featured.lastPosition))} απομένουν</span>}<span>{featuredMoments.length} στιγμές</span></div>\n'
if old in player:
    player = player.replace(old, '', 1)
player = player.replace('featured.progress>0&&featured.progress<96', 'featured.progress>0&&featured.progress<WATCHED_THRESHOLD')

# load more
old = '      <section className={`video-grid ${state.settings.layout} ${state.settings.compact?"compact":""}`}>{filtered.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} edit={requestEdit} settings={state.settings} isNew={newVideoIds.has(v.id)}/>)}</section>\n      {filtered.length===0&&<div className="empty"><h2>Δεν βρέθηκαν βίντεο</h2><p>Δοκίμασε διαφορετική κατηγορία ή αναζήτηση.</p></div>}\n'
new = '''      {!hydrated?<section className="video-grid skeleton-grid" aria-label="Φόρτωση βιβλιοθήκης">{Array.from({length:6}).map((_,index)=><div className="video-card skeleton-card" key={index}><div className="thumb"/><div className="card-info"><i/><i/><i/></div></div>)}</section>:<section className={`video-grid ${state.settings.layout} ${state.settings.compact?"compact":""}`}>{visibleVideos.map(v=><VideoCard key={v.id} video={v} open={openVideo} patch={patchVideo} edit={requestEdit} settings={state.settings} isNew={newVideoIds.has(v.id)}/>)}</section>}\n      {hydrated&&visibleVideos.length<filtered.length&&<div className="load-more-wrap"><button className="load-more-button" type="button" onClick={()=>setVisibleCount(count=>count+PAGE_SIZE)}><span>Δείτε περισσότερα</span><small>{filtered.length-visibleVideos.length} ακόμη βίντεο</small></button></div>}\n      {hydrated&&filtered.length===0&&<div className="empty polished-empty"><b>⌕</b><h2>Δεν βρέθηκαν βίντεο</h2><p>Δοκίμασε διαφορετική κατηγορία, ομιλητή ή λέξη αναζήτησης.</p></div>}\n'''
player = replace_once(player, old, new, "load more and skeleton")

# search should include role too
player = player.replace('    video.speakerName||"",\n    video.tags.join(" "),', '    video.speakerName||"",\n    video.speakerRole||"",\n    video.tags.join(" "),')
player = player.replace('const speakerText=searchText(`${video.channel} ${video.speakerName||""}`);', 'const speakerText=searchText(`${video.channel} ${video.speakerName||""} ${video.speakerRole||""}`);')

# card watched state and data-category
old = '<span className="duration">{video.duration?clock(video.duration):"EL subs"}</span><button aria-label="Επεξεργασία βίντεο" className="card-edit"'
new = '<span className="duration">{video.duration?clock(video.duration):"EL subs"}</span>{progress>=WATCHED_THRESHOLD&&<span className="watched-badge">✓ Προβλήθηκε</span>}<button aria-label="Επεξεργασία βίντεο" className="card-edit"'
player = replace_once(player, old, new, "watched badge")
player = player.replace('<span className="card-category">{CATEGORY_LABELS[video.category]}</span>', '<span className="card-category" data-category={video.category}>{CATEGORY_LABELS[video.category]}</span>')

# version label
player = player.replace('<small className="brand-version">ver 6.6.15</small>', '<small className="brand-version">ver 7.0</small>')
player_path.write_text(player)

# ---------------- metadata route ----------------
route_path = Path("app/api/metadata/route.ts")
route = route_path.read_text()
# Normalize Dr. formatting.
route = route.replace('return `Dr ${doctor[1].replace(/[|:,\\-–—]+$/g, "").trim()}`;', 'return `Dr. ${doctor[1].replace(/[|:,\\-–—]+$/g, "").trim()}`;')
# targeted known speaker name for the user-verified video; no broad automatic biography invention.
if 'const KNOWN_SPEAKER_NAMES' not in route:
    anchor = 'function speakerNameFromMetadata(title: string, description: string) {\n'
    known = '''const KNOWN_SPEAKER_NAMES: Record<string, string> = {\n  BbGv7GTbRN8: "Dr. Stasha Gominak",\n};\n\n'''
    route = replace_once(route, anchor, known + anchor, "known speaker names")
    old = '    const speakerName = speakerNameFromMetadata(originalTitle, details.description);\n'
    new = '    const speakerName = KNOWN_SPEAKER_NAMES[id] || speakerNameFromMetadata(originalTitle, details.description);\n'
    route = replace_once(route, old, new, "known speaker use")
route_path.write_text(route)

# ---------------- CSS polish / v7 design ----------------
css_path = Path("app/content-areas-final.css")
css = css_path.read_text()
# exact requested title size desktop; controlled mobile size
css = css.replace('font-family:inherit!important;font-size:clamp(24px,3vw,34px)!important;', 'font-family:inherit!important;font-size:24px!important;')
if '/* ===== GreekTube Subs v7 final UX layer ===== */' not in css:
    css += r'''

/* ===== GreekTube Subs v7 final UX layer ===== */
html body .app-shell.app-shell.app-shell .video-frame{position:relative!important}
html body .app-shell.app-shell.app-shell .video-frame:after{
  content:"";position:absolute;left:0;right:0;bottom:0;height:88px;z-index:5;pointer-events:none;
  background:linear-gradient(to top,rgba(0,0,0,.46),rgba(0,0,0,0));
  opacity:0;transition:opacity .24s ease;
}
html body .app-shell.app-shell.app-shell .video-frame.player-ui-visible:after{opacity:1}
html body .app-shell.app-shell.app-shell .player-seek-ui{
  position:absolute!important;left:0!important;right:0!important;bottom:0!important;z-index:8!important;
  height:38px!important;display:flex!important;align-items:flex-end!important;padding:0 12px 7px!important;
  transition:opacity .22s ease,transform .22s ease!important;
}
html body .app-shell.app-shell.app-shell .player-seek-ui.hidden{opacity:0!important;transform:translateY(5px)!important;pointer-events:none!important}
html body .app-shell.app-shell.app-shell .player-seek-ui.visible{opacity:1!important;transform:none!important}
html body .app-shell.app-shell.app-shell .player-time-label{
  position:absolute!important;left:14px!important;bottom:17px!important;color:#fff!important;
  font-size:11px!important;font-weight:650!important;line-height:1!important;font-variant-numeric:tabular-nums!important;
  text-shadow:0 1px 5px rgba(0,0,0,.85)!important;pointer-events:none!important;
}
html body .app-shell.app-shell.app-shell .player-seek-ui .player-seek-bar{position:relative!important;left:auto!important;right:auto!important;bottom:auto!important;width:100%!important;z-index:2!important}
html body .app-shell.app-shell.app-shell .seek-preview{
  position:absolute!important;left:var(--seek-preview-position)!important;bottom:25px!important;z-index:10!important;
  transform:translateX(-50%)!important;min-width:44px!important;padding:5px 7px!important;border-radius:7px!important;
  background:rgba(8,9,13,.92)!important;border:1px solid rgba(255,255,255,.15)!important;color:#fff!important;
  font-size:10.5px!important;font-weight:700!important;font-variant-numeric:tabular-nums!important;box-shadow:0 6px 18px rgba(0,0,0,.35)!important;
}
@media(max-width:620px){
  html body .app-shell.app-shell.app-shell .player-seek-ui{height:42px!important;padding:0 10px 7px!important}
  html body .app-shell.app-shell.app-shell .player-time-label{left:11px!important;bottom:18px!important;font-size:10.5px!important}
  html body .app-shell.app-shell.app-shell .seek-preview{bottom:27px!important;min-width:50px!important;padding:6px 8px!important;font-size:11.5px!important}
  html body .app-shell.app-shell.app-shell .video-heading .player-greek-title{font-size:22px!important;line-height:1.2!important}
}

/* Watched state + category system */
html body .app-shell.app-shell.app-shell .watched-badge{
  position:absolute!important;left:8px!important;bottom:8px!important;z-index:3!important;
  padding:4px 7px!important;border-radius:7px!important;background:rgba(5,8,7,.82)!important;
  border:1px solid rgba(143,191,134,.34)!important;color:#b9dfaF!important;font-size:9.5px!important;font-weight:700!important;
  backdrop-filter:blur(8px)!important;
}
html body .app-shell.app-shell.app-shell .card-category[data-category="Medical"]{background:rgba(227,162,60,.18)!important;color:#efbd6d!important;border-color:rgba(227,162,60,.34)!important}
html body .app-shell.app-shell.app-shell .card-category[data-category="Tech"]{background:rgba(80,159,225,.18)!important;color:#83bee9!important;border-color:rgba(80,159,225,.34)!important}
html body .app-shell.app-shell.app-shell .card-category[data-category="Podcasts"]{background:rgba(143,127,240,.18)!important;color:#b9afff!important;border-color:rgba(143,127,240,.34)!important}
html body .app-shell.app-shell.app-shell .card-category[data-category="Education"]{background:rgba(93,174,117,.18)!important;color:#8fd2a2!important;border-color:rgba(93,174,117,.34)!important}
html body .app-shell.app-shell.app-shell .card-category[data-category="Documentaries"]{background:rgba(63,174,164,.18)!important;color:#7bd0c8!important;border-color:rgba(63,174,164,.34)!important}
html body .app-shell.app-shell.app-shell .card-category[data-category="Comedy"]{background:rgba(231,117,105,.18)!important;color:#ef9b91!important;border-color:rgba(231,117,105,.34)!important}
html body .app-shell.app-shell.app-shell .card-category[data-category="Other"]{background:rgba(150,157,169,.16)!important;color:#b8bdc7!important;border-color:rgba(150,157,169,.28)!important}

/* Load more, skeletons and empty states */
html body .app-shell.app-shell.app-shell .load-more-wrap{display:flex!important;justify-content:center!important;padding:26px 0 6px!important}
html body .app-shell.app-shell.app-shell .load-more-button{
  min-width:210px!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:3px!important;
  padding:11px 22px!important;border:1px solid rgba(124,116,224,.34)!important;border-radius:13px!important;
  background:linear-gradient(180deg,rgba(124,116,224,.11),rgba(124,116,224,.06))!important;color:#dedafd!important;
  box-shadow:0 10px 28px rgba(0,0,0,.16)!important;transition:transform .18s ease,border-color .18s ease,background .18s ease!important;
}
html body .app-shell.app-shell.app-shell .load-more-button:hover{transform:translateY(-1px)!important;border-color:rgba(143,134,232,.62)!important;background:rgba(124,116,224,.15)!important}
html body .app-shell.app-shell.app-shell .load-more-button span{font-size:12.5px!important;font-weight:700!important}
html body .app-shell.app-shell.app-shell .load-more-button small{font-size:10px!important;color:#9296a1!important}
html body .app-shell.app-shell.app-shell .skeleton-card{pointer-events:none!important;overflow:hidden!important}
html body .app-shell.app-shell.app-shell .skeleton-card .thumb,
html body .app-shell.app-shell.app-shell .skeleton-card .card-info i{background:linear-gradient(90deg,#1a1e25 25%,#242a33 50%,#1a1e25 75%)!important;background-size:200% 100%!important;animation:v7-shimmer 1.25s linear infinite!important}
html body .app-shell.app-shell.app-shell .skeleton-card .card-info i{display:block!important;height:10px!important;border-radius:5px!important;margin:8px 0!important}
html body .app-shell.app-shell.app-shell .skeleton-card .card-info i:nth-child(2){width:84%!important}
html body .app-shell.app-shell.app-shell .skeleton-card .card-info i:nth-child(3){width:58%!important}
@keyframes v7-shimmer{to{background-position:-200% 0}}
html body .app-shell.app-shell.app-shell .polished-empty{max-width:520px!important;margin:30px auto!important;padding:34px 24px!important;border:1px dashed rgba(255,255,255,.14)!important;border-radius:18px!important;background:rgba(255,255,255,.025)!important;text-align:center!important}
html body .app-shell.app-shell.app-shell .polished-empty>b{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;margin:0 auto 12px!important;border-radius:13px!important;background:rgba(124,116,224,.12)!important;color:#bcb5ff!important;font-size:22px!important}

/* Mobile filter access for larger libraries */
@media(max-width:620px){
  html body .app-shell.app-shell.app-shell .clean-library-tools{
    position:sticky!important;top:58px!important;z-index:18!important;margin-inline:-10px!important;padding:9px 10px!important;
    background:rgba(12,14,18,.92)!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:14px!important;
    backdrop-filter:blur(16px) saturate(1.2)!important;box-shadow:0 10px 28px rgba(0,0,0,.22)!important;
  }
}

/* Refined transitions */
html body .app-shell.app-shell.app-shell .video-card,
html body .app-shell.app-shell.app-shell button,
html body .app-shell.app-shell.app-shell .card-category{transition:transform .18s ease,border-color .18s ease,background-color .18s ease,color .18s ease,box-shadow .18s ease!important}
html body .app-shell.app-shell.app-shell .video-card .thumb img{transition:transform .32s ease,filter .32s ease!important}
html body .app-shell.app-shell.app-shell .video-card:hover .thumb img{transform:scale(1.018)!important}

/* Premium light theme. Media canvas stays dark; application chrome becomes warm/light. */
html[data-theme="light"] body{background:#f3f3f0!important;color:#17191d!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell{color:#17191d!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .app-header{background:rgba(247,247,244,.9)!important;border-color:rgba(24,28,34,.09)!important;box-shadow:0 8px 30px rgba(26,30,36,.05)!important;backdrop-filter:blur(18px)!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .brand,
html[data-theme="light"] body .app-shell.app-shell.app-shell .desktop-nav button,
html[data-theme="light"] body .app-shell.app-shell.app-shell .back-library,
html[data-theme="light"] body .app-shell.app-shell.app-shell .back-to-video{color:#272a30!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .home-intro h1{background:none!important;color:#202329!important;-webkit-text-fill-color:#202329!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .home-intro span{color:#655dc1!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .featured,
html[data-theme="light"] body .app-shell.app-shell.app-shell .video-card,
html[data-theme="light"] body .app-shell.app-shell.app-shell .continue-section,
html[data-theme="light"] body .app-shell.app-shell.app-shell .settings-grid>section,
html[data-theme="light"] body .app-shell.app-shell.app-shell .modal{background:#fbfbf9!important;border-color:#dfe1e4!important;box-shadow:0 20px 60px rgba(27,31,38,.13)!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .featured-panel,
html[data-theme="light"] body .app-shell.app-shell.app-shell .card-info{background:#fbfbf9!important;color:#1f2228!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .featured-panel h2,
html[data-theme="light"] body .app-shell.app-shell.app-shell .card-info>strong,
html[data-theme="light"] body .app-shell.app-shell.app-shell .section-title h2,
html[data-theme="light"] body .app-shell.app-shell.app-shell .settings-page h1,
html[data-theme="light"] body .app-shell.app-shell.app-shell .settings-grid h2,
html[data-theme="light"] body .app-shell.app-shell.app-shell .modal h2{color:#202329!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .card-info p,
html[data-theme="light"] body .app-shell.app-shell.app-shell .card-info span,
html[data-theme="light"] body .app-shell.app-shell.app-shell .featured-original-title,
html[data-theme="light"] body .app-shell.app-shell.app-shell .featured-speaker,
html[data-theme="light"] body .app-shell.app-shell.app-shell .muted{color:#6f747d!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .search,
html[data-theme="light"] body .app-shell.app-shell.app-shell .clean-library-tools select,
html[data-theme="light"] body .app-shell.app-shell.app-shell .quick-filters button,
html[data-theme="light"] body .app-shell.app-shell.app-shell .category-row button,
html[data-theme="light"] body .app-shell.app-shell.app-shell .form input,
html[data-theme="light"] body .app-shell.app-shell.app-shell .form textarea,
html[data-theme="light"] body .app-shell.app-shell.app-shell .form select,
html[data-theme="light"] body .app-shell.app-shell.app-shell .settings-page input,
html[data-theme="light"] body .app-shell.app-shell.app-shell .settings-page select{background:#fff!important;border-color:#d9dce1!important;color:#272a30!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .search input{color:#25282e!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .quick-filters button:hover,
html[data-theme="light"] body .app-shell.app-shell.app-shell .category-row button:hover{background:#efeff5!important;border-color:#c8c6e7!important;color:#3c375e!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .quick-filters button.active,
html[data-theme="light"] body .app-shell.app-shell.app-shell .category-row button.active{background:#e9e7fb!important;border-color:#b9b4ea!important;color:#51499d!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .video-heading .player-greek-title{color:#202329!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker{color:#777c84!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker strong{color:#272a30!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .video-source-row{border-color:#dedfe3!important;color:#6e727a!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .video-source-row>a,
html[data-theme="light"] body .app-shell.app-shell.app-shell .video-source-row>strong{color:#4d5060!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .moment,
html[data-theme="light"] body .app-shell.app-shell.app-shell .guide-list button{background:#fff!important;border-color:#dfe2e5!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .moment strong,
html[data-theme="light"] body .app-shell.app-shell.app-shell .guide-list span{color:#31343a!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .transcript-drawer{background:#f7f7f4!important;border-color:#dfe2e6!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .transcript>button:hover{background:#eeeef2!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .transcript span{color:#34373e!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .transcript time{background:#eceaf9!important;color:#5e56b2!important;border-color:#d8d4f2!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .app-footer{border-color:#dfe1e4!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .app-footer-brand{color:#26292f!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .app-footer>p{color:#737780!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .polished-empty{background:#fafaf8!important;border-color:#d7d9de!important}
html[data-theme="light"] body .app-shell.app-shell.app-shell .clean-library-tools{background:rgba(247,247,244,.94)!important;border-color:#dde0e3!important;box-shadow:0 10px 26px rgba(25,30,36,.08)!important}
'''
css_path.write_text(css)

# ---------------- package/version metadata ----------------
package_path = Path("package.json")
package = package_path.read_text().replace('"version": "6.6.15"', '"version": "7.0.0"')
package_path.write_text(package)
layout_path = Path("app/layout.tsx")
layout = layout_path.read_text().replace('"app-version": "6.6.15"', '"app-version": "7.0.0"')
layout = layout.replace('"codex-preview": "development"', '"codex-preview": "final-v7"')
layout_path.write_text(layout)

print("Final v7 patch applied")

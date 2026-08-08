from pathlib import Path
import re

p = Path('app/GreekTubePlayer.tsx')
text = p.read_text()
start_marker = '              <div className="player-actions player-tools">'
end_marker = '              </div>\n            </div>\n            <div className="video-heading">'
start = text.index(start_marker)
end = text.index(end_marker, start)
replacement = '''              <div className="player-actions player-tools">
                <small className="player-tools-label">ΧΕΙΡΙΣΤΗΡΙΑ</small>
                <div className="controls-position-row">
                  <span className="position-time"><b>{clock(playhead)}</b> / {clock(seekDuration)}</span>
                  <span className="speed-chip">{state.settings.speed.toFixed(2).replace(/0$/,"")}×</span>
                </div>
                <div className="controls-top-row">
                  <div className="player-toolbar">
                    <section className="control-section primary-control-section">
                      <div className="primary-control-row">
                        <div className="playback-controls" role="group" aria-label="Έλεγχος αναπαραγωγής">
                          <button className="skip-button" aria-label="Πίσω 10 δευτερόλεπτα" onClick={()=>skip(-10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M11 5L4 12l7 7M4 12h9a5 5 0 000-10"/></svg><small>10s</small></button>
                          <button className="play-toggle" aria-label={isPlaying?"Παύση":"Αναπαραγωγή"} onClick={togglePlayback}>{isPlaying?"Ⅱ":"▶"}</button>
                          <button className="skip-button" aria-label="Μπροστά 10 δευτερόλεπτα" onClick={()=>skip(10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M13 5l7 7-7 7M20 12h-9a5 5 0 010-10"/></svg><small>10s</small></button>
                        </div>
                      </div>
                    </section>
                  </div>
                  <button className="fullscreen-toggle fullscreen-primary" aria-label="Πλήρης οθόνη" onClick={()=>void toggleFullscreen()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m11 0h3a2 2 0 002-2v-3"/></svg><span>Πλήρης οθόνη</span></button>
                </div>
                <section className="control-section action-section">
                  <div className="player-secondary-actions">
                    <button className="moment-save" onClick={()=>beginMoment()}>{moments.length>0&&<span className="moment-count">{moments.length}</span>}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Αποθήκευση στιγμής</span></button>
                    <button className={`transcript-toggle ${transcriptOpen?"active":""}`} aria-pressed={transcriptOpen} onClick={()=>setTranscriptOpen(value=>!value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg><span>{transcriptOpen?"Κλείσιμο κειμένου":"Κείμενο μεταγραφής"}</span></button>
                    <div className={`subtitle-cc-control ${state.settings.subtitles?"active":""}`}>
                      <button className={`cc-toggle ${state.settings.subtitles?"active":""}`} aria-label="Επιλογές υποτίτλων" aria-expanded={subtitleMenuOpen} onClick={()=>setSubtitleMenuOpen(open=>!open)}><span className="cc-active-tag">{state.settings.subtitles?"ON":"OFF"}</span><svg className="cc-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h2M13 10h4M7 14h6"/></svg><span className="cc-label">Υπότιτλοι</span><small>{state.settings.subtitles?"Ενεργοί":"Κλειστοί"} ▾</small></button>
                      {subtitleMenuOpen&&<div className="subtitle-cc-menu" role="menu" aria-label="Επιλογές υποτίτλων"><button className={!state.settings.subtitles?"active":""} role="menuitemradio" aria-checked={!state.settings.subtitles} onClick={()=>{setState(current=>({...current,settings:{...current.settings,subtitles:false}}));setSubtitleMenuOpen(false);}}><span>Χωρίς υπότιτλους</span>{!state.settings.subtitles&&<i>✓</i>}</button>{[{size:16,label:"Μικροί"},{size:19,label:"Μεσαίοι"},{size:22,label:"Μεγάλοι"}].map(option=><button key={option.size} className={state.settings.subtitles&&state.settings.subtitleSize===option.size?"active":""} role="menuitemradio" aria-checked={state.settings.subtitles&&state.settings.subtitleSize===option.size} onClick={()=>{setState(current=>({...current,settings:{...current.settings,subtitles:true,subtitleSize:option.size,subtitleSizeVersion:2}}));setSubtitleMenuOpen(false);}}><span>{option.label}</span>{state.settings.subtitles&&state.settings.subtitleSize===option.size&&<i>✓</i>}</button>)}</div>}
                    </div>
                  </div>
                </section>
'''
text = text[:start] + replacement + text[end:]
p.write_text(text)

css = '''/* GreekTube 6.5.0 DEV — Claude-inspired mobile controls. */
html body .brand-version{font-size:0!important}
html body .brand-version::after{display:none!important;content:none!important}
html body .brand-version::before{content:"ver 6.5.0 DEV"!important;font-size:9px!important;line-height:1!important}
.settings-page-header{position:relative}
.settings-close{position:absolute;top:0;right:0;width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--muted);font-size:20px;line-height:1}
.settings-close:hover{color:var(--text);background:var(--raised)}
.player-seek-bar{--seek-progress:0%;position:absolute;left:0;right:0;bottom:0;z-index:12;width:100%;height:20px;margin:0;padding:0;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer;touch-action:none}
.player-seek-bar::-webkit-slider-runnable-track{height:3px;border-radius:99px;background:linear-gradient(90deg,#7c74e0 0 var(--seek-progress),rgba(255,255,255,.22) var(--seek-progress) 100%)}
.player-seek-bar::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-5px;border:2px solid #7c74e0;border-radius:50%;background:#12151a;box-shadow:0 0 0 2px rgba(0,0,0,.25)}
.player-seek-bar::-moz-range-track{height:3px;border:0;border-radius:99px;background:rgba(255,255,255,.22)}
.player-seek-bar::-moz-range-progress{height:3px;border-radius:99px;background:#7c74e0}
.player-seek-bar::-moz-range-thumb{width:11px;height:11px;border:2px solid #7c74e0;border-radius:50%;background:#12151a}
.player-seek-bar:disabled{pointer-events:none;opacity:.35}
@media(max-width:620px){
html body .viewer .brand-version{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:19px!important;margin-left:6px!important;padding:0 6px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:6px!important;background:#171a20!important;color:#aeb4c0!important;font-weight:700!important;letter-spacing:.02em!important;white-space:nowrap!important}
html body .viewer .video-frame .subtitles.bottom{bottom:4.5%!important}
html body .settings-page{padding-top:28px!important} html body .settings-page-header{padding-right:46px!important}
html body .player-seek-bar{height:24px} html body .player-seek-bar::-webkit-slider-thumb{width:15px;height:15px;margin-top:-6px} html body .player-seek-bar::-moz-range-thumb{width:13px;height:13px}
html body .viewer .player-actions.player-tools{height:auto!important;min-height:0!important;display:block!important;margin:0!important;padding:18px 16px 20px!important;border-top:1px solid #2b313b!important;background:#12151a!important;overflow:visible!important}
html body .viewer .player-tools-label{display:flex!important;align-items:center!important;gap:8px!important;margin:0 0 14px!important;color:#8b9099!important;font-size:12px!important;font-weight:700!important;line-height:1!important;letter-spacing:1.4px!important;text-transform:uppercase!important}
html body .viewer .player-tools-label::before{content:"";width:3px;height:15px;border-radius:2px;background:#7c74e0}
html body .viewer .controls-position-row{display:flex!important;align-items:center!important;justify-content:space-between!important;margin:-4px 0 14px!important}
html body .viewer .position-time{font-family:var(--font-geist-mono),monospace!important;font-size:12.5px!important;color:#8b9099!important} html body .viewer .position-time b{color:#f6f3ec!important;font-weight:500!important}
html body .viewer .speed-chip{font-family:var(--font-geist-mono),monospace!important;font-size:11.5px!important;color:#7c74e0!important;background:#1b1930!important;border:1px solid rgba(124,116,224,.35)!important;padding:3px 9px!important;border-radius:7px!important}
html body .viewer .controls-top-row{display:grid!important;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)!important;gap:10px!important;margin:0 0 10px!important}
html body .viewer .player-toolbar,html body .viewer .primary-control-section,html body .viewer .primary-control-row{width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
html body .viewer .primary-control-row{display:block!important}
html body .viewer .playback-controls{width:100%!important;height:100%!important;min-height:86px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:20px!important;margin:0!important;padding:16px 10px!important;border:1px solid #2b313b!important;border-radius:16px!important;background:#1b1f26!important;box-shadow:none!important}
html body .viewer .playback-controls button{border:0!important;background:transparent!important;box-shadow:none!important}
html body .viewer .skip-button{width:38px!important;min-width:38px!important;height:54px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;padding:0!important;color:#8b9099!important}
html body .viewer .skip-button svg{width:19px!important;height:19px!important;display:block!important} html body .viewer .skip-button small{display:block!important;font-family:var(--font-geist-mono),monospace!important;font-size:11px!important;line-height:1!important;color:#8b9099!important}
html body .viewer .play-toggle{width:52px!important;min-width:52px!important;height:52px!important;min-height:52px!important;display:grid!important;place-items:center!important;padding:0!important;border-radius:50%!important;background:#7c74e0!important;color:white!important;font-size:16px!important;box-shadow:0 8px 22px rgba(124,116,224,.25)!important}
html body .viewer .fullscreen-primary{width:100%!important;min-width:0!important;min-height:86px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;margin:0!important;padding:16px 8px!important;border:1px solid #2b313b!important;border-radius:16px!important;background:#1b1f26!important;color:#f6f3ec!important;box-shadow:none!important}
html body .viewer .fullscreen-primary svg{width:20px!important;height:20px!important;opacity:.92} html body .viewer .fullscreen-primary span{font-size:12.5px!important;line-height:1.3!important;color:#f6f3ec!important;text-align:center!important}
html body .viewer .action-section{width:100%!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
html body .viewer .player-secondary-actions{width:100%!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
html body .viewer .player-secondary-actions>.moment-save,html body .viewer .player-secondary-actions>.transcript-toggle,html body .viewer .player-secondary-actions>.subtitle-cc-control{position:relative!important;width:100%!important;min-width:0!important;min-height:94px!important;margin:0!important}
html body .viewer .player-secondary-actions>.moment-save,html body .viewer .player-secondary-actions>.transcript-toggle,html body .viewer .subtitle-cc-control>.cc-toggle{width:100%!important;height:100%!important;min-height:94px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;margin:0!important;padding:12px 7px!important;border:1px solid #2b313b!important;border-radius:16px!important;background:#1b1f26!important;color:#f6f3ec!important;box-shadow:none!important;text-align:center!important;overflow:hidden!important}
html body .viewer .player-secondary-actions button>svg,html body .viewer .cc-card-icon{width:20px!important;height:20px!important;flex:0 0 20px!important;display:block!important}
html body .viewer .player-secondary-actions button>span:not(.moment-count):not(.cc-active-tag){font-size:12px!important;font-weight:500!important;line-height:1.25!important;color:#f6f3ec!important;text-align:center!important;white-space:normal!important}
html body .viewer .player-secondary-actions>.moment-save{background:#1b1930!important;border-color:rgba(124,116,224,.42)!important;color:#c9c4f5!important}
html body .viewer .player-secondary-actions>.moment-save>span:not(.moment-count){color:#c9c4f5!important}
html body .viewer .moment-count{position:absolute!important;top:8px!important;right:8px!important;width:17px!important;height:17px!important;display:grid!important;place-items:center!important;border-radius:50%!important;background:#7c74e0!important;color:white!important;font-family:var(--font-geist-mono),monospace!important;font-size:9px!important;font-weight:700!important;line-height:1!important}
html body .viewer .transcript-toggle.active{background:#1b1930!important;border-color:rgba(124,116,224,.35)!important;color:#c9c4f5!important}
html body .viewer .subtitle-cc-control{position:relative!important} html body .viewer .subtitle-cc-control.active>.cc-toggle{background:#1b1930!important;border-color:rgba(124,116,224,.4)!important;color:#c9c4f5!important}
html body .viewer .cc-active-tag{position:absolute!important;top:9px!important;left:50%!important;transform:translateX(-50%)!important;color:#7c74e0!important;font-size:9.5px!important;font-weight:700!important;letter-spacing:.3px!important;line-height:1!important}
html body .viewer .cc-card-icon{margin-top:8px!important;color:#c9c4f5!important} html body .viewer .cc-label{color:#c9c4f5!important} html body .viewer .cc-toggle>small{font-size:9.5px!important;font-weight:650!important;line-height:1!important;color:#7fa37a!important;white-space:nowrap!important}
html body .viewer .subtitle-cc-menu{right:0!important;left:auto!important;bottom:calc(100% + 8px)!important;width:min(220px,78vw)!important;z-index:30!important}
}
@media(max-width:360px){html body .viewer .player-actions.player-tools{padding-left:12px!important;padding-right:12px!important} html body .viewer .controls-top-row,html body .viewer .player-secondary-actions{gap:7px!important} html body .viewer .playback-controls{gap:13px!important;padding-left:6px!important;padding-right:6px!important} html body .viewer .player-secondary-actions button>span:not(.moment-count):not(.cc-active-tag){font-size:10.8px!important} html body .viewer .fullscreen-primary span{font-size:11px!important}}
'''
Path('app/mobile-controls-fix.css').write_text(css)

layout = Path('app/layout.tsx')
ltext = layout.read_text()
ltext = re.sub(r'"app-version":\s*"[^"]+"', '"app-version": "6.5.0 DEV"', ltext)
ltext = re.sub(r'/favicon\.svg\?v=[^" ]+', '/favicon.svg?v=650dev', ltext)
layout.write_text(ltext)

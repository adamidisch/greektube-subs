from pathlib import Path

p=Path('app/GreekTubePlayer.tsx')
s=p.read_text()

def rep(old,new,label,count=1):
    global s
    found=s.count(old)
    if found < count:
        raise SystemExit(f'missing {label}: found {found}, need {count}')
    s=s.replace(old,new,count)

rep('async function openVideo(video:Video,start?:number,showTranscript=false,forceTranslation=false){','async function openVideo(video:Video,start?:number,showTranscript=false,forceTranslation=false,readyCaptions?:Captions){','openVideo-signature')
needle='''    history.replaceState(null,"",`/?video=${video.id}${start?`&t=${Math.floor(start)}`:""}`);\n    // The shared transcript is authoritative. Browser storage is only an offline fallback.'''
insert='''    history.replaceState(null,"",`/?video=${video.id}${start?`&t=${Math.floor(start)}`:""}`);\n    if(readyCaptions){\n      localStorage.setItem(`greektube-transcript:${video.id}:v12`,JSON.stringify(readyCaptions));\n      setProgress(100);setCaptions(readyCaptions);setLoading(false);\n      patchVideo(video.id,{title:isGreekTitle(video.title)?video.title:readyCaptions.title,originalTitle:video.originalTitle||readyCaptions.originalTitle||englishTitle(video),channel:video.channel||readyCaptions.channel,captions:readyCaptions.cues,speakerName:video.speakerName||readyCaptions.speaker?.name,speakerRole:video.speakerRole||readyCaptions.speaker?.role,lastWatched:new Date().toISOString()});\n      window.setTimeout(()=>initPlayer(video.id,start??video.lastPosition),80);\n      return;\n    }\n    // The shared transcript is authoritative. Browser storage is only an offline fallback.'''
rep(needle,insert,'ready-captions-block')
rep('await openVideo(video);}}/>}','await openVideo(video,undefined,false,false,result);}}/>}','manual-done-call',2)

icons='''function AutoTranslateIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/></svg>;}\nfunction ManualTranslateIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h16M4 20v-3.5L15 5.5a1.5 1.5 0 0 1 2.1 0l1.4 1.4a1.5 1.5 0 0 1 0 2.1L7.5 20H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/><path d="M13 7.5 16.5 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;}\n\n'''
rep('function ManualTranslateModal(',icons+'function ManualTranslateModal(','icon-functions')
rep('<span className="mode-icon" aria-hidden="true">↻</span>','<span className="mode-icon"><AutoTranslateIcon/></span>','choice-auto-icon')
rep('<span className="mode-icon" aria-hidden="true">✦</span>','<span className="mode-icon"><ManualTranslateIcon/></span>','choice-manual-icon')
rep('<span className="mode-icon" aria-hidden="true">↻</span>','<span className="mode-icon"><AutoTranslateIcon/></span>','add-auto-icon') if '<span className="mode-icon" aria-hidden="true">↻</span>' in s else None
rep('<span className="mode-icon" aria-hidden="true">✦</span>','<span className="mode-icon"><ManualTranslateIcon/></span>','add-manual-icon') if '<span className="mode-icon" aria-hidden="true">✦</span>' in s else None

p.write_text(s)

css=Path('app/v7-4-0.css')
cs=css.read_text()
marker='/* v7.4.1 reviewed Claude polish */'
if marker not in cs:
    cs += '''\n\n/* v7.4.1 reviewed Claude polish */\n.translation-choice-card .mode-icon,.translation-mode-card .mode-icon{width:38px;height:38px;border-radius:12px;background:linear-gradient(150deg,rgba(142,124,255,.22),rgba(142,124,255,.08));box-shadow:inset 0 0 0 1px rgba(142,124,255,.16)}\n.mode-icon svg{width:18px;height:18px;color:#c7beff;stroke-width:1.7}\n.translation-choice-card.manual .mode-icon,.translation-mode-card.manual .mode-icon{background:linear-gradient(150deg,rgba(72,187,120,.22),rgba(72,187,120,.08));box-shadow:inset 0 0 0 1px rgba(94,201,140,.2)}\n.translation-choice-card.manual .mode-icon svg,.translation-mode-card.manual .mode-icon svg{color:#a9e9c2}\n.translation-choice-card{border-radius:18px;transition:border-color .2s ease,background .2s ease,transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease}\n.translation-choice-card:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.28)}\n.translation-choice-card h3{font-weight:660;letter-spacing:-.01em}\n.translation-choice-card>button,.translation-choice-pro-actions>button,.manual-step>button{transition:transform .12s ease}\n.translation-choice-card>button:active,.translation-choice-pro-actions>button:active,.manual-step>button:active{transform:scale(.97)}\n.manual-steps{display:none}\n.manual-translate{max-width:640px}\n.manual-step{border-radius:16px;padding:16px 17px;background:rgba(255,255,255,.022);border:1px solid rgba(255,255,255,.075);box-shadow:0 1px 0 rgba(255,255,255,.02) inset}\n.manual-step-index{width:34px;height:34px;border-radius:11px;background:linear-gradient(150deg,rgba(142,124,255,.22),rgba(142,124,255,.08));box-shadow:inset 0 0 0 1px rgba(142,124,255,.16);font-size:11px}\n.manual-step-body strong{font-size:13px;font-weight:640;letter-spacing:-.005em}\n.manual-step-body p{font-size:11.5px;line-height:1.55}\n@media(max-width:700px){.manual-step{grid-template-columns:1fr}.manual-step>button{width:100%}}\n'''
css.write_text(cs)

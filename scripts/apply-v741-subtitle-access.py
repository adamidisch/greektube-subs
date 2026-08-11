from pathlib import Path

p=Path('app/GreekTubePlayer.tsx')
s=p.read_text()

def replace_once(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing target: {label}')
    s=s.replace(old,new,1)

replace_once(
'''    if(translationMode==="manual-pro"&&!forceTranslation){\n      setLoading(false);setProgress(0);setCaptions(null);setProImportVideo(video);return;\n    }\n    setLoading(false); setProgress(3); setCaptions(null);''',
'''    if(!forceTranslation){\n      // Opening a video with no ready Greek transcript must never silently start translation.\n      // Give the user an explicit choice between automatic translation and the ChatGPT SRT workflow.\n      setLoading(false);setProgress(0);setCaptions(null);setTranslationChoiceVideo(video);return;\n    }\n    setLoading(false); setProgress(3); setCaptions(null);''',
'no-auto-translation-on-open')

replace_once(
'''<div className="heading-actions"><button type="button" className="edit-video" onClick={()=>void requestEdit(selected)}><span aria-hidden="true">✦</span> Επεξεργασία</button><button aria-label="Αγαπημένο" className={`favorite ${selected.favorite?"active":""}`} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♥</button></div>''',
'''<div className="heading-actions"><button type="button" className="edit-video subtitle-manage" onClick={()=>setTranslationChoiceVideo(selected)}><span aria-hidden="true">CC</span> Υπότιτλοι</button><button type="button" className="edit-video" onClick={()=>void requestEdit(selected)}><span aria-hidden="true">✦</span> Επεξεργασία</button><button aria-label="Αγαπημένο" className={`favorite ${selected.favorite?"active":""}`} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♥</button></div>''',
'desktop-subtitle-access')

replace_once(
'''<button type="button" aria-label="Επεξεργασία βίντεο" onClick={()=>void requestEdit(selected)}>✎</button><button type="button" aria-label="Αγαπημένο" className={selected.favorite?"active":""} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♡</button>''',
'''<button type="button" aria-label="Διαχείριση υποτίτλων" onClick={()=>setTranslationChoiceVideo(selected)}>CC</button><button type="button" aria-label="Επεξεργασία βίντεο" onClick={()=>void requestEdit(selected)}>✎</button><button type="button" aria-label="Αγαπημένο" className={selected.favorite?"active":""} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♡</button>''',
'mobile-subtitle-access')

p.write_text(s)

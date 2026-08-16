from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text(encoding="utf-8")

player = replace_once(
    player,
    '  const keyboardSeekTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);',
    '  const keyboardSeekTimer=useRef<ReturnType<typeof setTimeout>|null>(null);\n  const playerScrollPosition=useRef(0);\n  const [subtitleMenuOpen,setSubtitleMenuOpen]=useState(false);',
    "player scroll ref",
)

player = replace_once(
    player,
    '  useEffect(()=>{\n    if(!isPseudoFullscreen)return;\n    const previousOverflow=document.body.style.overflow;\n    document.body.style.overflow="hidden";\n    return()=>{document.body.style.overflow=previousOverflow;};\n  },[isPseudoFullscreen]);',
    '''  useEffect(()=>{\n    if(!isPseudoFullscreen)return;\n    const previousOverflow=document.body.style.overflow;\n    document.body.style.overflow="hidden";\n    return()=>{document.body.style.overflow=previousOverflow;};\n  },[isPseudoFullscreen]);\n  useEffect(()=>{\n    if(!selectedId||view!=="settings")return;\n    const body=document.body;\n    const previousOverflow=body.style.overflow;\n    const previousPaddingRight=body.style.paddingRight;\n    const scrollbarGap=Math.max(0,window.innerWidth-document.documentElement.clientWidth);\n    if(scrollbarGap>0)body.style.paddingRight=`${scrollbarGap}px`;\n    body.style.overflow="hidden";\n    return()=>{\n      body.style.overflow=previousOverflow;\n      body.style.paddingRight=previousPaddingRight;\n      window.requestAnimationFrame(()=>window.scrollTo(0,playerScrollPosition.current));\n    };\n  },[view,selectedId]);\n  useEffect(()=>{\n    const syncQuickTheme=(event:Event)=>{\n      const next=(event as CustomEvent<{theme?:Settings["theme"]}>).detail?.theme;\n      if(next!=="dark"&&next!=="light"&&next!=="system")return;\n      setState(current=>current.settings.theme===next?current:{...current,settings:{...current.settings,theme:next}});\n    };\n    window.addEventListener("gts:themechange",syncQuickTheme as EventListener);\n    return()=>window.removeEventListener("gts:themechange",syncQuickTheme as EventListener);\n  },[]);''',
    "settings scroll lock and theme bridge",
)

player = replace_once(
    player,
    '''  function goToSettings(){\n    const time=currentPlayer()?.getCurrentTime()||selected?.lastPosition||0;\n    if(selectedId)patchVideo(selectedId,{lastPosition:time});\n    player.current?.destroy();player.current=null;setTranscriptOpen(false);setError("");setView("settings");\n  }\n  function returnToVideo(){\n    if(!selectedId)return;\n    const position=state.videos.find(video=>video.id===selectedId)?.lastPosition||0;\n    setView("library");\n    window.setTimeout(()=>initPlayer(selectedId,position),120);\n  }''',
    '''  function goToSettings(){\n    playerScrollPosition.current=window.scrollY;\n    const time=currentPlayer()?.getCurrentTime()||selected?.lastPosition||0;\n    if(selectedId)patchVideo(selectedId,{lastPosition:time});\n    setMobileMenu(false);\n    setSubtitleMenuOpen(false);\n    setVolumeSliderOpen(false);\n    setView("settings");\n  }\n  function returnToVideo(){\n    if(!selectedId)return;\n    setView("library");\n  }''',
    "persistent player settings transition",
)

player = replace_once(
    player,
    '''    const fallbackSpeaker=speakerForVideo(selected.id,selected.channel);\n    const speaker=captions?.speaker||fallbackSpeaker;\n    const displaySpeakerName=selected.speakerName||speaker.name||fallbackSpeaker.name||selected.channel;\n    const displaySpeakerRole=[selected.speakerRole,captions?.speaker?.role,fallbackSpeaker.role].map(cleanSpeakerRole).find(Boolean)||"";''',
    '''    const fallbackSpeaker=speakerForVideo(selected.id,selected.channel);\n    const speaker=captions?.speaker||fallbackSpeaker;\n    const storedSpeaker=(selected.speakerName||"").trim();\n    const normalizedStoredSpeaker=searchText(storedSpeaker);\n    const normalizedChannel=searchText(selected.channel);\n    const speakerNeedsFallback=!storedSpeaker||normalizedStoredSpeaker===normalizedChannel||normalizedStoredSpeaker==="αγνωστος ομιλητης"||normalizedStoredSpeaker==="unknown speaker";\n    const displaySpeakerName=speakerNeedsFallback?(captions?.speaker?.name||fallbackSpeaker.name||selected.channel):storedSpeaker;\n    const displaySpeakerRole=[selected.speakerRole,captions?.speaker?.role,fallbackSpeaker.role].map(cleanSpeakerRole).find(Boolean)||"";''',
    "speaker fallback",
)

player = replace_once(
    player,
    '''    if(view==="settings")return <main className="app-shell viewer settings-from-player"><header className="app-header"><button className="ghost back-to-video" onClick={returnToVideo}>← Πίσω στο βίντεο</button><Brand home={goHome}/><button className="icon-button active" aria-label="Ρυθμίσεις">⚙</button></header><SettingsPage settings={state.settings} update={patch=>setState(current=>({...current,settings:{...current.settings,...patch}}))} close={returnToVideo}/></main>;\n    return <main className="app-shell viewer">''',
    '''    const settingsFromPlayer=view==="settings";\n    return <>\n    <main className={`app-shell viewer ${settingsFromPlayer?"viewer-settings-open":""}`} aria-hidden={settingsFromPlayer?true:undefined}>''',
    "selected settings overlay start",
)

player = replace_once(
    player,
    '''      {translationChoiceVideo&&<TranslationChoiceModal video={translationChoiceVideo} close={()=>setTranslationChoiceVideo(null)} backToLibrary={()=>{setTranslationChoiceVideo(null);setProImportVideo(null);goHome();}} onQuick={()=>{const next={...translationChoiceVideo,translationMode:"google" as TranslationMode};setTranslationChoiceVideo(null);patchVideo(translationChoiceVideo.id,{translationMode:"google"});void rebuildTranslation(next);}} onOpenManual={()=>void requestManualImport(translationChoiceVideo)}/>}\n    </main>;\n  }\n\n  return <main className="app-shell">''',
    '''      {translationChoiceVideo&&<TranslationChoiceModal video={translationChoiceVideo} close={()=>setTranslationChoiceVideo(null)} backToLibrary={()=>{setTranslationChoiceVideo(null);setProImportVideo(null);goHome();}} onQuick={()=>{const next={...translationChoiceVideo,translationMode:"google" as TranslationMode};setTranslationChoiceVideo(null);patchVideo(translationChoiceVideo.id,{translationMode:"google"});void rebuildTranslation(next);}} onOpenManual={()=>void requestManualImport(translationChoiceVideo)}/>}\n    </main>\n    {settingsFromPlayer&&<div className="settings-screen-layer" role="dialog" aria-modal="true" aria-label="Ρυθμίσεις"><div className="app-shell viewer settings-from-player settings-screen-shell"><header className="app-header"><button className="ghost back-to-video" onClick={returnToVideo}>← Πίσω στο βίντεο</button><Brand home={goHome}/><button className="icon-button active" aria-label="Ρυθμίσεις">⚙</button></header><div className="settings-screen-scroll"><SettingsPage settings={state.settings} update={patch=>setState(current=>({...current,settings:{...current.settings,...patch}}))} close={returnToVideo}/></div></div></div>}\n    </>;\n  }\n\n  return <main className="app-shell">''',
    "selected settings overlay end",
)

player = replace_once(
    player,
    '''function SettingsPage({settings,update,close}:{settings:Settings;update:(p:Partial<Settings>)=>void;close:()=>void}) {\n  const toggle=(key:keyof Settings,label:string)=><label className="setting-row"><span>{label}</span><input type="checkbox" checked={Boolean(settings[key])} onChange={e=>update({[key]:e.target.checked})}/></label>;\n  return <section className="settings-page"><header className="settings-page-header"><button type="button" className="settings-close" aria-label="Κλείσιμο ρυθμίσεων" onClick={close}>×</button><span>ΠΡΟΤΙΜΗΣΕΙΣ ΕΦΑΡΜΟΓΗΣ</span><h1>Ρυθμίσεις</h1><p>Οι αλλαγές αποθηκεύονται αυτόματα και εφαρμόζονται σε όλα τα βίντεο.</p></header><div className="settings-grid"><section><h2>Υπότιτλοι</h2><label>Προεπιλεγμένη γλώσσα<select value={settings.subtitleMode} onChange={e=>update({subtitleMode:e.target.value as Settings["subtitleMode"]})}><option value="el">Ελληνικά</option><option value="en">Αγγλικά</option><option value="dual">Διπλοί υπότιτλοι</option></select></label><label>Μέγεθος γραμματοσειράς<input type="range" min="13" max="28" value={settings.subtitleSize} onChange={e=>update({subtitleSize:+e.target.value,subtitleSizeVersion:2})}/><output>{settings.subtitleSize}px · αποθηκεύεται ως προεπιλογή</output></label><label>Θέση<select value={settings.subtitlePosition} onChange={e=>update({subtitlePosition:e.target.value as "top"|"bottom"})}><option value="bottom">Κάτω</option><option value="top">Πάνω</option></select></label><label>Διαφάνεια φόντου<input type="range" min="0" max="1" step=".1" value={settings.opacity} onChange={e=>update({opacity:+e.target.value})}/></label><label>Καθυστέρηση υποτίτλων<input type="range" min="-5" max="5" step=".1" value={settings.delay} onChange={e=>update({delay:+e.target.value})}/><output>{settings.delay}s</output></label>{toggle("subtitles","Εμφάνιση υποτίτλων")}{toggle("autoScroll","Αυτόματη κύλιση μεταγραφής")}{toggle("highlight","Επισήμανση ενεργής γραμμής")}</section><section><h2>Αναπαραγωγή</h2>{toggle("autoplay","Αυτόματη αναπαραγωγή")}<label>Προεπιλεγμένη ταχύτητα<select value={settings.speed} onChange={e=>update({speed:+e.target.value})}>{PLAYBACK_SPEEDS.map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label>{toggle("autoTranslate","Αυτόματη μετάφραση")}{toggle("autoCategory","Αυτόματη κατηγοριοποίηση")}{toggle("continueWatching","Συνέχιση προβολής")}</section><section><h2>Εμφάνιση</h2><label>Διάταξη βιβλιοθήκης<select value={settings.layout} onChange={e=>update({layout:e.target.value as "grid"|"list"})}><option value="grid">Πλέγμα</option><option value="list">Λίστα</option></select></label><label>Θέμα<select value={settings.theme} onChange={e=>update({theme:e.target.value as Settings["theme"]})}><option value="dark">Σκούρο</option><option value="light">Φωτεινό</option><option value="system">Σύστημα</option></select></label>{toggle("compact","Συμπαγείς κάρτες")}{toggle("descriptions","Εμφάνιση περιγραφών")}</section></div></section>;\n}''',
    '''function SettingsPage({settings,update,close}:{settings:Settings;update:(p:Partial<Settings>)=>void;close:()=>void}) {\n  const blurAfterPointer=<T extends HTMLElement>(event:React.PointerEvent<T>)=>event.currentTarget.blur();\n  const toggle=(key:keyof Settings,label:string)=><label className="setting-row"><span>{label}</span><input type="checkbox" checked={Boolean(settings[key])} onPointerUp={blurAfterPointer} onChange={e=>update({[key]:e.target.checked})}/></label>;\n  const transparency=Math.round((1-settings.opacity)*100);\n  return <section className="settings-page"><header className="settings-page-header"><button type="button" className="settings-close" aria-label="Κλείσιμο ρυθμίσεων" onClick={close}>×</button><span>ΠΡΟΤΙΜΗΣΕΙΣ ΕΦΑΡΜΟΓΗΣ</span><h1>Ρυθμίσεις</h1><p>Οι αλλαγές αποθηκεύονται αυτόματα και εφαρμόζονται σε όλα τα βίντεο.</p></header><div className="settings-grid"><section><h2>Υπότιτλοι</h2><label>Προεπιλεγμένη γλώσσα<select value={settings.subtitleMode} onPointerUp={blurAfterPointer} onChange={e=>update({subtitleMode:e.target.value as Settings["subtitleMode"]})}><option value="el">Ελληνικά</option><option value="en">Αγγλικά</option><option value="dual">Διπλοί υπότιτλοι</option></select></label><label>Μέγεθος γραμματοσειράς<input type="range" min="13" max="28" value={settings.subtitleSize} onPointerUp={blurAfterPointer} onChange={e=>update({subtitleSize:+e.target.value,subtitleSizeVersion:2})}/><output>{settings.subtitleSize}px · αποθηκεύεται ως προεπιλογή</output></label><label>Θέση<select value={settings.subtitlePosition} onPointerUp={blurAfterPointer} onChange={e=>update({subtitlePosition:e.target.value as "top"|"bottom"})}><option value="bottom">Κάτω</option><option value="top">Πάνω</option></select></label><label>Διαφάνεια φόντου<input type="range" min="0" max="100" step="10" value={transparency} onPointerUp={blurAfterPointer} onChange={e=>update({opacity:1-(+e.target.value/100)})}/><output>{transparency}% διαφάνεια</output></label><div className="subtitle-settings-preview" aria-label="Προεπισκόπηση υποτίτλων"><span style={{background:`rgba(0,0,0,${settings.opacity})`,fontSize:`${Math.min(22,settings.subtitleSize)}px`}}>Προεπισκόπηση ελληνικών υποτίτλων</span></div><label>Καθυστέρηση υποτίτλων<input type="range" min="-5" max="5" step=".1" value={settings.delay} onPointerUp={blurAfterPointer} onChange={e=>update({delay:+e.target.value})}/><output>{settings.delay}s</output></label>{toggle("subtitles","Εμφάνιση υποτίτλων")}{toggle("autoScroll","Αυτόματη κύλιση μεταγραφής")}{toggle("highlight","Επισήμανση ενεργής γραμμής")}</section><section><h2>Αναπαραγωγή</h2>{toggle("autoplay","Αυτόματη αναπαραγωγή")}<label>Προεπιλεγμένη ταχύτητα<select value={settings.speed} onPointerUp={blurAfterPointer} onChange={e=>update({speed:+e.target.value})}>{PLAYBACK_SPEEDS.map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label>{toggle("autoTranslate","Αυτόματη μετάφραση")}{toggle("autoCategory","Αυτόματη κατηγοριοποίηση")}{toggle("continueWatching","Συνέχιση προβολής")}</section><section><h2>Εμφάνιση</h2><label>Διάταξη βιβλιοθήκης<select value={settings.layout} onPointerUp={blurAfterPointer} onChange={e=>update({layout:e.target.value as "grid"|"list"})}><option value="grid">Πλέγμα</option><option value="list">Λίστα</option></select></label><label>Θέμα<select value={settings.theme} onPointerUp={blurAfterPointer} onChange={e=>update({theme:e.target.value as Settings["theme"]})}><option value="dark">Σκούρο</option><option value="light">Φωτεινό</option><option value="system">Σύστημα</option></select></label>{toggle("compact","Συμπαγείς κάρτες")}{toggle("descriptions","Εμφάνιση περιγραφών")}</section></div></section>;\n}''',
    "settings controls and transparency semantics",
)

player_path.write_text(player, encoding="utf-8")

nav_path = Path("app/NavigationUXEnhancer.tsx")
nav = nav_path.read_text(encoding="utf-8")
nav = replace_once(
    nav,
    '''    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key !== "Escape" || event.defaultPrevented) return;\n      const closeButton = getCloseButton();''',
    '''    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key !== "Escape" || event.defaultPrevented) return;\n      const target = event.target;\n      if (target instanceof Element && target.closest(".modal-backdrop,.version-about-backdrop")) return;\n      if (document.querySelector(".modal-backdrop,.version-about-backdrop")) return;\n      const closeButton = getCloseButton();''',
    "escape modal ownership",
)
nav_path.write_text(nav, encoding="utf-8")

ui_path = Path("app/PlayerUIAuditEnhancer.tsx")
ui = ui_path.read_text(encoding="utf-8")
ui = replace_once(
    ui,
    '''    const decorate = () => {\n      raf = 0;\n      const viewer = document.querySelector("main.app-shell.viewer");\n      if (!viewer) return;\n      viewer.querySelectorAll<HTMLButtonElement>('.icon-button[aria-label="Ρυθμίσεις"]').forEach(button => replaceIcon(button, "settings"));\n      viewer.querySelectorAll<HTMLButtonElement>('.mobile-video-byline button[aria-label="Επεξεργασία βίντεο"], .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]').forEach(button => replaceIcon(button, "edit"));\n      viewer.querySelectorAll<HTMLButtonElement>('.mobile-video-byline button[aria-label="Αγαπημένο"], .mobile-watch-summary button[aria-label="Αγαπημένο"]').forEach(button => replaceIcon(button, "favorite"));\n    };''',
    '''    const decorate = () => {\n      raf = 0;\n      document.querySelectorAll<Element>(".app-shell.viewer").forEach(viewer => {\n        viewer.querySelectorAll<HTMLButtonElement>('.icon-button[aria-label="Ρυθμίσεις"]').forEach(button => replaceIcon(button, "settings"));\n        viewer.querySelectorAll<HTMLButtonElement>('.mobile-video-byline button[aria-label="Επεξεργασία βίντεο"], .mobile-watch-summary button[aria-label="Επεξεργασία βίντεο"]').forEach(button => replaceIcon(button, "edit"));\n        viewer.querySelectorAll<HTMLButtonElement>('.mobile-video-byline button[aria-label="Αγαπημένο"], .mobile-watch-summary button[aria-label="Αγαπημένο"]').forEach(button => replaceIcon(button, "favorite"));\n      });\n    };''',
    "decorate all viewer roots",
)
ui_path.write_text(ui, encoding="utf-8")

css_path = Path("app/screen-isolation.css")
css = css_path.read_text(encoding="utf-8")
css += '''\n.subtitle-settings-preview{\n  min-height:92px;\n  display:grid;\n  place-items:center;\n  margin-top:-2px;\n  padding:16px;\n  overflow:hidden;\n  border:1px solid var(--line);\n  border-radius:12px;\n  background:linear-gradient(145deg,#5e6570,#89919d);\n}\n.subtitle-settings-preview>span{\n  max-width:min(92%,560px);\n  padding:7px 12px;\n  border-radius:7px;\n  color:#fff;\n  font-weight:650;\n  line-height:1.35;\n  text-align:center;\n  text-shadow:0 1px 2px rgba(0,0,0,.4);\n}\n'''
css_path.write_text(css, encoding="utf-8")

print("screen isolation audit migration applied")

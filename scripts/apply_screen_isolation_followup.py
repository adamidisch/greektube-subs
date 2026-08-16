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
    '    if(!selectedId||view!=="settings")return;',
    '    if(view!=="settings")return;',
    "lock settings scroll from every origin",
)
player = replace_once(
    player,
    '  },[view,selectedId]);\n  useEffect(()=>{\n    const syncQuickTheme=',
    '  },[view]);\n  useEffect(()=>{\n    const syncQuickTheme=',
    "scroll lock dependency",
)

player = replace_once(
    player,
    '  function patchVideo(id:string,patch:Partial<Video>){setState(s=>({...s,videos:s.videos.map(v=>v.id===id?{...v,...patch}:v)}));}\n  async function requestEdit',
    '  function patchVideo(id:string,patch:Partial<Video>){setState(s=>({...s,videos:s.videos.map(v=>v.id===id?{...v,...patch}:v)}));}\n  function patchSettings(patch:Partial<Settings>){\n    setState(current=>({...current,settings:{...current.settings,...patch}}));\n    if(typeof patch.speed==="number")currentPlayer()?.setPlaybackRate(patch.speed);\n  }\n  async function requestEdit',
    "central settings updater",
)

player = replace_once(
    player,
    '''  function returnToVideo(){\n    if(!selectedId)return;\n    setView("library");\n  }\n  function goHome(){close();setView("library");setMobileMenu(false);}''',
    '''  function returnToVideo(){\n    if(!selectedId)return;\n    setView("library");\n  }\n  function openLibrarySettings(){\n    playerScrollPosition.current=window.scrollY;\n    setMobileMenu(false);\n    setView("settings");\n  }\n  function returnToLibrary(){setView("library");}\n  function goHome(){close();setView("library");setMobileMenu(false);}''',
    "library settings transitions",
)

player = replace_once(
    player,
    '<button className="icon-button active" aria-label="Ρυθμίσεις">⚙</button></header><div className="settings-screen-scroll"><SettingsPage settings={state.settings} update={patch=>setState(current=>({...current,settings:{...current.settings,...patch}}))} close={returnToVideo}/>',
    '<button className="icon-button active" aria-label="Ρυθμίσεις" onClick={returnToVideo}>⚙</button></header><div className="settings-screen-scroll"><SettingsPage settings={state.settings} update={patchSettings} close={returnToVideo}/>',
    "player settings native close and updater",
)

player = replace_once(
    player,
    '  return <main className="app-shell">\n    <header className="app-header"><Brand home={goHome}/><nav className="desktop-nav"><button className={view==="library"?"active":""} onClick={()=>setView("library")}>Βιβλιοθήκη</button><button className={view==="settings"?"active":""} onClick={()=>setView("settings")}>Ρυθμίσεις</button></nav><button className="primary compact add-top" onClick={()=>void requestAdd()}>＋ Προσθήκη βίντεο</button><button className={`mobile-menu-toggle ${mobileMenu?"active":""}`} aria-label={mobileMenu?"Κλείσιμο μενού":"Άνοιγμα μενού"} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(value=>!value)}><i/><i/><i/></button>{mobileMenu&&<div className="mobile-menu"><button className={view==="library"?"active":""} onClick={goHome}>Βιβλιοθήκη</button><button className={view==="settings"?"active":""} onClick={()=>{setView("settings");setMobileMenu(false)}}>Ρυθμίσεις</button><button className="primary mobile-add" onClick={()=>{setMobileMenu(false);void requestAdd();}}>＋ Προσθήκη βίντεο</button></div>}</header>\n    {view==="settings"?<SettingsPage settings={state.settings} update={patch=>setState(s=>({...s,settings:{...s.settings,...patch}}))} close={()=>setView("library")}/>:<>',
    '  const settingsFromLibrary=view==="settings";\n  return <>\n  <main className={`app-shell ${settingsFromLibrary?"library-settings-open":""}`} aria-hidden={settingsFromLibrary?true:undefined}>\n    <header className="app-header"><Brand home={goHome}/><nav className="desktop-nav"><button className={!settingsFromLibrary?"active":""} onClick={returnToLibrary}>Βιβλιοθήκη</button><button className={settingsFromLibrary?"active":""} onClick={openLibrarySettings}>Ρυθμίσεις</button></nav><button className="primary compact add-top" onClick={()=>void requestAdd()}>＋ Προσθήκη βίντεο</button><button className={`mobile-menu-toggle ${mobileMenu?"active":""}`} aria-label={mobileMenu?"Κλείσιμο μενού":"Άνοιγμα μενού"} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(value=>!value)}><i/><i/><i/></button>{mobileMenu&&<div className="mobile-menu"><button className={!settingsFromLibrary?"active":""} onClick={goHome}>Βιβλιοθήκη</button><button className={settingsFromLibrary?"active":""} onClick={openLibrarySettings}>Ρυθμίσεις</button><button className="primary mobile-add" onClick={()=>{setMobileMenu(false);void requestAdd();}}>＋ Προσθήκη βίντεο</button></div>}</header>\n    <>',
    "library settings overlay start",
)

player = replace_once(
    player,
    '      <footer className="app-footer"><div className="app-footer-brand"><span className="brand-mark" aria-hidden="true" /><span>GreekTube <b>Subs</b></span></div><p>Αυτόματοι ελληνικοί υπότιτλοι για δημόσια βίντεο YouTube.</p><span className="app-footer-note">Φτιαγμένο με ♥ για ελληνόφωνους θεατές</span></footer>\n    </>}\n    {modal&&',
    '      <footer className="app-footer"><div className="app-footer-brand"><span className="brand-mark" aria-hidden="true" /><span>GreekTube <b>Subs</b></span></div><p>Αυτόματοι ελληνικοί υπότιτλοι για δημόσια βίντεο YouTube.</p><span className="app-footer-note">Φτιαγμένο με ♥ για ελληνόφωνους θεατές</span></footer>\n    </>\n    {modal&&',
    "library always mounted",
)

player = replace_once(
    player,
    '''    {translationChoiceVideo&&<TranslationChoiceModal video={translationChoiceVideo} close={()=>setTranslationChoiceVideo(null)} backToLibrary={()=>{setTranslationChoiceVideo(null);setProImportVideo(null);goHome();}} onQuick={()=>{const next={...translationChoiceVideo,translationMode:"google" as TranslationMode};setTranslationChoiceVideo(null);patchVideo(translationChoiceVideo.id,{translationMode:"google"});void rebuildTranslation(next);}} onOpenManual={()=>void requestManualImport(translationChoiceVideo)}/>}\n  </main>;\n}''',
    '''    {translationChoiceVideo&&<TranslationChoiceModal video={translationChoiceVideo} close={()=>setTranslationChoiceVideo(null)} backToLibrary={()=>{setTranslationChoiceVideo(null);setProImportVideo(null);goHome();}} onQuick={()=>{const next={...translationChoiceVideo,translationMode:"google" as TranslationMode};setTranslationChoiceVideo(null);patchVideo(translationChoiceVideo.id,{translationMode:"google"});void rebuildTranslation(next);}} onOpenManual={()=>void requestManualImport(translationChoiceVideo)}/>}\n  </main>\n  {settingsFromLibrary&&<div className="settings-screen-layer" role="dialog" aria-modal="true" aria-label="Ρυθμίσεις"><div className="app-shell viewer settings-from-library settings-screen-shell"><header className="app-header"><button className="ghost back-library" autoFocus onClick={returnToLibrary}>← Βιβλιοθήκη</button><Brand home={goHome}/><button className="icon-button active" aria-label="Ρυθμίσεις" onClick={returnToLibrary}>⚙</button></header><div className="settings-screen-scroll"><SettingsPage settings={state.settings} update={patchSettings} close={returnToLibrary}/></div></div></div>}\n  </>;\n}''',
    "library settings overlay end",
)

player = replace_once(
    player,
    '<button className="ghost back-to-video" onClick={returnToVideo}>← Πίσω στο βίντεο</button><Brand home={goHome}/>',
    '<button className="ghost back-to-video" autoFocus onClick={returnToVideo}>← Πίσω στο βίντεο</button><Brand home={goHome}/>',
    "focus settings overlay",
)

player_path.write_text(player, encoding="utf-8")

nav_path = Path("app/NavigationUXEnhancer.tsx")
nav = nav_path.read_text(encoding="utf-8")
start = nav.index('    const handleClick = (event: MouseEvent) => {')
end = nav.index('\n\n    document.addEventListener("keydown", handleKeyDown);', start)
nav = nav[:start] + nav[end+2:]
nav = nav.replace('    document.addEventListener("click", handleClick, true);\n', '')
nav = nav.replace('      document.removeEventListener("click", handleClick, true);\n', '')
nav_path.write_text(nav, encoding="utf-8")

for path_str in ["app/ThemeToggleEnhancer.tsx", "app/LogoPreferenceSystem.tsx", "app/PlayerUIAuditEnhancer.tsx"]:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    text = text.replace('observer.observe(document.body, { childList: true });', 'observer.observe(document.body, { childList: true, subtree: true });')
    text = text.replace('bodyObserver.observe(document.body, { childList: true });', 'bodyObserver.observe(document.body, { childList: true, subtree: true });')
    text = text.replace('lifecycleObserver.observe(document.body, { childList: true });', 'lifecycleObserver.observe(document.body, { childList: true, subtree: true });')
    path.write_text(text, encoding="utf-8")

css_path = Path("app/screen-isolation.css")
css = css_path.read_text(encoding="utf-8")
css = css.replace('.viewer-settings-open{\n  pointer-events:none;\n  user-select:none;\n}', '.viewer-settings-open,\n.library-settings-open{\n  pointer-events:none;\n  user-select:none;\n}')
css_path.write_text(css, encoding="utf-8")

print("second-pass screen isolation migration applied")

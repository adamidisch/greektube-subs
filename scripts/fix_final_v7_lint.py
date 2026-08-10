from pathlib import Path

path = Path("app/GreekTubePlayer.tsx")
text = path.read_text()

old = '''  useEffect(()=>{\n    if(!isFullscreen&&!isPseudoFullscreen){\n      if(fsExitTimer.current)clearTimeout(fsExitTimer.current);\n      setShowFsExit(true);\n      return;\n    }\n    if(isPlaying){\n      fsExitTimer.current=setTimeout(()=>setShowFsExit(false),2200);\n    }else{\n      if(fsExitTimer.current)clearTimeout(fsExitTimer.current);\n      setShowFsExit(true);\n    }\n    return()=>{if(fsExitTimer.current)clearTimeout(fsExitTimer.current);};\n  },[isFullscreen,isPseudoFullscreen,isPlaying]);\n'''
new = '''  useEffect(()=>{\n    if(!isFullscreen&&!isPseudoFullscreen){\n      if(fsExitTimer.current)clearTimeout(fsExitTimer.current);\n      const reveal=window.setTimeout(()=>setShowFsExit(true),0);\n      return()=>window.clearTimeout(reveal);\n    }\n    if(isPlaying){\n      fsExitTimer.current=setTimeout(()=>setShowFsExit(false),2200);\n    }else{\n      if(fsExitTimer.current)clearTimeout(fsExitTimer.current);\n      fsExitTimer.current=setTimeout(()=>setShowFsExit(true),0);\n    }\n    return()=>{if(fsExitTimer.current)clearTimeout(fsExitTimer.current);};\n  },[isFullscreen,isPseudoFullscreen,isPlaying]);\n'''
if old not in text:
    raise SystemExit("fullscreen effect not found")
text = text.replace(old, new, 1)

old = '''  useEffect(()=>{\n    if(controlsTimer.current)clearTimeout(controlsTimer.current);\n    if(!isPlaying){setControlsVisible(true);return;}\n    setControlsVisible(true);\n    controlsTimer.current=setTimeout(()=>setControlsVisible(false),3600);\n    return()=>{if(controlsTimer.current)clearTimeout(controlsTimer.current);};\n  },[isPlaying,selectedId]);\n'''
new = '''  useEffect(()=>{\n    if(controlsTimer.current)clearTimeout(controlsTimer.current);\n    const reveal=window.setTimeout(()=>setControlsVisible(true),0);\n    if(!isPlaying)return()=>window.clearTimeout(reveal);\n    controlsTimer.current=setTimeout(()=>setControlsVisible(false),3600);\n    return()=>{window.clearTimeout(reveal);if(controlsTimer.current)clearTimeout(controlsTimer.current);};\n  },[isPlaying,selectedId]);\n'''
if old not in text:
    raise SystemExit("controls effect not found")
text = text.replace(old, new, 1)

old = '  useEffect(()=>setVisibleCount(PAGE_SIZE),[search,category,sort,filter]);\n'
new = '  useEffect(()=>{const reset=window.setTimeout(()=>setVisibleCount(PAGE_SIZE),0);return()=>window.clearTimeout(reset);},[search,category,sort,filter]);\n'
if old not in text:
    raise SystemExit("paging effect not found")
text = text.replace(old, new, 1)

# Remove now-unused old progress label helper after the featured metadata cleanup.
start = text.find('function watchProgressLabel(video:Video) {\n')
if start >= 0:
    end = text.find('\n}\n\nexport default function GreekTubePlayer()', start)
    if end < 0:
        raise SystemExit("watchProgressLabel end not found")
    text = text[:start] + text[end+3:]

path.write_text(text)
print("v7 lint fixes applied")

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing pattern: {label}")
    return text.replace(old, new, 1)

# GreekTubePlayer.tsx: keep current v7 features, add only missing Claude fixes.
path = Path("app/GreekTubePlayer.tsx")
text = path.read_text()
text = replace_once(
    text,
    '  const sentences=clean.match(/[^.!?…]+[.!?…]?/g)?.map(part=>part.trim()).filter(Boolean)||[clean];\n  const parts:string[]=[];',
    '  const rawSentences=clean.match(/[^.!?…]+[.!?…]?/g)?.map(part=>part.trim()).filter(Boolean)||[clean];\n  const sentences:string[]=[];\n  for(const sentence of rawSentences){\n    if(sentences.length&&sentence.replace(/[.!?…]+$/," ").trim().length<=2){\n      sentences[sentences.length-1]=`${sentences[sentences.length-1]} ${sentence}`;\n    }else sentences.push(sentence);\n  }\n  const parts:string[]=[];',
    "subtitle tiny-fragment merge",
)
text = replace_once(text, '<small className="brand-version">ver 7.0</small>', '<small className="brand-version">ver 7.1</small>', "brand version")
path.write_text(text)

# content-areas-final.css: add missing Claude presentation rules without removing v7 refinements.
path = Path("app/content-areas-final.css")
text = path.read_text()
featured_anchor = '''html body .app-shell.app-shell.app-shell .featured-actions .primary,
html body .app-shell.app-shell.app-shell .featured-actions .secondary{
  width:100%!important;min-width:0!important;height:auto!important;min-height:48px!important;
  padding:10px 16px!important;border-radius:14px!important;font-size:13px!important;line-height:1.25!important;
  white-space:normal!important;overflow:visible!important;text-overflow:clip!important;
}
'''
featured_extra = featured_anchor + '''html body .app-shell.app-shell.app-shell .featured-actions .primary{
  border:1px solid rgba(124,116,224,.4)!important;background:#7c74e0!important;color:#fff!important;
  box-shadow:0 8px 22px rgba(124,116,224,.28)!important;
}
html body .app-shell.app-shell.app-shell .featured-actions .secondary{
  border:1px solid rgba(255,255,255,.08)!important;background:#1b1f26!important;color:#f6f3ec!important;box-shadow:none!important;
}
html body .app-shell.app-shell.app-shell .featured-actions .secondary:hover{border-color:rgba(255,255,255,.18)!important}
'''
text = replace_once(text, featured_anchor, featured_extra, "featured buttons")

heart_old = '''html body .app-shell.app-shell.app-shell .heart{
  position:absolute!important;top:8px!important;right:8px!important;z-index:2!important;
  width:30px!important;height:30px!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:50%!important;
  background:rgba(5,6,9,.72)!important;color:#aaa!important;font-size:13px!important;backdrop-filter:blur(8px)!important;
}
'''
heart_new = '''html body .app-shell.app-shell.app-shell .thumb-top-right{
  position:absolute!important;top:8px!important;right:8px!important;z-index:2!important;
  display:flex!important;align-items:center!important;gap:6px!important;
}
html body .app-shell.app-shell.app-shell .card-category{
  height:30px!important;display:flex!important;align-items:center!important;padding:0 10px!important;
  border:1px solid rgba(255,255,255,.2)!important;border-radius:99px!important;background:rgba(5,6,9,.72)!important;
  color:#e2dcff!important;font-size:10px!important;font-weight:700!important;letter-spacing:.04em!important;text-transform:uppercase!important;
  white-space:nowrap!important;backdrop-filter:blur(8px)!important;
}
html body .app-shell.app-shell.app-shell .heart{
  position:static!important;flex:0 0 auto!important;z-index:2!important;
  width:30px!important;height:30px!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:50%!important;
  background:rgba(5,6,9,.72)!important;color:#aaa!important;font-size:13px!important;backdrop-filter:blur(8px)!important;
}
'''
text = replace_once(text, heart_old, heart_new, "thumbnail category group")

icon_anchor = 'html body .app-shell.app-shell.app-shell .icon-button.active{border-color:rgba(124,116,224,.4)!important;background:#1b1930!important;color:#c9c4f5!important}\n'
icon_extra = icon_anchor + 'html body .app-shell.app-shell.app-shell .icon-button:after{content:none!important;display:none!important}\n'
text = replace_once(text, icon_anchor, icon_extra, "settings phantom hamburger")
path.write_text(text)

# Desktop volume popup styles.
path = Path("app/desktop-controls-final.css")
text = path.read_text()
anchor = '''  html body .viewer.viewer.viewer .playback-controls .play-toggle{
    width:36px!important;min-width:36px!important;height:36px!important;min-height:36px!important;
    display:grid!important;place-items:center!important;padding:0!important;margin:0!important;
    border-radius:50%!important;background:#7c74e0!important;color:#fff!important;font-size:13px!important;
    box-shadow:0 6px 16px rgba(124,116,224,.28)!important;
  }
'''
extra = anchor + '''  html body .viewer.viewer.viewer .volume-control{position:relative!important;flex:0 0 auto!important}
  html body .viewer.viewer.viewer .volume-toggle{
    width:28px!important;min-width:28px!important;height:34px!important;
    display:flex!important;align-items:center!important;justify-content:center!important;
    padding:0!important;margin:0!important;border:0!important;background:transparent!important;color:#8b9099!important;
  }
  html body .viewer.viewer.viewer .volume-toggle:hover{color:#f6f3ec!important}
  html body .viewer.viewer.viewer .volume-toggle svg{width:16px!important;height:16px!important}
  html body .viewer.viewer.viewer .volume-popup{
    position:absolute!important;bottom:calc(100% + 10px)!important;left:50%!important;transform:translateX(-50%)!important;
    display:flex!important;align-items:center!important;gap:8px!important;padding:9px 12px!important;
    border:1px solid rgba(255,255,255,.1)!important;border-radius:14px!important;background:#1b1f26!important;
    box-shadow:0 14px 32px rgba(0,0,0,.4)!important;z-index:20!important;white-space:nowrap!important;
  }
  html body .viewer.viewer.viewer .volume-mute-btn{width:22px!important;height:22px!important;padding:0!important;border:0!important;background:transparent!important;font-size:13px!important;line-height:1!important}
  html body .viewer.viewer.viewer .volume-popup input[type="range"]{width:100px!important;height:4px!important;margin:0!important;accent-color:#7c74e0!important}
'''
text = replace_once(text, anchor, extra, "desktop volume styles")
path.write_text(text)

# Mobile volume popup styles.
path = Path("app/mobile-controls-final.css")
text = path.read_text()
anchor = '''  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .playback-controls .play-toggle{
    width:40px!important;min-width:40px!important;height:40px!important;min-height:40px!important;flex:0 0 40px!important;
    display:grid!important;place-items:center!important;padding:0!important;margin:0!important;
    border-radius:50%!important;background:#7c74e0!important;color:#fff!important;font-size:14px!important;position:static!important;
    box-shadow:0 6px 16px rgba(124,116,224,.25)!important;
  }
'''
extra = anchor + '''  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .playback-controls{gap:9px!important}
  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .volume-control{position:relative!important;flex:0 0 30px!important}
  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .volume-toggle{
    width:30px!important;min-width:30px!important;height:36px!important;
    display:flex!important;align-items:center!important;justify-content:center!important;
    padding:0!important;margin:0!important;color:#8b9099!important;position:static!important;
  }
  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .volume-toggle svg{width:17px!important;height:17px!important}
  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .volume-popup{
    position:absolute!important;bottom:calc(100% + 10px)!important;left:50%!important;transform:translateX(-50%)!important;
    display:flex!important;align-items:center!important;gap:8px!important;padding:9px 12px!important;
    border:1px solid #2b313b!important;border-radius:14px!important;background:#1b1f26!important;
    box-shadow:0 14px 32px rgba(0,0,0,.4)!important;z-index:20!important;white-space:nowrap!important;
  }
  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .volume-mute-btn{
    width:24px!important;height:24px!important;padding:0!important;border:0!important;background:transparent!important;font-size:14px!important;line-height:1!important;
  }
  html body .viewer.viewer.viewer .player-actions.player-actions.player-tools.player-tools.player-tools .volume-popup input[type="range"]{
    width:96px!important;height:4px!important;margin:0!important;accent-color:#7c74e0!important;
  }
'''
text = replace_once(text, anchor, extra, "mobile volume styles")
path.write_text(text)

# Fullscreen exit button: centered on right edge, safer/easier touch target.
path = Path("app/globals.css")
text = path.read_text()
old = '.video-frame.pseudo-fullscreen .custom-fullscreen{display:grid;place-items:center;z-index:1003;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));width:48px;height:48px;opacity:1;touch-action:manipulation}'
new = '.video-frame.pseudo-fullscreen .custom-fullscreen{display:grid;place-items:center;position:fixed;z-index:1003;top:50%;right:max(16px,env(safe-area-inset-right));bottom:auto;left:auto;transform:translateY(-50%);width:52px;height:52px;opacity:1;touch-action:manipulation}'
text = replace_once(text, old, new, "pseudo fullscreen exit position")
path.write_text(text)

# Captions: safer filler cleanup + more context per translation request.
path = Path("app/api/captions/route.ts")
text = path.read_text()
old = '''function cleanSubtitleText(text: string) {
  return text
    // JavaScript \\b is ASCII-centric and was missing Greek filler tokens.
    // Use Unicode letter/number boundaries instead and remove only clear
    // hesitation noises, leaving meaningful words/interjections untouched.
    .replace(/(^|[^\\p{L}\\p{N}])(?:u+m+|u+h+|e+r+m+|h+m{2,}|m{3,}|χ+μ{2,}|μ{3,})(?=$|[^\\p{L}\\p{N}])/giu, "$1")
    // Collapse obvious ASR stutters only when the same 2+ letter word is
    // repeated three or more times in a row.
    .replace(/(^|[^\\p{L}\\p{N}])(\\p{L}{2,})(?:\\s+\\2){2,}(?=$|[^\\p{L}\\p{N}])/giu, "$1$2")
    .replace(/\\s+([,.;:!?…])/g, "$1")
    .replace(/([!?.,…])\\1{2,}/g, "$1")
    .replace(/\\s+/g, " ")
    .trim();
}
'''
new = '''function cleanSubtitleText(text: string) {
  return text
    // Unicode-aware filler cleanup. Keep it conservative: remove only clear
    // hesitation noise, never ordinary Greek words or single-letter tokens.
    .replace(/(^|[^\\p{L}\\p{N}])(?:u+m+|u+h+|e+r+m+|h+m{2,}|m{3,}|χ+μ{2,}|μ{3,}|ε{2,})(?=$|[^\\p{L}\\p{N}])/giu, "$1")
    // Collapse obvious ASR stutters only when the same 2+ letter word is
    // repeated three or more times in a row.
    .replace(/(^|[^\\p{L}\\p{N}])(\\p{L}{2,})(?:\\s+\\2){2,}(?=$|[^\\p{L}\\p{N}])/giu, "$1$2")
    .replace(/^[,;:]+\\s*/, "")
    .replace(/([,;:])\\s*\\1+/g, "$1")
    .replace(/\\s+([,.;:!?…])/g, "$1")
    .replace(/([!?.,…])\\1{2,}/g, "$1")
    .replace(/\\s+/g, " ")
    .trim();
}
'''
text = replace_once(text, old, new, "subtitle filler cleanup")
text = replace_once(text, 'for (let start = 0; start < cues.length; start += 10) {\n    batches.push(cues.slice(start, start + 10)', 'for (let start = 0; start < cues.length; start += 25) {\n    batches.push(cues.slice(start, start + 25)', "translation batch 25")
text = replace_once(text, 'for (let start = 0; start < batches.length; start += 3) {\n    const results = await Promise.all(batches.slice(start, start + 3).map(translateMeaningBatch));', 'for (let start = 0; start < batches.length; start += 2) {\n    const results = await Promise.all(batches.slice(start, start + 2).map(translateMeaningBatch));', "translation concurrency 2")
path.write_text(text)

# Release metadata 7.1.0.
path = Path("app/layout.tsx")
text = path.read_text()
text = replace_once(text, '"codex-preview": "final-v7",', '"codex-preview": "final-v7.1",', "codex preview version")
text = replace_once(text, '"app-version": "7.0.0",', '"app-version": "7.1.0",', "app version")
path.write_text(text)

path = Path("package.json")
text = path.read_text()
text = replace_once(text, '"version": "7.0.0"', '"version": "7.1.0"', "package version")
path.write_text(text)

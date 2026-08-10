from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing pattern: {label}")
    return text.replace(old, new, 1)

player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()

# Ignore generic fallback biographies as a visible professional role.
anchor = '''function searchText(value:string){\n  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();\n}\n'''
helper = '''function searchText(value:string){\n  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();\n}\nfunction cleanSpeakerRole(value?:string){\n  const role=(value||"").trim();\n  if(!role)return "";\n  const normalized=searchText(role);\n  const generic=normalized.includes("ομιλητης")&&(normalized.includes("δημιουργος")||normalized.includes("περιεχομενου"));\n  return generic?"":role;\n}\n'''
player = replace_once(player, anchor, helper, "clean speaker role helper")

old = '''    const speaker=captions?.speaker||speakerForVideo(selected.id,selected.channel);\n    const displaySpeakerName=selected.speakerName||speaker.name||selected.channel;\n    const displaySpeakerRole=selected.speakerRole||speaker.role||"";\n    const displaySpeakerLabel=displaySpeakerRole?`${displaySpeakerName} (${displaySpeakerRole})`:displaySpeakerName;\n'''
new = '''    const fallbackSpeaker=speakerForVideo(selected.id,selected.channel);\n    const speaker=captions?.speaker||fallbackSpeaker;\n    const displaySpeakerName=selected.speakerName||speaker.name||fallbackSpeaker.name||selected.channel;\n    const displaySpeakerRole=[selected.speakerRole,captions?.speaker?.role,fallbackSpeaker.role].map(cleanSpeakerRole).find(Boolean)||"";\n    const displaySpeakerLabel=displaySpeakerRole?`${displaySpeakerName} | ${displaySpeakerRole}`:displaySpeakerName;\n'''
player = replace_once(player, old, new, "speaker display priority")

old = '''<small className="video-meta-kicker"><strong>{displaySpeakerName}</strong>{displaySpeakerRole&&<span> ({displaySpeakerRole})</span>}<span> · {CATEGORY_LABELS[selected.category]}</span></small>'''
new = '''<small className="video-meta-kicker"><strong>{displaySpeakerName}</strong>{displaySpeakerRole&&<><span className="speaker-divider" aria-hidden="true">|</span><span className="speaker-role">{displaySpeakerRole}</span></>}<span className="video-category-label" data-category={selected.category}>{CATEGORY_LABELS[selected.category]}</span></small>'''
player = replace_once(player, old, new, "speaker/category metadata row")

# Edit panel should offer the concise known role instead of preserving a generic sentence.
old = '''<label>Ιδιότητα<input name="speakerRole" defaultValue={video.speakerRole||""} placeholder="π.χ. Neurologist"/></label>'''
new = '''<label>Ιδιότητα<input name="speakerRole" defaultValue={cleanSpeakerRole(video.speakerRole)||cleanSpeakerRole(speakerForVideo(video.id,video.channel).role)} placeholder="π.χ. Neurologist"/></label>'''
player = replace_once(player, old, new, "edit speaker role default")

player_path.write_text(player)

css_path = Path("app/content-areas-final.css")
css = css_path.read_text()
marker = "/* ===== v7 speaker metadata refinement ===== */"
if marker not in css:
    css += r'''

/* ===== v7 speaker metadata refinement ===== */
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker{
  display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:5px 7px!important;
  margin:0 0 8px!important;color:#969ca7!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker strong{
  color:#f4f5f7!important;font-weight:700!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker .speaker-divider{
  color:#555d6a!important;font-weight:500!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker .speaker-role{
  color:#aeb4bf!important;font-weight:520!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label{
  display:inline-flex!important;align-items:center!important;min-height:22px!important;padding:3px 8px!important;
  border:1px solid rgba(255,255,255,.12)!important;border-radius:7px!important;background:rgba(255,255,255,.055)!important;
  color:#c7cbd2!important;font-size:9.5px!important;font-weight:750!important;line-height:1!important;
  letter-spacing:.055em!important;text-transform:uppercase!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Medical"]{
  border-color:rgba(227,162,60,.32)!important;background:rgba(227,162,60,.11)!important;color:#e7b96f!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Tech"]{
  border-color:rgba(80,159,225,.32)!important;background:rgba(80,159,225,.11)!important;color:#87bfea!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Podcasts"]{
  border-color:rgba(143,127,240,.32)!important;background:rgba(143,127,240,.11)!important;color:#bbb1ff!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Education"]{
  border-color:rgba(91,174,120,.32)!important;background:rgba(91,174,120,.11)!important;color:#96d3a8!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Documentaries"]{
  border-color:rgba(61,177,169,.32)!important;background:rgba(61,177,169,.11)!important;color:#8fd8d2!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-category-label[data-category="Comedy"]{
  border-color:rgba(226,113,104,.32)!important;background:rgba(226,113,104,.11)!important;color:#f0a39d!important;
}
@media(max-width:620px){
  html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker{gap:5px 6px!important;margin-bottom:7px!important}
  html body .app-shell.app-shell.app-shell .video-heading .video-category-label{min-height:20px!important;padding:3px 7px!important;font-size:9px!important}
}
'''
css_path.write_text(css)

print("Speaker metadata refinement applied")

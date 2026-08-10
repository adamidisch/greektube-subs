from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected block: {label}")
    return text.replace(old, new, 1)

# 1) Metadata API: extract speaker + role and source URLs at import time.
path = Path("app/api/metadata/route.ts")
text = path.read_text(encoding="utf-8")
text = replace_once(text,
'''    if (!response.ok) return { title: "", author: "" };
    const metadata = (await response.json()) as { title?: string; author_name?: string };
    return { title: metadata.title || "", author: metadata.author_name || "" };
  } catch {
    return { title: "", author: "" };
  }
}

function doctorName(title: string, description: string) {
  const source = `${title}\\n${description.slice(0, 1200)}`;
  const match = source.match(/\\b(?:Dr\\.?|Doctor)\\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})/);
  return match ? `Dr ${match[1].replace(/[|:,\\-–—]+$/g, "").trim()}` : "";
}
''',
'''    if (!response.ok) return { title: "", author: "", authorUrl: "" };
    const metadata = (await response.json()) as { title?: string; author_name?: string; author_url?: string };
    return {
      title: metadata.title || "",
      author: metadata.author_name || "",
      authorUrl: metadata.author_url || "",
    };
  } catch {
    return { title: "", author: "", authorUrl: "" };
  }
}

function speakerNameFromMetadata(title: string, description: string) {
  const source = `${title}\\n${description.slice(0, 2600)}`;
  const doctor = source.match(/\\b(?:Dr\\.?|Doctor)\\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})/);
  if (doctor) return `Dr ${doctor[1].replace(/[|:,\\-–—]+$/g, "").trim()}`;

  const credentialed = source.match(/\\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})\\s*,\\s*(?:M\\.?D\\.?|D\\.?O\\.?|Ph\\.?D\\.?|MBBS|MD|DO|PhD)\\b/);
  if (credentialed) return credentialed[1].trim();

  const guest = source.match(/\\b(?:guest|joined by|speaking with|conversation with|interview with|featuring)\\s+(?:Dr\\.?\\s+)?([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})/i);
  return guest ? guest[1].replace(/[|:,\\-–—]+$/g, "").trim() : "";
}

const ROLE_LABELS: Array<[RegExp, string]> = [
  [/\\bcardiothoracic surgeon\\b/i, "Cardiothoracic Surgeon"],
  [/\\bneurosurgeon\\b/i, "Neurosurgeon"],
  [/\\bneurologist\\b/i, "Neurologist"],
  [/\\bcardiologist\\b/i, "Cardiologist"],
  [/\\bendocrinologist\\b/i, "Endocrinologist"],
  [/\\bgastroenterologist\\b/i, "Gastroenterologist"],
  [/\\boncologist\\b/i, "Oncologist"],
  [/\\bpsychiatrist\\b/i, "Psychiatrist"],
  [/\\bpsychologist\\b/i, "Psychologist"],
  [/\\bneuroscientist\\b/i, "Neuroscientist"],
  [/\\b(?:medical )?doctor\\b/i, "Doctor"],
  [/\\bphysician\\b/i, "Physician"],
  [/\\bsurgeon\\b/i, "Surgeon"],
  [/\\bdietitian\\b/i, "Dietitian"],
  [/\\bnutritionist\\b/i, "Nutritionist"],
  [/\\bbiochemist\\b/i, "Biochemist"],
  [/\\bpharmacist\\b/i, "Pharmacist"],
  [/\\bprofessor\\b/i, "Professor"],
  [/\\bresearcher\\b/i, "Researcher"],
  [/\\bscientist\\b/i, "Scientist"],
  [/\\btherapist\\b/i, "Therapist"],
];

function speakerRoleFromMetadata(description: string, speakerName: string) {
  if (!description) return "";
  const normalizedName = speakerName.replace(/^Dr\\.?\\s+/i, "").trim();
  const lower = description.toLowerCase();
  const nameIndex = normalizedName ? lower.indexOf(normalizedName.toLowerCase()) : -1;
  const local = nameIndex >= 0
    ? description.slice(Math.max(0, nameIndex - 180), nameIndex + normalizedName.length + 420)
    : description.slice(0, 1600);
  for (const [pattern, label] of ROLE_LABELS) if (pattern.test(local)) return label;
  return "";
}
''', "metadata extraction helpers")

text = text.replace('const speakerName = doctorName(originalTitle, details.description);', 'const speakerName = speakerNameFromMetadata(originalTitle, details.description);\n    const speakerRole = speakerRoleFromMetadata(details.description, speakerName);')
text = text.replace('speakerName: "",\n        category: "Other",', 'speakerName: "",\n        speakerRole: "",\n        channelUrl: "",\n        originalVideoUrl: `https://www.youtube.com/watch?v=${id}`,\n        category: "Other",')
text = text.replace('      channel: metadata.author || details.author || "YouTube",\n      duration: details.duration,\n      description: details.description,\n      speakerName,', '      channel: metadata.author || details.author || "YouTube",\n      channelUrl: metadata.authorUrl || "",\n      originalVideoUrl: `https://www.youtube.com/watch?v=${id}`,\n      duration: details.duration,\n      description: details.description,\n      speakerName,\n      speakerRole,')
path.write_text(text, encoding="utf-8")

# 2) Client: persist structured metadata and render compact speaker/source hierarchy.
path = Path("app/GreekTubePlayer.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(text,
'''type Captions = { videoId: string; title: string; originalTitle?:string; channel: string; cues: Cue[]; englishCues?:Cue[]; duration?: number; transcriptVersion?: number; keyPoints?: string[]; topics?: string[]; speaker?:SpeakerProfile };''',
'''type Captions = { videoId: string; title: string; originalTitle?:string; channel: string; channelUrl?:string; originalVideoUrl?:string; cues: Cue[]; englishCues?:Cue[]; duration?: number; transcriptVersion?: number; keyPoints?: string[]; topics?: string[]; speaker?:SpeakerProfile };''', "Captions type")
text = replace_once(text,
'''  speakerName?:string; views?:number; metadataVersion?:number;''',
'''  speakerName?:string; speakerRole?:string; channelUrl?:string; originalVideoUrl?:string; views?:number; metadataVersion?:number;''', "Video metadata fields")
text = text.replace('video.metadataVersion!==3', 'video.metadataVersion!==4')
text = replace_once(text,
'''const metadata=await response.json() as {id?:string;title?:string;originalTitle?:string;channel?:string;duration?:number;description?:string;speakerName?:string;category?:Category;tags?:string[]};''',
'''const metadata=await response.json() as {id?:string;title?:string;originalTitle?:string;channel?:string;channelUrl?:string;originalVideoUrl?:string;duration?:number;description?:string;speakerName?:string;speakerRole?:string;category?:Category;tags?:string[]};''', "metadata refresh response")
text = replace_once(text,
'''return {...video,title:isGreekTitle(metadata.title||"")?metadata.title!:video.title,originalTitle:metadata.originalTitle||video.originalTitle,channel:metadata.channel||video.channel,duration:metadata.duration||video.duration,description:metadata.description||video.description,speakerName:metadata.speakerName||video.speakerName,category:metadata.category||video.category,tags:metadata.tags?.length?Array.from(new Set([...video.tags,...metadata.tags])):video.tags,metadataVersion:3};''',
'''return {...video,title:isGreekTitle(metadata.title||"")?metadata.title!:video.title,originalTitle:metadata.originalTitle||video.originalTitle,channel:metadata.channel||video.channel,channelUrl:metadata.channelUrl||video.channelUrl,originalVideoUrl:metadata.originalVideoUrl||video.originalVideoUrl||video.url,duration:metadata.duration||video.duration,description:metadata.description||video.description,speakerName:metadata.speakerName||video.speakerName,speakerRole:metadata.speakerRole||video.speakerRole,category:metadata.category||video.category,tags:metadata.tags?.length?Array.from(new Set([...video.tags,...metadata.tags])):video.tags,metadataVersion:4};''', "metadata refresh merge")
text = text.replace('speakerName:video.speakerName||ready.speaker?.name,lastWatched', 'speakerName:video.speakerName||ready.speaker?.name,speakerRole:video.speakerRole||ready.speaker?.role,lastWatched')
text = text.replace('speakerName:video.speakerName||cached.speaker?.name,lastWatched', 'speakerName:video.speakerName||cached.speaker?.name,speakerRole:video.speakerRole||cached.speaker?.role,lastWatched')
text = text.replace('speakerName:video.speakerName||sharedData.speaker?.name});', 'speakerName:video.speakerName||sharedData.speaker?.name,speakerRole:video.speakerRole||sharedData.speaker?.role});')

text = replace_once(text,
'''    const speaker=captions?.speaker||speakerForVideo(selected.id,selected.channel);
    const preparationStage=''',
'''    const speaker=captions?.speaker||speakerForVideo(selected.id,selected.channel);
    const displaySpeakerName=selected.speakerName||speaker.name||selected.channel;
    const displaySpeakerRole=selected.speakerRole||speaker.role||"";
    const displaySpeakerLabel=displaySpeakerRole?`${displaySpeakerName} (${displaySpeakerRole})`:displaySpeakerName;
    const sourceVideoUrl=selected.originalVideoUrl||selected.url;
    const sourceChannelUrl=selected.channelUrl||"";
    const preparationStage=''', "selected speaker display metadata")
text = text.replace('<div className="mobile-video-byline"><strong>{selected.speakerName||speaker.name}</strong>', '<div className="mobile-video-byline"><strong>{displaySpeakerLabel}</strong>')
text = text.replace('<span className="cover-caption"><small>{selected.channel}</small><strong>{greekTitle(selected)}</strong></span>', '<span className="cover-caption"><small>{displaySpeakerLabel}</small><strong>{greekTitle(selected)}</strong></span>')

old_heading = '''<div className="video-heading"><div><small>{selected.channel} · {CATEGORY_LABELS[selected.category]} · Προβολές: {selected.views||0}</small><h1 className="player-greek-title">{isGreekTitle(selected.title)?selected.title:isGreekTitle(captions.title)?captions.title:"Βίντεο με ελληνικούς υπότιτλους"}</h1>{(selected.originalTitle||captions.originalTitle||englishTitle(selected))&&<a className="player-original-title" href={selected.url} target="_blank" rel="noreferrer" title="Άνοιγμα στο YouTube">{selected.originalTitle||captions.originalTitle||englishTitle(selected)}</a>}<p className="mobile-video-description">{mobileSummary(selected,captions)}</p><button className={`mobile-transcript-toggle ${transcriptOpen?"active":""}`} aria-pressed={transcriptOpen} onClick={()=>setTranscriptOpen(value=>!value)}><span aria-hidden="true">≡</span>{transcriptOpen?"Κλείσιμο κειμένου":"Κείμενο μεταγραφής"}</button><div className="speaker-row"><span>ΟΜΙΛΗΤΗΣ</span><strong>{selected.speakerName||speaker.name}</strong><i>{speaker.role}</i></div></div><div className="heading-actions"><button type="button" className="edit-video" onClick={()=>void requestEdit(selected)}><span aria-hidden="true">✎</span> Επεξεργασία</button><button aria-label="Αγαπημένο" className={`favorite ${selected.favorite?"active":""}`} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♥</button></div></div>'''
new_heading = '''<div className="video-heading"><div><small className="video-meta-kicker"><strong>{displaySpeakerName}</strong>{displaySpeakerRole&&<span> ({displaySpeakerRole})</span>}<span> · {CATEGORY_LABELS[selected.category]}</span></small><h1 className="player-greek-title">{isGreekTitle(selected.title)?selected.title:isGreekTitle(captions.title)?captions.title:"Βίντεο με ελληνικούς υπότιτλους"}</h1><div className="video-source-row"><span>ΠΗΓΗ</span>{sourceChannelUrl?<a href={sourceChannelUrl} target="_blank" rel="noreferrer" title="Άνοιγμα καναλιού στο YouTube">{selected.channel} ↗</a>:<strong>{selected.channel}</strong>}{(selected.originalTitle||captions.originalTitle||englishTitle(selected))&&<a href={sourceVideoUrl} target="_blank" rel="noreferrer" title="Άνοιγμα αρχικού βίντεο στο YouTube">{selected.originalTitle||captions.originalTitle||englishTitle(selected)} ↗</a>}</div><p className="mobile-video-description">{mobileSummary(selected,captions)}</p><button className={`mobile-transcript-toggle ${transcriptOpen?"active":""}`} aria-pressed={transcriptOpen} onClick={()=>setTranscriptOpen(value=>!value)}><span aria-hidden="true">≡</span>{transcriptOpen?"Κλείσιμο κειμένου":"Κείμενο μεταγραφής"}</button></div><div className="heading-actions"><button type="button" className="edit-video" onClick={()=>void requestEdit(selected)}><span aria-hidden="true">✎</span> Επεξεργασία</button><button aria-label="Αγαπημένο" className={`favorite ${selected.favorite?"active":""}`} onClick={()=>patchVideo(selected.id,{favorite:!selected.favorite})}>♥</button></div></div>'''
text = replace_once(text, old_heading, new_heading, "video heading redesign")
text = text.replace('<strong>{selected.speakerName||speaker.name}</strong><small>{speaker.role}</small>', '<strong>{displaySpeakerName}</strong><small>{displaySpeakerRole}</small>')

text = text.replace('patchVideo(editingVideo.id,{...patch,metadataVersion:3})', 'patchVideo(editingVideo.id,{...patch,metadataVersion:4})')
text = replace_once(text,
'''      speakerName:String(data.get("speakerName")||"").trim(),
      channel:String(data.get("channel")||video.channel).trim(),''',
'''      speakerName:String(data.get("speakerName")||"").trim(),
      speakerRole:String(data.get("speakerRole")||"").trim(),
      channel:String(data.get("channel")||video.channel).trim(),
      channelUrl:String(data.get("channelUrl")||"").trim(),
      originalVideoUrl:String(data.get("originalVideoUrl")||video.url).trim(),''', "edit metadata save")
text = replace_once(text,
'''    <div className="form-grid"><label>Γιατρός ή ομιλητής<input name="speakerName" defaultValue={video.speakerName||""}/></label><label>Κανάλι<input name="channel" defaultValue={video.channel}/></label></div>''',
'''    <div className="form-grid"><label>Γιατρός ή ομιλητής<input name="speakerName" defaultValue={video.speakerName||""}/></label><label>Ιδιότητα<input name="speakerRole" defaultValue={video.speakerRole||""} placeholder="π.χ. Neurologist"/></label></div>
    <div className="form-grid"><label>Κανάλι<input name="channel" defaultValue={video.channel}/></label><label>Link καναλιού<input name="channelUrl" type="url" defaultValue={video.channelUrl||""}/></label></div>
    <label>Original video link<input name="originalVideoUrl" type="url" defaultValue={video.originalVideoUrl||video.url}/></label>''', "edit metadata fields")

text = replace_once(text,
'''const [url,setUrl]=useState("");const [metadata,setMetadata]=useState<{id:string;title:string;originalTitle?:string;channel:string;duration?:number;description?:string;speakerName?:string;category?:Category;tags?:string[]}|null>(null);''',
'''const [url,setUrl]=useState("");const [metadata,setMetadata]=useState<{id:string;title:string;originalTitle?:string;channel:string;channelUrl?:string;originalVideoUrl?:string;duration?:number;description?:string;speakerName?:string;speakerRole?:string;category?:Category;tags?:string[]}|null>(null);''', "AddVideo metadata type")
text = replace_once(text,
'''const v:Video={id:metadata.id,url,title:metadata.title,originalTitle:metadata.originalTitle,channel:metadata.channel,speakerName:metadata.speakerName,category:String(fd.get("category")||metadata.category||"Other") as Category,tags:Array.from(new Set([...(metadata.tags||[]),...manualTags])),notes:String(fd.get("notes")||""),description:String(fd.get("notes")||metadata.description||"Νέο βίντεο στη βιβλιοθήκη."),duration:metadata.duration||0,addedAt:new Date().toISOString(),favorite:false,lastPosition:0,progress:0,metadataVersion:3};''',
'''const v:Video={id:metadata.id,url,title:metadata.title,originalTitle:metadata.originalTitle,channel:metadata.channel,channelUrl:metadata.channelUrl,originalVideoUrl:metadata.originalVideoUrl||url,speakerName:metadata.speakerName,speakerRole:metadata.speakerRole,category:String(fd.get("category")||metadata.category||"Other") as Category,tags:Array.from(new Set([...(metadata.tags||[]),...manualTags])),notes:String(fd.get("notes")||""),description:String(fd.get("notes")||metadata.description||"Νέο βίντεο στη βιβλιοθήκη."),duration:metadata.duration||0,addedAt:new Date().toISOString(),favorite:false,lastPosition:0,progress:0,metadataVersion:4};''', "AddVideo persisted metadata")
text = text.replace('{metadata.speakerName||metadata.channel} · {CATEGORY_LABELS[metadata.category||"Other"]}', '{metadata.speakerName||metadata.channel}{metadata.speakerRole?` (${metadata.speakerRole})`:""} · {CATEGORY_LABELS[metadata.category||"Other"]}')
path.write_text(text, encoding="utf-8")

# 3) Final CSS override: modern sans title + compact source hierarchy.
path = Path("app/content-areas-final.css")
text = path.read_text(encoding="utf-8")
append = r'''

/* ---- 6.6.17 speaker/source hierarchy: compact editorial metadata ---- */
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker{
  display:block!important;margin:0 0 7px!important;color:#aeb3bd!important;
  font-family:inherit!important;font-size:12px!important;line-height:1.4!important;font-weight:520!important;
  letter-spacing:.01em!important;text-transform:none!important;
}
html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker strong{
  color:#f1f2f5!important;font-weight:650!important;
}
html body .app-shell.app-shell.app-shell .video-heading .player-greek-title{
  margin:0!important;max-width:980px!important;color:#f6f3ec!important;
  font-family:inherit!important;font-size:clamp(24px,3vw,34px)!important;
  font-weight:650!important;line-height:1.16!important;letter-spacing:-.028em!important;
  text-wrap:balance!important;overflow-wrap:break-word!important;
}
html body .app-shell.app-shell.app-shell .video-source-row{
  display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:6px 10px!important;
  margin-top:12px!important;padding-top:10px!important;border-top:1px solid rgba(255,255,255,.08)!important;
  color:#8f949e!important;font-family:inherit!important;font-size:11.5px!important;line-height:1.45!important;
}
html body .app-shell.app-shell.app-shell .video-source-row>span{
  padding:3px 7px!important;border:1px solid rgba(124,116,224,.25)!important;border-radius:7px!important;
  background:rgba(124,116,224,.08)!important;color:#b9b4ef!important;font-size:9.5px!important;
  font-weight:700!important;letter-spacing:.08em!important;
}
html body .app-shell.app-shell.app-shell .video-source-row>a,
html body .app-shell.app-shell.app-shell .video-source-row>strong{
  min-width:0!important;color:#b9bdc6!important;font-weight:520!important;text-decoration:none!important;
}
html body .app-shell.app-shell.app-shell .video-source-row>a:last-child{
  flex:1 1 360px!important;overflow:hidden!important;color:#8f949e!important;text-overflow:ellipsis!important;white-space:nowrap!important;
}
html body .app-shell.app-shell.app-shell .video-source-row>a:hover{color:#d7d4f5!important}
html body .app-shell.app-shell.app-shell .speaker-row{display:none!important}

@media(max-width:620px){
  html body .app-shell.app-shell.app-shell .video-heading .video-meta-kicker{margin-bottom:6px!important;font-size:11.5px!important}
  html body .app-shell.app-shell.app-shell .video-heading .player-greek-title{
    font-size:clamp(21px,6.2vw,26px)!important;line-height:1.18!important;letter-spacing:-.022em!important;
  }
  html body .app-shell.app-shell.app-shell .video-source-row{gap:6px 8px!important;margin-top:10px!important;padding-top:9px!important;font-size:11px!important}
  html body .app-shell.app-shell.app-shell .video-source-row>a:last-child{
    flex-basis:100%!important;display:block!important;max-width:100%!important;
  }
}
'''
if "6.6.17 speaker/source hierarchy" not in text:
    text += append
path.write_text(text, encoding="utf-8")

print("Applied speaker metadata/source redesign 6.6.17")

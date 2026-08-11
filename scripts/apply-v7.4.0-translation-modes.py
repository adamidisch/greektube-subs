from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected block: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Client: two explicit modes, Google Fast and manual ChatGPT PRO import.
# Existing videos without a mode stay on the legacy 7.1.14 pipeline.
# ---------------------------------------------------------------------------
player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()

player = replace_once(
    player,
    'type Category = "Medical" | "Tech" | "Podcasts" | "Comedy" | "Education" | "Documentaries" | "Other";\n',
    'type Category = "Medical" | "Tech" | "Podcasts" | "Comedy" | "Education" | "Documentaries" | "Other";\n'
    'type TranslationMode = "legacy" | "google" | "manual-pro";\n',
    "translation mode type",
)

player = replace_once(
    player,
    '  speakerName?:string; speakerRole?:string; channelUrl?:string; originalVideoUrl?:string; views?:number; metadataVersion?:number;\n',
    '  speakerName?:string; speakerRole?:string; channelUrl?:string; originalVideoUrl?:string; views?:number; metadataVersion?:number;\n'
    '  translationMode?:TranslationMode;\n',
    "video translationMode field",
)

player = replace_once(
    player,
    '  {at:28,label:"Δόμηση και διόρθωση αγγλικού κειμένου"},\n',
    '  {at:28,label:"Δόμηση αγγλικού transcript"},\n',
    "generic preparation label",
)

player = replace_once(
    player,
    '  const [editRequest,setEditRequest]=useState<Video|null>(null);\n',
    '  const [editRequest,setEditRequest]=useState<Video|null>(null);\n'
    '  const [proImportVideo,setProImportVideo]=useState<Video|null>(null);\n',
    "PRO import state",
)

player = replace_once(
    player,
    '  async function openVideo(video:Video,start?:number,showTranscript=false,forceTranslation=false){\n'
    '    const knownPoints=transcriptHighlights(video.captions||[]);\n',
    '  async function openVideo(video:Video,start?:number,showTranscript=false,forceTranslation=false){\n'
    '    const translationMode:TranslationMode=video.translationMode||"legacy";\n'
    '    const knownPoints=transcriptHighlights(video.captions||[]);\n',
    "openVideo mode",
)

player = replace_once(
    player,
    'body:JSON.stringify({url:video.url,force:forceTranslation&&attempt===0}),signal:controller.signal',
    'body:JSON.stringify({url:video.url,force:forceTranslation&&attempt===0,translationMode}),signal:controller.signal',
    "captions POST mode",
)

player = replace_once(
    player,
    '    setLoading(false); setProgress(3); setCaptions(null);\n',
    '    if(translationMode==="manual-pro"&&!forceTranslation){\n'
    '      setLoading(false);setProgress(0);setCaptions(null);setProImportVideo(video);return;\n'
    '    }\n'
    '    setLoading(false); setProgress(3); setCaptions(null);\n',
    "manual PRO interception",
)

old_modal = '{modal&&<AddVideo existingIds={state.videos.map(video=>video.id)} close={()=>setModal(false)} add={async(video,translate)=>{const next={...stateRef.current,videos:[video,...stateRef.current.videos.filter(item=>item.id!==video.id)]};const saved=await saveStateToServer(next,false,true);if(!saved?.ok||!saved.sharedSaved)throw new Error(saved?.error||"Δεν αποθηκεύτηκε η κοινή βιβλιοθήκη.");setState(next);setModal(false);if(translate)await openVideo(video);}}/>}'
new_modal = '{modal&&<AddVideo existingIds={state.videos.map(video=>video.id)} close={()=>setModal(false)} add={async(video,translate,openProImport)=>{const next={...stateRef.current,videos:[video,...stateRef.current.videos.filter(item=>item.id!==video.id)]};const saved=await saveStateToServer(next,false,true);if(!saved?.ok||!saved.sharedSaved)throw new Error(saved?.error||"Δεν αποθηκεύτηκε η κοινή βιβλιοθήκη.");setState(next);setModal(false);if(openProImport){setProImportVideo(video);return;}if(translate)await openVideo(video);}}/>}'
player = replace_once(player, old_modal, new_modal, "AddVideo callback")

old_edit = '{editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:5});setEditingVideo(null);}}/>}'
new_edit = '{editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:5});setEditingVideo(null);}} importPro={()=>{const video=editingVideo;setEditingVideo(null);setProImportVideo(video);}}/>}\n    {proImportVideo&&<ProTranscriptImport video={proImportVideo} close={()=>setProImportVideo(null)} done={async result=>{localStorage.setItem(`greektube-transcript:${proImportVideo.id}:v12`,JSON.stringify(result));patchVideo(proImportVideo.id,{captions:result.cues,translationMode:"manual-pro",title:isGreekTitle(proImportVideo.title)?proImportVideo.title:result.title||proImportVideo.title,originalTitle:proImportVideo.originalTitle||result.originalTitle});const video={...proImportVideo,captions:result.cues,translationMode:"manual-pro" as TranslationMode};setProImportVideo(null);await openVideo(video);}}/>}'
player = replace_once(player, old_edit, new_edit, "PRO import modal render")

player = replace_once(player, 'ver 7.1.14', 'ver 7.4.0', "brand version")

player = replace_once(
    player,
    'function EditVideo({video,close,save,rebuild}:{video:Video;close:()=>void;save:(patch:Partial<Video>)=>void;rebuild?:()=>void}) {',
    'function EditVideo({video,close,save,rebuild,importPro}:{video:Video;close:()=>void;save:(patch:Partial<Video>)=>void;rebuild?:()=>void;importPro?:()=>void}) {',
    "EditVideo PRO callback signature",
)

player = replace_once(
    player,
    '    {rebuild&&<button type="button" className="secondary rebuild-translation" onClick={rebuild}>↻ Νέα μετάφραση από το αγγλικό πρωτότυπο</button>}\n',
    '    {rebuild&&<button type="button" className="secondary rebuild-translation" onClick={rebuild}>↻ Νέα μετάφραση από το αγγλικό πρωτότυπο</button>}\n'
    '    {importPro&&<button type="button" className="secondary pro-import-entry" onClick={importPro}>✦ Εισαγωγή PRO υποτίτλων</button>}\n',
    "EditVideo PRO button",
)

add_start = player.find('function AddVideo(')
if add_start < 0:
    raise SystemExit("AddVideo function not found")

new_tail = r'''function ProTranscriptImport({video,close,done}:{video:Video;close:()=>void;done:(captions:Captions)=>Promise<void>}) {
  const [subtitleText,setSubtitleText]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!subtitleText.trim()){setError("Επικόλλησε πρώτα τους έτοιμους ελληνικούς υπότιτλους.");return;}
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/manual-captions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:video.url,title:video.title,originalTitle:video.originalTitle||"",channel:video.channel,duration:video.duration||0,subtitleText})});
      const result=await response.json() as Captions&{error?:string};
      if(!response.ok)throw new Error(result.error||"Δεν έγινε η εισαγωγή των PRO υποτίτλων.");
      await done(result);
    }catch(problem){setError(problem instanceof Error?problem.message:"Δεν έγινε η εισαγωγή των PRO υποτίτλων.");}
    finally{setBusy(false);}
  }
  return <Modal title="PRO μετάφραση · ChatGPT" close={close}><form className="form pro-translation-form" onSubmit={submit}>
    <div className="pro-translation-intro"><span className="pro-badge">PRO</span><div><strong>Μετάφραση με πλήρες context</strong><p>Αντέγραψε το αγγλικό transcript μαζί με τα timestamps και στείλε μου το εδώ στο ChatGPT. Θα σου επιστρέψω ελληνικούς υπότιτλους με τα ίδια timestamps για άμεσο συγχρονισμό.</p></div></div>
    <div className="pro-flow" aria-label="Ροή PRO μετάφρασης"><span><b>01</b> Transcript + timestamps</span><i>→</i><span><b>02</b> Μετάφραση στο ChatGPT</span><i>→</i><span><b>03</b> Εισαγωγή εδώ</span></div>
    <label>Έτοιμοι ελληνικοί υπότιτλοι<textarea value={subtitleText} onChange={event=>{setSubtitleText(event.target.value);setError("")}} rows={14} spellCheck={false} placeholder={'1\n00:00:00,000 --> 00:00:03,400\nΗ ελληνική μετάφραση εδώ…\n\n2\n00:00:03,400 --> 00:00:07,100\nΗ επόμενη πρόταση…'}/></label>
    <small className="pro-format-note">Δέχεται SRT, VTT ή απλές γραμμές με timestamps. Τα timestamps παραμένουν ακριβώς συνδεδεμένα με το βίντεο.</small>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={close}>Ακύρωση</button><button className="primary" disabled={busy}>{busy?"Εισαγωγή…":"Εισαγωγή PRO υποτίτλων"}</button></div>
  </form></Modal>;
}

function AddVideo({close,add,existingIds}:{close:()=>void;add:(v:Video,t:boolean,openProImport?:boolean)=>Promise<void>;existingIds:string[]}) {
  const [url,setUrl]=useState("");
  const [metadata,setMetadata]=useState<{id:string;title:string;originalTitle?:string;channel:string;channelUrl?:string;originalVideoUrl?:string;duration?:number;description?:string;speakerName?:string;speakerRole?:string;category?:Category;tags?:string[]}|null>(null);
  const [mode,setMode]=useState<Exclude<TranslationMode,"legacy">>("google");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function inspect(){const id=extractId(url);if(!id){setError("Βάλε έναν έγκυρο σύνδεσμο YouTube.");return;}if(existingIds.includes(id)){setError("Αυτό το βίντεο υπάρχει ήδη στη βιβλιοθήκη.");return;}setBusy(true);setError("");try{const r=await fetch("/api/metadata",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});const j=await r.json();if(!r.ok)throw new Error(j.error);setMetadata(j);}catch(e){setError(e instanceof Error?e.message:"Σφάλμα");}finally{setBusy(false);}}
  async function submit(e:React.MouseEvent<HTMLButtonElement>,action:"save"|"prepare"){e.preventDefault();const form=e.currentTarget.form;if(!form||busy)return;if(!metadata){await inspect();return;}setBusy(true);setError("");try{const fd=new FormData(form);const manualTags=String(fd.get("tags")||"").split(",").map(x=>x.trim()).filter(Boolean);const v:Video={id:metadata.id,url,title:metadata.title,originalTitle:metadata.originalTitle,channel:metadata.channel,channelUrl:metadata.channelUrl,originalVideoUrl:metadata.originalVideoUrl||url,speakerName:metadata.speakerName,speakerRole:metadata.speakerRole,category:String(fd.get("category")||metadata.category||"Other") as Category,tags:Array.from(new Set([...(metadata.tags||[]),...manualTags])),notes:String(fd.get("notes")||""),description:String(fd.get("notes")||metadata.description||"Νέο βίντεο στη βιβλιοθήκη."),duration:metadata.duration||0,addedAt:new Date().toISOString(),favorite:false,lastPosition:0,progress:0,metadataVersion:5,translationMode:mode};if(action==="save")await add(v,false,false);else if(mode==="google")await add(v,true,false);else await add(v,false,true);}catch(problem){setError(problem instanceof Error?problem.message:"Δεν αποθηκεύτηκε το βίντεο.");}finally{setBusy(false);}}
  return <Modal title="Προσθήκη βίντεο" close={close}><form className="form add-video-v740"><label>Σύνδεσμος YouTube<div className="inspect-row"><input value={url} onChange={e=>{setUrl(e.target.value);setMetadata(null);setError("")}} placeholder="https://youtube.com/watch?v=…"/><button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?"Έλεγχος…":"Έλεγχος"}</button></div></label>{error&&<p className="form-error">{error}</p>}{metadata&&<div className="metadata"><img src={`https://i.ytimg.com/vi/${metadata.id}/hqdefault.jpg`} alt=""/><div><strong>{metadata.title}</strong>{metadata.originalTitle&&<small>{metadata.originalTitle}</small>}<span>{metadata.speakerName||metadata.channel}{metadata.speakerRole?` (${metadata.speakerRole})`:""} · {CATEGORY_LABELS[metadata.category||"Other"]} · {metadata.duration?clock(metadata.duration):"Διάρκεια υπό υπολογισμό"}</span></div></div>}
    <section className="translation-mode-section"><div className="translation-mode-heading"><span>ΤΡΟΠΟΣ ΜΕΤΑΦΡΑΣΗΣ</span><small>Διάλεξε ταχύτητα ή μέγιστη ποιότητα.</small></div><div className="translation-mode-grid">
      <button type="button" className={`translation-mode-card ${mode==="google"?"active":""}`} onClick={()=>setMode("google")}><span className="mode-icon">⚡</span><div><strong>Γρήγορη · Google</strong><small>ΑΥΤΟΜΑΤΗ</small><p>Έξυπνα contextual batches, ίδιο timing και πολύ λιγότερα provider calls.</p></div><i aria-hidden="true">{mode==="google"?"✓":""}</i></button>
      <button type="button" className={`translation-mode-card pro ${mode==="manual-pro"?"active":""}`} onClick={()=>setMode("manual-pro")}><span className="mode-icon">✦</span><div><strong>PRO · ChatGPT</strong><small>ΜΕΓΙΣΤΗ ΠΟΙΟΤΗΤΑ</small><p>Μεταφράζουμε εδώ με πλήρες context και εισάγουμε έτοιμους timed υπότιτλους.</p></div><i aria-hidden="true">{mode==="manual-pro"?"✓":""}</i></button>
    </div></section>
    <div className="form-grid"><label>Κατηγορία<select name="category" key={metadata?.category||"Other"} defaultValue={metadata?.category||"Other"}>{CATEGORIES.slice(1).map(c=><option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label><label>Ετικέτες<input name="tags" defaultValue={metadata?.tags?.join(", ")||""} placeholder="υγεία, ινσουλίνη"/></label></div><label>Προσωπικές σημειώσεις<textarea name="notes" placeholder="Γιατί θέλω να κρατήσω αυτό το βίντεο…"/></label><div className="modal-actions"><button className="secondary" disabled={busy} onClick={e=>void submit(e,"save")}>Αποθήκευση μόνο</button><button className="primary" disabled={busy} onClick={e=>void submit(e,"prepare")}>{busy?"Αποθήκευση…":mode==="google"?"Αποθήκευση και γρήγορη μετάφραση":"Αποθήκευση και εισαγωγή PRO"}</button></div></form></Modal>;
}
'''
player = player[:add_start] + new_tail
player_path.write_text(player)


# ---------------------------------------------------------------------------
# Captions API: preserve legacy mode and add a Google-only fast path.
# ---------------------------------------------------------------------------
route_path = Path("app/api/captions/route.ts")
route = route_path.read_text()

route = replace_once(
    route,
    'type CaptionCue = {\n  start: number;\n  duration: number;\n  text: string;\n};\n',
    'type CaptionCue = {\n  start: number;\n  duration: number;\n  text: string;\n};\n\ntype TranslationMode = "legacy" | "google";\n',
    "API translation mode type",
)

route = replace_once(
    route,
    'async function prepareEnglishTimedChunk(raw: CaptionCue[], start: number, count: number) {',
    'async function prepareEnglishTimedChunk(raw: CaptionCue[], start: number, count: number, useGroqRepair = true) {',
    "repair function mode",
)
chunk_pos = route.find('async function prepareEnglishTimedChunk(')
repair_pos = route.find('  const repaired = await repairEnglishBatchWithGroq(batch);', chunk_pos)
if repair_pos < 0:
    raise SystemExit("prepareEnglishTimedChunk repair call missing")
route = route[:repair_pos] + '  const repaired = useGroqRepair ? await repairEnglishBatchWithGroq(batch) : null;' + route[repair_pos + len('  const repaired = await repairEnglishBatchWithGroq(batch);'):]

route = replace_once(
    route,
    '  groqCooldownUntil: string | null | undefined,\n  cues: CaptionCue[],\n',
    '  groqCooldownUntil: string | null | undefined,\n  translationMode: TranslationMode,\n  cues: CaptionCue[],\n',
    "translateCheckpointBatch mode arg",
)

route = replace_once(
    route,
    '    if (path.startsWith("google-placeholder")) telemetry.googleFallbackCues += 1;\n',
    '    if (path.startsWith("google")) telemetry.googleFallbackCues += 1;\n',
    "Google telemetry paths",
)

fast_anchor = '  if (!slice.length) return telemetry;\n  const output = new Map<number, string>();\n  let groqFailure: string | null = null;\n'
fast_block = '''  if (!slice.length) return telemetry;\n  const output = new Map<number, string>();\n\n  // v7.4.0 Fast mode: one Google request sees a short window of neighbouring\n  // cues for context. Every cue is still validated and durably committed in\n  // order. Any cue rejected by the batch falls back to the protected-token\n  // Google path before the checkpoint may advance.\n  if (translationMode === "google") {\n    let batchResults: Map<number, string> | null = null;\n    const googleBatchStartedAt = Date.now();\n    try {\n      batchResults = await translateMeaningBatch(numbered);\n    } catch (error) {\n      console.warn("[captions:google-batch-failed]", JSON.stringify({\n        videoId, start, cues: numbered.length, error: error instanceof Error ? error.message : "Google batch failed",\n      }));\n    } finally {\n      telemetry.googleMs += Date.now() - googleBatchStartedAt;\n    }\n\n    for (const [offset, item] of numbered.entries()) {\n      const sourceWordTokens = englishWordTokens(item.text);\n      if (!hasTranslatableWordTokens(sourceWordTokens, translationProtectedTokens(item.text))) {\n        const passthrough = item.text.trim();\n        const passthroughReason = translationIntegrityFailure(item.text, passthrough);\n        if (passthroughReason) throw new Error(`Translation passthrough integrity failed for cue: ${item.index}`);\n        output.set(item.index, passthrough);\n        await commitAcceptedCue({ ...slice[offset], text: passthrough }, item.index, "passthrough");\n        continue;\n      }\n\n      const batchCandidate = batchResults?.get(item.index) || null;\n      const batchReason = batchCandidate ? translationIntegrityFailure(item.text, batchCandidate) : "google-batch-missing-cue";\n      if (!batchReason && batchCandidate) {\n        output.set(item.index, batchCandidate);\n        await commitAcceptedCue({ ...slice[offset], text: batchCandidate }, item.index, "google-batch");\n        continue;\n      }\n      if (batchCandidate) logRejectedTranslationCue(videoId, item.index, item.text, "google-batch", batchCandidate, batchReason);\n\n      const googleStartedAt = Date.now();\n      try {\n        const google = await translateSingleCueWithProtectedGoogleFallback(item.text);\n        if (google.restorationFailure || !google.restoredCandidate) {\n          throw new Error(google.restorationFailure || "placeholder-restoration-failed");\n        }\n        const googleReason = translationIntegrityFailure(item.text, google.restoredCandidate);\n        if (googleReason) {\n          logRejectedTranslationCue(videoId, item.index, item.text, "google-protected", google.candidate, googleReason, google.restoredCandidate);\n          throw new Error(googleReason);\n        }\n        output.set(item.index, google.restoredCandidate);\n        await commitAcceptedCue({ ...slice[offset], text: google.restoredCandidate }, item.index, "google-protected");\n      } finally {\n        telemetry.googleMs += Date.now() - googleStartedAt;\n      }\n    }\n    return telemetry;\n  }\n\n  let groqFailure: string | null = null;\n'''
route = replace_once(route, fast_anchor, fast_block, "Google fast translation branch")

route = replace_once(
    route,
    '    const body = (await request.json()) as { url?: unknown; force?: unknown; cachedTranscript?: ClientCachedTranscript };\n',
    '    const body = (await request.json()) as { url?: unknown; force?: unknown; cachedTranscript?: ClientCachedTranscript; translationMode?: unknown };\n',
    "POST body mode",
)

route = replace_once(
    route,
    '    const force = body.force === true;\n',
    '    const force = body.force === true;\n'
    '    if (body.translationMode === "manual-pro") {\n'
    '      return NextResponse.json({ error: "Η PRO μετάφραση εισάγεται από το εργαλείο PRO και δεν εκτελεί αυτόματη μετάφραση." }, { status: 409 });\n'
    '    }\n'
    '    const translationMode: TranslationMode = body.translationMode === "google" ? "google" : "legacy";\n',
    "mode resolution",
)

route = replace_once(
    route,
    '        const chunk = await prepareEnglishTimedChunk(raw, cursor, CHUNK);\n',
    '        const chunk = await prepareEnglishTimedChunk(raw, cursor, CHUNK, translationMode === "legacy");\n',
    "fast mode skips Groq repair",
)

route = replace_once(
    route,
    '      const CHUNK = 4;\n',
    '      const CHUNK = translationMode === "google" ? 12 : 4;\n',
    "translation chunk size",
)

route = replace_once(
    route,
    '        await translateCheckpointBatch(videoId, translationLockToken, cached.groqCooldownUntil, english, cursor, CHUNK,\n',
    '        await translateCheckpointBatch(videoId, translationLockToken, cached.groqCooldownUntil, translationMode, english, cursor, CHUNK,\n',
    "translation mode call",
)

route = replace_once(
    route,
    '      return NextResponse.json({ ...payload, title: translatedTitle, translationMethod: "resumable_repaired_timed_v8", cached: false });\n',
    '      return NextResponse.json({ ...payload, title: translatedTitle, translationMethod: translationMode === "google" ? "google_fast_context_v1" : "resumable_repaired_timed_v8", cached: false });\n',
    "translation method response",
)
route_path.write_text(route)


# ---------------------------------------------------------------------------
# Manual PRO subtitle parser + authenticated import endpoint.
# ---------------------------------------------------------------------------
manual_dir = Path("app/api/manual-captions")
manual_dir.mkdir(parents=True, exist_ok=True)

(manual_dir / "parser.ts").write_text(r'''export type ManualCue = { start: number; duration: number; text: string };

function timestampSeconds(value: string) {
  const normalized = value.trim().replace(/,/g, ".").replace(/^\[|\]$/g, "");
  const parts = normalized.split(":").map(Number);
  if (parts.some(part => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function cleanText(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalize(cues: { start: number; end?: number; text: string }[]) {
  const result: ManualCue[] = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const next = cues[index + 1];
    if (!Number.isFinite(cue.start) || cue.start < 0 || !cue.text.trim()) continue;
    const suppliedEnd = Number.isFinite(cue.end) ? cue.end as number : null;
    const nextStart = next && Number.isFinite(next.start) && next.start > cue.start ? next.start : null;
    let end = suppliedEnd && suppliedEnd > cue.start ? suppliedEnd : (nextStart ?? cue.start + 4);
    if (nextStart !== null) end = Math.min(end, nextStart);
    if (end <= cue.start) end = cue.start + 0.25;
    result.push({ start: cue.start, duration: Math.max(0.25, end - cue.start), text: cleanText(cue.text) });
  }
  return result;
}

export function parseManualSubtitleText(input: string) {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [] as ManualCue[];
  const lines = text.split("\n");
  const ranged: { start: number; end?: number; text: string }[] = [];
  let active: { start: number; end?: number; text: string } | null = null;

  const rangePattern = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*(?:\|\s*)?(.*)$/;
  const flush = () => {
    if (active && cleanText(active.text)) ranged.push({ ...active, text: cleanText(active.text) });
    active = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const range = line.match(rangePattern);
    if (range) {
      flush();
      const start = timestampSeconds(range[1]);
      const end = timestampSeconds(range[2]);
      if (start !== null && end !== null && end > start) active = { start, end, text: range[3] || "" };
      continue;
    }
    if (!active) {
      if (!line || /^WEBVTT$/i.test(line) || /^\d+$/.test(line) || /^NOTE\b/i.test(line)) continue;
      continue;
    }
    if (!line) { flush(); continue; }
    if (!/^\d+$/.test(line)) active.text = `${active.text} ${line}`.trim();
  }
  flush();
  if (ranged.length) return normalize(ranged);

  // Fallback for the common YouTube transcript copy format: a timestamp line
  // followed by one or more text lines. Durations are derived from the next
  // timestamp so the imported transcript remains synchronized without guessing
  // arbitrary fixed windows between cues.
  const starts: { start: number; text: string }[] = [];
  let current: { start: number; text: string } | null = null;
  const startPattern = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*(?:\|\s*)?(.*)$/;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(startPattern);
    if (match) {
      const start = timestampSeconds(match[1]);
      if (start !== null) {
        if (current && cleanText(current.text)) starts.push({ ...current, text: cleanText(current.text) });
        current = { start, text: match[2] || "" };
        continue;
      }
    }
    if (current && !/^\d+$/.test(line)) current.text = `${current.text} ${line}`.trim();
  }
  if (current && cleanText(current.text)) starts.push({ ...current, text: cleanText(current.text) });
  return normalize(starts);
}
''')

(manual_dir / "route.ts").write_text(r'''import { NextResponse } from "next/server";
import { acquireProcessingLock, completeTranscript, getTranscript, releaseProcessingLock, TRANSCRIPT_VERSION } from "../shared-cache";
import { parseManualSubtitleText } from "./parser";

const ADMIN_COOKIE = "greektube-admin";
const SESSION_MESSAGE = "greektube-edit-authorized";

async function sessionToken(password: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_MESSAGE));
  return Array.from(new Uint8Array(signature)).map(value => value.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorized(request: Request) {
  const password = String(process.env.ADMIN_EDIT_PASSWORD || "");
  if (!password) return false;
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1) || "";
  return safeEqual(cookie, await sessionToken(password));
}

function videoIdFrom(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.replace(/^www\./, "") === "youtu.be") return url.pathname.split("/")[1] || null;
    return url.searchParams.get("v");
  } catch { return null; }
}

function greekRatio(text: string) {
  const letters = text.match(/\p{L}/gu)?.length || 0;
  const greek = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters ? greek / letters : 0;
}

function keyPoints(cues: { text: string }[]) {
  const step = Math.max(1, Math.floor(cues.length / 10));
  return cues.filter((_, index) => index % step === 0).map(cue => cue.text.replace(/\s+/g, " ").trim()).filter((text, index, all) => text.length > 18 && all.indexOf(text) === index).slice(0, 10);
}

export async function POST(request: Request) {
  if (!await authorized(request)) return NextResponse.json({ error: "Η εισαγωγή PRO υποτίτλων απαιτεί εξουσιοδότηση διαχειριστή." }, { status: 401 });
  let lockToken: string | null = null;
  let videoId: string | null = null;
  try {
    const body = await request.json() as { url?: unknown; title?: unknown; originalTitle?: unknown; channel?: unknown; duration?: unknown; subtitleText?: unknown };
    if (typeof body.url !== "string" || typeof body.subtitleText !== "string") return NextResponse.json({ error: "Λείπει το βίντεο ή το κείμενο υποτίτλων." }, { status: 400 });
    if (body.subtitleText.length > 2_000_000) return NextResponse.json({ error: "Το αρχείο υποτίτλων είναι υπερβολικά μεγάλο." }, { status: 413 });
    videoId = videoIdFrom(body.url);
    if (!videoId) return NextResponse.json({ error: "Δεν αναγνωρίζω αυτό το YouTube link." }, { status: 400 });

    const cues = parseManualSubtitleText(body.subtitleText);
    if (cues.length < 3) return NextResponse.json({ error: "Δεν βρέθηκαν αρκετά έγκυρα timed cues. Χρησιμοποίησε SRT, VTT ή transcript με timestamps." }, { status: 400 });
    const combined = cues.slice(0, 150).map(cue => cue.text).join(" ");
    if (greekRatio(combined) < 0.2) return NextResponse.json({ error: "Το κείμενο δεν φαίνεται να περιέχει ολοκληρωμένη ελληνική μετάφραση." }, { status: 400 });
    const ordered = cues.every((cue, index) => cue.start >= 0 && cue.duration > 0 && (index === 0 || cue.start >= cues[index - 1].start));
    if (!ordered) return NextResponse.json({ error: "Τα timestamps δεν είναι σε σωστή σειρά." }, { status: 400 });

    const existing = await getTranscript(videoId);
    lockToken = crypto.randomUUID();
    if (!await acquireProcessingLock(videoId, lockToken, true)) return NextResponse.json({ error: "Το βίντεο επεξεργάζεται ήδη. Δοκίμασε ξανά σε λίγο." }, { status: 409 });

    const now = new Date().toISOString();
    const suppliedDuration = Number(body.duration || 0);
    const cueDuration = cues.reduce((max, cue) => Math.max(max, cue.start + cue.duration), 0);
    const duration = Number.isFinite(suppliedDuration) && suppliedDuration > 0 ? Math.max(suppliedDuration, cueDuration) : cueDuration;
    const existingEnglish = existing?.englishTranscript || [];
    const alignedEnglish = existingEnglish.length === cues.length && existingEnglish.every((cue, index) => Math.abs(cue.start - cues[index].start) < 0.05) ? existingEnglish : [];
    const points = keyPoints(cues);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : (existing?.title || "YouTube video");
    const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : (existing?.channel || "YouTube");

    const record = {
      videoId,
      title,
      channel,
      thumbnail: existing?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration,
      originalLanguage: "en",
      rawEnglishTranscript: existing?.rawEnglishTranscript || [],
      englishTranscript: alignedEnglish,
      greekTranscript: cues,
      timestamps: cues.map(cue => ({ start: cue.start, duration: cue.duration })),
      topics: existing?.topics || [],
      keyPoints: points,
      status: "ready" as const,
      progress: 100,
      transcriptVersion: TRANSCRIPT_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (!await completeTranscript(record, lockToken)) throw new Error("Η αποθήκευση των PRO υποτίτλων δεν ολοκληρώθηκε.");
    lockToken = null;

    return NextResponse.json({
      status: "ready", progress: 100, videoId, title,
      originalTitle: typeof body.originalTitle === "string" ? body.originalTitle : "",
      channel, duration, sourceLanguage: "en", cues, englishCues: alignedEnglish,
      keyPoints: points, topics: record.topics, transcriptVersion: TRANSCRIPT_VERSION,
      translationMethod: "manual_chatgpt_pro_v1", cached: false,
    });
  } catch (error) {
    if (videoId && lockToken) await releaseProcessingLock(videoId, lockToken).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Η εισαγωγή PRO υποτίτλων απέτυχε." }, { status: 500 });
  }
}
''')

Path("scripts/manual-captions-parser.test.mjs").write_text(r'''import assert from "node:assert/strict";
import { parseManualSubtitleText } from "../app/api/manual-captions/parser.ts";

const srt = parseManualSubtitleText(`1\n00:00:01,000 --> 00:00:04,500\nΗ πρώτη πρόταση.\n\n2\n00:00:04,500 --> 00:00:07,000\nΗ δεύτερη πρόταση.`);
assert.equal(srt.length, 2);
assert.equal(srt[0].start, 1);
assert.equal(srt[0].duration, 3.5);
assert.equal(srt[0].text, "Η πρώτη πρόταση.");

const vtt = parseManualSubtitleText(`WEBVTT\n\n00:00:02.000 --> 00:00:05.000\nΠρώτη γραμμή\nδεύτερη γραμμή\n\n00:00:05.000 --> 00:00:08.250\nΕπόμενο cue`);
assert.equal(vtt.length, 2);
assert.equal(vtt[0].text, "Πρώτη γραμμή δεύτερη γραμμή");
assert.equal(vtt[1].duration, 3.25);

const youtube = parseManualSubtitleText(`0:10\nΑρχή πρότασης\n0:13\nΣυνέχεια\n0:18\nΤέλος`);
assert.equal(youtube.length, 3);
assert.equal(youtube[0].start, 10);
assert.equal(youtube[0].duration, 3);
assert.equal(youtube[1].duration, 5);
assert.equal(youtube[2].duration, 4);

const inline = parseManualSubtitleText(`[00:00:01.000 --> 00:00:03.000] Μία γραμμή\n[00:00:03.000 --> 00:00:05.000] Δεύτερη γραμμή`);
assert.equal(inline.length, 2);
assert.equal(inline[0].text, "Μία γραμμή");

console.log("manual caption parser regression checks passed");
''')


# ---------------------------------------------------------------------------
# Premium mode UI, deliberately isolated in a new release stylesheet.
# ---------------------------------------------------------------------------
Path("app/v7-4-0.css").write_text(r'''.translation-mode-section{display:grid;gap:10px;margin:4px 0 2px}.translation-mode-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.translation-mode-heading>span{font-size:10px;letter-spacing:.13em;font-weight:760;color:var(--muted,#9ca3af)}.translation-mode-heading>small{font-size:11px;color:var(--muted,#8f96a3)}.translation-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.translation-mode-card{position:relative;display:grid;grid-template-columns:34px 1fr 20px;align-items:start;gap:10px;min-height:114px;padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:rgba(255,255,255,.025);color:inherit;text-align:left;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease}.translation-mode-card:hover{transform:translateY(-1px);border-color:rgba(142,124,255,.34);background:rgba(255,255,255,.04)}.translation-mode-card.active{border-color:rgba(142,124,255,.68);background:linear-gradient(145deg,rgba(116,91,255,.13),rgba(255,255,255,.025));box-shadow:inset 0 0 0 1px rgba(142,124,255,.08)}.translation-mode-card.pro.active{border-color:rgba(116,211,153,.56);background:linear-gradient(145deg,rgba(72,187,120,.1),rgba(255,255,255,.025))}.translation-mode-card .mode-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:rgba(255,255,255,.06);font-size:16px}.translation-mode-card>div{display:grid;gap:4px}.translation-mode-card strong{font-size:13px;line-height:1.25}.translation-mode-card small{width:max-content;padding:2px 6px;border-radius:999px;background:rgba(142,124,255,.12);font-size:8px;letter-spacing:.09em;color:#c7beff}.translation-mode-card.pro small{background:rgba(72,187,120,.1);color:#a9e9c2}.translation-mode-card p{margin:2px 0 0;font-size:11px;line-height:1.45;color:var(--muted,#9ba2ae)}.translation-mode-card>i{display:grid;place-items:center;width:20px;height:20px;border:1px solid rgba(255,255,255,.12);border-radius:50%;font-size:10px;font-style:normal;color:#fff}.translation-mode-card.active>i{border-color:transparent;background:#7664df}.translation-mode-card.pro.active>i{background:#3f9f68}.pro-translation-form{max-width:720px}.pro-translation-intro{display:flex;gap:12px;padding:14px;border:1px solid rgba(116,211,153,.18);border-radius:15px;background:rgba(72,187,120,.055)}.pro-translation-intro .pro-badge{align-self:flex-start;padding:4px 7px;border-radius:7px;background:rgba(72,187,120,.14);font-size:9px;font-weight:800;letter-spacing:.12em;color:#a9e9c2}.pro-translation-intro div{display:grid;gap:4px}.pro-translation-intro strong{font-size:13px}.pro-translation-intro p{margin:0;font-size:11px;line-height:1.55;color:var(--muted,#9ba2ae)}.pro-flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:8px}.pro-flow span{display:flex;align-items:center;gap:7px;padding:9px 10px;border:1px solid rgba(255,255,255,.07);border-radius:11px;font-size:10px;color:var(--muted,#a4a9b3)}.pro-flow b{font-size:9px;color:#a99dff}.pro-flow i{font-style:normal;color:#5f6672}.pro-translation-form textarea{min-height:260px;font-family:var(--font-geist-mono),monospace;font-size:11px;line-height:1.55}.pro-format-note{font-size:10px;line-height:1.45;color:var(--muted,#8f96a3)}.pro-import-entry{margin-top:2px}
@media(max-width:700px){.translation-mode-heading{align-items:flex-start;flex-direction:column;gap:3px}.translation-mode-grid{grid-template-columns:1fr}.translation-mode-card{min-height:0}.pro-flow{grid-template-columns:1fr}.pro-flow>i{display:none}.pro-translation-form textarea{min-height:220px}.add-video-v740 .modal-actions{display:grid;grid-template-columns:1fr}.add-video-v740 .modal-actions button{width:100%}}
''')

layout_path = Path("app/layout.tsx")
layout = layout_path.read_text()
layout = replace_once(layout, 'import "./release-6.6.15.css";\n', 'import "./release-6.6.15.css";\nimport "./v7-4-0.css";\n', "v7.4.0 stylesheet import")
layout = layout.replace('"codex-preview": "fix-v7.1.13-sequential-timing"', '"codex-preview": "v7.4.0-dual-translation-modes"')
layout = layout.replace('"app-version": "7.1.13"', '"app-version": "7.4.0"')
layout_path.write_text(layout)

package_path = Path("package.json")
package = json.loads(package_path.read_text())
if package.get("version") != "7.1.14":
    raise SystemExit(f"Unexpected package version: {package.get('version')}")
package["version"] = "7.4.0"
package.setdefault("scripts", {})["test:manual-captions"] = "node --experimental-strip-types scripts/manual-captions-parser.test.mjs"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")

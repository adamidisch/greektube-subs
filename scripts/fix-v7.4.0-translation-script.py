from pathlib import Path

path = Path("scripts/apply-v7.4.0-translation-modes.py")
text = path.read_text()

old = 'player = player[:add_start] + new_tail\nplayer_path.write_text(player)'
new = '''settings_start = player.find('\\nfunction SettingsPage(', add_start)\nif settings_start < 0:\n    raise SystemExit("SettingsPage marker not found after AddVideo")\nplayer = player[:add_start] + new_tail.rstrip() + "\\n\\n" + player[settings_start + 1:]\n\nviewer_old = '{editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:5});setEditingVideo(null);}} rebuild={()=>void rebuildTranslation(editingVideo)}/>}'\nviewer_new = '{editingVideo&&<EditVideo video={editingVideo} close={()=>setEditingVideo(null)} save={patch=>{patchVideo(editingVideo.id,{...patch,metadataVersion:5});setEditingVideo(null);}} rebuild={()=>void rebuildTranslation(editingVideo)} importPro={()=>{const video=editingVideo;setEditingVideo(null);setProImportVideo(video);}}/>}\\n      {proImportVideo&&<ProTranscriptImport video={proImportVideo} close={()=>setProImportVideo(null)} done={async result=>{localStorage.setItem(`greektube-transcript:${proImportVideo.id}:v12`,JSON.stringify(result));patchVideo(proImportVideo.id,{captions:result.cues,translationMode:"manual-pro",title:isGreekTitle(proImportVideo.title)?proImportVideo.title:result.title||proImportVideo.title,originalTitle:proImportVideo.originalTitle||result.originalTitle});const video={...proImportVideo,captions:result.cues,translationMode:"manual-pro" as TranslationMode};setProImportVideo(null);await openVideo(video);}}/>}'\nplayer = replace_once(player, viewer_old, viewer_new, "viewer PRO import modal")\nplayer_path.write_text(player)'''
if old not in text:
    raise SystemExit("Could not find AddVideo tail replacement in apply script")
text = text.replace(old, new, 1)

text = text.replace(
    'logRejectedTranslationCue(videoId, item.index, item.text, "google-batch", batchCandidate, batchReason);',
    'logRejectedTranslationCue(videoId, item.index, item.text, "google-batch", batchCandidate, batchReason || "google-batch-invalid");',
    1,
)

text = text.replace(
    'const existingEnglish = existing?.englishTranscript || [];',
    'const existingEnglish = (existing?.englishTranscript || []) as { start: number; duration: number; text: string }[];',
    1,
)

path.write_text(text)

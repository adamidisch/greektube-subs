from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing replacement target: {label}")
    return text.replace(old, new, 1)

# 1) Reusable English filler cleanup + contextual cue grouping.
p = Path("app/api/captions/translation-text.ts")
p.write_text('''export function hasTranslatableWordTokens(tokens: string[], protectedTokens: string[]) {\n  const protectedSet = new Set(protectedTokens.map(token => token.toLowerCase()));\n  return tokens.some(token => /\\p{L}/u.test(token) && !protectedSet.has(token.toLowerCase()));\n}\n\nexport function stripEnglishSpeechFillers(text: string) {\n  return text\n    .replace(/(^|[^\\p{L}\\p{N}])(?:u+m+|u+h+|e+r+m+|h+m+|a+h+)(?=$|[^\\p{L}\\p{N}])/giu, "$1")\n    .replace(/^[,;:]+\\s*/, "")\n    .replace(/\\s+([,.;:!?…])/g, "$1")\n    .replace(/([,;:])\\s*\\1+/g, "$1")\n    .replace(/\\s+/g, " ")\n    .trim();\n}\n\nexport type ContextCue = { start: number; duration: number; text: string };\n\nexport function groupEnglishCuesForContext(\n  cues: ContextCue[],\n  options: { maxCues?: number; maxChars?: number; maxDuration?: number; maxGap?: number } = {},\n) {\n  const maxCues = options.maxCues ?? 4;\n  const maxChars = options.maxChars ?? 120;\n  const maxDuration = options.maxDuration ?? 7.5;\n  const maxGap = options.maxGap ?? 0.8;\n  const result: ContextCue[] = [];\n  let block: ContextCue[] = [];\n\n  const flush = () => {\n    if (!block.length) return;\n    const first = block[0];\n    const last = block[block.length - 1];\n    const end = Math.max(first.start + first.duration, last.start + last.duration);\n    result.push({\n      start: first.start,\n      duration: Math.max(0.1, end - first.start),\n      text: block.map(cue => cue.text).join(" ").replace(/\\s+/g, " ").trim(),\n    });\n    block = [];\n  };\n\n  for (const cue of cues) {\n    const clean = stripEnglishSpeechFillers(cue.text);\n    if (!clean) continue;\n    const next = { ...cue, text: clean };\n    if (!block.length) { block.push(next); continue; }\n\n    const first = block[0];\n    const previous = block[block.length - 1];\n    const currentText = block.map(item => item.text).join(" ");\n    const gap = Math.max(0, next.start - (previous.start + previous.duration));\n    const projectedEnd = Math.max(previous.start + previous.duration, next.start + next.duration);\n    const projectedDuration = projectedEnd - first.start;\n    const sentenceComplete = /[.!?][\\\"'’”)]*$/.test(currentText.trim());\n    const shouldBreak = sentenceComplete || gap > maxGap || block.length >= maxCues ||\n      projectedDuration > maxDuration || `${currentText} ${next.text}`.length > maxChars;\n    if (shouldBreak) flush();\n    block.push(next);\n  }\n  flush();\n  return result;\n}\n''')

# 2) Backend: durable Google mode, semantic grouping, safe fillers and indefinite transient recovery.
p = Path("app/api/captions/route.ts")
s = p.read_text()
s = replace_once(s,
    'import { hasTranslatableWordTokens } from "./translation-text";',
    'import { groupEnglishCuesForContext, hasTranslatableWordTokens, stripEnglishSpeechFillers } from "./translation-text";',
    'translation-text import')
s = replace_once(s,
    '  recordTransientProcessingFailure,\n',
    '  recordRecoverableProcessingFailure,\n',
    'recoverable import')
s = s.replace('χ+μ{2,}', 'χ+μ+', 1)
s = replace_once(s,
    '    splitEnglishCueAtSentenceBoundaries({ ...cue, text: repaired.get(index) || cue.text }),',
    '    splitEnglishCueAtSentenceBoundaries({ ...cue, text: stripEnglishSpeechFillers(repaired.get(index) || cue.text) }),',
    'batch filler cleanup')
s = replace_once(s,
'''    return splitEnglishCueAtSentenceBoundaries({\n      ...cue,\n      text: repaired?.get(absolute) || cue.text.replace(/\\s+/g, " ").trim(),\n    });''',
'''    return splitEnglishCueAtSentenceBoundaries({\n      ...cue,\n      text: stripEnglishSpeechFillers(repaired?.get(absolute) || cue.text.replace(/\\s+/g, " ").trim()),\n    });''',
    'chunk filler cleanup')
anchor = '''async function prepareEnglishTimedChunk(raw: CaptionCue[], start: number, count: number, useGroqRepair = true) {\n'''
idx = s.index(anchor)
end_marker = '\n}\n\ntype TranslationSliceTelemetry = {'
end = s.index(end_marker, idx)
existing = s[idx:end+3]
addition = existing + '''\nasync function prepareGoogleEnglishTimedChunk(raw: CaptionCue[], start: number, count: number) {\n  const slice = effectiveSequentialRawWindows(raw).slice(start, start + count)\n    .map(cue => ({ ...cue, text: stripEnglishSpeechFillers(cue.text.replace(/\\s+/g, " ").trim()) }))\n    .filter(cue => cue.text.length > 0);\n  return groupEnglishCuesForContext(slice, { maxCues: 4, maxChars: 120, maxDuration: 7.5, maxGap: 0.8 });\n}\n'''
s = s[:idx] + addition + s[end+3:]

stage_helpers = '''\nfunction baseProcessingStage(stage: string | null | undefined) {\n  const value = stage || "source";\n  return value.endsWith("_google") ? value.slice(0, -7) : value;\n}\n\nfunction modeFromProcessingStage(stage: string | null | undefined, fallback: TranslationMode): TranslationMode {\n  return stage?.endsWith("_google") ? "google" : fallback;\n}\n\nfunction processingStageForMode(stage: string, mode: TranslationMode) {\n  return mode === "google" && (stage === "repair" || stage === "translate" || stage === "finalize")\n    ? `${stage}_google`\n    : stage;\n}\n'''
s = replace_once(s,
    '\nfunction processingTelemetry(record: NonNullable<Awaited<ReturnType<typeof getTranscript>>>) {',
    stage_helpers + '\nfunction processingTelemetry(record: NonNullable<Awaited<ReturnType<typeof getTranscript>>>) {',
    'stage helpers')
s = replace_once(s,
'''  const persistedStage = record.processingStage || "source";\n  const stage = record.rawEnglishTranscript.length && persistedStage === "source" ? "repair" : persistedStage;''',
'''  const persistedStage = record.processingStage || "source";\n  const stage = baseProcessingStage(record.rawEnglishTranscript.length && persistedStage === "source" ? "repair" : persistedStage);''',
    'telemetry stage normalize')
s = replace_once(s,
'''    const translationMode: TranslationMode = body.translationMode === "google" ? "google" : "legacy";\n    let cached = await getTranscript(videoId);''',
'''    const requestedTranslationMode: TranslationMode = body.translationMode === "google" ? "google" : "legacy";\n    let cached = await getTranscript(videoId);\n    let translationMode = modeFromProcessingStage(cached?.processingStage, requestedTranslationMode);''',
    'requested mode')
s = replace_once(s,
'''    let stage = cached?.rawEnglishTranscript?.length\n      ? (cached.processingStage && cached.processingStage !== "source" ? cached.processingStage : "repair")\n      : (cached?.processingStage || "source");\n    let cursor = cached?.processingCursor || 0;''',
'''    const persistedStage = cached?.rawEnglishTranscript?.length\n      ? (cached.processingStage && cached.processingStage !== "source" ? cached.processingStage : "repair")\n      : (cached?.processingStage || "source");\n    translationMode = modeFromProcessingStage(persistedStage, translationMode);\n    let stage = baseProcessingStage(persistedStage);\n    let cursor = cached?.processingCursor || 0;''',
    'durable stage derive')
s = s.replace('stage: "repair", cursor: 0, progress: 28, rawEnglishTranscript: supadata.cues,',
              'stage: processingStageForMode("repair", translationMode), cursor: 0, progress: 28, rawEnglishTranscript: supadata.cues,', 1)
s = s.replace('stage: "repair", cursor: 0, progress: 28,\n        title:',
              'stage: processingStageForMode("repair", translationMode), cursor: 0, progress: 28,\n        title:', 1)
s = replace_once(s,
'''      const CHUNK = 16;\n      if (cursor < raw.length) {\n        const chunk = await prepareEnglishTimedChunk(raw, cursor, CHUNK, translationMode === "legacy");''',
'''      const CHUNK = translationMode === "google" ? 48 : 16;\n      if (cursor < raw.length) {\n        const chunk = translationMode === "google"\n          ? await prepareGoogleEnglishTimedChunk(raw, cursor, CHUNK)\n          : await prepareEnglishTimedChunk(raw, cursor, CHUNK, true);''',
    'google semantic chunk')
s = replace_once(s,
'''          stage: done ? "translate" : "repair", cursor: done ? 0 : nextCursor, progress, englishTranscript: english,''',
'''          stage: processingStageForMode(done ? "translate" : "repair", translationMode), cursor: done ? 0 : nextCursor, progress, englishTranscript: english,''',
    'repair save stage')
s = replace_once(s,
'''        if (!await saveProcessingCheckpoint(videoId, lockToken, { stage: "translate", cursor: 0, progress: 48 })) throw new Error("Processing lock was lost before repair transition persisted");''',
'''        if (!await saveProcessingCheckpoint(videoId, lockToken, { stage: processingStageForMode("translate", translationMode), cursor: 0, progress: 48 })) throw new Error("Processing lock was lost before repair transition persisted");''',
    'repair transition stage')
s = replace_once(s,
'''    stage = cached.processingStage || stage; cursor = cached.processingCursor || 0;''',
'''    translationMode = modeFromProcessingStage(cached.processingStage, translationMode);\n    stage = baseProcessingStage(cached.processingStage || stage); cursor = cached.processingCursor || 0;''',
    'translate stage rehydrate')
s = replace_once(s,
'''              stage: done ? "finalize" : "translate", cursor: nextCursor, progress, greekTranscript: nextGreek,''',
'''              stage: processingStageForMode(done ? "finalize" : "translate", translationMode), cursor: nextCursor, progress, greekTranscript: nextGreek,''',
    'translate save stage')
s = replace_once(s,
'''        if (!await saveProcessingCheckpoint(videoId, lockToken, { stage: "finalize", cursor: english.length, progress: 90 })) throw new Error("Processing lock was lost before translation transition persisted");''',
'''        if (!await saveProcessingCheckpoint(videoId, lockToken, { stage: processingStageForMode("finalize", translationMode), cursor: english.length, progress: 90 })) throw new Error("Processing lock was lost before translation transition persisted");''',
    'translate transition stage')
s = replace_once(s,
'''    if ((cached.processingStage || stage) === "finalize") {''',
'''    translationMode = modeFromProcessingStage(cached.processingStage, translationMode);\n    if (baseProcessingStage(cached.processingStage || stage) === "finalize") {''',
    'finalize normalize')
s = replace_once(s,
'''          stage: "finalize", cursor: english.length, progress: 90,''',
'''          stage: processingStageForMode("finalize", translationMode), cursor: english.length, progress: 90,''',
    'timing recovery stage')

old_catch = '''    const recoverable = /μετάφραση|translation|groq|supadata|fetch|network|timeout|abort|429|\\b5\\d\\d\\b/i.test(message);\n    if (lockedVideoId && lockToken && recoverable) {\n      const retry = await recordTransientProcessingFailure(lockedVideoId, lockToken, message).catch(() => null);\n      lockToken = null;\n      if (retry?.status === "processing") {\n        const current = await getTranscript(lockedVideoId).catch(() => null);\n        return NextResponse.json({ ...processingResponse(current), transientError: message }, { status: 202, headers: { "Retry-After": "2" } });\n      }\n      if (retry?.status === "failed") {\n        return NextResponse.json({ error: message, retryLimit: MAX_TRANSIENT_RETRIES }, { status: 409, headers: { "Cache-Control": "no-store" } });\n      }\n    }'''
new_catch = '''    const recoverable = /429|cooldown|timeout|timed out|abort|network|fetch failed|econn|eai_again|\\b5\\d\\d\\b/i.test(message);\n    if (lockedVideoId && lockToken && recoverable) {\n      const retrySeconds = /429|cooldown/i.test(message) ? 30 : 5;\n      const retry = await recordRecoverableProcessingFailure(lockedVideoId, lockToken, message, retrySeconds).catch(() => null);\n      lockToken = null;\n      if (retry?.status === "processing") {\n        const current = await getTranscript(lockedVideoId).catch(() => null);\n        const seconds = current?.retryAfter\n          ? Math.max(1, Math.ceil((new Date(current.retryAfter).getTime() - Date.now()) / 1000))\n          : retrySeconds;\n        return NextResponse.json({ ...processingResponse(current), transientError: message }, { status: 202, headers: { "Retry-After": String(seconds) } });\n      }\n    }'''
s = replace_once(s, old_catch, new_catch, 'recoverable catch')
p.write_text(s)

# 3) Shared cache: a true recoverable path never flips the transcript to failed.
p = Path("app/api/shared-cache.ts")
s = p.read_text()
insert_after = '''export async function recordTransientProcessingFailure(videoId: string, token: string, message: string) {\n  const db = database();\n  const now = new Date();\n  const retryAfter = new Date(now.getTime() + 2_000).toISOString();\n  const rows = await db.query(\n    `UPDATE video_transcripts SET\n      retry_count = retry_count + 1, retry_after = $1, error = $2,\n      lock_token = NULL, lock_expires_at = NULL, updated_at = $3,\n      status = CASE WHEN retry_count + 1 >= $4 THEN 'failed' ELSE 'processing' END\n     WHERE video_id = $5 AND lock_token = $6\n     RETURNING status, retry_count, retry_after`,\n    [retryAfter, message.slice(0, 500), now.toISOString(), MAX_TRANSIENT_RETRIES, videoId, token],\n  ) as { status: TranscriptRecord["status"]; retry_count: number; retry_after: string | null }[];\n  return rows[0] || null;\n}\n'''
addition = insert_after + '''\nexport async function recordRecoverableProcessingFailure(\n  videoId: string,\n  token: string,\n  message: string,\n  retryAfterSeconds = 5,\n) {\n  const db = database();\n  const now = new Date();\n  const delay = Math.max(2, Math.min(60, Math.ceil(retryAfterSeconds)));\n  const retryAfter = new Date(now.getTime() + delay * 1_000).toISOString();\n  const rows = await db.query(\n    `UPDATE video_transcripts SET\n      retry_count = retry_count + 1, retry_after = $1, error = $2,\n      lock_token = NULL, lock_expires_at = NULL, updated_at = $3, status = 'processing'\n     WHERE video_id = $4 AND lock_token = $5\n     RETURNING status, retry_count, retry_after`,\n    [retryAfter, message.slice(0, 500), now.toISOString(), videoId, token],\n  ) as { status: TranscriptRecord["status"]; retry_count: number; retry_after: string | null }[];\n  return rows[0] || null;\n}\n'''
s = replace_once(s, insert_after, addition, 'recoverable cache function')
p.write_text(s)

# 4) Player: auto retry longer, paused transcript immediate sync and waiting status.
p = Path("app/GreekTubePlayer.tsx")
s = p.read_text()
s = replace_once(s,
    'type ProcessingTelemetry = { status?:string; progress?:number; stage?:string; cursor?:number; totalCues?:number; currentCue?:number; cueStart?:number|null; elapsedSeconds?:number; updatedAt?:string|null; keyPoints?:string[] };',
    'type ProcessingTelemetry = { status?:string; progress?:number; stage?:string; cursor?:number; totalCues?:number; currentCue?:number; cueStart?:number|null; elapsedSeconds?:number; updatedAt?:string|null; retryAfter?:string|null; transientError?:string; keyPoints?:string[] };',
    'telemetry type')
old_effect = '''  useEffect(()=>{\n    if(active<0||!state.settings.autoScroll||!transcript.current)return;\n    const container=transcript.current;\n    const cue=container.querySelector(`[data-cue="${active}"]`) as HTMLElement|null;\n    if(!cue)return;\n    const target=Math.max(0,cue.offsetTop-container.clientHeight/2+cue.clientHeight/2);\n    container.scrollTo({top:target,behavior:"smooth"});\n  },[active,state.settings.autoScroll]);'''
new_effect = '''  useEffect(()=>{\n    if(!transcriptOpen||!state.settings.autoScroll||!transcript.current||!captions)return;\n    const currentTime=currentPlayer()?.getCurrentTime();\n    const cueIndex=typeof currentTime==="number"?activeIndex(captions.cues,currentTime+state.settings.delay):active;\n    if(cueIndex<0)return;\n    if(cueIndex!==activeRef.current){activeRef.current=cueIndex;setActive(cueIndex);}\n    const container=transcript.current;\n    const cue=container.querySelector(`[data-cue="${cueIndex}"]`) as HTMLElement|null;\n    if(!cue)return;\n    const target=Math.max(0,cue.offsetTop-container.clientHeight/2+cue.clientHeight/2);\n    container.scrollTo({top:target,behavior:"smooth"});\n  },[transcriptOpen,active,state.settings.autoScroll,state.settings.delay,captions]);'''
s = replace_once(s, old_effect, new_effect, 'paused transcript sync')
s = replace_once(s,
'''          if(!response||response.status===429||response.status>=500){\n            transientFailures+=1;\n            if(transientFailures<5){\n              await new Promise(resolve=>window.setTimeout(resolve,Math.min(6000,1000*transientFailures)));\n              continue;\n            }\n            throw new Error(failureMessage||"shared-storage");\n          }''',
'''          if(!response||response.status===429||response.status>=500){\n            transientFailures+=1;\n            if(transientFailures<20){\n              const delay=Math.min(30000,1000*Math.pow(2,Math.min(5,transientFailures-1)));\n              await new Promise(resolve=>window.setTimeout(resolve,delay));\n              continue;\n            }\n            throw new Error(failureMessage||"shared-storage");\n          }''',
    'frontend retry')
s = replace_once(s,
'''    const preparationStage=progress>=100?"Οι ελληνικοί υπότιτλοι είναι έτοιμοι":[...PREPARATION_STAGES_EL].reverse().find(stage=>progress>=stage.at)?.label||PREPARATION_STAGES_EL[0].label;''',
'''    const providerWaiting=Boolean(processingTelemetry?.retryAfter&&new Date(processingTelemetry.retryAfter).getTime()>Date.now());\n    const preparationStage=providerWaiting?"Προσωρινή καθυστέρηση — συνεχίζουμε αυτόματα":progress>=100?"Οι ελληνικοί υπότιτλοι είναι έτοιμοι":[...PREPARATION_STAGES_EL].reverse().find(stage=>progress>=stage.at)?.label||PREPARATION_STAGES_EL[0].label;''',
    'waiting UI')
p.write_text(s)

# 5) Version bump.
p = Path("package.json")
data = json.loads(p.read_text())
data["version"] = "7.4.1"
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

for path in [Path("app/layout.tsx"), Path("app/GreekTubePlayer.tsx")]:
    if path.exists():
        text = path.read_text()
        text = text.replace("7.4.0", "7.4.1")
        path.write_text(text)

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def p(path): return ROOT / path

def replace_once(path, old, new):
    f=p(path); text=f.read_text(encoding='utf-8')
    if old not in text: raise SystemExit(f'missing guarded snippet in {path}: {old[:80]}')
    if text.count(old)!=1: raise SystemExit(f'non-unique guarded snippet in {path}')
    f.write_text(text.replace(old,new,1),encoding='utf-8')

pkg=json.loads(p('package.json').read_text(encoding='utf-8'))
pkg['version']='7.7.1'
p('package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

replace_once('app/api/captions/route.ts',
'''    const value = url.searchParams.get("videoId") || url.searchParams.get("url") || "";\n    const videoId = /^[\\w-]{11}$/.test(value) ? value : extractVideoId(value);''',
'''    const value = url.searchParams.get("videoId") || url.searchParams.get("url") || "";\n    const includeEnglish = url.searchParams.get("includeEnglish") === "1";\n    const videoId = /^[\\w-]{11}$/.test(value) ? value : extractVideoId(value);''')
replace_once('app/api/captions/route.ts',
'''    const published = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION);''',
'''    const published = await readPublishedTranscript(videoId, TRANSCRIPT_VERSION, includeEnglish);''')
replace_once('app/api/captions/route.ts',
'''    const payload = await cachedResponse(cached);\n    const migrated = await publishTranscript(videoId, TRANSCRIPT_VERSION, payload);\n    return NextResponse.json(payload, {''',
'''    const payload = await cachedResponse(cached);\n    const migrated = await publishTranscript(videoId, TRANSCRIPT_VERSION, payload);\n    const clientPayload = includeEnglish ? payload : { ...payload, englishCues: undefined };\n    return NextResponse.json(clientPayload, {''')

needle='''  const selected=state.videos.find(v=>v.id===selectedId)||null;\n\n  useEffect(()=>{ void (async()=>{'''
replacement='''  const selected=state.videos.find(v=>v.id===selectedId)||null;\n\n  useEffect(()=>{\n    if(!selectedId||!captions||state.settings.subtitleMode==="el"||captions.englishCues?.length)return;\n    let active=true;\n    void fetch(`/api/captions?videoId=${encodeURIComponent(selectedId)}&includeEnglish=1`,{cache:"no-store"})\n      .then(async response=>{\n        if(!response.ok)return;\n        const enriched=await response.json() as Captions;\n        if(!active||!isCompleteGreekTranscript(enriched)||!enriched.englishCues?.length)return;\n        setCaptions(current=>current?.videoId===selectedId?{...current,englishCues:enriched.englishCues}:current);\n      })\n      .catch(()=>undefined);\n    return()=>{active=false;};\n  },[selectedId,captions,state.settings.subtitleMode]);\n\n  useEffect(()=>{ void (async()=>{'''
replace_once('app/GreekTubePlayer.tsx',needle,replacement)

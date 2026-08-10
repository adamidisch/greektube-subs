from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


route_path = Path("app/api/captions/route.ts")
route = route_path.read_text()

route = replace_once(
    route,
    "async function translateCuesToGreek(cues: CaptionCue[]) {",
    "async function translateCuesToGreek(cues: CaptionCue[], onProgress?: (progress: number) => Promise<void>) {",
    "translateCuesToGreek signature",
)

old_block = '''  if (useGroq) {
    // Sequential on purpose: Groq's free tier is rate-limited per minute (TPM),
    // not just per day, so batches are kept modest and run one at a time.
    let precedingContext: string | undefined;
    for (const batch of batches) {
      try {
        const results = await translateBatchWithGroq(batch, precedingContext);
        if (results) {
          results.forEach((text, index) => translated.set(index, text));
          const tail = batch
            .map(item => translated.get(item.index))
            .filter((text): text is string => Boolean(text))
            .slice(-3);
          if (tail.length) precedingContext = tail.join(" ");
        }
      } catch {
        // fall through to Google Translate for this batch below
      }
    }
    const remainingBatches = batches
      .map(batch => batch.filter(item => !translated.has(item.index)))
      .filter(batch => batch.length > 0);
    for (let start = 0; start < remainingBatches.length; start += 2) {
      const results = await Promise.all(remainingBatches.slice(start, start + 2).map(translateMeaningBatch));
      results.forEach(batch => {
        batch.forEach((text, index) => translated.set(index, text));
      });
    }
  } else {
    for (let start = 0; start < batches.length; start += 2) {
      const results = await Promise.all(batches.slice(start, start + 2).map(translateMeaningBatch));
      results.forEach(batch => {
        batch.forEach((text, index) => translated.set(index, text));
      });
    }
  }
'''

new_block = '''  const reportProgress = async (completed: number, total: number, start: number, end: number) => {
    if (!onProgress || total <= 0) return;
    const ratio = Math.max(0, Math.min(1, completed / total));
    await onProgress(Math.round(start + (end - start) * ratio));
  };

  if (useGroq) {
    // Sequential on purpose: Groq's free tier is rate-limited per minute (TPM),
    // not just per day, so batches are kept modest and run one at a time.
    let precedingContext: string | undefined;
    let completedPrimary = 0;
    for (const batch of batches) {
      try {
        const results = await translateBatchWithGroq(batch, precedingContext);
        if (results) {
          results.forEach((text, index) => translated.set(index, text));
          const tail = batch
            .map(item => translated.get(item.index))
            .filter((text): text is string => Boolean(text))
            .slice(-3);
          if (tail.length) precedingContext = tail.join(" ");
        }
      } catch {
        // fall through to Google Translate for this batch below
      } finally {
        completedPrimary += batch.length;
        await reportProgress(completedPrimary, cues.length, 48, 78);
      }
    }
    const remainingBatches = batches
      .map(batch => batch.filter(item => !translated.has(item.index)))
      .filter(batch => batch.length > 0);
    const remainingTotal = remainingBatches.reduce((sum, batch) => sum + batch.length, 0);
    let completedFallback = 0;
    for (let start = 0; start < remainingBatches.length; start += 2) {
      const group = remainingBatches.slice(start, start + 2);
      const results = await Promise.all(group.map(translateMeaningBatch));
      results.forEach(batch => {
        batch.forEach((text, index) => translated.set(index, text));
      });
      completedFallback += group.reduce((sum, batch) => sum + batch.length, 0);
      await reportProgress(completedFallback, remainingTotal, 78, 84);
    }
    if (!remainingTotal && onProgress) await onProgress(84);
  } else {
    let completed = 0;
    for (let start = 0; start < batches.length; start += 2) {
      const group = batches.slice(start, start + 2);
      const results = await Promise.all(group.map(translateMeaningBatch));
      results.forEach(batch => {
        batch.forEach((text, index) => translated.set(index, text));
      });
      completed += group.reduce((sum, batch) => sum + batch.length, 0);
      await reportProgress(completed, cues.length, 48, 84);
    }
  }
'''
route = replace_once(route, old_block, new_block, "translation progress block")

route = route.replace(
    "cues = await translateCuesToGreek(sourceCues);",
    "cues = await translateCuesToGreek(sourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress));",
)
if route.count("translateCuesToGreek(sourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress))") != 2:
    raise SystemExit("expected exactly two translation call sites to be progress-aware")

route_path.write_text(route)


player_path = Path("app/GreekTubePlayer.tsx")
player = player_path.read_text()

old_client = '''    const loadingDelay=window.setTimeout(()=>setLoading(true),500);
    const timer=window.setInterval(()=>setProgress(p=>Math.min(84,p+(p<28?2:p<60?1:.5))),1200);
    try{'''
new_client = '''    const loadingDelay=window.setTimeout(()=>setLoading(true),500);
    let serverProgressSeen=false;
    const timer=window.setInterval(()=>{
      if(serverProgressSeen)return;
      setProgress(p=>Math.min(28,p+2));
    },1200);
    try{'''
player = replace_once(player, old_client, new_client, "client synthetic progress timer")

old_202 = '''          if(response?.status===202){
            setLoading(true);
            const processing=await response.json();
            if(typeof processing.progress==="number")setProgress(Math.max(4,Math.min(96,processing.progress)));
            if(Array.isArray(processing.keyPoints)&&processing.keyPoints.length)setLoadingPoints(processing.keyPoints);
            await new Promise(resolve=>window.setTimeout(resolve,1000));
            continue;
          }'''
new_202 = '''          if(response?.status===202){
            setLoading(true);
            serverProgressSeen=true;
            const processing=await response.json();
            if(typeof processing.progress==="number"){
              const serverProgress=Math.max(4,Math.min(96,processing.progress));
              setProgress(current=>Math.max(current,serverProgress));
            }
            if(Array.isArray(processing.keyPoints)&&processing.keyPoints.length)setLoadingPoints(processing.keyPoints);
            const retryAfter=Math.max(1,Number(response.headers.get("Retry-After"))||1);
            await new Promise(resolve=>window.setTimeout(resolve,retryAfter*1000));
            continue;
          }'''
player = replace_once(player, old_202, new_202, "202 progress polling")

player_path.write_text(player)
print("Applied v7.1.2 translation progress fix")

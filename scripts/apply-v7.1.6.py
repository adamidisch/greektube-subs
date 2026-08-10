from pathlib import Path


def replace_required(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing expected pattern: {label}")
    return text.replace(old, new, 1)

# --- Server translation pipeline ---
p = Path("app/api/captions/route.ts")
s = p.read_text()

# Replace createMeaningUnits with sentence-authoritative segmentation.
start = s.index("function createMeaningUnits(cues: CaptionCue[]) {")
end = s.index("\nfunction cleanSubtitleText", start)
new_units = r'''function createMeaningUnits(cues: CaptionCue[]) {
  // The English transcript is the source of truth. Clean only obvious ASR noise,
  // preserve punctuation/numbers/technical terms, then build COMPLETE source
  // sentences before translation. Timing is attached only after the sentence
  // boundary is known; translation never decides sentence boundaries.
  const cleanedCues = cues
    .map(cue => ({ ...cue, text: cleanSubtitleText(cue.text) }))
    .filter(cue => cue.text.length > 0);

  // A single timed YouTube/Supadata cue may contain several punctuated sentences.
  // Split those first while keeping every part inside the original cue envelope.
  const preparedCues: CaptionCue[] = cleanedCues.flatMap(cue => {
    const parts = cue.text.match(/[^.!?…]+[.!?…]+[\"')\]]*|[^.!?…]+$/g)?.map(part => part.trim()).filter(Boolean) || [cue.text];
    if (parts.length <= 1) return [cue];
    const weights = parts.map(part => Math.max(1, part.replace(/\s+/g, "").length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let elapsed = 0;
    return parts.map((part, index) => {
      const start = cue.start + elapsed;
      const duration = index === parts.length - 1
        ? Math.max(0.05, cue.duration - elapsed)
        : Math.max(0.05, cue.duration * (weights[index] / totalWeight));
      elapsed += duration;
      return { start, duration, text: part };
    });
  });

  const units: CaptionCue[] = [];
  let current: CaptionCue[] = [];
  let characters = 0;

  const flush = () => {
    if (!current.length) return;
    const start = current[0].start;
    const end = current.reduce((latest, cue) => Math.max(latest, cue.start + cue.duration), start);
    units.push({
      start,
      duration: Math.max(0.2, end - start),
      text: current.map(cue => cue.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    current = [];
    characters = 0;
  };

  preparedCues.forEach((cue, index) => {
    const next = preparedCues[index + 1];
    current.push(cue);
    characters += cue.text.length;

    const sentenceEnd = /[.!?…][\"')\]]?$/.test(cue.text.trim());
    const gap = next ? next.start - (cue.start + cue.duration) : Number.POSITIVE_INFINITY;
    const elapsed = cue.start + cue.duration - current[0].start;

    // Punctuation is authoritative. A clear acoustic gap is a fallback only for
    // transcripts that omit punctuation. The emergency ceiling exists solely to
    // protect malformed ASR streams; normal sentences are never split by size.
    const clearUnpunctuatedPause = !sentenceEnd && gap >= 1.1;
    const emergencyBoundary = elapsed >= 20 || characters >= 360;
    if (sentenceEnd || clearUnpunctuatedPause || emergencyBoundary || !next) flush();
  });

  // Normalize display windows so one subtitle cannot visually overlap the next.
  return units.map((unit, index) => {
    const next = units[index + 1];
    if (!next || next.start <= unit.start) return unit;
    return {
      ...unit,
      duration: Math.max(0.2, Math.min(unit.duration, next.start - unit.start)),
    };
  });
}
'''
s = s[:start] + new_units + s[end:]

# Strengthen exact-source guardrails for numbers and technical tokens.
needle = r'''function hasGreekNegation(text: string) {
  return /(?:^|[^\p{L}])(?:δεν|μην|μη|όχι|χωρίς|ούτε)(?=$|[^\p{L}])/iu.test(text);
}
'''
insert = needle + r'''
function numericGuardTokens(text: string) {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  return new Set(matches.map(token => token.replace(",", ".")));
}

function sameTokenSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const token of a) if (!b.has(token)) return false;
  return true;
}
'''
if needle not in s:
    raise SystemExit("Missing hasGreekNegation block")
s = s.replace(needle, insert, 1)

old_retry = r'''  // Added negation is another high-risk semantic change. Re-run only that cue
  // in complete isolation rather than penalising the whole transcript.
  if (!hasEnglishNegation(source) && hasGreekNegation(target)) return true;
  return false;
}
'''
new_retry = r'''  // Added negation is another high-risk semantic change. Re-run only that cue
  // in complete isolation rather than penalising the whole transcript.
  if (!hasEnglishNegation(source) && hasGreekNegation(target)) return true;

  // Numbers are never stylistic. A number that appears/disappears/changes in
  // Greek (for example a stray "15") makes the cue objectively unfaithful.
  if (!sameTokenSet(numericGuardTokens(source), numericGuardTokens(target))) return true;
  return false;
}
'''
s = replace_required(s, old_retry, new_retry, "strict semantic retry guard")

# Remove preceding translated context from primary sentence translation.
old_primary = r'''    let precedingContext: string | undefined;
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
'''
new_primary = r'''    let completedPrimary = 0;
    for (const batch of batches) {
      try {
        // Each complete English sentence is translated from its own source text.
        // No previous translated prose is supplied, eliminating cross-sentence
        // semantic borrowing such as "poisoned" + next sentence "MSM".
        const results = await translateBatchWithGroq(batch);
        if (results) {
          results.forEach((text, index) => translated.set(index, text));
        }
      } catch {
'''
s = replace_required(s, old_primary, new_primary, "remove preceding translation context")

# Allow deterministic objective failures to be repaired even when there are several.
old_suspicious = r'''    const semantic = await verifySemanticFidelity(cues, translated, verificationCandidates);
    const suspicious = [...new Set([...deterministic, ...semantic])].slice(0, 4);
    let checked = 0;
'''
new_suspicious = r'''    const semantic = await verifySemanticFidelity(cues, translated, verificationCandidates);
    const suspicious = [...new Set([...deterministic.slice(0, 8), ...semantic])].slice(0, 8);
    let checked = 0;
'''
s = replace_required(s, old_suspicious, new_suspicious, "bounded suspicious cue repairs")

# If an isolated model retry still violates objective guards, use the literal
# single-cue fallback rather than accepting an invented number/borrowed term.
old_strict_tail = r'''        const strict = await translateBatchWithGroq([{ index, text: cues[index].text }]);
        const replacement = strict?.get(index);
        if (replacement) translated.set(index, replacement);
      } catch {
'''
new_strict_tail = r'''        const strict = await translateBatchWithGroq([{ index, text: cues[index].text }]);
        const replacement = strict?.get(index);
        if (replacement) translated.set(index, replacement);
        if (needsStrictSemanticRetry(cues, translated, index)) {
          const literal = await translateSingleCue(index, cues[index].text);
          if (literal?.text) translated.set(index, literal.text);
        }
      } catch {
'''
s = replace_required(s, old_strict_tail, new_strict_tail, "objective fallback after strict retry")

# GET must expose live processing state so the browser can poll while the long
# POST is still running.
old_get = r'''    const cached = await getTranscript(videoId);
    if (!cached || cached.status !== "ready" || cached.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
    return NextResponse.json(await cachedResponse(cached), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" },
    });
'''
new_get = r'''    const cached = await getTranscript(videoId);
    if (!cached || cached.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (cached.status === "processing") {
      return NextResponse.json(await cachedResponse(cached), {
        status: 202,
        headers: { "Cache-Control": "no-store", "Retry-After": "1" },
      });
    }
    if (cached.status !== "ready") {
      return NextResponse.json({ ready: false, status: cached.status }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);
    return NextResponse.json(await cachedResponse(cached), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" },
    });
'''
s = replace_required(s, old_get, new_get, "processing-aware GET")

# Add explicit finalization progress before completion in both processing paths.
s = s.replace("      const now = new Date().toISOString();\n\n      await completeTranscript({", "      const now = new Date().toISOString();\n      await updateProcessingProgress(videoId, lockToken, 96);\n\n      await completeTranscript({", 1)
# direct YouTube path has a second matching completion block later
idx = s.find("    const now = new Date().toISOString();\n\n    await completeTranscript({")
if idx != -1:
    s = s[:idx] + s[idx:].replace("    const now = new Date().toISOString();\n\n    await completeTranscript({", "    const now = new Date().toISOString();\n    await updateProcessingProgress(videoId, lockToken, 96);\n\n    await completeTranscript({", 1)

# Bump method labels for traceability.
s = s.replace("supadata_native_semantic_boundaries_v5", "supadata_native_sentence_faithful_v6")
s = s.replace("semantic_boundaries_v5", "sentence_faithful_v6")
p.write_text(s)

# --- Client live progress polling ---
p = Path("app/GreekTubePlayer.tsx")
s = p.read_text()
s = s.replace("data.transcriptVersion!==8", "data.transcriptVersion!==9")
s = s.replace(":v8`", ":v9`")
s = s.replace("ver 7.1.5", "ver 7.1.6")

old_progress = r'''    setLoading(false); setProgress(4); setCaptions(null);
    const loadingDelay=window.setTimeout(()=>setLoading(true),500);
    let serverProgressSeen=false;
    const timer=window.setInterval(()=>{
      if(serverProgressSeen)return;
      setProgress(p=>Math.min(28,p+2));
    },1200);
    try{
'''
new_progress = r'''    setLoading(false); setProgress(3); setCaptions(null);
    const loadingDelay=window.setTimeout(()=>setLoading(true),350);
    let stopStatusPolling=false;
    const statusPolling=(async()=>{
      while(!stopStatusPolling){
        await new Promise(resolve=>window.setTimeout(resolve,900));
        if(stopStatusPolling)break;
        try{
          const statusResponse=await fetch(`/api/captions?videoId=${encodeURIComponent(video.id)}`,{cache:"no-store"});
          if(statusResponse.status!==202&&!statusResponse.ok)continue;
          const statusData=await statusResponse.json() as Captions & {progress?:number;status?:string};
          if(typeof statusData.progress==="number"){
            setProgress(Math.max(3,Math.min(100,statusData.progress)));
          }
          if(Array.isArray(statusData.keyPoints)&&statusData.keyPoints.length)setLoadingPoints(statusData.keyPoints);
        }catch{}
      }
    })();
    try{
'''
s = replace_required(s, old_progress, new_progress, "real status polling setup")

# 202 handling should show exact server state, not synthetic monotonic leftovers.
old_202 = r'''          if(response?.status===202){
            setLoading(true);
            serverProgressSeen=true;
            const processing=await response.json();
            if(typeof processing.progress==="number"){
              const serverProgress=Math.max(4,Math.min(96,processing.progress));
              setProgress(current=>Math.max(current,serverProgress));
            }
'''
new_202 = r'''          if(response?.status===202){
            setLoading(true);
            const processing=await response.json();
            if(typeof processing.progress==="number"){
              setProgress(Math.max(3,Math.min(96,processing.progress)));
            }
'''
s = replace_required(s, old_202, new_202, "exact 202 progress")

old_finally = r'''    }finally{window.clearTimeout(loadingDelay);clearInterval(timer);}
'''
new_finally = r'''    }finally{
      stopStatusPolling=true;
      window.clearTimeout(loadingDelay);
      void statusPolling;
    }
'''
s = replace_required(s, old_finally, new_finally, "stop live status polling")
p.write_text(s)

# --- Shared transcript schema/version ---
p = Path("app/api/shared-cache.ts")
s = p.read_text().replace("export const TRANSCRIPT_VERSION = 8;", "export const TRANSCRIPT_VERSION = 9;")
p.write_text(s)

# --- Release metadata ---
p = Path("package.json")
s = p.read_text().replace('"version": "7.1.5"', '"version": "7.1.6"')
p.write_text(s)

p = Path("app/layout.tsx")
s = p.read_text().replace("final-v7.1.5", "final-v7.1.6").replace("7.1.5", "7.1.6")
p.write_text(s)

print("v7.1.6 sentence-faithful subtitle pipeline applied")

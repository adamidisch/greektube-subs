from pathlib import Path
import re
import json

route_path=Path('app/api/captions/route.ts')
route=route_path.read_text()

# 1) Replace the old sentence-merging logic with a raw-cue-preserving English repair/segmentation pipeline.
start=route.index('function createMeaningUnits(cues: CaptionCue[]) {')
end=route.index('\nfunction cleanSubtitleText(text: string) {', start)
new_prepare=r'''function englishWordTokens(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
}

function canonicalNumberTokens(text: string) {
  const matches = text.match(/\b\d+(?:[.,]\d+)*\b/g) || [];
  return matches.map(token => {
    const compactThousands = token.replace(/(?<=\d)[.,](?=\d{3}(?:\D|$))/g, "");
    return compactThousands.replace(",", ".");
  });
}

function protectedSourceTokens(text: string) {
  const matches = text.match(/\b(?:[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|IU|iu|%)?)\b/g) || [];
  return [...new Set(matches.map(token => token.replace(/\s+/g, "").toLowerCase()))];
}

function sameStringMultiset(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function repairCandidateIsSafe(source: string, candidate: string) {
  if (!candidate.trim() || /\[\[\s*\d+\s*\]\]/.test(candidate)) return false;
  const sourceWords = englishWordTokens(source);
  const candidateWords = englishWordTokens(candidate);
  // ASR repair may replace a misheard word, but it may not insert/delete/move
  // transcript material. Punctuation/casing changes do not affect token count.
  if (sourceWords.length !== candidateWords.length) return false;
  if (!sameStringMultiset(canonicalNumberTokens(source), canonicalNumberTokens(candidate))) return false;
  const candidateLower = candidate.toLowerCase().replace(/\s+/g, "");
  for (const token of protectedSourceTokens(source)) {
    if (!candidateLower.includes(token)) return false;
  }
  return true;
}

const ENGLISH_REPAIR_SYSTEM_PROMPT =
  "You repair automatically generated English captions before translation. " +
  "Each [[N]] is one immutable timed cue. Return exactly one [[N]] for every input cue in the same order. " +
  "NEVER move words from one cue to another. NEVER merge cues. NEVER add or delete meaning. " +
  "You may add punctuation and capitalization. You may replace a word only when it is a highly certain speech-recognition error strongly supported by grammar, nearby context and domain terminology. " +
  "Examples of allowed repair: an obvious medical ASR corruption such as collalation -> chelation when the context clearly refers to metal chelation. " +
  "Preserve all numbers, doses, acronyms, names and technical tokens such as MSM, B3 and IU exactly unless a non-protected ordinary word is clearly misrecognized. " +
  "If uncertain, keep the original wording unchanged. Do not paraphrase, summarize, simplify or translate. " +
  "Your job is only English transcript repair and sentence punctuation. Answer only with [[N]] lines.";

async function repairEnglishBatchWithGroq(batch: { index: number; text: string }[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !batch.length) return null;
  const expectedIds = new Set(batch.map(item => item.index));
  const numbered = batch.map(item => `[[${item.index}]] ${item.text}`).join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 3600,
        messages: [
          { role: "system", content: ENGLISH_REPAIR_SYSTEM_PROMPT },
          { role: "user", content: numbered },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content || "";
    const results = new Map<number, string>();
    const marker = /\[\[\s*(\d+)\s*\]\]\s*([\s\S]*?)(?=\n?\[\[\s*\d+\s*\]\]|$)/g;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(content))) {
      const index = Number(match[1]);
      if (!expectedIds.has(index) || results.has(index)) return null;
      const source = batch.find(item => item.index === index)?.text || "";
      const candidate = match[2].replace(/\s+/g, " ").trim();
      if (!repairCandidateIsSafe(source, candidate)) return null;
      results.set(index, candidate);
    }
    if (results.size !== batch.length || batch.some(item => !results.has(item.index))) return null;
    return results;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function splitEnglishCueAtSentenceBoundaries(cue: CaptionCue) {
  const text = cue.text.replace(/\s+/g, " ").trim();
  if (!text) return [] as CaptionCue[];
  const matches = text.match(/[^.!?…]+[.!?…]+[\"')\]]*|[^.!?…]+$/g)?.map(part => part.trim()).filter(Boolean) || [text];
  if (matches.length <= 1) return [{ ...cue, text }];

  // Avoid treating common abbreviations as sentence endings.
  const parts: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    let part = matches[index];
    while (/\b(?:Dr|Mr|Mrs|Ms|Prof|St|vs|e\.g|i\.e)\.$/i.test(part) && index + 1 < matches.length) {
      part = `${part} ${matches[index + 1]}`.replace(/\s+/g, " ").trim();
      index += 1;
    }
    parts.push(part);
  }
  if (parts.length <= 1) return [{ ...cue, text: parts[0] || text }];

  const weights = parts.map(part => Math.max(1, englishWordTokens(part).length));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let consumed = 0;
  return parts.map((part, index) => {
    const startRatio = consumed / total;
    consumed += weights[index];
    const endRatio = consumed / total;
    const start = cue.start + cue.duration * startRatio;
    const end = cue.start + cue.duration * endRatio;
    return { start, duration: Math.max(0.001, end - start), text: part };
  });
}

function clampTimedCueWindows(cues: CaptionCue[]) {
  return cues.map((cue, index) => {
    const next = cues[index + 1];
    if (!next || next.start <= cue.start) return cue;
    return { ...cue, duration: Math.max(0.001, Math.min(cue.duration, next.start - cue.start)) };
  });
}

async function prepareEnglishTimedCues(
  cues: CaptionCue[],
  onProgress?: (progress: number) => Promise<void>,
) {
  const raw = cues
    .map(cue => ({ ...cue, text: cue.text.replace(/\s+/g, " ").trim() }))
    .filter(cue => cue.text.length > 0)
    .sort((a, b) => a.start - b.start);
  if (!raw.length) return [] as CaptionCue[];

  const repaired = new Map<number, string>();
  const batchSize = 24;
  for (let start = 0; start < raw.length; start += batchSize) {
    const batch = raw.slice(start, start + batchSize).map((cue, offset) => ({ index: start + offset, text: cue.text }));
    const result = await repairEnglishBatchWithGroq(batch);
    if (result) result.forEach((text, index) => repaired.set(index, text));
    if (onProgress) {
      const completed = Math.min(raw.length, start + batch.length);
      await onProgress(Math.round(28 + 16 * (completed / raw.length)));
    }
  }

  const normalized = raw.flatMap((cue, index) =>
    splitEnglishCueAtSentenceBoundaries({ ...cue, text: repaired.get(index) || cue.text }),
  );
  return clampTimedCueWindows(normalized);
}
'''
route = route[:start] + new_prepare + route[end:]

# 2) Translation prompt: normalized English is now source-of-truth; never repair or borrow during translation.
prompt_start=route.index('const GROQ_SYSTEM_PROMPT =')
prompt_end=route.index('\n\nasync function translateBatchWithGroq', prompt_start)
new_prompt=r'''const GROQ_SYSTEM_PROMPT =
  "Μετέφρασε φυσικά και πιστά στα ελληνικά για υπότιτλους. " +
  "Το αγγλικό κείμενο έχει ήδη διορθωθεί και χρονιστεί. ΜΗΝ διορθώνεις, συμπληρώνεις ή ερμηνεύεις το source. " +
  "Κάθε [[N]] είναι ανεξάρτητο timed cue. Μετέφρασε μόνο τις λέξεις του συγκεκριμένου [[N]] και μην μεταφέρεις λέξεις ή νόημα από γειτονικό cue. " +
  "Διατήρησε ακριβώς αριθμούς, δόσεις, ακρωνύμια και τεχνικά tokens όπως MSM, B3 και IU. " +
  "Μην προσθέτεις πληροφορίες, αριθμούς, αιτίες, αρνήσεις, πρόσωπα ή τεχνικούς όρους που δεν υπάρχουν στο συγκεκριμένο αγγλικό cue. " +
  "Η ιατρική και επιστημονική ορολογία πρέπει να αποδίδεται σωστά στα ελληνικά, αλλά η πιστότητα στο source έχει προτεραιότητα. " +
  "Επέστρεψε ακριβώς έναν δείκτη [[N]] για κάθε input cue, στην ίδια σειρά, χωρίς παραλείψεις, διπλασιασμούς ή νέους δείκτες. " +
  "Απάντησε μόνο με τις μεταφρασμένες γραμμές και τους δείκτες.";'''
route = route[:prompt_start] + new_prompt + route[prompt_end:]

# 3) Replace semantic second-pass helpers with deterministic integrity guards.
helpers_start=route.index('function technicalGuardTokens(text: string) {')
helpers_end=route.index('\nasync function translateTitleToGreek', helpers_start)
new_helpers=r'''function translationProtectedTokens(text: string) {
  return protectedSourceTokens(text);
}

function translationIntegrityOK(source: string, target: string) {
  if (!target.trim()) return false;
  // Marker artefacts such as the stray [15] observed in v7.1.x are forbidden.
  if (/\[\s*\d+\s*\]/.test(target)) return false;
  if (!sameStringMultiset(canonicalNumberTokens(source), canonicalNumberTokens(target))) return false;
  const compactTarget = target.toLowerCase().replace(/\s+/g, "");
  for (const token of translationProtectedTokens(source)) {
    if (!compactTarget.includes(token)) return false;
  }
  const ordinaryEnglish = englishWordTokens(source).filter(token => !translationProtectedTokens(source).includes(token.toLowerCase()));
  if (ordinaryEnglish.length > 0 && !hasGreekText([{ start: 0, duration: 1, text: target }])) return false;
  return true;
}

function validateAlignedTranscript(english: CaptionCue[], greek: CaptionCue[]) {
  if (english.length !== greek.length) throw new Error("Ο συγχρονισμός αγγλικών και ελληνικών υποτίτλων δεν ολοκληρώθηκε");
  for (let index = 0; index < english.length; index += 1) {
    const source = english[index];
    const target = greek[index];
    if (Math.abs(source.start - target.start) > 0.002 || Math.abs(source.duration - target.duration) > 0.002) {
      throw new Error("Οι ελληνικοί υπότιτλοι μετακινήθηκαν από τα αρχικά timestamps");
    }
    if (!translationIntegrityOK(source.text, target.text)) {
      throw new Error(`Αποτυχία ελέγχου πιστότητας στο cue ${index + 1}`);
    }
    if (index > 0 && target.start < greek[index - 1].start) {
      throw new Error("Οι χρονισμοί των ελληνικών υποτίτλων δεν είναι ταξινομημένοι");
    }
  }
}
'''
route = route[:helpers_start] + new_helpers + route[helpers_end:]

# 4) Replace translation implementation: 12-cue primary batches, bounded strict retries, per-cue fallback, exact timings preserved.
trans_start=route.index('async function translateCuesToGreek(cues: CaptionCue[], onProgress?: (progress: number) => Promise<void>) {')
trans_end=route.index('\nfunction validateCompleteGreekTranscript', trans_start)
new_translate=r'''async function translateCuesToGreek(cues: CaptionCue[], onProgress?: (progress: number) => Promise<void>) {
  const translated = new Map<number, string>();
  const useGroq = Boolean(process.env.GROQ_API_KEY);
  const batchSize = useGroq ? 12 : 18;
  const batches: { index: number; text: string }[][] = [];
  for (let start = 0; start < cues.length; start += batchSize) {
    batches.push(cues.slice(start, start + batchSize).map((cue, offset) => ({ index: start + offset, text: cue.text })));
  }

  const reportProgress = async (completed: number, total: number, start: number, end: number) => {
    if (!onProgress || total <= 0) return;
    await onProgress(Math.round(start + (end - start) * Math.max(0, Math.min(1, completed / total))));
  };

  let completedPrimary = 0;
  if (useGroq) {
    for (const batch of batches) {
      try {
        const results = await translateBatchWithGroq(batch);
        if (results) {
          for (const item of batch) {
            const text = results.get(item.index);
            if (text && translationIntegrityOK(item.text, text)) translated.set(item.index, text);
          }
        }
      } catch {}
      completedPrimary += batch.length;
      await reportProgress(completedPrimary, cues.length, 48, 80);
    }

    // Bounded strict retry only for objectively invalid/missing cues.
    const strict = cues.map((cue, index) => ({ cue, index })).filter(({ index }) => !translated.has(index)).slice(0, 8);
    for (let position = 0; position < strict.length; position += 1) {
      const { cue, index } = strict[position];
      try {
        const result = await translateBatchWithGroq([{ index, text: cue.text }]);
        const text = result?.get(index);
        if (text && translationIntegrityOK(cue.text, text)) translated.set(index, text);
      } catch {}
      if (onProgress) await onProgress(Math.round(80 + 4 * ((position + 1) / Math.max(1, strict.length))));
    }
  }

  const remaining = cues.map((cue, index) => ({ cue, index })).filter(({ index }) => !translated.has(index));
  for (let start = 0; start < remaining.length; start += 6) {
    const group = remaining.slice(start, start + 6);
    const results = await Promise.all(group.map(({ cue, index }) => translateSingleCue(index, cue.text)));
    results.forEach(result => {
      if (!result) return;
      const source = cues[result.index]?.text || "";
      if (translationIntegrityOK(source, result.text)) translated.set(result.index, result.text);
    });
    await reportProgress(Math.min(remaining.length, start + group.length), remaining.length, useGroq ? 84 : 48, 88);
  }

  const missing = cues.map((_, index) => index).filter(index => !translated.has(index));
  if (missing.length) throw new Error(`Η ελληνική μετάφραση απέτυχε σε ${missing.length} cues`);

  return cues.map((cue, index) => ({ ...cue, text: translated.get(index) as string }));
}
'''
route = route[:trans_start] + new_translate + route[trans_end:]

# 5) Wire the new English preparation pipeline into all English source paths.
route=route.replace(
    'const sourceCues = createMeaningUnits(direct.cues);',
    'const sourceCues = await prepareEnglishTimedCues(direct.cues, progress => updateProcessingProgress(videoId, lockToken as string, progress));',
)
route=route.replace(
    'sourceCues = createMeaningUnits(supadata.cues);',
    'sourceCues = await prepareEnglishTimedCues(supadata.cues, progress => updateProcessingProgress(videoId, lockToken as string, progress));',
)
route=route.replace(
    'sourceCues = createMeaningUnits(rawSourceCues);',
    'sourceCues = await prepareEnglishTimedCues(rawSourceCues, progress => updateProcessingProgress(videoId, lockToken as string, progress));',
)
if 'createMeaningUnits(' in route:
    raise SystemExit('Unreplaced createMeaningUnits call remains')

# Validate exact cue timing immediately after translated output in all three English paths.
route=route.replace(
    'validateCompleteGreekTranscript(cues, duration);\n      await updateProcessingProgress(videoId, lockToken as string, 88);',
    'validateAlignedTranscript(sourceCues, cues);\n      validateCompleteGreekTranscript(cues, duration);\n      await updateProcessingProgress(videoId, lockToken as string, 92);',
)
route=route.replace(
    'validateCompleteGreekTranscript(cues, videoDuration);\n    await updateProcessingProgress(videoId, lockToken as string, 88);',
    'if (sourceCues.length) validateAlignedTranscript(sourceCues, cues);\n    validateCompleteGreekTranscript(cues, videoDuration);\n    await updateProcessingProgress(videoId, lockToken as string, 92);',
)

# Store raw English alongside normalized English for traceability.
route=route.replace(
    'englishTranscript: Array.isArray(body.cachedTranscript.englishCues) ? body.cachedTranscript.englishCues : [],\n          greekTranscript:',
    'rawEnglishTranscript: Array.isArray(body.cachedTranscript.englishCues) ? body.cachedTranscript.englishCues : [],\n          englishTranscript: Array.isArray(body.cachedTranscript.englishCues) ? body.cachedTranscript.englishCues : [],\n          greekTranscript:',
)
route=route.replace('englishTranscript: sourceCues,\n        greekTranscript:', 'rawEnglishTranscript: direct.cues,\n        englishTranscript: sourceCues,\n        greekTranscript:', 1)
route=route.replace('englishTranscript: sourceCues,\n        greekTranscript:', 'rawEnglishTranscript: supadata.cues,\n        englishTranscript: sourceCues,\n        greekTranscript:', 1)
route=route.replace('englishTranscript: sourceCues,\n      greekTranscript:', 'rawEnglishTranscript: rawSourceCues,\n      englishTranscript: sourceCues,\n      greekTranscript:', 1)

# Response metadata reflects the new pipeline.
route=route.replace('youtube_native_sentence_faithful_v6', 'youtube_native_repaired_timed_v7')
route=route.replace('supadata_native_sentence_faithful_v6', 'supadata_repaired_timed_v7')
route=route.replace('sentence_faithful_v6', 'repaired_timed_v7')

route_path.write_text(route)

# 6) Shared cache: transcript v10 + raw English storage column.
cache_path=Path('app/api/shared-cache.ts')
cache=cache_path.read_text()
cache=cache.replace('export const TRANSCRIPT_VERSION = 9;', 'export const TRANSCRIPT_VERSION = 10;')
cache=cache.replace('  englishTranscript: CachedCue[];\n  greekTranscript:', '  rawEnglishTranscript: CachedCue[];\n  englishTranscript: CachedCue[];\n  greekTranscript:')
cache=cache.replace("      english_transcript TEXT NOT NULL DEFAULT '[]',", "      raw_english_transcript TEXT NOT NULL DEFAULT '[]',\n      english_transcript TEXT NOT NULL DEFAULT '[]',")
cache=cache.replace(
    '  await db.query(\n    "CREATE INDEX IF NOT EXISTS video_transcripts_status_idx ON video_transcripts (status, updated_at)",\n  );',
    '  await db.query("ALTER TABLE video_transcripts ADD COLUMN IF NOT EXISTS raw_english_transcript TEXT NOT NULL DEFAULT \'[]\'");\n  await db.query(\n    "CREATE INDEX IF NOT EXISTS video_transcripts_status_idx ON video_transcripts (status, updated_at)",\n  );',
)
cache=cache.replace('  original_language: string; english_transcript: string; greek_transcript: string;', '  original_language: string; raw_english_transcript: string; english_transcript: string; greek_transcript: string;')
cache=cache.replace('    englishTranscript: JSON.parse(row.english_transcript || "[]"),', '    rawEnglishTranscript: JSON.parse(row.raw_english_transcript || "[]"),\n    englishTranscript: JSON.parse(row.english_transcript || "[]"),')
cache=cache.replace(
    '      english_transcript = $6, greek_transcript = $7, timestamps = $8, topics = $9, key_points = $10,\n      status = \'ready\', progress = 100, lock_token = NULL, lock_expires_at = NULL, error = NULL,\n      transcript_version = $11, updated_at = $12\n    WHERE video_id = $13 AND lock_token = $14`,\n    [record.title, record.channel, record.thumbnail, record.duration, record.originalLanguage,\n      JSON.stringify(record.englishTranscript), JSON.stringify(record.greekTranscript),\n      JSON.stringify(record.timestamps), JSON.stringify(record.topics), JSON.stringify(record.keyPoints),\n      record.transcriptVersion, record.updatedAt, record.videoId, token],',
    '      raw_english_transcript = $6, english_transcript = $7, greek_transcript = $8, timestamps = $9, topics = $10, key_points = $11,\n      status = \'ready\', progress = 100, lock_token = NULL, lock_expires_at = NULL, error = NULL,\n      transcript_version = $12, updated_at = $13\n    WHERE video_id = $14 AND lock_token = $15`,\n    [record.title, record.channel, record.thumbnail, record.duration, record.originalLanguage,\n      JSON.stringify(record.rawEnglishTranscript), JSON.stringify(record.englishTranscript), JSON.stringify(record.greekTranscript),\n      JSON.stringify(record.timestamps), JSON.stringify(record.topics), JSON.stringify(record.keyPoints),\n      record.transcriptVersion, record.updatedAt, record.videoId, token],',
)
cache_path.write_text(cache)

# 7) Client version/cache/progress-stage labels.
player_path=Path('app/GreekTubePlayer.tsx')
player=player_path.read_text()
player=player.replace(':v9`', ':v10`').replace(':v9"', ':v10"')
player=player.replace('transcriptVersion!==9', 'transcriptVersion!==10').replace('transcriptVersion !== 9', 'transcriptVersion !== 10')
player=player.replace('ver 7.1.6', 'ver 7.1.7')
old_stages='''  {at:4,label:"Ανάκτηση στοιχείων βίντεο"},\n  {at:12,label:"Ανάκτηση αγγλικών υποτίτλων"},\n  {at:28,label:"Καθαρισμός και οργάνωση κειμένου"},\n  {at:48,label:"Μετάφραση στα ελληνικά"},\n  {at:84,label:"Έλεγχος νοήματος και συγχρονισμού"},\n  {at:96,label:"Ολοκλήρωση υποτίτλων"},'''
new_stages='''  {at:4,label:"Ανάκτηση στοιχείων βίντεο"},\n  {at:12,label:"Ανάκτηση αγγλικού transcript"},\n  {at:28,label:"Δόμηση και διόρθωση αγγλικού κειμένου"},\n  {at:48,label:"Μετάφραση στα ελληνικά"},\n  {at:84,label:"Συγχρονισμός με το αρχικό timing"},\n  {at:92,label:"Έλεγχος πιστότητας και ακεραιότητας"},\n  {at:96,label:"Ολοκλήρωση υποτίτλων"},'''
if old_stages not in player:
    raise SystemExit('progress stages block not found')
player=player.replace(old_stages,new_stages)
player_path.write_text(player)

# 8) Version metadata.
for filename in ['package.json','package-lock.json','app/layout.tsx']:
    p=Path(filename)
    if not p.exists():
        continue
    text=p.read_text()
    text=text.replace('7.1.6','7.1.7')
    p.write_text(text)

print('v7.1.7 pipeline integration applied')

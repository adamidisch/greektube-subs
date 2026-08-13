from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]

def p(path): return ROOT/path

def replace_once(path,old,new):
    f=p(path); text=f.read_text(encoding='utf-8')
    if old not in text: raise SystemExit(f'missing guarded snippet in {path}: {old[:120]}')
    if text.count(old)!=1: raise SystemExit(f'non-unique guarded snippet in {path}')
    f.write_text(text.replace(old,new,1),encoding='utf-8')

pkg=json.loads(p('package.json').read_text(encoding='utf-8'))
if pkg.get('version')!='7.7.1': raise SystemExit(f"unexpected version {pkg.get('version')}")
pkg['version']='7.7.2'
p('package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

shared='app/api/shared-cache.ts'
marker='''export async function acquireProcessingLock(videoId: string, token: string, force = false) {'''
insert='''export type TranscriptStatusRecord = {
  videoId: string;
  status: TranscriptRecord["status"];
  progress: number;
  lockExpiresAt?: string | null;
  processingStage?: string | null;
  processingCursor: number;
  retryCount: number;
  retryAfter?: string | null;
  groq429Streak: number;
  groqCooldownUntil?: string | null;
  processingStartedAt?: string | null;
  error?: string | null;
  transcriptVersion: number;
  createdAt: string;
  updatedAt: string;
  rawEnglishCount: number;
  englishCount: number;
  greekCount: number;
  keyPoints: string[];
};

type StatusRow = {
  video_id: string;
  status: TranscriptRecord["status"];
  progress: number;
  lock_expires_at: string | null;
  processing_stage: string | null;
  processing_cursor: number;
  retry_count: number;
  retry_after: string | null;
  groq_429_streak: number;
  groq_cooldown_until: string | null;
  processing_started_at: string | null;
  error: string | null;
  transcript_version: number;
  created_at: string;
  updated_at: string;
  raw_english_count: number | string;
  english_count: number | string;
  greek_count: number | string;
  key_points: string;
};

/**
 * Lightweight status read for readiness checks and processing telemetry.
 * Deliberately avoids transferring the large transcript TEXT columns from Neon.
 */
export async function getTranscriptStatus(videoId: string): Promise<TranscriptStatusRecord | null> {
  await ensureTranscriptTable();
  const db = database();
  const rows = await db.query(
    `SELECT
      video_id, status, progress, lock_expires_at, processing_stage, processing_cursor,
      retry_count, retry_after, groq_429_streak, groq_cooldown_until, processing_started_at,
      error, transcript_version, created_at, updated_at, key_points,
      jsonb_array_length(COALESCE(NULLIF(raw_english_transcript, ''), '[]')::jsonb) AS raw_english_count,
      jsonb_array_length(COALESCE(NULLIF(english_transcript, ''), '[]')::jsonb) AS english_count,
      jsonb_array_length(COALESCE(NULLIF(greek_transcript, ''), '[]')::jsonb) AS greek_count
     FROM video_transcripts WHERE video_id = $1 LIMIT 1`,
    [videoId],
  ) as StatusRow[];
  const row = rows[0];
  if (!row) return null;
  const greekCount = Number(row.greek_count) || 0;
  const hasReadyGreekTranslation = row.status === "ready" && greekCount > 0;
  return {
    videoId: row.video_id,
    status: row.status,
    progress: row.progress,
    lockExpiresAt: row.lock_expires_at,
    processingStage: row.processing_stage,
    processingCursor: row.processing_cursor || 0,
    retryCount: row.retry_count || 0,
    retryAfter: row.retry_after,
    groq429Streak: row.groq_429_streak || 0,
    groqCooldownUntil: row.groq_cooldown_until,
    processingStartedAt: row.processing_started_at,
    error: row.error,
    transcriptVersion: hasReadyGreekTranslation ? TRANSCRIPT_VERSION : row.transcript_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rawEnglishCount: Number(row.raw_english_count) || 0,
    englishCount: Number(row.english_count) || 0,
    greekCount,
    keyPoints: JSON.parse(row.key_points || "[]") as string[],
  };
}

export async function acquireProcessingLock(videoId: string, token: string, force = false) {'''
replace_once(shared,marker,insert)

route='app/api/captions/route.ts'
replace_once(route,
'''  getTranscript,\n  MAX_TRANSIENT_RETRIES,''',
'''  getTranscript,\n  getTranscriptStatus,\n  MAX_TRANSIENT_RETRIES,''')

marker2='''function processingResponse(record: Awaited<ReturnType<typeof getTranscript>>) {'''
insert2='''function processingStatusResponse(record: Awaited<ReturnType<typeof getTranscriptStatus>>) {
  if (!record) return processingResponse(null);
  const persistedStage = record.processingStage || "source";
  const stage = baseProcessingStage(record.rawEnglishCount && persistedStage === "source" ? "repair" : persistedStage);
  const totalCues = stage === "repair"
    ? record.rawEnglishCount
    : stage === "source_el_finalize"
      ? record.greekCount
      : record.englishCount;
  const cursor = Math.max(0, Math.min(record.processingCursor || 0, totalCues));
  const completed = stage === "finalize" || stage === "source_el_finalize" ? totalCues : cursor;
  let preciseProgress = record.progress;
  if (stage === "repair" && totalCues) preciseProgress = 28 + 20 * (completed / totalCues);
  if (stage === "translate" && totalCues) preciseProgress = 48 + 42 * (completed / totalCues);
  return {
    status: "processing",
    progress: Math.round(preciseProgress * 10) / 10,
    videoId: record.videoId,
    stage,
    cursor,
    totalCues,
    currentCue: totalCues
      ? (stage === "finalize" || stage === "source_el_finalize" ? totalCues : Math.min(totalCues, cursor + 1))
      : 0,
    cueStart: null,
    elapsedSeconds: record.processingStartedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(record.processingStartedAt).getTime()) / 1_000))
      : 0,
    updatedAt: record.updatedAt,
    retryCount: record.retryCount,
    retryAfter: record.retryAfter || null,
    groqCooldownUntil: record.groqCooldownUntil || null,
    keyPoints: record.keyPoints,
    transcriptVersion: TRANSCRIPT_VERSION,
  };
}

function processingResponse(record: Awaited<ReturnType<typeof getTranscript>>) {'''
replace_once(route,marker2,insert2)

old='''    const cached = await getTranscript(videoId);
    if (!cached || cached.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (cached.status === "processing") {
      return NextResponse.json(processingResponse(cached), {
        status: 202,
        headers: { "Cache-Control": "no-store", "Retry-After": "1" },
      });
    }
    if (cached.status !== "ready") {
      return NextResponse.json({ ready: false, status: cached.status, error: cached.error || undefined }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);'''
new='''    const statusRecord = await getTranscriptStatus(videoId);
    if (!statusRecord || statusRecord.transcriptVersion !== TRANSCRIPT_VERSION) {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (statusRecord.status === "processing") {
      return NextResponse.json(processingStatusResponse(statusRecord), {
        status: 202,
        headers: { "Cache-Control": "no-store", "Retry-After": "1", "X-GreekTube-Neon-Read": "status-only" },
      });
    }
    if (statusRecord.status !== "ready") {
      return NextResponse.json({ ready: false, status: statusRecord.status, error: statusRecord.error || undefined }, { status: 409, headers: { "Cache-Control": "no-store", "X-GreekTube-Neon-Read": "status-only" } });
    }

    // A ready transcript without a published Blob is the only viewer GET that needs
    // one full Neon row. It is immediately published, so subsequent reads exit above.
    const cached = await getTranscript(videoId);
    if (!cached || cached.transcriptVersion !== TRANSCRIPT_VERSION || cached.status !== "ready") {
      return NextResponse.json({ ready: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    validateCompleteGreekTranscript(cached.greekTranscript, cached.duration);'''
replace_once(route,old,new)

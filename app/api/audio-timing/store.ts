import { createHash, randomUUID } from "crypto";
import { database } from "@/db/postgres";

export const AUDIO_TIMING_VERSION = 1;

export type AudioSourceCue = {
  cueId: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type AudioMediaInput = {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
};

type JobRow = {
  job_id: string;
  video_id: string;
  transcript_version: number;
  source_hash: string;
  status: "queued" | "processing" | "ready" | "failed";
  stage: string;
  progress: number;
  attempt_count: number;
  max_attempts: number;
  retry_after: string | null;
  heartbeat_at: string | null;
  error_code: string | null;
  error_message: string | null;
  worker_version: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  input_kind: "youtube" | "uploaded_media";
  media_url: string | null;
  media_pathname: string | null;
  media_content_type: string | null;
  media_size_bytes: number | string | null;
  media_expires_at: string | null;
  media_deleted_at: string | null;
};

type ArtifactRow = {
  artifact_id: string;
  video_id: string;
  transcript_version: number;
  source_hash: string;
  timing_version: number;
  timing_source: "whisperx_audio";
  engine: string;
  engine_version: string;
  model: string;
  language: string;
  duration_ms: number;
  word_count: number;
  word_timeline: unknown;
  prosody_map: unknown;
  validation_json: unknown;
  proof_alignment: unknown | null;
  proof_srt: string | null;
  proof_audit: unknown | null;
  worker_version: string;
  created_at: string;
};

let tableCheck: Promise<void> | null = null;
const JOB_COLUMNS = `job_id,video_id,transcript_version,source_hash,status,stage,progress,attempt_count,max_attempts,
  retry_after,heartbeat_at,error_code,error_message,worker_version,created_at,updated_at,completed_at,
  input_kind,media_url,media_pathname,media_content_type,media_size_bytes,media_expires_at,media_deleted_at`;
const MAX_MEDIA_BYTES = 250 * 1024 * 1024;
const MEDIA_CONTENT_TYPES = new Set([
  "audio/webm",
  "video/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
]);

export function ensureAudioTimingTables() {
  if (tableCheck) return tableCheck;
  tableCheck = (async () => {
    const db = database();
    await db.query("SELECT 1 FROM audio_timing_jobs LIMIT 1");
    await db.query("SELECT 1 FROM audio_timing_artifacts LIMIT 1");
  })().catch((error: unknown) => {
    tableCheck = null;
    throw error;
  });
  return tableCheck;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeAudioSourceCues(value: unknown): AudioSourceCue[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) {
    throw new Error("Χρειάζεται έγκυρη λίστα από 1 έως 10.000 English cues.");
  }

  const cues = value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Μη έγκυρο source cue ${index + 1}.`);
    const candidate = item as Record<string, unknown>;
    const cueId = Number(candidate.cueId ?? candidate.cue_id ?? index + 1);
    const startMs = Number(candidate.startMs ?? candidate.start_ms);
    const endMs = Number(candidate.endMs ?? candidate.end_ms);
    const text = normalizeText(candidate.text);
    if (!Number.isInteger(cueId) || cueId <= 0 || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs || !text) {
      throw new Error(`Μη έγκυρο source cue ${index + 1}.`);
    }
    return { cueId, startMs: Math.round(startMs), endMs: Math.round(endMs), text };
  });

  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index].cueId <= cues[index - 1].cueId) {
      throw new Error("Τα source cue IDs πρέπει να είναι αυστηρά αύξοντα.");
    }
  }
  return cues;
}

export function audioSourceHash(cues: AudioSourceCue[]) {
  const hash = createHash("sha256");
  for (const cue of cues) hash.update(`${cue.cueId}|${cue.startMs}|${cue.endMs}|${normalizeText(cue.text)}\n`);
  return hash.digest("hex");
}

export function normalizeAudioMediaInput(value: unknown, videoId: string): AudioMediaInput {
  if (!value || typeof value !== "object") throw new Error("Δεν υπάρχει έγκυρο προσωρινό αρχείο ήχου.");
  const candidate = value as Record<string, unknown>;
  const url = String(candidate.url || "").trim();
  const pathname = String(candidate.pathname || "").replace(/^\/+/, "").trim();
  const contentType = String(candidate.contentType || "").split(";")[0].trim().toLowerCase();
  const size = Number(candidate.size);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Το προσωρινό media URL δεν είναι έγκυρο.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    throw new Error("Το προσωρινό media URL δεν ανήκει στο επιτρεπόμενο storage.");
  }
  if (!pathname.startsWith(`audio-timing-inputs/v1/${videoId}/`) || !parsed.pathname.endsWith(pathname)) {
    throw new Error("Το προσωρινό media pathname δεν αντιστοιχεί στο βίντεο.");
  }
  if (!MEDIA_CONTENT_TYPES.has(contentType)) throw new Error("Ο τύπος του αρχείου ήχου δεν υποστηρίζεται.");
  if (!Number.isInteger(size) || size < 1 || size > MAX_MEDIA_BYTES) {
    throw new Error("Το αρχείο ήχου υπερβαίνει το επιτρεπόμενο μέγεθος.");
  }
  return { url: parsed.toString(), pathname, contentType, size };
}

function jobView(row: JobRow) {
  return {
    jobId: row.job_id,
    videoId: row.video_id,
    transcriptVersion: Number(row.transcript_version),
    sourceHash: row.source_hash,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    retryAfter: row.retry_after,
    heartbeatAt: row.heartbeat_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    workerVersion: row.worker_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    inputKind: row.input_kind,
    mediaReady: row.input_kind === "uploaded_media" && Boolean(row.media_url) && !row.media_deleted_at,
    mediaExpiresAt: row.media_expires_at,
    mediaDeletedAt: row.media_deleted_at,
  };
}

function artifactView(row: ArtifactRow, includePayload: boolean) {
  return {
    artifactId: row.artifact_id,
    videoId: row.video_id,
    transcriptVersion: Number(row.transcript_version),
    sourceHash: row.source_hash,
    timingVersion: Number(row.timing_version),
    timingSource: row.timing_source,
    engine: row.engine,
    engineVersion: row.engine_version,
    model: row.model,
    language: row.language,
    durationMs: Number(row.duration_ms),
    wordCount: Number(row.word_count),
    validation: row.validation_json,
    proofReady: Boolean(row.proof_srt),
    proofAudit: row.proof_audit,
    workerVersion: row.worker_version,
    createdAt: row.created_at,
    ...(includePayload ? {
      wordTimeline: row.word_timeline,
      prosodyMap: row.prosody_map,
      proofAlignment: row.proof_alignment,
      proofSrt: row.proof_srt,
    } : {}),
  };
}

export async function enqueueAudioTimingJob(
  videoId: string,
  transcriptVersion: number,
  sourceCues: AudioSourceCue[],
  media?: AudioMediaInput,
) {
  await ensureAudioTimingTables();
  const db = database();
  const sourceHash = audioSourceHash(sourceCues);

  const artifacts = await db.query(
    `SELECT artifact_id,video_id,transcript_version,source_hash,timing_version,timing_source,engine,engine_version,
      model,language,duration_ms,word_count,word_timeline,prosody_map,validation_json,proof_alignment,proof_srt,
      proof_audit,worker_version,created_at
     FROM audio_timing_artifacts
     WHERE video_id=$1 AND transcript_version=$2 AND source_hash=$3 AND timing_version=$4 LIMIT 1`,
    [videoId, transcriptVersion, sourceHash, AUDIO_TIMING_VERSION],
  ) as ArtifactRow[];
  if (artifacts[0]) return {
    created: false,
    mediaAccepted: false,
    artifact: artifactView(artifacts[0], false),
    job: null,
  };

  const jobId = randomUUID();
  const cleanupToken = media ? randomUUID() : null;
  const mediaExpiresAt = media ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null;
  const inserted = await db.query(
    `INSERT INTO audio_timing_jobs(
       job_id,video_id,transcript_version,source_hash,source_cues,input_kind,media_url,media_pathname,
       media_content_type,media_size_bytes,media_expires_at,media_cleanup_token
     ) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING
     RETURNING ${JOB_COLUMNS}`,
    [
      jobId,
      videoId,
      transcriptVersion,
      sourceHash,
      JSON.stringify(sourceCues),
      media ? "uploaded_media" : "youtube",
      media?.url || null,
      media?.pathname || null,
      media?.contentType || null,
      media?.size || null,
      mediaExpiresAt,
      cleanupToken,
    ],
  ) as JobRow[];
  if (inserted[0]) return { created: true, mediaAccepted: Boolean(media), artifact: null, job: jobView(inserted[0]) };

  const existing = await db.query(
    `SELECT ${JOB_COLUMNS}
     FROM audio_timing_jobs
     WHERE video_id=$1 AND transcript_version=$2 AND source_hash=$3 AND status IN ('queued','processing')
     ORDER BY created_at DESC LIMIT 1`,
    [videoId, transcriptVersion, sourceHash],
  ) as JobRow[];
  if (!existing[0]) throw new Error("Δεν δημιουργήθηκε ούτε βρέθηκε ενεργό audio timing job.");
  if (media && existing[0].status === "queued") {
    const updated = await db.query(
      `UPDATE audio_timing_jobs
       SET input_kind='uploaded_media',media_url=$1,media_pathname=$2,media_content_type=$3,
         media_size_bytes=$4,media_expires_at=$5,media_cleanup_token=$6,media_deleted_at=NULL,updated_at=NOW()
       WHERE job_id=$7::uuid AND status='queued'
       RETURNING ${JOB_COLUMNS}`,
      [media.url, media.pathname, media.contentType, media.size, mediaExpiresAt, cleanupToken, existing[0].job_id],
    ) as JobRow[];
    if (updated[0]) return {
      created: false,
      mediaAccepted: true,
      replacedMediaUrl: existing[0].media_url,
      artifact: null,
      job: jobView(updated[0]),
    };
  }
  return { created: false, mediaAccepted: false, artifact: null, job: jobView(existing[0]) };
}

export async function getAudioTimingState(options: { jobId?: string; videoId?: string; includePayload?: boolean }) {
  await ensureAudioTimingTables();
  const db = database();
  let jobs: JobRow[] = [];
  if (options.jobId) {
    jobs = await db.query(
      `SELECT ${JOB_COLUMNS} FROM audio_timing_jobs WHERE job_id=$1 LIMIT 1`,
      [options.jobId],
    ) as JobRow[];
  } else if (options.videoId) {
    jobs = await db.query(
      `SELECT ${JOB_COLUMNS} FROM audio_timing_jobs WHERE video_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [options.videoId],
    ) as JobRow[];
  }

  const job = jobs[0];
  const videoId = job?.video_id || options.videoId;
  const artifacts = videoId ? await db.query(
    `SELECT artifact_id,video_id,transcript_version,source_hash,timing_version,timing_source,engine,engine_version,
      model,language,duration_ms,word_count,word_timeline,prosody_map,validation_json,proof_alignment,proof_srt,
      proof_audit,worker_version,created_at
     FROM audio_timing_artifacts WHERE video_id=$1
     ORDER BY transcript_version DESC,timing_version DESC,created_at DESC LIMIT 1`,
    [videoId],
  ) as ArtifactRow[] : [];
  return {
    job: job ? jobView(job) : null,
    artifact: artifacts[0] ? artifactView(artifacts[0], Boolean(options.includePayload)) : null,
  };
}

export async function claimAudioMediaCleanup(jobId: string, cleanupToken: string) {
  await ensureAudioTimingTables();
  const db = database();
  const rows = await db.query(
    `UPDATE audio_timing_jobs
     SET media_deleted_at=NOW(),updated_at=NOW()
     WHERE job_id=$1::uuid AND media_cleanup_token=$2 AND input_kind='uploaded_media'
       AND media_deleted_at IS NULL AND status IN ('ready','failed')
     RETURNING media_url,media_pathname`,
    [jobId, cleanupToken],
  ) as Array<{ media_url: string; media_pathname: string }>;
  return rows[0] || null;
}

export async function releaseAudioMediaCleanup(jobId: string, cleanupToken: string) {
  await ensureAudioTimingTables();
  const db = database();
  await db.query(
    `UPDATE audio_timing_jobs SET media_deleted_at=NULL,updated_at=NOW()
     WHERE job_id=$1::uuid AND media_cleanup_token=$2 AND input_kind='uploaded_media'`,
    [jobId, cleanupToken],
  );
}

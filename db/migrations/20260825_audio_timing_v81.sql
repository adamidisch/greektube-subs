CREATE TABLE IF NOT EXISTS audio_timing_jobs (
  job_id UUID PRIMARY KEY,
  video_id TEXT NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  transcript_version INTEGER NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
  source_cues JSONB NOT NULL CHECK (jsonb_typeof(source_cues) = 'array'),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  stage TEXT NOT NULL DEFAULT 'queued',
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  retry_after TIMESTAMPTZ,
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  worker_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS audio_timing_jobs_one_active_source
  ON audio_timing_jobs(video_id, transcript_version, source_hash)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS audio_timing_jobs_claim
  ON audio_timing_jobs(status, retry_after, created_at);

CREATE TABLE IF NOT EXISTS audio_timing_artifacts (
  artifact_id UUID PRIMARY KEY,
  video_id TEXT NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  transcript_version INTEGER NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
  timing_version INTEGER NOT NULL CHECK (timing_version > 0),
  timing_source TEXT NOT NULL CHECK (timing_source IN ('whisperx_audio')),
  engine TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  model TEXT NOT NULL,
  language TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  word_count INTEGER NOT NULL CHECK (word_count >= 0),
  word_timeline JSONB NOT NULL CHECK (jsonb_typeof(word_timeline) = 'array'),
  prosody_map JSONB NOT NULL CHECK (jsonb_typeof(prosody_map) = 'array'),
  validation_json JSONB NOT NULL CHECK (jsonb_typeof(validation_json) = 'object'),
  worker_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(video_id, transcript_version, source_hash, timing_version)
);

CREATE INDEX IF NOT EXISTS audio_timing_artifacts_lookup
  ON audio_timing_artifacts(video_id, transcript_version, created_at DESC);

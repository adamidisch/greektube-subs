ALTER TABLE audio_timing_jobs
  ADD COLUMN IF NOT EXISTS input_kind TEXT NOT NULL DEFAULT 'youtube'
    CHECK (input_kind IN ('youtube', 'uploaded_media')),
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_pathname TEXT,
  ADD COLUMN IF NOT EXISTS media_content_type TEXT,
  ADD COLUMN IF NOT EXISTS media_size_bytes BIGINT
    CHECK (media_size_bytes IS NULL OR media_size_bytes BETWEEN 1 AND 262144000),
  ADD COLUMN IF NOT EXISTS media_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS media_cleanup_token TEXT,
  ADD COLUMN IF NOT EXISTS media_deleted_at TIMESTAMPTZ;

ALTER TABLE audio_timing_jobs
  DROP CONSTRAINT IF EXISTS audio_timing_jobs_media_input_complete;

ALTER TABLE audio_timing_jobs
  ADD CONSTRAINT audio_timing_jobs_media_input_complete CHECK (
    input_kind = 'youtube'
    OR (
      media_url IS NOT NULL
      AND media_pathname IS NOT NULL
      AND media_content_type IS NOT NULL
      AND media_size_bytes IS NOT NULL
      AND media_expires_at IS NOT NULL
      AND media_cleanup_token IS NOT NULL
    )
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS audio_timing_jobs_media_cleanup
  ON audio_timing_jobs(media_expires_at)
  WHERE input_kind = 'uploaded_media' AND media_deleted_at IS NULL;

ALTER TABLE audio_timing_artifacts
  ADD COLUMN IF NOT EXISTS proof_alignment JSONB,
  ADD COLUMN IF NOT EXISTS proof_srt TEXT,
  ADD COLUMN IF NOT EXISTS proof_audit JSONB;

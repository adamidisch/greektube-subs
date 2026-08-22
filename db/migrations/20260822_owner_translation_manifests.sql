-- Explicit additive migration for the generic owner translation workflow.
CREATE TABLE IF NOT EXISTS owner_translation_manifests (
  video_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  transcript_version INTEGER NOT NULL,
  cue_count INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  timestamp_hash TEXT NOT NULL,
  source_blob_path TEXT NOT NULL,
  greek_draft_blob_path TEXT,
  greek_draft_hash TEXT,
  status TEXT NOT NULL DEFAULT 'frozen',
  translation_mode TEXT NOT NULL DEFAULT 'owner',
  translation_method TEXT NOT NULL DEFAULT 'manual_chatgpt_pro_v1',
  validation_json TEXT,
  owner_locked_at TEXT NOT NULL,
  validated_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (video_id, revision)
);

CREATE INDEX IF NOT EXISTS owner_translation_video_status_idx
  ON owner_translation_manifests (video_id, status, revision DESC);

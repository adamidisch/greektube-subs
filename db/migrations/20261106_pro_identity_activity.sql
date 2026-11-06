-- GreekTube account and activity foundation, additive only.
-- Auth users and live sessions are managed by Neon Auth (neon_auth schema).
-- These tables contain application audit and consent metadata, not passwords or bearer tokens.
-- Existing user_profiles, personal_states and anonymous cookies remain untouched.

CREATE TABLE IF NOT EXISTS gt_account_links (
  device_owner_key TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linkage_method TEXT NOT NULL DEFAULT 'explicit_verified_session',
  CONSTRAINT gt_account_links_owner CHECK (device_owner_key LIKE 'anon:%'),
  CONSTRAINT gt_account_links_method CHECK (linkage_method = 'explicit_verified_session')
);
CREATE UNIQUE INDEX IF NOT EXISTS gt_account_links_one_per_user_idx ON gt_account_links(auth_user_id);

CREATE TABLE IF NOT EXISTS gt_user_sessions (
  session_id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'unknown',
  signed_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_out_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS gt_user_sessions_user_recent_idx ON gt_user_sessions(auth_user_id, signed_in_at DESC);

CREATE TABLE IF NOT EXISTS gt_user_privacy_preferences (
  device_owner_key TEXT PRIMARY KEY,
  detailed_activity BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gt_user_activity_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT NOT NULL DEFAULT '',
  device_owner_key TEXT NOT NULL DEFAULT '',
  auth_user_id TEXT NOT NULL DEFAULT '',
  event_name TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '/',
  video_id TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  CONSTRAINT gt_activity_event_allowed CHECK (event_name IN (
    'page_view','click','video_open','video_watch','video_progress','search',
    'filter','share','favorite','fullscreen','speed','subtitle','session_end',
    'sign_in','sign_out','session_restore'
  )),
  CONSTRAINT gt_activity_identity_present CHECK (device_owner_key <> '' OR auth_user_id <> '')
);
CREATE INDEX IF NOT EXISTS gt_user_activity_owner_time_idx ON gt_user_activity_events(device_owner_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS gt_user_activity_user_time_idx ON gt_user_activity_events(auth_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS gt_user_activity_retention_idx ON gt_user_activity_events(retention_until);

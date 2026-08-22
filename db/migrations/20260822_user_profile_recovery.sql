-- Additive, idempotent schema for anonymous profiles and audited recovery runs.
CREATE TABLE IF NOT EXISTS user_profiles (
  public_id BIGSERIAL PRIMARY KEY,
  owner_key TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  username_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_owner_key_key
  ON user_profiles (owner_key);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key
  ON user_profiles (username);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key_key
  ON user_profiles (username_key);

CREATE TABLE IF NOT EXISTS user_profile_backfill_log (
  run_id TEXT NOT NULL,
  public_id BIGINT NOT NULL,
  owner_key TEXT NOT NULL,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  logged_at TEXT NOT NULL,
  rolled_back_at TEXT,
  PRIMARY KEY (run_id, owner_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profile_backfill_run_public_id_idx
  ON user_profile_backfill_log (run_id, public_id);

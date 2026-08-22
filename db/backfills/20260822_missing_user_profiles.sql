-- Idempotent recovery for valid identities that already own personal state.
-- Run only after 20260822_user_profile_recovery.sql.
BEGIN;

CREATE TEMP TABLE profile_backfill_inserted (
  public_id BIGINT PRIMARY KEY,
  owner_key TEXT NOT NULL UNIQUE
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO user_profiles (owner_key, username, username_key, created_at, updated_at)
  SELECT personal.owner_key, NULL, NULL, personal.created_at, transaction_timestamp()::text
  FROM personal_states AS personal
  LEFT JOIN user_profiles AS profile USING (owner_key)
  WHERE profile.owner_key IS NULL
    AND personal.owner_key ~ '^(anon:[A-Za-z0-9-]{12,80}|user:[0-9a-f]{64})$'
  ORDER BY personal.created_at, personal.owner_key
  ON CONFLICT (owner_key) DO NOTHING
  RETURNING public_id, owner_key
)
INSERT INTO profile_backfill_inserted (public_id, owner_key)
SELECT public_id, owner_key FROM inserted;

UPDATE user_profiles AS profile
SET username = 'User' || (profile.public_id + 1000)::text,
    username_key = lower('User' || (profile.public_id + 1000)::text),
    updated_at = transaction_timestamp()::text
FROM profile_backfill_inserted AS inserted
WHERE profile.public_id = inserted.public_id
  AND profile.owner_key = inserted.owner_key
  AND profile.username IS NULL
  AND profile.username_key IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM profile_backfill_inserted AS inserted
    JOIN user_profiles AS profile USING (public_id, owner_key)
    WHERE profile.username IS NULL OR profile.username_key IS NULL
  ) THEN
    RAISE EXCEPTION 'Profile backfill left unnamed rows; transaction aborted.';
  END IF;
END $$;

INSERT INTO user_profile_backfill_log (
  run_id, public_id, owner_key, username, username_key,
  created_at, updated_at, logged_at, rolled_back_at
)
SELECT
  'legacy-personal-states-20260822-v1',
  profile.public_id,
  profile.owner_key,
  profile.username,
  profile.username_key,
  profile.created_at,
  profile.updated_at,
  transaction_timestamp()::text,
  NULL
FROM profile_backfill_inserted AS inserted
JOIN user_profiles AS profile USING (public_id, owner_key)
ON CONFLICT (run_id, owner_key) DO UPDATE
SET public_id = EXCLUDED.public_id,
    username = EXCLUDED.username,
    username_key = EXCLUDED.username_key,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at,
    logged_at = EXCLUDED.logged_at,
    rolled_back_at = NULL;

COMMIT;

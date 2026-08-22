-- Manual recovery only. Deletes exclusively unchanged rows recorded by the run.
BEGIN;

CREATE TEMP TABLE profile_backfill_rolled_back (
  owner_key TEXT PRIMARY KEY
) ON COMMIT DROP;

WITH deleted AS (
  DELETE FROM user_profiles AS profile
  USING user_profile_backfill_log AS log
  WHERE log.run_id = 'legacy-personal-states-20260822-v1'
    AND log.rolled_back_at IS NULL
    AND profile.public_id = log.public_id
    AND profile.owner_key = log.owner_key
    AND profile.username = log.username
    AND profile.username_key = log.username_key
    AND profile.created_at = log.created_at
    AND profile.updated_at = log.updated_at
  RETURNING profile.owner_key
)
INSERT INTO profile_backfill_rolled_back (owner_key)
SELECT owner_key FROM deleted;

UPDATE user_profile_backfill_log AS log
SET rolled_back_at = transaction_timestamp()::text
FROM profile_backfill_rolled_back AS rolled_back
WHERE log.run_id = 'legacy-personal-states-20260822-v1'
  AND log.owner_key = rolled_back.owner_key;

COMMIT;

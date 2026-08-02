BEGIN;

ALTER TABLE co_production.notification_preferences
  ADD COLUMN IF NOT EXISTS authority_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE co_production.notification_preferences
SET updated_by = user_id
WHERE updated_by IS NULL;

ALTER TABLE co_production.notification_preferences
  ALTER COLUMN updated_by SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE co_production.notification_preferences
    ADD CONSTRAINT notification_preferences_authority_version_check
    CHECK (authority_version BETWEEN 1 AND 2147483647);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE co_production.notification_preferences
    ADD CONSTRAINT notification_preferences_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

CREATE OR REPLACE FUNCTION co_production.update_notification_preferences(
  p_expected_versions jsonb,
  p_preferences jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  allowed_events constant text[] := ARRAY[
    'comment_added',
    'comment_resolved',
    'comment_reply',
    'approval_requested',
    'approval_decided',
    'asset_uploaded',
    'version_uploaded',
    'share_link_viewed',
    'mention'
  ]::text[];
  event_name text;
  requested jsonb;
  expected_version integer;
  before_row jsonb;
  after_row jsonb;
  before_rows jsonb := '[]'::jsonb;
  after_rows jsonb := '[]'::jsonb;
BEGIN
  IF p_request_id IS NULL
    OR p_expected_versions IS NULL
    OR pg_catalog.jsonb_typeof(p_expected_versions) <> 'object'
    OR p_preferences IS NULL
    OR pg_catalog.jsonb_typeof(p_preferences) <> 'object'
    OR p_preferences = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification_preferences_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_preferences) AS key
    WHERE key <> ALL(allowed_events)
      OR NOT p_expected_versions ? key
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_expected_versions) AS key
    WHERE NOT p_preferences ? key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification_preferences_invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text, 441918736)
  );

  FOR event_name, requested IN
    SELECT key, value
    FROM pg_catalog.jsonb_each(p_preferences)
    ORDER BY key
  LOOP
    BEGIN
      expected_version := (p_expected_versions ->> event_name)::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification_preferences_invalid';
    END;

    IF expected_version IS NULL
      OR expected_version < 0
      OR expected_version >= 2147483647
      OR pg_catalog.jsonb_typeof(requested) <> 'object'
      OR NOT requested ?& ARRAY['email_enabled', 'email_frequency', 'in_app_enabled']
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_object_keys(requested) AS key
        WHERE key <> ALL(ARRAY['email_enabled', 'email_frequency', 'in_app_enabled']::text[])
      )
      OR pg_catalog.jsonb_typeof(requested -> 'email_enabled') <> 'boolean'
      OR pg_catalog.jsonb_typeof(requested -> 'in_app_enabled') <> 'boolean'
      OR requested ->> 'email_frequency' NOT IN ('instant', 'daily', 'weekly', 'off') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'notification_preferences_invalid';
    END IF;

    before_row := NULL;
    SELECT to_jsonb(preference)
    INTO before_row
    FROM co_production.notification_preferences AS preference
    WHERE preference.user_id = actor
      AND preference.event_type = event_name
    FOR UPDATE;

    IF before_row IS NULL THEN
      IF expected_version <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'notification_preferences_version_conflict';
      END IF;

      INSERT INTO co_production.notification_preferences AS preference (
        user_id,
        event_type,
        email_enabled,
        email_frequency,
        in_app_enabled,
        authority_version,
        updated_by
      ) VALUES (
        actor,
        event_name,
        (requested ->> 'email_enabled')::boolean,
        CASE
          WHEN (requested ->> 'email_enabled')::boolean
          THEN requested ->> 'email_frequency'
          ELSE 'off'
        END,
        (requested ->> 'in_app_enabled')::boolean,
        1,
        actor
      )
      RETURNING to_jsonb(preference) INTO after_row;
    ELSE
      IF (before_row ->> 'authority_version')::integer <> expected_version THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'notification_preferences_version_conflict';
      END IF;

      UPDATE co_production.notification_preferences AS preference
      SET
        email_enabled = (requested ->> 'email_enabled')::boolean,
        email_frequency = CASE
          WHEN (requested ->> 'email_enabled')::boolean
          THEN requested ->> 'email_frequency'
          ELSE 'off'
        END,
        in_app_enabled = (requested ->> 'in_app_enabled')::boolean,
        authority_version = preference.authority_version + 1,
        updated_by = actor
      WHERE preference.user_id = actor
        AND preference.event_type = event_name
        AND preference.authority_version = expected_version
      RETURNING to_jsonb(preference) INTO after_row;

      IF after_row IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'notification_preferences_version_conflict';
      END IF;
    END IF;

    before_rows := before_rows || pg_catalog.jsonb_build_array(before_row);
    after_rows := after_rows || pg_catalog.jsonb_build_array(after_row);
  END LOOP;

  PERFORM co_production_private.append_identity_audit(
    NULL,
    actor,
    p_request_id,
    'notification.preferences.updated',
    'user',
    actor::text,
    before_rows,
    after_rows
  );

  RETURN after_rows;
END
$$;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE co_production.notification_preferences
  FROM authenticated;
REVOKE ALL
  ON FUNCTION co_production.update_notification_preferences(jsonb, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE
  ON FUNCTION co_production.update_notification_preferences(jsonb, jsonb, uuid)
  TO authenticated;

COMMIT;

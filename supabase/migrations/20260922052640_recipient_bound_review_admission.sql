-- Recipient-bound review admission is source-only until compatibility preflight
-- and explicit CCO-DB application approval. Existing blank reviewer_email links
-- remain bearer admissions; named recipients require a confirmed identity hash.

BEGIN;

DROP FUNCTION IF EXISTS co_production.admit_review_invite(text, uuid, text);

CREATE OR REPLACE FUNCTION co_production.admit_review_invite(
  p_token_hash text,
  p_admission_id uuid,
  p_network_bucket text,
  p_recipient_hash text
)
RETURNS TABLE (
  admission_status text,
  admission_id uuid,
  invite_id uuid,
  asset_id uuid,
  version_id uuid,
  admission_expires_at timestamptz,
  view_count integer,
  max_views integer,
  recipient_required boolean,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  admitted_invite record;
  existing_admission record;
  network_window_start timestamptz;
  invite_window_start timestamptz;
  network_attempt_count integer;
  invite_attempt_count integer;
  invite_bucket text;
  active_admission_count integer;
  new_expires_at timestamptz;
  updated_view_count integer;
BEGIN
  admission_status := 'unavailable';
  recipient_required := false;
  retry_after_seconds := NULL;

  IF p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_admission_id IS NULL
     OR p_network_bucket IS NULL
     OR p_network_bucket !~ '^[0-9a-f]{64}$'
     OR (
       p_recipient_hash IS NOT NULL
       AND p_recipient_hash !~ '^[0-9a-f]{64}$'
     ) THEN
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_admission_id::text, 0)
  );

  WITH expired_admissions AS (
    SELECT id
    FROM co_production.review_view_admissions
    WHERE expires_at <= now()
    ORDER BY expires_at
    LIMIT 128
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM co_production.review_view_admissions AS admission
  USING expired_admissions
  WHERE admission.id = expired_admissions.id;

  WITH expired_rate_limits AS (
    SELECT bucket_kind, bucket_hash, window_start
    FROM co_production.review_admission_rate_limits
    WHERE window_start < now() - interval '1 day'
    ORDER BY window_start
    LIMIT 128
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM co_production.review_admission_rate_limits AS rate_limit
  USING expired_rate_limits
  WHERE rate_limit.bucket_kind = expired_rate_limits.bucket_kind
    AND rate_limit.bucket_hash = expired_rate_limits.bucket_hash
    AND rate_limit.window_start = expired_rate_limits.window_start;

  network_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / 600) * 600
  );
  INSERT INTO co_production.review_admission_rate_limits (
    bucket_kind,
    bucket_hash,
    window_start,
    attempt_count,
    updated_at
  )
  VALUES (
    'network',
    p_network_bucket,
    network_window_start,
    1,
    clock_timestamp()
  )
  ON CONFLICT (bucket_kind, bucket_hash, window_start)
  DO UPDATE
    SET attempt_count =
          co_production.review_admission_rate_limits.attempt_count + 1,
        updated_at = clock_timestamp()
    WHERE co_production.review_admission_rate_limits.attempt_count < 120
  RETURNING attempt_count INTO network_attempt_count;

  IF network_attempt_count IS NULL THEN
    admission_status := 'rate_limited';
    retry_after_seconds := greatest(
      1,
      ceil(
        extract(
          epoch FROM (
            network_window_start + interval '10 minutes' - clock_timestamp()
          )
        )
      )::integer
    );
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    invite.id,
    invite.asset_id,
    invite.version_id,
    invite.expires_at,
    invite.view_count,
    invite.max_views,
    invite.reviewer_email,
    invite.active,
    invite.password_hash,
    invite.watermark_enabled,
    asset.deleted_at AS asset_deleted_at,
    version.id AS exact_version_id,
    version.source_upload_id,
    version.file_size,
    version.storage_provider,
    version.storage_object_key,
    version.storage_sha256,
    version.storage_provider_version_id,
    version.storage_committed_at,
    version.original_filename,
    version.mime_type
  INTO admitted_invite
  FROM co_production.review_invites AS invite
  LEFT JOIN co_production.assets AS asset
    ON asset.id = invite.asset_id
  LEFT JOIN co_production.versions AS version
    ON version.id = invite.version_id
   AND version.asset_id = invite.asset_id
  WHERE invite.token_hash = p_token_hash
  FOR UPDATE OF invite;

  IF admitted_invite.id IS NULL
     OR admitted_invite.active IS DISTINCT FROM true
     OR (
       admitted_invite.expires_at IS NOT NULL
       AND admitted_invite.expires_at <= now()
     )
     OR admitted_invite.asset_deleted_at IS NOT NULL
     OR admitted_invite.exact_version_id IS NULL THEN
    admission_status := 'unavailable';
    RETURN NEXT;
    RETURN;
  END IF;

  recipient_required :=
    nullif(lower(btrim(admitted_invite.reviewer_email)), '') IS NOT NULL;

  IF recipient_required AND (
    p_recipient_hash IS NULL
    OR p_recipient_hash IS DISTINCT FROM encode(
      extensions.digest(
        lower(btrim(admitted_invite.reviewer_email)),
        'sha256'
      ),
      'hex'
    )
  ) THEN
    admission_status := 'recipient_required';
    RETURN NEXT;
    RETURN;
  END IF;

  IF admitted_invite.password_hash IS NOT NULL THEN
    admission_status := 'password_required';
    RETURN NEXT;
    RETURN;
  END IF;

  IF admitted_invite.watermark_enabled IS DISTINCT FROM false
     OR admitted_invite.source_upload_id IS NULL
     OR admitted_invite.file_size IS NULL
     OR admitted_invite.file_size <= 0
     OR admitted_invite.storage_provider IS NULL
     OR admitted_invite.storage_provider NOT IN (
       'local',
       'ccnas',
       'google-drive',
       'object-store'
     )
     OR admitted_invite.storage_object_key IS NULL
     OR admitted_invite.storage_sha256 IS NULL
     OR admitted_invite.storage_sha256 !~ '^[0-9a-f]{64}$'
     OR admitted_invite.storage_provider_version_id IS NULL
     OR admitted_invite.storage_committed_at IS NULL
     OR admitted_invite.original_filename IS NULL
     OR admitted_invite.mime_type IS NULL THEN
    admission_status := 'media_unavailable';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    admission.id,
    admission.invite_id,
    admission.asset_id,
    admission.version_id,
    admission.token_hash,
    admission.expires_at
  INTO existing_admission
  FROM co_production.review_view_admissions AS admission
  WHERE admission.id = p_admission_id
  FOR UPDATE;

  IF existing_admission.id IS NOT NULL THEN
    IF existing_admission.invite_id IS DISTINCT FROM admitted_invite.id
       OR existing_admission.asset_id IS DISTINCT FROM admitted_invite.asset_id
       OR existing_admission.version_id IS DISTINCT FROM admitted_invite.version_id
       OR existing_admission.token_hash IS DISTINCT FROM p_token_hash
       OR existing_admission.expires_at <= now() THEN
      admission_status := 'unavailable';
      RETURN NEXT;
      RETURN;
    END IF;

    IF admitted_invite.max_views IS NOT NULL
       AND admitted_invite.view_count > admitted_invite.max_views THEN
      admission_status := 'view_limit';
      RETURN NEXT;
      RETURN;
    END IF;

    UPDATE co_production.review_view_admissions
    SET last_seen_at = least(now(), expires_at)
    WHERE review_view_admissions.id = existing_admission.id;

    admission_status := 'admitted';
    admission_id := existing_admission.id;
    invite_id := admitted_invite.id;
    asset_id := admitted_invite.asset_id;
    version_id := admitted_invite.version_id;
    admission_expires_at := existing_admission.expires_at;
    view_count := admitted_invite.view_count;
    max_views := admitted_invite.max_views;
    RETURN NEXT;
    RETURN;
  END IF;

  invite_bucket := encode(
    extensions.digest(admitted_invite.id::text, 'sha256'),
    'hex'
  );
  invite_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / 3600) * 3600
  );
  INSERT INTO co_production.review_admission_rate_limits (
    bucket_kind,
    bucket_hash,
    window_start,
    attempt_count,
    updated_at
  )
  VALUES (
    'invite',
    invite_bucket,
    invite_window_start,
    1,
    clock_timestamp()
  )
  ON CONFLICT (bucket_kind, bucket_hash, window_start)
  DO UPDATE
    SET attempt_count =
          co_production.review_admission_rate_limits.attempt_count + 1,
        updated_at = clock_timestamp()
    WHERE co_production.review_admission_rate_limits.attempt_count < 32
  RETURNING attempt_count INTO invite_attempt_count;

  IF invite_attempt_count IS NULL THEN
    admission_status := 'rate_limited';
    retry_after_seconds := greatest(
      1,
      ceil(
        extract(
          epoch FROM (
            invite_window_start + interval '1 hour' - clock_timestamp()
          )
        )
      )::integer
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF admitted_invite.max_views IS NOT NULL
     AND admitted_invite.view_count >= admitted_invite.max_views THEN
    admission_status := 'view_limit';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*)
  INTO active_admission_count
  FROM co_production.review_view_admissions AS admission
  WHERE admission.invite_id = admitted_invite.id
    AND admission.expires_at > now();

  IF active_admission_count >= 32 THEN
    admission_status := 'admission_limit';
    RETURN NEXT;
    RETURN;
  END IF;

  new_expires_at := least(
    now() + interval '8 hours',
    coalesce(
      admitted_invite.expires_at,
      now() + interval '8 hours'
    )
  );
  IF new_expires_at < now() + interval '5 minutes' THEN
    admission_status := 'unavailable';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO co_production.review_view_admissions (
    id,
    invite_id,
    asset_id,
    version_id,
    token_hash,
    admitted_at,
    expires_at,
    last_seen_at
  )
  VALUES (
    p_admission_id,
    admitted_invite.id,
    admitted_invite.asset_id,
    admitted_invite.version_id,
    p_token_hash,
    now(),
    new_expires_at,
    now()
  );

  UPDATE co_production.review_invites
  SET view_count = review_invites.view_count + 1,
      last_viewed_at = now(),
      updated_at = now()
  WHERE review_invites.id = admitted_invite.id
  RETURNING review_invites.view_count INTO updated_view_count;

  admission_status := 'admitted';
  admission_id := p_admission_id;
  invite_id := admitted_invite.id;
  asset_id := admitted_invite.asset_id;
  version_id := admitted_invite.version_id;
  admission_expires_at := new_expires_at;
  view_count := updated_view_count;
  max_views := admitted_invite.max_views;
  RETURN NEXT;
END;
$$;

-- PostgreSQL cannot replace a function while changing its TABLE return shape.
-- Preserve dependencies: an unexpected dependency must stop this source migration.
DROP FUNCTION IF EXISTS co_production.authorize_review_media(uuid, text);

CREATE FUNCTION co_production.authorize_review_media(
  p_admission_id uuid,
  p_token_hash text
)
RETURNS TABLE (
  admission_id uuid,
  invite_id uuid,
  asset_id uuid,
  version_id uuid,
  admission_expires_at timestamptz,
  reviewer_email text,
  download_enabled boolean,
  watermark_enabled boolean,
  file_size bigint,
  source_upload_id uuid,
  storage_provider text,
  storage_object_key text,
  storage_sha256 text,
  storage_provider_version_id text,
  storage_committed_at timestamptz,
  original_filename text,
  mime_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    admission.id,
    invite.id,
    admission.asset_id,
    admission.version_id,
    admission.expires_at,
    invite.reviewer_email,
    invite.download_enabled,
    invite.watermark_enabled,
    version.file_size,
    version.source_upload_id,
    version.storage_provider,
    version.storage_object_key,
    version.storage_sha256,
    version.storage_provider_version_id,
    version.storage_committed_at,
    version.original_filename,
    version.mime_type
  FROM co_production.review_view_admissions AS admission
  JOIN co_production.review_invites AS invite
    ON invite.id = admission.invite_id
   AND invite.asset_id = admission.asset_id
   AND invite.version_id = admission.version_id
   AND invite.token_hash = admission.token_hash
  JOIN co_production.assets AS asset
    ON asset.id = admission.asset_id
  JOIN co_production.versions AS version
    ON version.id = admission.version_id
   AND version.asset_id = admission.asset_id
  WHERE admission.id = p_admission_id
    AND admission.token_hash = p_token_hash
    AND admission.expires_at > now()
    AND invite.token_hash = p_token_hash
    AND invite.active = true
    AND (invite.expires_at IS NULL OR invite.expires_at > now())
    AND invite.password_hash IS NULL
    AND invite.watermark_enabled = false
    AND (invite.max_views IS NULL OR invite.view_count <= invite.max_views)
    AND asset.deleted_at IS NULL
    AND version.source_upload_id IS NOT NULL
    AND version.file_size IS NOT NULL
    AND version.file_size > 0
    AND version.storage_provider IN (
      'local',
      'ccnas',
      'google-drive',
      'object-store'
    )
    AND version.storage_object_key IS NOT NULL
    AND version.storage_sha256 ~ '^[0-9a-f]{64}$'
    AND version.storage_provider_version_id IS NOT NULL
    AND version.storage_committed_at IS NOT NULL
    AND version.original_filename IS NOT NULL
    AND version.mime_type IS NOT NULL
$$;

REVOKE ALL ON FUNCTION co_production.admit_review_invite(text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.admit_review_invite(text, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION co_production.authorize_review_media(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.authorize_review_media(uuid, text)
  TO service_role;

COMMIT;

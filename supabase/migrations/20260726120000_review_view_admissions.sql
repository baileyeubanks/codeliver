-- Bind one anonymous review session to one live invite and one exact managed
-- media version. Source-only until Bailey approves compatibility preflight and
-- database application.

BEGIN;

ALTER TABLE co_production.review_invites
  ADD CONSTRAINT review_invites_admission_identity_unique
  UNIQUE (id, asset_id, version_id, token_hash);

CREATE TABLE co_production.review_view_admissions (
  id uuid PRIMARY KEY,
  invite_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  version_id uuid NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  admitted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_view_admissions_lifetime_check CHECK (
    expires_at > admitted_at
    AND expires_at <= admitted_at + interval '8 hours'
  ),
  CONSTRAINT review_view_admissions_last_seen_check CHECK (
    last_seen_at >= admitted_at
    AND last_seen_at <= expires_at
  ),
  FOREIGN KEY (invite_id, asset_id, version_id, token_hash)
    REFERENCES co_production.review_invites(
      id,
      asset_id,
      version_id,
      token_hash
    )
    ON DELETE CASCADE
);

CREATE INDEX review_view_admissions_invite_expiry_idx
  ON co_production.review_view_admissions(invite_id, expires_at);
CREATE INDEX review_view_admissions_expiry_idx
  ON co_production.review_view_admissions(expires_at);

CREATE TABLE co_production.review_admission_rate_limits (
  bucket_kind text NOT NULL CHECK (
    bucket_kind IN ('network', 'invite', 'action')
  ),
  bucket_hash text NOT NULL CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_kind, bucket_hash, window_start)
);

CREATE INDEX review_admission_rate_limits_retention_idx
  ON co_production.review_admission_rate_limits(window_start);

ALTER TABLE co_production.review_view_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.review_view_admissions FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.review_admission_rate_limits
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.review_admission_rate_limits
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE co_production.review_view_admissions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE co_production.review_admission_rate_limits
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE co_production.review_view_admissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE co_production.review_admission_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION co_production.admit_review_invite(
  p_token_hash text,
  p_admission_id uuid,
  p_network_bucket text
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
  retry_after_seconds := NULL;

  IF p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_admission_id IS NULL
     OR p_network_bucket IS NULL
     OR p_network_bucket !~ '^[0-9a-f]{64}$' THEN
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

CREATE OR REPLACE FUNCTION co_production.authorize_review_admission(
  p_admission_id uuid,
  p_token_hash text
)
RETURNS TABLE (
  admission_id uuid,
  invite_id uuid,
  asset_id uuid,
  version_id uuid,
  admission_expires_at timestamptz,
  reviewer_name text,
  reviewer_email text,
  permissions text,
  invite_expires_at timestamptz,
  watermark_enabled boolean,
  watermark_text text,
  download_enabled boolean,
  view_count integer,
  max_views integer,
  asset_title text,
  asset_file_type text,
  asset_status text,
  project_id uuid,
  project_name text
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
    invite.reviewer_name,
    invite.reviewer_email,
    invite.permissions,
    invite.expires_at,
    invite.watermark_enabled,
    invite.watermark_text,
    invite.download_enabled,
    invite.view_count,
    invite.max_views,
    asset.title,
    asset.file_type,
    asset.status,
    project.id,
    project.name
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
  JOIN co_production.projects AS project
    ON project.id = asset.project_id
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
$$;

CREATE OR REPLACE FUNCTION co_production.reserve_review_action_rate_limit(
  p_admission_id uuid,
  p_token_hash text,
  p_action text
)
RETURNS TABLE (
  action_status text,
  admission_id uuid,
  invite_id uuid,
  asset_id uuid,
  version_id uuid,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  authorized_admission record;
  action_limit integer;
  action_window_seconds integer := 60;
  action_window_start timestamptz;
  action_bucket text;
  action_attempt_count integer;
BEGIN
  action_status := 'unavailable';
  retry_after_seconds := NULL;

  IF p_admission_id IS NULL
     OR p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_action IS NULL
     OR p_action NOT IN ('comment', 'approval', 'edit_decision') THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    admission.id AS authorized_admission_id,
    admission.invite_id AS authorized_invite_id,
    admission.asset_id AS authorized_asset_id,
    admission.version_id AS authorized_version_id
  INTO authorized_admission
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
  FOR UPDATE OF admission;

  IF authorized_admission.authorized_admission_id IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  action_limit := CASE p_action
    WHEN 'comment' THEN 20
    WHEN 'approval' THEN 10
    WHEN 'edit_decision' THEN 30
  END;
  action_bucket := encode(
    extensions.digest(
      p_admission_id::text || ':' || p_action,
      'sha256'
    ),
    'hex'
  );
  action_window_start := to_timestamp(
    floor(
      extract(epoch FROM clock_timestamp()) / action_window_seconds
    ) * action_window_seconds
  );

  INSERT INTO co_production.review_admission_rate_limits (
    bucket_kind,
    bucket_hash,
    window_start,
    attempt_count,
    updated_at
  )
  VALUES (
    'action',
    action_bucket,
    action_window_start,
    1,
    clock_timestamp()
  )
  ON CONFLICT (bucket_kind, bucket_hash, window_start)
  DO UPDATE
    SET attempt_count =
          co_production.review_admission_rate_limits.attempt_count + 1,
        updated_at = clock_timestamp()
    WHERE co_production.review_admission_rate_limits.attempt_count
          < action_limit
  RETURNING attempt_count INTO action_attempt_count;

  admission_id :=
    authorized_admission.authorized_admission_id;
  invite_id := authorized_admission.authorized_invite_id;
  asset_id := authorized_admission.authorized_asset_id;
  version_id := authorized_admission.authorized_version_id;

  IF action_attempt_count IS NULL THEN
    action_status := 'rate_limited';
    retry_after_seconds := greatest(
      1,
      ceil(
        extract(
          epoch FROM (
            action_window_start
            + make_interval(secs => action_window_seconds)
            - clock_timestamp()
          )
        )
      )::integer
    );
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE co_production.review_view_admissions
  SET last_seen_at = least(clock_timestamp(), expires_at)
  WHERE review_view_admissions.id =
        authorized_admission.authorized_admission_id;

  action_status := 'allowed';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION co_production.authorize_review_media(
  p_admission_id uuid,
  p_token_hash text
)
RETURNS TABLE (
  admission_id uuid,
  invite_id uuid,
  asset_id uuid,
  version_id uuid,
  admission_expires_at timestamptz,
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

CREATE OR REPLACE FUNCTION co_production.prune_review_admission_authority(
  p_limit integer DEFAULT 512
)
RETURNS TABLE (
  deleted_admissions bigint,
  deleted_rate_limits bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  WITH expired_admissions AS (
    SELECT id
    FROM co_production.review_view_admissions
    WHERE expires_at <= now()
    ORDER BY expires_at
    LIMIT least(greatest(coalesce(p_limit, 512), 1), 5000)
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM co_production.review_view_admissions AS admission
    USING expired_admissions
    WHERE admission.id = expired_admissions.id
    RETURNING 1
  )
  SELECT count(*) INTO deleted_admissions FROM deleted;

  WITH expired_rate_limits AS (
    SELECT bucket_kind, bucket_hash, window_start
    FROM co_production.review_admission_rate_limits
    WHERE window_start < now() - interval '1 day'
    ORDER BY window_start
    LIMIT least(greatest(coalesce(p_limit, 512), 1), 5000)
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM co_production.review_admission_rate_limits AS rate_limit
    USING expired_rate_limits
    WHERE rate_limit.bucket_kind = expired_rate_limits.bucket_kind
      AND rate_limit.bucket_hash = expired_rate_limits.bucket_hash
      AND rate_limit.window_start = expired_rate_limits.window_start
    RETURNING 1
  )
  SELECT count(*) INTO deleted_rate_limits FROM deleted;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION co_production.admit_review_invite(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.admit_review_invite(text, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION co_production.authorize_review_admission(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION co_production.authorize_review_admission(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION co_production.authorize_review_media(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.authorize_review_media(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION
  co_production.reserve_review_action_rate_limit(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.reserve_review_action_rate_limit(uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION
  co_production.prune_review_admission_authority(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.prune_review_admission_authority(integer)
  TO service_role;

COMMIT;

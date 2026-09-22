-- Attach one clean, committed canonical TUS upload as the immutable next
-- version of an existing asset. Created with
-- `supabase migration new attach_committed_upload_revision`.
--
-- The long-running upload pins the exact current version it started from.
-- This transaction locks the receipt identities and asset, then compares that
-- pin before it moves the current pointer. Historical review and approval
-- records are deliberately untouched.

BEGIN;

ALTER TABLE co_production.versions
  ADD COLUMN previous_version_id uuid
  REFERENCES co_production.versions(id) ON DELETE RESTRICT;

CREATE INDEX versions_previous_version_idx
  ON co_production.versions(previous_version_id)
  WHERE previous_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION co_production.attach_committed_upload_revision(
  p_actor_id uuid,
  p_upload_id uuid,
  p_asset_id uuid,
  p_project_id uuid,
  p_expected_current_version_id uuid,
  p_expected_version_number integer,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_storage_provider text,
  p_storage_object_key text,
  p_storage_sha256 text,
  p_storage_provider_version_id text,
  p_storage_committed_at timestamptz
)
RETURNS TABLE (
  id uuid,
  version_id uuid,
  version_number integer,
  file_url text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_asset record;
  v_current_version_id uuid;
  v_current_version_number integer;
  v_current_count integer;
  v_next_version_number integer;
  v_version_id uuid;
  v_file_url text;
  v_existing record;
  v_existing_count integer;
  v_delivery record;
  v_updated_count integer;
BEGIN
  IF p_actor_id IS NULL
     OR p_upload_id IS NULL
     OR p_asset_id IS NULL
     OR p_project_id IS NULL
     OR p_expected_current_version_id IS NULL
     OR p_expected_version_number IS NULL
     OR p_expected_version_number < 2
     OR p_file_size IS NULL
     OR p_file_size <= 0
     OR p_storage_provider IS NULL
     OR p_storage_provider NOT IN ('local', 'ccnas', 'google-drive', 'object-store')
     OR p_storage_object_key IS NULL
     OR length(p_storage_object_key) NOT BETWEEN 1 AND 2048
     OR p_storage_object_key ~ '[[:cntrl:]\\]'
     OR p_storage_object_key ~ '(^/|(^|/)\.\.(/|$))'
     OR p_storage_sha256 IS NULL
     OR p_storage_sha256 !~ '^[0-9a-f]{64}$'
     OR p_storage_provider_version_id IS NULL
     OR length(p_storage_provider_version_id) NOT BETWEEN 1 AND 1024
     OR p_storage_provider_version_id ~ '[[:cntrl:]]'
     OR p_storage_committed_at IS NULL
     OR p_original_filename IS NULL
     OR length(btrim(p_original_filename)) NOT BETWEEN 1 AND 512
     OR p_original_filename ~ '[[:cntrl:]]'
     OR p_mime_type IS NULL
     OR length(btrim(p_mime_type)) NOT BETWEEN 1 AND 256
     OR p_mime_type ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid committed revision upload input'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM co_production.projects AS project
    WHERE project.id = p_project_id
      AND (
        project.owner_id = p_actor_id
        OR EXISTS (
          SELECT 1
          FROM co_production.project_members AS member
          WHERE member.project_id = project.id
            AND member.user_id = p_actor_id
            AND (member.expires_at IS NULL OR member.expires_at > now())
            AND co_production_private.role_rank(member.role) >= 60
        )
        OR (
          project.team_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM co_production.teams AS team
            WHERE team.id = project.team_id
              AND (
                team.owner_id = p_actor_id
                OR EXISTS (
                  SELECT 1
                  FROM co_production.team_members AS member
                  WHERE member.team_id = team.id
                    AND member.user_id = p_actor_id
                    AND co_production_private.role_rank(member.role) >= 60
                )
              )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'committed revision upload authority denied'
      USING ERRCODE = '42501';
  END IF;

  -- A single order for all revision writers prevents upload/object/asset
  -- attachment races. The asset key serializes next-number calculation.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('co_production.upload:' || p_upload_id::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'co_production.object:' || p_storage_provider || ':' || p_storage_object_key,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('co_production.asset:' || p_asset_id::text, 0)
  );

  SELECT asset.id, asset.project_id, asset.deleted_at
  INTO v_asset
  FROM co_production.assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF v_asset.id IS NULL
     OR v_asset.project_id IS DISTINCT FROM p_project_id
     OR v_asset.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'revision asset is unavailable'
      USING ERRCODE = '42501';
  END IF;

  -- An exact receipt retry may arrive after a later version has become
  -- current. It is safe to return only when the immutable parent and every
  -- storage identity still match the original request.
  SELECT count(*)::integer
  INTO v_existing_count
  FROM co_production.versions AS version
  WHERE version.source_upload_id = p_upload_id
     OR (
       version.storage_provider = p_storage_provider
       AND version.storage_object_key = p_storage_object_key
     );

  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'committed revision upload has conflicting receipt identities'
      USING ERRCODE = '23505';
  END IF;

  SELECT
    version.id AS version_id,
    version.asset_id,
    version.version_number,
    version.file_url,
    version.file_size,
    version.uploaded_by,
    version.previous_version_id,
    version.source_upload_id,
    version.storage_provider,
    version.storage_object_key,
    version.storage_sha256,
    version.storage_provider_version_id,
    version.storage_committed_at,
    version.original_filename,
    version.mime_type
  INTO v_existing
  FROM co_production.versions AS version
  WHERE version.source_upload_id = p_upload_id
     OR (
       version.storage_provider = p_storage_provider
       AND version.storage_object_key = p_storage_object_key
     )
  ORDER BY
    CASE WHEN version.source_upload_id = p_upload_id THEN 0 ELSE 1 END,
    version.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_existing.version_id IS NOT NULL THEN
    v_file_url := '/api/media/versions/' || v_existing.version_id::text;
    IF v_existing.asset_id IS DISTINCT FROM p_asset_id
       OR v_existing.version_number IS DISTINCT FROM p_expected_version_number
       OR v_existing.file_url IS DISTINCT FROM v_file_url
       OR v_existing.file_size IS DISTINCT FROM p_file_size
       OR v_existing.uploaded_by IS DISTINCT FROM p_actor_id
       OR v_existing.previous_version_id IS DISTINCT FROM p_expected_current_version_id
       OR v_existing.source_upload_id IS DISTINCT FROM p_upload_id
       OR v_existing.storage_provider IS DISTINCT FROM p_storage_provider
       OR v_existing.storage_object_key IS DISTINCT FROM p_storage_object_key
       OR v_existing.storage_sha256 IS DISTINCT FROM p_storage_sha256
       OR v_existing.storage_provider_version_id IS DISTINCT FROM p_storage_provider_version_id
       OR v_existing.storage_committed_at IS DISTINCT FROM p_storage_committed_at
       OR v_existing.original_filename IS DISTINCT FROM p_original_filename
       OR v_existing.mime_type IS DISTINCT FROM p_mime_type THEN
      RAISE EXCEPTION 'committed revision upload identity conflicts with catalog state'
        USING ERRCODE = '23505';
    END IF;

    RETURN QUERY
      SELECT p_asset_id, v_existing.version_id, v_existing.version_number, v_existing.file_url;
    RETURN;
  END IF;

  -- Lock every delivery currently containing the asset. This serializes with
  -- a concurrent delivery lock update and refuses revision after lock.
  FOR v_delivery IN
    SELECT delivery.id, delivery.locked_at
    FROM co_production.deliverable_items AS item
    JOIN co_production.deliverables AS delivery
      ON delivery.id = item.deliverable_id
    WHERE item.asset_id = p_asset_id
    ORDER BY delivery.id
    FOR SHARE OF delivery
  LOOP
    IF v_delivery.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'asset is part of a locked delivery'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT count(*)::integer
  INTO v_current_count
  FROM co_production.versions AS version
  WHERE version.asset_id = p_asset_id
    AND version.is_current;

  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'revision asset does not have exactly one current version'
      USING ERRCODE = '22023';
  END IF;

  SELECT version.id, version.version_number
  INTO v_current_version_id, v_current_version_number
  FROM co_production.versions AS version
  WHERE version.asset_id = p_asset_id
    AND version.is_current
  FOR UPDATE;

  IF v_current_version_id IS DISTINCT FROM p_expected_current_version_id THEN
    RAISE EXCEPTION 'revision current version changed'
      USING ERRCODE = '40001';
  END IF;

  SELECT coalesce(max(version.version_number), 0) + 1
  INTO v_next_version_number
  FROM co_production.versions AS version
  WHERE version.asset_id = p_asset_id;

  IF v_next_version_number IS DISTINCT FROM p_expected_version_number
     OR v_next_version_number IS DISTINCT FROM v_current_version_number + 1 THEN
    RAISE EXCEPTION 'revision version number changed'
      USING ERRCODE = '40001';
  END IF;

  v_version_id := extensions.gen_random_uuid();
  v_file_url := '/api/media/versions/' || v_version_id::text;

  UPDATE co_production.versions
  SET is_current = false
  WHERE versions.asset_id = p_asset_id
    AND versions.id = p_expected_current_version_id
    AND versions.is_current;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'revision current version changed during attachment'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO co_production.versions (
    id,
    asset_id,
    version_number,
    file_url,
    file_size,
    uploaded_by,
    is_current,
    previous_version_id,
    source_upload_id,
    storage_provider,
    storage_object_key,
    storage_sha256,
    storage_provider_version_id,
    storage_committed_at,
    original_filename,
    mime_type
  )
  VALUES (
    v_version_id,
    p_asset_id,
    v_next_version_number,
    v_file_url,
    p_file_size,
    p_actor_id,
    true,
    p_expected_current_version_id,
    p_upload_id,
    p_storage_provider,
    p_storage_object_key,
    p_storage_sha256,
    p_storage_provider_version_id,
    p_storage_committed_at,
    p_original_filename,
    p_mime_type
  );

  UPDATE co_production.assets
  SET file_url = v_file_url,
      nas_path = p_storage_object_key,
      file_size = p_file_size,
      thumbnail_url = NULL,
      proxy_url = NULL,
      duration_seconds = NULL,
      status = 'in_review',
      metadata = metadata || pg_catalog.jsonb_build_object(
        'upload',
        pg_catalog.jsonb_build_object(
          'schema_version', 1,
          'source_upload_id', p_upload_id,
          'storage_provider', p_storage_provider,
          'version_id', v_version_id
        )
      ),
      updated_at = now()
  WHERE assets.id = p_asset_id;

  RETURN QUERY
    SELECT p_asset_id, v_version_id, v_next_version_number, v_file_url;
END;
$$;

REVOKE ALL ON FUNCTION co_production.attach_committed_upload_revision(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION co_production.attach_committed_upload_revision(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  timestamptz
) TO service_role;

COMMIT;

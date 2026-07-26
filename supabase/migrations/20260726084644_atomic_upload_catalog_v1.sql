-- Bind one clean, committed upload to one asset and one exact V1.
-- Created with `supabase migration new atomic_upload_catalog_v1`.
--
-- The function is deliberately service-role-only. The application still
-- authorizes the upload target before accepting bytes, and this transaction
-- independently re-checks the supplied actor against the canonical
-- co_production project authority before creating catalog records.

BEGIN;

ALTER TABLE co_production.versions
  ADD COLUMN source_upload_id uuid,
  ADD COLUMN storage_provider text,
  ADD COLUMN storage_object_key text,
  ADD COLUMN storage_sha256 text,
  ADD COLUMN storage_provider_version_id text,
  ADD COLUMN storage_committed_at timestamptz,
  ADD COLUMN original_filename text,
  ADD COLUMN mime_type text,
  ADD CONSTRAINT versions_committed_upload_identity_check CHECK (
    (
      source_upload_id IS NULL
      AND storage_provider IS NULL
      AND storage_object_key IS NULL
      AND storage_sha256 IS NULL
      AND storage_provider_version_id IS NULL
      AND storage_committed_at IS NULL
      AND original_filename IS NULL
      AND mime_type IS NULL
    )
    OR
    (
      source_upload_id IS NOT NULL
      AND file_size IS NOT NULL
      AND file_size > 0
      AND storage_provider IS NOT NULL
      AND storage_provider IN ('local', 'ccnas', 'google-drive', 'object-store')
      AND storage_object_key IS NOT NULL
      AND length(storage_object_key) BETWEEN 1 AND 2048
      AND storage_object_key !~ '[[:cntrl:]\\]'
      AND storage_object_key !~ '(^/|(^|/)\.\.(/|$))'
      AND storage_sha256 IS NOT NULL
      AND storage_sha256 ~ '^[0-9a-f]{64}$'
      AND storage_provider_version_id IS NOT NULL
      AND length(storage_provider_version_id) BETWEEN 1 AND 1024
      AND storage_provider_version_id !~ '[[:cntrl:]]'
      AND storage_committed_at IS NOT NULL
      AND original_filename IS NOT NULL
      AND length(btrim(original_filename)) BETWEEN 1 AND 512
      AND original_filename !~ '[[:cntrl:]]'
      AND mime_type IS NOT NULL
      AND length(btrim(mime_type)) BETWEEN 1 AND 256
      AND mime_type !~ '[[:cntrl:]]'
    )
  );

CREATE UNIQUE INDEX versions_source_upload_unique_idx
  ON co_production.versions(source_upload_id)
  WHERE source_upload_id IS NOT NULL;

CREATE UNIQUE INDEX versions_storage_object_unique_idx
  ON co_production.versions(storage_provider, storage_object_key)
  WHERE storage_object_key IS NOT NULL;

-- Asset catalog rows are also server-owned. Otherwise an authenticated editor
-- can point the asset away from its immutable V1 or bypass governed lifecycle
-- routes even while the version receipt itself remains protected.
REVOKE SELECT, INSERT, DELETE ON TABLE co_production.assets FROM authenticated;
REVOKE UPDATE ON TABLE co_production.assets FROM authenticated;
REVOKE UPDATE (
  folder_id,
  title,
  file_type,
  file_url,
  thumbnail_url,
  proxy_url,
  nas_path,
  file_size,
  duration_seconds,
  status,
  metadata,
  position,
  deleted_at,
  updated_at
) ON co_production.assets FROM authenticated;

DROP POLICY assets_insert ON co_production.assets;
DROP POLICY assets_update ON co_production.assets;
DROP POLICY assets_delete ON co_production.assets;

GRANT SELECT (
  id,
  project_id,
  folder_id,
  title,
  file_type,
  file_url,
  thumbnail_url,
  proxy_url,
  file_size,
  duration_seconds,
  status,
  position,
  deleted_at,
  uploaded_by,
  created_at,
  updated_at
) ON co_production.assets TO authenticated;

-- Managed receipts and current-version identity are server-owned. Authenticated
-- browser clients keep row-filtered read access to the public version shape,
-- but cannot forge, replace, delete, or read provider receipt columns.
REVOKE SELECT, INSERT, DELETE ON TABLE co_production.versions FROM authenticated;
REVOKE UPDATE ON TABLE co_production.versions FROM authenticated;
REVOKE UPDATE (
  file_url,
  file_size,
  notes,
  is_current,
  thumbnail_url,
  duration_seconds,
  resolution,
  updated_at
) ON co_production.versions FROM authenticated;

DROP POLICY versions_insert ON co_production.versions;
DROP POLICY versions_update ON co_production.versions;
DROP POLICY versions_delete ON co_production.versions;

GRANT SELECT (
  id,
  asset_id,
  version_number,
  file_url,
  file_size,
  notes,
  uploaded_by,
  is_current,
  thumbnail_url,
  duration_seconds,
  resolution,
  created_at,
  updated_at
) ON co_production.versions TO authenticated;

CREATE OR REPLACE FUNCTION co_production.attach_committed_upload_v1(
  p_actor_id uuid,
  p_upload_id uuid,
  p_expected_asset_id uuid,
  p_project_id uuid,
  p_folder_id uuid,
  p_title text,
  p_file_type text,
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
  v_asset_id uuid;
  v_version_id uuid;
  v_file_url text;
  v_partial_asset_count integer;
  v_partial_asset_project_id uuid;
  v_existing record;
BEGIN
  IF p_actor_id IS NULL
     OR p_upload_id IS NULL
     OR p_project_id IS NULL
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
     OR p_title IS NULL
     OR length(btrim(p_title)) NOT BETWEEN 1 AND 500
     OR p_file_type IS NULL
     OR p_file_type NOT IN ('video', 'image', 'audio', 'document', 'other')
     OR p_original_filename IS NULL
     OR length(btrim(p_original_filename)) NOT BETWEEN 1 AND 512
     OR p_original_filename ~ '[[:cntrl:]]'
     OR p_mime_type IS NULL
     OR length(btrim(p_mime_type)) NOT BETWEEN 1 AND 256
     OR p_mime_type ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid committed upload catalog input'
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
    RAISE EXCEPTION 'committed upload catalog authority denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM co_production.folders AS folder
    WHERE folder.id = p_folder_id
      AND folder.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'committed upload folder is outside its project'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'co_production.upload:' || p_upload_id::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'co_production.object:' || p_storage_provider || ':' || p_storage_object_key,
      0
    )
  );

  SELECT
    asset.id AS asset_id,
    asset.project_id,
    asset.uploaded_by AS asset_uploaded_by,
    asset.file_url AS asset_file_url,
    asset.nas_path AS asset_nas_path,
    asset.file_size AS asset_file_size,
    asset.deleted_at AS asset_deleted_at,
    version.id AS version_id,
    version.version_number,
    version.file_url,
    version.file_size,
    version.uploaded_by,
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
  JOIN co_production.assets AS asset ON asset.id = version.asset_id
  WHERE version.source_upload_id = p_upload_id
     OR (
       version.storage_provider = p_storage_provider
       AND version.storage_object_key = p_storage_object_key
     )
  ORDER BY
    CASE WHEN version.source_upload_id = p_upload_id THEN 0 ELSE 1 END,
    version.created_at
  LIMIT 1
  FOR UPDATE OF asset, version;

  SELECT count(*)::integer
  INTO v_partial_asset_count
  FROM co_production.assets AS asset
  WHERE asset.nas_path = p_storage_object_key;

  IF v_partial_asset_count > 1 THEN
    RAISE EXCEPTION 'committed upload has contaminated duplicate asset records'
      USING ERRCODE = '23505';
  END IF;

  IF v_existing.version_id IS NOT NULL THEN
    v_file_url := '/api/media/versions/' || v_existing.version_id::text;
    IF v_partial_asset_count IS DISTINCT FROM 1
       OR (
         p_expected_asset_id IS NOT NULL
         AND v_existing.asset_id IS DISTINCT FROM p_expected_asset_id
       )
       OR v_existing.project_id IS DISTINCT FROM p_project_id
       OR v_existing.asset_uploaded_by IS DISTINCT FROM p_actor_id
       OR v_existing.asset_file_url IS DISTINCT FROM v_file_url
       OR v_existing.asset_nas_path IS DISTINCT FROM p_storage_object_key
       OR v_existing.asset_file_size IS DISTINCT FROM p_file_size
       OR v_existing.asset_deleted_at IS NOT NULL
       OR v_existing.uploaded_by IS DISTINCT FROM p_actor_id
       OR v_existing.version_number IS DISTINCT FROM 1
       OR v_existing.file_url IS DISTINCT FROM v_file_url
       OR v_existing.file_size IS DISTINCT FROM p_file_size
       OR v_existing.source_upload_id IS DISTINCT FROM p_upload_id
       OR v_existing.storage_provider IS DISTINCT FROM p_storage_provider
       OR v_existing.storage_object_key IS DISTINCT FROM p_storage_object_key
       OR v_existing.storage_sha256 IS DISTINCT FROM p_storage_sha256
       OR v_existing.storage_provider_version_id IS DISTINCT FROM p_storage_provider_version_id
       OR v_existing.storage_committed_at IS DISTINCT FROM p_storage_committed_at
       OR v_existing.original_filename IS DISTINCT FROM p_original_filename
       OR v_existing.mime_type IS DISTINCT FROM p_mime_type THEN
      RAISE EXCEPTION 'committed upload identity conflicts with catalog state'
        USING ERRCODE = '23505';
    END IF;

    RETURN QUERY
      SELECT
        v_existing.asset_id,
        v_existing.version_id,
        1,
        v_existing.file_url;
    RETURN;
  END IF;

  v_version_id := extensions.gen_random_uuid();
  v_file_url := '/api/media/versions/' || v_version_id::text;

  IF v_partial_asset_count = 1 THEN
    SELECT asset.id, asset.project_id
    INTO v_asset_id, v_partial_asset_project_id
    FROM co_production.assets AS asset
    WHERE asset.nas_path = p_storage_object_key
    FOR UPDATE;

    IF (
      p_expected_asset_id IS NOT NULL
      AND v_asset_id IS DISTINCT FROM p_expected_asset_id
    ) OR v_partial_asset_project_id IS DISTINCT FROM p_project_id
       OR EXISTS (
      SELECT 1
      FROM co_production.assets AS asset
      WHERE asset.id = v_asset_id
        AND (
          asset.folder_id IS DISTINCT FROM p_folder_id
          OR asset.title IS DISTINCT FROM btrim(p_title)
          OR asset.file_type IS DISTINCT FROM p_file_type
          OR asset.uploaded_by IS DISTINCT FROM p_actor_id
          OR asset.nas_path IS DISTINCT FROM p_storage_object_key
          OR asset.file_size IS DISTINCT FROM p_file_size
          OR asset.status IS DISTINCT FROM 'ready'
          OR asset.metadata IS DISTINCT FROM '{}'::jsonb
          OR asset.thumbnail_url IS NOT NULL
          OR asset.proxy_url IS NOT NULL
          OR asset.duration_seconds IS NOT NULL
          OR asset.position IS DISTINCT FROM 0
          OR asset.created_at IS DISTINCT FROM asset.updated_at
          OR asset.deleted_at IS NOT NULL
          OR p_storage_provider NOT IN ('local', 'ccnas')
          OR (
            p_storage_provider = 'local'
            AND asset.file_url IS NOT NULL
          )
          OR (
            p_storage_provider = 'ccnas'
            AND asset.file_url IS DISTINCT FROM (
              '/api/media/stream?path=' ||
              pg_catalog.replace(p_storage_object_key, '/', '%2F')
            )
          )
        )
    ) OR EXISTS (
      SELECT 1
      FROM co_production.versions AS version
      WHERE version.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.reviews AS review
      WHERE review.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.approval_workflows AS workflow
      WHERE workflow.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.approvals AS approval
      WHERE approval.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.activity_log AS activity
      WHERE activity.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.asset_tags AS tag_link
      WHERE tag_link.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.brand_checks AS brand_check
      WHERE brand_check.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.transcode_jobs AS transcode_job
      WHERE transcode_job.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.selects AS selected
      WHERE selected.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.sequence_clips AS sequence_clip
      WHERE sequence_clip.asset_id = v_asset_id
    ) OR EXISTS (
      SELECT 1
      FROM co_production.revision_requests AS revision_request
      WHERE revision_request.asset_id = v_asset_id
    ) THEN
      RAISE EXCEPTION 'partial committed upload asset conflicts with V1 authority'
        USING ERRCODE = '23505';
    END IF;

    UPDATE co_production.assets
    SET file_url = v_file_url,
        file_type = p_file_type,
        file_size = p_file_size,
        metadata = metadata || pg_catalog.jsonb_build_object(
          'upload',
          pg_catalog.jsonb_build_object(
            'schema_version', 1,
            'source_upload_id', p_upload_id,
            'storage_provider', p_storage_provider
          )
        ),
        updated_at = now()
    WHERE assets.id = v_asset_id;
  ELSE
    IF p_expected_asset_id IS NOT NULL THEN
      RAISE EXCEPTION 'remembered upload asset is missing from catalog state'
        USING ERRCODE = '23505';
    END IF;

    INSERT INTO co_production.assets (
      project_id,
      folder_id,
      title,
      file_type,
      file_url,
      nas_path,
      file_size,
      status,
      metadata,
      uploaded_by
    )
    VALUES (
      p_project_id,
      p_folder_id,
      btrim(p_title),
      p_file_type,
      v_file_url,
      p_storage_object_key,
      p_file_size,
      'ready',
      pg_catalog.jsonb_build_object(
        'upload',
        pg_catalog.jsonb_build_object(
          'schema_version', 1,
          'source_upload_id', p_upload_id,
          'storage_provider', p_storage_provider
        )
      ),
      p_actor_id
    )
    RETURNING assets.id INTO v_asset_id;
  END IF;

  INSERT INTO co_production.versions (
    id,
    asset_id,
    version_number,
    file_url,
    file_size,
    uploaded_by,
    is_current,
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
    v_asset_id,
    1,
    v_file_url,
    p_file_size,
    p_actor_id,
    true,
    p_upload_id,
    p_storage_provider,
    p_storage_object_key,
    p_storage_sha256,
    p_storage_provider_version_id,
    p_storage_committed_at,
    p_original_filename,
    p_mime_type
  );

  RETURN QUERY
    SELECT v_asset_id, v_version_id, 1, v_file_url;
END;
$$;

REVOKE ALL ON FUNCTION co_production.attach_committed_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION co_production.attach_committed_upload_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
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

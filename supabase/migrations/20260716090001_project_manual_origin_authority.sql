-- Durable origin authority for projects created directly inside Co-VideoPro.
--
-- Accepted proposals already have immutable proposal_handoff_receipts. Manual
-- projects require an equally explicit origin, so this migration introduces an
-- auditable, idempotent creation transaction instead of inferring "manual"
-- from the absence of a handoff.

BEGIN;

DO $manual_project_origin_preflight$
BEGIN
  IF pg_catalog.to_regclass('co_production.projects') IS NULL
    OR pg_catalog.to_regclass('co_production.teams') IS NULL
    OR pg_catalog.to_regclass('co_production.activity_log') IS NULL
    OR pg_catalog.to_regclass('auth.users') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_active_surface_identity()'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_team_role(uuid,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_sha256(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_safe_text(text,integer,integer)'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'manual_project_origin_requires_existing_authorities';
  END IF;
END
$manual_project_origin_preflight$;

CREATE TABLE co_production.project_manual_origins (
  project_id uuid PRIMARY KEY
    REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_kind text NOT NULL DEFAULT 'manual' CHECK (source_kind = 'manual'),
  project_name text NOT NULL CHECK (
    co_production_private.preproject_safe_text(project_name, 1, 240)
    AND project_name = pg_catalog.btrim(project_name)
    AND project_name !~ E'\\r'
  ),
  project_description text CHECK (
    project_description IS NULL
    OR (
      co_production_private.preproject_safe_text(project_description, 1, 10000)
      AND project_description = pg_catalog.btrim(project_description)
      AND project_description !~ E'\\r'
    )
  ),
  created_at timestamptz NOT NULL,
  CONSTRAINT project_manual_origins_actor_request_key
    UNIQUE (created_by, request_id),
  CONSTRAINT project_manual_origins_request_hash_matches_origin CHECK (
    request_hash = co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'operation', 'create_manual_project_with_origin',
        'actorId', created_by,
        'projectId', project_id,
        'teamId', team_id,
        'requestId', request_id,
        'name', project_name,
        'description', project_description
      )::text
    )
  )
);

ALTER TABLE co_production.project_manual_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_manual_origins FORCE ROW LEVEL SECURITY;

CREATE POLICY project_manual_origins_select
  ON co_production.project_manual_origins
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));

CREATE OR REPLACE FUNCTION co_production_private.prevent_manual_project_origin_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'project_manual_origins are immutable';
END
$$;

CREATE TRIGGER project_manual_origins_immutable
BEFORE UPDATE OR DELETE ON co_production.project_manual_origins
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_manual_project_origin_mutation();

CREATE TRIGGER project_manual_origins_no_truncate
BEFORE TRUNCATE ON co_production.project_manual_origins
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_manual_project_origin_mutation();

CREATE OR REPLACE FUNCTION co_production.create_manual_project_with_origin(
  p_team_id uuid,
  p_name text,
  p_description text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_name text := pg_catalog.btrim(p_name);
  v_description text := NULLIF(pg_catalog.btrim(p_description), '');
  v_project_id uuid := pg_catalog.gen_random_uuid();
  v_request_hash text;
  v_existing record;
  v_project co_production.projects%ROWTYPE;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF v_actor_id IS NULL
    OR NOT co_production_private.has_active_surface_identity()
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'manual_project_forbidden';
  END IF;

  IF p_request_id IS NULL
    OR v_name IS NULL
    OR NOT co_production_private.preproject_safe_text(v_name, 1, 240)
    OR v_name !~ E'\\r'
    OR (
      v_description IS NOT NULL
      AND (
        NOT co_production_private.preproject_safe_text(v_description, 1, 10000)
        OR v_description ~ E'\\r'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_manual_project';
  END IF;

  IF p_team_id IS NOT NULL
    AND NOT co_production_private.has_team_role(p_team_id, 80)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'manual_project_forbidden';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:manual-project:' || v_actor_id::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT
    origin.project_id,
    origin.request_hash,
    project.id,
    project.team_id,
    project.owner_id,
    project.name,
    project.description,
    project.status,
    project.thumbnail_url,
    project.created_at,
    project.updated_at
  INTO v_existing
  FROM co_production.project_manual_origins AS origin
  JOIN co_production.projects AS project
    ON project.id = origin.project_id
  WHERE origin.created_by = v_actor_id
    AND origin.request_id = p_request_id
  FOR UPDATE OF origin;

  IF FOUND THEN
    v_request_hash := co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'operation', 'create_manual_project_with_origin',
        'actorId', v_actor_id,
        'projectId', v_existing.project_id,
        'teamId', v_existing.team_id,
        'requestId', p_request_id,
        'name', v_name,
        'description', v_description
      )::text
    );

    IF v_existing.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'manual_project_idempotency_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'team_id', v_existing.team_id,
      'owner_id', v_existing.owner_id,
      'name', v_existing.name,
      'description', v_existing.description,
      'status', v_existing.status,
      'thumbnail_url', v_existing.thumbnail_url,
      'created_at', v_existing.created_at,
      'updated_at', v_existing.updated_at,
      'origin', 'manual_project',
      'request_id', p_request_id,
      'replayed', true
    );
  END IF;

  v_request_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'operation', 'create_manual_project_with_origin',
      'actorId', v_actor_id,
      'projectId', v_project_id,
      'teamId', p_team_id,
      'requestId', p_request_id,
      'name', v_name,
      'description', v_description
    )::text
  );

  INSERT INTO co_production.projects (
    id,
    team_id,
    owner_id,
    name,
    description,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_project_id,
    p_team_id,
    v_actor_id,
    v_name,
    v_description,
    'active',
    v_now,
    v_now
  )
  RETURNING * INTO v_project;

  INSERT INTO co_production.project_manual_origins (
    project_id,
    team_id,
    created_by,
    request_id,
    request_hash,
    source_kind,
    project_name,
    project_description,
    created_at
  )
  VALUES (
    v_project.id,
    v_project.team_id,
    v_actor_id,
    p_request_id,
    v_request_hash,
    'manual',
    v_project.name,
    v_project.description,
    v_now
  );

  INSERT INTO co_production.activity_log (
    project_id,
    actor_id,
    actor_name,
    action,
    details,
    created_at
  )
  VALUES (
    v_project.id,
    v_actor_id,
    NULLIF(pg_catalog.btrim((SELECT auth.jwt()) ->> 'email'), ''),
    'project_manual_origin_created',
    pg_catalog.jsonb_build_object(
      'origin', 'manual_project',
      'request_id', p_request_id,
      'request_hash', v_request_hash
    ),
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_project.id,
    'team_id', v_project.team_id,
    'owner_id', v_project.owner_id,
    'name', v_project.name,
    'description', v_project.description,
    'status', v_project.status,
    'thumbnail_url', v_project.thumbnail_url,
    'created_at', v_project.created_at,
    'updated_at', v_project.updated_at,
    'origin', 'manual_project',
    'request_id', p_request_id,
    'replayed', false
  );
END
$$;

REVOKE ALL ON TABLE co_production.project_manual_origins
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE co_production.project_manual_origins TO authenticated;

REVOKE ALL ON FUNCTION co_production_private.prevent_manual_project_origin_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.create_manual_project_with_origin(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.create_manual_project_with_origin(uuid, text, text, uuid)
  TO authenticated;

CREATE INDEX project_manual_origins_team_created_idx
  ON co_production.project_manual_origins(team_id, created_at DESC);

COMMIT;

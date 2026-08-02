-- Project-scoped pre-production plan and task authority for Co-Production.
--
-- This migration is additive, source-only, and intentionally unapplied. Plans,
-- idempotency receipts, dependency edges, and events are durable history. Task
-- state is mutable only through optimistic, role-aware RPCs. Nothing here sends
-- externally or mirrors authoritative mutations into a secondary feed.

BEGIN;

DO $project_preproduction_preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'project_preproduction_requires_postgresql_15';
  END IF;

  IF pg_catalog.to_regclass('co_production.projects') IS NULL
    OR pg_catalog.to_regclass('co_production.teams') IS NULL
    OR pg_catalog.to_regclass('co_production.team_members') IS NULL
    OR pg_catalog.to_regclass('co_production.project_members') IS NULL
    OR pg_catalog.to_regclass('co_production.proposal_handoff_receipts') IS NULL
    OR pg_catalog.to_regclass('auth.users') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_active_surface_identity()'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_sha256(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_safe_text(text,integer,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_exact_json_keys(jsonb,text[])'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_iso_date_is_valid(text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_preproduction_requires_existing_authorities';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
      'co_production.proposal_handoff_receipts'::pg_catalog.regclass
      AND constraint_record.conname =
        'proposal_handoff_receipts_id_team_project_unique'
      AND constraint_record.contype = 'u'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_preproduction_requires_project_bound_proposal_receipts';
  END IF;
END
$project_preproduction_preflight$;

CREATE TABLE co_production.project_preproduction_authorities (
  project_id uuid PRIMARY KEY
    REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  authority_version bigint NOT NULL DEFAULT 0 CHECK (
    authority_version BETWEEN 0 AND 2147483647
  ),
  event_head_hash text NOT NULL DEFAULT (
    'sha256:' || pg_catalog.repeat('0', 64)
  ) CHECK (event_head_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_preproduction_authorities_project_team_key
    UNIQUE (project_id, team_id)
);

CREATE TABLE co_production.production_plan_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  revision_number integer NOT NULL CHECK (
    revision_number BETWEEN 1 AND 2147483647
  ),
  title text NOT NULL CHECK (
    co_production_private.preproject_safe_text(title, 1, 240)
    AND title = pg_catalog.btrim(title)
    AND title !~ E'\r'
  ),
  summary text CHECK (
    summary IS NULL
    OR (
      co_production_private.preproject_safe_text(summary, 1, 4000)
      AND summary = pg_catalog.btrim(summary)
      AND summary !~ E'\r'
    )
  ),
  content jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(content) = 'object'),
  content_hash text NOT NULL CHECK (
    content_hash ~ '^sha256:[0-9a-f]{64}$'
    AND content_hash = co_production_private.preproject_sha256(content::text)
  ),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
    AND request_hash = co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'operation', 'initialize_production_plan',
        'projectId', project_id,
        'expectedPlanRevision', revision_number - 1,
        'requestId', request_id,
        'plan', content
      )::text
    )
  ),
  source_kind text NOT NULL CHECK (
    source_kind IN ('accepted_proposal', 'manual')
  ),
  source_receipt_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_plan_revisions_project_revision_key
    UNIQUE (project_id, revision_number),
  CONSTRAINT production_plan_revisions_project_request_key
    UNIQUE (project_id, request_id),
  CONSTRAINT production_plan_revisions_id_project_key
    UNIQUE (id, project_id),
  CONSTRAINT production_plan_revisions_id_project_team_key
    UNIQUE (id, project_id, team_id),
  CONSTRAINT production_plan_revisions_project_authority_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproduction_authorities(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT production_plan_revisions_source_shape CHECK (
    (source_kind = 'manual' AND source_receipt_id IS NULL)
    OR (
      source_kind = 'accepted_proposal'
      AND source_receipt_id IS NOT NULL
      AND team_id IS NOT NULL
    )
  ),
  CONSTRAINT production_plan_revisions_source_receipt_fk
    FOREIGN KEY (source_receipt_id, team_id, project_id)
    REFERENCES co_production.proposal_handoff_receipts(id, team_id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT production_plan_revisions_content_projection CHECK (
    title = content ->> 'title'
    AND summary IS NOT DISTINCT FROM content ->> 'summary'
  )
);

CREATE TABLE co_production.production_tasks (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  plan_revision_id uuid NOT NULL,
  client_task_id text NOT NULL CHECK (
    client_task_id ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
  ),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 200),
  title text NOT NULL CHECK (
    co_production_private.preproject_safe_text(title, 1, 240)
    AND title = pg_catalog.btrim(title)
    AND title !~ E'\r'
  ),
  description text CHECK (
    description IS NULL
    OR (
      co_production_private.preproject_safe_text(description, 1, 4000)
      AND description = pg_catalog.btrim(description)
      AND description !~ E'\r'
    )
  ),
  status text NOT NULL DEFAULT 'todo' CHECK (
    status IN ('todo', 'in_progress', 'blocked', 'completed', 'cancelled')
  ),
  priority text NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  due_date date,
  source_kind text NOT NULL CHECK (
    source_kind IN ('plan', 'review_comment', 'manual', 'agent_proposal')
  ),
  source_ref text CHECK (
    source_ref IS NULL
    OR (
      co_production_private.preproject_safe_text(source_ref, 1, 160)
      AND source_ref = pg_catalog.btrim(source_ref)
      AND source_ref !~ E'\r'
    )
  ),
  authority_version bigint NOT NULL DEFAULT 1 CHECK (
    authority_version BETWEEN 1 AND 2147483647
  ),
  completed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_tasks_plan_client_key
    UNIQUE (plan_revision_id, client_task_id),
  CONSTRAINT production_tasks_plan_position_key
    UNIQUE (plan_revision_id, position),
  CONSTRAINT production_tasks_id_project_key
    UNIQUE (id, project_id),
  CONSTRAINT production_tasks_id_project_plan_key
    UNIQUE (id, project_id, plan_revision_id),
  CONSTRAINT production_tasks_plan_project_fk
    FOREIGN KEY (plan_revision_id, project_id)
    REFERENCES co_production.production_plan_revisions(id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT production_tasks_completion_shape CHECK (
    (
      status = 'completed'
      AND completed_by IS NOT NULL
      AND completed_at IS NOT NULL
    )
    OR (
      status <> 'completed'
      AND completed_by IS NULL
      AND completed_at IS NULL
    )
  )
);

CREATE TABLE co_production.production_task_dependencies (
  project_id uuid NOT NULL,
  team_id uuid,
  plan_revision_id uuid NOT NULL,
  task_id uuid NOT NULL,
  depends_on_task_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, plan_revision_id, task_id, depends_on_task_id),
  CONSTRAINT production_task_dependencies_no_self_edge CHECK (
    task_id <> depends_on_task_id
  ),
  CONSTRAINT production_task_dependencies_task_fk
    FOREIGN KEY (task_id, project_id, plan_revision_id)
    REFERENCES co_production.production_tasks(id, project_id, plan_revision_id)
    ON DELETE RESTRICT,
  CONSTRAINT production_task_dependencies_dependency_fk
    FOREIGN KEY (depends_on_task_id, project_id, plan_revision_id)
    REFERENCES co_production.production_tasks(id, project_id, plan_revision_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.project_preproduction_mutation_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  mutation_kind text NOT NULL CHECK (
    mutation_kind IN (
      'production_plan.initialized',
      'production_plan.replanned',
      'production_task.mutated'
    )
  ),
  plan_revision_id uuid,
  task_id uuid,
  expected_entity_version bigint NOT NULL CHECK (
    expected_entity_version BETWEEN 0 AND 2147483646
  ),
  resulting_entity_version bigint NOT NULL CHECK (
    resulting_entity_version = expected_entity_version + 1
  ),
  authority_version bigint NOT NULL CHECK (
    authority_version BETWEEN 1 AND 2147483647
  ),
  request_id uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(request_payload) = 'object'
  ),
  request_hash text NOT NULL CHECK (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
    AND request_hash =
      co_production_private.preproject_sha256(request_payload::text)
  ),
  result jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(result) = 'object'),
  receipt_hash text NOT NULL UNIQUE CHECK (
    receipt_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_preproduction_receipts_project_request_key
    UNIQUE (project_id, request_id),
  CONSTRAINT project_preproduction_receipts_project_version_key
    UNIQUE (project_id, authority_version),
  CONSTRAINT project_preproduction_receipts_id_project_version_key
    UNIQUE (id, project_id, authority_version),
  CONSTRAINT project_preproduction_receipts_project_authority_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproduction_authorities(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproduction_receipts_plan_fk
    FOREIGN KEY (plan_revision_id, project_id)
    REFERENCES co_production.production_plan_revisions(id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproduction_receipts_task_fk
    FOREIGN KEY (task_id, project_id)
    REFERENCES co_production.production_tasks(id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproduction_receipts_target_shape CHECK (
    (
      mutation_kind IN ('production_plan.initialized', 'production_plan.replanned')
      AND plan_revision_id IS NOT NULL
      AND task_id IS NULL
    )
    OR (
      mutation_kind = 'production_task.mutated'
      AND plan_revision_id IS NULL
      AND task_id IS NOT NULL
    )
  )
);

CREATE TABLE co_production.project_preproduction_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  receipt_id uuid NOT NULL UNIQUE,
  authority_version bigint NOT NULL CHECK (
    authority_version BETWEEN 1 AND 2147483647
  ),
  event_type text NOT NULL CHECK (
    event_type IN (
      'production_plan.initialized',
      'production_plan.replanned',
      'production_task.mutated'
    )
  ),
  entity_kind text NOT NULL CHECK (
    entity_kind IN ('production_plan_revision', 'production_task')
  ),
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(payload) = 'object'),
  previous_event_hash text NOT NULL CHECK (
    previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  event_hash text NOT NULL UNIQUE CHECK (
    event_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_preproduction_events_project_version_key
    UNIQUE (project_id, authority_version),
  CONSTRAINT project_preproduction_events_receipt_fk
    FOREIGN KEY (receipt_id, project_id, authority_version)
    REFERENCES co_production.project_preproduction_mutation_receipts(
      id,
      project_id,
      authority_version
    )
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION co_production_private.project_preproduction_role(
  p_project_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH project_scope AS (
    SELECT project.id, project.team_id, project.owner_id
    FROM co_production.projects AS project
    WHERE project.id = p_project_id
      AND co_production_private.has_active_surface_identity()
  ),
  candidate_roles AS (
    SELECT 'owner'::text AS role
    FROM project_scope AS project
    WHERE project.owner_id = (SELECT auth.uid())

    UNION ALL

    SELECT 'owner'::text
    FROM project_scope AS project
    JOIN co_production.teams AS team
      ON team.id = project.team_id
    WHERE team.owner_id = (SELECT auth.uid())

    UNION ALL

    SELECT member.role
    FROM project_scope AS project
    JOIN co_production.project_members AS member
      ON member.project_id = project.id
    WHERE member.user_id = (SELECT auth.uid())
      AND (member.expires_at IS NULL OR member.expires_at > now())
      AND member.role IN (
        'owner', 'admin', 'producer', 'editor', 'member', 'reviewer', 'viewer'
      )

    UNION ALL

    SELECT member.role
    FROM project_scope AS project
    JOIN co_production.team_members AS member
      ON member.team_id = project.team_id
    WHERE member.user_id = (SELECT auth.uid())
      AND member.role IN (
        'owner', 'admin', 'producer', 'editor', 'member', 'reviewer', 'viewer'
      )
  )
  SELECT candidate.role
  FROM candidate_roles AS candidate
  ORDER BY CASE candidate.role
    WHEN 'owner' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'producer' THEN 3
    WHEN 'editor' THEN 4
    WHEN 'member' THEN 5
    WHEN 'reviewer' THEN 6
    WHEN 'viewer' THEN 7
    ELSE 8
  END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION co_production_private.is_project_internal_participant(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NULL OR EXISTS (
    SELECT 1
    FROM co_production.projects AS project
    WHERE project.id = p_project_id
      AND EXISTS (
        SELECT 1
        FROM auth.users AS user_account
        WHERE user_account.id = p_user_id
      )
      AND (
        project.owner_id = p_user_id
        OR EXISTS (
          SELECT 1
          FROM co_production.teams AS team
          WHERE team.id = project.team_id
            AND team.owner_id = p_user_id
        )
        OR EXISTS (
          SELECT 1
          FROM co_production.project_members AS member
          WHERE member.project_id = project.id
            AND member.user_id = p_user_id
            AND (member.expires_at IS NULL OR member.expires_at > now())
            AND member.role IN ('owner', 'admin', 'producer', 'editor', 'member')
        )
        OR EXISTS (
          SELECT 1
          FROM co_production.team_members AS member
          WHERE member.team_id = project.team_id
            AND member.user_id = p_user_id
            AND member.role IN ('owner', 'admin', 'producer', 'editor', 'member')
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.production_plan_payload_is_valid(
  p_plan jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_task jsonb;
  v_dependency jsonb;
  v_client_task_id text;
  v_dependency_id text;
  v_seen_task_ids text[] := ARRAY[]::text[];
  v_seen_dependency_ids text[];
BEGIN
  IF pg_catalog.octet_length(p_plan::text) > 131072
    OR NOT co_production_private.preproject_exact_json_keys(
      p_plan,
      ARRAY['title', 'summary', 'tasks', 'sourceDraftId', 'approvalNote']
    )
    OR pg_catalog.jsonb_typeof(p_plan -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_plan ->> 'title', 1, 240
    )
    OR p_plan ->> 'title' IS DISTINCT FROM pg_catalog.btrim(p_plan ->> 'title')
    OR p_plan ->> 'title' ~ E'\r'
    OR pg_catalog.jsonb_typeof(p_plan -> 'summary') NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_plan -> 'summary') = 'string'
      AND (
        NOT co_production_private.preproject_safe_text(
          p_plan ->> 'summary', 1, 4000
        )
        OR p_plan ->> 'summary'
          IS DISTINCT FROM pg_catalog.btrim(p_plan ->> 'summary')
        OR p_plan ->> 'summary' ~ E'\r'
      )
    )
    OR pg_catalog.jsonb_typeof(p_plan -> 'tasks') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_plan -> 'tasks') NOT BETWEEN 1 AND 200
    OR pg_catalog.jsonb_typeof(p_plan -> 'sourceDraftId') NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_plan -> 'sourceDraftId') = 'string'
      AND (p_plan ->> 'sourceDraftId')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    OR pg_catalog.jsonb_typeof(p_plan -> 'approvalNote') NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_plan -> 'approvalNote') = 'string'
      AND (
        NOT co_production_private.preproject_safe_text(
          p_plan ->> 'approvalNote', 1, 4000
        )
        OR p_plan ->> 'approvalNote'
          IS DISTINCT FROM pg_catalog.btrim(p_plan ->> 'approvalNote')
        OR p_plan ->> 'approvalNote' ~ E'\r'
      )
    )
    OR (
      pg_catalog.jsonb_typeof(p_plan -> 'sourceDraftId') = 'null'
    ) IS DISTINCT FROM (
      pg_catalog.jsonb_typeof(p_plan -> 'approvalNote') = 'null'
    )
  THEN
    RETURN false;
  END IF;

  FOR v_task IN
    SELECT task.value
    FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks') AS task(value)
  LOOP
    IF NOT co_production_private.preproject_exact_json_keys(
      v_task,
      ARRAY[
        'clientTaskId', 'title', 'description', 'priority', 'assigneeId',
        'dueDate', 'sourceKind', 'sourceRef', 'dependsOnClientTaskIds'
      ]
    )
      OR pg_catalog.jsonb_typeof(v_task -> 'clientTaskId')
        IS DISTINCT FROM 'string'
      OR (v_task ->> 'clientTaskId')
        !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
      OR pg_catalog.jsonb_typeof(v_task -> 'title') IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        v_task ->> 'title', 1, 240
      )
      OR v_task ->> 'title'
        IS DISTINCT FROM pg_catalog.btrim(v_task ->> 'title')
      OR v_task ->> 'title' ~ E'\r'
      OR pg_catalog.jsonb_typeof(v_task -> 'description') NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_task -> 'description') = 'string'
        AND (
          NOT co_production_private.preproject_safe_text(
            v_task ->> 'description', 1, 4000
          )
          OR v_task ->> 'description'
            IS DISTINCT FROM pg_catalog.btrim(v_task ->> 'description')
          OR v_task ->> 'description' ~ E'\r'
        )
      )
      OR pg_catalog.jsonb_typeof(v_task -> 'priority') IS DISTINCT FROM 'string'
      OR v_task ->> 'priority' NOT IN ('low', 'normal', 'high', 'urgent')
      OR pg_catalog.jsonb_typeof(v_task -> 'assigneeId') NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_task -> 'assigneeId') = 'string'
        AND (v_task ->> 'assigneeId')
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR pg_catalog.jsonb_typeof(v_task -> 'dueDate') NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_task -> 'dueDate') = 'string'
        AND NOT co_production_private.preproject_iso_date_is_valid(
          v_task ->> 'dueDate'
        )
      )
      OR pg_catalog.jsonb_typeof(v_task -> 'sourceKind') IS DISTINCT FROM 'string'
      OR v_task ->> 'sourceKind' NOT IN (
        'plan', 'review_comment', 'manual', 'agent_proposal'
      )
      OR pg_catalog.jsonb_typeof(v_task -> 'sourceRef') NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_task -> 'sourceRef') = 'string'
        AND (
          NOT co_production_private.preproject_safe_text(
            v_task ->> 'sourceRef', 1, 160
          )
          OR v_task ->> 'sourceRef'
            IS DISTINCT FROM pg_catalog.btrim(v_task ->> 'sourceRef')
          OR v_task ->> 'sourceRef' ~ E'\r'
        )
      )
      OR pg_catalog.jsonb_typeof(v_task -> 'dependsOnClientTaskIds')
        IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_task -> 'dependsOnClientTaskIds') > 40
    THEN
      RETURN false;
    END IF;

    v_client_task_id := v_task ->> 'clientTaskId';
    IF v_client_task_id = ANY(v_seen_task_ids) THEN
      RETURN false;
    END IF;
    v_seen_task_ids := pg_catalog.array_append(
      v_seen_task_ids,
      v_client_task_id
    );

    v_seen_dependency_ids := ARRAY[]::text[];
    FOR v_dependency IN
      SELECT dependency.value
      FROM pg_catalog.jsonb_array_elements(
        v_task -> 'dependsOnClientTaskIds'
      ) AS dependency(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_dependency) IS DISTINCT FROM 'string' THEN
        RETURN false;
      END IF;
      v_dependency_id := v_dependency #>> '{}';
      IF v_dependency_id !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
        OR v_dependency_id = ANY(v_seen_dependency_ids)
      THEN
        RETURN false;
      END IF;
      v_seen_dependency_ids := pg_catalog.array_append(
        v_seen_dependency_ids,
        v_dependency_id
      );
    END LOOP;
  END LOOP;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.production_task_patch_is_valid(
  p_patch jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_typeof(p_patch) = 'object'
    AND p_patch <> '{}'::jsonb
    AND pg_catalog.octet_length(p_patch::text) <= 16384
    AND p_patch - ARRAY[
      'status', 'title', 'description', 'priority', 'assigneeId', 'dueDate'
    ] = '{}'::jsonb
    AND (
      NOT p_patch ? 'status'
      OR (
        pg_catalog.jsonb_typeof(p_patch -> 'status') = 'string'
        AND p_patch ->> 'status' IN (
          'todo', 'in_progress', 'blocked', 'completed', 'cancelled'
        )
      )
    )
    AND (
      NOT p_patch ? 'title'
      OR (
        pg_catalog.jsonb_typeof(p_patch -> 'title') = 'string'
        AND co_production_private.preproject_safe_text(
          p_patch ->> 'title', 1, 240
        )
        AND p_patch ->> 'title' = pg_catalog.btrim(p_patch ->> 'title')
        AND p_patch ->> 'title' !~ E'\r'
      )
    )
    AND (
      NOT p_patch ? 'description'
      OR pg_catalog.jsonb_typeof(p_patch -> 'description') = 'null'
      OR (
        pg_catalog.jsonb_typeof(p_patch -> 'description') = 'string'
        AND co_production_private.preproject_safe_text(
          p_patch ->> 'description', 1, 4000
        )
        AND p_patch ->> 'description'
          = pg_catalog.btrim(p_patch ->> 'description')
        AND p_patch ->> 'description' !~ E'\r'
      )
    )
    AND (
      NOT p_patch ? 'priority'
      OR (
        pg_catalog.jsonb_typeof(p_patch -> 'priority') = 'string'
        AND p_patch ->> 'priority' IN ('low', 'normal', 'high', 'urgent')
      )
    )
    AND (
      NOT p_patch ? 'assigneeId'
      OR pg_catalog.jsonb_typeof(p_patch -> 'assigneeId') = 'null'
      OR (
        pg_catalog.jsonb_typeof(p_patch -> 'assigneeId') = 'string'
        AND (p_patch ->> 'assigneeId')
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    AND (
      NOT p_patch ? 'dueDate'
      OR pg_catalog.jsonb_typeof(p_patch -> 'dueDate') = 'null'
      OR (
        pg_catalog.jsonb_typeof(p_patch -> 'dueDate') = 'string'
        AND co_production_private.preproject_iso_date_is_valid(
          p_patch ->> 'dueDate'
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'project_preproduction_record_is_immutable';
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_project_preproduction_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_preproduction_authority_cannot_be_removed';
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.authority_version IS DISTINCT FROM OLD.authority_version + 1
    OR NEW.event_head_hash IS NOT DISTINCT FROM OLD.event_head_hash
    OR NEW.updated_by IS NULL
    OR NEW.updated_at < OLD.updated_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'invalid_project_preproduction_authority_mutation';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_production_task_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_latest_plan_revision_id uuid;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_tasks_cannot_be_removed';
  END IF;

  SELECT plan.id
  INTO v_latest_plan_revision_id
  FROM co_production.production_plan_revisions AS plan
  WHERE plan.project_id = NEW.project_id
  ORDER BY plan.revision_number DESC
  LIMIT 1;

  IF v_latest_plan_revision_id IS DISTINCT FROM NEW.plan_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'preproduction_stale_plan';
  END IF;

  IF NOT co_production_private.is_project_internal_participant(
    NEW.project_id,
    NEW.assignee_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_preproduction_assignee';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.id,
      NEW.project_id,
      NEW.team_id,
      NEW.plan_revision_id,
      NEW.client_task_id,
      NEW.position,
      NEW.source_kind,
      NEW.source_ref,
      NEW.created_by,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.project_id,
      OLD.team_id,
      OLD.plan_revision_id,
      OLD.client_task_id,
      OLD.position,
      OLD.source_kind,
      OLD.source_ref,
      OLD.created_by,
      OLD.created_at
    )
      OR NEW.authority_version IS DISTINCT FROM OLD.authority_version + 1
      OR NEW.updated_by IS NULL
      OR NEW.updated_at < OLD.updated_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'invalid_production_task_mutation';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_production_task_dependency_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority_exists boolean;
  v_creates_cycle boolean;
BEGIN
  IF NEW.task_id = NEW.depends_on_task_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'preproduction_dependency_cycle';
  END IF;

  SELECT true
  INTO v_authority_exists
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = NEW.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'preproduction_authority_missing';
  END IF;

  WITH RECURSIVE dependency_walk(task_id, visited) AS (
    SELECT
      NEW.depends_on_task_id,
      ARRAY[NEW.depends_on_task_id]::uuid[]
    UNION ALL
    SELECT
      dependency.depends_on_task_id,
      walk.visited || dependency.depends_on_task_id
    FROM dependency_walk AS walk
    JOIN co_production.production_task_dependencies AS dependency
      ON dependency.project_id = NEW.project_id
      AND dependency.plan_revision_id = NEW.plan_revision_id
      AND dependency.task_id = walk.task_id
    WHERE NOT dependency.depends_on_task_id = ANY(walk.visited)
  )
  SELECT EXISTS (
    SELECT 1
    FROM dependency_walk AS walk
    WHERE walk.task_id = NEW.task_id
  )
  INTO v_creates_cycle;

  IF v_creates_cycle THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'preproduction_dependency_cycle';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.verify_project_preproduction_receipt_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_expected_hash text;
BEGIN
  v_expected_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', NEW.id,
      'projectId', NEW.project_id,
      'teamId', NEW.team_id,
      'mutationKind', NEW.mutation_kind,
      'planRevisionId', NEW.plan_revision_id,
      'taskId', NEW.task_id,
      'expectedEntityVersion', NEW.expected_entity_version,
      'resultingEntityVersion', NEW.resulting_entity_version,
      'authorityVersion', NEW.authority_version,
      'requestId', NEW.request_id,
      'requestHash', NEW.request_hash,
      'result', NEW.result,
      'actorId', NEW.actor_id,
      'createdAt', NEW.created_at
    )::text
  );

  IF NEW.receipt_hash IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_receipt_hash';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_project_preproduction_event_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority co_production.project_preproduction_authorities%ROWTYPE;
  v_receipt co_production.project_preproduction_mutation_receipts%ROWTYPE;
  v_expected_hash text;
BEGIN
  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = NEW.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'preproduction_authority_missing';
  END IF;

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.id = NEW.receipt_id
    AND receipt.project_id = NEW.project_id
    AND receipt.authority_version = NEW.authority_version;

  IF NOT FOUND
    OR NEW.authority_version IS DISTINCT FROM v_authority.authority_version + 1
    OR NEW.previous_event_hash IS DISTINCT FROM v_authority.event_head_hash
    OR NEW.event_type IS DISTINCT FROM v_receipt.mutation_kind
    OR NEW.actor_id IS DISTINCT FROM v_receipt.actor_id
    OR NEW.occurred_at IS DISTINCT FROM v_receipt.created_at
    OR (
      v_receipt.mutation_kind IN (
        'production_plan.initialized', 'production_plan.replanned'
      )
      AND (
        NEW.entity_kind IS DISTINCT FROM 'production_plan_revision'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.plan_revision_id
      )
    )
    OR (
      v_receipt.mutation_kind = 'production_task.mutated'
      AND (
        NEW.entity_kind IS DISTINCT FROM 'production_task'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.task_id
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_event_chain';
  END IF;

  v_expected_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', NEW.id,
      'projectId', NEW.project_id,
      'teamId', NEW.team_id,
      'receiptId', NEW.receipt_id,
      'authorityVersion', NEW.authority_version,
      'eventType', NEW.event_type,
      'entityKind', NEW.entity_kind,
      'entityId', NEW.entity_id,
      'payload', NEW.payload,
      'previousEventHash', NEW.previous_event_hash,
      'actorId', NEW.actor_id,
      'occurredAt', NEW.occurred_at
    )::text
  );

  IF NEW.event_hash IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_event_hash';
  END IF;

  RETURN NEW;
END
$$;

ALTER TABLE co_production.project_preproduction_authorities
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_preproduction_authorities
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_plan_revisions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_plan_revisions
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_task_dependencies
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_task_dependencies
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_preproduction_mutation_receipts
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_preproduction_mutation_receipts
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_preproduction_events
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_preproduction_events
  FORCE ROW LEVEL SECURITY;

CREATE POLICY project_preproduction_authorities_select
  ON co_production.project_preproduction_authorities
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IS NOT NULL
  );
CREATE POLICY production_plan_revisions_select
  ON co_production.production_plan_revisions
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IS NOT NULL
  );
CREATE POLICY production_tasks_select
  ON co_production.production_tasks
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IS NOT NULL
  );
CREATE POLICY production_task_dependencies_select
  ON co_production.production_task_dependencies
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IS NOT NULL
  );
CREATE POLICY project_preproduction_mutation_receipts_select
  ON co_production.project_preproduction_mutation_receipts
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IS NOT NULL
  );
CREATE POLICY project_preproduction_events_select
  ON co_production.project_preproduction_events
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IS NOT NULL
  );

CREATE TRIGGER project_preproduction_authorities_guard
BEFORE UPDATE OR DELETE ON co_production.project_preproduction_authorities
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_project_preproduction_authority();

CREATE TRIGGER project_preproduction_authorities_no_truncate
BEFORE TRUNCATE ON co_production.project_preproduction_authorities
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.guard_project_preproduction_authority();

CREATE TRIGGER production_plan_revisions_immutable
BEFORE UPDATE OR DELETE ON co_production.production_plan_revisions
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER production_plan_revisions_no_truncate
BEFORE TRUNCATE ON co_production.production_plan_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER production_tasks_write_guard
BEFORE INSERT OR UPDATE OR DELETE ON co_production.production_tasks
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_production_task_write();

CREATE TRIGGER production_tasks_no_truncate
BEFORE TRUNCATE ON co_production.production_tasks
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.guard_production_task_write();

CREATE TRIGGER production_task_dependencies_cycle_guard
BEFORE INSERT ON co_production.production_task_dependencies
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_production_task_dependency_insert();

CREATE TRIGGER production_task_dependencies_immutable
BEFORE UPDATE OR DELETE ON co_production.production_task_dependencies
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER production_task_dependencies_no_truncate
BEFORE TRUNCATE ON co_production.production_task_dependencies
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_preproduction_receipts_verify_hash
BEFORE INSERT ON co_production.project_preproduction_mutation_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.verify_project_preproduction_receipt_hash();

CREATE TRIGGER project_preproduction_receipts_immutable
BEFORE UPDATE OR DELETE ON co_production.project_preproduction_mutation_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_preproduction_receipts_no_truncate
BEFORE TRUNCATE ON co_production.project_preproduction_mutation_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_preproduction_events_chain_guard
BEFORE INSERT ON co_production.project_preproduction_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_project_preproduction_event_insert();

CREATE TRIGGER project_preproduction_events_immutable
BEFORE UPDATE OR DELETE ON co_production.project_preproduction_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_preproduction_events_no_truncate
BEFORE TRUNCATE ON co_production.project_preproduction_events
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.get_project_production_plan(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_authority_version bigint := 0;
  v_event_head_hash text := 'sha256:' || pg_catalog.repeat('0', 64);
  v_plan co_production.production_plan_revisions%ROWTYPE;
  v_plan_json jsonb := 'null'::jsonb;
  v_tasks jsonb := '[]'::jsonb;
  v_dependencies jsonb := '[]'::jsonb;
BEGIN
  IF p_project_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'preproduction_forbidden';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'preproduction_not_found';
  END IF;

  SELECT
    authority.authority_version,
    authority.event_head_hash
  INTO
    v_authority_version,
    v_event_head_hash
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id;

  IF NOT FOUND THEN
    v_authority_version := 0;
    v_event_head_hash := 'sha256:' || pg_catalog.repeat('0', 64);
  END IF;

  SELECT plan.*
  INTO v_plan
  FROM co_production.production_plan_revisions AS plan
  WHERE plan.project_id = p_project_id
  ORDER BY plan.revision_number DESC
  LIMIT 1;

  IF FOUND THEN
    v_plan_json := pg_catalog.jsonb_build_object(
      'id', v_plan.id,
      'projectId', v_plan.project_id,
      'revisionNumber', v_plan.revision_number,
      'title', v_plan.title,
      'summary', v_plan.summary,
      'status', 'active',
      'contentHash', v_plan.content_hash,
      'sourceReceiptId', v_plan.source_receipt_id,
      'createdBy', v_plan.created_by,
      'createdAt', v_plan.created_at
    );

    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', task.id,
          'projectId', task.project_id,
          'planRevisionId', task.plan_revision_id,
          'title', task.title,
          'description', task.description,
          'status', task.status,
          'priority', task.priority,
          'assigneeId', task.assignee_id,
          'dueDate', task.due_date,
          'sourceKind', task.source_kind,
          'sourceRef', task.source_ref,
          'authorityVersion', task.authority_version,
          'createdAt', task.created_at,
          'updatedAt', task.updated_at
        )
        ORDER BY task.position
      ),
      '[]'::jsonb
    )
    INTO v_tasks
    FROM co_production.production_tasks AS task
    WHERE task.project_id = p_project_id
      AND task.plan_revision_id = v_plan.id;

    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'taskId', dependency.task_id,
          'dependsOnTaskId', dependency.depends_on_task_id
        )
        ORDER BY dependent_task.position, prerequisite_task.position
      ),
      '[]'::jsonb
    )
    INTO v_dependencies
    FROM co_production.production_task_dependencies AS dependency
    JOIN co_production.production_tasks AS dependent_task
      ON dependent_task.id = dependency.task_id
      AND dependent_task.project_id = dependency.project_id
      AND dependent_task.plan_revision_id = dependency.plan_revision_id
    JOIN co_production.production_tasks AS prerequisite_task
      ON prerequisite_task.id = dependency.depends_on_task_id
      AND prerequisite_task.project_id = dependency.project_id
      AND prerequisite_task.plan_revision_id = dependency.plan_revision_id
    WHERE dependency.project_id = p_project_id
      AND dependency.plan_revision_id = v_plan.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'projectId', p_project_id,
    'authorityVersion', v_authority_version,
    'eventHeadHash', v_event_head_hash,
    'plan', v_plan_json,
    'tasks', v_tasks,
    'dependencies', v_dependencies,
    'permissions', pg_catalog.jsonb_build_object(
      'role', v_role,
      'canInitialize', v_role IN ('owner', 'admin', 'producer'),
      'canManage', v_role IN ('owner', 'admin', 'producer'),
      'canUpdateStatus', v_role IN (
        'owner', 'admin', 'producer', 'editor', 'member'
      )
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.initialize_production_plan(
  p_project_id uuid,
  p_expected_plan_revision integer,
  p_request_id uuid,
  p_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_project co_production.projects%ROWTYPE;
  v_authority co_production.project_preproduction_authorities%ROWTYPE;
  v_existing co_production.project_preproduction_mutation_receipts%ROWTYPE;
  v_current_plan_revision integer;
  v_new_plan_revision integer;
  v_new_authority_version bigint;
  v_plan_revision_id uuid := pg_catalog.gen_random_uuid();
  v_source_receipt_id uuid;
  v_source_kind text;
  v_request_payload jsonb;
  v_request_hash text;
  v_content_hash text;
  v_mutation_kind text;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := statement_timestamp();
  v_result jsonb;
  v_receipt_hash text;
  v_event_payload jsonb;
  v_event_hash text;
  v_task_count integer;
  v_dependency_count integer;
  v_inserted_dependency_count integer;
  v_invalid_assignee boolean;
  v_missing_dependency boolean;
  v_dependency_cycle boolean;
BEGIN
  IF v_actor_id IS NULL
    OR p_project_id IS NULL
    OR p_expected_plan_revision IS NULL
    OR p_expected_plan_revision NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR p_plan IS NULL
    OR NOT co_production_private.production_plan_payload_is_valid(p_plan)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_preproduction_plan';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'preproduction_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'preproduction_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'preproduction_forbidden';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks') AS task(value)
    WHERE pg_catalog.jsonb_typeof(task.value -> 'assigneeId') = 'string'
      AND NOT co_production_private.is_project_internal_participant(
        p_project_id,
        (task.value ->> 'assigneeId')::uuid
      )
  )
  INTO v_invalid_assignee;

  IF v_invalid_assignee THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_preproduction_assignee';
  END IF;

  SELECT EXISTS (
    WITH task_ids AS (
      SELECT task.value ->> 'clientTaskId' AS client_task_id
      FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks') AS task(value)
    ),
    dependency_ids AS (
      SELECT
        task.value ->> 'clientTaskId' AS client_task_id,
        dependency.value #>> '{}' AS dependency_id
      FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks') AS task(value)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        task.value -> 'dependsOnClientTaskIds'
      ) AS dependency(value)
    )
    SELECT 1
    FROM dependency_ids AS dependency
    WHERE NOT EXISTS (
      SELECT 1
      FROM task_ids AS task
      WHERE task.client_task_id = dependency.dependency_id
    )
  )
  INTO v_missing_dependency;

  IF v_missing_dependency THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_preproduction_dependency';
  END IF;

  WITH RECURSIVE dependency_edges(task_id, depends_on_task_id) AS (
    SELECT
      task.value ->> 'clientTaskId',
      dependency.value #>> '{}'
    FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks') AS task(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      task.value -> 'dependsOnClientTaskIds'
    ) AS dependency(value)
  ),
  dependency_reach(task_id, depends_on_task_id) AS (
    SELECT edge.task_id, edge.depends_on_task_id
    FROM dependency_edges AS edge
    UNION
    SELECT reach.task_id, edge.depends_on_task_id
    FROM dependency_reach AS reach
    JOIN dependency_edges AS edge
      ON edge.task_id = reach.depends_on_task_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM dependency_reach AS reach
    WHERE reach.task_id = reach.depends_on_task_id
  )
  INTO v_dependency_cycle;

  IF v_dependency_cycle THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'preproduction_dependency_cycle';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'initialize_production_plan',
    'projectId', p_project_id,
    'expectedPlanRevision', p_expected_plan_revision,
    'requestId', p_request_id,
    'plan', p_plan
  );
  v_request_hash := co_production_private.preproject_sha256(
    v_request_payload::text
  );
  v_content_hash := co_production_private.preproject_sha256(p_plan::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || p_project_id::text,
      0
    )
  );

  INSERT INTO co_production.project_preproduction_authorities (
    project_id,
    team_id,
    authority_version,
    event_head_hash,
    created_by,
    created_at,
    updated_by,
    updated_at
  )
  VALUES (
    p_project_id,
    v_project.team_id,
    0,
    'sha256:' || pg_catalog.repeat('0', 64),
    v_actor_id,
    v_now,
    v_actor_id,
    v_now
  )
  ON CONFLICT (project_id) DO NOTHING;

  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_authority.team_id IS DISTINCT FROM v_project.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'preproduction_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind NOT IN (
      'production_plan.initialized', 'production_plan.replanned'
    )
      OR v_existing.expected_entity_version
        IS DISTINCT FROM p_expected_plan_revision
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'preproduction_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  SELECT COALESCE(pg_catalog.max(plan.revision_number), 0)
  INTO v_current_plan_revision
  FROM co_production.production_plan_revisions AS plan
  WHERE plan.project_id = p_project_id;

  IF v_current_plan_revision IS DISTINCT FROM p_expected_plan_revision THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'preproduction_plan_version_conflict';
  END IF;

  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  v_new_plan_revision := v_current_plan_revision + 1;
  v_new_authority_version := v_authority.authority_version + 1;
  v_mutation_kind := CASE
    WHEN v_new_plan_revision = 1 THEN 'production_plan.initialized'
    ELSE 'production_plan.replanned'
  END;

  SELECT receipt.id
  INTO v_source_receipt_id
  FROM co_production.proposal_handoff_receipts AS receipt
  WHERE receipt.project_id = p_project_id
  LIMIT 1;

  IF FOUND THEN
    v_source_kind := 'accepted_proposal';
  ELSE
    v_source_kind := 'manual';
    v_source_receipt_id := NULL;
  END IF;

  INSERT INTO co_production.production_plan_revisions (
    id,
    project_id,
    team_id,
    revision_number,
    title,
    summary,
    content,
    content_hash,
    request_id,
    request_hash,
    source_kind,
    source_receipt_id,
    created_by,
    created_at
  )
  VALUES (
    v_plan_revision_id,
    p_project_id,
    v_project.team_id,
    v_new_plan_revision,
    p_plan ->> 'title',
    p_plan ->> 'summary',
    p_plan,
    v_content_hash,
    p_request_id,
    v_request_hash,
    v_source_kind,
    v_source_receipt_id,
    v_actor_id,
    v_now
  );

  INSERT INTO co_production.production_tasks (
    id,
    project_id,
    team_id,
    plan_revision_id,
    client_task_id,
    position,
    title,
    description,
    status,
    priority,
    assignee_id,
    due_date,
    source_kind,
    source_ref,
    authority_version,
    completed_by,
    completed_at,
    created_by,
    created_at,
    updated_by,
    updated_at
  )
  SELECT
    pg_catalog.gen_random_uuid(),
    p_project_id,
    v_project.team_id,
    v_plan_revision_id,
    task.value ->> 'clientTaskId',
    task.position::integer,
    task.value ->> 'title',
    task.value ->> 'description',
    'todo',
    task.value ->> 'priority',
    (task.value ->> 'assigneeId')::uuid,
    (task.value ->> 'dueDate')::date,
    task.value ->> 'sourceKind',
    task.value ->> 'sourceRef',
    1,
    NULL,
    NULL,
    v_actor_id,
    v_now,
    v_actor_id,
    v_now
  FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks')
    WITH ORDINALITY AS task(value, position);

  v_task_count := pg_catalog.jsonb_array_length(p_plan -> 'tasks');
  SELECT COALESCE(
    pg_catalog.sum(
      pg_catalog.jsonb_array_length(task.value -> 'dependsOnClientTaskIds')
    ),
    0
  )::integer
  INTO v_dependency_count
  FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks') AS task(value);

  INSERT INTO co_production.production_task_dependencies (
    project_id,
    team_id,
    plan_revision_id,
    task_id,
    depends_on_task_id,
    created_by,
    created_at
  )
  SELECT
    p_project_id,
    v_project.team_id,
    v_plan_revision_id,
    dependent_task.id,
    prerequisite_task.id,
    v_actor_id,
    v_now
  FROM pg_catalog.jsonb_array_elements(p_plan -> 'tasks') AS seed(value)
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    seed.value -> 'dependsOnClientTaskIds'
  ) AS dependency(value)
  JOIN co_production.production_tasks AS dependent_task
    ON dependent_task.plan_revision_id = v_plan_revision_id
    AND dependent_task.project_id = p_project_id
    AND dependent_task.client_task_id = seed.value ->> 'clientTaskId'
  JOIN co_production.production_tasks AS prerequisite_task
    ON prerequisite_task.plan_revision_id = v_plan_revision_id
    AND prerequisite_task.project_id = p_project_id
    AND prerequisite_task.client_task_id = dependency.value #>> '{}';

  GET DIAGNOSTICS v_inserted_dependency_count = ROW_COUNT;
  IF v_inserted_dependency_count IS DISTINCT FROM v_dependency_count THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_preproduction_dependency';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'planRevisionId', v_plan_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_new_plan_revision,
    'authorityVersion', v_new_authority_version,
    'taskCount', v_task_count,
    'requestId', p_request_id,
    'replayed', false
  );
  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', v_mutation_kind,
      'planRevisionId', v_plan_revision_id,
      'taskId', NULL,
      'expectedEntityVersion', p_expected_plan_revision,
      'resultingEntityVersion', v_new_plan_revision,
      'authorityVersion', v_new_authority_version,
      'requestId', p_request_id,
      'requestHash', v_request_hash,
      'result', v_result,
      'actorId', v_actor_id,
      'createdAt', v_now
    )::text
  );

  v_event_payload := pg_catalog.jsonb_build_object(
    'planRevisionId', v_plan_revision_id,
    'revisionNumber', v_new_plan_revision,
    'sourceKind', v_source_kind,
    'taskCount', v_task_count,
    'dependencyCount', v_dependency_count
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', v_mutation_kind,
      'entityKind', 'production_plan_revision',
      'entityId', v_plan_revision_id,
      'payload', v_event_payload,
      'previousEventHash', v_authority.event_head_hash,
      'actorId', v_actor_id,
      'occurredAt', v_now
    )::text
  );

  INSERT INTO co_production.project_preproduction_mutation_receipts (
    id,
    project_id,
    team_id,
    mutation_kind,
    plan_revision_id,
    task_id,
    expected_entity_version,
    resulting_entity_version,
    authority_version,
    request_id,
    request_payload,
    request_hash,
    result,
    receipt_hash,
    actor_id,
    created_at
  )
  VALUES (
    v_receipt_id,
    p_project_id,
    v_project.team_id,
    v_mutation_kind,
    v_plan_revision_id,
    NULL,
    p_expected_plan_revision,
    v_new_plan_revision,
    v_new_authority_version,
    p_request_id,
    v_request_payload,
    v_request_hash,
    v_result,
    v_receipt_hash,
    v_actor_id,
    v_now
  );

  INSERT INTO co_production.project_preproduction_events (
    id,
    project_id,
    team_id,
    receipt_id,
    authority_version,
    event_type,
    entity_kind,
    entity_id,
    payload,
    previous_event_hash,
    event_hash,
    actor_id,
    occurred_at
  )
  VALUES (
    v_event_id,
    p_project_id,
    v_project.team_id,
    v_receipt_id,
    v_new_authority_version,
    v_mutation_kind,
    'production_plan_revision',
    v_plan_revision_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  UPDATE co_production.project_preproduction_authorities AS authority
  SET
    authority_version = v_new_authority_version,
    event_head_hash = v_event_hash,
    updated_by = v_actor_id,
    updated_at = v_now
  WHERE authority.project_id = p_project_id
    AND authority.authority_version = v_authority.authority_version
    AND authority.event_head_hash = v_authority.event_head_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'preproduction_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.mutate_production_task(
  p_task_id uuid,
  p_expected_version bigint,
  p_request_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_task co_production.production_tasks%ROWTYPE;
  v_updated_task co_production.production_tasks%ROWTYPE;
  v_authority co_production.project_preproduction_authorities%ROWTYPE;
  v_existing co_production.project_preproduction_mutation_receipts%ROWTYPE;
  v_latest_plan_revision_id uuid;
  v_new_status text;
  v_new_assignee_id uuid;
  v_new_task_version bigint;
  v_new_authority_version bigint;
  v_request_payload jsonb;
  v_request_hash text;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := statement_timestamp();
  v_changed_fields jsonb;
  v_result jsonb;
  v_receipt_hash text;
  v_event_payload jsonb;
  v_event_hash text;
BEGIN
  IF v_actor_id IS NULL
    OR p_task_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version NOT BETWEEN 1 AND 2147483646
    OR p_request_id IS NULL
    OR p_patch IS NULL
    OR NOT co_production_private.production_task_patch_is_valid(p_patch)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_preproduction_task_patch';
  END IF;

  SELECT task.*
  INTO v_task
  FROM co_production.production_tasks AS task
  WHERE task.id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'preproduction_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(v_task.project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'preproduction_not_found';
  END IF;

  IF p_patch - ARRAY['status'] <> '{}'::jsonb
    AND v_role NOT IN ('owner', 'admin', 'producer')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'preproduction_forbidden';
  END IF;

  IF p_patch ? 'status'
    AND v_role NOT IN ('owner', 'admin', 'producer', 'editor', 'member')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'preproduction_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'mutate_production_task',
    'taskId', p_task_id,
    'expectedVersion', p_expected_version,
    'requestId', p_request_id,
    'patch', p_patch
  );
  v_request_hash := co_production_private.preproject_sha256(
    v_request_payload::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || v_task.project_id::text,
      0
    )
  );

  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = v_task.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'preproduction_authority_missing';
  END IF;

  SELECT task.*
  INTO v_task
  FROM co_production.production_tasks AS task
  WHERE task.id = p_task_id
    AND task.project_id = v_authority.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'preproduction_not_found';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = v_task.project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM 'production_task.mutated'
      OR v_existing.task_id IS DISTINCT FROM p_task_id
      OR v_existing.expected_entity_version IS DISTINCT FROM p_expected_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'preproduction_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  SELECT plan.id
  INTO v_latest_plan_revision_id
  FROM co_production.production_plan_revisions AS plan
  WHERE plan.project_id = v_task.project_id
  ORDER BY plan.revision_number DESC
  LIMIT 1;

  IF v_latest_plan_revision_id IS DISTINCT FROM v_task.plan_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'preproduction_not_found';
  END IF;

  IF v_task.authority_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'preproduction_task_version_conflict';
  END IF;

  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  v_new_status := CASE
    WHEN p_patch ? 'status' THEN p_patch ->> 'status'
    ELSE v_task.status
  END;

  IF v_new_status IS DISTINCT FROM v_task.status
    AND NOT (
      (
        v_task.status = 'todo'
        AND v_new_status IN ('in_progress', 'blocked', 'completed', 'cancelled')
      )
      OR (
        v_task.status = 'in_progress'
        AND v_new_status IN ('todo', 'blocked', 'completed', 'cancelled')
      )
      OR (
        v_task.status = 'blocked'
        AND v_new_status IN ('todo', 'in_progress', 'completed', 'cancelled')
      )
      OR (
        v_task.status = 'completed'
        AND v_new_status IN ('todo', 'in_progress')
      )
      OR (
        v_task.status = 'cancelled'
        AND v_new_status = 'todo'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'preproduction_invalid_transition';
  END IF;

  v_new_assignee_id := CASE
    WHEN p_patch ? 'assigneeId' THEN (p_patch ->> 'assigneeId')::uuid
    ELSE v_task.assignee_id
  END;
  IF NOT co_production_private.is_project_internal_participant(
    v_task.project_id,
    v_new_assignee_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_preproduction_assignee';
  END IF;

  v_new_task_version := v_task.authority_version + 1;
  v_new_authority_version := v_authority.authority_version + 1;

  UPDATE co_production.production_tasks AS task
  SET
    title = CASE
      WHEN p_patch ? 'title' THEN p_patch ->> 'title'
      ELSE task.title
    END,
    description = CASE
      WHEN p_patch ? 'description' THEN p_patch ->> 'description'
      ELSE task.description
    END,
    status = v_new_status,
    priority = CASE
      WHEN p_patch ? 'priority' THEN p_patch ->> 'priority'
      ELSE task.priority
    END,
    assignee_id = v_new_assignee_id,
    due_date = CASE
      WHEN p_patch ? 'dueDate' THEN (p_patch ->> 'dueDate')::date
      ELSE task.due_date
    END,
    authority_version = v_new_task_version,
    completed_by = CASE
      WHEN v_new_status = 'completed' AND task.status <> 'completed'
        THEN v_actor_id
      WHEN v_new_status = 'completed' THEN task.completed_by
      ELSE NULL
    END,
    completed_at = CASE
      WHEN v_new_status = 'completed' AND task.status <> 'completed'
        THEN v_now
      WHEN v_new_status = 'completed' THEN task.completed_at
      ELSE NULL
    END,
    updated_by = v_actor_id,
    updated_at = v_now
  WHERE task.id = p_task_id
    AND task.project_id = v_task.project_id
    AND task.plan_revision_id = v_task.plan_revision_id
    AND task.authority_version = p_expected_version
  RETURNING task.* INTO v_updated_task;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'preproduction_task_version_conflict';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(field.key ORDER BY field.key),
    '[]'::jsonb
  )
  INTO v_changed_fields
  FROM pg_catalog.jsonb_object_keys(p_patch) AS field(key);

  v_result := pg_catalog.jsonb_build_object(
    'taskId', p_task_id,
    'projectId', v_task.project_id,
    'authorityVersion', v_new_authority_version,
    'taskAuthorityVersion', v_new_task_version,
    'status', v_updated_task.status,
    'requestId', p_request_id,
    'replayed', false
  );
  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', v_task.project_id,
      'teamId', v_task.team_id,
      'mutationKind', 'production_task.mutated',
      'planRevisionId', NULL,
      'taskId', p_task_id,
      'expectedEntityVersion', p_expected_version,
      'resultingEntityVersion', v_new_task_version,
      'authorityVersion', v_new_authority_version,
      'requestId', p_request_id,
      'requestHash', v_request_hash,
      'result', v_result,
      'actorId', v_actor_id,
      'createdAt', v_now
    )::text
  );

  v_event_payload := pg_catalog.jsonb_build_object(
    'taskId', p_task_id,
    'planRevisionId', v_task.plan_revision_id,
    'fromTaskAuthorityVersion', p_expected_version,
    'toTaskAuthorityVersion', v_new_task_version,
    'fromStatus', v_task.status,
    'toStatus', v_updated_task.status,
    'changedFields', v_changed_fields
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', v_task.project_id,
      'teamId', v_task.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'production_task.mutated',
      'entityKind', 'production_task',
      'entityId', p_task_id,
      'payload', v_event_payload,
      'previousEventHash', v_authority.event_head_hash,
      'actorId', v_actor_id,
      'occurredAt', v_now
    )::text
  );

  INSERT INTO co_production.project_preproduction_mutation_receipts (
    id,
    project_id,
    team_id,
    mutation_kind,
    plan_revision_id,
    task_id,
    expected_entity_version,
    resulting_entity_version,
    authority_version,
    request_id,
    request_payload,
    request_hash,
    result,
    receipt_hash,
    actor_id,
    created_at
  )
  VALUES (
    v_receipt_id,
    v_task.project_id,
    v_task.team_id,
    'production_task.mutated',
    NULL,
    p_task_id,
    p_expected_version,
    v_new_task_version,
    v_new_authority_version,
    p_request_id,
    v_request_payload,
    v_request_hash,
    v_result,
    v_receipt_hash,
    v_actor_id,
    v_now
  );

  INSERT INTO co_production.project_preproduction_events (
    id,
    project_id,
    team_id,
    receipt_id,
    authority_version,
    event_type,
    entity_kind,
    entity_id,
    payload,
    previous_event_hash,
    event_hash,
    actor_id,
    occurred_at
  )
  VALUES (
    v_event_id,
    v_task.project_id,
    v_task.team_id,
    v_receipt_id,
    v_new_authority_version,
    'production_task.mutated',
    'production_task',
    p_task_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  UPDATE co_production.project_preproduction_authorities AS authority
  SET
    authority_version = v_new_authority_version,
    event_head_hash = v_event_hash,
    updated_by = v_actor_id,
    updated_at = v_now
  WHERE authority.project_id = v_task.project_id
    AND authority.authority_version = v_authority.authority_version
    AND authority.event_head_hash = v_authority.event_head_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'preproduction_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

REVOKE ALL ON TABLE co_production.project_preproduction_authorities
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.production_plan_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.production_tasks
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.production_task_dependencies
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production_private.project_preproduction_role(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.is_project_internal_participant(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.production_plan_payload_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.production_task_patch_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_project_preproduction_immutable_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_project_preproduction_authority()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_production_task_write()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_production_task_dependency_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.verify_project_preproduction_receipt_hash()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_project_preproduction_event_insert()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.get_project_production_plan(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.initialize_production_plan(uuid, integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.mutate_production_task(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.get_project_production_plan(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.initialize_production_plan(uuid, integer, uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.mutate_production_task(uuid, bigint, uuid, jsonb)
  TO authenticated;

CREATE INDEX production_plan_revisions_project_current_idx
  ON co_production.production_plan_revisions(project_id, revision_number DESC);
CREATE INDEX production_tasks_project_plan_position_idx
  ON co_production.production_tasks(project_id, plan_revision_id, position);
CREATE INDEX production_tasks_project_assignee_idx
  ON co_production.production_tasks(project_id, assignee_id)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX production_task_dependencies_prerequisite_idx
  ON co_production.production_task_dependencies(
    project_id,
    plan_revision_id,
    depends_on_task_id
  );
CREATE INDEX project_preproduction_events_project_occurred_idx
  ON co_production.project_preproduction_events(project_id, occurred_at DESC);

COMMIT;

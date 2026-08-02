import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");

const postgresAuthorityChain = [
  "20260715093300_fail_closed_co_production_authority.sql",
  "20260715170500_proposal_handoff_authority.sql",
  "20260715183000_identity_governance_authority.sql",
  "20260716002000_project_operating_source_projection.sql",
  "20260716020000_preproject_crm_authority.sql",
  "20260716030000_preproject_project_origin_authority.sql",
  "20260716040000_project_production_plan_task_authority.sql",
  "20260716090001_project_manual_origin_authority.sql",
  "20260716100000_opportunity_proposal_readiness_authority.sql",
  "20260716113000_proposal_activation_authorization_authority.sql",
  "20260716123000_project_brief_projection_authority.sql",
  "20260716124000_production_plan_project_brief_binding.sql",
  "20260716130000_project_script_revision_authority.sql",
  "20260716131000_production_plan_project_script_binding.sql",
  "20260716183000_project_shot_plan_authority.sql",
  "20260716203000_project_production_schedule_authority.sql",
] as const;

function runDocker(args: string[], input?: string): string {
  const result = spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    maxBuffer: 48 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `docker ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function behaviorProofSql(): string {
  return String.raw`
INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

INSERT INTO co_production.projects (id, team_id, owner_id, name) VALUES (
  '11111111-1111-4111-8111-111111111111',
  NULL,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Governed production schedule project'
);

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
SELECT
  '11111111-1111-4111-8111-111111111111'::uuid,
  NULL,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'operation', 'create_manual_project_with_origin',
      'actorId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      'projectId', '11111111-1111-4111-8111-111111111111'::uuid,
      'teamId', NULL,
      'requestId', '10000000-0000-4000-8000-000000000001'::uuid,
      'name', 'Governed production schedule project',
      'description', NULL
    )::text
  ),
  'manual',
  'Governed production schedule project',
  NULL,
  statement_timestamp();

INSERT INTO co_production.project_members(project_id, user_id, role) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'editor'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'reviewer'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'producer'
  );

CREATE OR REPLACE FUNCTION public.proof_exact_json_keys(
  p_value jsonb,
  p_keys text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT pg_catalog.jsonb_typeof(p_value) = 'object'
    AND p_value ?& p_keys
    AND p_value - p_keys = '{}'::jsonb
$$;

CREATE OR REPLACE FUNCTION public.proof_adjacent_snapshot(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'tasks',
      (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(task)
            ORDER BY task.id
          ),
          '[]'::jsonb
        )
        FROM co_production.production_tasks AS task
        WHERE task.project_id = p_project_id
      ),
    'shotPlanRevisions',
      (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(revision)
            ORDER BY revision.revision_number
          ),
          '[]'::jsonb
        )
        FROM co_production.project_shot_plan_revisions AS revision
        WHERE revision.project_id = p_project_id
      ),
    'shotPlanApprovalBindings',
      (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(binding)
            ORDER BY binding.approved_at, binding.id
          ),
          '[]'::jsonb
        )
        FROM co_production.project_shot_plan_approval_bindings AS binding
        WHERE binding.project_id = p_project_id
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.proof_make_submittable_schedule(
  p_seed jsonb,
  p_date text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_shots jsonb;
  v_items jsonb;
BEGIN
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item_record.value ->> 'id',
        'order', item_record.position::integer + 1,
        'kind', 'shot',
        'sourceSceneId', item_record.value ->> 'sourceSceneId',
        'sourceShotId', item_record.value ->> 'sourceShotId',
        'label', NULL,
        'notes', NULL,
        'startTime', CASE item_record.position
          WHEN 1 THEN '08:00'
          ELSE '08:45'
        END,
        'plannedDurationMinutes', 30
      )
      ORDER BY item_record.position
    ),
    '[]'::jsonb
  )
  INTO v_shots
  FROM pg_catalog.jsonb_array_elements(p_seed -> 'unscheduled')
    WITH ORDINALITY AS item_record(value, position);

  v_items := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id', 'setup-001',
      'order', 1,
      'kind', 'setup',
      'sourceSceneId', NULL,
      'sourceShotId', NULL,
      'label', 'Camera setup',
      'notes', NULL,
      'startTime', '07:45',
      'plannedDurationMinutes', 15
    )
  ) || v_shots;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 'cco.production-schedule.v1',
    'title', p_seed ->> 'title',
    'timeZone', 'America/Chicago',
    'days', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'day-001',
        'order', 1,
        'date', p_date,
        'unitCallTime', '07:30',
        'notes', NULL,
        'items', v_items
      )
    ),
    'unscheduled', '[]'::jsonb
  );
END
$$;

REVOKE ALL ON FUNCTION public.proof_adjacent_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proof_adjacent_snapshot(uuid)
  TO authenticated;

CREATE TEMP TABLE proof_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON TABLE proof_state TO authenticated;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    pg_catalog.current_setting('cco.proof_actor', true),
    ''
  )::uuid
$$;

SET cco.proof_actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;

DO $seed_approved_shot_plan$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_plan jsonb := $json$
    {
      "title":"Initial production plan",
      "summary":null,
      "tasks":[{
        "clientTaskId":"initial-task",
        "title":"Preserve production task",
        "description":null,
        "priority":"normal",
        "assigneeId":null,
        "dueDate":null,
        "sourceKind":"manual",
        "sourceRef":null,
        "dependsOnClientTaskIds":[]
      }],
      "sourceDraftId":null,
      "approvalNote":null
    }
  $json$::jsonb;
  v_script jsonb := $json$
    {
      "schemaVersion":"cco.script-content.v1",
      "title":"Launch Film",
      "logline":"A precise product story.",
      "format":"commercial",
      "estimatedRuntimeSeconds":30,
      "sections":[{
        "id":"section.open",
        "heading":"Open",
        "summary":"Establish and reveal the product.",
        "estimatedDurationSeconds":30,
        "blocks":[
          {
            "id":"block.open.heading",
            "kind":"scene_heading",
            "text":"INT. STUDIO",
            "speaker":null,
            "parenthetical":null
          },
          {
            "id":"block.open.visual",
            "kind":"visual",
            "text":"Product enters frame.",
            "speaker":null,
            "parenthetical":null
          }
        ]
      }]
    }
  $json$::jsonb;
  v_result jsonb;
  v_snapshot jsonb;
  v_script_id uuid;
  v_draft_id uuid;
  v_task_id uuid;
  v_shot_plan_id uuid;
BEGIN
  PERFORM co_production.initialize_production_plan(
    v_project_id,
    0,
    '30000000-0000-4000-8000-000000000001',
    v_plan
  );

  v_result := co_production.append_project_script_revision(
    v_project_id,
    1,
    '40000000-0000-4000-8000-000000000001',
    NULL,
    NULL,
    v_script
  );
  v_script_id := (v_result ->> 'scriptRevisionId')::uuid;
  PERFORM co_production.submit_project_script_revision(
    v_project_id,
    v_script_id,
    2,
    '40000000-0000-4000-8000-000000000002',
    NULL
  );
  PERFORM co_production.decide_project_script_revision(
    v_project_id,
    v_script_id,
    3,
    '40000000-0000-4000-8000-000000000003',
    'approved',
    NULL
  );

  v_result := co_production.generate_project_script_plan_draft(
    v_project_id,
    4,
    '50000000-0000-4000-8000-000000000001',
    v_script_id
  );
  v_draft_id := (v_result ->> 'draftId')::uuid;
  PERFORM co_production.approve_project_script_plan_draft(
    v_project_id,
    v_draft_id,
    1,
    '60000000-0000-4000-8000-000000000001',
    'Approve exact generated plan.'
  );

  v_snapshot := co_production.get_project_production_plan(v_project_id);
  v_task_id := (v_snapshot #>> '{tasks,0,id}')::uuid;
  PERFORM co_production.mutate_production_task(
    v_task_id,
    1,
    '35000000-0000-4000-8000-000000000001',
    '{"status":"in_progress"}'::jsonb
  );

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_result := co_production.generate_project_shot_plan_revision(
    v_project_id,
    7,
    '70000000-0000-4000-8000-000000000001',
    v_script_id,
    (v_snapshot #>> '{source,productionPlanRevisionId}')::uuid
  );
  v_shot_plan_id := (v_result ->> 'shotPlanRevisionId')::uuid;
  PERFORM co_production.submit_project_shot_plan_revision(
    v_project_id,
    v_shot_plan_id,
    8,
    '70000000-0000-4000-8000-000000000002',
    'Ready for schedule authority.'
  );
  PERFORM co_production.decide_project_shot_plan_revision(
    v_project_id,
    v_shot_plan_id,
    9,
    '70000000-0000-4000-8000-000000000003',
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  IF v_snapshot ->> 'authorityVersion' <> '10'
    OR v_snapshot #>> '{head,id}' <> v_shot_plan_id::text
    OR v_snapshot #>> '{head,workflow,state}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
    OR pg_catalog.jsonb_array_length(
      v_snapshot #> '{head,content,scenes,0,shots}'
    ) <> 2
  THEN
    RAISE EXCEPTION 'approved shot-plan seed mismatch';
  END IF;

  INSERT INTO proof_state(key, value) VALUES
    ('initial_adjacent', public.proof_adjacent_snapshot(v_project_id)),
    (
      'ids',
      pg_catalog.jsonb_build_object(
        'scriptId', v_script_id,
        'firstShotPlanId', v_shot_plan_id
      )
    );

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  IF NOT public.proof_exact_json_keys(
    v_snapshot,
    ARRAY[
      'projectId', 'authorityVersion', 'eventHeadHash', 'source',
      'head', 'revisions', 'permissions'
    ]
  )
    OR NOT public.proof_exact_json_keys(
      v_snapshot -> 'source',
      ARRAY[
        'shotPlanRevisionId', 'shotPlanRevisionNumber',
        'shotPlanContentHash', 'shotPlanContent',
        'shotPlanApprovalBindingId'
      ]
    )
    OR v_snapshot ->> 'authorityVersion' <> '10'
    OR v_snapshot #>> '{source,shotPlanRevisionId}' <>
      v_shot_plan_id::text
    OR v_snapshot #>> '{source,shotPlanContent,schemaVersion}' <>
      'cco.shot-plan.v1'
    OR v_snapshot #>> '{source,shotPlanContent,title}' <> 'Launch Film'
    OR pg_catalog.jsonb_typeof(v_snapshot -> 'head') <> 'null'
    OR pg_catalog.jsonb_array_length(v_snapshot -> 'revisions') <> 0
    OR v_snapshot #>> '{permissions,canRead}' <> 'true'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'true'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'false'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'empty production-schedule snapshot mismatch';
  END IF;
END
$seed_approved_shot_plan$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_generate_forbidden$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_snapshot jsonb;
BEGIN
  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  IF v_snapshot #>> '{permissions,canRead}' <> 'true'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'false'
  THEN
    RAISE EXCEPTION 'editor read/generate permissions mismatch';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_production_schedule_revision(
      v_project_id,
      10,
      '80000000-0000-4000-8000-000000000099',
      (v_snapshot #>> '{source,shotPlanRevisionId}')::uuid
    );
    RAISE EXCEPTION 'editor generated a production schedule';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$editor_generate_forbidden$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_generation_and_seed_proof$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_source_id uuid;
  v_revision_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_snapshot jsonb;
  v_seed jsonb;
BEGIN
  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  v_source_id := (v_snapshot #>> '{source,shotPlanRevisionId}')::uuid;

  v_result := co_production.generate_project_production_schedule_revision(
    v_project_id,
    10,
    '80000000-0000-4000-8000-000000000001',
    v_source_id
  );
  v_revision_id := (v_result ->> 'productionScheduleRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '11'
    OR v_result ->> 'revisionNumber' <> '1'
    OR v_result ->> 'workflowState' <> 'draft'
    OR v_result ->> 'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'generated schedule result mismatch';
  END IF;

  v_replay := co_production.generate_project_production_schedule_revision(
    v_project_id,
    10,
    '80000000-0000-4000-8000-000000000001',
    v_source_id
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'productionScheduleRevisionId')::uuid <> v_revision_id
  THEN
    RAISE EXCEPTION 'generation exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_production_schedule_revision(
      v_project_id,
      10,
      '80000000-0000-4000-8000-000000000001',
      '99999999-9999-4999-8999-999999999999'
    );
    RAISE EXCEPTION 'generation idempotency conflict was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.generate_project_production_schedule_revision(
      v_project_id,
      10,
      '80000000-0000-4000-8000-000000000002',
      v_source_id
    );
    RAISE EXCEPTION 'stale authority version was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  v_seed := v_snapshot #> '{head,content}';

  IF NOT public.proof_exact_json_keys(
    v_seed,
    ARRAY['schemaVersion', 'title', 'timeZone', 'days', 'unscheduled']
  )
    OR v_seed ->> 'schemaVersion' <> 'cco.production-schedule.v1'
    OR v_seed ->> 'title' <> 'Launch Film production schedule'
    OR pg_catalog.jsonb_typeof(v_seed -> 'timeZone') <> 'null'
    OR pg_catalog.jsonb_array_length(v_seed -> 'days') <> 0
    OR pg_catalog.jsonb_array_length(v_seed -> 'unscheduled') <> 2
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_seed -> 'unscheduled')
        WITH ORDINALITY AS item_record(value, position)
      WHERE NOT public.proof_exact_json_keys(
          item_record.value,
          ARRAY[
            'id', 'order', 'kind', 'sourceSceneId', 'sourceShotId',
            'label', 'notes', 'startTime', 'plannedDurationMinutes'
          ]
        )
        OR item_record.value ->> 'id' <>
          item_record.value ->> 'sourceShotId'
        OR (item_record.value ->> 'order')::bigint <>
          item_record.position
        OR item_record.value ->> 'kind' <> 'shot'
        OR pg_catalog.jsonb_typeof(item_record.value -> 'label') <> 'null'
        OR pg_catalog.jsonb_typeof(item_record.value -> 'notes') <> 'null'
        OR pg_catalog.jsonb_typeof(item_record.value -> 'startTime') <> 'null'
        OR pg_catalog.jsonb_typeof(
          item_record.value -> 'plannedDurationMinutes'
        ) <> 'null'
    )
    OR v_snapshot #>> '{source,shotPlanContent,title}' <> 'Launch Film'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'deterministic production-schedule seed mismatch';
  END IF;

  BEGIN
    PERFORM co_production.submit_project_production_schedule_revision(
      v_project_id,
      v_revision_id,
      11,
      '80000000-0000-4000-8000-000000000003',
      NULL
    );
    RAISE EXCEPTION 'non-submittable seed was submitted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'firstScheduleRevisionId', v_revision_id
  )
  WHERE key = 'ids';
  INSERT INTO proof_state(key, value)
  VALUES ('first_seed', v_seed);
END
$producer_generation_and_seed_proof$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_revision_and_submission$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_base_id uuid;
  v_revision_id uuid;
  v_seed jsonb;
  v_content jsonb;
  v_invalid jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_snapshot jsonb;
  v_first_scene_id text;
  v_first_shot_id text;
BEGIN
  SELECT (state.value ->> 'firstScheduleRevisionId')::uuid
  INTO v_base_id
  FROM proof_state AS state
  WHERE state.key = 'ids';
  SELECT state.value
  INTO v_seed
  FROM proof_state AS state
  WHERE state.key = 'first_seed';

  v_content := public.proof_make_submittable_schedule(
    v_seed,
    '2026-08-01'
  );

  v_invalid := pg_catalog.jsonb_set(
    v_content,
    '{days,0,items,1,sourceShotId}',
    '"foreign-shot"'::jsonb
  );
  BEGIN
    PERFORM co_production.append_project_production_schedule_revision(
      v_project_id,
      11,
      '80000000-0000-4000-8000-000000000004',
      v_base_id,
      'Foreign shot must fail',
      v_invalid
    );
    RAISE EXCEPTION 'foreign shot was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  v_first_scene_id := v_content #>> '{days,0,items,1,sourceSceneId}';
  v_first_shot_id := v_content #>> '{days,0,items,1,sourceShotId}';
  v_invalid := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_content,
      '{days,0,items,2,sourceSceneId}',
      pg_catalog.to_jsonb(v_first_scene_id)
    ),
    '{days,0,items,2,sourceShotId}',
    pg_catalog.to_jsonb(v_first_shot_id)
  );
  BEGIN
    PERFORM co_production.append_project_production_schedule_revision(
      v_project_id,
      11,
      '80000000-0000-4000-8000-000000000005',
      v_base_id,
      'Duplicate shot must fail',
      v_invalid
    );
    RAISE EXCEPTION 'duplicate shot was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  v_result := co_production.append_project_production_schedule_revision(
    v_project_id,
    11,
    '80000000-0000-4000-8000-000000000006',
    v_base_id,
    'Schedule every approved shot',
    v_content
  );
  v_revision_id := (v_result ->> 'productionScheduleRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '12'
    OR v_result ->> 'revisionNumber' <> '2'
    OR v_result ->> 'workflowState' <> 'draft'
  THEN
    RAISE EXCEPTION 'editor schedule revision mismatch';
  END IF;

  v_replay := co_production.append_project_production_schedule_revision(
    v_project_id,
    11,
    '80000000-0000-4000-8000-000000000006',
    v_base_id,
    'Schedule every approved shot',
    v_content
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'productionScheduleRevisionId')::uuid <>
      v_revision_id
  THEN
    RAISE EXCEPTION 'append exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.append_project_production_schedule_revision(
      v_project_id,
      11,
      '80000000-0000-4000-8000-000000000007',
      v_revision_id,
      NULL,
      v_content
    );
    RAISE EXCEPTION 'append authority conflict was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  IF v_snapshot #>> '{permissions,canRead}' <> 'true'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'true'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'editor submittable permissions mismatch';
  END IF;

  v_result := co_production.submit_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    12,
    '80000000-0000-4000-8000-000000000008',
    'Ready for producer review.'
  );
  IF v_result ->> 'authorityVersion' <> '13'
    OR v_result ->> 'workflowState' <> 'submitted'
  THEN
    RAISE EXCEPTION 'editor submission mismatch';
  END IF;

  v_replay := co_production.submit_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    12,
    '80000000-0000-4000-8000-000000000008',
    'Ready for producer review.'
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'submit exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.decide_project_production_schedule_revision(
      v_project_id,
      v_revision_id,
      13,
      '80000000-0000-4000-8000-000000000009',
      'approved',
      NULL
    );
    RAISE EXCEPTION 'editor decided a schedule';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'firstApprovedScheduleId', v_revision_id
  )
  WHERE key = 'ids';
  INSERT INTO proof_state(key, value)
  VALUES ('first_submittable_content', v_content);
END
$editor_revision_and_submission$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_initial_approval$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_revision_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_snapshot jsonb;
BEGIN
  SELECT (state.value ->> 'firstApprovedScheduleId')::uuid
  INTO v_revision_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  v_result := co_production.decide_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    13,
    '80000000-0000-4000-8000-000000000010',
    'approved',
    NULL
  );
  IF v_result ->> 'authorityVersion' <> '14'
    OR v_result ->> 'workflowState' <> 'approved'
  THEN
    RAISE EXCEPTION 'producer approval mismatch';
  END IF;

  v_replay := co_production.decide_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    13,
    '80000000-0000-4000-8000-000000000010',
    'approved',
    NULL
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'decision exact replay failed';
  END IF;

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  IF v_snapshot #>> '{head,workflow,state}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
    OR v_snapshot #>> '{source,shotPlanContent,title}' <> 'Launch Film'
  THEN
    RAISE EXCEPTION 'active approved schedule snapshot mismatch';
  END IF;

  IF public.proof_adjacent_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value
    FROM proof_state AS state
    WHERE state.key = 'initial_adjacent'
  ) THEN
    RAISE EXCEPTION 'schedule workflow mutated tasks or shot-plan authority';
  END IF;
END
$producer_initial_approval$;

RESET ROLE;

SET cco.proof_actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;

DO $owner_changes_active_shot_plan_source$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_old_schedule_id uuid;
  v_base_shot_id uuid;
  v_new_shot_id uuid;
  v_content jsonb;
  v_result jsonb;
  v_snapshot jsonb;
BEGIN
  SELECT (state.value ->> 'firstApprovedScheduleId')::uuid
  INTO v_old_schedule_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_base_shot_id := (v_snapshot #>> '{head,id}')::uuid;
  v_content := pg_catalog.jsonb_set(
    v_snapshot #> '{head,content}',
    '{scenes,0,shots,0,purpose}',
    '"Refined establishing coverage."'::jsonb
  );

  v_result := co_production.append_project_shot_plan_revision(
    v_project_id,
    14,
    '71000000-0000-4000-8000-000000000001',
    v_base_shot_id,
    'Refine the approved shot source',
    v_content
  );
  v_new_shot_id := (v_result ->> 'shotPlanRevisionId')::uuid;
  PERFORM co_production.submit_project_shot_plan_revision(
    v_project_id,
    v_new_shot_id,
    15,
    '71000000-0000-4000-8000-000000000002',
    NULL
  );
  PERFORM co_production.decide_project_shot_plan_revision(
    v_project_id,
    v_new_shot_id,
    16,
    '71000000-0000-4000-8000-000000000003',
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  IF v_snapshot ->> 'authorityVersion' <> '17'
    OR v_snapshot #>> '{source,shotPlanRevisionId}' <>
      v_new_shot_id::text
    OR v_snapshot #>> '{source,shotPlanContent,scenes,0,shots,0,purpose}' <>
      'Refined establishing coverage.'
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'true'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'false'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'true'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'false'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'shot-plan source change did not stale schedule';
  END IF;

  BEGIN
    PERFORM co_production.append_project_production_schedule_revision(
      v_project_id,
      17,
      '81000000-0000-4000-8000-000000000001',
      v_old_schedule_id,
      NULL,
      v_snapshot #> '{head,content}'
    );
    RAISE EXCEPTION 'stale schedule was revised';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.submit_project_production_schedule_revision(
      v_project_id,
      v_old_schedule_id,
      17,
      '81000000-0000-4000-8000-000000000002',
      NULL
    );
    RAISE EXCEPTION 'stale schedule was submitted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.decide_project_production_schedule_revision(
      v_project_id,
      v_old_schedule_id,
      17,
      '81000000-0000-4000-8000-000000000003',
      'approved',
      NULL
    );
    RAISE EXCEPTION 'stale schedule was decided';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'secondShotPlanId', v_new_shot_id
  )
  WHERE key = 'ids';
  INSERT INTO proof_state(key, value)
  VALUES (
    'source_changed_adjacent',
    public.proof_adjacent_snapshot(v_project_id)
  );
END
$owner_changes_active_shot_plan_source$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_new_source_generation$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_old_source_id uuid;
  v_new_source_id uuid;
  v_revision_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_snapshot jsonb;
BEGIN
  SELECT
    (state.value ->> 'firstShotPlanId')::uuid,
    (state.value ->> 'secondShotPlanId')::uuid
  INTO v_old_source_id, v_new_source_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  BEGIN
    PERFORM co_production.generate_project_production_schedule_revision(
      v_project_id,
      17,
      '81000000-0000-4000-8000-000000000004',
      v_old_source_id
    );
    RAISE EXCEPTION 'stale source generation was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  v_result := co_production.generate_project_production_schedule_revision(
    v_project_id,
    17,
    '81000000-0000-4000-8000-000000000005',
    v_new_source_id
  );
  v_revision_id := (v_result ->> 'productionScheduleRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '18'
    OR v_result ->> 'revisionNumber' <> '3'
  THEN
    RAISE EXCEPTION 'new-source generation mismatch';
  END IF;

  v_replay := co_production.generate_project_production_schedule_revision(
    v_project_id,
    17,
    '81000000-0000-4000-8000-000000000005',
    v_new_source_id
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'new-source generation replay failed';
  END IF;

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  IF v_snapshot #>> '{head,content,title}' <>
      'Launch Film production schedule'
    OR v_snapshot #>> '{source,shotPlanContent,scenes,0,shots,0,purpose}' <>
      'Refined establishing coverage.'
  THEN
    RAISE EXCEPTION 'new-source content projection mismatch';
  END IF;

  BEGIN
    PERFORM co_production.submit_project_production_schedule_revision(
      v_project_id,
      v_revision_id,
      18,
      '81000000-0000-4000-8000-000000000006',
      NULL
    );
    RAISE EXCEPTION 'second non-submittable seed was submitted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'secondSeedRevisionId', v_revision_id
  )
  WHERE key = 'ids';
  INSERT INTO proof_state(key, value)
  VALUES ('second_seed', v_snapshot #> '{head,content}');
END
$producer_new_source_generation$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_second_revision_and_submission$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_base_id uuid;
  v_revision_id uuid;
  v_seed jsonb;
  v_content jsonb;
  v_result jsonb;
BEGIN
  SELECT (state.value ->> 'secondSeedRevisionId')::uuid
  INTO v_base_id
  FROM proof_state AS state
  WHERE state.key = 'ids';
  SELECT state.value
  INTO v_seed
  FROM proof_state AS state
  WHERE state.key = 'second_seed';

  v_content := public.proof_make_submittable_schedule(
    v_seed,
    '2026-08-02'
  );
  v_result := co_production.append_project_production_schedule_revision(
    v_project_id,
    18,
    '81000000-0000-4000-8000-000000000007',
    v_base_id,
    'Schedule the refined source',
    v_content
  );
  v_revision_id := (v_result ->> 'productionScheduleRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '19'
    OR v_result ->> 'revisionNumber' <> '4'
  THEN
    RAISE EXCEPTION 'second authored revision mismatch';
  END IF;

  PERFORM co_production.submit_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    19,
    '81000000-0000-4000-8000-000000000008',
    'Review the refined schedule.'
  );

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'changesRequestedScheduleId', v_revision_id
  )
  WHERE key = 'ids';
END
$editor_second_revision_and_submission$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_requests_changes$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_revision_id uuid;
  v_result jsonb;
  v_replay jsonb;
BEGIN
  SELECT (state.value ->> 'changesRequestedScheduleId')::uuid
  INTO v_revision_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  v_result := co_production.decide_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    20,
    '81000000-0000-4000-8000-000000000009',
    'changes_requested',
    'Clarify the production-day notes.'
  );
  IF v_result ->> 'authorityVersion' <> '21'
    OR v_result ->> 'workflowState' <> 'changes_requested'
  THEN
    RAISE EXCEPTION 'changes-requested result mismatch';
  END IF;

  v_replay := co_production.decide_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    20,
    '81000000-0000-4000-8000-000000000009',
    'changes_requested',
    'Clarify the production-day notes.'
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'changes-requested replay failed';
  END IF;
END
$producer_requests_changes$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_resolves_changes$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_base_id uuid;
  v_revision_id uuid;
  v_content jsonb;
  v_result jsonb;
  v_snapshot jsonb;
BEGIN
  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  v_base_id := (v_snapshot #>> '{head,id}')::uuid;
  IF v_snapshot #>> '{head,workflow,state}' <> 'changes_requested'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
  THEN
    RAISE EXCEPTION 'changes-requested editor snapshot mismatch';
  END IF;

  v_content := pg_catalog.jsonb_set(
    v_snapshot #> '{head,content}',
    '{days,0,notes}',
    '"Producer note resolved."'::jsonb
  );
  v_result := co_production.append_project_production_schedule_revision(
    v_project_id,
    21,
    '81000000-0000-4000-8000-000000000010',
    v_base_id,
    'Resolve producer note',
    v_content
  );
  v_revision_id := (v_result ->> 'productionScheduleRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '22'
    OR v_result ->> 'revisionNumber' <> '5'
  THEN
    RAISE EXCEPTION 'resolved schedule revision mismatch';
  END IF;

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  IF v_snapshot #>> '{permissions,canSubmit}' <> 'true' THEN
    RAISE EXCEPTION 'resolved schedule was not submittable';
  END IF;

  PERFORM co_production.submit_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    22,
    '81000000-0000-4000-8000-000000000011',
    'Changes resolved.'
  );

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'finalScheduleId', v_revision_id
  )
  WHERE key = 'ids';
END
$editor_resolves_changes$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_final_approval$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_revision_id uuid;
  v_snapshot jsonb;
  v_old_active boolean;
BEGIN
  SELECT (state.value ->> 'finalScheduleId')::uuid
  INTO v_revision_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  PERFORM co_production.decide_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    23,
    '81000000-0000-4000-8000-000000000012',
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  SELECT (item_record.value #>> '{workflow,isActive}')::boolean
  INTO v_old_active
  FROM pg_catalog.jsonb_array_elements(v_snapshot -> 'revisions')
    AS item_record(value)
  WHERE item_record.value ->> 'revisionNumber' = '2';

  IF v_snapshot ->> 'authorityVersion' <> '24'
    OR v_snapshot #>> '{head,id}' <> v_revision_id::text
    OR v_snapshot #>> '{head,revisionNumber}' <> '5'
    OR v_snapshot #>> '{head,workflow,state}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'false'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
    OR v_snapshot #>> '{head,workflow,decision}' <> 'approved'
    OR v_snapshot #>> '{source,shotPlanContent,scenes,0,shots,0,purpose}' <>
      'Refined establishing coverage.'
    OR pg_catalog.jsonb_array_length(v_snapshot -> 'revisions') <> 5
    OR v_old_active IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'final active schedule snapshot mismatch';
  END IF;

  IF public.proof_adjacent_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value
    FROM proof_state AS state
    WHERE state.key = 'source_changed_adjacent'
  ) THEN
    RAISE EXCEPTION 'second schedule workflow mutated adjacent authority';
  END IF;
END
$producer_final_approval$;

RESET ROLE;

DO $internal_chain_binding_and_immutability$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_head_hash text;
  v_final_id uuid;
BEGIN
  IF (
    SELECT authority.authority_version
    FROM co_production.project_preproduction_authorities AS authority
    WHERE authority.project_id = v_project_id
  ) <> 24 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = v_project_id
  ) <> 24 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_preproduction_events AS event_record
    WHERE event_record.project_id = v_project_id
  ) <> 24 THEN
    RAISE EXCEPTION 'shared authority cardinality mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM co_production.project_production_schedule_revisions AS revision
    WHERE revision.project_id = v_project_id
  ) <> 5 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_production_schedule_approval_bindings AS binding
    WHERE binding.project_id = v_project_id
  ) <> 2 THEN
    RAISE EXCEPTION 'schedule revision or approval cardinality mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM co_production.project_production_schedule_approval_bindings AS binding
    JOIN co_production.project_production_schedule_revisions AS revision
      ON revision.id = binding.production_schedule_revision_id
      AND revision.project_id = binding.project_id
    JOIN co_production.project_preproduction_mutation_receipts AS receipt
      ON receipt.id = binding.decision_receipt_id
      AND receipt.project_id = binding.project_id
      AND receipt.production_schedule_revision_id =
        binding.production_schedule_revision_id
    JOIN co_production.project_shot_plan_approval_bindings AS shot_binding
      ON shot_binding.id = binding.source_shot_plan_approval_binding_id
      AND shot_binding.project_id = binding.project_id
      AND shot_binding.shot_plan_revision_id =
        binding.source_shot_plan_revision_id
      AND shot_binding.shot_plan_content_hash =
        binding.source_shot_plan_content_hash
    WHERE binding.project_id = v_project_id
      AND binding.production_schedule_content_hash = revision.content_hash
      AND binding.source_shot_plan_revision_id =
        revision.source_shot_plan_revision_id
      AND binding.source_shot_plan_content_hash =
        revision.source_shot_plan_content_hash
      AND binding.source_shot_plan_approval_binding_id =
        revision.source_shot_plan_approval_binding_id
      AND receipt.mutation_kind = 'project_production_schedule.approved'
      AND binding.approved_by = receipt.actor_id
      AND binding.approved_at = receipt.created_at
  ) <> 2 THEN
    RAISE EXCEPTION 'exact schedule approval binding evidence mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_production_schedule_approval_bindings AS binding
    JOIN co_production.project_production_schedule_revisions AS revision
      ON revision.id = binding.production_schedule_revision_id
    WHERE binding.project_id = v_project_id
      AND revision.revision_number = 4
  ) THEN
    RAISE EXCEPTION 'changes-requested revision received approval binding';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('project_production_schedule.generated'),
      ('project_production_schedule.revised'),
      ('project_production_schedule.submitted'),
      ('project_production_schedule.approved'),
      ('project_production_schedule.changes_requested')
    ) AS required_kind(kind)
    WHERE NOT EXISTS (
      SELECT 1
      FROM co_production.project_preproduction_mutation_receipts AS receipt
      WHERE receipt.project_id = v_project_id
        AND receipt.mutation_kind = required_kind.kind
    )
  ) THEN
    RAISE EXCEPTION 'required schedule mutation kind missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = v_project_id
      AND receipt.mutation_kind LIKE 'project_production_schedule.%'
      AND receipt.result #> '{source}' ? 'shotPlanContent'
  ) OR EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_events AS event_record
    WHERE event_record.project_id = v_project_id
      AND event_record.event_type LIKE 'project_production_schedule.%'
      AND event_record.payload #> '{source}' ? 'shotPlanContent'
  ) THEN
    RAISE EXCEPTION 'schedule receipt/event persisted shot-plan content';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        event_record.previous_event_hash,
        COALESCE(
          pg_catalog.lag(event_record.event_hash) OVER (
            ORDER BY event_record.authority_version
          ),
          'sha256:' || pg_catalog.repeat('0', 64)
        ) AS expected_previous_hash
      FROM co_production.project_preproduction_events AS event_record
      WHERE event_record.project_id = v_project_id
    ) AS chain
    WHERE chain.previous_event_hash IS DISTINCT FROM
      chain.expected_previous_hash
  ) THEN
    RAISE EXCEPTION 'shared event chain is discontinuous';
  END IF;

  SELECT event_record.event_hash
  INTO v_head_hash
  FROM co_production.project_preproduction_events AS event_record
  WHERE event_record.project_id = v_project_id
  ORDER BY event_record.authority_version DESC
  LIMIT 1;
  IF (
    SELECT authority.event_head_hash
    FROM co_production.project_preproduction_authorities AS authority
    WHERE authority.project_id = v_project_id
  ) IS DISTINCT FROM v_head_hash THEN
    RAISE EXCEPTION 'authority event head mismatch';
  END IF;

  SELECT (state.value ->> 'finalScheduleId')::uuid
  INTO v_final_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  BEGIN
    UPDATE co_production.project_production_schedule_revisions
    SET change_summary = 'Attempted mutation'
    WHERE id = v_final_id;
    RAISE EXCEPTION 'immutable schedule revision was updated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM co_production.project_production_schedule_approval_bindings
    WHERE production_schedule_revision_id = v_final_id;
    RAISE EXCEPTION 'immutable schedule approval binding was deleted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    TRUNCATE TABLE co_production.project_production_schedule_revisions
      CASCADE;
    RAISE EXCEPTION 'immutable schedule revisions were truncated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$internal_chain_binding_and_immutability$;

SET cco.proof_actor = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET ROLE authenticated;

DO $reviewer_forbidden$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  BEGIN
    PERFORM co_production.get_project_production_schedule(v_project_id);
    RAISE EXCEPTION 'reviewer read schedule RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1
    FROM co_production.project_production_schedule_revisions;
    RAISE EXCEPTION 'reviewer directly read schedule revisions';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$reviewer_forbidden$;

RESET ROLE;

SET cco.proof_actor = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET ROLE service_role;

DO $service_role_forbidden$
BEGIN
  BEGIN
    PERFORM co_production.get_project_production_schedule(
      '11111111-1111-4111-8111-111111111111'::uuid
    );
    RAISE EXCEPTION 'service role executed schedule RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1
    FROM co_production.project_production_schedule_approval_bindings;
    RAISE EXCEPTION 'service role directly read schedule bindings';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$service_role_forbidden$;

RESET ROLE;
`;
}

test(
  "PostgreSQL 15 proves exact derivation, replay, conflicts, stale sources, roles, immutability, approval binding, and no task mutation",
  {
    skip: process.env.CCO_PROJECT_PRODUCTION_SCHEDULE_POSTGRES_PROOF !== "1",
    timeout: 240_000,
  },
  async () => {
    const containerName =
      `cco-production-schedule-proof-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    try {
      runDocker([
        "run",
        "--detach",
        "--name",
        containerName,
        "--env",
        "POSTGRES_PASSWORD=postgres",
        "--mount",
        `type=bind,source=${repositoryRoot},target=/workspace,readonly`,
        "postgres:15",
        "-c",
        "wal_level=logical",
      ]);

      let ready = false;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const readiness = spawnSync(
          "docker",
          ["exec", containerName, "pg_isready", "--username", "postgres"],
          { encoding: "utf8" },
        );
        const logs = spawnSync("docker", ["logs", containerName], {
          encoding: "utf8",
        });
        const logOutput = (logs.stdout ?? "") + (logs.stderr ?? "");
        if (
          readiness.status === 0 &&
          logOutput.includes(
            "PostgreSQL init process complete; ready for start up.",
          )
        ) {
          ready = true;
          break;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
      assert.ok(ready, "PostgreSQL 15 proof container did not become ready");

      runDocker([
        "exec",
        containerName,
        "psql",
        "--username",
        "postgres",
        "--dbname",
        "postgres",
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        "/workspace/scripts/certification/preproject-project-origin-authority-fixture.sql",
      ]);
      for (const authorityMigration of postgresAuthorityChain) {
        runDocker([
          "exec",
          containerName,
          "psql",
          "--username",
          "postgres",
          "--dbname",
          "postgres",
          "--set",
          "ON_ERROR_STOP=1",
          "--file",
          `/workspace/supabase/migrations/${authorityMigration}`,
        ]);
      }
      runDocker(
        [
          "exec",
          "-i",
          containerName,
          "psql",
          "--username",
          "postgres",
          "--dbname",
          "postgres",
          "--set",
          "ON_ERROR_STOP=1",
        ],
        behaviorProofSql(),
      );
    } finally {
      spawnSync("docker", ["rm", "--force", containerName], {
        encoding: "utf8",
      });
    }
  },
);

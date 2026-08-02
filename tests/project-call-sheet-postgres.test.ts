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
  "20260716213000_project_call_sheet_authority.sql",
] as const;

function runDocker(args: string[], input?: string): string {
  const result = spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
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
  'Governed call sheet project'
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
      'name', 'Governed call sheet project',
      'description', NULL
    )::text
  ),
  'manual',
  'Governed call sheet project',
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
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(task) ORDER BY task.id),
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
      ),
    'scheduleRevisions',
      (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(revision)
            ORDER BY revision.revision_number
          ),
          '[]'::jsonb
        )
        FROM co_production.project_production_schedule_revisions AS revision
        WHERE revision.project_id = p_project_id
      ),
    'scheduleApprovalBindings',
      (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(binding)
            ORDER BY binding.approved_at, binding.id
          ),
          '[]'::jsonb
        )
        FROM co_production.project_production_schedule_approval_bindings
          AS binding
        WHERE binding.project_id = p_project_id
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.proof_make_two_day_schedule(
  p_seed jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_first jsonb := p_seed #> '{unscheduled,0}';
  v_second jsonb := p_seed #> '{unscheduled,1}';
BEGIN
  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 'cco.production-schedule.v1',
    'title', p_seed ->> 'title',
    'timeZone', 'America/Chicago',
    'days', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'day-001',
        'order', 1,
        'date', '2026-08-01',
        'unitCallTime', '07:30',
        'notes', 'First schedule day notes.',
        'items', pg_catalog.jsonb_build_array(
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
          ),
          pg_catalog.jsonb_build_object(
            'id', v_first ->> 'id',
            'order', 2,
            'kind', 'shot',
            'sourceSceneId', v_first ->> 'sourceSceneId',
            'sourceShotId', v_first ->> 'sourceShotId',
            'label', NULL,
            'notes', NULL,
            'startTime', '08:00',
            'plannedDurationMinutes', 30
          )
        )
      ),
      pg_catalog.jsonb_build_object(
        'id', 'day-002',
        'order', 2,
        'date', '2026-08-02',
        'unitCallTime', '09:00',
        'notes', 'Second schedule day notes.',
        'items', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', v_second ->> 'id',
            'order', 1,
            'kind', 'shot',
            'sourceSceneId', v_second ->> 'sourceSceneId',
            'sourceShotId', v_second ->> 'sourceShotId',
            'label', NULL,
            'notes', NULL,
            'startTime', '09:30',
            'plannedDurationMinutes', 45
          )
        )
      )
    ),
    'unscheduled', '[]'::jsonb
  );
END
$$;

CREATE OR REPLACE FUNCTION public.proof_make_submittable_call_sheet(
  p_seed jsonb,
  p_general_notes text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion', p_seed ->> 'schemaVersion',
    'title', p_seed ->> 'title',
    'scheduleDayId', p_seed ->> 'scheduleDayId',
    'shootDate', p_seed ->> 'shootDate',
    'timeZone', p_seed ->> 'timeZone',
    'unitCallTime', p_seed ->> 'unitCallTime',
    'location', pg_catalog.jsonb_build_object(
      'name', 'Studio A',
      'address', '100 Production Way, Chicago, IL',
      'parkingNotes', 'Use the west lot.',
      'accessNotes', 'Check in at the loading entrance.',
      'contactName', 'Morgan Lee',
      'contactPhone', '+1 312 555 0100'
    ),
    'contacts', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'contact-001',
        'order', 1,
        'name', 'Alex Rivera',
        'role', 'Director',
        'department', 'Production',
        'email', 'alex@example.com',
        'phone', NULL,
        'callTime', '07:00',
        'notes', 'Primary day-of contact.'
      )
    ),
    'sections', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'safety-001',
        'order', 1,
        'kind', 'safety',
        'title', 'Safety briefing',
        'body', 'Review exits and cable paths before first setup.'
      )
    ),
    'agenda', p_seed -> 'agenda',
    'generalNotes', p_general_notes
  )
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

DO $seed_approved_two_day_schedule$
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
  v_schedule_content jsonb;
  v_script_id uuid;
  v_draft_id uuid;
  v_task_id uuid;
  v_shot_plan_id uuid;
  v_schedule_seed_id uuid;
  v_schedule_id uuid;
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

  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  v_result := co_production.generate_project_production_schedule_revision(
    v_project_id,
    10,
    '80000000-0000-4000-8000-000000000001',
    v_shot_plan_id
  );
  v_schedule_seed_id :=
    (v_result ->> 'productionScheduleRevisionId')::uuid;
  v_snapshot := co_production.get_project_production_schedule(v_project_id);
  v_schedule_content := public.proof_make_two_day_schedule(
    v_snapshot #> '{head,content}'
  );
  v_result := co_production.append_project_production_schedule_revision(
    v_project_id,
    11,
    '80000000-0000-4000-8000-000000000002',
    v_schedule_seed_id,
    'Schedule both approved shots across two days',
    v_schedule_content
  );
  v_schedule_id := (v_result ->> 'productionScheduleRevisionId')::uuid;
  PERFORM co_production.submit_project_production_schedule_revision(
    v_project_id,
    v_schedule_id,
    12,
    '80000000-0000-4000-8000-000000000003',
    'Ready for call-sheet authority.'
  );
  PERFORM co_production.decide_project_production_schedule_revision(
    v_project_id,
    v_schedule_id,
    13,
    '80000000-0000-4000-8000-000000000004',
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  IF NOT public.proof_exact_json_keys(
    v_snapshot,
    ARRAY[
      'projectId', 'selectedScheduleDayId', 'authorityVersion',
      'eventHeadHash', 'source', 'head', 'revisions', 'permissions'
    ]
  )
    OR v_snapshot ->> 'selectedScheduleDayId' <> 'day-001'
    OR v_snapshot ->> 'authorityVersion' <> '14'
    OR v_snapshot #>> '{source,productionScheduleRevisionId}' <>
      v_schedule_id::text
    OR v_snapshot #>> '{source,scheduleDayId}' <> 'day-001'
    OR v_snapshot #>> '{source,scheduleDay,order}' <> '1'
    OR v_snapshot #>> '{source,scheduleDay,date}' <> '2026-08-01'
    OR pg_catalog.jsonb_typeof(v_snapshot -> 'head') <> 'null'
    OR pg_catalog.jsonb_array_length(v_snapshot -> 'revisions') <> 0
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'true'
  THEN
    RAISE EXCEPTION 'default first-day call-sheet bootstrap mismatch';
  END IF;

  v_snapshot := co_production.get_project_call_sheet(
    v_project_id,
    'day-002'
  );
  IF v_snapshot ->> 'selectedScheduleDayId' <> 'day-002'
    OR v_snapshot #>> '{source,scheduleDay,order}' <> '2'
    OR v_snapshot #>> '{source,scheduleDay,date}' <> '2026-08-02'
  THEN
    RAISE EXCEPTION 'explicit second-day discovery mismatch';
  END IF;

  INSERT INTO proof_state(key, value) VALUES
    (
      'ids',
      pg_catalog.jsonb_build_object(
        'firstScheduleId', v_schedule_id,
        'shotPlanId', v_shot_plan_id
      )
    ),
    ('initialAdjacent', public.proof_adjacent_snapshot(v_project_id));
END
$seed_approved_two_day_schedule$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_read_generate_boundary$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_snapshot jsonb;
BEGIN
  v_snapshot := co_production.get_project_call_sheet(v_project_id, NULL);
  IF v_snapshot ->> 'selectedScheduleDayId' <> 'day-001'
    OR v_snapshot #>> '{permissions,canRead}' <> 'true'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'false'
  THEN
    RAISE EXCEPTION 'editor bootstrap permissions mismatch';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_call_sheet_revision(
      v_project_id,
      14,
      '90000000-0000-4000-8000-000000000099',
      'day-001',
      (v_snapshot #>> '{source,productionScheduleRevisionId}')::uuid
    );
    RAISE EXCEPTION 'editor generated a call sheet';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$editor_read_generate_boundary$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_generation_and_derivation$
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
  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  v_source_id :=
    (v_snapshot #>> '{source,productionScheduleRevisionId}')::uuid;

  v_result := co_production.generate_project_call_sheet_revision(
    v_project_id,
    14,
    '90000000-0000-4000-8000-000000000001',
    'day-001',
    v_source_id
  );
  v_revision_id := (v_result ->> 'callSheetRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '15'
    OR v_result ->> 'revisionNumber' <> '1'
    OR v_result ->> 'workflowState' <> 'draft'
    OR v_result ->> 'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'generated call-sheet result mismatch';
  END IF;

  v_replay := co_production.generate_project_call_sheet_revision(
    v_project_id,
    14,
    '90000000-0000-4000-8000-000000000001',
    'day-001',
    v_source_id
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'callSheetRevisionId')::uuid <> v_revision_id
  THEN
    RAISE EXCEPTION 'generation exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_call_sheet_revision(
      v_project_id,
      14,
      '90000000-0000-4000-8000-000000000001',
      'day-002',
      v_source_id
    );
    RAISE EXCEPTION 'generation idempotency conflict was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.generate_project_call_sheet_revision(
      v_project_id,
      14,
      '90000000-0000-4000-8000-000000000002',
      'day-001',
      v_source_id
    );
    RAISE EXCEPTION 'stale authority version was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  v_seed := v_snapshot #> '{head,content}';
  IF NOT public.proof_exact_json_keys(
    v_seed,
    ARRAY[
      'schemaVersion', 'title', 'scheduleDayId', 'shootDate', 'timeZone',
      'unitCallTime', 'location', 'contacts', 'sections', 'agenda',
      'generalNotes'
    ]
  )
    OR v_seed ->> 'schemaVersion' <> 'cco.call-sheet.v1'
    OR v_seed ->> 'title' <>
      'Launch Film production schedule - 2026-08-01'
    OR v_seed ->> 'scheduleDayId' <> 'day-001'
    OR v_seed ->> 'shootDate' <> '2026-08-01'
    OR v_seed ->> 'timeZone' <> 'America/Chicago'
    OR v_seed ->> 'unitCallTime' <> '07:30'
    OR v_seed #>> '{location,name}' IS NOT NULL
    OR v_seed #>> '{location,address}' IS NOT NULL
    OR pg_catalog.jsonb_array_length(v_seed -> 'contacts') <> 0
    OR pg_catalog.jsonb_array_length(v_seed -> 'sections') <> 0
    OR pg_catalog.jsonb_array_length(v_seed -> 'agenda') <> 2
    OR v_seed #>> '{agenda,0,scheduleItemId}' <> 'setup-001'
    OR v_seed #>> '{agenda,0,label}' <> 'Camera setup'
    OR v_seed #>> '{agenda,1,label}' <>
      'Shot ' || (v_seed #>> '{agenda,1,sourceShotId}')
    OR v_seed #>> '{agenda,1,startTime}' <> '08:00'
    OR v_seed #>> '{agenda,1,plannedDurationMinutes}' <> '30'
    OR v_seed ->> 'generalNotes' <> 'First schedule day notes.'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
  THEN
    RAISE EXCEPTION 'deterministic call-sheet seed mismatch';
  END IF;

  BEGIN
    PERFORM co_production.submit_project_call_sheet_revision(
      v_project_id,
      15,
      '90000000-0000-4000-8000-000000000003',
      v_revision_id,
      NULL
    );
    RAISE EXCEPTION 'non-submittable seed was submitted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'firstSeedId', v_revision_id
  )
  WHERE key = 'ids';
  INSERT INTO proof_state(key, value) VALUES ('firstSeed', v_seed);
END
$producer_generation_and_derivation$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_append_and_submit$
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
  v_contact jsonb;
BEGIN
  SELECT (state.value ->> 'firstSeedId')::uuid
  INTO v_base_id
  FROM proof_state AS state
  WHERE state.key = 'ids';
  SELECT state.value
  INTO v_seed
  FROM proof_state AS state
  WHERE state.key = 'firstSeed';

  v_content := public.proof_make_submittable_call_sheet(
    v_seed,
    'Crew parking opens at 06:45.'
  );
  v_invalid := pg_catalog.jsonb_set(
    v_content,
    '{agenda,0,startTime}',
    '"07:46"'::jsonb
  );
  BEGIN
    PERFORM co_production.append_project_call_sheet_revision(
      v_project_id,
      15,
      '90000000-0000-4000-8000-000000000004',
      v_base_id,
      'Agenda drift must fail',
      v_invalid
    );
    RAISE EXCEPTION 'schedule agenda drift was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  v_contact := v_content #> '{contacts,0}';
  v_invalid := pg_catalog.jsonb_set(
    v_content,
    '{contacts}',
    pg_catalog.jsonb_build_array(
      v_contact,
      pg_catalog.jsonb_set(v_contact, '{order}', '2'::jsonb)
    )
  );
  BEGIN
    PERFORM co_production.append_project_call_sheet_revision(
      v_project_id,
      15,
      '90000000-0000-4000-8000-000000000005',
      v_base_id,
      'Duplicate contact IDs must fail',
      v_invalid
    );
    RAISE EXCEPTION 'duplicate contact ID was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  v_result := co_production.append_project_call_sheet_revision(
    v_project_id,
    15,
    '90000000-0000-4000-8000-000000000006',
    v_base_id,
    'Add day-of logistics, contacts, and safety',
    v_content
  );
  v_revision_id := (v_result ->> 'callSheetRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '16'
    OR v_result ->> 'revisionNumber' <> '2'
    OR v_result ->> 'workflowState' <> 'draft'
  THEN
    RAISE EXCEPTION 'editor authored revision mismatch';
  END IF;

  v_replay := co_production.append_project_call_sheet_revision(
    v_project_id,
    15,
    '90000000-0000-4000-8000-000000000006',
    v_base_id,
    'Add day-of logistics, contacts, and safety',
    v_content
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'callSheetRevisionId')::uuid <> v_revision_id
  THEN
    RAISE EXCEPTION 'append exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.append_project_call_sheet_revision(
      v_project_id,
      15,
      '90000000-0000-4000-8000-000000000006',
      v_base_id,
      'Changed replay payload',
      v_content
    );
    RAISE EXCEPTION 'append idempotency conflict was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  IF v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'true'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'editor submittable permissions mismatch';
  END IF;

  v_result := co_production.submit_project_call_sheet_revision(
    v_project_id,
    16,
    '90000000-0000-4000-8000-000000000007',
    v_revision_id,
    'Ready for producer review.'
  );
  IF v_result ->> 'authorityVersion' <> '17'
    OR v_result ->> 'workflowState' <> 'submitted'
  THEN
    RAISE EXCEPTION 'editor submission mismatch';
  END IF;

  v_replay := co_production.submit_project_call_sheet_revision(
    v_project_id,
    16,
    '90000000-0000-4000-8000-000000000007',
    v_revision_id,
    'Ready for producer review.'
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'submit exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.append_project_call_sheet_revision(
      v_project_id,
      17,
      '90000000-0000-4000-8000-000000000008',
      v_revision_id,
      NULL,
      v_content
    );
    RAISE EXCEPTION 'submitted call sheet was revised';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.decide_project_call_sheet_revision(
      v_project_id,
      17,
      '90000000-0000-4000-8000-000000000009',
      v_revision_id,
      'approved',
      NULL
    );
    RAISE EXCEPTION 'editor decided a call sheet';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'changesRequestedId', v_revision_id
  )
  WHERE key = 'ids';
  INSERT INTO proof_state(key, value) VALUES ('firstSubmittable', v_content);
END
$editor_append_and_submit$;

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
  v_snapshot jsonb;
BEGIN
  SELECT (state.value ->> 'changesRequestedId')::uuid
  INTO v_revision_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  IF v_snapshot #>> '{head,workflow,state}' <> 'submitted'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'true'
  THEN
    RAISE EXCEPTION 'producer submitted permissions mismatch';
  END IF;

  BEGIN
    PERFORM co_production.decide_project_call_sheet_revision(
      v_project_id,
      17,
      '90000000-0000-4000-8000-000000000010',
      v_revision_id,
      'changes_requested',
      NULL
    );
    RAISE EXCEPTION 'changes requested without note was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  v_result := co_production.decide_project_call_sheet_revision(
    v_project_id,
    17,
    '90000000-0000-4000-8000-000000000011',
    v_revision_id,
    'changes_requested',
    'Clarify the crew arrival note.'
  );
  IF v_result ->> 'authorityVersion' <> '18'
    OR v_result ->> 'workflowState' <> 'changes_requested'
  THEN
    RAISE EXCEPTION 'changes-requested result mismatch';
  END IF;

  v_replay := co_production.decide_project_call_sheet_revision(
    v_project_id,
    17,
    '90000000-0000-4000-8000-000000000011',
    v_revision_id,
    'changes_requested',
    'Clarify the crew arrival note.'
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'changes-requested replay failed';
  END IF;
END
$producer_requests_changes$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_resolves_and_resubmits$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_base_id uuid;
  v_revision_id uuid;
  v_content jsonb;
  v_result jsonb;
  v_snapshot jsonb;
BEGIN
  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  v_base_id := (v_snapshot #>> '{head,id}')::uuid;
  IF v_snapshot #>> '{head,workflow,state}' <> 'changes_requested'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
  THEN
    RAISE EXCEPTION 'changes-requested editor snapshot mismatch';
  END IF;

  v_content := pg_catalog.jsonb_set(
    v_snapshot #> '{head,content}',
    '{generalNotes}',
    '"Crew parking opens at 06:30; west lot only."'::jsonb
  );
  v_result := co_production.append_project_call_sheet_revision(
    v_project_id,
    18,
    '90000000-0000-4000-8000-000000000012',
    v_base_id,
    'Resolve producer note',
    v_content
  );
  v_revision_id := (v_result ->> 'callSheetRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '19'
    OR v_result ->> 'revisionNumber' <> '3'
  THEN
    RAISE EXCEPTION 'resolved call-sheet revision mismatch';
  END IF;

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  IF v_snapshot #>> '{permissions,canSubmit}' <> 'true' THEN
    RAISE EXCEPTION 'resolved call sheet was not submittable';
  END IF;

  PERFORM co_production.submit_project_call_sheet_revision(
    v_project_id,
    19,
    '90000000-0000-4000-8000-000000000013',
    v_revision_id,
    'Changes resolved.'
  );

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'firstApprovedId', v_revision_id
  )
  WHERE key = 'ids';
END
$editor_resolves_and_resubmits$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_approves_and_generates_second_day$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_revision_id uuid;
  v_day_two_id uuid;
  v_source_id uuid;
  v_result jsonb;
  v_snapshot jsonb;
BEGIN
  SELECT (state.value ->> 'firstApprovedId')::uuid
  INTO v_revision_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  PERFORM co_production.decide_project_call_sheet_revision(
    v_project_id,
    20,
    '90000000-0000-4000-8000-000000000014',
    v_revision_id,
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  IF v_snapshot ->> 'selectedScheduleDayId' <> 'day-001'
    OR v_snapshot #>> '{head,id}' <> v_revision_id::text
    OR v_snapshot #>> '{head,workflow,state}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'false'
  THEN
    RAISE EXCEPTION 'first approved call-sheet snapshot mismatch';
  END IF;

  v_snapshot := co_production.get_project_call_sheet(
    v_project_id,
    'day-002'
  );
  v_source_id :=
    (v_snapshot #>> '{source,productionScheduleRevisionId}')::uuid;
  IF v_snapshot #>> '{permissions,canGenerate}' <> 'true'
    OR pg_catalog.jsonb_typeof(v_snapshot -> 'head') <> 'null'
  THEN
    RAISE EXCEPTION 'second-day lane was not independent';
  END IF;

  v_result := co_production.generate_project_call_sheet_revision(
    v_project_id,
    21,
    '90000000-0000-4000-8000-000000000015',
    'day-002',
    v_source_id
  );
  v_day_two_id := (v_result ->> 'callSheetRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '22'
    OR v_result ->> 'revisionNumber' <> '1'
  THEN
    RAISE EXCEPTION 'second-day independent generation mismatch';
  END IF;

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  IF v_snapshot ->> 'selectedScheduleDayId' <> 'day-001'
    OR v_snapshot #>> '{head,id}' <> v_revision_id::text
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
  THEN
    RAISE EXCEPTION 'default bootstrap followed recent day instead of order';
  END IF;

  IF public.proof_adjacent_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value
    FROM proof_state AS state
    WHERE state.key = 'initialAdjacent'
  ) THEN
    RAISE EXCEPTION 'call-sheet workflow mutated adjacent authority';
  END IF;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'dayTwoSeedId', v_day_two_id
  )
  WHERE key = 'ids';
END
$producer_approves_and_generates_second_day$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_revises_active_schedule_source$
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
  v_content := pg_catalog.jsonb_set(
    v_snapshot #> '{head,content}',
    '{days,0,notes}',
    '"Updated first-day source notes."'::jsonb
  );

  v_result := co_production.append_project_production_schedule_revision(
    v_project_id,
    22,
    '91000000-0000-4000-8000-000000000001',
    v_base_id,
    'Update the approved first schedule day',
    v_content
  );
  v_revision_id :=
    (v_result ->> 'productionScheduleRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '23'
    OR v_result ->> 'revisionNumber' <> '3'
  THEN
    RAISE EXCEPTION 'schedule source revision mismatch';
  END IF;

  PERFORM co_production.submit_project_production_schedule_revision(
    v_project_id,
    v_revision_id,
    23,
    '91000000-0000-4000-8000-000000000002',
    'Approve the updated source day.'
  );

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'secondScheduleId', v_revision_id
  )
  WHERE key = 'ids';
END
$editor_revises_active_schedule_source$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_approves_new_schedule_and_stales_call_sheets$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_old_schedule_id uuid;
  v_new_schedule_id uuid;
  v_old_call_sheet_id uuid;
  v_snapshot jsonb;
  v_old_content jsonb;
BEGIN
  SELECT
    (state.value ->> 'firstScheduleId')::uuid,
    (state.value ->> 'secondScheduleId')::uuid,
    (state.value ->> 'firstApprovedId')::uuid
  INTO v_old_schedule_id, v_new_schedule_id, v_old_call_sheet_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  PERFORM co_production.decide_project_production_schedule_revision(
    v_project_id,
    v_new_schedule_id,
    24,
    '91000000-0000-4000-8000-000000000003',
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  v_old_content := v_snapshot #> '{head,content}';
  IF v_snapshot ->> 'authorityVersion' <> '25'
    OR v_snapshot ->> 'selectedScheduleDayId' <> 'day-001'
    OR v_snapshot #>> '{source,productionScheduleRevisionId}' <>
      v_new_schedule_id::text
    OR v_snapshot #>> '{source,scheduleDay,notes}' <>
      'Updated first-day source notes.'
    OR v_snapshot #>> '{head,id}' <> v_old_call_sheet_id::text
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'true'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'false'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'true'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'false'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'new schedule did not stale first-day call sheet';
  END IF;

  v_snapshot := co_production.get_project_call_sheet(
    v_project_id,
    'day-002'
  );
  IF v_snapshot #>> '{head,workflow,isStale}' <> 'true'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'true'
  THEN
    RAISE EXCEPTION 'new schedule did not stale second-day call sheet';
  END IF;

  BEGIN
    PERFORM co_production.append_project_call_sheet_revision(
      v_project_id,
      25,
      '91000000-0000-4000-8000-000000000004',
      v_old_call_sheet_id,
      NULL,
      v_old_content
    );
    RAISE EXCEPTION 'stale call sheet was revised';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.submit_project_call_sheet_revision(
      v_project_id,
      25,
      '91000000-0000-4000-8000-000000000005',
      v_old_call_sheet_id,
      NULL
    );
    RAISE EXCEPTION 'stale call sheet was submitted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.decide_project_call_sheet_revision(
      v_project_id,
      25,
      '91000000-0000-4000-8000-000000000006',
      v_old_call_sheet_id,
      'approved',
      NULL
    );
    RAISE EXCEPTION 'stale call sheet was decided';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  INSERT INTO proof_state(key, value) VALUES (
    'postScheduleAdjacent',
    public.proof_adjacent_snapshot(v_project_id)
  );
END
$producer_approves_new_schedule_and_stales_call_sheets$;

RESET ROLE;

SET cco.proof_actor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;

DO $producer_regenerates_exact_new_source$
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
    (state.value ->> 'firstScheduleId')::uuid,
    (state.value ->> 'secondScheduleId')::uuid
  INTO v_old_source_id, v_new_source_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  BEGIN
    PERFORM co_production.generate_project_call_sheet_revision(
      v_project_id,
      25,
      '91000000-0000-4000-8000-000000000007',
      'day-001',
      v_old_source_id
    );
    RAISE EXCEPTION 'stale schedule source generation was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  v_result := co_production.generate_project_call_sheet_revision(
    v_project_id,
    25,
    '91000000-0000-4000-8000-000000000008',
    'day-001',
    v_new_source_id
  );
  v_revision_id := (v_result ->> 'callSheetRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '26'
    OR v_result ->> 'revisionNumber' <> '4'
    OR v_result #>> '{source,productionScheduleRevisionId}' <>
      v_new_source_id::text
  THEN
    RAISE EXCEPTION 'new schedule source generation mismatch';
  END IF;

  v_replay := co_production.generate_project_call_sheet_revision(
    v_project_id,
    25,
    '91000000-0000-4000-8000-000000000008',
    'day-001',
    v_new_source_id
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'new-source generation replay failed';
  END IF;

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  IF v_snapshot #>> '{head,content,generalNotes}' <>
      'Updated first-day source notes.'
    OR v_snapshot #>> '{head,workflow,state}' <> 'draft'
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'false'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
  THEN
    RAISE EXCEPTION 'new-source deterministic content mismatch';
  END IF;

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'secondSeedId', v_revision_id
  )
  WHERE key = 'ids';
  INSERT INTO proof_state(key, value) VALUES (
    'secondSeed',
    v_snapshot #> '{head,content}'
  );
END
$producer_regenerates_exact_new_source$;

RESET ROLE;

SET cco.proof_actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;

DO $editor_authors_and_submits_new_source$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_base_id uuid;
  v_revision_id uuid;
  v_seed jsonb;
  v_content jsonb;
  v_result jsonb;
BEGIN
  SELECT (state.value ->> 'secondSeedId')::uuid
  INTO v_base_id
  FROM proof_state AS state
  WHERE state.key = 'ids';
  SELECT state.value
  INTO v_seed
  FROM proof_state AS state
  WHERE state.key = 'secondSeed';

  v_content := public.proof_make_submittable_call_sheet(
    v_seed,
    'Updated first-day source notes. Crew parking opens at 06:30.'
  );
  v_result := co_production.append_project_call_sheet_revision(
    v_project_id,
    26,
    '91000000-0000-4000-8000-000000000009',
    v_base_id,
    'Add logistics to the updated source day',
    v_content
  );
  v_revision_id := (v_result ->> 'callSheetRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '27'
    OR v_result ->> 'revisionNumber' <> '5'
  THEN
    RAISE EXCEPTION 'new-source authored revision mismatch';
  END IF;

  PERFORM co_production.submit_project_call_sheet_revision(
    v_project_id,
    27,
    '91000000-0000-4000-8000-000000000010',
    v_revision_id,
    'Updated source call sheet is ready.'
  );

  UPDATE proof_state
  SET value = value || pg_catalog.jsonb_build_object(
    'finalCallSheetId', v_revision_id
  )
  WHERE key = 'ids';
END
$editor_authors_and_submits_new_source$;

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
  SELECT (state.value ->> 'finalCallSheetId')::uuid
  INTO v_revision_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  PERFORM co_production.decide_project_call_sheet_revision(
    v_project_id,
    28,
    '91000000-0000-4000-8000-000000000011',
    v_revision_id,
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_call_sheet(v_project_id);
  SELECT (item_record.value #>> '{workflow,isActive}')::boolean
  INTO v_old_active
  FROM pg_catalog.jsonb_array_elements(v_snapshot -> 'revisions')
    AS item_record(value)
  WHERE item_record.value ->> 'revisionNumber' = '3';

  IF v_snapshot ->> 'authorityVersion' <> '29'
    OR v_snapshot ->> 'selectedScheduleDayId' <> 'day-001'
    OR v_snapshot #>> '{head,id}' <> v_revision_id::text
    OR v_snapshot #>> '{head,revisionNumber}' <> '5'
    OR v_snapshot #>> '{head,workflow,state}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'false'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
    OR v_snapshot #>> '{source,scheduleDay,notes}' <>
      'Updated first-day source notes.'
    OR pg_catalog.jsonb_array_length(v_snapshot -> 'revisions') <> 5
    OR v_old_active IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'final active call-sheet snapshot mismatch';
  END IF;

  IF public.proof_adjacent_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value
    FROM proof_state AS state
    WHERE state.key = 'postScheduleAdjacent'
  ) THEN
    RAISE EXCEPTION 'new-source call-sheet workflow mutated adjacent authority';
  END IF;
END
$producer_final_approval$;

RESET ROLE;

DO $internal_binding_chain_and_immutability$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_head_hash text;
  v_final_id uuid;
  v_changes_requested_id uuid;
BEGIN
  IF (
    SELECT authority.authority_version
    FROM co_production.project_preproduction_authorities AS authority
    WHERE authority.project_id = v_project_id
  ) <> 29 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = v_project_id
  ) <> 29 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_preproduction_events AS event_record
    WHERE event_record.project_id = v_project_id
  ) <> 29 THEN
    RAISE EXCEPTION 'shared authority cardinality mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM co_production.project_call_sheet_revisions AS revision
    WHERE revision.project_id = v_project_id
  ) <> 6 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_call_sheet_revisions AS revision
    WHERE revision.project_id = v_project_id
      AND revision.schedule_day_id = 'day-001'
  ) <> 5 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_call_sheet_revisions AS revision
    WHERE revision.project_id = v_project_id
      AND revision.schedule_day_id = 'day-002'
  ) <> 1 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_call_sheet_approval_bindings AS binding
    WHERE binding.project_id = v_project_id
  ) <> 2 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = v_project_id
      AND receipt.mutation_kind LIKE 'project_call_sheet.%'
  ) <> 12 THEN
    RAISE EXCEPTION 'call-sheet revision, binding, or receipt cardinality mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM co_production.project_call_sheet_approval_bindings AS binding
    JOIN co_production.project_call_sheet_revisions AS revision
      ON revision.id = binding.call_sheet_revision_id
      AND revision.project_id = binding.project_id
      AND revision.content_hash = binding.call_sheet_content_hash
      AND revision.schedule_day_id = binding.schedule_day_id
      AND revision.source_production_schedule_revision_id =
        binding.source_production_schedule_revision_id
      AND revision.source_production_schedule_content_hash =
        binding.source_production_schedule_content_hash
      AND revision.source_production_schedule_approval_binding_id =
        binding.source_production_schedule_approval_binding_id
      AND revision.source_schedule_day_content_hash =
        binding.source_schedule_day_content_hash
    JOIN co_production.project_preproduction_mutation_receipts AS receipt
      ON receipt.id = binding.decision_receipt_id
      AND receipt.project_id = binding.project_id
      AND receipt.call_sheet_revision_id = binding.call_sheet_revision_id
    JOIN co_production.project_production_schedule_approval_bindings
      AS schedule_binding
      ON schedule_binding.id =
        binding.source_production_schedule_approval_binding_id
      AND schedule_binding.project_id = binding.project_id
      AND schedule_binding.production_schedule_revision_id =
        binding.source_production_schedule_revision_id
      AND schedule_binding.production_schedule_content_hash =
        binding.source_production_schedule_content_hash
    JOIN co_production.project_production_schedule_revisions AS schedule
      ON schedule.id = binding.source_production_schedule_revision_id
      AND schedule.project_id = binding.project_id
      AND schedule.content_hash =
        binding.source_production_schedule_content_hash
    JOIN LATERAL pg_catalog.jsonb_array_elements(schedule.content -> 'days')
      AS day_record(value)
      ON day_record.value ->> 'id' = binding.schedule_day_id
    WHERE binding.project_id = v_project_id
      AND binding.source_schedule_day_content_hash =
        co_production_private.preproject_sha256(day_record.value::text)
      AND receipt.mutation_kind = 'project_call_sheet.approved'
      AND binding.approved_by = receipt.actor_id
      AND binding.approved_at = receipt.created_at
  ) <> 2 THEN
    RAISE EXCEPTION 'exact call-sheet approval binding evidence mismatch';
  END IF;

  SELECT (state.value ->> 'changesRequestedId')::uuid
  INTO v_changes_requested_id
  FROM proof_state AS state
  WHERE state.key = 'ids';
  IF EXISTS (
    SELECT 1
    FROM co_production.project_call_sheet_approval_bindings AS binding
    WHERE binding.call_sheet_revision_id = v_changes_requested_id
  ) THEN
    RAISE EXCEPTION 'changes-requested revision received approval binding';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('project_call_sheet.generated'),
      ('project_call_sheet.revised'),
      ('project_call_sheet.submitted'),
      ('project_call_sheet.approved'),
      ('project_call_sheet.changes_requested')
    ) AS required_kind(kind)
    WHERE NOT EXISTS (
      SELECT 1
      FROM co_production.project_preproduction_mutation_receipts AS receipt
      WHERE receipt.project_id = v_project_id
        AND receipt.mutation_kind = required_kind.kind
    )
  ) THEN
    RAISE EXCEPTION 'required call-sheet mutation kind missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = v_project_id
      AND receipt.mutation_kind LIKE 'project_call_sheet.%'
      AND (
        receipt.result #> '{source}' ? 'productionScheduleContent'
        OR receipt.result #> '{source}' ? 'scheduleDay'
      )
  ) OR EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_events AS event_record
    WHERE event_record.project_id = v_project_id
      AND event_record.event_type LIKE 'project_call_sheet.%'
      AND (
        event_record.payload #> '{source}' ? 'productionScheduleContent'
        OR event_record.payload #> '{source}' ? 'scheduleDay'
      )
  ) THEN
    RAISE EXCEPTION 'receipt or event persisted full schedule source content';
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

  SELECT (state.value ->> 'finalCallSheetId')::uuid
  INTO v_final_id
  FROM proof_state AS state
  WHERE state.key = 'ids';

  BEGIN
    UPDATE co_production.project_call_sheet_revisions
    SET change_summary = 'Attempted mutation'
    WHERE id = v_final_id;
    RAISE EXCEPTION 'immutable call-sheet revision was updated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM co_production.project_call_sheet_approval_bindings
    WHERE call_sheet_revision_id = v_final_id;
    RAISE EXCEPTION 'immutable call-sheet approval binding was deleted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    TRUNCATE TABLE co_production.project_call_sheet_revisions CASCADE;
    RAISE EXCEPTION 'immutable call-sheet revisions were truncated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$internal_binding_chain_and_immutability$;

SET cco.proof_actor = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET ROLE authenticated;

DO $reviewer_forbidden$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  BEGIN
    PERFORM co_production.get_project_call_sheet(v_project_id);
    RAISE EXCEPTION 'reviewer read call-sheet RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM co_production.project_call_sheet_revisions;
    RAISE EXCEPTION 'reviewer directly read call-sheet revisions';
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
    PERFORM co_production.get_project_call_sheet(
      '11111111-1111-4111-8111-111111111111'::uuid
    );
    RAISE EXCEPTION 'service role executed call-sheet RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM co_production.project_call_sheet_approval_bindings;
    RAISE EXCEPTION 'service role directly read call-sheet bindings';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$service_role_forbidden$;

RESET ROLE;
`;
}

test(
  "PostgreSQL 15 proves call-sheet bootstrap, exact day binding, replay, workflow, stale sources, roles, immutability, and hash evidence",
  {
    skip: process.env.CCO_PROJECT_CALL_SHEET_POSTGRES_PROOF !== "1",
    timeout: 240_000,
  },
  async () => {
    const containerName =
      `cco-call-sheet-proof-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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

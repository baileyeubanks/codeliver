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
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

INSERT INTO co_production.projects (id, team_id, owner_id, name) VALUES (
  '11111111-1111-4111-8111-111111111111',
  NULL,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Governed shot plan project'
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
      'name', 'Governed shot plan project',
      'description', NULL
    )::text
  ),
  'manual',
  'Governed shot plan project',
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

CREATE OR REPLACE FUNCTION public.proof_task_snapshot(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(task)
      ORDER BY task.plan_revision_id, task.position, task.id
    ),
    '[]'::jsonb
  )
  FROM co_production.production_tasks AS task
  WHERE task.project_id = p_project_id
$$;

REVOKE ALL ON FUNCTION public.proof_task_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proof_task_snapshot(uuid) TO authenticated;

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
  SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
$$;

SET ROLE authenticated;

DO $owner_initial_source_and_generation$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_plan jsonb := $json$
    {
      "title":"Initial manual production plan",
      "summary":null,
      "tasks":[{
        "clientTaskId":"manual-plan-task",
        "title":"Preserve initial task",
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
      "sections":[
        {
          "id":"section.open",
          "heading":"Open",
          "summary":"Establish the product without adding production facts.",
          "estimatedDurationSeconds":20,
          "blocks":[
            {
              "id":"block.open.heading",
              "kind":"scene_heading",
              "text":"INT. STUDIO",
              "speaker":null,
              "parenthetical":null
            },
            {
              "id":"block.open.dialogue",
              "kind":"dialogue",
              "text":"This dialogue does not define a shot.",
              "speaker":"Narrator",
              "parenthetical":null
            },
            {
              "id":"block.open.visual",
              "kind":"visual",
              "text":"Product on a table.",
              "speaker":null,
              "parenthetical":null
            },
            {
              "id":"block.open.action",
              "kind":"action",
              "text":"Hands open the box.",
              "speaker":null,
              "parenthetical":null
            },
            {
              "id":"block.open.question",
              "kind":"interview_question",
              "text":"Why does this matter now?",
              "speaker":"Interviewer",
              "parenthetical":"warmly"
            },
            {
              "id":"block.open.broll",
              "kind":"b_roll",
              "text":"Details of the product surface.",
              "speaker":null,
              "parenthetical":null
            },
            {
              "id":"block.open.text",
              "kind":"on_screen_text",
              "text":"Built to last",
              "speaker":null,
              "parenthetical":null
            },
            {
              "id":"block.open.graphic",
              "kind":"graphic",
              "text":"Logo animation.",
              "speaker":null,
              "parenthetical":null
            },
            {
              "id":"block.open.transition",
              "kind":"transition",
              "text":"Cut to black.",
              "speaker":null,
              "parenthetical":null
            }
          ]
        },
        {
          "id":"section.close",
          "heading":"Close",
          "summary":"Capture the closing thought.",
          "estimatedDurationSeconds":10,
          "blocks":[
            {
              "id":"block.close.dialogue",
              "kind":"dialogue",
              "text":"The closing line.",
              "speaker":"Narrator",
              "parenthetical":null
            },
            {
              "id":"block.close.music",
              "kind":"music",
              "text":"Music resolves.",
              "speaker":null,
              "parenthetical":null
            }
          ]
        }
      ]
    }
  $json$::jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_snapshot jsonb;
  v_content jsonb;
  v_script_id uuid;
  v_draft_id uuid;
  v_shot_revision_id uuid;
  v_task_id uuid;
  v_coverage text;
  v_ids text;
  v_reference_ids text;
  v_non_null_audio bigint;
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
    'Approve the exact generated production plan.'
  );

  v_snapshot := co_production.get_project_production_plan(v_project_id);
  v_task_id := (v_snapshot #>> '{tasks,0,id}')::uuid;
  PERFORM co_production.mutate_production_task(
    v_task_id,
    1,
    '35000000-0000-4000-8000-000000000001',
    '{"status":"in_progress"}'::jsonb
  );

  INSERT INTO proof_state(key, value)
  VALUES ('initial_tasks', public.proof_task_snapshot(v_project_id));

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  IF NOT public.proof_exact_json_keys(
    v_snapshot,
    ARRAY[
      'projectId', 'authorityVersion', 'eventHeadHash', 'source',
      'head', 'revisions', 'permissions'
    ]
  )
    OR v_snapshot ->> 'authorityVersion' <> '7'
    OR pg_catalog.jsonb_typeof(v_snapshot -> 'head') <> 'null'
    OR pg_catalog.jsonb_array_length(v_snapshot -> 'revisions') <> 0
    OR v_snapshot #>> '{source,scriptRevisionId}' <> v_script_id::text
    OR v_snapshot #>> '{source,scriptRevisionNumber}' <> '1'
    OR v_snapshot #>> '{source,productionPlanRevisionNumber}' <> '2'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'true'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'false'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'empty shot-plan snapshot mismatch';
  END IF;

  v_result := co_production.generate_project_shot_plan_revision(
    v_project_id,
    7,
    '70000000-0000-4000-8000-000000000001',
    v_script_id,
    (v_snapshot #>> '{source,productionPlanRevisionId}')::uuid
  );
  v_shot_revision_id := (v_result ->> 'shotPlanRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '8'
    OR v_result ->> 'revisionNumber' <> '1'
    OR v_result ->> 'workflowState' <> 'draft'
    OR v_result ->> 'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'generated shot-plan result mismatch';
  END IF;

  v_replay := co_production.generate_project_shot_plan_revision(
    v_project_id,
    7,
    '70000000-0000-4000-8000-000000000001',
    v_script_id,
    (v_snapshot #>> '{source,productionPlanRevisionId}')::uuid
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'shotPlanRevisionId')::uuid <> v_shot_revision_id
  THEN
    RAISE EXCEPTION 'generation exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_shot_plan_revision(
      v_project_id,
      7,
      '70000000-0000-4000-8000-000000000001',
      v_script_id,
      '99999999-9999-4999-8999-999999999999'
    );
    RAISE EXCEPTION 'generation idempotency conflict was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.generate_project_shot_plan_revision(
      v_project_id,
      8,
      '70000000-0000-4000-8000-000000000002',
      v_script_id,
      (v_snapshot #>> '{source,productionPlanRevisionId}')::uuid
    );
    RAISE EXCEPTION 'same source generated twice';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_content := v_snapshot #> '{head,content}';

  IF NOT public.proof_exact_json_keys(
    v_content,
    ARRAY['schemaVersion', 'title', 'scenes']
  )
    OR v_content ->> 'schemaVersion' <> 'cco.shot-plan.v1'
    OR v_content ->> 'title' <> 'Launch Film'
    OR pg_catalog.jsonb_array_length(v_content -> 'scenes') <> 2
    OR NOT public.proof_exact_json_keys(
      v_content #> '{scenes,0}',
      ARRAY[
        'id', 'scriptSectionId', 'order', 'heading', 'objective',
        'estimatedDurationSeconds', 'shots'
      ]
    )
    OR v_content #>> '{scenes,0,id}' <> 'scene-001'
    OR v_content #>> '{scenes,0,scriptSectionId}' <> 'section.open'
    OR v_content #>> '{scenes,0,order}' <> '1'
    OR v_content #>> '{scenes,0,heading}' <> 'Open'
    OR v_content #>> '{scenes,0,objective}' <>
      'Establish the product without adding production facts.'
    OR v_content #>> '{scenes,0,estimatedDurationSeconds}' <> '20'
    OR pg_catalog.jsonb_array_length(v_content #> '{scenes,0,shots}') <> 8
  THEN
    RAISE EXCEPTION 'canonical generated content shape mismatch';
  END IF;

  SELECT
    pg_catalog.string_agg(
      shot.value ->> 'coverageKind',
      ','
      ORDER BY shot.position
    ),
    pg_catalog.string_agg(
      shot.value ->> 'id',
      ','
      ORDER BY shot.position
    ),
    pg_catalog.string_agg(
      shot.value #>> '{scriptBlockIds,0}',
      ','
      ORDER BY shot.position
    ),
    pg_catalog.count(*) FILTER (
      WHERE pg_catalog.jsonb_typeof(shot.value -> 'audioIntent') <> 'null'
    )
  INTO v_coverage, v_ids, v_reference_ids, v_non_null_audio
  FROM pg_catalog.jsonb_array_elements(v_content #> '{scenes,0,shots}')
    WITH ORDINALITY AS shot(value, position);

  IF v_coverage <>
      'establishing,coverage,action,interview,b_roll,graphic,graphic,transition'
    OR v_ids <>
      'shot-001-001,shot-001-002,shot-001-003,shot-001-004,'
      || 'shot-001-005,shot-001-006,shot-001-007,shot-001-008'
    OR v_reference_ids <>
      'block.open.heading,block.open.visual,block.open.action,'
      || 'block.open.question,block.open.broll,block.open.text,'
      || 'block.open.graphic,block.open.transition'
    OR v_non_null_audio <> 1
    OR v_content #>> '{scenes,0,shots,3,audioIntent}' <>
      'Why does this matter now?'
    OR v_content #>> '{scenes,0,shots,0,description}' <> 'INT. STUDIO'
    OR v_content #>> '{scenes,0,shots,0,storyboardPanels,0,visualDescription}'
      <> 'INT. STUDIO'
  THEN
    RAISE EXCEPTION 'eligible block derivation mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_content -> 'scenes') AS scene(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(scene.value -> 'shots')
      AS shot(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      shot.value -> 'storyboardPanels'
    ) AS panel(value)
    WHERE shot.value ->> 'framing' <> 'unspecified'
      OR shot.value ->> 'movement' <> 'unspecified'
      OR pg_catalog.jsonb_typeof(shot.value -> 'subject') <> 'null'
      OR pg_catalog.jsonb_typeof(shot.value -> 'estimatedDurationSeconds')
        <> 'null'
      OR pg_catalog.jsonb_typeof(panel.value -> 'assetId') <> 'null'
      OR pg_catalog.jsonb_typeof(panel.value -> 'versionId') <> 'null'
  ) THEN
    RAISE EXCEPTION 'conservative null defaults were not preserved';
  END IF;

  IF v_content #>> '{scenes,1,id}' <> 'scene-002'
    OR v_content #>> '{scenes,1,shots,0,id}' <> 'shot-002-001'
    OR v_content #>> '{scenes,1,shots,0,coverageKind}' <> 'coverage'
    OR v_content #> '{scenes,1,shots,0,scriptBlockIds}' <> '[]'::jsonb
    OR v_content #>> '{scenes,1,shots,0,description}' <>
      'Visual coverage is not specified. Section summary: Capture the closing thought.'
    OR v_content #>>
      '{scenes,1,shots,0,storyboardPanels,0,visualDescription}' <>
      'Visual coverage is not specified. Section summary: Capture the closing thought.'
  THEN
    RAISE EXCEPTION 'fallback coverage derivation mismatch';
  END IF;

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  IF v_snapshot #>> '{head,id}' <> v_shot_revision_id::text
    OR v_snapshot #>> '{head,workflow,state}' <> 'draft'
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'false'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'false'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'false'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'true'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'generated head snapshot mismatch';
  END IF;

  IF public.proof_task_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value FROM proof_state AS state WHERE state.key = 'initial_tasks'
  ) THEN
    RAISE EXCEPTION 'shot generation or replay mutated production tasks';
  END IF;
END
$owner_initial_source_and_generation$;

RESET ROLE;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
$$;

SET ROLE authenticated;

DO $editor_authoring_and_submission$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_base_id uuid;
  v_revision_id uuid;
  v_content jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_snapshot jsonb;
BEGIN
  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_base_id := (v_snapshot #>> '{head,id}')::uuid;
  v_content := v_snapshot #> '{head,content}';
  IF v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'true'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'editor permissions mismatch';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_shot_plan_revision(
      v_project_id,
      8,
      '70000000-0000-4000-8000-000000000099',
      (v_snapshot #>> '{source,scriptRevisionId}')::uuid,
      (v_snapshot #>> '{source,productionPlanRevisionId}')::uuid
    );
    RAISE EXCEPTION 'editor generated a server revision';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_content := pg_catalog.jsonb_set(
    v_content,
    '{scenes,0,shots,1,purpose}',
    '"Primary product coverage."'::jsonb
  );
  v_result := co_production.append_project_shot_plan_revision(
    v_project_id,
    8,
    '70000000-0000-4000-8000-000000000003',
    v_base_id,
    'Clarify primary coverage',
    v_content
  );
  v_revision_id := (v_result ->> 'shotPlanRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '9'
    OR v_result ->> 'revisionNumber' <> '2'
    OR v_result ->> 'workflowState' <> 'draft'
  THEN
    RAISE EXCEPTION 'editor-authored revision mismatch';
  END IF;

  v_replay := co_production.append_project_shot_plan_revision(
    v_project_id,
    8,
    '70000000-0000-4000-8000-000000000003',
    v_base_id,
    'Clarify primary coverage',
    v_content
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'shotPlanRevisionId')::uuid <> v_revision_id
  THEN
    RAISE EXCEPTION 'editor append exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.append_project_shot_plan_revision(
      v_project_id,
      8,
      '70000000-0000-4000-8000-000000000003',
      v_base_id,
      'Different idempotent payload',
      v_content
    );
    RAISE EXCEPTION 'append idempotency conflict was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.append_project_shot_plan_revision(
      v_project_id,
      8,
      '70000000-0000-4000-8000-000000000004',
      v_revision_id,
      NULL,
      v_content
    );
    RAISE EXCEPTION 'stale authority version was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.append_project_shot_plan_revision(
      v_project_id,
      9,
      '70000000-0000-4000-8000-000000000005',
      v_revision_id,
      NULL,
      pg_catalog.jsonb_set(
        v_content,
        '{scenes,0,shots,0,scriptBlockIds,0}',
        '"block.unknown"'::jsonb
      )
    );
    RAISE EXCEPTION 'unknown script block reference was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  v_result := co_production.submit_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    9,
    '70000000-0000-4000-8000-000000000006',
    'Ready for producer review.'
  );
  IF v_result ->> 'authorityVersion' <> '10'
    OR v_result ->> 'workflowState' <> 'submitted'
  THEN
    RAISE EXCEPTION 'editor submission mismatch';
  END IF;

  v_replay := co_production.submit_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    9,
    '70000000-0000-4000-8000-000000000006',
    'Ready for producer review.'
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'submission exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.decide_project_shot_plan_revision(
      v_project_id,
      v_revision_id,
      10,
      '70000000-0000-4000-8000-000000000007',
      'approved',
      NULL
    );
    RAISE EXCEPTION 'editor made a producer decision';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF public.proof_task_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value FROM proof_state AS state WHERE state.key = 'initial_tasks'
  ) THEN
    RAISE EXCEPTION 'editor shot-plan writes mutated production tasks';
  END IF;
END
$editor_authoring_and_submission$;

RESET ROLE;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
$$;

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
  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_revision_id := (v_snapshot #>> '{head,id}')::uuid;
  IF v_snapshot #>> '{permissions,canDecide}' <> 'true'
    OR v_snapshot #>> '{head,workflow,state}' <> 'submitted'
    OR v_snapshot #>> '{head,workflow,submissionNote}' <>
      'Ready for producer review.'
  THEN
    RAISE EXCEPTION 'submitted decision snapshot mismatch';
  END IF;

  v_result := co_production.decide_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    10,
    '70000000-0000-4000-8000-000000000008',
    'approved',
    NULL
  );
  IF v_result ->> 'authorityVersion' <> '11'
    OR v_result ->> 'workflowState' <> 'approved'
  THEN
    RAISE EXCEPTION 'producer approval result mismatch';
  END IF;

  v_replay := co_production.decide_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    10,
    '70000000-0000-4000-8000-000000000008',
    'approved',
    NULL
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'approval exact replay failed';
  END IF;

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  IF v_snapshot #>> '{head,workflow,state}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'true'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'active approved snapshot mismatch';
  END IF;
END
$producer_initial_approval$;

RESET ROLE;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
$$;

SET ROLE authenticated;

DO $editor_draft_over_active_approval$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_base_id uuid;
  v_content jsonb;
  v_result jsonb;
  v_snapshot jsonb;
  v_active boolean;
BEGIN
  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_base_id := (v_snapshot #>> '{head,id}')::uuid;
  v_content := v_snapshot #> '{head,content}';
  v_content := pg_catalog.jsonb_set(
    v_content,
    '{scenes,0,shots,2,purpose}',
    '"Refine action coverage."'::jsonb
  );
  v_result := co_production.append_project_shot_plan_revision(
    v_project_id,
    11,
    '70000000-0000-4000-8000-000000000009',
    v_base_id,
    'Open a revision while approval remains active',
    v_content
  );
  IF v_result ->> 'authorityVersion' <> '12'
    OR v_result ->> 'revisionNumber' <> '3'
  THEN
    RAISE EXCEPTION 'post-approval draft mismatch';
  END IF;

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  SELECT (item.value #>> '{workflow,isActive}')::boolean
  INTO v_active
  FROM pg_catalog.jsonb_array_elements(v_snapshot -> 'revisions') AS item(value)
  WHERE item.value ->> 'revisionNumber' = '2';
  IF v_snapshot #>> '{head,revisionNumber}' <> '3'
    OR v_snapshot #>> '{head,workflow,state}' <> 'draft'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'false'
    OR v_active IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'highest approved revision did not remain active';
  END IF;

  IF public.proof_task_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value FROM proof_state AS state WHERE state.key = 'initial_tasks'
  ) THEN
    RAISE EXCEPTION 'draft over active approval mutated production tasks';
  END IF;
END
$editor_draft_over_active_approval$;

RESET ROLE;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
$$;

SET ROLE authenticated;

DO $owner_source_change_and_stale_proof$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_script_one_id uuid;
  v_script_two_id uuid;
  v_plan_three_id uuid;
  v_plan_draft_id uuid;
  v_stale_shot_id uuid;
  v_script jsonb;
  v_result jsonb;
  v_snapshot jsonb;
BEGIN
  v_snapshot := co_production.get_project_script(v_project_id);
  v_script_one_id := (v_snapshot #>> '{script,id}')::uuid;
  v_script := v_snapshot #> '{script,content}';

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_stale_shot_id := (v_snapshot #>> '{head,id}')::uuid;

  v_script := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_script,
      '{title}',
      '"Launch Film Revised"'::jsonb
    ),
    '{sections,0,blocks,2,text}',
    '"Product enters the frame."'::jsonb
  );

  v_result := co_production.append_project_script_revision(
    v_project_id,
    12,
    '41000000-0000-4000-8000-000000000001',
    v_script_one_id,
    'Revise the approved source',
    v_script
  );
  v_script_two_id := (v_result ->> 'scriptRevisionId')::uuid;
  PERFORM co_production.submit_project_script_revision(
    v_project_id,
    v_script_two_id,
    13,
    '41000000-0000-4000-8000-000000000002',
    NULL
  );
  PERFORM co_production.decide_project_script_revision(
    v_project_id,
    v_script_two_id,
    14,
    '41000000-0000-4000-8000-000000000003',
    'approved',
    NULL
  );

  v_result := co_production.generate_project_script_plan_draft(
    v_project_id,
    15,
    '51000000-0000-4000-8000-000000000001',
    v_script_two_id
  );
  v_plan_draft_id := (v_result ->> 'draftId')::uuid;
  v_result := co_production.approve_project_script_plan_draft(
    v_project_id,
    v_plan_draft_id,
    2,
    '61000000-0000-4000-8000-000000000001',
    'Approve the revised source plan.'
  );
  v_plan_three_id := (v_result ->> 'planRevisionId')::uuid;

  INSERT INTO proof_state(key, value)
  VALUES ('revised_source_tasks', public.proof_task_snapshot(v_project_id));

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  IF v_snapshot ->> 'authorityVersion' <> '17'
    OR v_snapshot #>> '{source,scriptRevisionId}' <> v_script_two_id::text
    OR v_snapshot #>> '{source,scriptRevisionNumber}' <> '2'
    OR v_snapshot #>> '{source,productionPlanRevisionId}' <>
      v_plan_three_id::text
    OR v_snapshot #>> '{source,productionPlanRevisionNumber}' <> '3'
    OR v_snapshot #>> '{head,revisionNumber}' <> '3'
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'true'
    OR v_snapshot #>> '{permissions,canGenerate}' <> 'true'
    OR v_snapshot #>> '{permissions,canRevise}' <> 'false'
    OR v_snapshot #>> '{permissions,canSubmit}' <> 'false'
    OR v_snapshot #>> '{permissions,canDecide}' <> 'false'
  THEN
    RAISE EXCEPTION 'source change did not stale the old draft';
  END IF;

  BEGIN
    PERFORM co_production.append_project_shot_plan_revision(
      v_project_id,
      17,
      '71000000-0000-4000-8000-000000000001',
      v_stale_shot_id,
      NULL,
      v_snapshot #> '{head,content}'
    );
    RAISE EXCEPTION 'stale shot-plan draft was revised';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.submit_project_shot_plan_revision(
      v_project_id,
      v_stale_shot_id,
      17,
      '71000000-0000-4000-8000-000000000002',
      NULL
    );
    RAISE EXCEPTION 'stale shot-plan draft was submitted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  v_result := co_production.generate_project_shot_plan_revision(
    v_project_id,
    17,
    '71000000-0000-4000-8000-000000000003',
    v_script_two_id,
    v_plan_three_id
  );
  IF v_result ->> 'authorityVersion' <> '18'
    OR v_result ->> 'revisionNumber' <> '4'
    OR v_result ->> 'baseRevisionId' <> v_stale_shot_id::text
  THEN
    RAISE EXCEPTION 'new-source generated revision mismatch';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_shot_plan_revision(
      v_project_id,
      17,
      '71000000-0000-4000-8000-000000000004',
      v_script_two_id,
      v_plan_three_id
    );
    RAISE EXCEPTION 'shot authority conflict was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  IF public.proof_task_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value
    FROM proof_state AS state
    WHERE state.key = 'revised_source_tasks'
  ) THEN
    RAISE EXCEPTION 'new-source shot generation mutated production tasks';
  END IF;
END
$owner_source_change_and_stale_proof$;

DO $owner_changes_requested$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_revision_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_snapshot jsonb;
BEGIN
  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_revision_id := (v_snapshot #>> '{head,id}')::uuid;

  PERFORM co_production.submit_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    18,
    '71000000-0000-4000-8000-000000000005',
    NULL
  );
  v_result := co_production.decide_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    19,
    '71000000-0000-4000-8000-000000000006',
    'changes_requested',
    'Clarify the revised product coverage.'
  );
  IF v_result ->> 'authorityVersion' <> '20'
    OR v_result ->> 'workflowState' <> 'changes_requested'
  THEN
    RAISE EXCEPTION 'changes-requested result mismatch';
  END IF;

  v_replay := co_production.decide_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    19,
    '71000000-0000-4000-8000-000000000006',
    'changes_requested',
    'Clarify the revised product coverage.'
  );
  IF v_replay ->> 'replayed' <> 'true' THEN
    RAISE EXCEPTION 'changes-requested exact replay failed';
  END IF;

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  IF v_snapshot #>> '{head,workflow,state}' <> 'changes_requested' THEN
    RAISE EXCEPTION 'changes-requested snapshot mismatch';
  END IF;
END
$owner_changes_requested$;

RESET ROLE;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
$$;

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
  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_base_id := (v_snapshot #>> '{head,id}')::uuid;
  v_content := v_snapshot #> '{head,content}';

  v_content := pg_catalog.jsonb_set(
    v_content,
    '{scenes,0,shots,1,purpose}',
    '"Resolve revised product coverage."'::jsonb
  );
  v_result := co_production.append_project_shot_plan_revision(
    v_project_id,
    20,
    '71000000-0000-4000-8000-000000000007',
    v_base_id,
    'Resolve producer changes',
    v_content
  );
  v_revision_id := (v_result ->> 'shotPlanRevisionId')::uuid;
  IF v_result ->> 'authorityVersion' <> '21'
    OR v_result ->> 'revisionNumber' <> '5'
  THEN
    RAISE EXCEPTION 'changes resolution revision mismatch';
  END IF;

  PERFORM co_production.submit_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    21,
    '71000000-0000-4000-8000-000000000008',
    'Resolved producer changes.'
  );

  BEGIN
    PERFORM co_production.decide_project_shot_plan_revision(
      v_project_id,
      v_revision_id,
      22,
      '71000000-0000-4000-8000-000000000009',
      'approved',
      NULL
    );
    RAISE EXCEPTION 'editor approved resolved revision';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF public.proof_task_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value
    FROM proof_state AS state
    WHERE state.key = 'revised_source_tasks'
  ) THEN
    RAISE EXCEPTION 'resolved shot-plan workflow mutated production tasks';
  END IF;
END
$editor_resolves_changes$;

RESET ROLE;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
$$;

SET ROLE authenticated;

DO $owner_final_approval_and_snapshot$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_revision_id uuid;
  v_snapshot jsonb;
  v_old_active boolean;
BEGIN
  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  v_revision_id := (v_snapshot #>> '{head,id}')::uuid;

  PERFORM co_production.decide_project_shot_plan_revision(
    v_project_id,
    v_revision_id,
    22,
    '71000000-0000-4000-8000-000000000010',
    'approved',
    NULL
  );

  v_snapshot := co_production.get_project_shot_plan(v_project_id);
  SELECT (item.value #>> '{workflow,isActive}')::boolean
  INTO v_old_active
  FROM pg_catalog.jsonb_array_elements(v_snapshot -> 'revisions') AS item(value)
  WHERE item.value ->> 'revisionNumber' = '2';
  IF v_snapshot ->> 'authorityVersion' <> '23'
    OR v_snapshot #>> '{head,id}' <> v_revision_id::text
    OR v_snapshot #>> '{head,revisionNumber}' <> '5'
    OR v_snapshot #>> '{head,workflow,state}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,isStale}' <> 'false'
    OR v_snapshot #>> '{head,workflow,isActive}' <> 'true'
    OR v_snapshot #>> '{head,workflow,decision}' <> 'approved'
    OR v_snapshot #>> '{head,workflow,submissionNote}' <>
      'Resolved producer changes.'
    OR v_old_active IS DISTINCT FROM false
    OR pg_catalog.jsonb_array_length(v_snapshot -> 'revisions') <> 5
  THEN
    RAISE EXCEPTION 'final strict snapshot or active selection mismatch';
  END IF;

  IF public.proof_task_snapshot(v_project_id) IS DISTINCT FROM (
    SELECT state.value
    FROM proof_state AS state
    WHERE state.key = 'revised_source_tasks'
  ) THEN
    RAISE EXCEPTION 'final shot approval mutated production tasks';
  END IF;
END
$owner_final_approval_and_snapshot$;

RESET ROLE;

DO $internal_chain_and_immutability_proof$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_head_hash text;
  v_revision_id uuid;
BEGIN
  IF (
    SELECT authority.authority_version
    FROM co_production.project_preproduction_authorities AS authority
    WHERE authority.project_id = v_project_id
  ) <> 23 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = v_project_id
  ) <> 23 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.project_preproduction_events AS event_record
    WHERE event_record.project_id = v_project_id
  ) <> 23 THEN
    RAISE EXCEPTION 'shared authority cardinality mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM co_production.project_shot_plan_approval_bindings AS binding
    WHERE binding.project_id = v_project_id
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM co_production.project_shot_plan_approval_bindings AS binding
    JOIN co_production.project_shot_plan_revisions AS revision
      ON revision.id = binding.shot_plan_revision_id
      AND revision.project_id = binding.project_id
    WHERE binding.project_id = v_project_id
      AND revision.revision_number = 4
  ) THEN
    RAISE EXCEPTION 'approval binding cardinality or decision boundary mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM co_production.project_shot_plan_approval_bindings AS binding
    JOIN co_production.project_shot_plan_revisions AS revision
      ON revision.id = binding.shot_plan_revision_id
      AND revision.project_id = binding.project_id
    JOIN co_production.project_preproduction_mutation_receipts AS receipt
      ON receipt.id = binding.decision_receipt_id
      AND receipt.project_id = binding.project_id
      AND receipt.shot_plan_revision_id = binding.shot_plan_revision_id
    WHERE binding.project_id = v_project_id
      AND revision.revision_number IN (2, 5)
      AND binding.shot_plan_content_hash = revision.content_hash
      AND binding.source_project_script_revision_id =
        revision.source_project_script_revision_id
      AND binding.source_project_script_content_hash =
        revision.source_project_script_content_hash
      AND binding.source_production_plan_revision_id =
        revision.source_production_plan_revision_id
      AND binding.source_production_plan_content_hash =
        revision.source_production_plan_content_hash
      AND binding.source_production_plan_script_binding_id =
        revision.source_production_plan_script_binding_id
      AND receipt.mutation_kind = 'project_shot_plan.approved'
      AND binding.approved_by = receipt.actor_id
      AND binding.approved_at = receipt.created_at
  ) <> 2 THEN
    RAISE EXCEPTION 'exact approval binding evidence mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('production_plan.initialized'),
      ('production_plan.replanned'),
      ('production_task.mutated'),
      ('project_script.created'),
      ('project_script.submitted'),
      ('project_script.approved'),
      ('production_plan_draft.generated'),
      ('project_shot_plan.generated'),
      ('project_shot_plan.revised'),
      ('project_shot_plan.submitted'),
      ('project_shot_plan.approved'),
      ('project_shot_plan.changes_requested')
    ) AS required_kind(kind)
    WHERE NOT EXISTS (
      SELECT 1
      FROM co_production.project_preproduction_mutation_receipts AS receipt
      WHERE receipt.project_id = v_project_id
        AND receipt.mutation_kind = required_kind.kind
    )
  ) THEN
    RAISE EXCEPTION 'required receipt kind missing';
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
    WHERE chain.previous_event_hash IS DISTINCT FROM chain.expected_previous_hash
  ) THEN
    RAISE EXCEPTION 'shared preproduction event chain is discontinuous';
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
    RAISE EXCEPTION 'authority event head hash mismatch';
  END IF;

  SELECT revision.id
  INTO v_revision_id
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.project_id = v_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  BEGIN
    UPDATE co_production.project_shot_plan_revisions
    SET change_summary = 'Attempted mutation'
    WHERE id = v_revision_id;
    RAISE EXCEPTION 'immutable shot revision was updated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM co_production.project_shot_plan_approval_bindings
    WHERE shot_plan_revision_id = v_revision_id;
    RAISE EXCEPTION 'immutable approval binding was deleted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    TRUNCATE TABLE co_production.project_shot_plan_revisions CASCADE;
    RAISE EXCEPTION 'immutable shot revisions were truncated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$internal_chain_and_immutability_proof$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
$$;

SET ROLE authenticated;

DO $reviewer_forbidden_proof$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  BEGIN
    PERFORM co_production.get_project_shot_plan(v_project_id);
    RAISE EXCEPTION 'reviewer read shot-plan authority';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM co_production.project_shot_plan_revisions;
    RAISE EXCEPTION 'reviewer directly read shot-plan revisions';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$reviewer_forbidden_proof$;

RESET ROLE;

SET ROLE service_role;

DO $service_role_forbidden_proof$
BEGIN
  BEGIN
    PERFORM co_production.get_project_shot_plan(
      '11111111-1111-4111-8111-111111111111'::uuid
    );
    RAISE EXCEPTION 'service role executed shot-plan RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM co_production.project_shot_plan_approval_bindings;
    RAISE EXCEPTION 'service role directly read approval bindings';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$service_role_forbidden_proof$;

RESET ROLE;
`;
}

test(
  "PostgreSQL 15 proves exact derivation, replay, conflicts, stale sources, roles, immutability, approval binding, and no task mutation",
  {
    skip: process.env.CCO_PROJECT_SHOT_PLAN_POSTGRES_PROOF !== "1",
    timeout: 240_000,
  },
  async () => {
    const containerName =
      `cco-shot-plan-proof-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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

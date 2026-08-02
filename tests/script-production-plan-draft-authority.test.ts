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
] as const;

function runDocker(args: string[], input?: string): string {
  const result = spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    maxBuffer: 32 * 1024 * 1024,
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

INSERT INTO co_production.projects (id, team_id, owner_id, name) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Governed script plan project'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Manual plan project'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Two hundred section project'
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
  seed.project_id,
  NULL,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  seed.request_id,
  co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'operation', 'create_manual_project_with_origin',
      'actorId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
      'projectId', seed.project_id,
      'teamId', NULL,
      'requestId', seed.request_id,
      'name', seed.project_name,
      'description', NULL
    )::text
  ),
  'manual',
  seed.project_name,
  NULL,
  statement_timestamp()
FROM (VALUES
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '10000000-0000-4000-8000-000000000001'::uuid,
    'Governed script plan project'::text
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Manual plan project'::text
  ),
  (
    '44444444-4444-4444-8444-444444444444'::uuid,
    '10000000-0000-4000-8000-000000000004'::uuid,
    'Two hundred section project'::text
  )
) AS seed(project_id, request_id, project_name);

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

CREATE FUNCTION public.proof_exact_json_keys(
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

SET ROLE authenticated;

DO $governed_script_plan_behavior$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_manual_project_id constant uuid :=
    '22222222-2222-4222-8222-222222222222'::uuid;
  v_manual_plan jsonb := $json$
    {
      "title":"Existing manual production plan",
      "summary":null,
      "tasks":[{
        "clientTaskId":"manual-plan-task",
        "title":"Preserve current plan",
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
  v_script_one jsonb := $json$
    {
      "schemaVersion":"cco.script-content.v1",
      "title":"Launch Film",
      "logline":null,
      "format":"commercial",
      "estimatedRuntimeSeconds":30,
      "sections":[
        {
          "id":"section.open",
          "heading":"Open",
          "summary":"Establish the product.",
          "estimatedDurationSeconds":10,
          "blocks":[{
            "id":"block.open.visual",
            "kind":"visual",
            "text":"Product on white.",
            "speaker":null,
            "parenthetical":null
          }]
        },
        {
          "id":"section.interview",
          "heading":"Founder interview",
          "summary":null,
          "estimatedDurationSeconds":15,
          "blocks":[{
            "id":"block.interview.question",
            "kind":"interview_question",
            "text":"Why does this matter now?",
            "speaker":"Host",
            "parenthetical":"warmly"
          }]
        },
        {
          "id":"section.close",
          "heading":"Close",
          "summary":null,
          "estimatedDurationSeconds":null,
          "blocks":[{
            "id":"block.close.music",
            "kind":"music",
            "text":"Resolve on the brand theme.",
            "speaker":null,
            "parenthetical":null
          }]
        }
      ]
    }
  $json$::jsonb;
  v_script_two jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_proposal jsonb;
  v_plan_snapshot jsonb;
  v_forged_plan jsonb;
  v_script_one_id uuid;
  v_script_two_id uuid;
  v_draft_one_id uuid;
  v_draft_two_id uuid;
  v_plan_two_id uuid;
  v_binding_count bigint;
BEGIN
  v_script_two := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_script_one,
      '{title}',
      '"Launch Film v2"'::jsonb
    ),
    '{sections,0,blocks,0,text}',
    '"Product enters frame."'::jsonb
  );

  v_result := co_production.initialize_production_plan(
    v_project_id,
    0,
    '30000000-0000-4000-8000-000000000001',
    v_manual_plan
  );
  IF v_result ->> 'revisionNumber' <> '1'
    OR v_result ->> 'authorityVersion' <> '1'
  THEN
    RAISE EXCEPTION 'initial manual plan result mismatch';
  END IF;

  PERFORM co_production.initialize_production_plan(
    v_manual_project_id,
    0,
    '30000000-0000-4000-8000-000000000002',
    v_manual_plan
  );
  v_proposal := co_production.get_project_script_plan_proposal(
    v_manual_project_id
  );
  IF NOT public.proof_exact_json_keys(
    v_proposal,
    ARRAY[
      'projectId', 'authorityVersion', 'currentPlanRevision', 'available',
      'scriptRevisionId', 'scriptRevisionNumber', 'scriptTitle', 'preview',
      'draft', 'alreadyMaterialized', 'materializedPlanRevision',
      'permissions'
    ]
  )
    OR v_proposal ->> 'available' <> 'false'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'scriptRevisionId') <> 'null'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'scriptRevisionNumber') <> 'null'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'scriptTitle') <> 'null'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'preview') <> 'null'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'draft') <> 'null'
    OR v_proposal ->> 'alreadyMaterialized' <> 'false'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'materializedPlanRevision')
      <> 'null'
    OR v_proposal #>> '{permissions,canGenerate}' <> 'false'
    OR v_proposal #>> '{permissions,canApprove}' <> 'false'
  THEN
    RAISE EXCEPTION 'unavailable proposal shape or null state mismatch';
  END IF;

  PERFORM co_production.initialize_production_plan(
    v_manual_project_id,
    1,
    '30000000-0000-4000-8000-000000000003',
    v_manual_plan
  );

  v_result := co_production.append_project_script_revision(
    v_project_id,
    1,
    '40000000-0000-4000-8000-000000000001',
    NULL,
    NULL,
    v_script_one
  );
  v_script_one_id := (v_result ->> 'scriptRevisionId')::uuid;
  PERFORM co_production.submit_project_script_revision(
    v_project_id,
    v_script_one_id,
    2,
    '40000000-0000-4000-8000-000000000002',
    NULL
  );
  PERFORM co_production.decide_project_script_revision(
    v_project_id,
    v_script_one_id,
    3,
    '40000000-0000-4000-8000-000000000003',
    'approved',
    NULL
  );

  BEGIN
    PERFORM co_production.initialize_production_plan(
      v_project_id,
      1,
      '30000000-0000-4000-8000-000000000004',
      v_manual_plan
    );
    RAISE EXCEPTION 'manual plan was accepted after script approval';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  v_result := co_production.append_project_script_revision(
    v_project_id,
    4,
    '40000000-0000-4000-8000-000000000004',
    v_script_one_id,
    'Draft a revised opening',
    v_script_two
  );
  v_script_two_id := (v_result ->> 'scriptRevisionId')::uuid;

  BEGIN
    PERFORM co_production.generate_project_script_plan_draft(
      v_project_id,
      5,
      '50000000-0000-4000-8000-000000000099',
      v_script_two_id
    );
    RAISE EXCEPTION 'unapproved script head generated a plan draft';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    NULL;
  END;

  v_result := co_production.generate_project_script_plan_draft(
    p_project_id => v_project_id,
    p_expected_authority_version => 5,
    p_expected_script_revision_id => v_script_one_id,
    p_request_id => '50000000-0000-4000-8000-000000000001'
  );
  IF NOT public.proof_exact_json_keys(
    v_result,
    ARRAY[
      'draftId', 'projectId', 'scriptRevisionId', 'scriptRevisionNumber',
      'authorityVersion', 'requestId', 'replayed'
    ]
  )
    OR v_result ->> 'authorityVersion' <> '6'
    OR v_result ->> 'scriptRevisionNumber' <> '1'
    OR v_result ->> 'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'generate receipt shape mismatch';
  END IF;
  v_draft_one_id := (v_result ->> 'draftId')::uuid;

  v_proposal := co_production.get_project_script_plan_proposal(v_project_id);
  IF NOT public.proof_exact_json_keys(
    v_proposal,
    ARRAY[
      'projectId', 'authorityVersion', 'currentPlanRevision', 'available',
      'scriptRevisionId', 'scriptRevisionNumber', 'scriptTitle', 'preview',
      'draft', 'alreadyMaterialized', 'materializedPlanRevision',
      'permissions'
    ]
  )
    OR NOT public.proof_exact_json_keys(
      v_proposal -> 'draft',
      ARRAY['id', 'derivationVersion', 'content', 'contentHash', 'generatedAt']
    )
    OR v_proposal ->> 'available' <> 'true'
    OR v_proposal ->> 'currentPlanRevision' <> '1'
    OR (v_proposal ->> 'scriptRevisionId')::uuid <> v_script_one_id
    OR v_proposal ->> 'scriptRevisionNumber' <> '1'
    OR v_proposal ->> 'scriptTitle' <> 'Launch Film'
    OR v_proposal -> 'preview' IS DISTINCT FROM
      v_proposal #> '{draft,content}'
    OR v_proposal #>> '{draft,derivationVersion}' <>
      'cco.script-plan.v1'
    OR v_proposal #>> '{preview,title}' <> 'Launch Film production plan'
    OR v_proposal #>> '{preview,summary}' <>
      'Production plan derived from the approved commercial script.'
    OR v_proposal #>> '{preview,tasks,0,clientTaskId}' <>
      'script-section-001'
    OR v_proposal #>> '{preview,tasks,0,title}' <> 'Plan coverage: Open'
    OR v_proposal #>> '{preview,tasks,0,description}' <> E'Purpose: Establish the product.\nTarget runtime: 10 seconds\nScript cues:\nVisual: Product on white.'
    OR v_proposal #>> '{preview,tasks,1,title}' <>
      'Plan interview: Founder interview'
    OR v_proposal #>> '{preview,tasks,1,description}' <> E'Target runtime: 15 seconds\nScript cues:\nInterview question (Host) [warmly]: Why does this matter now?'
    OR v_proposal #>> '{preview,tasks,2,title}' <> 'Plan section: Close'
    OR v_proposal #>> '{preview,tasks,2,sourceRef}' <>
      'script-section:section.close'
    OR v_proposal ->> 'alreadyMaterialized' <> 'false'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'materializedPlanRevision')
      <> 'null'
    OR v_proposal #>> '{permissions,canGenerate}' <> 'false'
    OR v_proposal #>> '{permissions,canApprove}' <> 'true'
  THEN
    RAISE EXCEPTION 'available proposal or deterministic preview mismatch';
  END IF;

  v_plan_snapshot := co_production.get_project_production_plan(v_project_id);
  IF v_plan_snapshot #>> '{plan,revisionNumber}' <> '1'
    OR v_plan_snapshot #>> '{plan,title}' <>
      'Existing manual production plan'
    OR pg_catalog.jsonb_array_length(v_plan_snapshot -> 'tasks') <> 1
  THEN
    RAISE EXCEPTION 'draft generation changed the active production plan';
  END IF;

  v_replay := co_production.generate_project_script_plan_draft(
    v_project_id,
    5,
    '50000000-0000-4000-8000-000000000001',
    v_script_one_id
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'draftId')::uuid <> v_draft_one_id
    OR v_replay ->> 'authorityVersion' <> '6'
  THEN
    RAISE EXCEPTION 'stale-version exact generation replay failed';
  END IF;

  BEGIN
    PERFORM co_production.generate_project_script_plan_draft(
      v_project_id,
      6,
      '50000000-0000-4000-8000-000000000002',
      v_script_one_id
    );
    RAISE EXCEPTION 'duplicate source generated a second draft';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  BEGIN
    PERFORM co_production.generate_project_script_plan_draft(
      v_project_id,
      6,
      '50000000-0000-4000-8000-000000000001',
      v_script_one_id
    );
    RAISE EXCEPTION 'conflicting replay was accepted';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  v_forged_plan := pg_catalog.jsonb_set(
    v_proposal -> 'preview',
    '{tasks,0,title}',
    '"Forged coverage"'::jsonb
  ) || pg_catalog.jsonb_build_object(
    'sourceDraftId', v_draft_one_id,
    'approvalNote', 'Producer approved the generated plan.'
  );
  BEGIN
    PERFORM co_production.initialize_production_plan(
      v_project_id,
      1,
      '30000000-0000-4000-8000-000000000005',
      v_forged_plan
    );
    RAISE EXCEPTION 'changed draft content was materialized';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  v_result := co_production.approve_project_script_plan_draft(
    p_project_id => v_project_id,
    p_draft_id => v_draft_one_id,
    p_expected_plan_revision => 1,
    p_request_id => '60000000-0000-4000-8000-000000000001',
    p_note => 'Producer approved the generated plan.'
  );
  IF NOT public.proof_exact_json_keys(
    v_result,
    ARRAY[
      'planRevisionId', 'projectId', 'revisionNumber', 'authorityVersion',
      'taskCount', 'requestId', 'replayed', 'draftId',
      'scriptRevisionId', 'scriptRevisionNumber'
    ]
  )
    OR v_result ->> 'revisionNumber' <> '2'
    OR v_result ->> 'authorityVersion' <> '7'
    OR v_result ->> 'taskCount' <> '3'
    OR (v_result ->> 'draftId')::uuid <> v_draft_one_id
    OR (v_result ->> 'scriptRevisionId')::uuid <> v_script_one_id
    OR v_result ->> 'scriptRevisionNumber' <> '1'
    OR v_result ->> 'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'approval receipt shape mismatch';
  END IF;
  v_plan_two_id := (v_result ->> 'planRevisionId')::uuid;

  v_plan_snapshot := co_production.get_project_production_plan(v_project_id);
  IF v_plan_snapshot #>> '{plan,revisionNumber}' <> '2'
    OR v_plan_snapshot #>> '{plan,title}' <> 'Launch Film production plan'
    OR pg_catalog.jsonb_array_length(v_plan_snapshot -> 'tasks') <> 3
  THEN
    RAISE EXCEPTION 'approval did not atomically activate derived tasks';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_binding_count
  FROM co_production.production_plan_script_bindings AS binding
  WHERE binding.project_id = v_project_id
    AND binding.plan_revision_id = v_plan_two_id
    AND binding.plan_draft_id = v_draft_one_id
    AND binding.source_project_script_revision_id = v_script_one_id
    AND binding.approval_note = 'Producer approved the generated plan.';
  IF v_binding_count <> 1 THEN
    RAISE EXCEPTION 'exact plan/draft/script binding was not inserted';
  END IF;

  v_replay := co_production.approve_project_script_plan_draft(
    v_project_id,
    v_draft_one_id,
    1,
    '60000000-0000-4000-8000-000000000001',
    'Producer approved the generated plan.'
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'planRevisionId')::uuid <> v_plan_two_id
    OR (v_replay ->> 'draftId')::uuid <> v_draft_one_id
  THEN
    RAISE EXCEPTION 'approval exact replay failed';
  END IF;

  BEGIN
    PERFORM co_production.approve_project_script_plan_draft(
      v_project_id,
      v_draft_one_id,
      2,
      '60000000-0000-4000-8000-000000000002',
      'Attempt duplicate materialization.'
    );
    RAISE EXCEPTION 'draft was materialized twice';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    NULL;
  END;

  PERFORM co_production.submit_project_script_revision(
    v_project_id,
    v_script_two_id,
    7,
    '40000000-0000-4000-8000-000000000005',
    NULL
  );
  PERFORM co_production.decide_project_script_revision(
    v_project_id,
    v_script_two_id,
    8,
    '40000000-0000-4000-8000-000000000006',
    'approved',
    NULL
  );

  v_replay := co_production.generate_project_script_plan_draft(
    v_project_id,
    5,
    '50000000-0000-4000-8000-000000000001',
    v_script_one_id
  );
  IF v_replay ->> 'replayed' <> 'true'
    OR (v_replay ->> 'draftId')::uuid <> v_draft_one_id
  THEN
    RAISE EXCEPTION 'generation replay lost to newer approved source';
  END IF;

  BEGIN
    PERFORM co_production.approve_project_script_plan_draft(
      v_project_id,
      v_draft_one_id,
      2,
      '60000000-0000-4000-8000-000000000003',
      'Attempt stale source materialization.'
    );
    RAISE EXCEPTION 'old approved source created a new plan';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  v_proposal := co_production.get_project_script_plan_proposal(v_project_id);
  IF (v_proposal ->> 'scriptRevisionId')::uuid <> v_script_two_id
    OR v_proposal ->> 'scriptRevisionNumber' <> '2'
    OR v_proposal #>> '{preview,title}' <> 'Launch Film v2 production plan'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'draft') <> 'null'
    OR v_proposal ->> 'alreadyMaterialized' <> 'false'
    OR pg_catalog.jsonb_typeof(v_proposal -> 'materializedPlanRevision')
      <> 'null'
    OR v_proposal #>> '{permissions,canGenerate}' <> 'true'
    OR v_proposal #>> '{permissions,canApprove}' <> 'false'
  THEN
    RAISE EXCEPTION 'new approved source proposal state mismatch';
  END IF;

  v_result := co_production.generate_project_script_plan_draft(
    v_project_id,
    9,
    '50000000-0000-4000-8000-000000000003',
    v_script_two_id
  );
  v_draft_two_id := (v_result ->> 'draftId')::uuid;
  v_plan_snapshot := co_production.get_project_production_plan(v_project_id);
  IF v_plan_snapshot #>> '{plan,revisionNumber}' <> '2' THEN
    RAISE EXCEPTION 'second generated draft changed active plan';
  END IF;

  BEGIN
    PERFORM co_production.initialize_production_plan(
      v_manual_project_id,
      2,
      '30000000-0000-4000-8000-000000000006',
      (v_proposal -> 'preview') || pg_catalog.jsonb_build_object(
        'sourceDraftId', v_draft_two_id,
        'approvalNote', 'Cross-project forgery.'
      )
    );
    RAISE EXCEPTION 'foreign-project draft was materialized';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;
END
$governed_script_plan_behavior$;

DO $two_hundred_section_behavior$
DECLARE
  v_project_id constant uuid :=
    '44444444-4444-4444-8444-444444444444'::uuid;
  v_script jsonb;
  v_result jsonb;
  v_proposal jsonb;
  v_snapshot jsonb;
  v_script_id uuid;
  v_draft_id uuid;
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion', 'cco.script-content.v1',
    'title', 'Full Section Plan',
    'logline', 'Every approved section becomes one production task.',
    'format', 'outline',
    'estimatedRuntimeSeconds', 200,
    'sections', pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', 'section-' || seed.section_number,
        'heading', 'Section ' || seed.section_number,
        'summary', NULL,
        'estimatedDurationSeconds', 1,
        'blocks', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'block-' || seed.section_number,
            'kind', 'action',
            'text', 'Capture section ' || seed.section_number || '.',
            'speaker', NULL,
            'parenthetical', NULL
          )
        )
      )
      ORDER BY seed.section_number
    )
  )
  INTO v_script
  FROM pg_catalog.generate_series(1, 200) AS seed(section_number);

  v_result := co_production.append_project_script_revision(
    v_project_id,
    0,
    '70000000-0000-4000-8000-000000000001',
    NULL,
    NULL,
    v_script
  );
  v_script_id := (v_result ->> 'scriptRevisionId')::uuid;
  PERFORM co_production.submit_project_script_revision(
    v_project_id,
    v_script_id,
    1,
    '70000000-0000-4000-8000-000000000002',
    NULL
  );
  PERFORM co_production.decide_project_script_revision(
    v_project_id,
    v_script_id,
    2,
    '70000000-0000-4000-8000-000000000003',
    'approved',
    NULL
  );
  v_result := co_production.generate_project_script_plan_draft(
    v_project_id,
    3,
    '70000000-0000-4000-8000-000000000004',
    v_script_id
  );
  v_draft_id := (v_result ->> 'draftId')::uuid;
  v_proposal := co_production.get_project_script_plan_proposal(v_project_id);
  IF pg_catalog.jsonb_array_length(v_proposal #> '{draft,content,tasks}') <> 200
    OR v_proposal #>> '{draft,content,tasks,199,clientTaskId}' <>
      'script-section-200'
  THEN
    RAISE EXCEPTION 'two hundred section derivation mismatch';
  END IF;

  v_result := co_production.approve_project_script_plan_draft(
    v_project_id,
    v_draft_id,
    0,
    '70000000-0000-4000-8000-000000000005',
    'Approved all 200 section tasks.'
  );
  v_snapshot := co_production.get_project_production_plan(v_project_id);
  IF v_result ->> 'taskCount' <> '200'
    OR pg_catalog.jsonb_array_length(v_snapshot -> 'tasks') <> 200
  THEN
    RAISE EXCEPTION 'two hundred section approval mismatch';
  END IF;
END
$two_hundred_section_behavior$;

RESET ROLE;

DO $internal_exactness_proof$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_manual_project_id constant uuid :=
    '22222222-2222-4222-8222-222222222222'::uuid;
  v_actor_id constant uuid :=
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  v_draft co_production.production_plan_script_drafts%ROWTYPE;
  v_source_script_id uuid;
  v_head_hash text;
BEGIN
  SELECT revision.id
  INTO v_source_script_id
  FROM co_production.project_script_revisions AS revision
  WHERE revision.project_id = v_project_id
    AND revision.revision_number = 1;

  SELECT draft.*
  INTO v_draft
  FROM co_production.production_plan_script_drafts AS draft
  WHERE draft.project_id = v_project_id
    AND draft.source_project_script_revision_id = v_source_script_id;

  IF v_draft.source_project_script_revision_id <> v_source_script_id
    OR v_draft.derivation_version <> 'cco.script-plan.v1'
    OR v_draft.content_hash <>
      co_production_private.preproject_sha256(v_draft.content::text)
    OR NOT EXISTS (
      SELECT 1
      FROM co_production.project_preproduction_mutation_receipts AS receipt
      WHERE receipt.project_id = v_project_id
        AND receipt.plan_draft_id = v_draft.id
        AND receipt.mutation_kind = 'production_plan_draft.generated'
        AND receipt.request_id = v_draft.request_id
        AND receipt.request_hash = v_draft.request_hash
    )
  THEN
    RAISE EXCEPTION 'draft identity, hash, or generation receipt mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_mutation_receipts AS draft_receipt
    JOIN co_production.project_preproduction_mutation_receipts AS head_receipt
      ON head_receipt.project_id = draft_receipt.project_id
    WHERE draft_receipt.plan_draft_id = v_draft.id
      AND draft_receipt.authority_version = 6
      AND head_receipt.script_revision_id = (
        SELECT revision.id
        FROM co_production.project_script_revisions AS revision
        WHERE revision.project_id = v_project_id
          AND revision.revision_number = 2
      )
      AND head_receipt.mutation_kind = 'project_script.revised'
      AND head_receipt.authority_version = 5
  ) THEN
    RAISE EXCEPTION 'older approved source was not selected behind draft head';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM co_production.production_plan_script_bindings AS binding
    JOIN co_production.project_preproduction_mutation_receipts AS receipt
      ON receipt.id = binding.plan_mutation_receipt_id
      AND receipt.project_id = binding.project_id
      AND receipt.plan_revision_id = binding.plan_revision_id
    JOIN co_production.production_plan_revisions AS plan
      ON plan.id = binding.plan_revision_id
      AND plan.project_id = binding.project_id
    WHERE binding.project_id = v_project_id
      AND binding.plan_draft_id = v_draft.id
      AND receipt.mutation_kind = 'production_plan.replanned'
      AND receipt.plan_draft_id IS NULL
      AND plan.content ->> 'sourceDraftId' = v_draft.id::text
      AND plan.content ->> 'approvalNote' = binding.approval_note
  ) THEN
    RAISE EXCEPTION 'plan activation receipt and binding are not exact';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM co_production.production_plan_script_bindings AS binding
    WHERE binding.project_id = v_project_id
  ) <> 1 OR (
    SELECT pg_catalog.count(*)
    FROM co_production.production_plan_revisions AS plan
    WHERE plan.project_id = v_project_id
  ) <> 2 THEN
    RAISE EXCEPTION 'failed/replayed approvals changed durable cardinality';
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
    RAISE EXCEPTION 'project preproduction event chain is discontinuous';
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
    RAISE EXCEPTION 'authority head does not match final event hash';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_events AS event_record
    WHERE event_record.project_id = v_project_id
      AND event_record.event_type LIKE 'production_plan_draft.%'
      AND event_record.event_type <> 'production_plan_draft.generated'
  ) THEN
    RAISE EXCEPTION 'draft approval emitted a second draft event kind';
  END IF;

  BEGIN
    INSERT INTO co_production.production_plan_script_drafts (
      project_id,
      team_id,
      source_project_script_revision_id,
      source_project_script_content_hash,
      derivation_version,
      content,
      content_hash,
      request_id,
      request_hash,
      generated_by,
      generated_at
    ) VALUES (
      v_project_id,
      '99999999-9999-4999-8999-999999999999'::uuid,
      v_draft.source_project_script_revision_id,
      v_draft.source_project_script_content_hash,
      v_draft.derivation_version,
      v_draft.content,
      v_draft.content_hash,
      '80000000-0000-4000-8000-000000000001',
      'sha256:' || pg_catalog.repeat('0', 64),
      v_actor_id,
      statement_timestamp()
    );
    RAISE EXCEPTION 'forged draft team was accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    INSERT INTO co_production.production_plan_script_drafts (
      project_id,
      team_id,
      source_project_script_revision_id,
      source_project_script_content_hash,
      derivation_version,
      content,
      content_hash,
      request_id,
      request_hash,
      generated_by,
      generated_at
    ) VALUES (
      v_manual_project_id,
      NULL,
      v_draft.source_project_script_revision_id,
      v_draft.source_project_script_content_hash,
      v_draft.derivation_version,
      v_draft.content,
      v_draft.content_hash,
      '80000000-0000-4000-8000-000000000002',
      'sha256:' || pg_catalog.repeat('0', 64),
      v_actor_id,
      statement_timestamp()
    );
    RAISE EXCEPTION 'forged draft project/script source was accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  BEGIN
    UPDATE co_production.production_plan_script_drafts
    SET content_hash = 'sha256:' || pg_catalog.repeat('0', 64)
    WHERE id = v_draft.id;
    RAISE EXCEPTION 'immutable draft was updated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM co_production.production_plan_script_bindings
    WHERE plan_draft_id = v_draft.id;
    RAISE EXCEPTION 'immutable binding was deleted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    TRUNCATE TABLE co_production.production_plan_script_drafts CASCADE;
    RAISE EXCEPTION 'immutable drafts were truncated';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$internal_exactness_proof$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
$$;

SET ROLE authenticated;
DO $editor_role_proof$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
  v_draft_id uuid;
BEGIN
  SELECT draft.id
  INTO v_draft_id
  FROM co_production.production_plan_script_drafts AS draft
  WHERE draft.project_id = v_project_id
  ORDER BY draft.generated_at
  LIMIT 1;
  IF NOT FOUND OR (
    SELECT pg_catalog.count(*)
    FROM co_production.production_plan_script_bindings AS binding
    WHERE binding.project_id = v_project_id
  ) <> 1 THEN
    RAISE EXCEPTION 'contributor RLS did not expose draft/binding evidence';
  END IF;

  BEGIN
    PERFORM co_production.get_project_script_plan_proposal(v_project_id);
    RAISE EXCEPTION 'editor executed producer proposal RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM co_production.generate_project_script_plan_draft(
      v_project_id,
      10,
      '90000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001'::uuid
    );
    RAISE EXCEPTION 'editor generated production plan draft';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM co_production.approve_project_script_plan_draft(
      v_project_id,
      v_draft_id,
      2,
      '90000000-0000-4000-8000-000000000002',
      'Editor attempted approval.'
    );
    RAISE EXCEPTION 'editor approved production plan draft';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$editor_role_proof$;
RESET ROLE;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
$$;

SET ROLE authenticated;
DO $reviewer_role_proof$
DECLARE
  v_project_id constant uuid :=
    '11111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM co_production.production_plan_script_drafts AS draft
    WHERE draft.project_id = v_project_id
  ) OR EXISTS (
    SELECT 1
    FROM co_production.production_plan_script_bindings AS binding
    WHERE binding.project_id = v_project_id
  ) THEN
    RAISE EXCEPTION 'reviewer RLS exposed governed draft evidence';
  END IF;
  BEGIN
    PERFORM co_production.get_project_script_plan_proposal(v_project_id);
    RAISE EXCEPTION 'reviewer executed producer proposal RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$reviewer_role_proof$;
RESET ROLE;

SET ROLE service_role;
DO $service_role_proof$
BEGIN
  BEGIN
    PERFORM 1 FROM co_production.production_plan_script_drafts;
    RAISE EXCEPTION 'service role read definer-owned draft table';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM co_production.get_project_script_plan_proposal(
      '11111111-1111-4111-8111-111111111111'::uuid
    );
    RAISE EXCEPTION 'service role executed proposal RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$service_role_proof$;
RESET ROLE;
`;
}

test(
  "PostgreSQL 15 proves governed draft generation and atomic producer approval",
  {
    skip: process.env.CCO_SCRIPT_PRODUCTION_PLAN_POSTGRES_PROOF !== "1",
    timeout: 180_000,
  },
  async () => {
    const containerName =
      `cco-script-plan-proof-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
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
          readiness.status === 0
          && logOutput.includes(
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

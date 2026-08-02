-- Govern approved-script production-plan drafts and their explicit producer
-- approval. Generating a draft never activates a plan; only the existing plan
-- initializer can do that, after this authority verifies the exact draft.

BEGIN;

ALTER TABLE co_production.project_script_revisions
  ADD CONSTRAINT project_script_revisions_id_project_content_hash_key
  UNIQUE (id, project_id, content_hash);

CREATE OR REPLACE FUNCTION
  co_production_private.derive_project_script_plan_content(
    p_script_content jsonb
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_section jsonb;
  v_block jsonb;
  v_section_number integer := 0;
  v_prefix text;
  v_description text;
  v_block_label text;
  v_speaker text;
  v_parenthetical text;
  v_tasks jsonb := '[]'::jsonb;
BEGIN
  FOR v_section IN
    SELECT section.value
    FROM pg_catalog.jsonb_array_elements(p_script_content -> 'sections')
      WITH ORDINALITY AS section(value, position)
    ORDER BY section.position
  LOOP
    v_section_number := v_section_number + 1;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_section -> 'blocks')
        AS block(value)
      WHERE block.value ->> 'kind' = 'interview_question'
    ) THEN
      v_prefix := 'Plan interview: ';
    ELSIF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_section -> 'blocks')
        AS block(value)
      WHERE block.value ->> 'kind' IN ('visual', 'action', 'b_roll')
    ) THEN
      v_prefix := 'Plan coverage: ';
    ELSE
      v_prefix := 'Plan section: ';
    END IF;

    v_description := '';
    IF pg_catalog.jsonb_typeof(v_section -> 'summary') = 'string' THEN
      v_description := 'Purpose: ' || (v_section ->> 'summary') || E'\n';
    END IF;
    IF pg_catalog.jsonb_typeof(v_section -> 'estimatedDurationSeconds')
      = 'number'
    THEN
      v_description := v_description || 'Target runtime: '
        || (v_section ->> 'estimatedDurationSeconds') || E' seconds\n';
    END IF;
    v_description := v_description || 'Script cues:';

    FOR v_block IN
      SELECT block.value
      FROM pg_catalog.jsonb_array_elements(v_section -> 'blocks')
        WITH ORDINALITY AS block(value, position)
      ORDER BY block.position
    LOOP
      v_block_label := CASE v_block ->> 'kind'
        WHEN 'scene_heading' THEN 'Scene'
        WHEN 'visual' THEN 'Visual'
        WHEN 'action' THEN 'Action'
        WHEN 'dialogue' THEN 'Dialogue'
        WHEN 'voice_over' THEN 'Voice over'
        WHEN 'interview_question' THEN 'Interview question'
        WHEN 'b_roll' THEN 'B-roll'
        WHEN 'on_screen_text' THEN 'On-screen text'
        WHEN 'graphic' THEN 'Graphic'
        WHEN 'music' THEN 'Music'
        WHEN 'sfx' THEN 'Sound effect'
        WHEN 'transition' THEN 'Transition'
        WHEN 'note' THEN 'Production note'
      END;
      v_speaker := CASE
        WHEN pg_catalog.jsonb_typeof(v_block -> 'speaker') = 'string'
          THEN ' (' || (v_block ->> 'speaker') || ')'
        ELSE ''
      END;
      v_parenthetical := CASE
        WHEN pg_catalog.jsonb_typeof(v_block -> 'parenthetical') = 'string'
          THEN ' [' || (v_block ->> 'parenthetical') || ']'
        ELSE ''
      END;
      v_description := v_description || E'\n' || v_block_label
        || v_speaker || v_parenthetical || ': ' || (v_block ->> 'text');
    END LOOP;

    v_tasks := v_tasks || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'clientTaskId', 'script-section-'
          || pg_catalog.lpad(v_section_number::text, 3, '0'),
        'title', pg_catalog.btrim(
          pg_catalog.left(v_prefix || (v_section ->> 'heading'), 240)
        ),
        'description', pg_catalog.btrim(
          pg_catalog.left(v_description, 4000)
        ),
        'priority', 'normal',
        'assigneeId', NULL,
        'dueDate', NULL,
        'sourceKind', 'plan',
        'sourceRef', 'script-section:' || (v_section ->> 'id'),
        'dependsOnClientTaskIds', '[]'::jsonb
      )
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'title', pg_catalog.btrim(
      pg_catalog.left((p_script_content ->> 'title') || ' production plan', 240)
    ),
    'summary', CASE
      WHEN pg_catalog.jsonb_typeof(p_script_content -> 'logline') = 'string'
        THEN pg_catalog.btrim(
          pg_catalog.left(p_script_content ->> 'logline', 4000)
        )
      ELSE 'Production plan derived from the approved '
        || pg_catalog.replace(p_script_content ->> 'format', '_', ' ')
        || ' script.'
    END,
    'tasks', v_tasks
  );
END
$$;

CREATE TABLE co_production.production_plan_script_drafts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  source_project_script_revision_id uuid NOT NULL,
  source_project_script_content_hash text NOT NULL CHECK (
    source_project_script_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  derivation_version text NOT NULL CHECK (
    derivation_version = 'cco.script-plan.v1'
  ),
  content jsonb NOT NULL CHECK (
    co_production_private.preproject_exact_json_keys(
      content,
      ARRAY['title', 'summary', 'tasks']
    )
    AND co_production_private.production_plan_payload_is_valid(
      content || pg_catalog.jsonb_build_object(
        'sourceDraftId', NULL,
        'approvalNote', NULL
      )
    )
  ),
  content_hash text NOT NULL CHECK (
    content_hash ~ '^sha256:[0-9a-f]{64}$'
    AND content_hash = co_production_private.preproject_sha256(content::text)
  ),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  generated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL,
  CONSTRAINT production_plan_script_drafts_project_source_version_key
    UNIQUE (
      project_id,
      source_project_script_revision_id,
      derivation_version
    ),
  CONSTRAINT production_plan_script_drafts_project_request_key
    UNIQUE (project_id, request_id),
  CONSTRAINT production_plan_script_drafts_id_project_key
    UNIQUE (id, project_id),
  CONSTRAINT production_plan_script_drafts_exact_source_key
    UNIQUE (
      id,
      project_id,
      source_project_script_revision_id,
      source_project_script_content_hash
    ),
  CONSTRAINT production_plan_script_drafts_project_authority_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproduction_authorities(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT production_plan_script_drafts_source_script_fk
    FOREIGN KEY (
      source_project_script_revision_id,
      project_id,
      source_project_script_content_hash
    )
    REFERENCES co_production.project_script_revisions(
      id,
      project_id,
      content_hash
    )
    ON DELETE RESTRICT
);

ALTER TABLE co_production.project_preproduction_mutation_receipts
  ADD COLUMN plan_draft_id uuid,
  DROP CONSTRAINT project_preproduction_receipts_mutation_kind_check,
  DROP CONSTRAINT project_preproduction_receipts_target_shape,
  ADD CONSTRAINT project_preproduction_receipts_mutation_kind_check CHECK (
    mutation_kind IN (
      'production_plan.initialized',
      'production_plan.replanned',
      'production_task.mutated',
      'project_script.created',
      'project_script.revised',
      'project_script.submitted',
      'project_script.approved',
      'project_script.changes_requested',
      'production_plan_draft.generated'
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_plan_draft_fk
    FOREIGN KEY (plan_draft_id, project_id)
    REFERENCES co_production.production_plan_script_drafts(id, project_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT project_preproduction_receipts_target_shape CHECK (
    (
      mutation_kind IN ('production_plan.initialized', 'production_plan.replanned')
      AND plan_revision_id IS NOT NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
    )
    OR (
      mutation_kind = 'production_task.mutated'
      AND plan_revision_id IS NULL
      AND task_id IS NOT NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
    )
    OR (
      mutation_kind IN (
        'project_script.created',
        'project_script.revised',
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NOT NULL
      AND plan_draft_id IS NULL
    )
    OR (
      mutation_kind = 'production_plan_draft.generated'
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_exact_plan_key
    UNIQUE (id, project_id, plan_revision_id);

ALTER TABLE co_production.project_preproduction_events
  DROP CONSTRAINT project_preproduction_events_event_type_check,
  DROP CONSTRAINT project_preproduction_events_entity_kind_check,
  ADD CONSTRAINT project_preproduction_events_event_type_check CHECK (
    event_type IN (
      'production_plan.initialized',
      'production_plan.replanned',
      'production_task.mutated',
      'project_script.created',
      'project_script.revised',
      'project_script.submitted',
      'project_script.approved',
      'project_script.changes_requested',
      'production_plan_draft.generated'
    )
  ),
  ADD CONSTRAINT project_preproduction_events_entity_kind_check CHECK (
    entity_kind IN (
      'production_plan_revision',
      'production_task',
      'project_script_revision',
      'production_plan_script_draft'
    )
  );

CREATE TABLE co_production.production_plan_script_bindings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  plan_revision_id uuid NOT NULL,
  project_id uuid NOT NULL,
  team_id uuid,
  plan_draft_id uuid NOT NULL,
  source_project_script_revision_id uuid NOT NULL,
  source_project_script_content_hash text NOT NULL CHECK (
    source_project_script_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  plan_mutation_receipt_id uuid NOT NULL,
  approval_note text NOT NULL CHECK (
    co_production_private.preproject_safe_text(approval_note, 1, 4000)
    AND approval_note = pg_catalog.btrim(approval_note)
    AND approval_note !~ E'\r'
  ),
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  CONSTRAINT production_plan_script_bindings_plan_key
    UNIQUE (plan_revision_id),
  CONSTRAINT production_plan_script_bindings_draft_key
    UNIQUE (plan_draft_id),
  CONSTRAINT production_plan_script_bindings_receipt_key
    UNIQUE (plan_mutation_receipt_id),
  CONSTRAINT production_plan_script_bindings_plan_fk
    FOREIGN KEY (plan_revision_id, project_id)
    REFERENCES co_production.production_plan_revisions(id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT production_plan_script_bindings_draft_fk
    FOREIGN KEY (
      plan_draft_id,
      project_id,
      source_project_script_revision_id,
      source_project_script_content_hash
    )
    REFERENCES co_production.production_plan_script_drafts(
      id,
      project_id,
      source_project_script_revision_id,
      source_project_script_content_hash
    )
    ON DELETE RESTRICT,
  CONSTRAINT production_plan_script_bindings_script_fk
    FOREIGN KEY (
      source_project_script_revision_id,
      project_id,
      source_project_script_content_hash
    )
    REFERENCES co_production.project_script_revisions(
      id,
      project_id,
      content_hash
    )
    ON DELETE RESTRICT,
  CONSTRAINT production_plan_script_bindings_receipt_fk
    FOREIGN KEY (
      plan_mutation_receipt_id,
      project_id,
      plan_revision_id
    )
    REFERENCES co_production.project_preproduction_mutation_receipts(
      id,
      project_id,
      plan_revision_id
    )
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION
  co_production_private.verify_project_preproduction_receipt_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_expected_hash text;
BEGIN
  IF NEW.mutation_kind IN (
    'production_plan.initialized',
    'production_plan.replanned',
    'production_task.mutated'
  ) THEN
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
  ELSIF NEW.mutation_kind IN (
    'project_script.created',
    'project_script.revised',
    'project_script.submitted',
    'project_script.approved',
    'project_script.changes_requested'
  ) THEN
    v_expected_hash := co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'id', NEW.id,
        'projectId', NEW.project_id,
        'teamId', NEW.team_id,
        'mutationKind', NEW.mutation_kind,
        'planRevisionId', NEW.plan_revision_id,
        'taskId', NEW.task_id,
        'scriptRevisionId', NEW.script_revision_id,
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
  ELSIF NEW.mutation_kind = 'production_plan_draft.generated' THEN
    v_expected_hash := co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'id', NEW.id,
        'projectId', NEW.project_id,
        'teamId', NEW.team_id,
        'mutationKind', NEW.mutation_kind,
        'planRevisionId', NEW.plan_revision_id,
        'taskId', NEW.task_id,
        'scriptRevisionId', NEW.script_revision_id,
        'planDraftId', NEW.plan_draft_id,
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
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_receipt_kind';
  END IF;

  IF NEW.receipt_hash IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_receipt_hash';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.guard_project_preproduction_event_insert()
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
    OR (
      v_receipt.mutation_kind IN (
        'project_script.created',
        'project_script.revised',
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
      AND (
        NEW.entity_kind IS DISTINCT FROM 'project_script_revision'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.script_revision_id
      )
    )
    OR (
      v_receipt.mutation_kind = 'production_plan_draft.generated'
      AND (
        NEW.entity_kind IS DISTINCT FROM 'production_plan_script_draft'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.plan_draft_id
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

CREATE OR REPLACE FUNCTION
  co_production_private.guard_production_plan_script_draft_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority_team_id uuid;
  v_script co_production.project_script_revisions%ROWTYPE;
  v_latest_approved_script_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || NEW.project_id::text,
      0
    )
  );

  SELECT authority.team_id
  INTO v_authority_team_id
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = NEW.project_id;

  IF NOT FOUND OR v_authority_team_id IS DISTINCT FROM NEW.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_draft_tenant_mismatch';
  END IF;

  SELECT revision.*
  INTO v_script
  FROM co_production.project_script_revisions AS revision
  WHERE revision.id = NEW.source_project_script_revision_id
    AND revision.project_id = NEW.project_id
    AND revision.team_id IS NOT DISTINCT FROM NEW.team_id
    AND revision.content_hash = NEW.source_project_script_content_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'production_plan_draft_script_mismatch';
  END IF;

  SELECT revision.id
  INTO v_latest_approved_script_id
  FROM co_production.project_script_revisions AS revision
  JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.script_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS latest_workflow
    ON latest_workflow.mutation_kind = 'project_script.approved'
  WHERE revision.project_id = NEW.project_id
    AND revision.team_id IS NOT DISTINCT FROM NEW.team_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_latest_approved_script_id IS DISTINCT FROM v_script.id
    OR NEW.derivation_version IS DISTINCT FROM 'cco.script-plan.v1'
    OR NEW.content IS DISTINCT FROM
      co_production_private.derive_project_script_plan_content(v_script.content)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'production_plan_draft_derivation_mismatch';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.enforce_production_plan_script_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority_team_id uuid;
  v_latest_script_id uuid;
  v_latest_script_content_hash text;
  v_plan_draft_id uuid;
  v_approval_note text;
  v_draft co_production.production_plan_script_drafts%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || NEW.project_id::text,
      0
    )
  );

  SELECT authority.team_id
  INTO v_authority_team_id
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = NEW.project_id;

  IF NOT FOUND OR v_authority_team_id IS DISTINCT FROM NEW.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_draft_tenant_mismatch';
  END IF;

  IF NOT NEW.content ? 'sourceDraftId'
    OR NOT NEW.content ? 'approvalNote'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'production_plan_draft_metadata_mismatch';
  END IF;

  SELECT revision.id, revision.content_hash
  INTO v_latest_script_id, v_latest_script_content_hash
  FROM co_production.project_script_revisions AS revision
  JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.script_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS latest_workflow
    ON latest_workflow.mutation_kind = 'project_script.approved'
  WHERE revision.project_id = NEW.project_id
    AND revision.team_id IS NOT DISTINCT FROM NEW.team_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF pg_catalog.jsonb_typeof(NEW.content -> 'sourceDraftId')
        IS DISTINCT FROM 'null'
      OR pg_catalog.jsonb_typeof(NEW.content -> 'approvalNote')
        IS DISTINCT FROM 'null'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'production_plan_draft_metadata_mismatch';
    END IF;
    RETURN NEW;
  END IF;

  IF pg_catalog.jsonb_typeof(NEW.content -> 'sourceDraftId')
      IS DISTINCT FROM 'string'
    OR (NEW.content ->> 'sourceDraftId') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(NEW.content -> 'approvalNote')
      IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'production_plan_draft_metadata_mismatch';
  END IF;

  v_plan_draft_id := (NEW.content ->> 'sourceDraftId')::uuid;
  v_approval_note := NEW.content ->> 'approvalNote';
  IF NOT co_production_private.preproject_safe_text(v_approval_note, 1, 4000)
    OR v_approval_note IS DISTINCT FROM pg_catalog.btrim(v_approval_note)
    OR v_approval_note ~ E'\r'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'production_plan_draft_approval_note_invalid';
  END IF;

  SELECT draft.*
  INTO v_draft
  FROM co_production.production_plan_script_drafts AS draft
  WHERE draft.id = v_plan_draft_id
    AND draft.project_id = NEW.project_id
    AND draft.team_id IS NOT DISTINCT FROM NEW.team_id
    AND draft.source_project_script_revision_id = v_latest_script_id
    AND draft.source_project_script_content_hash =
      v_latest_script_content_hash
    AND draft.derivation_version = 'cco.script-plan.v1';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'production_plan_draft_stale_source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.production_plan_script_bindings AS binding
    WHERE binding.plan_draft_id = v_draft.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'production_plan_draft_already_materialized';
  END IF;

  IF v_draft.content IS DISTINCT FROM
    NEW.content - ARRAY['sourceDraftId', 'approvalNote']::text[]
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'production_plan_draft_content_mismatch';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.bind_production_plan_script_draft_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan co_production.production_plan_revisions%ROWTYPE;
  v_draft co_production.production_plan_script_drafts%ROWTYPE;
  v_plan_draft_id uuid;
  v_approval_note text;
BEGIN
  IF NEW.mutation_kind NOT IN (
    'production_plan.initialized', 'production_plan.replanned'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT plan.*
  INTO v_plan
  FROM co_production.production_plan_revisions AS plan
  WHERE plan.id = NEW.plan_revision_id
    AND plan.project_id = NEW.project_id
    AND plan.team_id IS NOT DISTINCT FROM NEW.team_id;

  IF NOT FOUND
    OR v_plan.created_by IS DISTINCT FROM NEW.actor_id
    OR v_plan.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_draft_receipt_mismatch';
  END IF;

  IF pg_catalog.jsonb_typeof(v_plan.content -> 'sourceDraftId') = 'null' THEN
    RETURN NEW;
  END IF;

  v_plan_draft_id := (v_plan.content ->> 'sourceDraftId')::uuid;
  v_approval_note := v_plan.content ->> 'approvalNote';

  SELECT draft.*
  INTO v_draft
  FROM co_production.production_plan_script_drafts AS draft
  WHERE draft.id = v_plan_draft_id
    AND draft.project_id = v_plan.project_id
    AND draft.team_id IS NOT DISTINCT FROM v_plan.team_id;

  IF NOT FOUND
    OR v_draft.content IS DISTINCT FROM
      v_plan.content - ARRAY['sourceDraftId', 'approvalNote']::text[]
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_draft_receipt_mismatch';
  END IF;

  INSERT INTO co_production.production_plan_script_bindings (
    plan_revision_id,
    project_id,
    team_id,
    plan_draft_id,
    source_project_script_revision_id,
    source_project_script_content_hash,
    plan_mutation_receipt_id,
    approval_note,
    approved_by,
    approved_at
  )
  VALUES (
    v_plan.id,
    v_plan.project_id,
    v_plan.team_id,
    v_draft.id,
    v_draft.source_project_script_revision_id,
    v_draft.source_project_script_content_hash,
    NEW.id,
    v_approval_note,
    NEW.actor_id,
    NEW.created_at
  );

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.can_read_production_plan_script_evidence(
    p_project_id uuid
  )
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT co_production_private.project_preproduction_role(p_project_id) IN (
    'owner', 'admin', 'producer', 'editor', 'member'
  )
$$;

ALTER TABLE co_production.production_plan_script_drafts
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_plan_script_drafts
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_plan_script_bindings
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.production_plan_script_bindings
  FORCE ROW LEVEL SECURITY;

CREATE POLICY production_plan_script_drafts_contributor_select
  ON co_production.production_plan_script_drafts
  FOR SELECT TO authenticated
  USING (
    co_production_private.can_read_production_plan_script_evidence(project_id)
  );

CREATE POLICY production_plan_script_bindings_contributor_select
  ON co_production.production_plan_script_bindings
  FOR SELECT TO authenticated
  USING (
    co_production_private.can_read_production_plan_script_evidence(project_id)
  );

ALTER POLICY project_preproduction_mutation_receipts_select
  ON co_production.project_preproduction_mutation_receipts
  USING (
    (
      script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor', 'member'
    )
  );

ALTER POLICY project_preproduction_events_select
  ON co_production.project_preproduction_events
  USING (
    (
      entity_kind NOT IN (
        'project_script_revision', 'production_plan_script_draft'
      )
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor', 'member'
    )
  );

CREATE TRIGGER production_plan_script_drafts_derivation_guard
BEFORE INSERT ON co_production.production_plan_script_drafts
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_production_plan_script_draft_insert();

CREATE TRIGGER production_plan_script_drafts_immutable
BEFORE UPDATE OR DELETE ON co_production.production_plan_script_drafts
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER production_plan_script_drafts_no_truncate
BEFORE TRUNCATE ON co_production.production_plan_script_drafts
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER production_plan_script_bindings_immutable
BEFORE UPDATE OR DELETE ON co_production.production_plan_script_bindings
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER production_plan_script_bindings_no_truncate
BEFORE TRUNCATE ON co_production.production_plan_script_bindings
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER production_plan_revisions_enforce_script_draft
BEFORE INSERT ON co_production.production_plan_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.enforce_production_plan_script_draft();

CREATE TRIGGER project_preproduction_receipts_bind_script_draft
AFTER INSERT ON co_production.project_preproduction_mutation_receipts
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.bind_production_plan_script_draft_receipt();

CREATE OR REPLACE FUNCTION co_production.get_project_script_plan_proposal(
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
  v_current_plan_revision integer := 0;
  v_script co_production.project_script_revisions%ROWTYPE;
  v_draft co_production.production_plan_script_drafts%ROWTYPE;
  v_binding co_production.production_plan_script_bindings%ROWTYPE;
  v_materialized_plan_revision integer;
BEGIN
  IF v_actor_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'production_plan_draft_forbidden';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'production_plan_draft_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'production_plan_draft_forbidden';
  END IF;

  SELECT authority.authority_version
  INTO v_authority_version
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id;
  IF NOT FOUND THEN
    v_authority_version := 0;
  END IF;

  SELECT COALESCE(pg_catalog.max(plan.revision_number), 0)
  INTO v_current_plan_revision
  FROM co_production.production_plan_revisions AS plan
  WHERE plan.project_id = p_project_id;

  SELECT revision.*
  INTO v_script
  FROM co_production.project_script_revisions AS revision
  JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.script_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS latest_workflow
    ON latest_workflow.mutation_kind = 'project_script.approved'
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT draft.*
    INTO v_draft
    FROM co_production.production_plan_script_drafts AS draft
    WHERE draft.project_id = p_project_id
      AND draft.source_project_script_revision_id = v_script.id
      AND draft.source_project_script_content_hash = v_script.content_hash
      AND draft.derivation_version = 'cco.script-plan.v1';

    IF FOUND THEN
      SELECT binding.*
      INTO v_binding
      FROM co_production.production_plan_script_bindings AS binding
      WHERE binding.plan_draft_id = v_draft.id;

      IF FOUND THEN
        SELECT plan.revision_number
        INTO v_materialized_plan_revision
        FROM co_production.production_plan_revisions AS plan
        WHERE plan.id = v_binding.plan_revision_id
          AND plan.project_id = p_project_id;
      END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'projectId', p_project_id,
    'authorityVersion', v_authority_version,
    'currentPlanRevision', v_current_plan_revision,
    'available', v_script.id IS NOT NULL,
    'scriptRevisionId', v_script.id,
    'scriptRevisionNumber', v_script.revision_number,
    'scriptTitle', v_script.content ->> 'title',
    'preview', CASE
      WHEN v_script.id IS NULL THEN NULL
      ELSE co_production_private.derive_project_script_plan_content(
        v_script.content
      )
    END,
    'draft', CASE
      WHEN v_draft.id IS NULL THEN NULL
      ELSE pg_catalog.jsonb_build_object(
        'id', v_draft.id,
        'derivationVersion', v_draft.derivation_version,
        'content', v_draft.content,
        'contentHash', v_draft.content_hash,
        'generatedAt', v_draft.generated_at
      )
    END,
    'alreadyMaterialized', v_binding.id IS NOT NULL,
    'materializedPlanRevision', v_materialized_plan_revision,
    'permissions', pg_catalog.jsonb_build_object(
      'canGenerate',
        v_role IN ('owner', 'admin', 'producer')
        AND v_script.id IS NOT NULL
        AND v_draft.id IS NULL,
      'canApprove',
        v_role IN ('owner', 'admin', 'producer')
        AND v_draft.id IS NOT NULL
        AND v_binding.id IS NULL
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.generate_project_script_plan_draft(
  p_project_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_expected_script_revision_id uuid
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
  v_script co_production.project_script_revisions%ROWTYPE;
  v_plan_draft_id uuid := pg_catalog.gen_random_uuid();
  v_derivation_version constant text := 'cco.script-plan.v1';
  v_content jsonb;
  v_content_hash text;
  v_request_payload jsonb;
  v_request_hash text;
  v_new_authority_version bigint;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := statement_timestamp();
  v_result jsonb;
  v_receipt_hash text;
  v_event_payload jsonb;
  v_event_hash text;
BEGIN
  IF v_actor_id IS NULL
    OR p_project_id IS NULL
    OR p_expected_authority_version IS NULL
    OR p_expected_authority_version NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR p_expected_script_revision_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_production_plan_draft_request';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'production_plan_draft_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'production_plan_draft_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'production_plan_draft_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'generate_project_script_plan_draft',
    'projectId', p_project_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'expectedScriptRevisionId', p_expected_script_revision_id,
    'derivationVersion', v_derivation_version
  );
  v_request_hash := co_production_private.preproject_sha256(
    v_request_payload::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || p_project_id::text,
      0
    )
  );

  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_authority.team_id IS DISTINCT FROM v_project.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_draft_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
        'production_plan_draft.generated'
      OR v_existing.expected_entity_version
        IS DISTINCT FROM p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
      OR v_existing.plan_draft_id IS NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'production_plan_draft_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version
    IS DISTINCT FROM p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'production_plan_draft_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_script
  FROM co_production.project_script_revisions AS revision
  JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.script_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS latest_workflow
    ON latest_workflow.mutation_kind = 'project_script.approved'
  WHERE revision.project_id = p_project_id
    AND revision.team_id IS NOT DISTINCT FROM v_project.team_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_script.id IS DISTINCT FROM p_expected_script_revision_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'production_plan_draft_version_conflict';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.production_plan_script_drafts AS draft
    WHERE draft.project_id = p_project_id
      AND draft.source_project_script_revision_id = v_script.id
      AND draft.derivation_version = v_derivation_version
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'production_plan_draft_version_conflict';
  END IF;

  v_content :=
    co_production_private.derive_project_script_plan_content(v_script.content);
  IF pg_catalog.jsonb_array_length(v_content -> 'tasks') > 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'production_plan_draft_task_limit_exceeded';
  END IF;
  v_content_hash := co_production_private.preproject_sha256(v_content::text);
  v_new_authority_version := v_authority.authority_version + 1;

  INSERT INTO co_production.production_plan_script_drafts (
    id,
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
  )
  VALUES (
    v_plan_draft_id,
    p_project_id,
    v_project.team_id,
    v_script.id,
    v_script.content_hash,
    v_derivation_version,
    v_content,
    v_content_hash,
    p_request_id,
    v_request_hash,
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'draftId', v_plan_draft_id,
    'projectId', p_project_id,
    'scriptRevisionId', v_script.id,
    'scriptRevisionNumber', v_script.revision_number,
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'production_plan_draft.generated',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', v_plan_draft_id,
      'expectedEntityVersion', p_expected_authority_version,
      'resultingEntityVersion', v_new_authority_version,
      'authorityVersion', v_new_authority_version,
      'requestId', p_request_id,
      'requestHash', v_request_hash,
      'result', v_result,
      'actorId', v_actor_id,
      'createdAt', v_now
    )::text
  );

  v_event_payload := pg_catalog.jsonb_build_object(
    'planDraftId', v_plan_draft_id,
    'scriptRevisionId', v_script.id,
    'scriptRevisionNumber', v_script.revision_number,
    'scriptContentHash', v_script.content_hash,
    'derivationVersion', v_derivation_version,
    'contentHash', v_content_hash
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'production_plan_draft.generated',
      'entityKind', 'production_plan_script_draft',
      'entityId', v_plan_draft_id,
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
    script_revision_id,
    plan_draft_id,
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
    'production_plan_draft.generated',
    NULL,
    NULL,
    NULL,
    v_plan_draft_id,
    p_expected_authority_version,
    v_new_authority_version,
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
    'production_plan_draft.generated',
    'production_plan_script_draft',
    v_plan_draft_id,
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
      MESSAGE = 'production_plan_draft_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.approve_project_script_plan_draft(
  p_project_id uuid,
  p_draft_id uuid,
  p_expected_plan_revision integer,
  p_request_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_draft co_production.production_plan_script_drafts%ROWTYPE;
  v_script_revision_number bigint;
  v_plan jsonb;
  v_result jsonb;
  v_binding co_production.production_plan_script_bindings%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR p_project_id IS NULL
    OR p_draft_id IS NULL
    OR p_expected_plan_revision IS NULL
    OR p_expected_plan_revision NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR p_note IS NULL
    OR NOT co_production_private.preproject_safe_text(
      p_note, 1, 4000
    )
    OR p_note IS DISTINCT FROM pg_catalog.btrim(p_note)
    OR p_note ~ E'\r'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_production_plan_draft_approval';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'production_plan_draft_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'production_plan_draft_forbidden';
  END IF;

  SELECT draft.*
  INTO v_draft
  FROM co_production.production_plan_script_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'production_plan_draft_not_found';
  END IF;

  SELECT script.revision_number
  INTO v_script_revision_number
  FROM co_production.project_script_revisions AS script
  WHERE script.id = v_draft.source_project_script_revision_id
    AND script.project_id = v_draft.project_id
    AND script.content_hash = v_draft.source_project_script_content_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_draft_script_mismatch';
  END IF;

  v_plan := v_draft.content || pg_catalog.jsonb_build_object(
    'sourceDraftId', v_draft.id,
    'approvalNote', p_note
  );

  v_result := co_production.initialize_production_plan(
    p_project_id,
    p_expected_plan_revision,
    p_request_id,
    v_plan
  );

  SELECT binding.*
  INTO v_binding
  FROM co_production.production_plan_script_bindings AS binding
  WHERE binding.plan_revision_id = (v_result ->> 'planRevisionId')::uuid
    AND binding.project_id = p_project_id
    AND binding.plan_draft_id = v_draft.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_draft_binding_missing';
  END IF;

  RETURN v_result || pg_catalog.jsonb_build_object(
    'draftId', v_draft.id,
    'scriptRevisionId', v_draft.source_project_script_revision_id,
    'scriptRevisionNumber', v_script_revision_number
  );
END
$$;

REVOKE ALL ON TABLE co_production.production_plan_script_drafts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.production_plan_script_bindings
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE co_production.production_plan_script_drafts
  TO authenticated;
GRANT SELECT ON TABLE co_production.production_plan_script_bindings
  TO authenticated;

REVOKE ALL ON FUNCTION
  co_production_private.derive_project_script_plan_content(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.verify_project_preproduction_receipt_hash()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_preproduction_event_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_production_plan_script_draft_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.enforce_production_plan_script_draft()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.bind_production_plan_script_draft_receipt()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.can_read_production_plan_script_evidence(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  co_production_private.can_read_production_plan_script_evidence(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION co_production.get_project_script_plan_proposal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.generate_project_script_plan_draft(uuid, bigint, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.approve_project_script_plan_draft(uuid, uuid, integer, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.get_project_script_plan_proposal(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.generate_project_script_plan_draft(uuid, bigint, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.approve_project_script_plan_draft(uuid, uuid, integer, uuid, text)
  TO authenticated;

CREATE INDEX production_plan_script_drafts_project_generated_idx
  ON co_production.production_plan_script_drafts(
    project_id,
    generated_at DESC
  );
CREATE INDEX production_plan_script_bindings_project_approved_idx
  ON co_production.production_plan_script_bindings(
    project_id,
    approved_at DESC
  );
CREATE INDEX project_preproduction_receipts_plan_draft_history_idx
  ON co_production.project_preproduction_mutation_receipts(
    plan_draft_id,
    authority_version DESC
  )
  WHERE plan_draft_id IS NOT NULL;

COMMIT;

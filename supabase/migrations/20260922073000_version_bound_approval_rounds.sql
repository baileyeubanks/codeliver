BEGIN;

-- Existing asset-wide rows remain nullable historical evidence. They are never
-- treated as certifying a version and are intentionally not backfilled.
ALTER TABLE co_production.approval_workflows
  ADD COLUMN IF NOT EXISTS version_id uuid;
ALTER TABLE co_production.approvals
  ADD COLUMN IF NOT EXISTS version_id uuid;
ALTER TABLE co_production.approval_history
  ADD COLUMN IF NOT EXISTS asset_id uuid,
  ADD COLUMN IF NOT EXISTS version_id uuid;
ALTER TABLE co_production.review_invites
  ADD COLUMN IF NOT EXISTS approval_workflow_id uuid,
  ADD COLUMN IF NOT EXISTS approval_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS approval_workflows_exact_identity_idx
  ON co_production.approval_workflows (id, asset_id, version_id);
CREATE UNIQUE INDEX IF NOT EXISTS approvals_exact_identity_idx
  ON co_production.approvals (id, asset_id, version_id);
CREATE UNIQUE INDEX IF NOT EXISTS approval_workflows_one_round_per_version_idx
  ON co_production.approval_workflows (asset_id, version_id)
  WHERE version_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_order_per_round_idx
  ON co_production.approvals (workflow_id, step_order)
  WHERE version_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_recipient_per_round_idx
  ON co_production.approvals (workflow_id, lower(assignee_email))
  WHERE version_id IS NOT NULL AND assignee_email IS NOT NULL;

ALTER TABLE co_production.approval_workflows
  ADD CONSTRAINT approval_workflows_version_asset_fkey
  FOREIGN KEY (version_id, asset_id)
  REFERENCES co_production.versions (id, asset_id)
  ON DELETE RESTRICT;

DROP FUNCTION co_production.authorize_review_admission(uuid, text);
CREATE FUNCTION co_production.authorize_review_admission(
  p_admission_id uuid,
  p_token_hash text
)
RETURNS TABLE (
  admission_id uuid, invite_id uuid, asset_id uuid, version_id uuid,
  admission_expires_at timestamptz, approval_workflow_id uuid, approval_id uuid,
  reviewer_name text, reviewer_email text, permissions text,
  invite_expires_at timestamptz, watermark_enabled boolean, watermark_text text,
  download_enabled boolean, view_count integer, max_views integer,
  asset_title text, asset_file_type text, asset_status text,
  project_id uuid, project_name text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT admission.id, invite.id, admission.asset_id, admission.version_id,
    admission.expires_at, invite.approval_workflow_id, invite.approval_id,
    invite.reviewer_name, invite.reviewer_email, invite.permissions,
    invite.expires_at, invite.watermark_enabled, invite.watermark_text,
    invite.download_enabled, invite.view_count, invite.max_views,
    asset.title, asset.file_type, asset.status, project.id, project.name
  FROM co_production.review_view_admissions AS admission
  JOIN co_production.review_invites AS invite
    ON invite.id = admission.invite_id
   AND invite.asset_id = admission.asset_id
   AND invite.version_id = admission.version_id
   AND invite.token_hash = admission.token_hash
  JOIN co_production.assets AS asset ON asset.id = admission.asset_id
  JOIN co_production.versions AS version
    ON version.id = admission.version_id AND version.asset_id = admission.asset_id
  JOIN co_production.projects AS project ON project.id = asset.project_id
  WHERE admission.id = p_admission_id AND admission.token_hash = p_token_hash
    AND admission.expires_at > now() AND invite.token_hash = p_token_hash
    AND invite.active = true AND (invite.expires_at IS NULL OR invite.expires_at > now())
    AND invite.password_hash IS NULL AND invite.watermark_enabled = false
    AND (invite.max_views IS NULL OR invite.view_count <= invite.max_views)
    AND asset.deleted_at IS NULL
$$;
ALTER TABLE co_production.approvals
  ADD CONSTRAINT approvals_version_asset_fkey
  FOREIGN KEY (version_id, asset_id)
  REFERENCES co_production.versions (id, asset_id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT approvals_workflow_exact_version_fkey
  FOREIGN KEY (workflow_id, asset_id, version_id)
  REFERENCES co_production.approval_workflows (id, asset_id, version_id)
  ON DELETE CASCADE;
ALTER TABLE co_production.approval_history
  ADD CONSTRAINT approval_history_asset_fkey
  FOREIGN KEY (asset_id) REFERENCES co_production.assets(id) ON DELETE CASCADE,
  ADD CONSTRAINT approval_history_version_asset_fkey
  FOREIGN KEY (version_id, asset_id)
  REFERENCES co_production.versions(id, asset_id) ON DELETE RESTRICT,
  ADD CONSTRAINT approval_history_approval_exact_version_fkey
  FOREIGN KEY (approval_id, asset_id, version_id)
  REFERENCES co_production.approvals(id, asset_id, version_id) ON DELETE CASCADE;
ALTER TABLE co_production.review_invites
  ADD CONSTRAINT review_invites_approval_binding_check CHECK (
    (approval_workflow_id IS NULL AND approval_id IS NULL)
    OR (approval_workflow_id IS NOT NULL AND approval_id IS NOT NULL AND permissions = 'approve')
  ),
  ADD CONSTRAINT review_invites_workflow_exact_version_fkey
  FOREIGN KEY (approval_workflow_id, asset_id, version_id)
  REFERENCES co_production.approval_workflows(id, asset_id, version_id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT review_invites_approval_exact_version_fkey
  FOREIGN KEY (approval_id, asset_id, version_id)
  REFERENCES co_production.approvals(id, asset_id, version_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION co_production.create_version_approval_workflow(
  p_asset_id uuid,
  p_version_id uuid,
  p_mode text,
  p_steps jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_existing co_production.approval_workflows%ROWTYPE;
  v_workflow co_production.approval_workflows%ROWTYPE;
  v_requested jsonb;
  v_persisted jsonb;
  v_steps jsonb;
BEGIN
  IF p_asset_id IS NULL OR p_version_id IS NULL OR p_actor_id IS NULL
     OR p_mode NOT IN ('sequential', 'parallel')
     OR jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) < 1
     OR jsonb_array_length(p_steps) > 50 THEN
    RAISE EXCEPTION 'CVP_WORKFLOW_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'step_order', (entry.value->>'step_order')::integer,
    'role_label', btrim(entry.value->>'role_label'),
    'assignee_email', lower(btrim(entry.value->>'assignee_email'))
  ) ORDER BY (entry.value->>'step_order')::integer)
  INTO v_requested
  FROM jsonb_array_elements(p_steps) AS entry(value)
  WHERE (entry.value->>'step_order') ~ '^[1-9][0-9]*$'
    AND length(btrim(entry.value->>'role_label')) BETWEEN 1 AND 120
    AND lower(btrim(entry.value->>'assignee_email')) ~ '^[^@[:space:]]+@[^@[:space:]]+$';

  IF jsonb_array_length(v_requested) IS DISTINCT FROM jsonb_array_length(p_steps)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_requested) AS a(value)
       GROUP BY a.value->>'step_order' HAVING count(*) > 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_requested) AS a(value)
       GROUP BY a.value->>'assignee_email' HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'CVP_WORKFLOW_STEPS_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM asset.id FROM co_production.assets AS asset
  WHERE asset.id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CVP_WORKFLOW_VERSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM version.id FROM co_production.versions AS version
  WHERE version.id = p_version_id AND version.asset_id = p_asset_id
    AND version.is_current IS TRUE FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CVP_WORKFLOW_VERSION_NOT_CURRENT' USING ERRCODE = '23514';
  END IF;

  SELECT workflow.* INTO v_existing
  FROM co_production.approval_workflows AS workflow
  WHERE workflow.asset_id = p_asset_id AND workflow.version_id = p_version_id
  FOR UPDATE;
  IF FOUND THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'step_order', step.step_order,
      'role_label', step.role_label,
      'assignee_email', lower(btrim(step.assignee_email))
    ) ORDER BY step.step_order), '[]'::jsonb)
    INTO v_persisted
    FROM co_production.approvals AS step
    WHERE step.workflow_id = v_existing.id
      AND step.asset_id = p_asset_id AND step.version_id = p_version_id;
    IF v_existing.mode <> p_mode OR v_persisted <> v_requested THEN
      RAISE EXCEPTION 'CVP_WORKFLOW_EXISTS' USING ERRCODE = '23505';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(step) ORDER BY step.step_order), '[]'::jsonb)
      INTO v_steps FROM co_production.approvals AS step
      WHERE step.workflow_id = v_existing.id;
    RETURN jsonb_build_object('created', false, 'workflow',
      to_jsonb(v_existing) || jsonb_build_object('steps', v_steps));
  END IF;

  UPDATE co_production.approval_workflows
  SET status = 'cancelled', updated_at = clock_timestamp()
  WHERE asset_id = p_asset_id AND version_id IS NOT NULL AND version_id <> p_version_id
    AND status = 'active';

  INSERT INTO co_production.approval_workflows(asset_id, version_id, mode, created_by, status)
  VALUES (p_asset_id, p_version_id, p_mode, p_actor_id, 'active')
  RETURNING * INTO v_workflow;
  INSERT INTO co_production.approvals(
    asset_id, version_id, workflow_id, step_order, role_label, assignee_email, status
  )
  SELECT p_asset_id, p_version_id, v_workflow.id,
    (entry.value->>'step_order')::integer, entry.value->>'role_label',
    entry.value->>'assignee_email', 'pending'
  FROM jsonb_array_elements(v_requested) AS entry(value);
  SELECT jsonb_agg(to_jsonb(step) ORDER BY step.step_order) INTO v_steps
  FROM co_production.approvals AS step WHERE step.workflow_id = v_workflow.id;
  RETURN jsonb_build_object('created', true, 'workflow',
    to_jsonb(v_workflow) || jsonb_build_object('steps', v_steps));
END;
$$;

CREATE OR REPLACE FUNCTION co_production.record_version_approval_decision(
  p_asset_id uuid,
  p_version_id uuid,
  p_approval_id uuid,
  p_review_invite_id uuid,
  p_status text,
  p_decision_note text,
  p_actor_id uuid,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_step co_production.approvals%ROWTYPE;
  v_workflow co_production.approval_workflows%ROWTYPE;
  v_updated co_production.approvals%ROWTYPE;
  v_asset co_production.assets%ROWTYPE;
  v_first_pending uuid;
  v_all_approved boolean;
  v_asset_status text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_status NOT IN ('approved','approved_with_changes','changes_requested','rejected') THEN
    RAISE EXCEPTION 'CVP_APPROVAL_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT asset.* INTO v_asset FROM co_production.assets AS asset
  WHERE asset.id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CVP_APPROVAL_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM version.id FROM co_production.versions AS version
  WHERE version.id = p_version_id AND version.asset_id = p_asset_id
    AND version.is_current IS TRUE FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CVP_APPROVAL_VERSION_NOT_CURRENT' USING ERRCODE = '23514';
  END IF;
  SELECT step.* INTO v_step FROM co_production.approvals AS step
  WHERE step.id = p_approval_id AND step.asset_id = p_asset_id
    AND step.version_id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CVP_APPROVAL_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT workflow.* INTO v_workflow FROM co_production.approval_workflows AS workflow
  WHERE workflow.id = v_step.workflow_id AND workflow.asset_id = p_asset_id
    AND workflow.version_id = p_version_id AND workflow.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CVP_APPROVAL_WORKFLOW_INACTIVE' USING ERRCODE = '23514'; END IF;
  IF p_review_invite_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM co_production.review_invites AS invite
    WHERE invite.id = p_review_invite_id AND invite.asset_id = p_asset_id
      AND invite.version_id = p_version_id
      AND invite.approval_workflow_id = v_workflow.id
      AND invite.approval_id = p_approval_id
      AND invite.permissions = 'approve' AND invite.active IS TRUE
      AND (invite.expires_at IS NULL OR invite.expires_at > v_now)
  ) THEN
    RAISE EXCEPTION 'CVP_APPROVAL_INVITE_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF v_step.status <> 'pending' THEN
    RAISE EXCEPTION 'CVP_APPROVAL_ALREADY_DECIDED' USING ERRCODE = '23514';
  END IF;
  IF v_workflow.mode = 'sequential' THEN
    SELECT step.id INTO v_first_pending FROM co_production.approvals AS step
    WHERE step.workflow_id = v_workflow.id AND step.status = 'pending'
    ORDER BY step.step_order LIMIT 1;
    IF v_first_pending IS DISTINCT FROM p_approval_id THEN
      RAISE EXCEPTION 'CVP_APPROVAL_STEP_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;
  END IF;
  UPDATE co_production.approvals AS step SET status = p_status,
    decision_note = NULLIF(btrim(p_decision_note), ''), decided_at = v_now, updated_at = v_now
  WHERE step.id = p_approval_id AND step.asset_id = p_asset_id
    AND step.version_id = p_version_id AND step.workflow_id = v_workflow.id
    AND step.status = 'pending' RETURNING step.* INTO v_updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'CVP_APPROVAL_ALREADY_DECIDED' USING ERRCODE = '40001'; END IF;
  INSERT INTO co_production.approval_history(
    approval_id, asset_id, version_id, old_status, new_status, changed_by, note
  ) VALUES (p_approval_id, p_asset_id, p_version_id, v_step.status, p_status,
    p_actor_id, NULLIF(btrim(p_decision_note), ''));
  SELECT bool_and(step.status IN ('approved','approved_with_changes')) INTO v_all_approved
  FROM co_production.approvals AS step WHERE step.workflow_id = v_workflow.id;
  IF v_all_approved THEN
    UPDATE co_production.approval_workflows SET status = 'completed', updated_at = v_now
    WHERE id = v_workflow.id AND status = 'active';
    UPDATE co_production.assets SET status = 'approved', updated_at = v_now
    WHERE id = p_asset_id RETURNING status INTO v_asset_status;
  ELSIF p_status IN ('changes_requested','rejected') THEN
    UPDATE co_production.assets SET status = 'needs_changes', updated_at = v_now
    WHERE id = p_asset_id RETURNING status INTO v_asset_status;
  ELSE
    v_asset_status := v_asset.status;
  END IF;
  INSERT INTO co_production.activity_log(project_id, asset_id, actor_id, actor_name, action, details)
  VALUES (v_asset.project_id, p_asset_id, p_actor_id,
    COALESCE(NULLIF(btrim(p_actor_name), ''), 'Unknown reviewer'),
    CASE WHEN p_status IN ('approved','approved_with_changes') THEN 'approved_asset' ELSE 'requested_changes' END,
    jsonb_build_object('asset_title',v_asset.title,'version_id',p_version_id,
      'workflow_id',v_workflow.id,'approval_id',p_approval_id,'decision',p_status));
  RETURN jsonb_build_object('approval',to_jsonb(v_updated),'asset_status',v_asset_status,
    'asset_title',v_asset.title,'all_approved',v_all_approved,
    'workflow_completed',v_all_approved,'webhook_event',
    CASE WHEN v_all_approved THEN 'review.completed'
      WHEN p_status IN ('approved','approved_with_changes') THEN 'asset.approved'
      ELSE 'asset.changes_requested' END);
END;
$$;

REVOKE ALL ON FUNCTION co_production.create_version_approval_workflow(uuid,uuid,text,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.create_version_approval_workflow(uuid,uuid,text,jsonb,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION co_production.record_version_approval_decision(uuid,uuid,uuid,uuid,text,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.record_version_approval_decision(uuid,uuid,uuid,uuid,text,text,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION co_production.authorize_review_admission(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.authorize_review_admission(uuid,text)
  TO service_role;

COMMIT;

-- Run only after 20260922073000_version_bound_approval_rounds.sql is staged.
-- This exercises the real CCO-DB functions against the existing QA V1, then
-- rolls back every workflow, invite, decision, status, and history write.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '5s';

DO $fixture$
DECLARE
  v_asset_id constant uuid := '712dee3f-f8ed-4d6e-b6f0-fa8483a2de4f';
  v_version_id constant uuid := 'ee6d6762-1479-4cb7-9051-2c6ea9083359';
  v_actor_id uuid;
  v_first jsonb;
  v_repeat jsonb;
  v_workflow_id uuid;
  v_approval_one uuid;
  v_approval_two uuid;
  v_wrong_invite uuid;
  v_conflict_rejected boolean := false;
  v_cross_invite_rejected boolean := false;
  v_stale_rejected boolean := false;
BEGIN
  SELECT COALESCE(asset.uploaded_by, project.owner_id)
  INTO v_actor_id
  FROM co_production.assets AS asset
  JOIN co_production.projects AS project ON project.id = asset.project_id
  JOIN co_production.versions AS version
    ON version.id = v_version_id AND version.asset_id = asset.id
  WHERE asset.id = v_asset_id AND version.is_current IS TRUE;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'PRECHECK: QA V1 is not current or has no actor';
  END IF;
  IF EXISTS (
    SELECT 1 FROM co_production.approval_workflows
    WHERE asset_id = v_asset_id AND version_id = v_version_id
  ) THEN
    RAISE EXCEPTION 'PRECHECK: QA V1 already has an exact approval round';
  END IF;

  v_first := co_production.create_version_approval_workflow(
    v_asset_id, v_version_id, 'sequential',
    '[{"step_order":1,"role_label":"Client","assignee_email":"cvp-qa@example.com"},{"step_order":2,"role_label":"Legal","assignee_email":"cvp-legal@example.com"}]'::jsonb,
    v_actor_id
  );
  v_repeat := co_production.create_version_approval_workflow(
    v_asset_id, v_version_id, 'sequential',
    '[{"step_order":1,"role_label":"Client","assignee_email":"CVP-QA@EXAMPLE.COM"},{"step_order":2,"role_label":"Legal","assignee_email":"cvp-legal@example.com"}]'::jsonb,
    v_actor_id
  );
  IF v_first->>'created' <> 'true' OR v_repeat->>'created' <> 'false'
     OR v_first#>>'{workflow,id}' IS DISTINCT FROM v_repeat#>>'{workflow,id}' THEN
    RAISE EXCEPTION 'FAIL: identical create was not idempotent';
  END IF;
  v_workflow_id := (v_first#>>'{workflow,id}')::uuid;
  SELECT id INTO v_approval_one FROM co_production.approvals
    WHERE workflow_id = v_workflow_id AND step_order = 1;
  SELECT id INTO v_approval_two FROM co_production.approvals
    WHERE workflow_id = v_workflow_id AND step_order = 2;

  BEGIN
    PERFORM co_production.create_version_approval_workflow(
      v_asset_id, v_version_id, 'parallel',
      '[{"step_order":1,"role_label":"Client","assignee_email":"cvp-qa@example.com"}]'::jsonb,
      v_actor_id
    );
  EXCEPTION WHEN unique_violation THEN
    v_conflict_rejected := true;
  END;
  IF NOT v_conflict_rejected THEN RAISE EXCEPTION 'FAIL: conflicting create succeeded'; END IF;

  INSERT INTO co_production.review_invites(
    asset_id, version_id, approval_workflow_id, approval_id,
    token_hash, token_ciphertext, reviewer_email, permissions, created_by,
    active, watermark_enabled, download_enabled
  ) VALUES (
    v_asset_id, v_version_id, v_workflow_id, v_approval_two,
    encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'),
    'v1.preflight-' || gen_random_uuid()::text,
    'cvp-legal@example.com', 'approve', v_actor_id,
    true, false, false
  ) RETURNING id INTO v_wrong_invite;

  BEGIN
    PERFORM co_production.record_version_approval_decision(
      v_asset_id, v_version_id, v_approval_one, v_wrong_invite,
      'approved', NULL, NULL, 'Preflight reviewer'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_cross_invite_rejected := true;
  END;
  IF NOT v_cross_invite_rejected THEN RAISE EXCEPTION 'FAIL: cross-invite decision succeeded'; END IF;

  UPDATE co_production.versions SET is_current = false
  WHERE id = v_version_id AND asset_id = v_asset_id;
  BEGIN
    PERFORM co_production.record_version_approval_decision(
      v_asset_id, v_version_id, v_approval_one, NULL,
      'approved', NULL, v_actor_id, 'Preflight operator'
    );
  EXCEPTION WHEN check_violation THEN
    v_stale_rejected := true;
  END;
  IF NOT v_stale_rejected THEN RAISE EXCEPTION 'FAIL: stale-version decision succeeded'; END IF;

  RAISE NOTICE 'PASS: idempotent create, conflicting spec, cross-invite, and stale-version gates';
END
$fixture$;

ROLLBACK;

-- Concurrency fixture (two SQL sessions, both wrapped in transactions):
-- A: BEGIN; SELECT id FROM co_production.assets WHERE id =
--    '712dee3f-f8ed-4d6e-b6f0-fa8483a2de4f' FOR UPDATE;
-- B: SET lock_timeout='250ms'; call create_version_approval_workflow or
--    record_version_approval_decision for that asset; expect SQLSTATE 55P03.
-- A: ROLLBACK. Then rerun B with lock_timeout='5s'; expect the current-version
--    predicate to be evaluated only after A's final state is visible.

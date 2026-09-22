import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = source("supabase/migrations/20260922073000_version_bound_approval_rounds.sql");
const preflight = source("supabase/tests/version_bound_approval_rounds_preflight.sql");

test("approval rounds keep legacy rows nullable and bind exact version identities", () => {
  assert.match(migration, /approval_workflows[\s\S]*ADD COLUMN IF NOT EXISTS version_id uuid/);
  assert.match(migration, /Existing asset-wide rows remain nullable historical evidence/);
  assert.doesNotMatch(migration, /UPDATE co_production\.(?:approval_workflows|approvals)\s+SET\s+version_id/);
  assert.match(migration, /approval_workflows_one_round_per_version_idx/);
  assert.match(migration, /review_invites_workflow_exact_version_fkey/);
  assert.match(migration, /review_invites_approval_exact_version_fkey/);
  assert.match(migration, /approval_workflow_id IS NULL AND approval_id IS NULL/);
  assert.match(migration, /approval_workflow_id IS NOT NULL AND approval_id IS NOT NULL AND permissions = 'approve'/);
});

test("workflow creation is one asset-lock transaction with normalized idempotency", () => {
  const rpc = migration.slice(
    migration.indexOf("create_version_approval_workflow"),
    migration.indexOf("record_version_approval_decision"),
  );
  assert.match(rpc, /SECURITY INVOKER/);
  assert.match(rpc, /SET search_path = ''/);
  assert.match(rpc, /assets AS asset[\s\S]*FOR UPDATE/);
  assert.match(rpc, /version\.is_current IS TRUE FOR UPDATE/);
  assert.match(rpc, /lower\(btrim\(entry\.value->>'assignee_email'\)\)/);
  assert.match(rpc, /v_persisted <> v_requested/);
  assert.match(rpc, /'created', false/);
  assert.match(rpc, /CVP_WORKFLOW_EXISTS/);
});

test("decision transaction fails stale revisions and cross-invite decisions closed", () => {
  const rpc = migration.slice(migration.indexOf("record_version_approval_decision"));
  assert.match(rpc, /assets AS asset[\s\S]*FOR UPDATE/);
  assert.match(rpc, /version\.is_current IS TRUE FOR UPDATE/);
  assert.match(rpc, /CVP_APPROVAL_VERSION_NOT_CURRENT/);
  assert.match(rpc, /invite\.version_id = p_version_id/);
  assert.match(rpc, /invite\.approval_workflow_id = v_workflow\.id/);
  assert.match(rpc, /invite\.approval_id = p_approval_id/);
  assert.match(rpc, /step\.status = 'pending'[\s\S]*RETURNING step\.\* INTO v_updated/);
  assert.match(rpc, /INSERT INTO co_production\.approval_history/);
});

test("approval RPCs are service-role-only with an empty search path", () => {
  for (const name of [
    "create_version_approval_workflow",
    "record_version_approval_decision",
    "publish_version_media_derivatives",
    "project_version_media_pipeline_status",
  ]) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION co_production\\.${name}\\([\\s\\S]*FROM PUBLIC, anon, authenticated`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION co_production\\.${name}\\([\\s\\S]*TO service_role`));
  }
});

test("rollback preflight covers live negative and concurrency gates without durable fixture writes", () => {
  assert.match(preflight, /^BEGIN;/m);
  assert.match(preflight, /^ROLLBACK;/m);
  assert.match(preflight, /identical create was not idempotent/);
  assert.match(preflight, /conflicting create succeeded/);
  assert.match(preflight, /cross-invite decision succeeded/);
  assert.match(preflight, /stale-version decision succeeded/);
  assert.match(preflight, /Concurrency fixture \(two SQL sessions/);
});

test("routes and shares carry the exact version, workflow, step, and invite binding", () => {
  const workflow = source("app/api/approvals/workflow/route.ts");
  const share = source("lib/sharing/share-service.ts");
  const reviewRead = source("app/api/review/[token]/route.ts");
  const reviewDecision = source("app/api/review/[token]/approvals/route.ts");
  const decisions = source("lib/approval-decisions.ts");
  const internalDecisions = source("app/api/assets/[id]/approvals/route.ts");
  assert.match(workflow, /searchParams\.get\("version_id"\)/);
  assert.match(workflow, /body\.version_id/);
  assert.match(workflow, /create_version_approval_workflow/);
  assert.match(workflow, /data\.created === true \? 201 : 200/);
  assert.match(share, /\.eq\("version_id", item\.versionId\)/);
  assert.match(share, /approval_workflow_id: item\.approvalRoute\?\.workflowId/);
  assert.match(reviewRead, /\.eq\("workflow_id", approvalWorkflowId\)/);
  assert.match(reviewDecision, /requestedVersionId !== invite\.version_id/);
  assert.match(reviewDecision, /approvalId !== invite\.approval_id/);
  assert.match(decisions, /p_review_invite_id: reviewInviteId \?\? null/);
  assert.ok(
    internalDecisions.indexOf("assertAssetNotLocked(assetId, supabase)") <
      internalDecisions.indexOf("recordApprovalDecision({"),
  );
  assert.match(internalDecisions, /isAssetDeliveryLockedError[\s\S]*"ASSET_LOCKED"/);
});

test("late media pipeline state cannot erase a human request for changes", () => {
  const repository = source("lib/media-pipeline/repository.ts");
  assert.equal((repository.match(/rpc\("project_version_media_pipeline_status"/g) ?? []).length, 2);
  assert.match(repository, /rpc\("publish_version_media_derivatives"/);
  assert.doesNotMatch(repository, /const nextStatus|currentVersionId:/);
  const publishRpc = migration.slice(migration.indexOf("publish_version_media_derivatives"));
  assert.match(publishRpc, /assets AS asset[\s\S]*FOR UPDATE/);
  assert.match(publishRpc, /WHEN asset\.status IN \('approved', 'final', 'needs_changes'\) THEN asset\.status/);
  assert.match(publishRpc, /WHEN NOT v_is_current THEN asset\.status/);
  assert.match(publishRpc, /WHEN v_is_current THEN NULLIF\(p_duration_seconds, 0\)/);
  const statusRpc = migration.slice(migration.indexOf("project_version_media_pipeline_status"));
  assert.match(statusRpc, /assets AS asset[\s\S]*FOR UPDATE/);
  assert.match(statusRpc, /version\.id = p_version_id[\s\S]*version\.is_current IS TRUE/);
  assert.match(statusRpc, /asset\.status NOT IN \('approved', 'final', 'needs_changes'\)/);
});

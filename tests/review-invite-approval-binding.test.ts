import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ApprovalStep } from "../lib/types/codeliver.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

function moduleUrl(path: string, instance: string) {
  const url = pathToFileURL(resolve(repositoryRoot, path));
  url.searchParams.set("approval-binding", instance);
  return url.href;
}

function approval(id: string, stepOrder: number, status: ApprovalStep["status"] = "pending") {
  return {
    id,
    asset_id: "asset-a",
    version_id: "version-a",
    workflow_id: "workflow-a",
    step_order: stepOrder,
    role_label: `Step ${stepOrder}`,
    assignee_email: "client@example.com",
    assignee_id: null,
    status,
    decision_note: null,
    decided_at: null,
    created_at: "2026-07-16T00:00:00.000Z",
  } satisfies ApprovalStep;
}

function invite(approvalId: string | null) {
  return {
    id: "invite-a",
    asset_id: "asset-a",
    version_id: "version-a",
    approval_id: approvalId,
    reviewer_name: "Client Reviewer",
    reviewer_email: "client@example.com",
    permissions: "approve" as const,
    password_hash: null,
    expires_at: null,
    watermark_enabled: false,
    watermark_text: null,
    download_enabled: false,
    view_count: 0,
    max_views: null,
    last_viewed_at: null,
  };
}

test("an approval link grants one exact parallel step even when the email repeats", async () => {
  const { canInviteDecideApproval, getExternalApprovalState } = await import(
    moduleUrl("lib/review-invites.ts", "parallel"),
  );
  const approvals = [approval("step-a", 1), approval("step-b", 2)];
  const linkedInvite = invite("step-a");

  const state = getExternalApprovalState({
    approvals,
    invite: linkedInvite,
    workflowMode: "parallel",
  });
  assert.deepEqual(state.activeApprovalIds, ["step-a"]);
  assert.equal(
    canInviteDecideApproval({
      approvalId: "step-a",
      approvals,
      invite: linkedInvite,
      workflowMode: "parallel",
    }).ok,
    true,
  );
  assert.deepEqual(
    canInviteDecideApproval({
      approvalId: "step-b",
      approvals,
      invite: linkedInvite,
      workflowMode: "parallel",
    }),
    {
      ok: false,
      statusCode: 403,
      error: "This approval link is not assigned to that approval step.",
    },
  );
});

test("unbound approval links fail closed", async () => {
  const { canInviteDecideApproval, getExternalApprovalState } = await import(
    moduleUrl("lib/review-invites.ts", "unbound"),
  );
  const approvals = [approval("step-a", 1)];
  const unboundInvite = invite(null);

  const state = getExternalApprovalState({
    approvals,
    invite: unboundInvite,
    workflowMode: "parallel",
  });
  assert.deepEqual(state.activeApprovalIds, []);
  assert.match(state.approvalAccessMessage ?? "", /not bound to one approval step/);
  assert.deepEqual(
    canInviteDecideApproval({
      approvalId: "step-a",
      approvals,
      invite: unboundInvite,
      workflowMode: "parallel",
    }),
    {
      ok: false,
      statusCode: 403,
      error: "This approval link is not bound to one approval step.",
    },
  );
});

test("a sequential approval link waits only for its exact linked step", async () => {
  const { getExternalApprovalState } = await import(
    moduleUrl("lib/review-invites.ts", "sequential"),
  );
  const secondStepInvite = invite("step-b");
  const waiting = getExternalApprovalState({
    approvals: [approval("step-a", 1), approval("step-b", 2)],
    invite: secondStepInvite,
    workflowMode: "sequential",
  });
  assert.deepEqual(waiting.activeApprovalIds, []);
  assert.match(waiting.approvalAccessMessage ?? "", /waiting on an earlier approval step/);

  const ready = getExternalApprovalState({
    approvals: [approval("step-a", 1, "approved"), approval("step-b", 2)],
    invite: secondStepInvite,
    workflowMode: "sequential",
  });
  assert.deepEqual(ready.activeApprovalIds, ["step-b"]);
});

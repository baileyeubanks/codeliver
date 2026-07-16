import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, test } from "node:test";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ApprovalStep } from "../lib/types/codeliver";

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

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !extname(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

function moduleUrl(path: string, instance?: string) {
  const url = pathToFileURL(resolve(repositoryRoot, path));
  if (instance) url.searchParams.set("authority", instance);
  return url.href;
}

const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    },
    addEventListener() {},
    removeEventListener() {},
  },
});

after(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("public demo comments commit before success and restore only in their media scope", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts"));
  const { submitReviewComment } = await import(
    moduleUrl("lib/review/submit-review-comment.ts")
  );

  const comment = await submitReviewComment({
    token: "demo",
    demoMode: true,
    assetId: "denie-mcdonald-v4",
    assetType: "video",
    reviewerName: "  Journey Reviewer  ",
    body: "  Persist this exact version note.  ",
    timecode: 12.5,
    pin: { x: 25, y: 75 },
  });

  assert.equal(comment.author_name, "Journey Reviewer");
  assert.equal(comment.version_id, "demo-version-4");
  assert.equal(comment.body, "Persist this exact version note.");

  const restored = workspace.restoreDemoWorkspace(
    values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY) ?? null,
  );
  const persisted = restored.reviewComments.find((item) => item.id === comment.id);

  assert.deepEqual(
    persisted && {
      projectId: persisted.project_id,
      assetId: persisted.asset_id,
      versionId: persisted.version_id,
      body: persisted.body,
      timeSeconds: persisted.time_seconds,
      pin: [persisted.pin_x, persisted.pin_y],
    },
    {
      projectId: "ica",
      assetId: "denie-mcdonald-v4",
      versionId: "demo-version-4",
      body: "Persist this exact version note.",
      timeSeconds: 12.5,
      pin: [25, 75],
    },
  );
  assert.equal(
    restored.reviewComments.some(
      (item) => item.id === comment.id && item.version_id === "demo-version-5",
    ),
    false,
  );
  assert.equal(
    restored.reviewComments.some(
      (item) => item.id === comment.id && item.project_id !== "ica",
    ),
    false,
  );
});

test("public demo approval authority fails closed and restores sequential state after reload", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts"));
  const approvals: ApprovalStep[] = [
    {
      id: "review-step-1",
      asset_id: "denie-mcdonald-v4",
      workflow_id: "workflow-review",
      step_order: 1,
      role_label: "Client lead",
      assignee_email: "reviewer@client.example",
      assignee_id: null,
      status: "pending",
      decision_note: null,
      decided_at: null,
      created_at: "2026-07-14T20:00:00.000Z",
    },
    {
      id: "review-step-2",
      asset_id: "denie-mcdonald-v4",
      workflow_id: "workflow-review",
      step_order: 2,
      role_label: "Final client sign-off",
      assignee_email: "reviewer@client.example",
      assignee_id: null,
      status: "pending",
      decision_note: null,
      decided_at: null,
      created_at: "2026-07-14T20:01:00.000Z",
    },
  ];
  const baseInput = {
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    reviewInviteId: "invite-authority-test",
    reviewerName: "Journey Reviewer",
    reviewerEmail: "reviewer@client.example",
    permission: "approve" as const,
    workflowMode: "sequential" as const,
    approvals,
    initialAssetStatus: "in_review",
  };

  const inactive = workspace.recordDemoPublicReviewApproval({
    ...baseInput,
    approvalId: "review-step-2",
    decision: "rejected",
  });
  assert.deepEqual(inactive, {
    ok: false,
    statusCode: 403,
    error: "This review link is not assigned to the active approval step.",
  });

  const foreignRecipient = workspace.recordDemoPublicReviewApproval({
    ...baseInput,
    reviewerEmail: "producer@contentcoop.example",
    approvalId: "review-step-1",
    decision: "approved",
  });
  assert.equal(foreignRecipient.ok, false);

  let restored = workspace.restoreDemoWorkspace(
    values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY) ?? null,
  );
  assert.equal(restored.publicReviewStates.length, 0, "denied decisions must not write state");

  const firstDecision = workspace.recordDemoPublicReviewApproval({
    ...baseInput,
    approvalId: "review-step-1",
    decision: "approved",
    note: "  Editorial review is complete.  ",
  });
  assert.equal(firstDecision.ok, true);
  if (!firstDecision.ok) return;
  assert.deepEqual(firstDecision.activeApprovalIds, ["review-step-2"]);
  assert.equal(firstDecision.assetStatus, "in_review");
  assert.equal(firstDecision.approval.decision_note, "Editorial review is complete.");

  const reloadedWorkspace = await import(
    moduleUrl("lib/demo/workspace-store.ts", "approval-reload")
  );
  const repeatedInactive = reloadedWorkspace.recordDemoPublicReviewApproval({
    ...baseInput,
    approvalId: "review-step-1",
    decision: "rejected",
  });
  assert.equal(repeatedInactive.ok, false, "a decided step must stay inactive after reload");

  const finalDecision = reloadedWorkspace.recordDemoPublicReviewApproval({
    ...baseInput,
    approvalId: "review-step-2",
    decision: "approved",
    note: "Final sign-off recorded.",
  });
  assert.equal(finalDecision.ok, true);
  if (!finalDecision.ok) return;
  assert.deepEqual(finalDecision.activeApprovalIds, []);
  assert.equal(finalDecision.assetStatus, "approved");

  restored = reloadedWorkspace.restoreDemoWorkspace(
    values.get(reloadedWorkspace.DEMO_WORKSPACE_STORAGE_KEY) ?? null,
  );
  const persistedState = restored.publicReviewStates.find(
    (state) => state.review_invite_id === baseInput.reviewInviteId,
  );
  assert.equal(persistedState?.reviewer_email, "reviewer@client.example");
  assert.equal(persistedState?.asset_status, "approved");
  assert.deepEqual(persistedState?.active_approval_ids, []);
  assert.equal(persistedState?.approvals[0].decision_note, "Editorial review is complete.");
  assert.equal(persistedState?.approvals[1].decision_note, "Final sign-off recorded.");
  assert.equal(
    restored.publicReviewStates.some(
      (state) =>
        state.review_invite_id === baseInput.reviewInviteId &&
        (state.project_id !== baseInput.projectId ||
          state.asset_id !== baseInput.assetId ||
          state.version_id !== baseInput.versionId),
    ),
    false,
  );
});

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

test("legacy demo review branding migrates to the canonical Co-VideoPro lockup", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts", "brand-migration"));
  const legacy = workspace.createInitialDemoWorkspace();
  legacy.settings.brand = {
    displayName: "Content Co-op",
    playerLabel: "Reviewed with Content Co-op",
    primaryColor: "#4c8ef5",
    logoPath: "/demo/cco-spiral.png",
  };

  const restored = workspace.restoreDemoWorkspace(JSON.stringify(legacy));

  assert.deepEqual(restored.settings.brand, {
    displayName: "Co-VideoPro",
    playerLabel: "Reviewed in Co-VideoPro",
    primaryColor: "#145bb8",
    logoPath: "/brand/co-videopro-color-supplied.png",
    coverPath: "/brand/co-videopro-project-cover.jpg",
  });
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
    parentId: "comment-denie-1",
  });

  assert.equal(comment.author_name, "Journey Reviewer");
  assert.equal(comment.version_id, "demo-version-4");
  assert.equal(comment.body, "Persist this exact version note.");
  assert.equal(comment.parent_id, "comment-denie-1");
  assert.equal(comment.visibility, "external");

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
      parentId: persisted.parent_id,
      visibility: persisted.visibility,
      timeSeconds: persisted.time_seconds,
      pin: [persisted.pin_x, persisted.pin_y],
    },
    {
      projectId: "ica",
      assetId: "denie-mcdonald-v4",
      versionId: "demo-version-4",
      body: "Persist this exact version note.",
      parentId: "comment-denie-1",
      visibility: "external",
      timeSeconds: 1,
      pin: [undefined, undefined],
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

test("public demo replies stay on one root thread and inherit its review source", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts", "thread-integrity"));
  const root = workspace.addDemoReviewComment({
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    reviewInviteId: "invite-thread-integrity",
    visibility: "external",
    authorName: "Journey Reviewer",
    body: "Pin this exact moment.",
    timeSeconds: 18.25,
    pinX: 35,
    pinY: 65,
  });

  assert.ok(root, "root comment should persist");
  if (!root) return;

  const reply = workspace.addDemoReviewComment({
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    parentId: root.id,
    reviewInviteId: "attempted-other-invite",
    visibility: "internal",
    authorName: "Content Co-op",
    body: "Reply without a second pin.",
    timeSeconds: 88,
    pinX: 2,
    pinY: 3,
  });

  assert.ok(reply, "root reply should persist");
  if (!reply) return;
  assert.equal(reply.parent_id, root.id);
  assert.equal(reply.time_seconds, root.time_seconds);
  assert.equal(reply.pin_x, undefined);
  assert.equal(reply.pin_y, undefined);
  assert.equal(reply.visibility, "external");
  assert.equal(reply.review_invite_id, root.review_invite_id);

  const nestedReply = workspace.addDemoReviewComment({
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    parentId: reply.id,
    authorName: "Journey Reviewer",
    body: "This must not become an invisible nested reply.",
    timeSeconds: 19,
  });
  assert.equal(nestedReply, null);
});

test("public demo comment projections use one invite-scoped workspace source", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts", "public-comment-scope"));
  const initial = workspace.createInitialDemoWorkspace();
  const charlesThreads = workspace.getDemoExternalReviewComments(initial, {
    projectId: "ica",
    assetId: "charles-drummond-v5",
    versionId: "demo-version-5",
    reviewInviteId: "invite-demo",
  });

  assert.deepEqual(
    charlesThreads.map((comment) => comment.id),
    [
      "comment-charles-1",
      "comment-charles-1-reply",
      "comment-charles-2",
      "comment-charles-resolved",
    ],
  );
  assert.deepEqual(
    charlesThreads
      .filter((comment) => !comment.parent_id)
      .map((comment) => [comment.id, comment.pin_x, comment.pin_y]),
    [
      ["comment-charles-1", 27, 34],
      ["comment-charles-2", 64, 48],
      ["comment-charles-resolved", 73, 68],
    ],
  );
  assert.deepEqual(
    charlesThreads
      .filter((comment) => comment.parent_id)
      .map((comment) => [comment.parent_id, comment.time_seconds, comment.pin_x, comment.pin_y]),
    [["comment-charles-1", 1, undefined, undefined]],
  );
  assert.deepEqual(
    workspace.getDemoExternalReviewComments(initial, {
      projectId: "ica",
      assetId: "charles-drummond-v5",
      versionId: "demo-version-5",
      reviewInviteId: "another-reviewer-invite",
    }),
    [],
  );
});

test("demo cut markers are isolated by project, asset, and exact version", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts", "cut-marker-version-scope"));
  const projectId = "cut-marker-scope-project";
  const assetId = "cut-marker-scope-asset";

  workspace.addDemoReviewCutMarker({
    projectId,
    assetId,
    versionId: "demo-version-4",
    timeSeconds: 2,
  });
  workspace.addDemoReviewCutMarker({
    projectId,
    assetId,
    versionId: "demo-version-5",
    timeSeconds: 2,
  });

  const restored = workspace.restoreDemoWorkspace(
    values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY) ?? null,
  );
  assert.deepEqual(
    workspace
      .getDemoVersionCutMarkers(restored, { projectId, assetId, versionId: "demo-version-4" })
      .map((marker) => [marker.version_id, marker.time_seconds]),
    [["demo-version-4", 2]],
  );
  assert.deepEqual(
    workspace
      .getDemoVersionCutMarkers(restored, { projectId, assetId, versionId: "demo-version-5" })
      .map((marker) => [marker.version_id, marker.time_seconds]),
    [["demo-version-5", 2]],
  );

  const legacy = workspace.createInitialDemoWorkspace();
  const migrated = workspace.restoreDemoWorkspace(JSON.stringify({
    ...legacy,
    reviewCutMarkers: [
      {
        id: "legacy-cut-charles",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        time_seconds: 4.25,
        created_at: "2026-07-16T16:00:00.000Z",
      },
    ],
  }));
  assert.deepEqual(
    workspace
      .getDemoVersionCutMarkers(migrated, {
        projectId: "ica",
        assetId: "charles-drummond-v5",
        versionId: "demo-version-5",
      })
      .map((marker) => [marker.id, marker.version_id, marker.time_seconds]),
    [["legacy-cut-charles", "demo-version-5", 4.25]],
  );
});

test("public demo comment saves retain the current invite instead of falling back to another link", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts", "public-comment-save-scope"));
  const { submitReviewComment } = await import(
    moduleUrl("lib/review/submit-review-comment.ts", "public-comment-save-scope"),
  );
  const reviewInviteId = "invite-comment-scope-test";
  const comment = await submitReviewComment({
    token: "demo",
    demoMode: true,
    projectId: "ica",
    assetId: "charles-drummond-v5",
    assetType: "video",
    versionId: "demo-version-5",
    reviewInviteId,
    reviewerName: "Scoped Reviewer",
    body: "Keep this note inside the current review link.",
    timecode: 2.5,
    pin: { x: 41, y: 59 },
  });

  assert.equal(comment.review_invite_id, reviewInviteId);
  const restored = workspace.restoreDemoWorkspace(
    values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY) ?? null,
  );
  assert.deepEqual(
    workspace
      .getDemoExternalReviewComments(restored, {
        projectId: "ica",
        assetId: "charles-drummond-v5",
        versionId: "demo-version-5",
        reviewInviteId,
      })
      .map((item) => item.id),
    [comment.id],
  );
  assert.equal(
    workspace
      .getDemoExternalReviewComments(restored, {
        projectId: "ica",
        assetId: "charles-drummond-v5",
        versionId: "demo-version-5",
        reviewInviteId: "invite-demo",
      })
      .some((item) => item.id === comment.id),
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
    approvalLinkApprovalId: "review-step-1",
  };

  const inactive = workspace.recordDemoPublicReviewApproval({
    ...baseInput,
    approvalId: "review-step-2",
    decision: "rejected",
  });
  assert.deepEqual(inactive, {
    ok: false,
    statusCode: 403,
    error: "This approval link is not assigned to that approval step.",
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
  assert.deepEqual(firstDecision.activeApprovalIds, []);
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
    reviewInviteId: "invite-authority-test-step-2",
    approvalLinkApprovalId: "review-step-2",
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
  const firstStepState = restored.publicReviewStates.find(
    (state) => state.review_invite_id === baseInput.reviewInviteId,
  );
  const secondStepState = restored.publicReviewStates.find(
    (state) => state.review_invite_id === "invite-authority-test-step-2",
  );
  assert.equal(firstStepState?.reviewer_email, "reviewer@client.example");
  assert.equal(firstStepState?.approval_id, "review-step-1");
  assert.equal(firstStepState?.asset_status, "approved");
  assert.deepEqual(firstStepState?.active_approval_ids, []);
  assert.equal(firstStepState?.approvals[0].decision_note, "Editorial review is complete.");
  assert.equal(firstStepState?.approvals[1].decision_note, "Final sign-off recorded.");
  assert.equal(secondStepState?.approval_id, "review-step-2");
  assert.equal(secondStepState?.asset_status, "approved");
  assert.deepEqual(secondStepState?.active_approval_ids, []);
  assert.equal(secondStepState?.approvals[0].decision_note, "Editorial review is complete.");
  assert.equal(secondStepState?.approvals[1].decision_note, "Final sign-off recorded.");
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

test("public demo review completion is independent, exact-version, and idempotent", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts", "completion-authority"));
  const baseInput = {
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    reviewInviteId: "invite-completion-authority-test",
    reviewerName: "  Journey Reviewer  ",
    reviewerEmail: "reviewer@client.example",
    permission: "comment" as const,
    note: "  The review is complete from my side.  ",
  };

  const denied = workspace.recordDemoReviewCompletion({
    ...baseInput,
    reviewInviteId: "invite-completion-view-only",
    permission: "view",
  });
  assert.deepEqual(denied, {
    ok: false,
    statusCode: 403,
    error: "This review link cannot mark a review complete",
  });

  const missingIdentity = workspace.recordDemoReviewCompletion({
    ...baseInput,
    reviewInviteId: "invite-completion-missing-email",
    reviewerEmail: null,
  });
  assert.equal(missingIdentity.ok, false);

  const recorded = workspace.recordDemoReviewCompletion(baseInput);
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  assert.equal(recorded.created, true);
  assert.equal(recorded.completion.reviewer_name, "Journey Reviewer");
  assert.equal(recorded.completion.note, "The review is complete from my side.");
  assert.equal(recorded.completion.version_id, baseInput.versionId);

  const repeated = workspace.recordDemoReviewCompletion({
    ...baseInput,
    reviewerName: "Different display name must not rewrite the record",
  });
  assert.equal(repeated.ok, true);
  if (!repeated.ok) return;
  assert.equal(repeated.created, false);
  assert.equal(repeated.completion.id, recorded.completion.id);

  const restored = workspace.restoreDemoWorkspace(
    values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY) ?? null,
  );
  const completion = restored.reviewCompletions.find(
    (item) => item.review_invite_id === baseInput.reviewInviteId,
  );
  assert.deepEqual(
    completion && {
      projectId: completion.project_id,
      assetId: completion.asset_id,
      versionId: completion.version_id,
      reviewerName: completion.reviewer_name,
      note: completion.note,
    },
    {
      projectId: baseInput.projectId,
      assetId: baseInput.assetId,
      versionId: baseInput.versionId,
      reviewerName: "Journey Reviewer",
      note: "The review is complete from my side.",
    },
  );
  assert.equal(
    restored.activity.some(
      (item) =>
        item.action === "review_completed" &&
        item.asset_id === baseInput.assetId &&
        item.details.version_id === baseInput.versionId,
    ),
    true,
  );
});

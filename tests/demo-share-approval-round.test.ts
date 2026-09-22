import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = {
  imported_at: "2026-09-22T00:00:00.000Z",
  projects: [{ id: "automation-days", name: "Automation Days" }],
  assets: [
    {
      id: "automation-days-aayush-v2",
      project_id: "automation-days",
      title: "AAYUSH PATEL Interview v2",
      bytes: 235_134_905,
      duration_seconds: 123.25,
      width: 1920,
      height: 1080,
      frame_rate: 23.976,
      created_at: "2026-09-09T00:00:00.000Z",
    },
  ],
};

process.env.NEXT_PUBLIC_CVP_SOURCE_CATALOG = JSON.stringify(catalog);

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
  if (instance) url.searchParams.set("approval-round", instance);
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

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;

async function store() {
  if (!demoStore) demoStore = await import(moduleUrl("lib/demo/workspace-store.ts"));
  return demoStore;
}

function shareInput(shareIntent: "approval_needed" | "client_review" | "internal_review") {
  return {
    assetIds: ["automation-days-aayush-v2"],
    reviewerName: "QA Recipient",
    reviewerEmail: "  QA.RECIPIENT@example.com  ",
    shareIntent,
    requireName: true,
    allowDownloads: false,
    watermarkEnabled: false,
    expiresAt: null,
    maxViews: null,
    notificationChannels: [] as const,
  };
}

beforeEach(async () => {
  values.clear();
  (await store()).resetDemoWorkspace();
});

after(() => {
  Reflect.deleteProperty(globalThis, "window");
  delete process.env.NEXT_PUBLIC_CVP_SOURCE_CATALOG;
});

test("an explicitly created approval share starts one recipient-bound round on the current source version", async () => {
  const workspace = await store();
  const [link] = workspace.createDemoShareLinks(shareInput("approval_needed"));
  const state = workspace
    .getDemoWorkspaceSnapshot()
    .publicReviewStates.find((candidate) => candidate.review_invite_id === link.id);

  assert.ok(state, "approval-needed share creation must persist its approval authority");
  assert.deepEqual(
    {
      projectId: state.project_id,
      assetId: state.asset_id,
      versionId: state.version_id,
      inviteId: state.review_invite_id,
      reviewerName: state.reviewer_name,
      reviewerEmail: state.reviewer_email,
      workflowMode: state.workflow_mode,
      assetStatus: state.asset_status,
    },
    {
      projectId: "automation-days",
      assetId: "automation-days-aayush-v2",
      versionId: "source-version-automation-days-aayush-v2",
      inviteId: link.id,
      reviewerName: "QA Recipient",
      reviewerEmail: "qa.recipient@example.com",
      workflowMode: "sequential",
      assetStatus: "draft",
    },
  );
  assert.equal(state.approvals.length, 1);
  assert.deepEqual(
    {
      assetId: state.approvals[0].asset_id,
      role: state.approvals[0].role_label,
      assignee: state.approvals[0].assignee_email,
      status: state.approvals[0].status,
      note: state.approvals[0].decision_note,
      decidedAt: state.approvals[0].decided_at,
    },
    {
      assetId: "automation-days-aayush-v2",
      role: "QA Recipient approval",
      assignee: "qa.recipient@example.com",
      status: "pending",
      note: null,
      decidedAt: null,
    },
  );
  assert.deepEqual(state.active_approval_ids, [state.approvals[0].id]);
});

test("client and internal review shares do not create approval rounds", async () => {
  const workspace = await store();

  workspace.createDemoShareLinks(shareInput("client_review"));
  workspace.createDemoShareLinks(shareInput("internal_review"));

  assert.deepEqual(workspace.getDemoWorkspaceSnapshot().publicReviewStates, []);
});

test("the created round rejects another version and persists its exact decision and invite through reload", async () => {
  const workspace = await store();
  const [link] = workspace.createDemoShareLinks(shareInput("approval_needed"));
  const initial = workspace
    .getDemoWorkspaceSnapshot()
    .publicReviewStates.find((candidate) => candidate.review_invite_id === link.id);
  assert.ok(initial);

  const wrongVersion = workspace.recordDemoPublicReviewApproval({
    projectId: initial.project_id,
    assetId: initial.asset_id,
    versionId: "source-version-automation-days-aayush-v3",
    reviewInviteId: initial.review_invite_id,
    reviewerName: initial.reviewer_name,
    reviewerEmail: initial.reviewer_email,
    permission: "approve",
    workflowMode: initial.workflow_mode,
    approvals: initial.approvals,
    initialAssetStatus: initial.asset_status,
    approvalId: initial.approvals[0].id,
    decision: "approved",
  });
  assert.deepEqual(wrongVersion, {
    ok: false,
    statusCode: 403,
    error: "This review link is not assigned to this media version.",
  });

  const decision = workspace.recordDemoPublicReviewApproval({
    projectId: initial.project_id,
    assetId: initial.asset_id,
    versionId: initial.version_id,
    reviewInviteId: initial.review_invite_id,
    reviewerName: initial.reviewer_name,
    reviewerEmail: initial.reviewer_email,
    permission: "approve",
    workflowMode: initial.workflow_mode,
    approvals: initial.approvals,
    initialAssetStatus: initial.asset_status,
    approvalId: initial.approvals[0].id,
    decision: "approved",
    note: "  QA sign-off recorded.  ",
  });
  assert.equal(decision.ok, true);

  const reloaded = await import(moduleUrl("lib/demo/workspace-store.ts", "reload"));
  const restored = reloaded
    .getDemoWorkspaceSnapshot()
    .publicReviewStates.find((candidate) => candidate.review_invite_id === link.id);
  assert.equal(restored?.version_id, "source-version-automation-days-aayush-v2");
  assert.equal(restored?.approvals[0].status, "approved");
  assert.equal(restored?.approvals[0].decision_note, "QA sign-off recorded.");
  assert.deepEqual(restored?.active_approval_ids, []);

  const [secondLink] = reloaded.createDemoShareLinks(shareInput("approval_needed"));
  const rounds = reloaded
    .getDemoWorkspaceSnapshot()
    .publicReviewStates.filter((candidate) => candidate.asset_id === initial.asset_id);
  assert.equal(rounds.length, 2, "a new invite starts a separate current round");
  assert.equal(
    rounds.find((candidate) => candidate.review_invite_id === link.id)?.approvals[0].status,
    "approved",
  );
  assert.equal(
    rounds.find((candidate) => candidate.review_invite_id === secondLink.id)?.approvals[0].status,
    "pending",
  );
});

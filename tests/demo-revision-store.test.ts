import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && !extname(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
      removeItem(key: string) { values.delete(key); },
    },
    addEventListener() {},
    removeEventListener() {},
  },
});

function moduleUrl(instance?: string) {
  const url = pathToFileURL(resolve(repositoryRoot, "lib/demo/workspace-store.ts"));
  if (instance) url.searchParams.set("revision-store", instance);
  return url.href;
}

type Store = typeof import("../lib/demo/workspace-store.ts");
let workspace: Store | null = null;
async function store() {
  if (!workspace) workspace = await import(moduleUrl());
  return workspace;
}

function localAsset() {
  return {
    id: "local-upload-schneider-cut",
    project_id: "schneider-epc",
    title: "Schneider editorial cut",
    file_type: "video",
    status: "in_review",
    version_count: 1,
    reviewer_count: 0,
    reviewer_done: 0,
    comment_count: 0,
    created_at: "2026-09-22T00:00:00.000Z",
    href: "/projects/schneider-epc?demo=1&asset=local-upload-schneider-cut&view=review",
  };
}

function shareInput(assetIds: string[], intent: "approval_needed" | "client_review" = "approval_needed") {
  return {
    assetIds,
    reviewerName: "Schneider reviewer",
    reviewerEmail: "reviewer@schneider.example",
    shareIntent: intent,
    requireName: true,
    allowDownloads: false,
    watermarkEnabled: false,
    expiresAt: null,
    maxViews: null,
    notificationChannels: [],
  };
}

beforeEach(async () => {
  values.clear();
  (await store()).resetDemoWorkspace();
});

after(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("a local revision keeps the old review, decision, and approval on V1 while a new link pins V2", async () => {
  const api = await store();
  const initial = api.addDemoLocalMediaAsset({
    asset: localAsset(),
    versionId: "local-version-v1",
    mediaBlobId: "local-version-v1",
    fileName: "Schneider-cut-v1.mp4",
    fileSize: 1234,
    durationSeconds: 30,
  });
  assert.equal(initial.ok, true);

  const [oldLink] = api.createDemoShareLinks(shareInput([localAsset().id]));
  assert.equal(oldLink.version_id, "local-version-v1");
  const oldRound = api.getDemoWorkspaceSnapshot().publicReviewStates.find((state) => state.review_invite_id === oldLink.id);
  assert.equal(oldRound?.version_id, "local-version-v1");

  const oldComment = api.addDemoReviewComment({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v1",
    reviewInviteId: oldLink.id,
    authorName: "Schneider reviewer",
    body: "Keep this exact opening.",
    timeSeconds: 3,
  });
  assert.ok(oldComment);
  const oldRequest = api.addRevisionRequest({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v1",
    summary: "Address the opening note.",
    commentIds: [oldComment!.id],
  });
  assert.equal(oldRequest.ok, true);

  const appended = api.appendDemoMediaVersion({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v2",
    mediaBlobId: "local-version-v2",
    fileName: "Schneider-cut-v2.mp4",
    fileType: "video",
    fileSize: 2345,
    durationSeconds: 31,
  });
  assert.equal(appended.ok, true);

  const afterAppend = api.getDemoWorkspaceSnapshot();
  assert.deepEqual(
    afterAppend.mediaVersions
      .filter((item) => item.asset_id === localAsset().id)
      .map((item) => [item.id, item.version_number, item.is_current]),
    [["local-version-v1", 1, false], ["local-version-v2", 2, true]],
  );
  assert.equal(afterAppend.assets.find((asset) => asset.id === localAsset().id)?.version_count, 2);
  assert.equal(afterAppend.shareLinks.find((link) => link.id === oldLink.id)?.version_id, "local-version-v1");
  assert.equal(afterAppend.reviewComments.find((item) => item.id === oldComment!.id)?.version_id, "local-version-v1");
  assert.equal(afterAppend.revisionRequests.find((item) => item.id === oldRequest.id)?.version_id, "local-version-v1");
  assert.equal(afterAppend.publicReviewStates.find((item) => item.review_invite_id === oldLink.id)?.version_id, "local-version-v1");

  const [newLink] = api.createDemoShareLinks(shareInput([localAsset().id], "client_review"));
  assert.equal(newLink.version_id, "local-version-v2");
});

test("legacy local review records freeze to V1 before an append and a wrong project cannot replace the cut", async () => {
  const api = await store();
  assert.equal(api.addDemoLocalMediaAsset({
    asset: localAsset(),
    versionId: "local-version-v1",
    mediaBlobId: "local-version-v1",
    fileName: "Schneider-cut-v1.mp4",
    fileSize: 1234,
  }).ok, true);
  const comment = api.addDemoReviewComment({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v1",
    reviewInviteId: "legacy-review",
    authorName: "Schneider reviewer",
    body: "Hold this opening.",
    timeSeconds: 4,
  });
  assert.ok(comment);
  assert.equal(api.addDemoReviewCutMarker({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v1",
    timeSeconds: 7,
  }), true);
  const request = api.addRevisionRequest({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v1",
    summary: "Hold the opening.",
    commentIds: [comment.id],
  });
  assert.equal(request.ok, true);

  // Simulate a tab that had the pre-version fields in memory when the user
  // chooses Upload new version. The append must atomically freeze them first.
  const stale = api.getDemoWorkspaceSnapshot();
  stale.reviewComments.find((candidate) => candidate.id === comment.id)!.version_id = null;
  delete (stale.reviewCutMarkers.find((candidate) => candidate.asset_id === localAsset().id) as { version_id?: string }).version_id;
  stale.revisionRequests.find((candidate) => candidate.id === request.id)!.version_id = null;

  const wrongProject = api.appendDemoMediaVersion({
    projectId: "another-project",
    assetId: localAsset().id,
    versionId: "local-version-wrong-project",
    mediaBlobId: "local-version-wrong-project",
    fileName: "Wrong-target.mp4",
    fileType: "video",
    fileSize: 2345,
  });
  assert.deepEqual(wrongProject, {
    ok: false,
    error: "This selected media does not belong to the open project.",
  });

  assert.equal(api.appendDemoMediaVersion({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v2",
    mediaBlobId: "local-version-v2",
    fileName: "Schneider-cut-v2.mp4",
    fileType: "video",
    fileSize: 2345,
  }).ok, true);
  const after = api.getDemoWorkspaceSnapshot();
  assert.equal(after.reviewComments.find((candidate) => candidate.id === comment.id)?.version_id, "local-version-v1");
  assert.equal(after.reviewCutMarkers.find((candidate) => candidate.asset_id === localAsset().id)?.version_id, "local-version-v1");
  assert.equal(after.revisionRequests.find((candidate) => candidate.id === request.id)?.version_id, "local-version-v1");
  assert.equal(after.assets.find((candidate) => candidate.id === localAsset().id)?.comment_count, 0);
});

test("a legacy one-asset local link freezes to V1 before a revision and ambiguous links fail closed", async () => {
  const api = await store();
  const state = api.createInitialDemoWorkspace();
  state.assets.unshift(localAsset());
  state.shareLinks.unshift(
    {
      id: "legacy-one",
      token: "legacy-one",
      type: "review",
      created_at: "2026-09-22T00:00:00.000Z",
      created_by_name: "You",
      message: "Legacy review",
      asset_ids: [localAsset().id],
      media_count: 1,
      invited_count: 1,
      reviewer_email: "reviewer@schneider.example",
      permission: "comment",
      require_name: true,
      allow_comments: true,
      allow_downloads: false,
      is_active: true,
      public_url: "/review/demo?demo=1&share=legacy-one",
    },
    {
      id: "legacy-many",
      token: "legacy-many",
      type: "review",
      created_at: "2026-09-22T00:00:00.000Z",
      created_by_name: "You",
      message: "Ambiguous legacy review",
      asset_ids: [localAsset().id, "mclaren-podcast-v3"],
      media_count: 2,
      invited_count: 1,
      reviewer_email: "reviewer@schneider.example",
      permission: "comment",
      require_name: true,
      allow_comments: true,
      allow_downloads: false,
      is_active: true,
      public_url: "/review/demo?demo=1&share=legacy-many",
    },
  );
  delete (state as Partial<typeof state>).mediaVersions;

  const restored = api.restoreDemoWorkspace(JSON.stringify(state));
  assert.equal(restored.shareLinks.find((link) => link.id === "legacy-one")?.version_id, "local-version-local-upload-schneider-cut");
  assert.equal(restored.shareLinks.find((link) => link.id === "legacy-many")?.is_active, false);
  assert.equal(restored.shareLinks.find((link) => link.id === "legacy-many")?.version_binding_status, "reissue_required");
});

test("conflicting stored current flags fail closed instead of advancing a local review link", async () => {
  const api = await store();
  assert.equal(api.addDemoLocalMediaAsset({
    asset: localAsset(),
    versionId: "local-version-v1",
    mediaBlobId: "local-version-v1",
    fileName: "Schneider-cut-v1.mp4",
    fileSize: 1234,
  }).ok, true);
  const [link] = api.createDemoShareLinks(shareInput([localAsset().id]));
  assert.equal(api.appendDemoMediaVersion({
    projectId: "schneider-epc",
    assetId: localAsset().id,
    versionId: "local-version-v2",
    mediaBlobId: "local-version-v2",
    fileName: "Schneider-cut-v2.mp4",
    fileType: "video",
    fileSize: 2345,
  }).ok, true);

  const corrupt = api.getDemoWorkspaceSnapshot();
  corrupt.mediaVersions = corrupt.mediaVersions.map((version) =>
    version.asset_id === localAsset().id ? { ...version, is_current: true } : version,
  );
  const restored = api.restoreDemoWorkspace(JSON.stringify(corrupt));
  assert.equal(restored.mediaVersions.some((version) => version.asset_id === localAsset().id), false);
  assert.deepEqual(
    restored.shareLinks.find((candidate) => candidate.id === link.id) && {
      active: restored.shareLinks.find((candidate) => candidate.id === link.id)?.is_active,
      binding: restored.shareLinks.find((candidate) => candidate.id === link.id)?.version_binding_status,
    },
    { active: false, binding: "reissue_required" },
  );
});

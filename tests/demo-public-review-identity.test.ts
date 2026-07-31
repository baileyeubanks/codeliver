import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  resolveDemoPublicReviewIdentity,
  resolveDemoShareAssetId,
} from "../lib/demo/public-review-identity.ts";
import type {
  DemoShareLink,
  DemoWorkspaceState,
} from "../lib/demo/workspace-store.ts";
import { demoAssets, demoProjects } from "../lib/demo/workspace.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const seededShares: DemoShareLink[] = [
  {
    id: "share-ica-final",
    token: "demo-ica-final",
    type: "review",
    created_at: "2026-07-14T21:58:00.000Z",
    created_by_name: "You",
    message: "Final approval for the ICA roadshow package",
    asset_ids: ["ica-roadshow-final"],
    media_count: 1,
    invited_count: 2,
    reviewer_email: "approvals@ica.example",
    permission: "approve",
    require_name: true,
    allow_comments: true,
    allow_downloads: true,
    is_active: true,
    public_url: "/review/demo-ica-final?demo=1",
  },
  {
    id: "share-ceraweek-cuts",
    token: "demo-ceraweek-cuts",
    type: "review",
    created_at: "2026-07-14T20:35:00.000Z",
    created_by_name: "You",
    message: "CERAWeek speaker cut review",
    asset_ids: ["denie-mcdonald-v4", "charles-drummond-v5"],
    media_count: 2,
    invited_count: 2,
    reviewer_email: "review@ica.example",
    permission: "comment",
    require_name: true,
    allow_comments: true,
    allow_downloads: false,
    is_active: true,
    public_url: "/review/demo-ceraweek-cuts?demo=1",
  },
];

function createIdentityWorkspace(): DemoWorkspaceState {
  return {
    assets: demoAssets.map((asset) => ({ ...asset })),
    projects: demoProjects.map((project) => ({ ...project })),
    shareLinks: seededShares.map((share) => ({
      ...share,
      asset_ids: [...share.asset_ids],
    })),
  } as unknown as DemoWorkspaceState;
}

test("a single-asset share cannot be rebound by a forged asset query", () => {
  const workspace = createIdentityWorkspace();
  const share = workspace.shareLinks.find(
    (candidate) => candidate.token === "demo-ica-final",
  );

  assert.ok(share);
  assert.deepEqual(
    resolveDemoShareAssetId({
      share,
      requestedAssetId: "denie-mcdonald-v4",
    }),
    {
      ok: true,
      assetId: "ica-roadshow-final",
    },
  );
});

test("a multi-asset share accepts only assets carried by that share", () => {
  const workspace = createIdentityWorkspace();
  const share = workspace.shareLinks.find(
    (candidate) => candidate.token === "demo-ceraweek-cuts",
  );

  assert.ok(share);
  assert.deepEqual(
    resolveDemoShareAssetId({
      share,
      requestedAssetId: "charles-drummond-v5",
    }),
    {
      ok: true,
      assetId: "charles-drummond-v5",
    },
  );
  assert.deepEqual(
    resolveDemoShareAssetId({
      share,
      requestedAssetId: "ica-roadshow-final",
    }),
    {
      ok: false,
      error: "This review link does not include the requested media.",
    },
  );
});

test("the ICA final share resolves one exact asset and version without substitute media", () => {
  const workspace = createIdentityWorkspace();
  const identity = resolveDemoPublicReviewIdentity({
    workspace,
    shareToken: "demo-ica-final",
    requestedAssetId: "denie-mcdonald-v4",
    mediaObjectUrl: null,
  });

  assert.equal(identity.ok, true);
  if (!identity.ok) return;

  assert.deepEqual(
    {
      assetId: identity.asset.id,
      title: identity.asset.title,
      projectName: identity.asset.projects?.name,
      status: identity.asset.status,
      fileUrl: identity.asset.file_url,
      versionId: identity.version.id,
      versionAssetId: identity.version.asset_id,
      versionNumber: identity.version.version_number,
      versionFileUrl: identity.version.file_url,
      versionDuration: identity.version.duration_seconds,
      versionCount: identity.versions.length,
      isCurrent: identity.version.is_current,
    },
    {
      assetId: "ica-roadshow-final",
      title: "ICA_ROADSHOW_x_FINAL",
      projectName: "ICA / Client Review",
      status: "approved",
      fileUrl: null,
      versionId: "demo-version-5",
      versionAssetId: "ica-roadshow-final",
      versionNumber: 5,
      versionFileUrl: "",
      versionDuration: null,
      versionCount: 1,
      isCurrent: true,
    },
  );
});

test("a verified asset-local object URL is the only permitted media override", () => {
  const workspace = createIdentityWorkspace();
  const identity = resolveDemoPublicReviewIdentity({
    workspace,
    shareToken: "demo-ceraweek-cuts",
    requestedAssetId: "denie-mcdonald-v4",
    mediaObjectUrl: "blob:http://localhost/denie-upload",
  });

  assert.equal(identity.ok, true);
  if (!identity.ok) return;

  assert.equal(identity.asset.id, "denie-mcdonald-v4");
  assert.equal(identity.asset.file_url, "blob:http://localhost/denie-upload");
  assert.equal(identity.version.asset_id, identity.asset.id);
  assert.equal(identity.version.version_number, 4);
  assert.equal(identity.version.file_url, identity.asset.file_url);
  assert.equal(identity.versions.length, 1);
  assert.equal(
    identity.versions.some((version) => version.id === "demo-version-3"),
    false,
    "a share-scoped asset must never inherit the generic demo reel",
  );
});

test("the public review loader consumes the share-scoped identity without retagging the generic reel", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "components/review/PublicReviewPage.tsx"),
    "utf8",
  );

  assert.match(source, /resolveDemoPublicReviewIdentity\(\{/);
  assert.match(source, /resolveDemoShareAssetId\(\{/);
  assert.match(
    source,
    /searchParams\.get\("share"\) \?\? \(token !== "demo" \? token : null\)/,
  );
  assert.doesNotMatch(source, /seededVersions\.map\(\(candidate\)/);
  assert.doesNotMatch(
    source,
    /demoMediaUrl \?\? demoReviewPayload\.asset\.file_url/,
  );
});

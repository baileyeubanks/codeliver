import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildInternalDemoAssetHref,
  demoAssets,
} from "../lib/demo/workspace.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRootUrl = pathToFileURL(`${repositoryRoot}/`).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basePath: string | null = null;
    if (specifier.startsWith("@/")) {
      basePath = resolve(repositoryRoot, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith(repositoryRootUrl)
    ) {
      basePath = fileURLToPath(new URL(specifier, context.parentURL));
    }

    if (basePath) {
      const candidates = extname(basePath)
        ? [basePath]
        : [
            `${basePath}.ts`,
            `${basePath}.tsx`,
            resolve(basePath, "index.ts"),
            resolve(basePath, "index.tsx"),
          ];
      const matchedPath = candidates.find(existsSync);
      if (matchedPath) {
        return { url: pathToFileURL(matchedPath).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});

const { restoreDemoWorkspace } = await import("../lib/demo/workspace-store.ts");

test("internal demo asset hrefs stay inside the project cockpit shell", () => {
  assert.equal(
    buildInternalDemoAssetHref("project with spaces", "asset/with?delimiters"),
    "/projects/project%20with%20spaces?demo=1&asset=asset%2Fwith%3Fdelimiters&view=review",
  );

  assert.ok(demoAssets.length > 0, "expected seeded demo assets");
  for (const asset of demoAssets) {
    const expectedHref = buildInternalDemoAssetHref(asset.project_id, asset.id);
    assert.equal(asset.href, expectedHref, `${asset.id} escaped the internal cockpit`);

    const href = new URL(expectedHref, "https://co-deliver.test");
    assert.equal(href.pathname, `/projects/${asset.project_id}`);
    assert.deepEqual([...href.searchParams.entries()], [
      ["demo", "1"],
      ["asset", asset.id],
      ["view", "review"],
    ]);
    assert.notEqual(href.pathname, "/review/demo");
  }
});

test("demo uploads bind their new asset href to the internal route builder", () => {
  const projectPageSource = readFileSync(
    resolve(repositoryRoot, "app/(dashboard)/projects/[id]/page.tsx"),
    "utf8",
  );
  const uploadAssetFactory = projectPageSource.match(
    /const added = selectedFiles\.map\(\(file, index\) => \{[\s\S]*?\n\s*\}\);/,
  );

  assert.ok(uploadAssetFactory, "could not locate the demo upload asset constructor");
  assert.match(
    uploadAssetFactory[0],
    /href:\s*buildInternalDemoAssetHref\(id,\s*assetId\)/,
  );
  assert.doesNotMatch(uploadAssetFactory[0], /["'`]\/review\/demo/);
});

test("dashboard demo uploads bind their new asset href to the internal route builder", () => {
  const projectsPageSource = readFileSync(
    resolve(repositoryRoot, "app/(dashboard)/projects/page.tsx"),
    "utf8",
  );
  const uploadAssetFactory = projectsPageSource.match(
    /const added: MediaAsset\[\] = Array\.from\(files\)\.map\(\(file, index\) => \{[\s\S]*?\n\s*\}\);/,
  );

  assert.ok(uploadAssetFactory, "could not locate the dashboard demo upload constructor");
  assert.match(
    uploadAssetFactory[0],
    /const assetId = `local-upload-\$\{uploadStartedAt\}-\$\{index\}`/,
  );
  assert.match(uploadAssetFactory[0], /id:\s*assetId/);
  assert.match(
    uploadAssetFactory[0],
    /href:\s*buildInternalDemoAssetHref\(projectId,\s*assetId\)/,
  );
  assert.doesNotMatch(uploadAssetFactory[0], /["'`]\/review\/demo/);
});

test("restored demo assets migrate to cockpit hrefs without changing public share links", () => {
  const publicUrl =
    "/review/demo?demo=1&asset=stale-current&intent=client_review&share=public-token";
  const storedWorkspace = {
    schemaVersion: 1,
    projects: [{ id: "ica", name: "ICA" }],
    folders: [],
    assets: [
      {
        id: "stale-current",
        project_id: "ica",
        href: "/review/demo?demo=1&asset=stale-current",
      },
    ],
    archivedAssets: [
      {
        id: "stale-archived",
        project_id: "ica",
        href: "/review/demo?demo=1&asset=stale-archived",
      },
    ],
    trashedAssets: [
      {
        id: "stale-trashed",
        project_id: "ica",
        href: "/review/demo?demo=1&asset=stale-trashed",
      },
    ],
    shareLinks: [{ id: "public-share", public_url: publicUrl }],
    activity: [],
  };

  const restored = restoreDemoWorkspace(JSON.stringify(storedWorkspace));

  assert.equal(
    restored.assets[0].href,
    buildInternalDemoAssetHref("ica", "stale-current"),
  );
  assert.equal(
    restored.archivedAssets[0].href,
    buildInternalDemoAssetHref("ica", "stale-archived"),
  );
  assert.equal(
    restored.trashedAssets[0].href,
    buildInternalDemoAssetHref("ica", "stale-trashed"),
  );
  assert.deepEqual(restored.shareLinks, storedWorkspace.shareLinks);
  assert.equal(restored.shareLinks[0].public_url, publicUrl);
});

test("older demo workspaces receive the canonical Charles review history without replacing saved decisions", () => {
  const restored = restoreDemoWorkspace(JSON.stringify({
    schemaVersion: 1,
    projects: [{ id: "ica", name: "ICA" }],
    folders: [],
    assets: [],
    shareLinks: [],
    activity: [],
    reviewComments: [
      {
        id: "comment-denie-1",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        author_name: "Client Reviewer",
        body: "Saved user state",
        time_seconds: 1,
        status: "resolved",
        created_at: "2026-07-15T00:00:00.000Z",
      },
    ],
    approvalStages: [
      {
        id: "approval-denie-client",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        name: "Client Review",
        reviewer_names: ["Client Reviewer"],
        approved_reviewer_names: ["Client Reviewer"],
        status: "approved",
      },
    ],
  }));

  assert.equal(
    restored.reviewComments.find((comment) => comment.id === "comment-denie-1")?.body,
    "Saved user state",
  );
  assert.equal(
    restored.reviewComments.filter((comment) => comment.asset_id === "charles-drummond-v5").length,
    3,
  );
  assert.equal(
    restored.approvalStages.find((stage) => stage.id === "approval-denie-client")?.status,
    "approved",
  );
  assert.deepEqual(
    restored.approvalStages
      .filter((stage) => stage.asset_id === "charles-drummond-v5")
      .map((stage) => stage.name),
    ["Client Review", "Final Approval"],
  );
});

test("generated recipient share links retain the external review surface", () => {
  const workspaceStoreSource = readFileSync(
    resolve(repositoryRoot, "lib/demo/workspace-store.ts"),
    "utf8",
  );
  const shareFactoryStart = workspaceStoreSource.indexOf(
    "export function createDemoShareLinks",
  );
  const shareFactoryEnd = workspaceStoreSource.indexOf(
    "\nexport function ",
    shareFactoryStart + 1,
  );

  assert.notEqual(shareFactoryStart, -1, "could not locate demo public share generation");
  const shareFactorySource = workspaceStoreSource.slice(
    shareFactoryStart,
    shareFactoryEnd === -1 ? undefined : shareFactoryEnd,
  );
  assert.match(shareFactorySource, /public_url:\s*`\/review\/demo\?/);
});

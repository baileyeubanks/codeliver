import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("all comment write paths keep replies flat and source-locked to their root", () => {
  const publicRoute = source("app/api/review/[token]/comments/route.ts");
  const internalRoute = source("app/api/assets/[id]/comments/route.ts");
  const demoStore = source("lib/demo/workspace-store.ts");

  for (const route of [publicRoute, internalRoute]) {
    assert.match(route, /parent\.data\.parent_id/);
    assert.match(route, /Replies must target an original comment/);
    assert.match(route, /replySourceFromParent/);
  }
  assert.match(demoStore, /candidate\.id === input\.parentId/);
  assert.match(demoStore, /if \(input\.parentId && \(!parent \|\| parent\.parent_id\)\) return null/);
  assert.match(demoStore, /replySourceFromParent/);
  assert.match(demoStore, /replyAudienceFromParent/);
});

test("root pins and thread resolution cannot be split across reply records", () => {
  const internalRoute = source("app/api/assets/[id]/comments/route.ts");
  const migration = source("supabase/migrations/20260716191000_review_thread_integrity.sql");

  assert.match(internalRoute, /pin_x and pin_y must be provided together/);
  assert.match(internalRoute, /Only original comments can change thread status/);
  assert.match(migration, /public\.enforce_review_comment_thread_integrity/);
  assert.match(migration, /co_production_private\.enforce_review_comment_thread_integrity/);
  assert.match(migration, /Replies must target an original review comment/);
  assert.match(migration, /Only original comments can carry thread resolution state/);
});

test("the local public review preview applies the production invite and visibility boundary", () => {
  const publicReviewPage = source("app/review/[token]/page.tsx");
  const demoStore = source("lib/demo/workspace-store.ts");

  assert.match(publicReviewPage, /getDemoExternalReviewComments/);
  assert.match(demoStore, /comment\.project_id === scope\.projectId/);
  assert.match(demoStore, /comment\.asset_id === scope\.assetId/);
  assert.match(demoStore, /comment\.version_id === scope\.versionId/);
  assert.match(demoStore, /\(comment\.visibility \?\? "external"\) === "external"/);
  assert.match(
    demoStore,
    /\(comment\.review_invite_id \?\? "invite-demo"\) === scope\.reviewInviteId/,
  );
});

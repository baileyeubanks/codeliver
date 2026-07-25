import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEMO_SHORT_SHARE_QUERY_FLAG,
  isKnownDemoAssetRoute,
  isKnownDemoProjectRoute,
  isKnownDemoShareRoute,
  isOpaqueRouteToken,
  isProductionRecordId,
  seededDemoShareRoute,
} from "../lib/dynamic-route-authority.ts";
import { isLocalDemoServerRequest } from "../lib/demo/server-mode.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("dynamic route authority distinguishes production, seeded demo, and local demo ids", () => {
  assert.equal(
    isProductionRecordId("11111111-1111-4111-8111-111111111111"),
    true,
  );
  assert.equal(isProductionRecordId("does-not-exist"), false);
  assert.equal(isKnownDemoProjectRoute("ica"), true);
  assert.equal(isKnownDemoProjectRoute("new-client-mdy3abc1"), true);
  assert.equal(isKnownDemoProjectRoute("does-not-exist"), false);
  assert.equal(
    isKnownDemoAssetRoute("ica", "denie-mcdonald-v4"),
    true,
  );
  assert.equal(
    isKnownDemoAssetRoute(
      "new-client-mdy3abc1",
      "local-upload-1785000000000-0",
    ),
    true,
  );
  assert.equal(isKnownDemoAssetRoute("ica", "missing-asset"), false);
  assert.equal(isOpaqueRouteToken("V3ry_opaque-token-value-123456"), true);
  assert.equal(isOpaqueRouteToken("short"), false);
  assert.equal(isOpaqueRouteToken("../escape-token-value-123456"), false);
});

test("demo share route authority covers seeded and locally created share tokens", () => {
  assert.equal(isKnownDemoShareRoute("demo-ica-final"), true);
  assert.equal(isKnownDemoShareRoute("demo-ceraweek-cuts"), true);
  assert.equal(
    isKnownDemoShareRoute("review-11111111-2222-4333-8444-555555555555"),
    true,
  );
  assert.equal(isKnownDemoShareRoute("demo"), false);
  assert.equal(isKnownDemoShareRoute("bogus-token"), false);
  assert.equal(isKnownDemoShareRoute("bogus-token-1234567890"), false);
  assert.equal(isKnownDemoShareRoute("../demo-ica-final"), false);

  assert.deepEqual(seededDemoShareRoute("demo-ica-final"), {
    asset: "ica-roadshow-final",
    intent: "approval_needed",
  });
  assert.deepEqual(seededDemoShareRoute("demo-ceraweek-cuts"), {
    asset: "denie-mcdonald-v4",
    intent: "client_review",
  });
  assert.equal(seededDemoShareRoute("demo"), null);
  assert.equal(typeof DEMO_SHORT_SHARE_QUERY_FLAG, "string");

  // The seeded routes must stay in sync with the demo workspace share seeds.
  const workspaceStore = source("lib/demo/workspace-store.ts");
  assert.match(workspaceStore, /token: "demo-ica-final"/);
  assert.match(workspaceStore, /token: "demo-ceraweek-cuts"/);
  assert.match(workspaceStore, /asset_ids: \["ica-roadshow-final"\]/);
  assert.match(workspaceStore, /"denie-mcdonald-v4", "charles-drummond-v5"/);
});

test("server demo authority requires non-production localhost flag and query opt-in", () => {
  const enabled = {
    NODE_ENV: "development",
    CODELIVER_DEMO_MODE: "1",
  };
  assert.equal(
    isLocalDemoServerRequest({
      host: "localhost:4103",
      demo: "1",
      environment: enabled,
    }),
    true,
  );
  assert.equal(
    isLocalDemoServerRequest({
      host: "127.0.0.1:4103",
      demo: "1",
      environment: enabled,
    }),
    true,
  );
  assert.equal(
    isLocalDemoServerRequest({
      host: "admin.contentco-op.com",
      demo: "1",
      environment: enabled,
    }),
    false,
  );
  assert.equal(
    isLocalDemoServerRequest({
      host: "localhost:4103",
      demo: "1",
      environment: { ...enabled, NODE_ENV: "production" },
    }),
    false,
  );
  assert.equal(
    isLocalDemoServerRequest({
      host: "localhost:4103",
      demo: "1",
      environment: { NODE_ENV: "development" },
    }),
    false,
  );
});

test("every dynamic page is a server notFound boundary with a separate client surface", () => {
  const routes = [
    {
      page: "app/(dashboard)/projects/[id]/page.tsx",
      client: "components/projects/ProjectWorkspaceClient.tsx",
    },
    {
      page: "app/(review)/projects/[id]/assets/[assetId]/page.tsx",
      client: "components/review/InternalAssetReviewPage.tsx",
    },
    {
      page: "app/review/[token]/page.tsx",
      client: "components/review/PublicReviewPage.tsx",
    },
    {
      page: "app/invite/[token]/page.tsx",
      client: "components/auth/TeamInviteAcceptance.tsx",
    },
  ];

  for (const route of routes) {
    assert.equal(existsSync(resolve(repositoryRoot, route.client)), true, route.client);
    const page = source(route.page);
    assert.doesNotMatch(page, /^"use client"/);
    assert.match(page, /notFound\(\)/, route.page);
    assert.match(page, /from "next\/navigation"/, route.page);
  }
});

test("project and internal asset wrappers authorize before rendering clients", () => {
  const projectPage = source("app/(dashboard)/projects/[id]/page.tsx");
  const assetPage = source(
    "app/(review)/projects/[id]/assets/[assetId]/page.tsx",
  );

  assert.match(projectPage, /getProjectAccess/);
  assert.match(projectPage, /isKnownDemoProjectRoute/);
  assert.match(projectPage, /projectAccess\.status === 404/);
  assert.match(projectPage, /new BackendUnavailableError\("Project database"\)/);
  assert.match(projectPage, /ProjectWorkspaceClient/);
  assert.match(assetPage, /getAssetAccess/);
  assert.match(assetPage, /assetAccess\.status === 404/);
  assert.match(assetPage, /new BackendUnavailableError\("Asset database"\)/);
  assert.match(assetPage, /assetAccess\.data\.project_id !== id/);
  assert.match(assetPage, /isKnownDemoAssetRoute/);
});

test("token routes distinguish missing records from unavailable databases", () => {
  const publicReviewPage = source("app/review/[token]/page.tsx");
  const teamInvitePage = source("app/invite/[token]/page.tsx");
  const reviewAuthority = source("lib/review-invites.ts");

  assert.match(reviewAuthority, /if \(error\)[\s\S]*?status: 503/);
  assert.match(reviewAuthority, /if \(!data\)[\s\S]*?status: 404/);
  assert.match(
    publicReviewPage,
    /inviteLookup\.status === 404 \|\| inviteLookup\.status === 410\)\) notFound\(\)/,
  );
  assert.match(publicReviewPage, /inviteLookup\.status >= 500/);
  assert.match(publicReviewPage, /new BackendUnavailableError\("Review database"\)/);
  assert.match(teamInvitePage, /if \(error\) throw new BackendUnavailableError/);
});

test("demo review tokens resolve in the demo workspace and canonicalize to short URLs", () => {
  const publicReviewPage = source("app/review/[token]/page.tsx");
  const proxy = source("proxy.ts");

  // Unknown demo tokens are missing records, never production database lookups.
  assert.match(publicReviewPage, /if \(!isKnownDemoShareRoute\(token\)\) notFound\(\)/);
  // Bare long-form visits redirect permanently to the canonical short URL.
  assert.match(publicReviewPage, /permanentRedirect\(`\/review\/\$\{query\.share\}\?demo=1`\)/);
  assert.match(publicReviewPage, /query\[DEMO_SHORT_SHARE_QUERY_FLAG\] !== "1"/);
  // The proxy rewrites short URLs back to the query form the client resolves,
  // re-supplying the seeded asset/intent, and marks the rewrite to break loops.
  assert.match(proxy, /rewriteUrl\.pathname = "\/review\/demo"/);
  assert.match(proxy, /rewriteUrl\.searchParams\.set\("share", shareToken\)/);
  assert.match(proxy, /rewriteUrl\.searchParams\.set\(DEMO_SHORT_SHARE_QUERY_FLAG, "1"\)/);
  assert.match(proxy, /rewriteUrl\.searchParams\.set\("asset", seeded\.asset\)/);
  assert.match(proxy, /rewriteUrl\.searchParams\.set\("intent", seeded\.intent\)/);
});

test("no root loading boundary may stream a 200 shell ahead of notFound()", () => {
  // app/loading.tsx wraps every route in an instant-flush Suspense boundary:
  // the shell goes out with HTTP 200 before an async page can call notFound(),
  // which is what turned every dynamic-route 404 into a soft-200 (D19).
  assert.equal(
    existsSync(resolve(repositoryRoot, "app/loading.tsx")),
    false,
    "a root loading boundary would reintroduce soft-200 dynamic routes",
  );
});

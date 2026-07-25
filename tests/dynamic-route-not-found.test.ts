import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isKnownDemoAssetRoute,
  isKnownDemoProjectRoute,
  isOpaqueRouteToken,
  isProductionRecordId,
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
  assert.match(publicReviewPage, /inviteLookup\.status === 404\) notFound\(\)/);
  assert.match(publicReviewPage, /inviteLookup\.status >= 500/);
  assert.match(publicReviewPage, /new BackendUnavailableError\("Review database"\)/);
  assert.match(teamInvitePage, /if \(error\) throw new BackendUnavailableError/);
});

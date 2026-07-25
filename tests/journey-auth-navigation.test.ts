import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildAuthPageHref,
  resolveSafeReturnPath,
  withDemoMode,
} from "../components/auth/auth-policy.ts";
import {
  activeNavigationId,
  mobileNavigation,
  primaryNavigation,
  visibleNavigation,
  withWorkspaceQuery,
  type WorkspaceRole,
} from "../components/navigation/navigation-model.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("login and signup carry one safe nested return target through local demo access", () => {
  const target = "/projects/ica?asset=denie-mcdonald-v4&view=review#comments";
  const loginHref = buildAuthPageHref("/login", target, true);
  const login = new URL(loginHref, "https://co-deliver.test");

  assert.equal(login.pathname, "/login");
  assert.equal(login.searchParams.get("demo"), "1");
  assert.equal(login.searchParams.get("next"), target);

  const signupHref = buildAuthPageHref("/signup", login.searchParams.get("next"), true);
  const signup = new URL(signupHref, "https://co-deliver.test");
  assert.equal(signup.searchParams.get("next"), target);
  assert.equal(
    withDemoMode(resolveSafeReturnPath(signup.searchParams.get("next")), true),
    "/projects/ica?asset=denie-mcdonald-v4&view=review&demo=1#comments",
  );

  for (const unsafe of [
    "https://attacker.example/projects",
    "//attacker.example/projects",
    "/login?next=/projects/ica",
    "/auth/callback?code=secret",
  ]) {
    const href = new URL(buildAuthPageHref("/login", unsafe, false), "https://co-deliver.test");
    assert.equal(href.searchParams.get("next"), "/projects");
  }
});

test("every desktop and mobile navigation target resolves to the same role-filtered route state", () => {
  const roles: WorkspaceRole[] = ["owner", "producer", "editor", "reviewer", "viewer"];

  for (const role of roles) {
    const visible = visibleNavigation(role).flatMap((section) => section.items);
    const visibleIds = new Set(visible.map((item) => item.id));
    assert.equal(visibleIds.size, visible.length, `${role} navigation contains duplicate ids`);

    for (const item of [...primaryNavigation(role), ...mobileNavigation(role)]) {
      assert.equal(visibleIds.has(item.id), true, `${role}:${item.id} escaped role filtering`);
      assert.equal(activeNavigationId(`${item.href}/nested`, role), item.id);
      assert.equal(
        new URL(withWorkspaceQuery(item.href, "?demo=1"), "https://co-deliver.test")
          .searchParams.getAll("demo").length,
        1,
      );
    }
  }

  assert.deepEqual(
    mobileNavigation("owner").map((item) => item.href),
    ["/", "/projects", "/opportunities"],
  );
  assert.equal(activeNavigationId("/", "owner"), "home");
  assert.equal(activeNavigationId("/opportunities", "owner"), "opportunities");
  assert.equal(activeNavigationId("/settings", "viewer"), null);
});

test("dashboard, review, account, notification, signout, and offline shells retain distinct authority", () => {
  const dashboardLayout = source("app/(dashboard)/layout.tsx");
  const reviewLayout = source("app/(review)/layout.tsx");
  const shell = source("components/Shell.tsx");

  assert.match(dashboardLayout, /<DemoSessionGuard>/);
  assert.match(dashboardLayout, /<Shell>\{children\}<\/Shell>/);
  assert.doesNotMatch(reviewLayout, /Shell|DemoSessionGuard/);

  assert.match(shell, /buildSettingsHref\("account", Boolean\(demoSuffix\)\)/);
  assert.match(shell, /buildSettingsHref\("preferences", Boolean\(demoSuffix\)\)/);
  assert.match(shell, /withWorkspaceQuery\("\/activity", demoSuffix\)/);
  assert.match(shell, /<Bell size=\{19\} \/>/);
  assert.doesNotMatch(
    shell,
    /demoWorkspace\.activity\.length > 0 \? <i \/> : null/,
    "historical activity is not unread-notification authority",
  );
  assert.match(shell, /signOutDemoSession\(\)/);
  assert.match(shell, /window\.location\.href = "\/login\?demo=1"/);
  assert.match(shell, /await supabase\.auth\.signOut\(\)/);
  assert.match(shell, /Offline\. Changes that require the server are paused\./);
});

test("managed authentication redirects preserve the protected route after sign-in", () => {
  const proxySource = source("proxy.ts");
  const unauthenticatedStart = proxySource.indexOf("if (!user)");
  const unauthenticatedEnd = proxySource.indexOf("\n  return res;", unauthenticatedStart);

  assert.notEqual(unauthenticatedStart, -1, "could not locate the managed unauthenticated branch");
  assert.notEqual(unauthenticatedEnd, -1, "could not bound the managed unauthenticated branch");
  const unauthenticatedBranch = proxySource.slice(unauthenticatedStart, unauthenticatedEnd);

  assert.match(
    unauthenticatedBranch,
    /searchParams\.set\(["']next["'],\s*`?\$?\{?pathname/,
    "the configured-auth redirect discards the route that triggered sign-in",
  );
});

test("external recipient review never links into the authenticated workspace shell", () => {
  const publicReview = source("components/review/PublicReviewPage.tsx");
  const publicLayout = source("app/layout.tsx");

  assert.doesNotMatch(publicLayout, /<Shell|DemoSessionGuard/);
  assert.equal(
    /href=["']\/projects\?demo=1["']/.test(publicReview),
    false,
    "a public demo share exposes an internal workspace navigation target",
  );
});

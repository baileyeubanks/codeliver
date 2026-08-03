import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canPerformGovernance,
  createEnterpriseIdentityState,
} from "../components/auth/enterprise-model.ts";
import { resolveSafeReturnPath } from "../components/auth/auth-policy.ts";
import { resolveAuthHostContext } from "../components/auth/auth-context.ts";
import {
  buildProtectedReturnPath,
  buildSurfaceUrl,
  LEGACY_ADMIN_SURFACE_HOST,
  resolveHostSurface,
  resolveTrustedSurfaceRole,
  roleCanAccessSurface,
} from "../lib/auth/host-surface.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_HOST = "admin.contentco-op.com";
const CLIENT_HOST = "client.contentco-op.com";

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function sourceFiles(path: string): string[] {
  const root = resolve(repositoryRoot, path);
  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolutePath = resolve(root, entry.name);
    const repositoryPath = relative(repositoryRoot, absolutePath);

    if (entry.isDirectory()) {
      files.push(...sourceFiles(repositoryPath));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(repositoryPath);
    }
  }

  return files;
}

const runtimeSourceFiles = [
  "proxy.ts",
  ...sourceFiles("app"),
  ...sourceFiles("components"),
  ...sourceFiles("lib"),
];

const frontDoorSourceFiles = [...new Set(runtimeSourceFiles.filter((path) =>
  path === "proxy.ts" ||
  /(?:auth|access|front.?door|host|identity|membership|session|surface)/i.test(path),
))];

const frontDoorSource = frontDoorSourceFiles
  .map((path) => `\n/* ${path} */\n${source(path)}`)
  .join("\n");

test("admin and client hosts share one Content Co-op branded login", () => {
  const loginPages = sourceFiles("app")
    .filter((path) => /(?:^|\/)login\/page\.tsx$/.test(path))
    .sort();
  const loginPage = source("app/login/page.tsx");
  const authShell = source("components/auth/AuthShell.tsx");

  assert.deepEqual(loginPages, ["app/login/page.tsx"], "the product must keep one login page");
  assert.match(loginPage, /<AuthShell\b/);
  assert.match(authShell, /CoProductionBrand/);
  assert.match(authShell, /aria-label="Co‑VideoPro by Content Co-op sign in"/);
  assert.match(authShell, /<strong>Co‑VideoPro<\/strong>/);
  assert.match(authShell, /aria-label="Access readiness"/);
  assert.match(authShell, /Sign-in required/);
  assert.match(authShell, /Stays on this site/);
  assert.doesNotMatch(authShell, /Verified session required|Local paths only/);
  assert.doesNotMatch(frontDoorSource, /\/(?:admin|client)\/login\b/);

  assert.equal(resolveAuthHostContext(ADMIN_HOST).kind, "admin");
  assert.equal(resolveAuthHostContext(CLIENT_HOST).kind, "client");
  assert.equal(resolveAuthHostContext(LEGACY_ADMIN_SURFACE_HOST).kind, "admin");

  for (const obsoleteHost of [
    `studio.${ADMIN_HOST}`,
    "clients.contentco-op.com",
    "portal.contentco-op.com",
    "deliver.contentco-op.com",
  ]) {
    assert.equal(resolveAuthHostContext(obsoleteHost).kind, "workspace", obsoleteHost);
  }

  for (const host of [ADMIN_HOST, CLIENT_HOST, LEGACY_ADMIN_SURFACE_HOST]) {
    assert.equal(
      frontDoorSource.includes(host),
      true,
      `${host} is not bound to the shared branded front door`,
    );
  }
});

test("an email string cannot grant or preserve administrative authority", () => {
  const base = createEnterpriseIdentityState();
  const forgedOwnerEmail = {
    ...base,
    currentUserId: "user-alex",
    memberships: base.memberships.map((membership) =>
      membership.userId === "user-alex"
      ? { ...membership, email: "owner@example.com" }
        : membership,
    ),
  };
  const renamedOwnerEmail = {
    ...base,
    memberships: base.memberships.map((membership) =>
      membership.userId === base.currentUserId
        ? { ...membership, email: "owner-without-a-brand-domain@example.net" }
        : membership,
    ),
  };

  assert.equal(canPerformGovernance(forgedOwnerEmail, "organization.manage"), false);
  assert.equal(canPerformGovernance(forgedOwnerEmail, "policy.manage"), false);
  assert.equal(canPerformGovernance(renamedOwnerEmail, "organization.manage"), true);

  const emailEscalationPatterns = [
    /\b(?:ADMIN|OWNER|PRIVILEGED)(?:_SEED)?_EMAILS?\b/,
    /(?:user|session|membership)\??\.email\s*\.(?:endsWith|includes|startsWith)\s*\(/i,
    /(?:user|session|membership)\??\.email\s*={2,3}\s*["'`]/i,
    /["'`]@?contentco-op\.com["'`]\s*\.(?:includes|has)\s*\(/i,
  ];

  for (const pattern of emailEscalationPatterns) {
    assert.doesNotMatch(
      frontDoorSource,
      pattern,
      `front-door authority must not be inferred from an email string (${pattern})`,
    );
  }
});

test("return paths reject encoded auth loops, authority confusion, and control bytes", () => {
  assert.equal(
    resolveSafeReturnPath("/projects/ica?asset=cut-4&view=review#comments"),
    "/projects/ica?asset=cut-4&view=review#comments",
  );
  assert.equal(
    buildProtectedReturnPath("/projects/ica", "?asset=cut-4&view=review#comments"),
    "/projects/ica?asset=cut-4&view=review",
  );

  const unsafeTargets = [
    "https://attacker.example/session",
    "//attacker.example/session",
    "/\\attacker.example/session",
    "/login?next=/projects",
    "/signup?next=/projects",
    "/auth/callback?code=secret",
    "/%6cogin?next=/projects",
    "/%2f%2fattacker.example/session",
    "/%5c%5cattacker.example/session",
    "/projects%00/admin",
    "/projects%0d%0aSet-Cookie:test",
  ];

  assert.deepEqual(
    unsafeTargets.map((target) => resolveSafeReturnPath(target)),
    unsafeTargets.map(() => "/projects"),
    "the browser return-path resolver must fail closed",
  );
  assert.deepEqual(
    unsafeTargets.map((target) => buildProtectedReturnPath(target)),
    unsafeTargets.map(() => "/projects"),
    "the server return-path resolver must fail closed",
  );
});

test("authenticated host access requires trusted server claims", () => {
  const proxySource = source("proxy.ts");
  const authLookupIndex = proxySource.indexOf("await supabase.auth.getUser()");
  const successIndex = proxySource.indexOf("\n  return res;", authLookupIndex);

  assert.notEqual(authLookupIndex, -1, "could not locate the authenticated proxy branch");
  assert.notEqual(successIndex, -1, "could not bound the authenticated proxy branch");

  const authenticatedBranch = proxySource.slice(authLookupIndex, successIndex);
  assert.equal(
    resolveTrustedSurfaceRole({ app_metadata: { content_coop_role: "staff" } }),
    "staff",
  );
  assert.equal(
    resolveTrustedSurfaceRole({ app_metadata: { content_coop_role: "client" } }),
    "client",
  );
  assert.equal(resolveTrustedSurfaceRole({ app_metadata: { role: "admin" } }), null);
  assert.equal(
    resolveTrustedSurfaceRole({
      app_metadata: {},
      email: "admin@contentco-op.com",
      user_metadata: { role: "admin", is_staff: true },
    } as { app_metadata: unknown }),
    null,
  );
  assert.equal(
    resolveTrustedSurfaceRole({ app_metadata: { roles: ["client", "staff"] } }),
    null,
  );

  assert.match(
    authenticatedBranch,
    /resolveTrustedSurfaceRole\(user\)/,
    "surface authorization must consume server-controlled identity metadata",
  );
  assert.match(
    authenticatedBranch,
    /(?:membership|claim|role|capabilit|authoriz|access.?policy|surface.?access)/i,
    "authentication alone must not grant an admin or client surface",
  );
  assert.doesNotMatch(
    authenticatedBranch,
    /user\.(?:email|user_metadata)/,
    "the proxy must not turn email or user-editable metadata into authorization",
  );
});

test("protected admin and client requests route pending and mismatched identities safely", () => {
  const proxySource = source("proxy.ts");
  const publicMatcherIndex = proxySource.indexOf("function isPublicRoute");
  const publicMatcherEnd = proxySource.indexOf("\n}\n", publicMatcherIndex) + 2;
  const authLookupIndex = proxySource.indexOf("await supabase.auth.getUser()");
  const surfaceGuardIndex = proxySource.indexOf("if (hostSurface)", authLookupIndex);

  assert.notEqual(publicMatcherIndex, -1, "public-route boundary is missing");
  assert.ok(publicMatcherEnd > publicMatcherIndex, "could not bound the public-route matcher");
  assert.notEqual(authLookupIndex, -1, "authenticated proxy branch is missing");
  assert.ok(surfaceGuardIndex > authLookupIndex, "authenticated surface guard is missing");
  assert.equal(frontDoorSource.includes(ADMIN_HOST), true, `${ADMIN_HOST} has no surface policy`);
  assert.equal(frontDoorSource.includes(CLIENT_HOST), true, `${CLIENT_HOST} has no surface policy`);

  assert.equal(resolveHostSurface(ADMIN_HOST), "admin");
  assert.equal(resolveHostSurface(CLIENT_HOST), "client");
  assert.equal(resolveHostSurface(LEGACY_ADMIN_SURFACE_HOST), "admin");
  assert.equal(roleCanAccessSurface("staff", "admin"), true);
  assert.equal(roleCanAccessSurface("staff", "client"), false);
  assert.equal(roleCanAccessSurface("client", "client"), true);
  assert.equal(roleCanAccessSurface("client", "admin"), false);
  assert.equal(
    buildSurfaceUrl("client", "https://attacker.example/session").toString(),
    `https://${CLIENT_HOST}/projects`,
  );

  const publicMatcher = proxySource.slice(publicMatcherIndex, publicMatcherEnd);
  assert.match(publicMatcher, /PUBLIC_EXACT_ROUTES\.includes\(pathname\)/);
  assert.match(
    publicMatcher,
    /PUBLIC_ROUTE_PREFIXES\.some\(\(route\) => isPathAtOrBelow\(pathname, route\)\)/,
  );
  assert.doesNotMatch(publicMatcher, /pathname\.startsWith/);

  assert.match(proxySource, /if \(hostSurface\)[\s\S]*?resolveTrustedSurfaceRole\(user\)/);
  assert.match(
    proxySource,
    /if \(!role\) return pendingAccessResponse\(req, pathnameWithSanitizedQuery\)/,
  );
  assert.match(proxySource, /if \(!roleCanAccessSurface\(role, hostSurface\)\)/);
  assert.match(proxySource, /return surfaceMismatchResponse\(/);
  assert.match(proxySource, /code: "AUTHORIZATION_PENDING"/);
  assert.doesNotMatch(proxySource, /req\.method !== "GET" && req\.method !== "HEAD"/);
  assert.doesNotMatch(proxySource, /buildSurfaceUrl\(surfaceForRole\(role\)/);
});

test("the branded auth, cockpit, and public review shells retain mobile and desktop geometry", () => {
  const authStyles = source("components/auth/AuthShell.module.css");
  const shellStyles = source("components/Shell.module.css");
  const cockpitStyles = source("components/projects/ProjectCockpit.module.css");
  const publicReviewStyles = source("components/review/PublicReviewWorkspace.module.css");
  const authFormCap = authStyles.match(
    /\.formColumn\s*\{[\s\S]*?width:\s*min\(100%,\s*(\d+)px\)/,
  );

  assert.match(authStyles, /\.shell\s*\{[\s\S]*?min-height:\s*100svh/);
  assert.match(authStyles, /\.header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(authStyles, /\.accessStrip\s*\{[\s\S]*?display:\s*grid/);
  assert.match(authStyles, /\.accessItem\s*\{[\s\S]*?border-radius:\s*8px/);
  assert.ok(authFormCap, "auth form must have a stable responsive width cap");
  assert.ok(Number(authFormCap[1]) >= 400 && Number(authFormCap[1]) <= 480);
  assert.match(authStyles, /@media \(min-width:\s*761px\)[\s\S]*?grid-template-columns:\s*224px minmax\(180px, 1fr\) auto/);
  assert.match(authStyles, /@media \(max-width:\s*360px\)[\s\S]*?padding-inline:\s*12px/);

  assert.match(shellStyles, /@media \(max-width:\s*760px\)[\s\S]*?env\(safe-area-inset-bottom\)/);
  assert.match(cockpitStyles, /@media \(max-width:\s*900px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(cockpitStyles, /@media \(max-width:\s*900px\)[\s\S]*?\.shell :global\(\.cockpit-sidebar\)\s*\{\s*display:\s*none/);
  assert.match(publicReviewStyles, /@media \(min-width:\s*981px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(360px, 390px\)/);
  assert.match(publicReviewStyles, /@media \(min-width:\s*1440px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 410px/);
});

test("internal cockpit and public review remain separate navigation and authority boundaries", () => {
  const proxySource = source("proxy.ts");
  const dashboardLayout = source("app/(dashboard)/layout.tsx");
  const rootLayout = source("app/layout.tsx");
  const internalProjectPage = source("app/(dashboard)/projects/[id]/page.tsx");
  const internalProjectClient = source("components/projects/ProjectWorkspaceClient.tsx");
  const cockpit = source("components/projects/ProjectCockpit.tsx");
  const publicReviewPage = source("app/review/[token]/page.tsx");
  const publicReviewClient = source("components/review/PublicReviewPage.tsx");
  const publicReviewWorkspace = source("components/review/PublicReviewWorkspace.tsx");

  assert.match(dashboardLayout, /<DemoSessionGuard>/);
  assert.match(dashboardLayout, /<Shell>\{children\}<\/Shell>/);
  assert.doesNotMatch(rootLayout, /<Shell|DemoSessionGuard/);

  assert.match(internalProjectPage, /from "@\/components\/projects\/ProjectWorkspaceClient"/);
  assert.match(internalProjectPage, /notFound\(\)/);
  assert.match(internalProjectClient, /from "@\/components\/projects\/ProjectCockpit"/);
  assert.match(internalProjectClient, /<ProjectCockpit\b/);
  assert.doesNotMatch(cockpit, /PublicReviewWorkspace/);

  assert.match(
    publicReviewPage,
    /from "@\/components\/review\/PublicReviewPage"/,
  );
  assert.match(publicReviewPage, /notFound\(\)/);
  assert.match(
    publicReviewClient,
    /from "@\/components\/review\/PublicReviewWorkspace"/,
  );
  assert.doesNotMatch(publicReviewClient, /ProjectCockpit|from "@\/components\/Shell"/);
  assert.doesNotMatch(publicReviewWorkspace, /ProjectCockpit|useRouter|useParams|useSearchParams/);
  assert.doesNotMatch(publicReviewWorkspace, /href=["'`]\/(?:projects|dashboard|reviews)/);

  assert.match(proxySource, /"\/api\/review"/);
  assert.match(proxySource, /"\/review\/?"/);
  assert.ok(
    proxySource.indexOf("if (isPublicRoute(pathname))") < proxySource.indexOf("await supabase.auth.getUser()"),
    "public review must remain outside the authenticated cockpit gate",
  );
});

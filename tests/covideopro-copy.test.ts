import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const customerFacingFiles = [
  "app/layout.tsx",
  "components/assets/AssetUpload.tsx",
  "components/projects/ProjectCockpit.tsx",
  "components/Shell.tsx",
  "components/navigation/WorkspaceNavigation.tsx",
  "components/auth/IdentitySettings.tsx",
  "components/sharing/ShareModal.tsx",
  "lib/sharing/share-notifications.ts",
  "lib/notifications/adapters.ts",
  "lib/email.ts",
  "app/api/analytics/export/pdf/route.ts",
];

test("login twins share the locked engagement copy", () => {
  const login = readFileSync(resolve(repositoryRoot, "app/login/page.tsx"), "utf8");
  const shell = readFileSync(resolve(repositoryRoot, "components/auth/AuthShell.tsx"), "utf8");

  assert.match(login, /Open the cut that still needs a decision\./);
  assert.match(login, /Projects, review, and delivery stay here — with Content Co-op, not scattered across inboxes\./);
  assert.match(login, /Workspace access/);
  assert.match(login, /Work email/);
  assert.match(login, /Need an invite\?/);
  assert.match(login, /Request access/);
  assert.match(login, /\{loading \? "Signing in\.\.\." : demoMode \? "Open local workspace" : "Sign in"\}/);
  assert.doesNotMatch(login, /Account access/);
  assert.doesNotMatch(login, /Create an account/);

  assert.match(shell, /Content Co-op clients/);
  assert.match(shell, /Brief[\s\S]*cut[\s\S]*review[\s\S]*handoff/);
  assert.match(shell, /REVIEW/);
  assert.match(shell, /Approve the cut in one place/);
  assert.match(shell, /HANDOFF/);
  assert.match(shell, /Brief to delivery, same room/);
  assert.match(shell, /SECURE/);
  assert.match(shell, /Sign-in required · stays on this site/);
  assert.match(shell, /Private workspace · Content Co-op clients/);
  assert.doesNotMatch(shell, /label: "Portal"|label: "Session"|label: "Return"/);
});

test("customer-facing product copy consistently names Co‑VideoPro", () => {
  for (const relativePath of customerFacingFiles) {
    const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /Co-Deliver/, `${relativePath} exposes the retired product name`);
    assert.doesNotMatch(source, /Co-Production Pro/, `${relativePath} exposes the retired product name`);
  }

  const layoutSource = readFileSync(resolve(repositoryRoot, "app/layout.tsx"), "utf8");
  assert.match(layoutSource, /title: "Co‑VideoPro \| Content Co-op"/);
  assert.match(layoutSource, /All-in-one video production workspace/);
});

test("legacy technical identifiers remain stable while the new login theme is available", () => {
  const layoutModel = readFileSync(
    resolve(repositoryRoot, "components/cockpit/cockpit-layout.ts"),
    "utf8",
  );
  const loginTheme = readFileSync(
    resolve(repositoryRoot, "packages/ui/src/product-login-shell.tsx"),
    "utf8",
  );

  assert.match(layoutModel, /co-deliver\.cockpit-layout/);
  assert.match(loginTheme, /"Co‑VideoPro": \{/);
  assert.match(loginTheme, /displayLabel: "Co‑VideoPro"/);
});

test("public health probes omit topology while internal checks preserve product identity", () => {
  const healthIdentity = readFileSync(
    resolve(repositoryRoot, "app/api/health/_lib/identity.ts"),
    "utf8",
  );
  const healthRoute = readFileSync(resolve(repositoryRoot, "app/api/health/route.ts"), "utf8");
  const liveRoute = readFileSync(resolve(repositoryRoot, "app/api/health/live/route.ts"), "utf8");
  const readyRoute = readFileSync(resolve(repositoryRoot, "app/api/health/ready/route.ts"), "utf8");
  const checks = readFileSync(resolve(repositoryRoot, "app/api/health/_lib/checks.ts"), "utf8");

  assert.match(healthIdentity, /HEALTH_SERVICE_ID = "co-deliver"/);
  assert.match(healthIdentity, /HEALTH_PRODUCT_NAME = "Co‑VideoPro"/);
  assert.match(healthIdentity, /HEALTH_BRAND_NAME = "Content Co-op"/);
  assert.match(healthIdentity, /currentHealthPort/);
  assert.match(healthRoute, /\{ status: "ok" \}/);
  assert.doesNotMatch(healthRoute, /HEALTH_(?:SERVICE|PRODUCT|BRAND)|currentHealthPort/);
  assert.match(liveRoute, /\{ status: "ok" \}/);
  assert.doesNotMatch(liveRoute, /HEALTH_(?:SERVICE|PRODUCT|BRAND)|uptimeSeconds|release:/);
  assert.match(readyRoute, /product: snapshot\.product/);
  assert.match(readyRoute, /brand: snapshot\.brand/);
  assert.match(checks, /product: typeof HEALTH_PRODUCT_NAME/);
  assert.match(checks, /brand: typeof HEALTH_BRAND_NAME/);
});

test("the seeded workspace opens in the canonical bright shell", () => {
  const workspaceStore = readFileSync(
    resolve(repositoryRoot, "lib/demo/workspace-store.ts"),
    "utf8",
  );
  const settingsSource = readFileSync(
    resolve(repositoryRoot, "components/auth/IdentitySettings.tsx"),
    "utf8",
  );

  assert.match(workspaceStore, /appearance: \{\s*darkMode: false,/);
  // D14: dark mode is honestly unavailable (disabled toggle, no fake save)
  // rather than a no-op control claiming success.
  assert.match(settingsSource, /being redesigned/);
  assert.match(settingsSource, /disabled/);
});

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

test("customer-facing product copy consistently names Co-VideoPro", () => {
  for (const relativePath of customerFacingFiles) {
    const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /Co-Deliver/, `${relativePath} exposes the retired product name`);
    assert.doesNotMatch(source, /Co-Production Pro/, `${relativePath} exposes the retired product name`);
  }

  const layoutSource = readFileSync(resolve(repositoryRoot, "app/layout.tsx"), "utf8");
  assert.match(layoutSource, /title: "Co-VideoPro \| Content Co-op"/);
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
  assert.match(loginTheme, /"Co-VideoPro": \{/);
  assert.match(loginTheme, /displayLabel: "Co-VideoPro"/);
});

test("raw health links preserve machine ids while exposing product identity", () => {
  const healthIdentity = readFileSync(
    resolve(repositoryRoot, "app/api/health/_lib/identity.ts"),
    "utf8",
  );
  const healthRoute = readFileSync(resolve(repositoryRoot, "app/api/health/route.ts"), "utf8");
  const liveRoute = readFileSync(resolve(repositoryRoot, "app/api/health/live/route.ts"), "utf8");
  const readyRoute = readFileSync(resolve(repositoryRoot, "app/api/health/ready/route.ts"), "utf8");
  const checks = readFileSync(resolve(repositoryRoot, "app/api/health/_lib/checks.ts"), "utf8");

  assert.match(healthIdentity, /HEALTH_SERVICE_ID = "co-deliver"/);
  assert.match(healthIdentity, /HEALTH_PRODUCT_NAME = "Co-VideoPro"/);
  assert.match(healthIdentity, /HEALTH_BRAND_NAME = "Content Co-op"/);
  assert.match(healthIdentity, /currentHealthPort/);
  assert.match(healthRoute, /product: HEALTH_PRODUCT_NAME/);
  assert.match(healthRoute, /brand: HEALTH_BRAND_NAME/);
  assert.match(healthRoute, /port: currentHealthPort\(\)/);
  assert.match(liveRoute, /product: HEALTH_PRODUCT_NAME/);
  assert.match(liveRoute, /brand: HEALTH_BRAND_NAME/);
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
  assert.match(settingsSource, /review cockpit stays bright/);
});

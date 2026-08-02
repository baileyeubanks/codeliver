import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const brand = source("components/brand/CoProductionBrand.tsx");
const settings = source("components/auth/BrandSettings.tsx");
const identity = source("components/auth/IdentitySettings.tsx");
const shell = source("components/Shell.tsx");
const cockpit = source("components/projects/ProjectCockpit.tsx");
const store = source("lib/demo/workspace-store.ts");
const governance = source("packages/brand/src/governance.ts");

test("the exact supplied color lockup is the canonical product mark", () => {
  assert.match(brand, /CANONICAL_SOURCE = "\/brand\/co-videopro-color-supplied\.png"/);
  assert.match(brand, /width=\{7296\}/);
  assert.match(brand, /height=\{4096\}/);
  assert.match(brand, /source\?: string/);
  assert.match(governance, /BRAND_GOVERNANCE_SCHEMA_VERSION = 2/);
  assert.match(governance, /co-deliver\.brand-governance\.v2/);
});

test("company profile owns the logo, project cover, and portrait controls", () => {
  assert.match(settings, /title="Company profile"/);
  assert.match(settings, /Co-VideoPro color lockup/);
  assert.match(settings, /Co-VideoPro blue lockup/);
  assert.match(settings, /Project cover/);
  assert.match(settings, /Co-VideoPro blue production artwork/);
  assert.match(settings, /User profile photo/);
  assert.match(settings, /Bailey Eubanks portrait/);
  assert.match(identity, /name="avatarPath"/);
});

test("brand assets persist through workspace state and drive both shells", () => {
  assert.match(store, /avatarPath: "\/brand\/bailey-eubanks-profile\.jpg"/);
  assert.match(store, /coverPath: "\/brand\/co-videopro-project-cover\.jpg"/);
  assert.match(shell, /source=\{brandLogoPath\}/);
  assert.match(shell, /src=\{profileAvatarPath\}/);
  assert.match(cockpit, /source=\{brandLogoPath\}/);
  assert.match(cockpit, /workspace\.settings\.brand\.coverPath/);
  assert.match(cockpit, /src=\{profileAvatarPath\}/);
});

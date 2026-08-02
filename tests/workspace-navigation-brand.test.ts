import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("mobile workspace drawer sizes the supplied brand component instead of targeting raw image markup", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "components/navigation/WorkspaceNavigation.tsx"),
    "utf8",
  );
  const styles = readFileSync(
    resolve(repositoryRoot, "components/navigation/WorkspaceNavigation.module.css"),
    "utf8",
  );

  assert.match(source, /<CoProductionBrand className=\{styles\.drawerBrand\} priority \/>/);
  assert.match(styles, /\.drawerBrand\s*\{/);
  assert.match(styles, /--co-production-brand-width:\s*152px/);
  assert.doesNotMatch(styles, /\.drawerHeader\s*>\s*img/);
});

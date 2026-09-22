import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("profile edits have an explicit discard path without altering managed email", () => {
  const identity = source("components/auth/IdentitySettings.tsx");

  assert.match(identity, /const \[profileDirty, setProfileDirty\] = useState\(false\)/);
  assert.match(identity, /Profile changes discarded/);
  assert.match(identity, /profileFormRef\.current\?\.reset\(\)/);
  assert.match(identity, /Discard changes/);
  assert.match(identity, /value=\{email\}[\s\S]*?readOnly/);
});

test("settings labels every mobile section and gives each revocation control its session name", () => {
  const identity = source("components/auth/IdentitySettings.tsx");
  const styles = source("components/auth/SettingsPillar.module.css");

  assert.match(identity, /aria-label=\{`Revoke session for \$\{session\.device\}`\}/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*?\.nav \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.nav button:last-child \{[\s\S]*?grid-column: 1 \/ -1;/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const checkedFiles = [
  "components/sharing/ShareModal.tsx",
  "app/(dashboard)/library/page.tsx",
  "app/(dashboard)/projects/[id]/page.tsx",
];

test("core review, library, and share surfaces keep radii at the product token", () => {
  for (const relativePath of checkedFiles) {
    const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");

    assert.doesNotMatch(source, /rounded-xl/, `${relativePath} uses an oversized radius`);
    assert.doesNotMatch(
      source,
      /rounded-\[calc\(var\(--radius\)\+10px\)\]/,
      `${relativePath} inflates the product radius token`,
    );
  }

  const shareModal = readFileSync(
    resolve(repositoryRoot, "components/sharing/ShareModal.tsx"),
    "utf8",
  );
  assert.match(shareModal, /rounded-\[var\(--radius\)\] border border-\[var\(--border\)\]/);
});

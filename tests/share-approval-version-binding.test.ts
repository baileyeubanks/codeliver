import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shareService = readFileSync(
  resolve(repositoryRoot, "lib/sharing/share-service.ts"),
  "utf8",
);

test("approval-needed share links resolve their step on the requested media version", () => {
  const approvalResolver = shareService.match(
    /async function resolveApprovalRoute\([\s\S]*?\n}\n\nexport async function prepareShareManifest/,
  )?.[0];

  assert.ok(approvalResolver, "missing approval-route resolver");
  assert.match(approvalResolver, /versionId: string/);
  assert.match(approvalResolver, /item\.approvalId/);
  assert.match(approvalResolver, /\.eq\("id", item\.approvalId\)/);
  assert.match(approvalResolver, /\.eq\("asset_id", item\.assetId\)/);
  assert.match(approvalResolver, /\.eq\("version_id", versionId\)/);
  assert.match(approvalResolver, /\.eq\("status", "pending"\)/);
  assert.match(approvalResolver, /\.maybeSingle\(\)/);
  assert.match(
    shareService,
    /resolveApprovalRoute\(\{[\s\S]*?versionId: versionLookup\.version\.id,[\s\S]*?\}\)/,
  );
});

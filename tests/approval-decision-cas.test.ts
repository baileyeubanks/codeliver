import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(repositoryRoot, "lib/approval-decisions.ts"),
  "utf8",
);

test("approval decisions compare-and-set the exact pending asset step", () => {
  const updateStart = source.indexOf(
    'const { data: updatedApproval, error: updateError }',
  );
  const historyStart = source.indexOf(
    'await supabase.from("approval_history")',
  );
  assert.notEqual(updateStart, -1);
  assert.notEqual(historyStart, -1);
  const update = source.slice(updateStart, historyStart);

  assert.match(update, /\.eq\("id", approvalId\)/);
  assert.match(update, /\.eq\("asset_id", assetId\)/);
  assert.match(update, /\.eq\("status", "pending"\)/);
  assert.match(update, /\.maybeSingle\(\)/);
  assert.match(update, /if \(!updatedApproval\)/);
  assert.match(update, /statusCode:\s*409/);
  assert.doesNotMatch(update, /\.single\(\)/);
});

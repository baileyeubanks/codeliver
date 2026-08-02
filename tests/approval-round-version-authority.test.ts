import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

const migration = source(
  "supabase/migrations/20260716170000_version_scoped_approval_rounds.sql",
);
const assetApprovalRoute = source("app/api/assets/[id]/approvals/route.ts");
const workflowRoute = source("app/api/approvals/workflow/route.ts");
const publicReviewRoute = source("app/api/review/[token]/approvals/route.ts");
const approvalDecision = source("lib/approval-decisions.ts");
const versionRoute = source("app/api/assets/[id]/versions/route.ts");

test("approval rounds have an immutable, exact media-version authority key", () => {
  for (const schema of ["public", "co_production"]) {
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE ${schema}\\.approval_workflows\\s+ADD COLUMN IF NOT EXISTS version_id uuid;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE ${schema}\\.approvals\\s+ADD COLUMN IF NOT EXISTS version_id uuid;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `${schema === "public" ? "" : "co_production_"}approval_workflows_one_active_round_per_version_idx[\\s\\S]*?ON ${schema}\\.approval_workflows\\(asset_id, version_id\\)[\\s\\S]*?WHERE status = 'active';`,
      ),
    );
  }

  assert.match(
    migration,
    /FOREIGN KEY \(workflow_id, asset_id, version_id\)[\s\S]*?REFERENCES public\.approval_workflows\(id, asset_id, version_id\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(workflow_id, asset_id, version_id\)[\s\S]*?REFERENCES co_production\.approval_workflows\(id, asset_id, version_id\)/,
  );
  assert.match(migration, /CREATE TRIGGER approval_workflows_version_immutable/);
  assert.match(migration, /CREATE TRIGGER approvals_version_immutable/);
});

test("a new cut creates a fresh review round without rewriting prior evidence", () => {
  const managedFunction = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION co_production.create_asset_version"),
  );

  assert.match(managedFunction, /comments_retained_on_previous_version', true/);
  assert.doesNotMatch(managedFunction, /INSERT INTO co_production\.comments/);
  assert.doesNotMatch(
    managedFunction,
    /UPDATE co_production\.approvals[\s\S]*?SET[\s\S]*?status\s*=\s*'pending'/,
  );
  assert.match(
    managedFunction,
    /UPDATE co_production\.approval_workflows[\s\S]*?status = 'superseded'/,
  );
  assert.match(
    managedFunction,
    /INSERT INTO co_production\.approvals \([\s\S]*?version_id,[\s\S]*?workflow_id,[\s\S]*?\)[\s\S]*?created_version\.id,[\s\S]*?created_workflow_id/,
  );

  assert.match(versionRoute, /comments_retained_on_previous_version: true/);
  assert.match(versionRoute, /status: "superseded"/);
  assert.match(versionRoute, /version_id: data\.id/);
  assert.doesNotMatch(versionRoute, /\[from v\$\{previousVersion/);
});

test("every approval read and decision is pinned to one exact media version", () => {
  assert.match(assetApprovalRoute, /resolveAssetVersion\(/);
  assert.match(assetApprovalRoute, /\.eq\("version_id", versionLookup\.version\.id\)/);
  assert.match(assetApprovalRoute, /\.eq\("version_id", versionId\)/);
  assert.match(assetApprovalRoute, /versionId: versionLookup\.version\.id/);

  assert.match(workflowRoute, /resolveAssetVersion\(/);
  assert.match(workflowRoute, /\.eq\("version_id", versionLookup\.version\.id\)/);
  assert.match(workflowRoute, /\.eq\("version_id", workflow\.version_id\)/);
  assert.match(publicReviewRoute, /\.eq\("version_id", versionLookup\.version\.id\)/);
  assert.match(approvalDecision, /The media version being approved is required/);
  assert.match(approvalDecision, /\.eq\("version_id", versionId\)/);
  assert.match(approvalDecision, /This approval request is for an earlier version/);
});

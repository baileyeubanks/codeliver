import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260716190000_review_invite_approval_step_binding.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionSource(qualifiedName: string, terminator: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${qualifiedName}()`);
  assert.notEqual(start, -1, `missing ${qualifiedName}`);
  const end = migration.indexOf(terminator, start);
  assert.notEqual(end, -1, `unterminated ${qualifiedName}`);
  return migration.slice(start, end + terminator.length);
}

test("approval invites use an exact approval, asset, and version foreign key in both authorities", () => {
  for (const schema of ["public", "co_production"]) {
    const approvalTable = `${schema}.approvals`;
    const inviteTable = `${schema}.review_invites`;
    const uniqueName = schema === "public"
      ? "approvals_id_asset_version_key"
      : "co_production_approvals_id_asset_version_key";

    assert.match(
      migration,
      new RegExp(`ALTER TABLE ${approvalTable.replace(".", "\\.")}\\s+ADD CONSTRAINT ${uniqueName}\\s+UNIQUE \\(id, asset_id, version_id\\)`),
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE ${inviteTable.replace(".", "\\.")}\\s+ADD CONSTRAINT review_invites_approval_asset_version_fk\\s+FOREIGN KEY \\(approval_id, asset_id, version_id\\)\\s+REFERENCES ${approvalTable.replace(".", "\\.")}\\(id, asset_id, version_id\\)\\s+ON DELETE RESTRICT`),
    );
  }
});

test("public approval invites reject unbound, mismatched, or stale approval-step bindings", () => {
  const source = functionSource(
    "public.enforce_review_invite_approval_binding",
    "$public_review_invite_approval_binding$;",
  );

  assert.match(
    source,
    /OLD\.approval_id IS NOT NULL[\s\S]*NEW\.approval_id IS DISTINCT FROM OLD\.approval_id[\s\S]*approval_id is immutable/,
  );
  assert.match(
    source,
    /NEW\.approval_id IS NULL[\s\S]*NEW\.permissions = 'approve'[\s\S]*Approval links must bind to exactly one approval step/,
  );
  assert.match(
    source,
    /NEW\.permissions <> 'approve'[\s\S]*Only approval links may carry an approval step binding/,
  );
  assert.match(
    source,
    /approval\.id = NEW\.approval_id[\s\S]*approval\.asset_id = NEW\.asset_id[\s\S]*approval\.version_id = NEW\.version_id/,
  );
  assert.match(
    source,
    /NEW\.reviewer_email IS NULL[\s\S]*approval_email[\s\S]*NEW\.reviewer_email[\s\S]*Approval link recipient must match its exact approval assignee/,
  );
  assert.match(
    source,
    /TG_OP = 'INSERT' AND approval_status <> 'pending'[\s\S]*Approval links can only be created for pending approval steps/,
  );
  assert.match(
    migration,
    /BEFORE INSERT OR UPDATE OF approval_id, permissions, reviewer_email, asset_id, version_id[\s\S]*ON public\.review_invites[\s\S]*EXECUTE FUNCTION public\.enforce_review_invite_approval_binding\(\)/,
  );
});

test("co-production approval invite enforcement mirrors the public authority", () => {
  const source = functionSource(
    "co_production_private.enforce_review_invite_approval_binding",
    "$co_production_review_invite_approval_binding$;",
  );

  assert.match(source, /SET search_path = ''/);
  assert.match(source, /co_production\.review_invites\.approval_id is immutable/);
  assert.match(source, /Approval links must bind to exactly one approval step/);
  assert.match(source, /Only approval links may carry an approval step binding/);
  assert.match(
    source,
    /FROM co_production\.approvals AS approval[\s\S]*approval\.id = NEW\.approval_id[\s\S]*approval\.asset_id = NEW\.asset_id[\s\S]*approval\.version_id = NEW\.version_id/,
  );
  assert.match(source, /Approval link recipient must match its exact approval assignee/);
  assert.match(source, /Approval links can only be created for pending approval steps/);
  assert.match(
    migration,
    /BEFORE INSERT OR UPDATE OF approval_id, permissions, reviewer_email, asset_id, version_id[\s\S]*ON co_production\.review_invites[\s\S]*EXECUTE FUNCTION co_production_private\.enforce_review_invite_approval_binding\(\)/,
  );
});

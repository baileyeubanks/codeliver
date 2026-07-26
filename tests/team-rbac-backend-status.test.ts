import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

test("team role checks distinguish a backend outage from a genuine role denial", () => {
  const rbac = source("lib/middleware/rbac.ts");
  assert.match(rbac, /status:\s*503/);
  assert.match(rbac, /status:\s*403/);
  for (const path of ["app/api/projects/route.ts", "app/api/teams/route.ts", "app/api/teams/invites/route.ts", "app/api/teams/audit/route.ts", "app/api/webhooks/route.ts"]) {
    assert.match(source(path), /status === 503/, `${path} must map role lookup outages to 503`);
  }
});

test("team mutations confirm writes and rely on atomic owner membership", () => {
  const teams = source("app/api/teams/route.ts");
  const migration = source(
    "supabase/migrations/20260725113000_public_team_owner_membership.sql",
  );
  assert.match(teams, /member\.data\?\.role !== "owner"/);
  assert.doesNotMatch(teams, /Best-effort compensation/);
  assert.match(teams, /\.select\("user_id"\)/);
  assert.match(teams, /\.select\("id"\)/);
  assert.match(migration, /CREATE TRIGGER teams_seed_owner_membership/);
  assert.match(migration, /AFTER INSERT ON public\.teams/);
  assert.match(migration, /ON CONFLICT \(team_id, user_id\) DO UPDATE/);
});

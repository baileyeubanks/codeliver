import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

test("project notifications use canonical team-or-personal tenant authority", () => {
  const routes = [
    "app/api/approvals/notify/route.ts",
    "app/api/assets/[id]/approvals/route.ts",
    "app/api/assets/[id]/comments/route.ts",
    "app/api/review/[token]/comments/route.ts",
  ];

  for (const route of routes) {
    const body = source(route);
    assert.match(body, /projectTenantAuthority\(/, route);
    assert.doesNotMatch(body, /tenantId:\s*project(?:\.data)?\.owner_id/, route);
  }

  assert.match(
    source("app/api/teams/invites/route.ts"),
    /tenantId:\s*tenantAuthorityKey\("team",\s*team_id\)/,
  );
  assert.match(
    source("app/api/notifications/send/route.ts"),
    /tenantAuthorityKey\("personal",\s*user\.id\)/,
  );
});

test("share preparation replaces actor scope with the asset workspace authority", () => {
  const body = source("lib/sharing/share-service.ts");

  assert.match(body, /item\.asset\.tenant_authority\.key/);
  assert.match(body, /tenantKeys\.size\s*!==\s*1/);
  assert.match(body, /tenantId,\s*items:\s*preparedItems\.map/);
  assert.match(body, /policy:\s*\{\s*\.\.\.item\.policy,\s*tenantId\s*\}/);
});

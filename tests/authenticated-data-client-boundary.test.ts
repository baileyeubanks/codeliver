import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const projectCollection = source("../app/api/projects/route.ts");
const projectDetail = source("../app/api/projects/[id]/route.ts");
const assetDetail = source("../app/api/assets/[id]/route.ts");
const teamAuthority = source("../lib/middleware/rbac.ts");

test("canonical project and asset routes carry the authenticated RLS client", () => {
  for (const route of [projectCollection, projectDetail, assetDetail]) {
    assert.match(route, /requireAuthWithClient/);
    assert.doesNotMatch(route, /from ["']@\/lib\/supabase["']/);
    assert.doesNotMatch(route, /getSupabase\s*\(/);
  }

  assert.match(
    projectDetail,
    /getProjectAccess\(id, user\.id, ["'](?:viewer|producer|owner)["'], supabase\)/,
  );
  assert.match(
    assetDetail,
    /getAssetAccess\(id, user\.id, ["'](?:viewer|editor|admin)["'], supabase\)/,
  );
});

test("team authorization can use the same authenticated RLS client", () => {
  assert.match(
    teamAuthority,
    /requireTeamRole\([\s\S]*client\?: DataClient/,
  );
  assert.match(teamAuthority, /getTeamRole\(teamId, userId, client\)/);
  assert.match(projectCollection, /requireTeamRole\([\s\S]*supabase,/);
});

test("asset moves verify the destination folder belongs to the same project", () => {
  assert.match(assetDetail, /\.from\(["']folders["']\)/);
  assert.match(assetDetail, /\.eq\(["']project_id["'], assetAccess\.data\.project_id\)/);
  assert.match(assetDetail, /folder_id is invalid/);
});

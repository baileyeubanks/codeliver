import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function functionBody(file: string, name: string): string {
  const start = file.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} is exported`);
  const next = file.indexOf("\nexport async function ", start + 1);
  return file.slice(start, next === -1 ? undefined : next);
}

test("recipient invite acceptance grants membership on service authority after the email bind", () => {
  const route = source("app/api/teams/invites/route.ts");
  const projectsPage = source("lib/api/projects-collection.ts");
  const get = functionBody(route, "GET");
  const post = functionBody(route, "POST");
  const patch = functionBody(route, "PATCH");
  const del = functionBody(route, "DELETE");

  assert.match(route, /function recipientInviteAuthority\(\)/);
  assert.match(route, /return getSupabase\(\)/);
  assert.match(
    get,
    /if \(token\) \{[\s\S]*?recipientInviteAuthority\(\)\.from\("team_invites"\)/,
  );
  assert.match(get, /requireTeamRole\(teamId, user\.id, "admin"\)/);
  assert.match(
    patch,
    /const authority = recipientInviteAuthority\(\);[\s\S]*?const lookup = token \? opaqueTokenLookup\(token\)/,
  );
  assert.match(
    patch,
    /invite\.email\.toLowerCase\(\) !== user\.email\.toLowerCase\(\)[\s\S]*?authority\.from\("team_members"\)\.insert\(\{ team_id: invite\.team_id, user_id: user\.id, role: invite\.role/,
  );
  assert.match(
    patch,
    /authority\.from\("team_invites"\)\.update\(\{ status: action === "accept" \? "accepted" : "declined" \}\)/,
  );
  assert.doesNotMatch(post, /recipientInviteAuthority\(/);
  assert.doesNotMatch(del, /recipientInviteAuthority\(/);
  assert.match(projectsPage, /request\("\/api\/projects"/);
  assert.match(projectsPage, /request\("\/api\/assets"/);
});

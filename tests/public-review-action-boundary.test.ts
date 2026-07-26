import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("all public reviewer mutations bind admitted authority and rate before bounded body parsing", () => {
  for (const [path, action] of [
    ["app/api/review/[token]/comments/route.ts", "comment"],
    ["app/api/review/[token]/approvals/route.ts", "approval"],
    ["app/api/review/[token]/edit-decisions/route.ts", "edit_decision"],
  ] as const) {
    const route = source(path);
    const mutationStart = Math.max(
      route.indexOf("async function post"),
      route.indexOf("async function patch"),
    );
    const mutation = route.slice(mutationStart);
    const boundaryAt = mutation.indexOf("validateReviewMutationRequest");
    const authorityAt = mutation.indexOf("authorizeAdmittedReviewInvite");
    const rateAt = mutation.indexOf("reserveReviewActionRate");
    const bodyAt = mutation.indexOf("readReviewJsonObject");

    assert.notEqual(boundaryAt, -1, path);
    assert.notEqual(authorityAt, -1, path);
    assert.notEqual(rateAt, -1, path);
    assert.notEqual(bodyAt, -1, path);
    assert.equal(boundaryAt < authorityAt, true, path);
    assert.equal(authorityAt < rateAt, true, path);
    assert.equal(rateAt < bodyAt, true, path);
    assert.match(route, new RegExp(`action:\\s*"${action}"`), path);
    assert.match(route, /"Set-Cookie": authority\.setCookie/, path);
    assert.doesNotMatch(route, /getReviewInviteByToken/, path);
    assert.doesNotMatch(route, /req\.json\(\)/, path);
  }
});

test("public edit-decision reads use admission and never return the raw version record", () => {
  const route = source(
    "app/api/review/[token]/edit-decisions/route.ts",
  );
  assert.match(route, /validateReviewReadRequest/);
  assert.match(route, /authorizeAdmittedReviewInvite/);
  assert.doesNotMatch(route, /version:\s*versionLookup\.version/);
  assert.doesNotMatch(
    route,
    /notes:\s*versionLookup\.version\.notes|uploaded_by:\s*versionLookup\.version\.uploaded_by/,
  );
});

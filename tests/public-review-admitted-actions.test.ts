import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

const actionRoutes = [
  {
    path: "app/api/review/[token]/comments/route.ts",
    action: "comment",
  },
  {
    path: "app/api/review/[token]/approvals/route.ts",
    action: "approval",
  },
  {
    path: "app/api/review/[token]/edit-decisions/route.ts",
    action: "edit_decision",
  },
] as const;

test("real public-review mutations require an existing exact admission and action throttle", () => {
  for (const { path, action } of actionRoutes) {
    const route = source(path);
    assert.match(route, /authorizeAdmittedReviewInvite/);
    assert.match(route, /reserveReviewActionRate/);
    assert.match(route, /validateReviewMutationRequest/);
    assert.match(route, /readReviewJsonObject/);
    assert.match(route, new RegExp(`action:\\s*"${action}"`));
    assert.match(route, /"Set-Cookie": authority\.setCookie/);
    assert.doesNotMatch(route, /\bgetReviewInviteByToken\b/);
  }
});

test("admitted edit-decision reads return an explicit external projection, never the internal version record", () => {
  const route = source(
    "app/api/review/[token]/edit-decisions/route.ts",
  );
  assert.match(route, /validateReviewReadRequest/);
  assert.match(route, /authorizeAdmittedReviewInvite/);
  assert.match(route, /projectExternalReviewVersion/);
  assert.doesNotMatch(
    route,
    /version:\s*versionLookup\.version\b/,
  );
});

test("legacy sharing watermark helper is a no-provider-URL tombstone", () => {
  const route = source("app/api/sharing/watermark/route.ts");
  assert.match(route, /WATERMARK_ROUTE_RETIRED/);
  assert.match(route, /410/);
  assert.doesNotMatch(route, /getReviewInviteByToken|resolveAssetVersion|file_url/);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = resolve(
  repositoryRoot,
  "app/api/review/media/[admissionId]/route.ts",
);

test("public review media has a dedicated token-free admission route with GET and HEAD", () => {
  assert.equal(existsSync(routePath), true);
  const route = readFileSync(routePath, "utf8");

  assert.match(route, /authorizeReviewMedia/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function HEAD/);
  assert.doesNotMatch(route, /requireAuth|getAssetAccess/);
  assert.doesNotMatch(route, /\[token\]|file_url|\/api\/media\/stream/);
});

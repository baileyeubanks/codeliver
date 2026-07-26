import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routes = [
  "app/api/teams/route.ts",
  "app/api/teams/invites/route.ts",
  "app/api/teams/audit/route.ts",
  "app/api/notifications/route.ts",
  "app/api/notifications/preferences/route.ts",
  "app/api/notifications/send/route.ts",
];

test("team and notification API routes keep backend failures non-cacheable and opaque", () => {
  for (const path of routes) {
    const source = readFileSync(resolve(root, path), "utf8");
    assert.match(source, /apiError\(/, `${path} must return structured client errors`);
    assert.match(source, /backendUnavailable\(/, `${path} must surface backend outages as 503`);
    assert.match(source, /apiJson\(/, `${path} must emit direct no-store JSON responses`);
    assert.doesNotMatch(source, /NextResponse\.json/, `${path} must not bypass no-store response helpers`);
    assert.doesNotMatch(source, /error:\s*\w+\.message/, `${path} must not disclose provider messages`);
  }
});

test("team mutations authenticate before parsing request bodies", () => {
  for (const path of ["app/api/teams/route.ts", "app/api/teams/invites/route.ts"]) {
    const source = readFileSync(resolve(root, path), "utf8");
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const start = source.indexOf(`export async function ${method}`);
      const body = Math.max(source.indexOf("bodyOf(request)", start), source.indexOf("parseBody(request)", start));
      const session = source.indexOf("const session = await getSession()", start);
      assert.ok(start >= 0 && session >= start && body > session, `${path} ${method} must authenticate before body parsing`);
    }
  }
});

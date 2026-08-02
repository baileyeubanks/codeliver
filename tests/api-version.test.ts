import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// G2 — the version endpoint must always answer with a sha field, defaulting to
// "unknown" when no build-time SHA was injected, and never crash.
// Follows the repo convention: stub next/server via registerHooks (see
// tests/api-backend-contract.test.ts) because bare-node ESM cannot resolve
// Next's package exports under --experimental-strip-types.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const nextServerStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const NextResponse = {
    json(body, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify(body), { ...init, headers });
    },
  };
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve(nextServerStubUrl, context);
    return nextResolve(specifier, context);
  },
});

const routeUrl = pathToFileURL(
  resolve(repositoryRoot, "app/api/version/route.ts"),
).href;

test("GET /api/version returns a sha field", async () => {
  const { GET } = await import(routeUrl);
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.sha, "string");
  assert.ok(body.sha.length > 0, "sha must be a non-empty string");
  // CCO_GOAL §4 DECIDED #3 + LONG_HORIZON Phase 02 exit spec:
  // { sha, builtAt, product: "Co-VideoPro" } — casing is part of the gate.
  assert.equal(body.product, "Co-VideoPro");
  assert.equal(typeof body.builtAt, "string");
  assert.ok(body.builtAt.length > 0, "builtAt must be a non-empty string");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("GET /api/version sha is 'unknown' or a git-shaped SHA", async () => {
  const { GET } = await import(routeUrl);
  const res = await GET();
  const body = await res.json();
  assert.ok(
    body.sha === "unknown" || /^[0-9a-f]{7,40}$/i.test(body.sha),
    `unexpected sha shape: ${body.sha}`,
  );
});

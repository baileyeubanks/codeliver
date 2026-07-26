import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

function moduleUrl(path: string): string {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

function poisonRequest(): never {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("retired upload route touched the request");
      },
    },
  ) as never;
}

const retiredPayload = {
  error: "This legacy upload endpoint is retired. Use the canonical resumable upload endpoint.",
  code: "LEGACY_UPLOAD_RETIRED",
  canonicalUploadUrl: "/api/upload/tus",
};

test("legacy media upload creation is a bodyless tombstone for every caller", async () => {
  for (const path of [
    "app/api/media/tus/route.ts",
    "app/api/media/upload/route.ts",
  ]) {
    const { POST } = await import(moduleUrl(path));
    const response = await POST(poisonRequest());
    assert.equal(response.status, 410, path);
    assert.deepEqual(await response.json(), retiredPayload, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal(response.headers.get("link"), "</api/upload/tus>; rel=\"successor-version\"", path);
  }
});

test("legacy resumable item methods cannot append, finalize, or reveal inherited uploads", async () => {
  const route = await import(moduleUrl("app/api/media/tus/[uploadId]/route.ts"));
  const poisonedContext = new Proxy(
    {},
    {
      get() {
        throw new Error("retired upload route touched route params");
      },
    },
  ) as never;

  for (const method of ["PATCH", "DELETE"] as const) {
    const response = await route[method](poisonRequest(), poisonedContext);
    assert.equal(response.status, 410, method);
    assert.deepEqual(await response.json(), retiredPayload, method);
  }

  const head = await route.HEAD(poisonRequest(), poisonedContext);
  assert.equal(head.status, 410);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("x-codeliver-error-code"), "LEGACY_UPLOAD_RETIRED");
  assert.equal(head.headers.get("link"), "</api/upload/tus>; rel=\"successor-version\"");
});

test("legacy route and store source cannot reach catalog or byte finalization", () => {
  const files = [
    "app/api/media/tus/route.ts",
    "app/api/media/tus/[uploadId]/route.ts",
    "app/api/media/upload/route.ts",
    "lib/tus/store.ts",
  ];
  const source = files
    .map((path) => readFileSync(resolve(repositoryRoot, path), "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /\.from\(["']assets["']\)/);
  assert.doesNotMatch(source, /enqueueTranscode|processJob/);
  assert.doesNotMatch(source, /renameSync\s*\(/);
  assert.doesNotMatch(source, /finalizeUpload\s*\(/);
  assert.doesNotMatch(source, /createUpload\s*\(/);
  assert.match(source, /LEGACY_UPLOAD_RETIRED/);
  assert.match(source, /\/api\/upload\/tus/);
});

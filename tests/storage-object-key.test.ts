import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeObjectKey,
  buildVersionedObjectKey,
  sanitizeObjectFilename,
} from "../lib/storage/object-key.ts";

test("versioned keys isolate tenants and never reuse a version path", () => {
  const base = {
    projectId: "project-1",
    objectId: "object-1",
    filename: "client cut.mov",
  };
  const tenantA = buildVersionedObjectKey({ ...base, tenantId: "tenant-a", version: 1 });
  const tenantB = buildVersionedObjectKey({ ...base, tenantId: "tenant-b", version: 1 });
  const versionTwo = buildVersionedObjectKey({
    ...base,
    tenantId: "tenant-a",
    version: 2,
  });

  assert.notEqual(tenantA, tenantB);
  assert.notEqual(tenantA, versionTwo);
  assert.match(tenantA, /\/v00000001\//);
  assert.match(versionTwo, /\/v00000002\//);
});

test("object filenames discard path components and unsafe characters", () => {
  const safe = sanitizeObjectFilename("../../Final Cut (approved) \\ 01.MOV");
  assert.doesNotMatch(safe, /[\\/]/);
  assert.match(safe, /^[A-Za-z0-9._-]+\.mov$/);
});

test("object-key validation rejects traversal and ambiguous encodings", () => {
  for (const key of [
    "../outside.mov",
    "tenant/../../outside.mov",
    "/absolute.mov",
    "tenant\\outside.mov",
    "tenant/%2e%2e/outside.mov",
    "tenant//outside.mov",
  ]) {
    assert.throws(() => assertSafeObjectKey(key));
  }
});

test("large key sets remain deterministic and collision-free", () => {
  const keys = new Set<string>();
  for (let version = 1; version <= 5_000; version += 1) {
    keys.add(
      buildVersionedObjectKey({
        tenantId: "tenant-scale",
        projectId: "project-scale",
        objectId: "asset-scale",
        version,
        filename: "master.mov",
      })
    );
  }
  assert.equal(keys.size, 5_000);
});

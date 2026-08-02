import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { StorageAdapter } from "../lib/storage/contracts.ts";
import { buildVersionedObjectKey } from "../lib/storage/object-key.ts";
import { createStorageRuntime } from "../lib/storage/runtime.ts";

function localAdapter(root: string): StorageAdapter {
  return createStorageRuntime({
    CODELIVER_STORAGE_PROVIDER: "local",
    CODELIVER_LOCAL_STORAGE_ROOT: root,
    CODELIVER_STORAGE_WRITE_ENABLED: "1",
    CODELIVER_STORAGE_RESERVED_BYTES: "0",
  }).adapter;
}

async function* chunks(...values: string[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield Buffer.from(value);
}

test("multipart ingest verifies checksums and commits without overwrite", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-adapter-"));
  const adapter = localAdapter(root);
  const payload = "enterprise-ingest";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const key = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: "object-a",
    version: 1,
    filename: "master.mov",
  });

  try {
    const handle = await adapter.beginMultipart(randomUUID());
    const part = await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks("enterprise-", "ingest"),
      maxBytes: 1024,
      expectedSize: Buffer.byteLength(payload),
      expectedPartSha256: checksum,
    });
    assert.equal(part.offset, Buffer.byteLength(payload));

    const inspection = await adapter.inspectMultipart(handle);
    assert.deepEqual(inspection, {
      size: Buffer.byteLength(payload),
      sha256: checksum,
    });
    const receipt = await adapter.commitMultipart({
      handle,
      objectKey: key,
      ...inspection,
    });
    assert.equal(receipt.sha256, checksum);
    assert.equal(readFileSync(join(root, key), "utf8"), payload);

    const duplicate = await adapter.beginMultipart(randomUUID());
    await adapter.appendMultipart({
      handle: duplicate,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: Buffer.byteLength(payload),
    });
    await assert.rejects(
      () =>
        adapter.commitMultipart({
          handle: duplicate,
          objectKey: key,
          size: Buffer.byteLength(payload),
          sha256: checksum,
        }),
      /overwrite refused/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checksum failures roll the staged object back to its prior offset", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-checksum-"));
  const adapter = localAdapter(root);
  try {
    const handle = await adapter.beginMultipart(randomUUID());
    await assert.rejects(
      () =>
        adapter.appendMultipart({
          handle,
          offset: 0,
          chunks: chunks("corrupted"),
          maxBytes: 1024,
          expectedSize: 9,
          expectedPartSha256: "0".repeat(64),
        }),
      /checksum did not match/
    );
    const inspection = await adapter.inspectMultipart(handle);
    assert.equal(inspection.size, 0);
    assert.equal(
      inspection.sha256,
      createHash("sha256").update(Buffer.alloc(0)).digest("hex")
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("destination symlinks cannot redirect placement outside the root", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-symlink-root-"));
  const outside = mkdtempSync(join(tmpdir(), "codeliver-symlink-outside-"));
  const adapter = localAdapter(root);
  try {
    const handle = await adapter.beginMultipart(randomUUID());
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks("safe"),
      maxBytes: 1024,
      expectedSize: 4,
    });
    symlinkSync(outside, join(root, "tenants"));
    await assert.rejects(
      () =>
        adapter.commitMultipart({
          handle,
          objectKey: "tenants/t-a/projects/p-a/objects/o-a/v00000001/file.mov",
          size: 4,
          sha256: createHash("sha256").update("safe").digest("hex"),
        }),
      /symlink/
    );
    assert.equal(existsSync(join(outside, "t-a")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("multipart reconciliation truncates bytes beyond durable session offset", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-reconcile-offset-"));
  const adapter = localAdapter(root);
  try {
    const handle = await adapter.beginMultipart(randomUUID());
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks("payload"),
      maxBytes: 1024,
      expectedSize: 7,
    });
    const reconciliation = await adapter.reconcileMultipart(handle, 3);
    assert.deepEqual(reconciliation, {
      action: "rolled-back",
      committedOffset: 3,
      observedOffset: 7,
    });
    assert.equal((await adapter.inspectMultipart(handle)).size, 3);
    await assert.rejects(
      () => adapter.reconcileMultipart(handle, 4),
      /behind durable session state/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed placement can be reconciled after staging receipt loss", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-reconcile-commit-"));
  const adapter = localAdapter(root);
  const payload = "payload";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });
    await adapter.commitMultipart({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });

    const reconciled = await adapter.reconcileMultipartCommit({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });
    assert.equal(reconciled.action, "committed");
    assert.equal(reconciled.receipt?.sha256, checksum);
    assert.deepEqual(await adapter.inspectStoredObject(objectKey), {
      size: payload.length,
      sha256: checksum,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

async function readStreamText(
  stream: AsyncIterable<Uint8Array | string>
): Promise<string> {
  const received: Buffer[] = [];
  for await (const chunk of stream) received.push(Buffer.from(chunk));
  return Buffer.concat(received).toString("utf8");
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

test("multipart reconciliation reads an unchanged sealed staging object without write authority", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-reconcile-sealed-"));
  const adapter = localAdapter(root);
  const handle = await adapter.beginMultipart(randomUUID());
  const stagingPath = join(
    root,
    ".codeliver-ingest",
    "staging",
    handle.opaqueId,
  );

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks("payload"),
      maxBytes: 1024,
      expectedSize: 7,
    });
    chmodSync(stagingPath, 0o400);

    assert.deepEqual(await adapter.reconcileMultipart(handle, 7), {
      action: "unchanged",
      committedOffset: 7,
      observedOffset: 7,
    });
    assert.equal(statSync(stagingPath).mode & 0o222, 0);
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

test("stored-object reads use one receipt-bound handle for an inclusive byte range", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-range-read-"));
  const adapter = localAdapter(root);
  const payload = "0123456789";
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
    const receipt = await adapter.commitMultipart({
      handle,
      objectKey,
      size: payload.length,
      sha256: createHash("sha256").update(payload).digest("hex"),
    });
    assert.match(receipt.providerVersionId ?? "", /^fs-v1:[0-9a-f]{64}$/);

    const stream = await adapter.openStoredObjectReadStream(
      objectKey,
      { start: 2, end: 5 },
      {
        size: receipt.size,
        providerVersionId: receipt.providerVersionId!,
      },
    );
    const received: Buffer[] = [];
    for await (const chunk of stream) received.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(received).toString("utf8"), "2345");

    chmodSync(join(root, objectKey), 0o600);
    writeFileSync(join(root, objectKey), "abcdefghij");
    chmodSync(join(root, objectKey), 0o400);
    await assert.rejects(
      () =>
        adapter.openStoredObjectReadStream(
          objectKey,
          { start: 2, end: 5 },
          {
            size: receipt.size,
            providerVersionId: receipt.providerVersionId!,
          },
        ),
      /identity/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed immutable placement rolls back the destination and preserves a retryable staging object", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-placement-rollback-"));
  const adapter = localAdapter(root);
  const payload = "verified-payload";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const stagingPath = join(
    root,
    ".codeliver-ingest",
    "staging",
    `${handle.uploadId}.part`,
  );
  const objectPath = join(root, objectKey);

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });

    await assert.rejects(
      () =>
        adapter.commitMultipart({
          handle,
          objectKey,
          size: payload.length,
          sha256: "0".repeat(64),
        }),
      /durable placement intent/i,
    );
    assert.equal(existsSync(objectPath), false);
    assert.equal(existsSync(stagingPath), true);
    assert.equal(statSync(stagingPath).mode & 0o222, 0);

    const receipt = await adapter.commitMultipart({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });
    assert.equal(receipt.sha256, checksum);
    assert.equal(readFileSync(objectPath, "utf8"), payload);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reconciliation completes an interrupted immutable snapshot placement", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-placement-recovery-"));
  const adapter = localAdapter(root);
  const payload = "recovered-payload";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const stagingPath = join(
    root,
    ".codeliver-ingest",
    "staging",
    `${handle.uploadId}.part`,
  );
  const objectPath = join(root, objectKey);

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });
    mkdirSync(dirname(objectPath), { recursive: true });
    writeFileSync(objectPath, payload, { mode: 0o400 });
    chmodSync(objectPath, 0o400);
    assert.notEqual(statSync(objectPath).ino, statSync(stagingPath).ino);

    const reconciled = await adapter.reconcileMultipartCommit({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });

    assert.equal(reconciled.action, "staging-cleaned");
    assert.ok(reconciled.receipt);
    assert.equal(reconciled.receipt.sha256, checksum);
    assert.equal(existsSync(stagingPath), false);
    assert.equal(statSync(objectPath).nlink, 1);
    assert.equal(statSync(objectPath).mode & 0o222, 0);
    assert.equal(readFileSync(objectPath, "utf8"), payload);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reconciliation rejects a legacy staging hard-link alias", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-alias-recovery-"));
  const adapter = localAdapter(root);
  const payload = "legacy-hard-link";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const stagingPath = join(
    root,
    ".codeliver-ingest",
    "staging",
    `${handle.uploadId}.part`,
  );
  const objectPath = join(root, objectKey);

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });
    mkdirSync(dirname(objectPath), { recursive: true });
    linkSync(stagingPath, objectPath);
    chmodSync(stagingPath, 0o400);
    assert.equal(statSync(objectPath).ino, statSync(stagingPath).ino);

    await assert.rejects(
      () =>
        adapter.reconcileMultipartCommit({
          handle,
          objectKey,
          size: payload.length,
          sha256: checksum,
        }),
      /alias|write authority|separate inode/i,
      "a hard-linked staging inode can retain an inherited writable descriptor",
    );
    assert.equal(existsSync(stagingPath), true);
    assert.equal(existsSync(objectPath), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reconciliation removes a deterministic placement alias before issuing a receipt", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-placement-alias-"));
  const adapter = localAdapter(root);
  const payload = "placement-alias";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const stagingPath = join(
    root,
    ".codeliver-ingest",
    "staging",
    handle.opaqueId,
  );
  const objectPath = join(root, objectKey);
  const placementPath = join(
    dirname(objectPath),
    `.codeliver-commit-${handle.uploadId}.tmp`,
  );

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });
    mkdirSync(dirname(objectPath), { recursive: true });
    writeFileSync(placementPath, payload, { mode: 0o400 });
    chmodSync(placementPath, 0o400);
    linkSync(placementPath, objectPath);
    assert.equal(statSync(objectPath).nlink, 2);

    const reconciled = await adapter.reconcileMultipartCommit({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });

    assert.equal(reconciled.action, "staging-cleaned");
    assert.ok(reconciled.receipt);
    assert.equal(existsSync(placementPath), false);
    assert.equal(existsSync(stagingPath), false);
    assert.equal(statSync(objectPath).nlink, 1);

    const repeated = await adapter.reconcileMultipartCommit({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });
    assert.equal(
      repeated.receipt?.providerVersionId,
      reconciled.receipt.providerVersionId,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reconciliation removes an unlinked placement orphan before retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-placement-orphan-"));
  const adapter = localAdapter(root);
  const payload = "placement-orphan";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const objectPath = join(root, objectKey);
  const placementPath = join(
    dirname(objectPath),
    `.codeliver-commit-${handle.uploadId}.tmp`,
  );

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });
    mkdirSync(dirname(objectPath), { recursive: true });
    writeFileSync(placementPath, payload, { mode: 0o400 });
    chmodSync(placementPath, 0o400);

    const reconciled = await adapter.reconcileMultipartCommit({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });
    assert.deepEqual(reconciled, {
      action: "not-committed",
      receipt: null,
    });
    assert.equal(existsSync(placementPath), false);

    const receipt = await adapter.commitMultipart({
      handle,
      objectKey,
      size: payload.length,
      sha256: checksum,
    });
    assert.equal(receipt.sha256, checksum);
    assert.equal(existsSync(placementPath), false);
    assert.equal(statSync(objectPath).nlink, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit preflights capacity for the full immutable placement copy", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-placement-capacity-"));
  const adapter = localAdapter(root);
  const payload = "capacity-check";
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

    await assert.rejects(
      () =>
        adapter.commitMultipart({
          handle,
          objectKey,
          size: Number.MAX_SAFE_INTEGER,
          sha256: createHash("sha256").update(payload).digest("hex"),
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "STORAGE_CAPACITY",
      "the copy must fail before placement when a full additional object cannot fit",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed objects are immutable before a validated read stream is consumed", async (t) => {
  if (process.platform === "win32" || process.getuid?.() === 0) {
    t.skip("mode-bit overwrite enforcement requires an unprivileged POSIX process");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "codeliver-immutable-read-"));
  const adapter = localAdapter(root);
  const payload = "original-bytes";
  const replacement = "replaced-bytes";
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const objectPath = join(root, objectKey);

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });
    const receipt = await adapter.commitMultipart({
      handle,
      objectKey,
      size: payload.length,
      sha256: createHash("sha256").update(payload).digest("hex"),
    });
    const committedMode = statSync(objectPath).mode & 0o777;
    const stream = await adapter.openStoredObjectReadStream(
      objectKey,
      undefined,
      {
        size: receipt.size,
        providerVersionId: receipt.providerVersionId!,
      },
    );

    let overwriteError: unknown;
    try {
      writeFileSync(objectPath, replacement);
    } catch (error) {
      overwriteError = error;
    }

    assert.equal(
      await readStreamText(stream),
      payload,
      "bytes cannot change after receipt validation and before stream consumption",
    );
    assert.equal(
      committedMode & 0o222,
      0,
      "committed object must not retain owner, group, or world write bits",
    );
    assert.ok(
      overwriteError instanceof Error,
      "an in-place overwrite of a committed object must be rejected",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit isolates playback from a writable descriptor opened on staging", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-inherited-writer-"));
  const adapter = localAdapter(root);
  const payload = "original-bytes";
  const replacement = "replaced-bytes";
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const stagingPath = join(
    root,
    ".codeliver-ingest",
    "staging",
    handle.opaqueId,
  );
  let inheritedWriter = -1;

  try {
    await adapter.appendMultipart({
      handle,
      offset: 0,
      chunks: chunks(payload),
      maxBytes: 1024,
      expectedSize: payload.length,
    });
    inheritedWriter = openSync(stagingPath, "r+");
    const receipt = await adapter.commitMultipart({
      handle,
      objectKey,
      size: payload.length,
      sha256: createHash("sha256").update(payload).digest("hex"),
    });
    const stream = await adapter.openStoredObjectReadStream(
      objectKey,
      undefined,
      {
        size: receipt.size,
        providerVersionId: receipt.providerVersionId!,
      },
    );

    writeSync(
      inheritedWriter,
      Buffer.from(replacement),
      0,
      replacement.length,
      0,
    );

    assert.equal(
      await readStreamText(stream),
      payload,
      "a pre-commit writer on staging must not retain authority over playback bytes",
    );
    assert.equal(readFileSync(join(root, objectKey), "utf8"), payload);
  } finally {
    if (inheritedWriter >= 0) closeSync(inheritedWriter);
    rmSync(root, { recursive: true, force: true });
  }
});

test("playback rejects a committed object that has write bits", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-writable-read-"));
  const adapter = localAdapter(root);
  const payload = "payload";
  const handle = await adapter.beginMultipart(randomUUID());
  const objectKey = buildVersionedObjectKey({
    tenantId: "tenant-a",
    projectId: "project-a",
    objectId: handle.uploadId,
    version: 1,
    filename: "master.mov",
  });
  const objectPath = join(root, objectKey);

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
      sha256: createHash("sha256").update(payload).digest("hex"),
    });
    chmodSync(objectPath, 0o600);

    await assert.rejects(
      async () => {
        const stream = await adapter.openStoredObjectReadStream(objectKey);
        stream.destroy();
      },
      (error: unknown) =>
        error instanceof Error && /immutable|read-only|writable/i.test(error.message),
      "writable committed objects must fail closed before playback",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit reconciliation rejects a writable object instead of blessing its inode", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-reconcile-seal-"));
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
  const objectPath = join(root, objectKey);

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
    chmodSync(objectPath, 0o600);

    await assert.rejects(
      () =>
        adapter.reconcileMultipartCommit({
          handle,
          objectKey,
          size: payload.length,
          sha256: checksum,
        }),
      /writable|immutable/i,
      "chmod cannot revoke inherited writers, so reconciliation must fail closed",
    );
    assert.notEqual(statSync(objectPath).mode & 0o222, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

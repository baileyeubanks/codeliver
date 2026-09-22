import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { MalwareScanHook } from "../lib/storage/malware.ts";
import { PendingMalwareScanHook } from "../lib/storage/malware.ts";
import type { UploadSession } from "../lib/tus/session.ts";
import { createStorageRuntime } from "../lib/storage/runtime.ts";
import { buildVersionedObjectKey, hashStorageNamespace } from "../lib/storage/object-key.ts";
import { UploadOrchestrator, type PostCommitHook } from "../lib/tus/orchestrator.ts";
import { FileUploadSessionRepository } from "../lib/tus/session-repository.ts";

const CLEAN_SCANNER: MalwareScanHook = {
  async scan() {
    return {
      verdict: "clean",
      engine: "test-scanner",
      signature: null,
      detail: "Test payload is clean",
      scannedAt: new Date().toISOString(),
    };
  },
};

class FailOnceSessionRepository extends FileUploadSessionRepository {
  failNextSave = false;

  override async save(
    session: UploadSession,
    expectedRevision: number
  ): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("injected durable session save failure");
    }
    await super.save(session, expectedRevision);
  }
}

function environment(root: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CODELIVER_STORAGE_PROVIDER: "local",
    CODELIVER_LOCAL_STORAGE_ROOT: root,
    CODELIVER_STORAGE_WRITE_ENABLED: "1",
    CODELIVER_STORAGE_RESERVED_BYTES: "0",
    CODELIVER_STORAGE_MAX_UPLOAD_BYTES: "1048576",
    CODELIVER_STORAGE_MAX_CHUNK_BYTES: "1024",
    CODELIVER_STORAGE_TENANT_QUOTA_BYTES: "1048576",
    CODELIVER_STORAGE_MAX_CONCURRENT_UPLOADS: "4",
    ...overrides,
  };
}

function createOrchestrator(
  root: string,
  scanner: MalwareScanHook = CLEAN_SCANNER,
  overrides: NodeJS.ProcessEnv = {},
  postCommitHooks: PostCommitHook[] = []
): UploadOrchestrator {
  const runtime = createStorageRuntime(environment(root, overrides));
  return new UploadOrchestrator({
    adapter: runtime.adapter,
    config: runtime.config,
    sessions: new FileUploadSessionRepository(root, 60_000),
    scanner,
    postCommitHooks,
  });
}

async function* chunks(...values: string[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield Buffer.from(value);
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-a",
    projectId: "project-a",
    idempotencyKey: "browser-upload-a",
    filename: "master.mov",
    mimeType: "video/quicktime",
    size: 7,
    ...overrides,
  } as {
    tenantId: string;
    projectId: string;
    idempotencyKey: string;
    filename: string;
    mimeType: string;
    size: number;
    expectedSha256?: string;
    version?: number;
    assetId?: string;
    expectedCurrentVersionId?: string;
  };
}

test("concurrent creation is tenant-scoped and idempotent", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-idempotency-"));
  const orchestrator = createOrchestrator(root);
  try {
    const [first, second] = await Promise.all([
      orchestrator.createSession(createInput()),
      orchestrator.createSession(createInput()),
    ]);
    assert.equal(first.session.id, second.session.id);
    assert.equal(Number(first.resumed) + Number(second.resumed), 1);

    await assert.rejects(
      () => orchestrator.createSession(createInput({ filename: "different.mov" })),
      /different upload metadata/
    );
    await assert.rejects(
      () => orchestrator.createSession(createInput({ folderId: "folder-b" })),
      /different upload metadata/
    );
    await assert.rejects(
      () => orchestrator.getSession(first.session.id, "tenant-b"),
      /Upload not found/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("revision idempotency stays bound to its asset and expected current version", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-revision-idempotency-"));
  const orchestrator = createOrchestrator(root);
  const assetId = "44444444-4444-4444-8444-444444444444";
  const expectedCurrentVersionId = "55555555-5555-4555-8555-555555555555";
  try {
    const created = await orchestrator.createSession(createInput({
      version: 4,
      assetId,
      expectedCurrentVersionId,
    }));

    assert.equal(created.session.version, 4);
    assert.equal(created.session.assetId, assetId);
    assert.equal(
      created.session.expectedCurrentVersionId,
      expectedCurrentVersionId,
    );

    await assert.rejects(
      () => orchestrator.createSession(createInput({
        version: 4,
        assetId: "66666666-6666-4666-8666-666666666666",
        expectedCurrentVersionId,
      })),
      /different upload metadata/,
    );
    await assert.rejects(
      () => orchestrator.createSession(createInput({
        version: 4,
        assetId,
        expectedCurrentVersionId: "77777777-7777-4777-8777-777777777777",
      })),
      /different upload metadata/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only an exact clean attached revision is recoverable before current-version preflight", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-revision-attached-retry-"));
  const orchestrator = createOrchestrator(root);
  const assetId = "44444444-4444-4444-8444-444444444444";
  const expectedCurrentVersionId = "55555555-5555-4555-8555-555555555555";
  const input = createInput({
    version: 4,
    assetId,
    expectedCurrentVersionId,
  });
  const recoveryInput = {
    tenantId: input.tenantId,
    projectId: input.projectId,
    idempotencyKey: input.idempotencyKey,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
    assetId,
    expectedCurrentVersionId,
    expectedSha256: input.expectedSha256,
  };
  try {
    const created = await orchestrator.createSession(input);
    assert.equal(
      await orchestrator.recoverAttachedRevisionSession(recoveryInput),
      null,
      "an in-flight upload must still use the live authority preflight",
    );

    await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: input.tenantId,
      offset: 0,
      chunks: chunks("payload"),
    });
    await orchestrator.attachAsset(
      created.session.id,
      input.tenantId,
      assetId,
      "66666666-6666-4666-8666-666666666666",
    );

    const recovered = await orchestrator.recoverAttachedRevisionSession(recoveryInput);
    assert.equal(recovered?.id, created.session.id);
    assert.equal(recovered?.catalog.state, "attached");
    assert.equal(recovered?.versionId, "66666666-6666-4666-8666-666666666666");

    await assert.rejects(
      () => orchestrator.recoverAttachedRevisionSession({
        ...recoveryInput,
        assetId: "77777777-7777-4777-8777-777777777777",
      }),
      /different upload metadata/,
    );
    await assert.rejects(
      () => orchestrator.recoverAttachedRevisionSession({
        ...recoveryInput,
        expectedCurrentVersionId: "88888888-8888-4888-8888-888888888888",
      }),
      /different upload metadata/,
    );
    await assert.rejects(
      () => orchestrator.recoverAttachedRevisionSession({
        ...recoveryInput,
        filename: "different.mov",
      }),
      /different upload metadata/,
    );
    assert.equal(
      await orchestrator.recoverAttachedRevisionSession({
        ...recoveryInput,
        tenantId: "tenant-b",
      }),
      null,
      "a different tenant must not discover the original idempotency record",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V1 idempotency still resumes after catalog attachment adds result identities", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-v1-attached-idempotency-"));
  const orchestrator = createOrchestrator(root);
  try {
    const created = await orchestrator.createSession(createInput());
    await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    await orchestrator.attachAsset(
      created.session.id,
      "tenant-a",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    );

    const resumed = await orchestrator.createSession(createInput());
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.session.id, created.session.id);
    assert.equal(
      resumed.session.assetId,
      "44444444-4444-4444-8444-444444444444",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resumable parts commit with full-object checksum evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-commit-"));
  const orchestrator = createOrchestrator(root);
  const payload = "payload";
  const checksum = createHash("sha256").update(payload).digest("hex");
  try {
    const created = await orchestrator.createSession(
      createInput({ expectedSha256: checksum })
    );
    const first = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("pay"),
    });
    assert.equal(first.complete, false);
    assert.equal(first.session.offset, 3);

    const result = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 3,
      chunks: chunks("load"),
      expectedPartSha256: createHash("sha256").update("load").digest("hex"),
    });
    assert.equal(result.complete, true);
    assert.equal(result.session.state, "committed");
    assert.equal(result.session.computedSha256, checksum);
    assert.equal(result.session.receipt?.sha256, checksum);
    assert.ok(result.session.objectKey);
    assert.equal(existsSync(join(root, result.session.objectKey!)), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("part checksum failure preserves the prior resumable offset", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-checksum-"));
  const orchestrator = createOrchestrator(root);
  try {
    const created = await orchestrator.createSession(createInput());
    await assert.rejects(
      () =>
        orchestrator.appendPart({
          uploadId: created.session.id,
          tenantId: "tenant-a",
          offset: 0,
          chunks: chunks("payload"),
          expectedPartSha256: "0".repeat(64),
        }),
      /checksum did not match/
    );
    const current = await orchestrator.getSession(created.session.id, "tenant-a");
    assert.equal(current?.offset, 0);
    assert.equal(current?.state, "receiving");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unconfigured malware scanning quarantines bytes until a trusted clean verdict", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-quarantine-"));
  const orchestrator = createOrchestrator(root, new PendingMalwareScanHook());
  try {
    const created = await orchestrator.createSession(createInput());
    const quarantined = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(quarantined.session.state, "quarantined");
    assert.equal(quarantined.session.objectKey, null);

    const committed = await orchestrator.applyTrustedScanResult(
      created.session.id,
      "tenant-a",
      {
        verdict: "clean",
        engine: "clamav-test",
        signature: null,
        detail: "No signature detected",
        scannedAt: new Date().toISOString(),
        subjectSha256: createHash("sha256").update("payload").digest("hex"),
      }
    );
    assert.equal(committed.state, "committed");
    assert.ok(committed.objectKey);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("quota and concurrent-upload limits apply before staging allocation", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-admission-"));
  const orchestrator = createOrchestrator(root, CLEAN_SCANNER, {
    CODELIVER_STORAGE_TENANT_QUOTA_BYTES: "10",
    CODELIVER_STORAGE_MAX_CONCURRENT_UPLOADS: "1",
  });
  try {
    await orchestrator.createSession(createInput({ size: 7 }));
    await assert.rejects(
      () =>
        orchestrator.createSession(
          createInput({ idempotencyKey: "browser-upload-b", filename: "b.mov", size: 4 })
        ),
      /concurrent-upload limit/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository lock files reject concurrent writers", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-lock-"));
  const repository = new FileUploadSessionRepository(root, 60_000);
  const uploadId = randomUUID();
  let release: (() => void) | undefined;
  const held = repository.withLock(
    uploadId,
    () => new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  try {
    while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
    await assert.rejects(
      () => repository.withLock(uploadId, async () => undefined),
      /busy; retry after backoff/
    );
  } finally {
    release?.();
    await held;
    rmSync(root, { recursive: true, force: true });
  }
});

test("lock heartbeat prevents stale takeover during long work", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-heartbeat-"));
  const repository = new FileUploadSessionRepository(root, 30);
  const uploadId = randomUUID();
  let release: (() => void) | undefined;
  const held = repository.withLock(
    uploadId,
    () => new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  try {
    while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
    await new Promise((resolve) => setTimeout(resolve, 80));
    await assert.rejects(
      () => repository.withLock(uploadId, async () => undefined),
      /busy; retry after backoff/
    );
  } finally {
    release?.();
    await held;
    rmSync(root, { recursive: true, force: true });
  }
});

test("tenant diagnostics are read-only and report upload pressure", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-diagnostics-"));
  const orchestrator = createOrchestrator(root);
  try {
    const empty = await orchestrator.diagnostics("tenant-a");
    assert.equal(empty.storage.readyForWrites, true);
    assert.equal(empty.sessionControl.activeCount, 0);
    assert.equal(existsSync(join(root, ".codeliver-ingest")), false);

    await orchestrator.createSession(createInput());
    const active = await orchestrator.diagnostics("tenant-a");
    assert.equal(active.sessionControl.activeCount, 1);
    assert.equal(active.sessionControl.allocatedBytes, "7");
    assert.equal(active.sessionControl.inFlightBytes, "7");
    assert.equal((await orchestrator.diagnostics("tenant-b")).sessionControl.activeCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("catalog reconciliation serializes retries after immutable placement", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-catalog-"));
  const orchestrator = createOrchestrator(root);
  let catalogWrites = 0;
  try {
    const created = await orchestrator.createSession(createInput());
    const committed = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(committed.session.state, "committed");

    const reconcile = (session: { assetId: string | null }) => {
      if (!session.assetId) catalogWrites += 1;
      return Promise.resolve({
        id: session.assetId || "asset-a",
        version_id: "version-a",
      });
    };
    const raced = await Promise.allSettled([
      orchestrator.reconcileCatalog(created.session.id, "tenant-a", reconcile),
      orchestrator.reconcileCatalog(created.session.id, "tenant-a", reconcile),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(raced.filter((result) => result.status === "rejected").length, 1);
    const first = raced.find((result) => result.status === "fulfilled");
    assert.equal(first?.status === "fulfilled" ? first.value.id : null, "asset-a");

    const second = await orchestrator.reconcileCatalog(
      created.session.id,
      "tenant-a",
      reconcile
    );
    assert.equal(second.id, "asset-a");
    assert.equal(catalogWrites, 1);

    const session = await orchestrator.getSession(created.session.id, "tenant-a");
    assert.equal(session?.assetId, "asset-a");
    assert.equal(session?.versionId, "version-a");
    assert.equal(session?.catalog.state, "attached");
    assert.equal(session?.catalog.attempts, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("asset-only catalog results fail closed and an exact-pair retry self-repairs", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-catalog-pair-"));
  const orchestrator = createOrchestrator(root);
  try {
    const created = await orchestrator.createSession(createInput());
    await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });

    await assert.rejects(
      () =>
        orchestrator.reconcileCatalog(
          created.session.id,
          "tenant-a",
          async () => ({ id: "asset-a" }) as never,
        ),
      /Version id must be between 1 and 256 printable characters/,
    );
    const failed = await orchestrator.getSession(created.session.id, "tenant-a");
    assert.equal(failed?.assetId, null);
    assert.equal(failed?.versionId, null);
    assert.equal(failed?.catalog.state, "error");

    const repaired = await orchestrator.reconcileCatalog(
      created.session.id,
      "tenant-a",
      async () => ({ id: "asset-a", version_id: "version-a" }),
    );
    assert.deepEqual(repaired, { id: "asset-a", version_id: "version-a" });
    const attached = await orchestrator.getSession(created.session.id, "tenant-a");
    assert.equal(attached?.assetId, "asset-a");
    assert.equal(attached?.versionId, "version-a");
    assert.equal(attached?.catalog.state, "attached");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same idempotency key remains isolated across tenants", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-tenant-isolation-"));
  const orchestrator = createOrchestrator(root);
  try {
    const [tenantA, tenantB] = await Promise.all([
      orchestrator.createSession(createInput()),
      orchestrator.createSession(
        createInput({ tenantId: "tenant-b", projectId: "project-b" })
      ),
    ]);
    assert.notEqual(tenantA.session.id, tenantB.session.id);
    assert.notEqual(tenantA.session.tenantKey, tenantB.session.tenantKey);
    await assert.rejects(
      () => orchestrator.getSession(tenantA.session.id, "tenant-b"),
      /Upload not found/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent tenant admission cannot overrun the active-upload limit", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-admission-race-"));
  const orchestrator = createOrchestrator(root, CLEAN_SCANNER, {
    CODELIVER_STORAGE_MAX_CONCURRENT_UPLOADS: "1",
  });
  try {
    const settled = await Promise.allSettled([
      orchestrator.createSession(
        createInput({ idempotencyKey: "race-a", filename: "a.mov" })
      ),
      orchestrator.createSession(
        createInput({ idempotencyKey: "race-b", filename: "b.mov" })
      ),
    ]);
    assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(settled.filter((result) => result.status === "rejected").length, 1);
    const rejected = settled.find((result) => result.status === "rejected");
    assert.match(
      rejected?.status === "rejected" ? String(rejected.reason) : "",
      /concurrent-upload limit/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cross-tenant admission reserves outstanding physical capacity", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-capacity-race-"));
  const runtime = createStorageRuntime(environment(root));
  const diagnose = runtime.adapter.diagnose.bind(runtime.adapter);
  runtime.adapter.diagnose = async () => ({
    ...(await diagnose()),
    capacity: {
      totalBytes: "100",
      availableBytes: "10",
      usedBytes: "90",
      reservedBytes: "0",
      observedAt: new Date().toISOString(),
    },
  });
  const orchestrator = new UploadOrchestrator({
    adapter: runtime.adapter,
    config: runtime.config,
    sessions: new FileUploadSessionRepository(root, 60_000),
    scanner: CLEAN_SCANNER,
  });
  try {
    const settled = await Promise.allSettled([
      orchestrator.createSession(createInput()),
      orchestrator.createSession(
        createInput({
          tenantId: "tenant-b",
          projectId: "project-b",
          idempotencyKey: "capacity-b",
        })
      ),
    ]);
    assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = settled.find((result) => result.status === "rejected");
    assert.match(
      rejected?.status === "rejected" ? String(rejected.reason) : "",
      /reserved upload admission threshold/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restart recovery truncates uncommitted physical bytes before retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-byte-recovery-"));
  const runtime = createStorageRuntime(environment(root));
  const orchestrator = createOrchestrator(root);
  try {
    const created = await orchestrator.createSession(createInput());
    await runtime.adapter.appendMultipart({
      handle: created.session.providerHandle,
      offset: 0,
      chunks: chunks("stale!!"),
      maxBytes: 1024,
      expectedSize: 7,
    });

    const restarted = createOrchestrator(root);
    const result = await restarted.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(result.session.state, "committed");
    assert.equal(result.session.recovery.lastAction, "multipart-rolled-back");
    assert.equal(
      result.session.receipt?.sha256,
      createHash("sha256").update("payload").digest("hex")
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("metadata failure rolls accepted bytes back before returning", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-save-rollback-"));
  const runtime = createStorageRuntime(environment(root));
  const repository = new FailOnceSessionRepository(root, 60_000);
  const orchestrator = new UploadOrchestrator({
    adapter: runtime.adapter,
    config: runtime.config,
    sessions: repository,
    scanner: CLEAN_SCANNER,
  });
  try {
    const created = await orchestrator.createSession(createInput());
    repository.failNextSave = true;
    await assert.rejects(
      () =>
        orchestrator.appendPart({
          uploadId: created.session.id,
          tenantId: "tenant-a",
          offset: 0,
          chunks: chunks("payload"),
        }),
      /injected durable session save failure/
    );
    assert.equal(
      (await runtime.adapter.inspectMultipart(created.session.providerHandle)).size,
      0
    );

    const retried = await createOrchestrator(root).appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(retried.session.state, "committed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restart recovery reconciles placement created before its receipt", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-placement-recovery-"));
  const runtime = createStorageRuntime(environment(root));
  const repository = new FileUploadSessionRepository(root, 60_000);
  const orchestrator = new UploadOrchestrator({
    adapter: runtime.adapter,
    config: runtime.config,
    sessions: repository,
    scanner: CLEAN_SCANNER,
  });
  const checksum = createHash("sha256").update("payload").digest("hex");
  try {
    const created = await orchestrator.createSession(createInput());
    await runtime.adapter.appendMultipart({
      handle: created.session.providerHandle,
      offset: 0,
      chunks: chunks("payload"),
      maxBytes: 1024,
      expectedSize: 7,
    });
    await repository.withLock(created.session.id, async () => {
      const session = await repository.get(created.session.id);
      assert.ok(session);
      const expectedRevision = session.revision;
      session.offset = 7;
      session.state = "verifying";
      session.revision += 1;
      session.updatedAt = new Date().toISOString();
      await repository.save(session, expectedRevision);
    });
    const objectKey = buildVersionedObjectKey({
      tenantId: created.session.tenantKey,
      projectId: created.session.projectId,
      objectId: created.session.id,
      version: created.session.version,
      filename: created.session.filename,
    });
    await runtime.adapter.commitMultipart({
      handle: created.session.providerHandle,
      objectKey,
      size: 7,
      sha256: checksum,
    });

    const recovered = await createOrchestrator(root).recoverSession(
      created.session.id,
      "tenant-a"
    );
    assert.equal(recovered?.state, "committed");
    assert.equal(recovered?.receipt?.sha256, checksum);
    assert.equal(recovered?.recovery.lastAction, "placement-recovered");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restart recovery resumes a sealed staging object at its unchanged durable offset", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-sealed-recovery-"));
  const runtime = createStorageRuntime(environment(root));
  const repository = new FileUploadSessionRepository(root, 60_000);
  const checksum = createHash("sha256").update("payload").digest("hex");
  try {
    const orchestrator = new UploadOrchestrator({
      adapter: runtime.adapter,
      config: runtime.config,
      sessions: repository,
      scanner: CLEAN_SCANNER,
    });
    const created = await orchestrator.createSession(createInput());
    await runtime.adapter.appendMultipart({
      handle: created.session.providerHandle,
      offset: 0,
      chunks: chunks("payload"),
      maxBytes: 1024,
      expectedSize: 7,
    });
    const objectKey = buildVersionedObjectKey({
      tenantId: created.session.tenantKey,
      projectId: created.session.projectId,
      objectId: created.session.id,
      version: created.session.version,
      filename: created.session.filename,
    });
    await repository.withLock(created.session.id, async () => {
      const session = await repository.get(created.session.id);
      assert.ok(session);
      const expectedRevision = session.revision;
      session.offset = 7;
      session.state = "verifying";
      session.computedSha256 = checksum;
      session.objectKey = objectKey;
      session.scan = {
        verdict: "clean",
        engine: "test-scanner",
        signature: null,
        detail: "Test payload is clean",
        scannedAt: new Date().toISOString(),
      };
      session.revision += 1;
      session.updatedAt = new Date().toISOString();
      await repository.save(session, expectedRevision);
    });
    chmodSync(
      join(
        root,
        ".codeliver-ingest",
        "staging",
        created.session.providerHandle.opaqueId,
      ),
      0o400,
    );

    const recovered = await createOrchestrator(root).recoverSession(
      created.session.id,
      "tenant-a",
    );
    assert.equal(recovered?.state, "committed");
    assert.equal(recovered?.receipt?.sha256, checksum);
    assert.equal(recovered?.recovery.lastAction, "verification-resumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanner exceptions fail closed into quarantine", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-scanner-error-"));
  const scanner: MalwareScanHook = {
    async scan() {
      throw new Error("scanner offline");
    },
  };
  try {
    const orchestrator = createOrchestrator(root, scanner);
    const created = await orchestrator.createSession(createInput());
    const result = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(result.session.state, "quarantined");
    assert.equal(result.session.scan?.verdict, "error");
    assert.equal(result.session.objectKey, null);
    assert.equal(orchestrator.releaseReadiness(result.session).originalReady, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanner timeout releases the upload lock into quarantine", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-scanner-timeout-"));
  const scanner: MalwareScanHook = {
    async scan() {
      return new Promise<never>(() => undefined);
    },
  };
  try {
    const orchestrator = createOrchestrator(root, scanner, {
      CODELIVER_MALWARE_SCAN_TIMEOUT_MS: "20",
    });
    const created = await orchestrator.createSession(createInput());
    const result = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(result.session.state, "quarantined");
    assert.equal(result.session.scan?.engine, "scanner-timeout");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("timeout quarantine retries the scan against retained verified bytes without another upload", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-scanner-timeout-retry-"));
  let attempts = 0;
  const scanner: MalwareScanHook = {
    async scan() {
      attempts += 1;
      if (attempts === 1) return new Promise<never>(() => undefined);
      return {
        verdict: "clean",
        engine: "test-scanner",
        signature: null,
        detail: "Retained bytes are clean",
        scannedAt: new Date().toISOString(),
      };
    },
  };
  try {
    const orchestrator = createOrchestrator(root, scanner, {
      CODELIVER_MALWARE_SCAN_TIMEOUT_MS: "20",
    });
    const created = await orchestrator.createSession(createInput());
    const quarantined = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(quarantined.session.state, "quarantined");
    assert.equal(quarantined.session.scan?.engine, "scanner-timeout");
    assert.equal(quarantined.session.offset, quarantined.session.size);

    const started = await orchestrator.beginMalwareScanRetry(
      created.session.id,
      "tenant-a",
    );
    assert.equal(started.state, "verifying");
    assert.equal(started.offset, started.size);

    const recovered = await orchestrator.recoverSession(
      created.session.id,
      "tenant-a",
    );
    assert.equal(recovered?.state, "verifying");
    assert.equal(attempts, 1, "ordinary Tus recovery must not run the long retry scan");

    const restarted = await orchestrator.beginMalwareScanRetry(
      created.session.id,
      "tenant-a",
    );
    assert.equal(restarted.state, "verifying");

    const committed = await orchestrator.resumeMalwareScanRetry(
      created.session.id,
      "tenant-a",
    );
    assert.equal(committed.state, "committed");
    assert.equal(committed.scan?.verdict, "clean");
    assert.equal(committed.offset, committed.size);
    assert.equal(attempts, 2);
    const duplicate = await orchestrator.resumeMalwareScanRetry(
      created.session.id,
      "tenant-a",
    );
    assert.equal(duplicate.state, "committed");
    assert.equal(attempts, 2, "a queued duplicate retry must not rescan committed bytes");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("completed upload defers the full scan, survives HEAD recovery, and commits from retained bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-deferred-finalize-"));
  let scans = 0;
  const scanner: MalwareScanHook = {
    async scan() {
      scans += 1;
      return {
        verdict: "clean",
        engine: "test-scanner",
        signature: null,
        detail: "Retained bytes are clean",
        scannedAt: new Date().toISOString(),
      };
    },
  };
  try {
    const orchestrator = createOrchestrator(root, scanner);
    const created = await orchestrator.createSession(createInput());
    const accepted = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
      deferFinalization: true,
    });

    assert.equal(accepted.complete, true);
    assert.equal(accepted.session.state, "verifying");
    assert.equal(accepted.session.offset, accepted.session.size);
    assert.equal(accepted.session.scan, null);
    assert.equal(scans, 0, "the final PATCH boundary must not run the full scan");

    const recovered = await orchestrator.recoverSession(
      created.session.id,
      "tenant-a",
    );
    assert.equal(recovered?.state, "verifying");
    assert.equal(scans, 0, "ordinary Tus HEAD recovery must remain fast");

    const committed = await orchestrator.resumeDeferredFinalization(
      created.session.id,
      "tenant-a",
    );
    assert.equal(committed.state, "committed");
    assert.equal(committed.scan?.verdict, "clean");
    assert.equal(committed.offset, committed.size);
    assert.equal(scans, 1);

    const idempotent = await orchestrator.resumeDeferredFinalization(
      created.session.id,
      "tenant-a",
    );
    assert.equal(idempotent.state, "committed");
    assert.equal(scans, 1, "a duplicate lifecycle callback must not rescan bytes");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scan retry is timeout-only and can never retry infected or unrelated scanner errors", async () => {
  const cases: Array<{ name: string; scanner: MalwareScanHook; expectedState: string }> = [
    {
      name: "infected",
      expectedState: "rejected",
      scanner: {
        async scan() {
          return {
            verdict: "infected",
            engine: "test-scanner",
            signature: "test-signature",
            detail: "Rejected",
            scannedAt: new Date().toISOString(),
          };
        },
      },
    },
    {
      name: "scanner-error",
      expectedState: "quarantined",
      scanner: {
        async scan() {
          throw new Error("scanner offline");
        },
      },
    },
  ];

  for (const entry of cases) {
    const root = mkdtempSync(join(tmpdir(), `codeliver-session-no-retry-${entry.name}-`));
    try {
      const orchestrator = createOrchestrator(root, entry.scanner);
      const created = await orchestrator.createSession(createInput({
        idempotencyKey: entry.name,
      }));
      const terminal = await orchestrator.appendPart({
        uploadId: created.session.id,
        tenantId: "tenant-a",
        offset: 0,
        chunks: chunks("payload"),
      });
      assert.equal(terminal.session.state, entry.expectedState);
      await assert.rejects(
        () => orchestrator.beginMalwareScanRetry(created.session.id, "tenant-a"),
        /Only timeout-quarantined uploads can retry the security scan/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("malformed clean scanner results remain quarantined", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-scanner-contract-"));
  const scanner: MalwareScanHook = {
    async scan() {
      return {
        verdict: "clean",
        engine: "",
        signature: null,
        detail: "invalid clean result",
        scannedAt: new Date().toISOString(),
      };
    },
  };
  try {
    const orchestrator = createOrchestrator(root, scanner);
    const created = await orchestrator.createSession(createInput());
    const result = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(result.session.state, "quarantined");
    assert.equal(result.session.scan?.verdict, "error");
    assert.equal(result.session.scan?.engine, "scanner-contract");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejected bytes continue counting against tenant quota", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-rejected-quota-"));
  const scanner: MalwareScanHook = {
    async scan() {
      return {
        verdict: "infected",
        engine: "clamav-test",
        signature: "test-signature",
        detail: "Test signature detected",
        scannedAt: new Date().toISOString(),
      };
    },
  };
  const orchestrator = createOrchestrator(root, scanner, {
    CODELIVER_STORAGE_TENANT_QUOTA_BYTES: "7",
  });
  try {
    const created = await orchestrator.createSession(createInput());
    const rejected = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(rejected.session.state, "rejected");
    await assert.rejects(
      () =>
        orchestrator.createSession(
          createInput({
            idempotencyKey: "after-rejection",
            filename: "after.mov",
            size: 1,
          })
        ),
      /storage quota exceeded/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("trusted scan evidence is checksum-bound before quarantine release", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-scan-binding-"));
  const orchestrator = createOrchestrator(root, new PendingMalwareScanHook());
  try {
    const created = await orchestrator.createSession(createInput());
    await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    await assert.rejects(
      () =>
        orchestrator.applyTrustedScanResult(created.session.id, "tenant-a", {
          verdict: "clean",
          engine: "clamav-test",
          signature: null,
          detail: "Mismatched object",
          scannedAt: new Date().toISOString(),
          subjectSha256: "0".repeat(64),
        }),
      /not bound to this verified object/
    );
    assert.equal(
      (await orchestrator.getSession(created.session.id, "tenant-a"))?.state,
      "quarantined"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("derivative readiness persists failure and explicit retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-derivative-retry-"));
  let attempts = 0;
  const hook: PostCommitHook = {
    async onCommitted() {
      attempts += 1;
      if (attempts === 1) throw new Error("queue unavailable");
    },
  };
  const orchestrator = createOrchestrator(root, CLEAN_SCANNER, {}, [hook]);
  try {
    const created = await orchestrator.createSession(createInput());
    const committed = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(committed.session.state, "committed");
    assert.equal(committed.session.derivatives.state, "error");
    assert.equal(committed.session.derivatives.attempts, 1);
    assert.equal(
      orchestrator.releaseReadiness(committed.session).signedDeliveryReady,
      false
    );

    const retried = await orchestrator.retryDerivatives(
      created.session.id,
      "tenant-a"
    );
    assert.equal(retried.derivatives.state, "ready");
    assert.equal(retried.derivatives.attempts, 2);
    assert.equal(attempts, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("derivative enqueue timeout is durable and does not roll back the original", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-derivative-timeout-"));
  const hook: PostCommitHook = {
    async onCommitted() {
      return new Promise<never>(() => undefined);
    },
  };
  const orchestrator = createOrchestrator(
    root,
    CLEAN_SCANNER,
    { CODELIVER_DERIVATIVE_HOOK_TIMEOUT_MS: "20" },
    [hook]
  );
  try {
    const created = await orchestrator.createSession(createInput());
    const committed = await orchestrator.appendPart({
      uploadId: created.session.id,
      tenantId: "tenant-a",
      offset: 0,
      chunks: chunks("payload"),
    });
    assert.equal(committed.session.state, "committed");
    assert.equal(committed.session.derivatives.state, "error");
    assert.match(
      committed.session.derivatives.lastError ?? "",
      /Derivative enqueue exceeded 20ms/
    );
    assert.equal(committed.session.receipt?.sha256.length, 64);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale session revisions cannot overwrite newer durable state", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-revision-cas-"));
  const runtime = createStorageRuntime(environment(root));
  const repository = new FileUploadSessionRepository(root, 60_000);
  const orchestrator = new UploadOrchestrator({
    adapter: runtime.adapter,
    config: runtime.config,
    sessions: repository,
    scanner: CLEAN_SCANNER,
  });
  try {
    const created = await orchestrator.createSession(createInput());
    const original = await repository.get(created.session.id);
    assert.ok(original);
    await repository.withLock(created.session.id, async () => {
      const first = structuredClone(original);
      first.catalog.lastError = "newer state";
      first.revision += 1;
      first.updatedAt = new Date().toISOString();
      await repository.save(first, original.revision);

      const stale = structuredClone(original);
      stale.catalog.lastError = "stale state";
      stale.revision += 1;
      stale.updatedAt = new Date().toISOString();
      await assert.rejects(
        () => repository.save(stale, original.revision),
        /revision changed/
      );
    });
    assert.equal(
      (await repository.get(created.session.id))?.catalog.lastError,
      "newer state"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepared creation journal recovers session and idempotency index after restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-session-create-journal-"));
  const runtime = createStorageRuntime(environment(root));
  const repository = new FileUploadSessionRepository(root, 60_000);
  const tenantKey = hashStorageNamespace("tenant-a");
  const idempotencyKeyHash = createHash("sha256")
    .update(`${tenantKey}\u0000journal-recovery`)
    .digest("hex");
  const uploadId = randomUUID();
  const providerHandle = await runtime.adapter.beginMultipart(uploadId);
  const createdAt = new Date().toISOString();
  const session: UploadSession = {
    schemaVersion: 1,
    id: uploadId,
    tenantKey,
    projectId: "project-a",
    folderId: null,
    idempotencyKeyHash,
    filename: "master.mov",
    mimeType: "video/quicktime",
    size: 7,
    offset: 0,
    version: 1,
    provider: "local",
    providerHandle,
    state: "receiving",
    expectedSha256: null,
    computedSha256: null,
    objectKey: null,
    receipt: null,
    scan: null,
    partCount: 0,
    lastPartSha256: null,
    assetId: null,
    versionId: null,
    catalog: {
      state: "pending",
      attempts: 0,
      lastError: null,
      updatedAt: createdAt,
    },
    derivatives: {
      state: "blocked",
      attempts: 0,
      lastError: "No durable derivative enqueue hook is configured",
      updatedAt: createdAt,
    },
    recovery: {
      attempts: 0,
      lastAction: "none",
      lastRecoveredAt: null,
    },
    legalHold: false,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    lastError: null,
  };
  const transactionDirectory = join(
    root,
    ".codeliver-ingest",
    "control",
    "transactions"
  );
  const transactionPath = join(transactionDirectory, `${idempotencyKeyHash}.json`);
  try {
    mkdirSync(transactionDirectory, { recursive: true, mode: 0o700 });
    writeFileSync(
      transactionPath,
      JSON.stringify({
        schemaVersion: 1,
        idempotencyKeyHash,
        session,
        preparedAt: createdAt,
      }),
      { mode: 0o600 }
    );

    const recovered = await repository.withTenantLock(tenantKey, () =>
      repository.findByIdempotencyHash(idempotencyKeyHash)
    );
    assert.equal(recovered?.id, uploadId);
    assert.equal((await repository.get(uploadId))?.id, uploadId);
    assert.equal(existsSync(transactionPath), false);
    assert.equal(
      existsSync(
        join(
          root,
          ".codeliver-ingest",
          "control",
          "idempotency",
          `${idempotencyKeyHash}.json`
        )
      ),
      true
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

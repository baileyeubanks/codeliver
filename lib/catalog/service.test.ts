import assert from "node:assert/strict";
import test from "node:test";
import { assertAccessibleVersionBinding } from "./asset-binding";
import type {
  CatalogPrincipal,
  CatalogRole,
  CatalogVersionBinding,
} from "./contracts";
import {
  asCatalogError,
  catalogRecoveryGuidance,
  CatalogError,
} from "./errors";
import { MemoryCatalogRepository } from "./memory-repository";
import { CatalogService } from "./service";

const CHECKSUM_A = `sha256:${"a".repeat(64)}`;
const CHECKSUM_B = `sha256:${"b".repeat(64)}`;

function principal(tenantId: string, role: CatalogRole = "owner"): CatalogPrincipal {
  return { actorId: `actor-${role}`, tenantId, role };
}

function harness() {
  const repository = new MemoryCatalogRepository();
  let milliseconds = Date.parse("2026-07-14T12:00:00.000Z");
  let monotonic = 100;
  const service = new CatalogService({
    repository,
    now: () => new Date(milliseconds++),
    monotonicNow: () => monotonic += 0.125,
  });
  return { repository, service };
}

function ingestInput(
  tenantId: string,
  assetId: string,
  options: {
    expectedRevision?: number;
    idempotencyKey?: string;
    sequence?: number;
    versionId?: string;
    checksum?: string;
    title?: string;
    sourceLocator?: string;
    tags?: string[];
  } = {},
) {
  const sequence = options.sequence ?? 1;
  return {
    tenantId,
    idempotencyKey: options.idempotencyKey ?? `ingest-${tenantId}-${assetId}-${sequence}`,
    requestId: `request-${tenantId}-${assetId}-${sequence}`,
    expectedRevision: options.expectedRevision ?? 0,
    version: {
      assetId,
      versionId: options.versionId ?? `${assetId}-version-${sequence}`,
      sequence,
      checksum: options.checksum ?? CHECKSUM_A,
    },
    metadata: {
      title: options.title ?? `Title ${assetId}`,
      description: "Public description",
      mediaType: "video",
      tags: options.tags ?? ["campaign", "video"],
      durationMs: 12_000,
      language: "en-US",
    },
    restrictedMetadata: {
      sourceLocator: options.sourceLocator ?? `vault://${tenantId}/${assetId}`,
      rightsStatement: "Internal distribution only",
    },
  };
}

function expectCatalogError(code: string) {
  return (error: unknown) => error instanceof CatalogError && error.code === code;
}

function bindingClient(result: {
  data: { id: string; asset_id: string; version_number: number } | null;
  error: unknown;
}): Parameters<typeof assertAccessibleVersionBinding>[0] {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
  };
  return { from: () => query } as unknown as Parameters<
    typeof assertAccessibleVersionBinding
  >[0];
}

test("tenant scope and role policy prevent cross-tenant and restricted-metadata leakage", () => {
  const { repository, service } = harness();
  service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a", { title: "Alpha" }));
  service.ingest(principal("tenant-b"), ingestInput("tenant-b", "asset-b", { title: "Beta" }));

  const viewerResult = service.discover(principal("tenant-a", "viewer"), {
    tenantId: "tenant-a",
    query: "",
    tags: [],
    limit: 25,
    requestId: "viewer-discovery",
  });
  assert.deepEqual(viewerResult.items.map((item) => item.version.assetId), ["asset-a"]);
  assert.equal(viewerResult.items[0]?.restrictedMetadata, undefined);

  const restrictedSearch = service.discover(principal("tenant-a", "viewer"), {
    tenantId: "tenant-a",
    query: "vault",
    tags: [],
    limit: 25,
    requestId: "restricted-search",
  });
  assert.equal(restrictedSearch.items.length, 0, "restricted fields are not a search side channel");

  const adminResult = service.discover(principal("tenant-a", "admin"), {
    tenantId: "tenant-a",
    query: "",
    tags: [],
    limit: 25,
    requestId: "admin-discovery",
  });
  assert.equal(adminResult.items[0]?.restrictedMetadata?.sourceLocator, "vault://tenant-a/asset-a");

  assert.throws(
    () => service.discover(principal("tenant-a"), {
      tenantId: "tenant-b",
      query: "",
      tags: [],
      limit: 25,
      requestId: "cross-tenant",
    }),
    expectCatalogError("tenant_scope_mismatch"),
  );
  assert.throws(
    () => service.ingest(principal("tenant-a", "viewer"), ingestInput("tenant-a", "asset-denied")),
    expectCatalogError("forbidden"),
  );

  assert.equal(repository.listItems("tenant-a").length, 1);
  assert.equal(repository.listItems("tenant-b").length, 1);
  assert.ok(repository.listReceipts("tenant-a", 50).some((receipt) => receipt.outcome === "denied"));
  assert.ok(repository.listReceipts("tenant-b", 50).every((receipt) => receipt.tenantId === "tenant-b"));
});

test("version binding rejects stale sequences, conflicting immutable versions, and revision races", () => {
  const { service } = harness();
  service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a", {
    sequence: 2,
    versionId: "asset-a-version-2",
  }));

  assert.throws(
    () => service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a", {
      expectedRevision: 1,
      idempotencyKey: "stale-version-attempt",
      sequence: 1,
      versionId: "asset-a-version-1",
    })),
    expectCatalogError("stale_asset_version"),
  );
  assert.throws(
    () => service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a", {
      expectedRevision: 1,
      idempotencyKey: "conflicting-binding",
      sequence: 2,
      versionId: "different-version-2",
      checksum: CHECKSUM_B,
    })),
    expectCatalogError("version_conflict"),
  );
  assert.throws(
    () => service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a", {
      expectedRevision: 0,
      idempotencyKey: "lost-update-attempt",
      sequence: 3,
    })),
    expectCatalogError("revision_conflict"),
  );
  service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a", {
    expectedRevision: 1,
    idempotencyKey: "upgrade-to-version-three",
    sequence: 3,
    versionId: "asset-a-version-3",
  }));
  assert.throws(
    () => service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-b", {
      idempotencyKey: "reused-version-identifier",
      sequence: 2,
      versionId: "asset-a-version-2",
    })),
    expectCatalogError("version_conflict"),
  );
});

test("M2 version binding fails closed for inaccessible and mismatched immutable versions", async () => {
  const binding: CatalogVersionBinding = {
    assetId: "asset-a",
    versionId: "asset-a-version-2",
    sequence: 2,
    checksum: CHECKSUM_A,
  };
  await assert.doesNotReject(assertAccessibleVersionBinding(bindingClient({
    data: { id: binding.versionId, asset_id: binding.assetId, version_number: 2 },
    error: null,
  }), binding));
  await assert.rejects(
    assertAccessibleVersionBinding(bindingClient({
      data: { id: binding.versionId, asset_id: binding.assetId, version_number: 1 },
      error: null,
    }), binding),
    expectCatalogError("version_conflict"),
  );
  await assert.rejects(
    assertAccessibleVersionBinding(bindingClient({ data: null, error: new Error("unavailable") }), binding),
    expectCatalogError("not_found"),
  );
});

test("idempotency replays the original result and rejects key reuse with changed payload", () => {
  const { repository, service } = harness();
  const input = ingestInput("tenant-a", "asset-a", { idempotencyKey: "stable-ingest-key" });
  const first = service.ingest(principal("tenant-a"), input);
  const replay = service.ingest(principal("tenant-a"), { ...input, requestId: "retry-request" });

  assert.equal(first.item.revision, 1);
  assert.equal(replay.item.revision, 1);
  assert.equal(replay.receipt.operationId, first.receipt.operationId);
  assert.equal(replay.receipt.outcome, "replayed");
  assert.equal(repository.getGeneration("tenant-a"), 1, "a replay cannot mutate catalog state");

  first.item.metadata.tags.push("caller-only-change");
  assert.deepEqual(
    repository.getItem("tenant-a", "asset-a")?.metadata.tags,
    ["campaign", "video"],
    "returned values cannot mutate repository state",
  );

  assert.throws(
    () => service.ingest(principal("tenant-a"), {
      ...input,
      requestId: "changed-request",
      metadata: { ...input.metadata, title: "Changed payload" },
    }),
    expectCatalogError("idempotency_conflict"),
  );
});

test("lifecycle changes are reversible, non-destructive, and protected from stale reverts", () => {
  const { service } = harness();
  const ingested = service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a"));
  const hidden = service.transition(principal("tenant-a", "admin"), {
    tenantId: "tenant-a",
    assetId: "asset-a",
    targetState: "hidden",
    expectedRevision: 1,
    idempotencyKey: "hide-asset-a",
    requestId: "hide-request",
  });
  assert.equal(hidden.item.lifecycleState, "hidden");
  assert.equal(service.discover(principal("tenant-a", "viewer"), {
    tenantId: "tenant-a",
    query: "",
    tags: [],
    limit: 25,
    requestId: "hidden-viewer",
  }).items.length, 0);

  const restored = service.revert(principal("tenant-a"), {
    tenantId: "tenant-a",
    operationId: hidden.receipt.operationId,
    expectedRevision: 2,
    idempotencyKey: "revert-hide-asset-a",
    requestId: "revert-hide-request",
  });
  assert.equal(restored.item.lifecycleState, "active");
  assert.equal(restored.item.revision, 3);
  assert.throws(
    () => service.revert(principal("tenant-a"), {
      tenantId: "tenant-a",
      operationId: ingested.receipt.operationId,
      expectedRevision: 3,
      idempotencyKey: "unsafe-old-revert",
      requestId: "unsafe-old-revert-request",
    }),
    expectCatalogError("operation_not_reversible"),
  );

  const initial = service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-b"));
  const withdrawn = service.revert(principal("tenant-a"), {
    tenantId: "tenant-a",
    operationId: initial.receipt.operationId,
    expectedRevision: 1,
    idempotencyKey: "revert-initial-asset-b",
    requestId: "revert-initial-request",
  });
  assert.equal(withdrawn.item.lifecycleState, "withdrawn");
  assert.equal(withdrawn.item.revision, 2, "initial revert retains a tombstoned history instead of deleting");
});

test("discovery rejects malformed filters, cross-tenant cursors, stale snapshots, and oversized pages", () => {
  const { service } = harness();
  for (let index = 0; index < 105; index += 1) {
    service.ingest(
      principal("tenant-a"),
      ingestInput("tenant-a", `asset-${index.toString().padStart(3, "0")}`, {
        title: `Asset ${index.toString().padStart(3, "0")}`,
      }),
    );
  }
  service.ingest(principal("tenant-b"), ingestInput("tenant-b", "asset-b1"));
  service.ingest(principal("tenant-b"), ingestInput("tenant-b", "asset-b2"));

  assert.throws(
    () => service.discover(principal("tenant-a"), {
      tenantId: "tenant-a",
      query: "",
      tags: [],
      limit: 101,
      requestId: "oversized-limit",
    }),
    expectCatalogError("invalid_request"),
  );
  assert.throws(
    () => service.discover(principal("tenant-a"), {
      tenantId: "tenant-a",
      query: "x".repeat(121),
      tags: [],
      limit: 25,
      requestId: "oversized-query",
    }),
    expectCatalogError("invalid_request"),
  );
  assert.throws(
    () => service.discover(principal("tenant-a"), {
      tenantId: "tenant-a",
      query: "",
      tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
      limit: 25,
      requestId: "oversized-tags",
    }),
    expectCatalogError("invalid_request"),
  );
  assert.throws(
    () => service.discover(principal("tenant-a"), {
      tenantId: "tenant-a",
      query: "",
      tags: [],
      limit: 25,
      cursor: "not-a-cursor",
      requestId: "bad-cursor",
    }),
    expectCatalogError("invalid_cursor"),
  );

  const firstPage = service.discover(principal("tenant-a"), {
    tenantId: "tenant-a",
    query: "",
    tags: [],
    limit: 100,
    requestId: "bounded-page",
  });
  assert.equal(firstPage.items.length, 100);
  assert.ok(firstPage.nextCursor);

  assert.throws(
    () => service.discover(principal("tenant-a"), {
      tenantId: "tenant-a",
      query: "asset",
      tags: [],
      limit: 100,
      cursor: firstPage.nextCursor,
      requestId: "changed-filter-cursor",
    }),
    expectCatalogError("invalid_cursor"),
  );

  assert.throws(
    () => service.discover(principal("tenant-b"), {
      tenantId: "tenant-b",
      query: "",
      tags: [],
      limit: 100,
      cursor: firstPage.nextCursor,
      requestId: "cross-tenant-cursor",
    }),
    expectCatalogError("invalid_cursor"),
  );

  service.transition(principal("tenant-a"), {
    tenantId: "tenant-a",
    assetId: "asset-000",
    targetState: "archived",
    expectedRevision: 1,
    idempotencyKey: "archive-after-page",
    requestId: "archive-after-page-request",
  });
  assert.throws(
    () => service.discover(principal("tenant-a"), {
      tenantId: "tenant-a",
      query: "",
      tags: [],
      limit: 100,
      cursor: firstPage.nextCursor,
      requestId: "stale-cursor",
    }),
    expectCatalogError("stale_cursor"),
  );
});

test("audit receipts are tenant-scoped, normalized, and role protected", () => {
  const { service } = harness();
  service.ingest(principal("tenant-a"), ingestInput("tenant-a", "asset-a"));
  service.ingest(principal("tenant-b"), ingestInput("tenant-b", "asset-b"));

  assert.throws(
    () => service.audit(principal("tenant-a", "viewer"), 100, "denied-audit"),
    expectCatalogError("forbidden"),
  );
  const audit = service.audit(principal("tenant-a", "admin"), 100, "allowed-audit");
  assert.ok(audit.receipts.length >= 2);
  assert.ok(audit.receipts.every((receipt) => receipt.tenantId === "tenant-a"));
  assert.ok(audit.receipts.every((receipt) => receipt.schemaVersion === "catalog.receipt.v1"));
  assert.ok(audit.receipts.some((receipt) => receipt.outcome === "denied"));
  assert.equal(audit.receipt.action, "audit");
  assert.equal(audit.receipt.outcome, "read");
});

test("observer failures are measured without changing a successful mutation outcome", () => {
  const repository = new MemoryCatalogRepository();
  const observedErrors: string[] = [];
  const originalConsoleError = console.error;
  console.error = (message?: unknown) => observedErrors.push(String(message));
  try {
    const service = new CatalogService({
      repository,
      onReceipt: () => {
        throw new Error("simulated observer outage");
      },
    });
    const result = service.ingest(
      principal("tenant-a"),
      ingestInput("tenant-a", "asset-observer"),
    );
    assert.equal(result.receipt.outcome, "applied");
    assert.equal(repository.getItem("tenant-a", "asset-observer")?.revision, 1);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(observedErrors.length, 1);
  assert.match(observedErrors[0] ?? "", /catalog\.control_plane\.observer_error/);
  assert.doesNotMatch(observedErrors[0] ?? "", /simulated observer outage/);
});

test("failure guidance distinguishes safe retries from request correction", () => {
  const internal = asCatalogError(new Error("database details must not escape"));
  assert.equal(internal.code, "internal_error");
  assert.equal(internal.status, 500);
  assert.doesNotMatch(internal.message, /database details/);
  assert.deepEqual(catalogRecoveryGuidance(internal), {
    retryable: true,
    recovery: "No change is confirmed. Retry later with the same idempotency key or contact support.",
  });

  const conflict = new CatalogError("idempotency_conflict", "conflict", 409);
  assert.deepEqual(catalogRecoveryGuidance(conflict), {
    retryable: false,
    recovery: "Keep the original payload for this key or submit the changed payload with a new key.",
  });
});

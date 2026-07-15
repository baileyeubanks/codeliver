import assert from "node:assert/strict";
import test from "node:test";
import { createOperationalAssessment } from "./assessment";
import {
  OPERATIONS_CONFIG_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  OPERATIONS_SNAPSHOT_VERSION,
  OperationsError,
  type OperationsAuthority,
  type OperationsPermission,
  type OperationsRole,
} from "./contracts";
import { collectDiagnostics, type LocalRuntimeSnapshot } from "./diagnostics";
import { OperationsIdempotencyLedger } from "./idempotency";
import { planRecovery, type RecoverySnapshot } from "./recovery";
import { evaluateSlos } from "./slo";
import { createSupportBundle } from "./support-bundle";

const now = new Date("2026-07-14T15:00:00.000Z");
const envelope = {
  schemaVersion: OPERATIONS_SCHEMA_VERSION,
  configVersion: OPERATIONS_CONFIG_VERSION,
  tenantId: "tenant-a",
  idempotencyKey: "request-1",
};

function authority(
  role: OperationsRole = "owner",
  permissions: OperationsPermission[] = [
    "operations.evaluate_slo",
    "operations.read_diagnostics",
    "operations.create_support_bundle",
    "operations.plan_recovery",
  ],
): OperationsAuthority {
  return { actorId: "actor-a", tenantId: "tenant-a", role, permissions: new Set(permissions) };
}

function runtimeSnapshot(overrides: Partial<LocalRuntimeSnapshot> = {}): LocalRuntimeSnapshot {
  return {
    tenantId: "tenant-a",
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    sourceVersion: OPERATIONS_CONFIG_VERSION,
    runtimeName: "node",
    runtimeVersion: "v24.13.0",
    uptimeSeconds: 100,
    residentMemoryBytes: 1_000,
    heapUsedBytes: 50,
    heapTotalBytes: 100,
    eventLoopDelayMilliseconds: 2,
    collectedAt: now.toISOString(),
    ...overrides,
  };
}

function recoverySnapshot(overrides: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
  return {
    tenantId: "tenant-a",
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    sourceVersion: OPERATIONS_CONFIG_VERSION,
    capturedAt: now.toISOString(),
    ...overrides,
  };
}

function sloInput(overrides: Record<string, unknown> = {}) {
  return {
    ...envelope,
    windowStart: "2026-07-14T14:00:00.000Z",
    windowEnd: "2026-07-14T15:00:00.000Z",
    indicators: [{
      indicatorId: "availability",
      targetRatio: 0.99,
      goodEvents: 99,
      totalEvents: 100,
      observedAt: "2026-07-14T14:30:00.000Z",
      sourceTenantId: "tenant-a",
      sourceVersion: OPERATIONS_CONFIG_VERSION,
    }],
    ...overrides,
  };
}

function supportInput(overrides: Record<string, unknown> = {}) {
  return {
    ...envelope,
    expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    entries: [{
      key: "runtime",
      tenantId: "tenant-a",
      sourceVersion: OPERATIONS_CONFIG_VERSION,
      visibility: "admin",
      value: { status: "ok" },
    }],
    ...overrides,
  };
}

function recoveryInput(overrides: Record<string, unknown> = {}) {
  return {
    ...envelope,
    expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    dryRun: true,
    intent: "restore_read_only",
    ...overrides,
  };
}

function expectCode(code: OperationsError["code"], action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof OperationsError && error.code === code);
}

test("SLO thresholds are inclusive and zero evidence stays unknown", () => {
  const met = evaluateSlos(authority(), sloInput(), new OperationsIdempotencyLedger(), now);
  assert.equal(met.status, "met");
  assert.equal(met.indicators[0].errorBudgetRemaining, 0);
  const unknown = evaluateSlos(
    authority(),
    sloInput({ idempotencyKey: "request-2", indicators: [{
      indicatorId: "availability",
      targetRatio: 0.99,
      goodEvents: 0,
      totalEvents: 0,
      observedAt: "2026-07-14T14:30:00.000Z",
      sourceTenantId: "tenant-a",
      sourceVersion: OPERATIONS_CONFIG_VERSION,
    }] }),
    new OperationsIdempotencyLedger(),
    now,
  );
  assert.equal(unknown.status, "insufficient_evidence");
});

test("SLO evidence cannot cross tenants or use a stale contract", () => {
  const indicator = (sloInput().indicators as Array<Record<string, unknown>>)[0];
  expectCode("TENANT_MISMATCH", () => evaluateSlos(
    authority(), sloInput({ indicators: [{ ...indicator, sourceTenantId: "tenant-b" }] }), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("STALE_BINDING", () => evaluateSlos(
    authority(), sloInput({ indicators: [{ ...indicator, sourceVersion: "old" }] }), new OperationsIdempotencyLedger(), now,
  ));
});

test("diagnostics require permission and a tenant/version-bound server snapshot", () => {
  const request = { ...envelope, expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION, checks: ["runtime", "memory"] };
  const result = collectDiagnostics(authority(), request, runtimeSnapshot(), new OperationsIdempotencyLedger(), now);
  assert.equal(result.status, "within_bounds");
  assert.equal(result.snapshotVersion, OPERATIONS_SNAPSHOT_VERSION);
  expectCode("FORBIDDEN", () => collectDiagnostics(
    authority("viewer", []), request, runtimeSnapshot(), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("TENANT_MISMATCH", () => collectDiagnostics(
    authority(), request, runtimeSnapshot({ tenantId: "tenant-b" }), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("STALE_BINDING", () => collectDiagnostics(
    authority(), { ...request, expectedSnapshotVersion: "old" }, runtimeSnapshot(), new OperationsIdempotencyLedger(), now,
  ));
});

test("diagnostics reject client-supplied telemetry and malformed resource data", () => {
  expectCode("INVALID_REQUEST", () => collectDiagnostics(
    authority(),
    { ...envelope, expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION, checks: ["memory"], telemetry: { heap: 0 } },
    runtimeSnapshot(), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("INVALID_REQUEST", () => collectDiagnostics(
    authority(),
    { ...envelope, expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION, checks: ["memory"] },
    runtimeSnapshot({ heapUsedBytes: 101 }), new OperationsIdempotencyLedger(), now,
  ));
});

test("support bundles filter owner-only entries and redact secrets, PII, and log injection", () => {
  const input = supportInput({ entries: [
    {
      key: "runtime", tenantId: "tenant-a", sourceVersion: OPERATIONS_CONFIG_VERSION, visibility: "admin",
      value: { authorization: "Bearer abc", line: "hello\r\nforged", email: "person@example.com" },
    },
    {
      key: "owner_notes", tenantId: "tenant-a", sourceVersion: OPERATIONS_CONFIG_VERSION, visibility: "owner",
      value: "owner only",
    },
  ] });
  const result = createSupportBundle(
    authority("admin", ["operations.create_support_bundle"]), input, new OperationsIdempotencyLedger(), now,
  );
  assert.equal(result.omittedEntryCount, 1);
  assert.ok(result.redactionCount >= 2);
  const serialized = JSON.stringify(result.entries);
  assert.doesNotMatch(serialized, /person@example\.com|Bearer abc|\r|\n/);
  assert.equal(result.archive, "not_created");
});

test("support bundle isolation and collection bounds fail closed", () => {
  const entry = (supportInput().entries as Array<Record<string, unknown>>)[0];
  expectCode("TENANT_MISMATCH", () => createSupportBundle(
    authority(), supportInput({ entries: [{ ...entry, tenantId: "tenant-b" }] }), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("LIMIT_EXCEEDED", () => createSupportBundle(
    authority(), supportInput({ entries: [{ ...entry, value: Array.from({ length: 51 }, () => "x") }] }), new OperationsIdempotencyLedger(), now,
  ));
});

test("recovery produces a cancelable, non-executable plan only", () => {
  const result = planRecovery(
    authority(), recoveryInput(), recoverySnapshot(), new OperationsIdempotencyLedger(), now,
  );
  assert.equal(result.plan.executionAllowed, false);
  assert.equal(result.plan.executionState, "not_executed");
  assert.equal(result.plan.cancelable, true);
  assert.ok(result.plan.steps.every((step) => step.mutation === "none_planned"));
});

test("recovery rejects execution fields, stale evidence, unsafe intents, and non-owners", () => {
  expectCode("UNSAFE_RECOVERY", () => planRecovery(
    authority(), recoveryInput({ execute: true }), recoverySnapshot(), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("STALE_BINDING", () => planRecovery(
    authority(), recoveryInput(), recoverySnapshot({ capturedAt: "2026-07-14T14:00:00.000Z" }), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("UNSAFE_RECOVERY", () => planRecovery(
    authority(), recoveryInput({ intent: "delete_tenant" }), recoverySnapshot(), new OperationsIdempotencyLedger(), now,
  ));
  expectCode("FORBIDDEN", () => planRecovery(
    authority("admin", ["operations.read_diagnostics"]), recoveryInput(), recoverySnapshot(), new OperationsIdempotencyLedger(), now,
  ));
});

test("idempotent replay is deterministic and conflicting key reuse is rejected", () => {
  const ledger = new OperationsIdempotencyLedger();
  const first = planRecovery(authority(), recoveryInput(), recoverySnapshot(), ledger, now);
  const replay = planRecovery(authority(), recoveryInput(), recoverySnapshot(), ledger, new Date(now.getTime() + 1_000));
  assert.equal(first.plan.planId, replay.plan.planId);
  assert.equal(replay.receipt.replayed, true);
  expectCode("IDEMPOTENCY_COLLISION", () => planRecovery(
    authority(), recoveryInput({ intent: "drain_failed_jobs" }), recoverySnapshot(), ledger, now,
  ));
});

test("observations correlate receipts without raw tenant or actor identifiers", () => {
  const result = evaluateSlos(authority(), sloInput(), new OperationsIdempotencyLedger(), now);
  assert.equal(result.observation.receiptId, result.receipt.receiptId);
  assert.notEqual(result.observation.tenantRef, "tenant-a");
  assert.notEqual(result.observation.actorRef, "actor-a");
});

test("a complete assessment binds every proof to one snapshot and executes nothing", () => {
  const input = {
    ...envelope,
    slo: {
      windowStart: "2026-07-14T14:00:00.000Z",
      windowEnd: "2026-07-14T15:00:00.000Z",
      indicators: sloInput().indicators,
    },
    diagnostics: { expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION, checks: ["runtime", "memory"] },
    supportBundle: {
      expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
      snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
      entries: supportInput().entries,
    },
    recovery: {
      expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
      dryRun: true,
      intent: "restore_read_only",
    },
  };
  const result = createOperationalAssessment(
    authority(), input, runtimeSnapshot(), recoverySnapshot(), new OperationsIdempotencyLedger(), now,
  );
  assert.equal(result.status, "ready");
  assert.equal(result.snapshotVersion, OPERATIONS_SNAPSHOT_VERSION);
  assert.equal(result.recovery.plan.executionAllowed, false);
  assert.equal(result.receipt.operation, "assessment.create");
});

test("assessment fails if any section requests a different snapshot contract", () => {
  expectCode("STALE_BINDING", () => createOperationalAssessment(
    authority(),
    {
      ...envelope,
      slo: {},
      diagnostics: { expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION },
      supportBundle: { expectedSnapshotVersion: "old" },
      recovery: { expectedSnapshotVersion: OPERATIONS_SNAPSHOT_VERSION },
    },
    runtimeSnapshot(), recoverySnapshot(), new OperationsIdempotencyLedger(), now,
  ));
});

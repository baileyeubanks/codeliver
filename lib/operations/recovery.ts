import {
  OPERATIONS_CONFIG_VERSION,
  OPERATIONS_LIMITS,
  OPERATIONS_SNAPSHOT_VERSION,
  OperationsError,
  digest,
  makeObservation,
  makeReceipt,
  parseEnvelope,
  requireScope,
  type OperationObservation,
  type OperationReceipt,
  type OperationsAuthority,
} from "./contracts";
import { OperationsIdempotencyLedger } from "./idempotency";

type RecoveryIntent = "restore_read_only" | "drain_failed_jobs" | "rebuild_derived_indexes";

const RECOVERY_STEPS: Record<RecoveryIntent, readonly string[]> = {
  restore_read_only: [
    "Verify the bound snapshot remains current.",
    "Prepare a tenant-scoped read-only configuration change for separate approval.",
    "Verify tenant reads and retain the prior configuration for rollback.",
  ],
  drain_failed_jobs: [
    "Verify the bound snapshot and isolate failed tenant jobs.",
    "Prepare a bounded retry set with deduplication keys for separate approval.",
    "Observe retry outcomes and preserve the original failed-job records.",
  ],
  rebuild_derived_indexes: [
    "Verify the bound snapshot and identify tenant-scoped derived indexes.",
    "Prepare a shadow rebuild with no source-record mutations for separate approval.",
    "Compare shadow and active indexes before any separately approved switchover.",
  ],
};

export interface RecoveryPlanResult {
  tenantId: string;
  snapshotVersion: string;
  plan: {
    planId: string;
    intent: RecoveryIntent;
    state: "proposed";
    executionState: "not_executed";
    executionAllowed: false;
    cancelable: true;
    expiresAt: string;
    steps: Array<{ ordinal: number; instruction: string; mutation: "none_planned" }>;
    cancellation: { method: "discard_plan"; effect: "no_runtime_change" };
  };
  guidance: string;
  receipt: OperationReceipt;
  observation: OperationObservation;
}

export interface RecoverySnapshot {
  tenantId: string;
  snapshotVersion: typeof OPERATIONS_SNAPSHOT_VERSION;
  sourceVersion: typeof OPERATIONS_CONFIG_VERSION;
  capturedAt: string;
}

function boundedId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new OperationsError("INVALID_REQUEST", `${field} is invalid.`);
  }
  return value;
}

export function planRecovery(
  authority: OperationsAuthority,
  unknownInput: unknown,
  snapshot: RecoverySnapshot,
  ledger: OperationsIdempotencyLedger,
  now: Date,
): RecoveryPlanResult {
  const envelope = parseEnvelope(unknownInput);
  requireScope(authority, envelope, "operations.plan_recovery");
  const input = unknownInput as Record<string, unknown>;
  for (const unsafeField of ["execute", "apply", "approve", "confirmed", "actorId", "role", "permissions"]) {
    if (unsafeField in input) {
      throw new OperationsError("UNSAFE_RECOVERY", `Recovery planning does not accept ${unsafeField}.`, 409);
    }
  }
  if (input.dryRun !== true) {
    throw new OperationsError("UNSAFE_RECOVERY", "Recovery requests must explicitly set dryRun to true.", 409);
  }
  const expectedSnapshotVersion = boundedId(input.expectedSnapshotVersion, "expectedSnapshotVersion");
  if (
    expectedSnapshotVersion !== OPERATIONS_SNAPSHOT_VERSION ||
    snapshot.snapshotVersion !== OPERATIONS_SNAPSHOT_VERSION ||
    snapshot.sourceVersion !== OPERATIONS_CONFIG_VERSION
  ) {
    throw new OperationsError("STALE_BINDING", "Recovery planning is bound to another snapshot.", 409);
  }
  if (snapshot.tenantId !== envelope.tenantId) {
    throw new OperationsError("TENANT_MISMATCH", "Recovery evidence belongs to another tenant.", 403);
  }
  const capturedAt = Date.parse(snapshot.capturedAt);
  if (
    !Number.isFinite(capturedAt) ||
    capturedAt > now.getTime() ||
    now.getTime() - capturedAt > OPERATIONS_LIMITS.maximumSnapshotAgeMilliseconds
  ) {
    throw new OperationsError("STALE_BINDING", "Recovery evidence is stale or from the future.", 409);
  }
  if (typeof input.intent !== "string" || !(input.intent in RECOVERY_STEPS)) {
    throw new OperationsError("UNSAFE_RECOVERY", "Recovery intent is not in the fail-closed allowlist.", 409);
  }
  const intent = input.intent as RecoveryIntent;
  const instructions = RECOVERY_STEPS[intent];
  if (instructions.length > OPERATIONS_LIMITS.maximumRecoverySteps) {
    throw new OperationsError("LIMIT_EXCEEDED", "Recovery plan exceeds its step bound.", 413);
  }

  return ledger.run("recovery.plan", envelope, unknownInput, (requestDigest) => {
    const issuedAt = now.toISOString();
    const receipt = makeReceipt("recovery.plan", envelope, requestDigest, issuedAt);
    return {
      tenantId: envelope.tenantId,
      snapshotVersion: snapshot.snapshotVersion,
      plan: {
        planId: `opplan_${digest({ tenantId: envelope.tenantId, snapshotVersion: snapshot.snapshotVersion, intent, requestDigest }).slice(0, 32)}`,
        intent,
        state: "proposed" as const,
        executionState: "not_executed" as const,
        executionAllowed: false as const,
        cancelable: true as const,
        expiresAt: new Date(now.getTime() + OPERATIONS_LIMITS.maximumSnapshotAgeMilliseconds).toISOString(),
        steps: instructions.map((instruction, index) => ({
          ordinal: index + 1,
          instruction,
          mutation: "none_planned" as const,
        })),
        cancellation: { method: "discard_plan" as const, effect: "no_runtime_change" as const },
      },
      guidance: "This receipt proves planning only. Discard the plan to cancel; execution requires a separate, owner-approved control plane that is not present here.",
      receipt,
      observation: makeObservation(authority, receipt, "planned"),
    };
  });
}

export function readRecoverySnapshot(tenantId: string, now: Date): RecoverySnapshot {
  return {
    tenantId,
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    sourceVersion: OPERATIONS_CONFIG_VERSION,
    capturedAt: now.toISOString(),
  };
}

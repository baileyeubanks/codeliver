import { createHash } from "node:crypto";

export const OPERATIONS_SCHEMA_VERSION = "m4.operations.v1" as const;
export const OPERATIONS_CONFIG_VERSION = "m4.operations.config.v1" as const;
export const OPERATIONS_SNAPSHOT_VERSION = "m4.operations.local-snapshot.v1" as const;

export const OPERATIONS_LIMITS = Object.freeze({
  maximumRequestBytes: 128 * 1024,
  maximumIndicators: 50,
  maximumWindowMilliseconds: 31 * 24 * 60 * 60 * 1000,
  maximumDiagnosticChecks: 20,
  maximumSnapshotAgeMilliseconds: 15 * 60 * 1000,
  maximumBundleBytes: 64 * 1024,
  maximumBundleEntries: 100,
  maximumCollectionEntries: 50,
  maximumValueDepth: 6,
  maximumStringLength: 2_000,
  maximumRecoverySteps: 12,
  maximumLedgerEntries: 1_000,
});

export type OperationsRole = "viewer" | "member" | "admin" | "owner";
export type OperationsPermission =
  | "operations.evaluate_slo"
  | "operations.read_diagnostics"
  | "operations.create_support_bundle"
  | "operations.plan_recovery";

export interface OperationsAuthority {
  actorId: string;
  tenantId: string;
  role: OperationsRole;
  permissions: ReadonlySet<OperationsPermission>;
}

export interface OperationsEnvelope {
  schemaVersion: typeof OPERATIONS_SCHEMA_VERSION;
  configVersion: typeof OPERATIONS_CONFIG_VERSION;
  tenantId: string;
  idempotencyKey: string;
}

export interface OperationReceipt {
  receiptId: string;
  operation: string;
  tenantId: string;
  schemaVersion: typeof OPERATIONS_SCHEMA_VERSION;
  configVersion: typeof OPERATIONS_CONFIG_VERSION;
  idempotencyKey: string;
  requestDigest: string;
  issuedAt: string;
  replayed: boolean;
}

export interface OperationObservation {
  event: "enterprise_operation_completed";
  operation: string;
  outcome: "computed" | "planned";
  tenantRef: string;
  actorRef: string;
  receiptId: string;
  schemaVersion: typeof OPERATIONS_SCHEMA_VERSION;
  configVersion: typeof OPERATIONS_CONFIG_VERSION;
  occurredAt: string;
}

export class OperationsError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "STALE_BINDING"
      | "FORBIDDEN"
      | "TENANT_MISMATCH"
      | "IDEMPOTENCY_COLLISION"
      | "LIMIT_EXCEEDED"
      | "UNSAFE_RECOVERY",
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "OperationsError";
  }
}

export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function requireIdentifier(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)
  ) {
    throw new OperationsError(
      "INVALID_REQUEST",
      `${field} must be a non-empty bounded identifier.`,
    );
  }
}

export function parseEnvelope(value: unknown): OperationsEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationsError("INVALID_REQUEST", "A request object is required.");
  }

  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== OPERATIONS_SCHEMA_VERSION) {
    throw new OperationsError(
      "STALE_BINDING",
      `schemaVersion must be ${OPERATIONS_SCHEMA_VERSION}.`,
      409,
    );
  }
  if (input.configVersion !== OPERATIONS_CONFIG_VERSION) {
    throw new OperationsError(
      "STALE_BINDING",
      `configVersion must be ${OPERATIONS_CONFIG_VERSION}.`,
      409,
    );
  }

  requireIdentifier(input.tenantId, "tenantId");
  requireIdentifier(input.idempotencyKey, "idempotencyKey");

  return {
    schemaVersion: OPERATIONS_SCHEMA_VERSION,
    configVersion: OPERATIONS_CONFIG_VERSION,
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
  };
}

export function requireScope(
  authority: OperationsAuthority,
  envelope: OperationsEnvelope,
  permission: OperationsPermission,
): void {
  if (authority.tenantId !== envelope.tenantId) {
    throw new OperationsError(
      "TENANT_MISMATCH",
      "The requested tenant is outside the authorized scope.",
      403,
    );
  }
  if (!authority.permissions.has(permission)) {
    throw new OperationsError(
      "FORBIDDEN",
      "The server-derived role does not allow this operation.",
      403,
    );
  }
}

export function makeReceipt(
  operation: string,
  envelope: OperationsEnvelope,
  requestDigest: string,
  issuedAt: string,
): OperationReceipt {
  const receiptId = `oprec_${digest({
    operation,
    tenantId: envelope.tenantId,
    schemaVersion: envelope.schemaVersion,
    configVersion: envelope.configVersion,
    idempotencyKey: envelope.idempotencyKey,
    requestDigest,
  }).slice(0, 32)}`;

  return {
    receiptId,
    operation,
    tenantId: envelope.tenantId,
    schemaVersion: envelope.schemaVersion,
    configVersion: envelope.configVersion,
    idempotencyKey: envelope.idempotencyKey,
    requestDigest,
    issuedAt,
    replayed: false,
  };
}

export function makeObservation(
  authority: OperationsAuthority,
  receipt: OperationReceipt,
  outcome: OperationObservation["outcome"],
): OperationObservation {
  return {
    event: "enterprise_operation_completed",
    operation: receipt.operation,
    outcome,
    tenantRef: digest(authority.tenantId).slice(0, 16),
    actorRef: digest(authority.actorId).slice(0, 16),
    receiptId: receipt.receiptId,
    schemaVersion: OPERATIONS_SCHEMA_VERSION,
    configVersion: OPERATIONS_CONFIG_VERSION,
    occurredAt: receipt.issuedAt,
  };
}

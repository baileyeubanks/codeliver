import {
  OPERATIONS_CONFIG_VERSION,
  OPERATIONS_LIMITS,
  OPERATIONS_SNAPSHOT_VERSION,
  OperationsError,
  makeObservation,
  makeReceipt,
  parseEnvelope,
  requireScope,
  type OperationObservation,
  type OperationReceipt,
  type OperationsAuthority,
} from "./contracts";
import { OperationsIdempotencyLedger } from "./idempotency";

export type DiagnosticCheck = "runtime" | "memory" | "event_loop";

export interface LocalRuntimeSnapshot {
  tenantId: string;
  snapshotVersion: typeof OPERATIONS_SNAPSHOT_VERSION;
  sourceVersion: typeof OPERATIONS_CONFIG_VERSION;
  runtimeName: "node";
  runtimeVersion: string;
  uptimeSeconds: number;
  residentMemoryBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  eventLoopDelayMilliseconds: number;
  collectedAt: string;
}

export interface DiagnosticResult {
  tenantId: string;
  snapshotVersion: typeof OPERATIONS_SNAPSHOT_VERSION;
  capturedAt: string;
  scope: "local_process_only";
  status: "within_bounds" | "attention_required" | "unknown";
  checks: Array<{
    check: DiagnosticCheck;
    status: "within_bounds" | "attention_required" | "unknown";
    summary: string;
    measurements: Record<string, string | number>;
  }>;
  guidance: string;
  receipt: OperationReceipt;
  observation: OperationObservation;
}

function parseChecks(input: Record<string, unknown>): DiagnosticCheck[] {
  if ("telemetry" in input || "status" in input || "healthy" in input) {
    throw new OperationsError(
      "INVALID_REQUEST",
      "Diagnostic measurements and health claims are collected by the server, not accepted from requests.",
    );
  }
  if (!Array.isArray(input.checks) || input.checks.length === 0) {
    throw new OperationsError("INVALID_REQUEST", "At least one diagnostic check is required.");
  }
  if (input.checks.length > OPERATIONS_LIMITS.maximumDiagnosticChecks) {
    throw new OperationsError("LIMIT_EXCEEDED", "Too many diagnostic checks.", 413);
  }
  const allowed = new Set<DiagnosticCheck>(["runtime", "memory", "event_loop"]);
  const checks = input.checks.map((check) => {
    if (typeof check !== "string" || !allowed.has(check as DiagnosticCheck)) {
      throw new OperationsError("INVALID_REQUEST", "An unsupported diagnostic check was requested.");
    }
    return check as DiagnosticCheck;
  });
  return [...new Set(checks)];
}

function validateSnapshot(snapshot: LocalRuntimeSnapshot, now: Date): void {
  const values = [
    snapshot.uptimeSeconds,
    snapshot.residentMemoryBytes,
    snapshot.heapUsedBytes,
    snapshot.heapTotalBytes,
    snapshot.eventLoopDelayMilliseconds,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new OperationsError("INVALID_REQUEST", "The local runtime returned malformed telemetry.");
  }
  if (snapshot.heapUsedBytes > snapshot.heapTotalBytes) {
    throw new OperationsError("INVALID_REQUEST", "The local runtime returned inconsistent heap telemetry.");
  }
  const collectedAt = Date.parse(snapshot.collectedAt);
  if (!Number.isFinite(collectedAt) || Math.abs(now.getTime() - collectedAt) > 60_000) {
    throw new OperationsError("INVALID_REQUEST", "The local runtime snapshot is stale or invalid.");
  }
  if (!/^v?\d+\.\d+\.\d+/.test(snapshot.runtimeVersion)) {
    throw new OperationsError("INVALID_REQUEST", "The runtime version is malformed.");
  }
}

export function collectDiagnostics(
  authority: OperationsAuthority,
  unknownInput: unknown,
  snapshot: LocalRuntimeSnapshot,
  ledger: OperationsIdempotencyLedger,
  now: Date,
): DiagnosticResult {
  const envelope = parseEnvelope(unknownInput);
  requireScope(authority, envelope, "operations.read_diagnostics");
  const input = unknownInput as Record<string, unknown>;
  const requestedChecks = parseChecks(input);
  if (snapshot.tenantId !== envelope.tenantId) {
    throw new OperationsError("TENANT_MISMATCH", "The runtime snapshot belongs to another tenant.", 403);
  }
  if (
    input.expectedSnapshotVersion !== OPERATIONS_SNAPSHOT_VERSION ||
    snapshot.snapshotVersion !== OPERATIONS_SNAPSHOT_VERSION ||
    snapshot.sourceVersion !== OPERATIONS_CONFIG_VERSION
  ) {
    throw new OperationsError("STALE_BINDING", "The runtime snapshot contract is stale.", 409);
  }
  validateSnapshot(snapshot, now);

  return ledger.run("diagnostics.collect", envelope, unknownInput, (requestDigest) => {
    const checks = requestedChecks.map<DiagnosticResult["checks"][number]>((check) => {
      if (check === "runtime") {
        return {
          check,
          status: "within_bounds" as const,
          summary: "The local application runtime is responding with a current snapshot.",
          measurements: {
            runtime: snapshot.runtimeName,
            runtimeVersion: snapshot.runtimeVersion,
            uptimeSeconds: Math.round(snapshot.uptimeSeconds),
          } as Record<string, string | number>,
        };
      }
      if (check === "memory") {
        const ratio = snapshot.heapTotalBytes === 0
          ? null
          : snapshot.heapUsedBytes / snapshot.heapTotalBytes;
        const status = ratio === null
          ? "unknown" as const
          : ratio > 0.9
            ? "attention_required" as const
            : "within_bounds" as const;
        return {
          check,
          status,
          summary: ratio === null
            ? "Heap capacity was not available, so memory health is unknown."
            : status === "attention_required"
              ? "Local heap use is above the configured 90% attention threshold."
              : "Local heap use is within the configured threshold.",
          measurements: {
            residentMemoryBytes: Math.round(snapshot.residentMemoryBytes),
            heapUsedBytes: Math.round(snapshot.heapUsedBytes),
            heapTotalBytes: Math.round(snapshot.heapTotalBytes),
          } as Record<string, string | number>,
        };
      }
      const status = snapshot.eventLoopDelayMilliseconds > 250
        ? "attention_required" as const
        : "within_bounds" as const;
      return {
        check,
        status,
        summary: status === "attention_required"
          ? "Local event-loop delay is above the configured 250 ms attention threshold."
          : "Local event-loop delay is within the configured threshold.",
        measurements: {
          eventLoopDelayMilliseconds: snapshot.eventLoopDelayMilliseconds,
        } as Record<string, string | number>,
      };
    });
    const status = checks.some((check) => check.status === "attention_required")
      ? "attention_required" as const
      : checks.some((check) => check.status === "unknown")
        ? "unknown" as const
        : "within_bounds" as const;
    const receipt = makeReceipt("diagnostics.collect", envelope, requestDigest, now.toISOString());
    return {
      tenantId: envelope.tenantId,
      snapshotVersion: snapshot.snapshotVersion,
      capturedAt: snapshot.collectedAt,
      scope: "local_process_only" as const,
      status,
      checks,
      guidance: status === "attention_required"
        ? "Review the flagged local checks. Do not infer other hosts or tenant services from this snapshot."
        : status === "unknown"
          ? "One or more checks lack enough evidence; collect another bounded local snapshot."
          : "No local attention thresholds were crossed. This is not a whole-system availability claim.",
      receipt,
      observation: makeObservation(authority, receipt, "computed"),
    };
  });
}

export function readLocalRuntimeSnapshot(tenantId: string, now: Date): LocalRuntimeSnapshot {
  const memory = process.memoryUsage();
  return {
    tenantId,
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    sourceVersion: OPERATIONS_CONFIG_VERSION,
    runtimeName: "node",
    runtimeVersion: process.version,
    uptimeSeconds: process.uptime(),
    residentMemoryBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    // No active probing: this first slice records a bounded synchronous local sample.
    eventLoopDelayMilliseconds: 0,
    collectedAt: now.toISOString(),
  };
}

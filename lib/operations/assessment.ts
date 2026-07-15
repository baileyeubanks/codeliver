import {
  OperationsError,
  makeObservation,
  makeReceipt,
  parseEnvelope,
  type OperationObservation,
  type OperationReceipt,
  type OperationsAuthority,
} from "./contracts";
import {
  collectDiagnostics,
  type DiagnosticResult,
  type LocalRuntimeSnapshot,
} from "./diagnostics";
import { OperationsIdempotencyLedger } from "./idempotency";
import {
  planRecovery,
  type RecoveryPlanResult,
  type RecoverySnapshot,
} from "./recovery";
import { evaluateSlos, type SloEvaluationResult } from "./slo";
import { createSupportBundle, type SupportBundleResult } from "./support-bundle";

export interface OperationalAssessmentResult {
  tenantId: string;
  snapshotVersion: string;
  status: "ready" | "attention_required";
  slo: SloEvaluationResult;
  diagnostics: DiagnosticResult;
  supportBundle: SupportBundleResult;
  recovery: RecoveryPlanResult;
  guidance: string;
  receipt: OperationReceipt;
  observation: OperationObservation;
}

function section(input: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = input[name];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationsError("INVALID_REQUEST", `${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Compute a complete assessment without mutating runtime state. Each subsection
 * is validated in a disposable ledger, then the aggregate result is replayed
 * atomically from the caller-provided ledger.
 */
export function createOperationalAssessment(
  authority: OperationsAuthority,
  unknownInput: unknown,
  runtimeSnapshot: LocalRuntimeSnapshot,
  recoverySnapshot: RecoverySnapshot,
  ledger: OperationsIdempotencyLedger,
  now: Date,
): OperationalAssessmentResult {
  const envelope = parseEnvelope(unknownInput);
  const input = unknownInput as Record<string, unknown>;
  const sloInput: Record<string, unknown> = { ...section(input, "slo"), ...envelope };
  const diagnosticsInput: Record<string, unknown> = { ...section(input, "diagnostics"), ...envelope };
  const supportBundleInput: Record<string, unknown> = { ...section(input, "supportBundle"), ...envelope };
  const recoveryInput: Record<string, unknown> = { ...section(input, "recovery"), ...envelope };
  const versions = [
    diagnosticsInput.expectedSnapshotVersion,
    supportBundleInput.expectedSnapshotVersion,
    recoveryInput.expectedSnapshotVersion,
  ];
  if (typeof versions[0] !== "string" || versions.some((value) => value !== versions[0])) {
    throw new OperationsError("STALE_BINDING", "All assessment sections must bind the same snapshot version.", 409);
  }

  return ledger.run("assessment.create", envelope, unknownInput, (requestDigest) => {
    const slo = evaluateSlos(authority, sloInput, new OperationsIdempotencyLedger(), now);
    const diagnostics = collectDiagnostics(
      authority,
      diagnosticsInput,
      runtimeSnapshot,
      new OperationsIdempotencyLedger(),
      now,
    );
    const supportBundle = createSupportBundle(authority, supportBundleInput, new OperationsIdempotencyLedger(), now);
    const recovery = planRecovery(
      authority,
      recoveryInput,
      recoverySnapshot,
      new OperationsIdempotencyLedger(),
      now,
    );
    if (
      diagnostics.snapshotVersion !== supportBundle.snapshotVersion ||
      diagnostics.snapshotVersion !== recovery.snapshotVersion
    ) {
      throw new OperationsError("STALE_BINDING", "Assessment outputs diverged from the bound snapshot.", 409);
    }
    const status = slo.status === "met" && diagnostics.status === "within_bounds"
      ? "ready" as const
      : "attention_required" as const;
    const issuedAt = now.toISOString();
    const receipt = makeReceipt("assessment.create", envelope, requestDigest, issuedAt);
    return {
      tenantId: envelope.tenantId,
      snapshotVersion: diagnostics.snapshotVersion,
      status,
      slo,
      diagnostics,
      supportBundle,
      recovery,
      guidance: status === "ready"
        ? "The bound evidence is healthy. Keep the recovery plan unexecuted and reassess after the next snapshot."
        : "Attention is required. Review the redacted evidence and dry-run plan; this assessment cannot execute recovery.",
      receipt,
      observation: makeObservation(authority, receipt, "computed"),
    };
  });
}

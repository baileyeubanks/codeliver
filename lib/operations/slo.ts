import {
  OPERATIONS_LIMITS,
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

interface ParsedIndicator {
  indicatorId: string;
  targetRatio: number;
  goodEvents: number;
  totalEvents: number;
  observedAt: string;
  sourceTenantId: string;
  sourceVersion: string;
}

export interface SloEvaluationResult {
  tenantId: string;
  window: { start: string; end: string; durationMilliseconds: number };
  status: "met" | "breached" | "insufficient_evidence";
  indicators: Array<{
    indicatorId: string;
    status: "met" | "breached" | "insufficient_evidence";
    actualRatio: number | null;
    targetRatio: number;
    errorBudgetRemaining: number | null;
    guidance: string;
  }>;
  guidance: string;
  receipt: OperationReceipt;
  observation: OperationObservation;
}

function finiteInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new OperationsError("INVALID_REQUEST", `${field} must be a non-negative safe integer.`);
  }
  return value as number;
}

function parseIndicators(
  input: Record<string, unknown>,
  tenantId: string,
  windowStart: number,
  windowEnd: number,
): ParsedIndicator[] {
  if (!Array.isArray(input.indicators) || input.indicators.length === 0) {
    throw new OperationsError("INVALID_REQUEST", "At least one SLO indicator is required.");
  }
  if (input.indicators.length > OPERATIONS_LIMITS.maximumIndicators) {
    throw new OperationsError("LIMIT_EXCEEDED", "Too many SLO indicators.", 413);
  }

  const ids = new Set<string>();
  return input.indicators.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new OperationsError("INVALID_REQUEST", `indicators[${index}] must be an object.`);
    }
    const item = candidate as Record<string, unknown>;
    if ("status" in item || "healthy" in item || "reportedStatus" in item) {
      throw new OperationsError(
        "INVALID_REQUEST",
        "Indicator health must be computed; reported status fields are not accepted.",
      );
    }
    if (
      typeof item.indicatorId !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(item.indicatorId)
    ) {
      throw new OperationsError("INVALID_REQUEST", `indicators[${index}].indicatorId is invalid.`);
    }
    if (ids.has(item.indicatorId)) {
      throw new OperationsError("INVALID_REQUEST", "Indicator identifiers must be unique.");
    }
    ids.add(item.indicatorId);

    if (
      typeof item.targetRatio !== "number" ||
      !Number.isFinite(item.targetRatio) ||
      item.targetRatio <= 0 ||
      item.targetRatio > 1
    ) {
      throw new OperationsError("INVALID_REQUEST", "targetRatio must be greater than 0 and at most 1.");
    }
    const goodEvents = finiteInteger(item.goodEvents, "goodEvents");
    const totalEvents = finiteInteger(item.totalEvents, "totalEvents");
    if (goodEvents > totalEvents) {
      throw new OperationsError("INVALID_REQUEST", "goodEvents cannot exceed totalEvents.");
    }
    if (item.sourceTenantId !== tenantId) {
      throw new OperationsError(
        "TENANT_MISMATCH",
        "Indicator evidence belongs to a different tenant.",
        403,
      );
    }
    if (typeof item.sourceVersion !== "string" || item.sourceVersion !== input.configVersion) {
      throw new OperationsError("STALE_BINDING", "Indicator evidence has a stale source version.", 409);
    }
    if (typeof item.observedAt !== "string") {
      throw new OperationsError("INVALID_REQUEST", "observedAt is required.");
    }
    const observedAt = Date.parse(item.observedAt);
    if (!Number.isFinite(observedAt) || observedAt < windowStart || observedAt > windowEnd) {
      throw new OperationsError("INVALID_REQUEST", "Indicator evidence falls outside the bound window.");
    }

    return {
      indicatorId: item.indicatorId,
      targetRatio: item.targetRatio,
      goodEvents,
      totalEvents,
      observedAt: new Date(observedAt).toISOString(),
      sourceTenantId: item.sourceTenantId,
      sourceVersion: item.sourceVersion,
    };
  });
}

export function evaluateSlos(
  authority: OperationsAuthority,
  unknownInput: unknown,
  ledger: OperationsIdempotencyLedger,
  now: Date,
): SloEvaluationResult {
  const envelope = parseEnvelope(unknownInput);
  requireScope(authority, envelope, "operations.evaluate_slo");
  const input = unknownInput as Record<string, unknown>;
  if (typeof input.windowStart !== "string" || typeof input.windowEnd !== "string") {
    throw new OperationsError("INVALID_REQUEST", "windowStart and windowEnd are required.");
  }
  const windowStart = Date.parse(input.windowStart);
  const windowEnd = Date.parse(input.windowEnd);
  const duration = windowEnd - windowStart;
  if (
    !Number.isFinite(windowStart) ||
    !Number.isFinite(windowEnd) ||
    duration <= 0 ||
    duration > OPERATIONS_LIMITS.maximumWindowMilliseconds ||
    windowEnd > now.getTime()
  ) {
    throw new OperationsError(
      "INVALID_REQUEST",
      "The SLO window must be complete, positive, no longer than 31 days, and not in the future.",
    );
  }
  const indicators = parseIndicators(input, envelope.tenantId, windowStart, windowEnd);

  return ledger.run("slo.evaluate", envelope, unknownInput, (requestDigest) => {
    const evaluated = indicators.map((indicator) => {
      if (indicator.totalEvents === 0) {
        return {
          indicatorId: indicator.indicatorId,
          status: "insufficient_evidence" as const,
          actualRatio: null,
          targetRatio: indicator.targetRatio,
          errorBudgetRemaining: null,
          guidance: "No events were observed in this window; collect evidence before declaring service health.",
        };
      }
      const actualRatio = indicator.goodEvents / indicator.totalEvents;
      const status = actualRatio >= indicator.targetRatio ? "met" as const : "breached" as const;
      return {
        indicatorId: indicator.indicatorId,
        status,
        actualRatio,
        targetRatio: indicator.targetRatio,
        errorBudgetRemaining: Math.max(0, 1 - indicator.targetRatio - (1 - actualRatio)),
        guidance:
          status === "met"
            ? "Objective met for this window; continue monitoring the next complete window."
            : "Objective breached; pause risky changes and review tenant-scoped diagnostics before planning recovery.",
      };
    });
    const status = evaluated.some((item) => item.status === "breached")
      ? "breached" as const
      : evaluated.some((item) => item.status === "insufficient_evidence")
        ? "insufficient_evidence" as const
        : "met" as const;
    const issuedAt = now.toISOString();
    const receipt = makeReceipt("slo.evaluate", envelope, requestDigest, issuedAt);
    return {
      tenantId: envelope.tenantId,
      window: {
        start: new Date(windowStart).toISOString(),
        end: new Date(windowEnd).toISOString(),
        durationMilliseconds: duration,
      },
      status,
      indicators: evaluated,
      guidance:
        status === "met"
          ? "All measured objectives met their targets."
          : status === "breached"
            ? "At least one objective is breached. Review evidence and create a dry-run recovery plan."
            : "Health is unknown because at least one objective lacks evidence.",
      receipt,
      observation: makeObservation(authority, receipt, "computed"),
    };
  });
}

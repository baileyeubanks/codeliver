import { compositeKey, deterministicId, sha256 } from "./canonical";
import type {
  BudgetPolicy,
  CommercialPricingTerms,
  MeteredOperation,
  MeteringActor,
  OverageConsent,
  UsageScope,
} from "./types";

const DEFAULT_PAID_OPERATIONS: readonly MeteredOperation[] = [
  "ai_research",
  "ai_generation",
  "transcription",
  "translation",
  "media_analysis",
  "generated_media",
  "new_transcode",
  "preview_render",
  "export_render",
];

const METERING_ROLES: readonly MeteringActor["role"][] = [
  "owner",
  "admin",
  "creator",
  "auditor",
  "service",
  "reviewer",
  "client",
];

const METERING_ACTOR_KINDS: readonly MeteringActor["kind"][] = [
  "human",
  "service",
  "agent",
];

export class MeteringError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "MeteringError";
    this.code = code;
    this.status = status;
  }
}

export function assertIdentifier(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new MeteringError("invalid_identifier", `${field} is invalid`);
  }
}

export function assertScope(scope: UsageScope) {
  assertIdentifier(scope.organizationId, "organizationId");
  assertIdentifier(scope.projectId, "projectId");
}

export function assertActor(actor: MeteringActor) {
  if (!METERING_ROLES.includes(actor.role)) {
    throw new MeteringError("invalid_actor_role", "actor.role is invalid");
  }
  if (!METERING_ACTOR_KINDS.includes(actor.kind)) {
    throw new MeteringError("invalid_actor_kind", "actor.kind is invalid");
  }
  if ((actor.role === "service") !== (actor.kind === "service")) {
    throw new MeteringError(
      "invalid_actor",
      "Service role and service actor kind must be used together",
    );
  }
  if (
    actor.kind === "agent" &&
    actor.role !== "creator"
  ) {
    throw new MeteringError(
      "invalid_actor",
      "Agent metering principals must use the creator role",
    );
  }
  assertIdentifier(actor.id, "actor.id");
}

export function assertMeteringAuthority(
  actor: MeteringActor,
  action: "estimate" | "reserve" | "commit" | "release" | "collaboration",
) {
  const allowedRoles: Record<typeof action, readonly MeteringActor["role"][]> = {
    estimate: ["owner", "admin", "creator", "service"],
    reserve: ["owner", "admin", "creator", "service"],
    commit: ["owner", "admin", "service"],
    release: ["owner", "admin", "creator", "service"],
    collaboration: ["owner", "admin", "creator", "service", "reviewer", "client"],
  };
  if (!allowedRoles[action].includes(actor.role)) {
    throw new MeteringError(
      "forbidden",
      `Actor role ${actor.role} may not ${action} metered usage`,
      403,
    );
  }
}

export function assertIdempotencyKey(key: unknown) {
  if (
    typeof key !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)
  ) {
    throw new MeteringError(
      "invalid_idempotency_key",
      "idempotencyKey must be 8-128 URL-safe characters",
    );
  }
}

export function sameScope(left: UsageScope, right: UsageScope) {
  return (
    left.organizationId === right.organizationId && left.projectId === right.projectId
  );
}

export function scopeKey(scope: UsageScope) {
  return compositeKey(scope.organizationId, scope.projectId);
}

export function assertSafeNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MeteringError("invalid_integer", `${field} must be a non-negative integer`);
  }
}

export function safeIntegerAdd(left: number, right: number, field: string) {
  assertSafeNonNegativeInteger(left, field);
  assertSafeNonNegativeInteger(right, field);
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new MeteringError("integer_overflow", `${field} exceeds the safe integer range`);
  }
  return value;
}

export function safeIntegerMultiply(left: number, right: number, field: string) {
  assertSafeNonNegativeInteger(left, field);
  assertSafeNonNegativeInteger(right, field);
  const value = left * right;
  if (!Number.isSafeInteger(value)) {
    throw new MeteringError("integer_overflow", `${field} exceeds the safe integer range`);
  }
  return value;
}

export function assertTimestamp(value: unknown, field: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new MeteringError("invalid_timestamp", `${field} must be a valid timestamp`);
  }
}

export interface CreateOverageConsentInput {
  scope: UsageScope;
  additionalCoUnitCap: number;
  currencyCapMicros: number;
  pricingVersion: string;
  actor: MeteringActor;
  grantedAt: string;
  expiresAt: string;
}

export function createOverageConsent(input: CreateOverageConsentInput): OverageConsent {
  assertScope(input.scope);
  assertActor(input.actor);
  if (!(["owner", "admin"] as const).includes(input.actor.role as "owner" | "admin")) {
    throw new MeteringError("forbidden", "Only an owner or admin may grant overage consent", 403);
  }
  assertSafeNonNegativeInteger(input.additionalCoUnitCap, "additionalCoUnitCap");
  assertSafeNonNegativeInteger(input.currencyCapMicros, "currencyCapMicros");
  if (input.additionalCoUnitCap === 0 || input.currencyCapMicros === 0) {
    throw new MeteringError(
      "invalid_overage_cap",
      "Overage consent requires positive Co-Unit and currency caps",
    );
  }
  assertTimestamp(input.grantedAt, "grantedAt");
  assertTimestamp(input.expiresAt, "expiresAt");
  assertIdentifier(input.pricingVersion, "pricingVersion");
  if (Date.parse(input.expiresAt) <= Date.parse(input.grantedAt)) {
    throw new MeteringError("invalid_expiration", "Overage consent must expire in the future");
  }

  return {
    consentId: deterministicId("ovc", input),
    scope: input.scope,
    enabled: true,
    additionalCoUnitCap: input.additionalCoUnitCap,
    currencyCapMicros: input.currencyCapMicros,
    currency: "USD",
    pricingVersion: input.pricingVersion,
    grantedBy: input.actor.id,
    grantedAt: input.grantedAt,
    expiresAt: input.expiresAt,
  };
}

export interface CreateBudgetPolicyInput {
  scope: UsageScope;
  budgetScope: "tenant" | "project";
  includedCoUnits: number;
  subscriptionPlanId?: string;
  entitlementStatus?: "active" | "suspended";
  allowedOperations?: readonly MeteredOperation[];
  maximumReservationCoUnits?: number;
  periodStart: string;
  periodEnd: string;
  actor: MeteringActor;
  version: string;
  configuredAt: string;
  alertThresholdBasisPoints?: readonly number[];
  overageConsent?: OverageConsent | null;
}

export function createBudgetPolicy(input: CreateBudgetPolicyInput): BudgetPolicy {
  assertScope(input.scope);
  assertActor(input.actor);
  if (!(["owner", "admin", "service"] as const).includes(input.actor.role as "owner" | "admin" | "service")) {
    throw new MeteringError("forbidden", "Budget policy requires owner, admin, or service authority", 403);
  }
  assertSafeNonNegativeInteger(input.includedCoUnits, "includedCoUnits");
  assertTimestamp(input.periodStart, "periodStart");
  assertTimestamp(input.periodEnd, "periodEnd");
  assertTimestamp(input.configuredAt, "configuredAt");
  assertIdentifier(input.version, "version");
  const subscriptionPlanId = input.subscriptionPlanId ?? "custom";
  assertIdentifier(subscriptionPlanId, "subscriptionPlanId");
  const maximumReservationCoUnits =
    input.maximumReservationCoUnits ?? Number.MAX_SAFE_INTEGER;
  assertSafeNonNegativeInteger(maximumReservationCoUnits, "maximumReservationCoUnits");
  if (Date.parse(input.periodEnd) <= Date.parse(input.periodStart)) {
    throw new MeteringError("invalid_period", "Budget periodEnd must follow periodStart");
  }

  const allowedOperations = [
    ...new Set(input.allowedOperations ?? DEFAULT_PAID_OPERATIONS),
  ].sort();
  for (const operation of allowedOperations) {
    if (!DEFAULT_PAID_OPERATIONS.includes(operation)) {
      throw new MeteringError(
        "invalid_entitlement_operation",
        `${operation} is not a paid-compute entitlement`,
      );
    }
  }
  if (input.overageConsent && !sameScope(input.overageConsent.scope, input.scope)) {
    throw new MeteringError(
      "overage_scope_mismatch",
      "Overage consent belongs to another tenant or project",
      403,
    );
  }

  const thresholds = [...(input.alertThresholdBasisPoints ?? [5_000, 8_000, 10_000])]
    .sort((a, b) => a - b)
    .filter((value, index, values) => values.indexOf(value) === index);
  for (const threshold of thresholds) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20_000) {
      throw new MeteringError(
        "invalid_alert_threshold",
        "Alert thresholds must be integer basis points between 1 and 20000",
      );
    }
  }

  const unsigned = {
    id: deterministicId("bud", {
      organizationId: input.scope.organizationId,
      projectId: input.budgetScope === "project" ? input.scope.projectId : null,
      version: input.version,
      periodStart: input.periodStart,
    }),
    schemaVersion: "co-budget.v1" as const,
    organizationId: input.scope.organizationId,
    projectId: input.budgetScope === "project" ? input.scope.projectId : null,
    scope: input.budgetScope,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    includedCoUnits: input.includedCoUnits,
    subscriptionPlanId,
    entitlementStatus: input.entitlementStatus ?? ("active" as const),
    allowedOperations,
    maximumReservationCoUnits,
    alertThresholdBasisPoints: thresholds,
    overageConsent: input.overageConsent ?? null,
    version: input.version,
    configuredBy: input.actor.id,
    configuredAt: input.configuredAt,
    paymentMutation: "none" as const,
  };

  return { ...unsigned, integrityHash: sha256(unsigned) };
}

export function effectiveBudgetLimit(
  budget: BudgetPolicy,
  pricing: CommercialPricingTerms,
  now: string,
) {
  const consent = budget.overageConsent;
  if (
    !consent ||
    Date.parse(consent.expiresAt) <= Date.parse(now) ||
    consent.pricingVersion !== pricing.version ||
    pricing.overageMicrosPerCoUnit === null
  ) {
    return {
      effectiveLimitCoUnits: budget.includedCoUnits,
      overageEnabled: false,
      currencyLimitedAdditionalCoUnits: 0,
    };
  }

  const currencyLimitedAdditionalCoUnits = Math.floor(
    consent.currencyCapMicros / pricing.overageMicrosPerCoUnit,
  );
  const additional = Math.min(
    consent.additionalCoUnitCap,
    currencyLimitedAdditionalCoUnits,
  );

  return {
    effectiveLimitCoUnits: safeIntegerAdd(
      budget.includedCoUnits,
      additional,
      "effectiveLimitCoUnits",
    ),
    overageEnabled: true,
    currencyLimitedAdditionalCoUnits,
  };
}

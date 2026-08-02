import { canonicalJson, deterministicId, sha256 } from "./canonical";
import {
  DEFAULT_RATE_CATALOG,
  coUnitsToCredits,
  estimateCoUnits,
  normalizeNativeUsage,
  UNPRICED_COMMERCIAL_TERMS,
} from "./catalog";
import {
  assertActor,
  assertIdentifier,
  assertIdempotencyKey,
  assertMeteringAuthority,
  assertScope,
  effectiveBudgetLimit,
  MeteringError,
  safeIntegerAdd,
  safeIntegerMultiply,
  sameScope,
  scopeKey,
} from "./policy";
import { reconcileMeteringSnapshot } from "./reconcile";
import type { MeteringRepository } from "./repository";
import { USAGE_OUTCOMES } from "./types";
import type {
  BudgetPolicy,
  BudgetUsageSnapshot,
  CommercialPricingTerms,
  CommitUsageInput,
  EstimateUsageInput,
  IdempotencyRecord,
  MeteredOperation,
  MeteringActor,
  NativeUsage,
  ProviderCostAttribution,
  QuotaAlert,
  RateCatalog,
  RecordCollaborationInput,
  ReconciliationReport,
  ReleaseUsageInput,
  ReserveUsageInput,
  UsageQuote,
  UsageReceipt,
  UsageReservation,
  UsageScope,
  UsageSummary,
} from "./types";

const SYSTEM_ACTOR: MeteringActor = {
  id: "co-credit-control-plane",
  role: "service",
  kind: "service",
};

const NO_DEBIT_REASONS = {
  failed: "Failed operations do not debit the customer.",
  duplicate: "Duplicate operations do not debit the customer.",
  unusable_output: "Unusable output does not debit the customer.",
  safety_rejected: "Safety-rejected output does not debit the customer.",
  cache_hit: "Cache hits do not debit the customer.",
  platform_retry: "Platform retries do not debit the customer.",
} as const;

export interface MeteringServiceOptions {
  catalog?: RateCatalog;
  pricing?: CommercialPricingTerms;
  clock?: () => Date;
  quoteTtlMilliseconds?: number;
  reservationTtlMilliseconds?: number;
}

function creditsRange(range: { min: number; likely: number; max: number }) {
  return {
    min: coUnitsToCredits(range.min),
    likely: coUnitsToCredits(range.likely),
    max: coUnitsToCredits(range.max),
  };
}

function resourceIntegrity<T extends { integrityHash: string }>(resource: T) {
  const { integrityHash: _integrityHash, ...unsigned } = resource;
  void _integrityHash;
  return sha256(unsigned);
}

function rateCatalogIntegrity(catalog: RateCatalog) {
  const { integrityHash: _integrityHash, ...unsigned } = catalog;
  void _integrityHash;
  return sha256(unsigned);
}

function validateProviderCost(
  providerCost: ProviderCostAttribution | null,
  actualUsage: NativeUsage,
) {
  if (!providerCost) return null;
  if (providerCost.currency !== "USD") {
    throw new MeteringError("invalid_provider_cost", "Provider cost currency must be USD");
  }
  for (const [field, value] of [
    ["calculatedCostMicros", providerCost.calculatedCostMicros],
    ["reportedCostMicros", providerCost.reportedCostMicros],
  ] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new MeteringError("invalid_provider_cost", `${field} must be a non-negative integer`);
    }
  }
  if (!providerCost.provider.trim() || !providerCost.service.trim() || !providerCost.rateVersion.trim()) {
    throw new MeteringError(
      "invalid_provider_cost",
      "Provider, service, and provider rate version are required",
    );
  }
  if (
    providerCost.providerRequestIdHash !== null &&
    !/^[a-f0-9]{64}$/.test(providerCost.providerRequestIdHash)
  ) {
    throw new MeteringError(
      "invalid_provider_request_hash",
      "Provider request ID must be null or a SHA-256 hash",
    );
  }

  const normalizedProviderUsage = normalizeNativeUsage(providerCost.nativeUsage);
  const normalizedActualUsage = normalizeNativeUsage(actualUsage);
  if (sha256(normalizedProviderUsage) !== sha256(normalizedActualUsage)) {
    throw new MeteringError(
      "provider_usage_mismatch",
      "Provider native usage must match the committed operation usage",
    );
  }

  return { ...providerCost, nativeUsage: normalizedProviderUsage };
}

export class MeteringService {
  readonly catalog: RateCatalog;
  readonly pricing: CommercialPricingTerms;
  private readonly repository: MeteringRepository;
  private readonly clock: () => Date;
  private readonly quoteTtlMilliseconds: number;
  private readonly reservationTtlMilliseconds: number;

  constructor(repository: MeteringRepository, options: MeteringServiceOptions = {}) {
    this.repository = repository;
    this.catalog = options.catalog ?? DEFAULT_RATE_CATALOG;
    this.pricing = options.pricing ?? UNPRICED_COMMERCIAL_TERMS;
    this.clock = options.clock ?? (() => new Date());
    this.quoteTtlMilliseconds = options.quoteTtlMilliseconds ?? 15 * 60 * 1_000;
    this.reservationTtlMilliseconds = options.reservationTtlMilliseconds ?? 60 * 60 * 1_000;
    if (
      this.pricing.overageMicrosPerCoUnit !== null &&
      (!Number.isSafeInteger(this.pricing.overageMicrosPerCoUnit) ||
        this.pricing.overageMicrosPerCoUnit <= 0)
    ) {
      throw new MeteringError(
        "invalid_pricing_terms",
        "Overage pricing must be a positive safe integer when configured",
      );
    }
    if (
      !Number.isSafeInteger(this.quoteTtlMilliseconds) ||
      this.quoteTtlMilliseconds <= 0 ||
      !Number.isSafeInteger(this.reservationTtlMilliseconds) ||
      this.reservationTtlMilliseconds <= 0
    ) {
      throw new MeteringError("invalid_ttl", "Quote and reservation TTLs must be positive integers");
    }
    if (this.catalog.integrityHash !== rateCatalogIntegrity(this.catalog)) {
      throw new MeteringError(
        "rate_catalog_integrity_invalid",
        "Rate catalog integrity hash is invalid",
      );
    }
  }

  private now() {
    return this.clock().toISOString();
  }

  private getIdempotentResource(
    scope: UsageScope,
    action: string,
    key: string,
    requestHash: string,
  ) {
    const record = this.repository.getIdempotency(scope, action, key);
    if (!record) return null;
    const { integrityHash, ...unsigned } = record;
    if (integrityHash !== sha256(unsigned)) {
      throw new MeteringError(
        "idempotency_integrity_invalid",
        "Stored idempotency record failed integrity verification",
        500,
      );
    }
    if (record.requestHash !== requestHash) {
      throw new MeteringError(
        "idempotency_conflict",
        `Idempotency key was already used for a different ${action} request`,
        409,
      );
    }
    return record;
  }

  private saveIdempotency(
    scope: UsageScope,
    action: string,
    key: string,
    requestHash: string,
    resourceType: IdempotencyRecord["resourceType"],
    resourceId: string,
    createdAt: string,
  ) {
    const unsigned = {
      scopeKey: scopeKey(scope),
      action,
      key,
      requestHash,
      resourceType,
      resourceId,
      createdAt,
    };
    this.repository.saveIdempotency({
      ...unsigned,
      integrityHash: sha256(unsigned),
    });
  }

  private budgetUsage(
    budget: BudgetPolicy,
    scope: UsageScope,
    now: string,
  ): BudgetUsageSnapshot {
    const receipts =
      budget.scope === "tenant"
        ? this.repository.listOrganizationReceipts(scope.organizationId)
        : this.repository.listReceipts(scope);
    const reservations =
      budget.scope === "tenant"
        ? this.repository.listOrganizationReservations(scope.organizationId)
        : this.repository.listReservations(scope);

    const committedCoUnits = receipts
      .filter(
        (receipt) =>
          receipt.kind === "commit" &&
          receipt.occurredAt >= budget.periodStart &&
          receipt.occurredAt < budget.periodEnd,
      )
      .reduce(
        (sum, receipt) =>
          safeIntegerAdd(sum, receipt.committedCoUnits, "committedCoUnits"),
        0,
      );
    const reservedCoUnits = reservations
      .filter(
        (reservation) =>
          reservation.status === "active" &&
          reservation.expiresAt > now &&
          reservation.createdAt >= budget.periodStart &&
          reservation.createdAt < budget.periodEnd,
      )
      .reduce(
        (sum, reservation) =>
          safeIntegerAdd(sum, reservation.maximumCoUnits, "reservedCoUnits"),
        0,
      );
    const { effectiveLimitCoUnits } = effectiveBudgetLimit(budget, this.pricing, now);
    const consumed = safeIntegerAdd(
      committedCoUnits,
      reservedCoUnits,
      "consumedCoUnits",
    );

    const rawUtilizationBasisPoints =
      budget.includedCoUnits === 0
        ? consumed > 0
          ? 20_000n
          : 0n
        : (BigInt(consumed) * 10_000n) / BigInt(budget.includedCoUnits);
    const utilizationBasisPoints = Number(
      rawUtilizationBasisPoints > 20_000n ? 20_000n : rawUtilizationBasisPoints,
    );

    return {
      budget,
      committedCoUnits,
      reservedCoUnits,
      remainingIncludedCoUnits: Math.max(0, budget.includedCoUnits - consumed),
      effectiveLimitCoUnits,
      remainingEffectiveCoUnits: Math.max(0, effectiveLimitCoUnits - consumed),
      utilizationBasisPoints,
    };
  }

  private requireBudgets(
    scope: UsageScope,
    now: string,
    operation?: MeteredOperation,
    maximumCoUnits?: number,
  ) {
    const tenant = this.repository.getTenantBudget(scope.organizationId);
    const project = this.repository.getProjectBudget(scope);
    if (!tenant || !project) {
      throw new MeteringError(
        "budget_missing",
        "Paid compute requires active tenant and project budgets",
        409,
      );
    }
    for (const budget of [tenant, project]) {
      if (now < budget.periodStart || now >= budget.periodEnd) {
        throw new MeteringError("budget_inactive", `${budget.scope} budget is outside its active period`, 409);
      }
      if (budget.integrityHash !== resourceIntegrity(budget)) {
        throw new MeteringError("budget_integrity_failed", `${budget.scope} budget failed integrity validation`, 409);
      }
      if (operation && budget.entitlementStatus !== "active") {
        throw new MeteringError(
          "entitlement_suspended",
          `${budget.scope} compute entitlement is suspended`,
          403,
        );
      }
      if (operation && !budget.allowedOperations.includes(operation)) {
        throw new MeteringError(
          "operation_not_entitled",
          `${operation} is not included by the ${budget.scope} entitlement`,
          403,
        );
      }
      if (
        maximumCoUnits !== undefined &&
        maximumCoUnits > budget.maximumReservationCoUnits
      ) {
        throw new MeteringError(
          "reservation_entitlement_limit",
          `Confirmed maximum exceeds the ${budget.scope} per-operation entitlement`,
          409,
        );
      }
    }
    return {
      tenant: this.budgetUsage(tenant, scope, now),
      project: this.budgetUsage(project, scope, now),
    };
  }

  async configureBudget(policy: BudgetPolicy, actor: MeteringActor, eventScope: UsageScope) {
    assertScope(eventScope);
    assertActor(actor);
    if (!(["owner", "admin", "service"] as const).includes(actor.role as "owner" | "admin" | "service")) {
      throw new MeteringError("forbidden", "Budget configuration requires owner, admin, or service authority", 403);
    }
    if (policy.organizationId !== eventScope.organizationId) {
      throw new MeteringError("scope_mismatch", "Budget organization does not match event scope", 403);
    }
    if (policy.scope === "project" && policy.projectId !== eventScope.projectId) {
      throw new MeteringError("scope_mismatch", "Project budget does not match event scope", 403);
    }
    if (policy.integrityHash !== resourceIntegrity(policy)) {
      throw new MeteringError("budget_integrity_failed", "Budget integrity hash is invalid", 409);
    }
    if (policy.configuredBy !== actor.id) {
      throw new MeteringError(
        "configuration_actor_mismatch",
        "Budget configuredBy must match the configuring actor",
        403,
      );
    }

    return this.repository.runExclusive(eventScope, () => {
      this.repository.saveBudget(policy);
      return this.repository.appendLedgerEvent({
        scope: eventScope,
        type: "budget_configured",
        actor,
        operationExecutionId: null,
        quoteId: null,
        reservationId: null,
        receiptId: null,
        coUnits: policy.includedCoUnits,
        idempotencyKey: null,
        rateVersion: null,
        pricingVersion: policy.overageConsent?.pricingVersion ?? null,
        occurredAt: policy.configuredAt,
        details: {
          budget_id: policy.id,
          budget_scope: policy.scope,
          budget_version: policy.version,
          overage_enabled: policy.overageConsent !== null,
        },
      });
    });
  }

  async estimate(input: EstimateUsageInput): Promise<UsageQuote> {
    assertScope(input.scope);
    assertActor(input.requestedBy);
    assertIdentifier(input.operationExecutionId, "operationExecutionId");
    assertMeteringAuthority(input.requestedBy, "estimate");
    assertIdempotencyKey(input.idempotencyKey);
    const estimated = estimateCoUnits(this.catalog, input.operation, input.nativeUsage);
    const requestHash = sha256({
      scope: input.scope,
      operationExecutionId: input.operationExecutionId,
      operation: input.operation,
      nativeUsage: estimated.nativeUsage,
      requestedBy: input.requestedBy,
      rateVersion: this.catalog.version,
      pricingVersion: this.pricing.version,
    });

    return this.repository.runExclusive(input.scope, () => {
      const replay = this.getIdempotentResource(
        input.scope,
        "estimate",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) {
        const quote = this.repository.getQuote(replay.resourceId);
        if (!quote) throw new MeteringError("idempotency_orphan", "Quote replay target is missing", 500);
        return quote;
      }

      const requestedAt = this.now();
      const expiresAt = new Date(
        Date.parse(requestedAt) + this.quoteTtlMilliseconds,
      ).toISOString();
      const budgetSnapshots: BudgetUsageSnapshot[] = [];
      const tenant = this.repository.getTenantBudget(input.scope.organizationId);
      const project = this.repository.getProjectBudget(input.scope);
      if (tenant) budgetSnapshots.push(this.budgetUsage(tenant, input.scope, requestedAt));
      if (project) budgetSnapshots.push(this.budgetUsage(project, input.scope, requestedAt));

      const balances = budgetSnapshots.map((snapshot) => ({
        scope: snapshot.budget.scope,
        budgetId: snapshot.budget.id,
        budgetVersion: snapshot.budget.version,
        budgetIntegrityHash: snapshot.budget.integrityHash,
        subscriptionPlanId: snapshot.budget.subscriptionPlanId,
        entitlementStatus: snapshot.budget.entitlementStatus,
        periodStart: snapshot.budget.periodStart,
        periodEnd: snapshot.budget.periodEnd,
        includedCoUnits: snapshot.budget.includedCoUnits,
        committedCoUnits: snapshot.committedCoUnits,
        reservedCoUnits: snapshot.reservedCoUnits,
        remainingIncludedCoUnits: snapshot.remainingIncludedCoUnits,
        effectiveLimitCoUnits: snapshot.effectiveLimitCoUnits,
        remainingEffectiveCoUnits: snapshot.remainingEffectiveCoUnits,
        overageEnabled: snapshot.effectiveLimitCoUnits > snapshot.budget.includedCoUnits,
      }));
      const availableIncluded = balances.length
        ? Math.min(...balances.map((balance) => balance.remainingIncludedCoUnits))
        : 0;
      const availableEffective = balances.length
        ? Math.min(...balances.map((balance) => balance.remainingEffectiveCoUnits))
        : 0;
      const additionalCoUnits = Math.max(0, estimated.coUnits.max - availableIncluded);
      const estimatedCurrencyMicros =
        this.pricing.overageMicrosPerCoUnit === null
          ? null
          : safeIntegerMultiply(
              additionalCoUnits,
              this.pricing.overageMicrosPerCoUnit,
              "estimatedCurrencyMicros",
            );

      const unsigned = {
        id: deterministicId("uq", {
          requestHash,
          requestedAt,
          idempotencyKey: input.idempotencyKey,
        }),
        schemaVersion: "usage-quote.v1" as const,
        scope: input.scope,
        operationExecutionId: input.operationExecutionId,
        operation: input.operation,
        meterClass: estimated.meterClass,
        nativeUsage: estimated.nativeUsage,
        coUnits: estimated.coUnits,
        coCredits: creditsRange(estimated.coUnits),
        assumptions: estimated.assumptions,
        rateVersion: this.catalog.version,
        rateCatalogHash: this.catalog.integrityHash,
        rateCatalog: this.catalog,
        pricingVersion: this.pricing.version,
        pricingTerms: this.pricing,
        pricingTermsHash: sha256(this.pricing),
        balances,
        overage: {
          required: additionalCoUnits > 0,
          allowedAtQuoteTime:
            balances.length === 2 && estimated.coUnits.max <= availableEffective,
          additionalCoUnits,
          estimatedCurrencyMicros,
          consentRequired: additionalCoUnits > 0,
        },
        requestedBy: input.requestedBy,
        requestedAt,
        expiresAt,
        requestHash,
        paymentMutation: "none" as const,
      };
      const quote: UsageQuote = { ...unsigned, integrityHash: sha256(unsigned) };
      this.repository.saveQuote(quote);
      this.repository.appendLedgerEvent({
        scope: input.scope,
        type: "quote_issued",
        actor: input.requestedBy,
        operationExecutionId: quote.operationExecutionId,
        quoteId: quote.id,
        reservationId: null,
        receiptId: null,
        coUnits: quote.coUnits.max,
        idempotencyKey: input.idempotencyKey,
        rateVersion: quote.rateVersion,
        pricingVersion: quote.pricingVersion,
        occurredAt: requestedAt,
        details: {
          meter_class: quote.meterClass,
          min_co_units: quote.coUnits.min,
          likely_co_units: quote.coUnits.likely,
          max_co_units: quote.coUnits.max,
          possible_overage: quote.overage.required,
        },
      });
      this.saveIdempotency(
        input.scope,
        "estimate",
        input.idempotencyKey,
        requestHash,
        "quote",
        quote.id,
        requestedAt,
      );
      return quote;
    });
  }

  async reserve(input: ReserveUsageInput) {
    assertScope(input.scope);
    assertActor(input.actor);
    assertMeteringAuthority(input.actor, "reserve");
    assertIdempotencyKey(input.idempotencyKey);

    return this.repository.runExclusive(input.scope, () => {
      const quote = this.repository.getQuote(input.quoteId);
      if (!quote) throw new MeteringError("quote_not_found", "Usage quote was not found", 404);
      if (!sameScope(quote.scope, input.scope)) {
        throw new MeteringError("scope_mismatch", "Quote belongs to another project", 403);
      }
      if (quote.integrityHash !== resourceIntegrity(quote)) {
        throw new MeteringError("quote_integrity_failed", "Quote integrity hash is invalid", 409);
      }
      if (
        quote.rateCatalog.version !== quote.rateVersion ||
        quote.rateCatalog.integrityHash !== quote.rateCatalogHash ||
        quote.rateCatalog.integrityHash !== rateCatalogIntegrity(quote.rateCatalog) ||
        quote.pricingTerms.version !== quote.pricingVersion ||
        quote.pricingTermsHash !== sha256(quote.pricingTerms)
      ) {
        throw new MeteringError(
          "quote_pricing_lineage_invalid",
          "Quote rate or pricing snapshot failed lineage verification",
          409,
        );
      }
      const requestHash = sha256({
        scope: input.scope,
        operationExecutionId: quote.operationExecutionId,
        operation: quote.operation,
        nativeUsage: quote.nativeUsage,
        maximumCoUnits: quote.coUnits.max,
        rateCatalogHash: quote.rateCatalogHash,
        pricingTermsHash: quote.pricingTermsHash,
        actor: input.actor,
      });
      const replay = this.getIdempotentResource(
        input.scope,
        "reserve",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) {
        const reservation = this.repository.getReservation(replay.resourceId);
        if (!reservation) {
          throw new MeteringError("idempotency_orphan", "Reservation replay target is missing", 500);
        }
        const receipt = this.repository
          .listReceipts(input.scope)
          .find((candidate) => candidate.reservationId === reservation.id && candidate.kind === "reservation");
        if (!receipt) throw new MeteringError("receipt_missing", "Reservation receipt is missing", 500);
        return { reservation, receipt, replayed: true };
      }

      if (quote.meterClass !== "paid_compute") {
        throw new MeteringError(
          quote.meterClass === "free_collaboration" ? "free_operation" : "separate_meter_required",
          quote.meterClass === "free_collaboration"
            ? "Free collaboration must not create a Co-Credit reservation"
            : "Storage and egress require their separate meter",
          409,
        );
      }

      const now = this.now();
      const existingReservation = this.repository
        .listReservations(input.scope)
        .find(
          (reservation) =>
            reservation.operationExecutionId === quote.operationExecutionId,
        );
      if (existingReservation) {
        if (existingReservation.requestHash !== requestHash) {
          throw new MeteringError(
            "operation_execution_conflict",
            "Operation execution was already reserved with different metering inputs",
            409,
          );
        }
        const receipt = this.repository
          .listReceipts(input.scope)
          .find(
            (candidate) =>
              candidate.reservationId === existingReservation.id &&
              candidate.kind === "reservation",
          );
        if (!receipt) throw new MeteringError("receipt_missing", "Reservation receipt is missing", 500);
        this.saveIdempotency(
          input.scope,
          "reserve",
          input.idempotencyKey,
          requestHash,
          "reservation",
          existingReservation.id,
          now,
        );
        return { reservation: existingReservation, receipt, replayed: true };
      }

      if (quote.expiresAt <= now) throw new MeteringError("quote_expired", "Usage quote has expired", 409);
      if (
        quote.rateVersion !== this.catalog.version ||
        quote.rateCatalogHash !== this.catalog.integrityHash ||
        quote.pricingVersion !== this.pricing.version ||
        quote.pricingTermsHash !== sha256(this.pricing)
      ) {
        throw new MeteringError("pricing_version_stale", "Quote pricing provenance is stale", 409);
      }

      const budgets = this.requireBudgets(
        input.scope,
        now,
        quote.operation,
        quote.coUnits.max,
      );
      for (const snapshot of [budgets.tenant, budgets.project]) {
        if (quote.coUnits.max > snapshot.remainingEffectiveCoUnits) {
          throw new MeteringError(
            "budget_exhausted",
            `${snapshot.budget.scope} budget cannot reserve the confirmed maximum`,
            409,
          );
        }
      }

      const expiresAt = new Date(
        Math.min(
          Date.parse(quote.expiresAt),
          Date.parse(now) + this.reservationTtlMilliseconds,
          Date.parse(budgets.tenant.budget.periodEnd),
          Date.parse(budgets.project.budget.periodEnd),
        ),
      ).toISOString();
      const reservationId = deterministicId("urs", {
        scope: input.scope,
        operationExecutionId: quote.operationExecutionId,
        requestHash,
      });
      const reservationUnsigned = {
        id: reservationId,
        schemaVersion: "usage-reservation.v1" as const,
        scope: input.scope,
        operationExecutionId: quote.operationExecutionId,
        quoteId: quote.id,
        operation: quote.operation,
        status: "active" as const,
        maximumCoUnits: quote.coUnits.max,
        committedCoUnits: 0,
        releasedCoUnits: 0,
        absorbedCoUnits: 0,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        rateVersion: quote.rateVersion,
        rateCatalogHash: quote.rateCatalogHash,
        rateCatalog: quote.rateCatalog,
        pricingVersion: quote.pricingVersion,
        pricingTerms: quote.pricingTerms,
        pricingTermsHash: quote.pricingTermsHash,
        createdBy: input.actor,
        createdAt: now,
        expiresAt,
        settledAt: null,
        settlementReceiptId: null,
        paymentMutation: "none" as const,
      };
      const reservation: UsageReservation = {
        ...reservationUnsigned,
        integrityHash: sha256(reservationUnsigned),
      };
      this.repository.saveReservation(reservation);

      const receiptId = deterministicId("urc", {
        kind: "reservation",
        reservationId,
        requestHash,
      });
      const event = this.repository.appendLedgerEvent({
        scope: input.scope,
        type: "reservation_created",
        actor: input.actor,
        operationExecutionId: quote.operationExecutionId,
        quoteId: quote.id,
        reservationId,
        receiptId,
        coUnits: quote.coUnits.max,
        idempotencyKey: input.idempotencyKey,
        rateVersion: quote.rateVersion,
        pricingVersion: quote.pricingVersion,
        occurredAt: now,
        details: { expires_at: expiresAt },
      });
      const receiptUnsigned = {
        id: receiptId,
        schemaVersion: "usage-receipt.v1" as const,
        kind: "reservation" as const,
        scope: input.scope,
        operationExecutionId: quote.operationExecutionId,
        operation: quote.operation,
        quoteId: quote.id,
        reservationId,
        outcome: "reserved" as const,
        reservedCoUnits: quote.coUnits.max,
        committedCoUnits: 0,
        releasedCoUnits: 0,
        absorbedCoUnits: 0,
        nativeUsage: quote.nativeUsage,
        providerCost: null,
        noDebitReason: null,
        rateVersion: quote.rateVersion,
        rateCatalogHash: quote.rateCatalogHash,
        pricingVersion: quote.pricingVersion,
        pricingTermsHash: quote.pricingTermsHash,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        actor: input.actor,
        occurredAt: now,
        ledgerEventIds: [event.id],
        paymentMutation: "none" as const,
      };
      const receipt: UsageReceipt = {
        ...receiptUnsigned,
        integrityHash: sha256(receiptUnsigned),
      };
      this.repository.saveReceipt(receipt);
      this.saveIdempotency(
        input.scope,
        "reserve",
        input.idempotencyKey,
        requestHash,
        "reservation",
        reservation.id,
        now,
      );
      this.emitQuotaAlerts(input.scope, input.actor, now);
      return { reservation, receipt, replayed: false };
    });
  }

  private settleReleaseLocked(
    input: ReleaseUsageInput,
    reservation: UsageReservation,
    kind: "release" | "expiration",
    now: string,
    requestHash: string,
  ) {
    const receiptId = deterministicId("urc", {
      kind,
      reservationId: reservation.id,
      requestHash,
    });
    const updatedUnsigned = {
      ...reservation,
      status: kind === "expiration" ? ("expired" as const) : ("released" as const),
      releasedCoUnits: reservation.maximumCoUnits,
      settledAt: now,
      settlementReceiptId: receiptId,
      integrityHash: undefined,
    };
    const { integrityHash: _integrityHash, ...reservationWithoutIntegrity } = updatedUnsigned;
    void _integrityHash;
    const updated: UsageReservation = {
      ...reservationWithoutIntegrity,
      integrityHash: sha256(reservationWithoutIntegrity),
    };
    this.repository.saveReservation(updated);

    const event = this.repository.appendLedgerEvent({
      scope: input.scope,
      type: kind === "expiration" ? "reservation_expired" : "reservation_released",
      actor: input.actor,
      operationExecutionId: reservation.operationExecutionId,
      quoteId: reservation.quoteId,
      reservationId: reservation.id,
      receiptId,
      coUnits: reservation.maximumCoUnits,
      idempotencyKey: input.idempotencyKey,
      rateVersion: reservation.rateVersion,
      pricingVersion: reservation.pricingVersion,
      occurredAt: now,
      details: { reason: input.reason },
    });
    const receiptUnsigned = {
      id: receiptId,
      schemaVersion: "usage-receipt.v1" as const,
      kind,
      scope: input.scope,
      operationExecutionId: reservation.operationExecutionId,
      operation: reservation.operation,
      quoteId: reservation.quoteId,
      reservationId: reservation.id,
      outcome: kind === "expiration" ? ("expired" as const) : ("released" as const),
      reservedCoUnits: reservation.maximumCoUnits,
      committedCoUnits: 0,
      releasedCoUnits: reservation.maximumCoUnits,
      absorbedCoUnits: 0,
      nativeUsage: {},
      providerCost: null,
      noDebitReason: input.reason,
      rateVersion: reservation.rateVersion,
      rateCatalogHash: reservation.rateCatalogHash,
      pricingVersion: reservation.pricingVersion,
      pricingTermsHash: reservation.pricingTermsHash,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      actor: input.actor,
      occurredAt: now,
      ledgerEventIds: [event.id],
      paymentMutation: "none" as const,
    };
    const receipt: UsageReceipt = {
      ...receiptUnsigned,
      integrityHash: sha256(receiptUnsigned),
    };
    this.repository.saveReceipt(receipt);
    return { reservation: updated, receipt };
  }

  async commit(input: CommitUsageInput) {
    assertScope(input.scope);
    assertActor(input.actor);
    assertIdentifier(input.operationExecutionId, "operationExecutionId");
    assertMeteringAuthority(input.actor, "commit");
    assertIdempotencyKey(input.idempotencyKey);
    if (!USAGE_OUTCOMES.includes(input.outcome)) {
      throw new MeteringError("invalid_usage_outcome", "Usage outcome is not recognized");
    }
    const actualUsage = normalizeNativeUsage(input.actualUsage);
    const providerCost = validateProviderCost(input.providerCost, actualUsage);
    const requestHash = sha256({
      scope: input.scope,
      operationExecutionId: input.operationExecutionId,
      reservationId: input.reservationId,
      outcome: input.outcome,
      actualUsage,
      providerCost,
      actor: input.actor,
    });

    const result = await this.repository.runExclusive(input.scope, () => {
      const replay = this.getIdempotentResource(
        input.scope,
        "commit",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) {
        const receipt = this.repository.getReceipt(replay.resourceId);
        if (!receipt) throw new MeteringError("idempotency_orphan", "Commit receipt is missing", 500);
        const reservation = this.repository.getReservation(input.reservationId);
        if (!reservation) throw new MeteringError("reservation_not_found", "Reservation not found", 404);
        if (
          !sameScope(reservation.scope, input.scope) ||
          receipt.reservationId !== reservation.id ||
          !sameScope(receipt.scope, input.scope) ||
          receipt.integrityHash !== resourceIntegrity(receipt)
        ) {
          throw new MeteringError(
            "idempotency_integrity_failed",
            "Commit replay target failed scope or integrity validation",
            409,
          );
        }
        return { reservation, receipt, replayed: true };
      }

      const reservation = this.repository.getReservation(input.reservationId);
      if (!reservation) throw new MeteringError("reservation_not_found", "Reservation not found", 404);
      if (!sameScope(reservation.scope, input.scope)) {
        throw new MeteringError("scope_mismatch", "Reservation belongs to another project", 403);
      }
      if (reservation.operationExecutionId !== input.operationExecutionId) {
        throw new MeteringError(
          "operation_execution_mismatch",
          "Commit execution identity does not match the reservation",
          409,
        );
      }
      if (reservation.integrityHash !== resourceIntegrity(reservation)) {
        throw new MeteringError("reservation_integrity_failed", "Reservation integrity hash is invalid", 409);
      }
      if (
        reservation.rateCatalog.version !== reservation.rateVersion ||
        reservation.rateCatalog.integrityHash !== reservation.rateCatalogHash ||
        reservation.rateCatalog.integrityHash !== rateCatalogIntegrity(reservation.rateCatalog) ||
        reservation.pricingTerms.version !== reservation.pricingVersion ||
        reservation.pricingTermsHash !== sha256(reservation.pricingTerms)
      ) {
        throw new MeteringError(
          "reservation_pricing_lineage_invalid",
          "Reservation rate or pricing snapshot failed lineage verification",
          409,
        );
      }

      if (reservation.status === "committed") {
        const prior = this.repository.getReceipt(reservation.settlementReceiptId ?? "");
        if (prior?.requestHash === requestHash) {
          this.saveIdempotency(
            input.scope,
            "commit",
            input.idempotencyKey,
            requestHash,
            "receipt",
            prior.id,
            this.now(),
          );
          return { reservation, receipt: prior, replayed: true };
        }
        throw new MeteringError("reservation_already_settled", "Reservation is already committed", 409);
      }
      if (reservation.status !== "active") {
        throw new MeteringError("reservation_already_settled", `Reservation is ${reservation.status}`, 409);
      }

      const now = this.now();
      if (reservation.expiresAt <= now) {
        const expirationInput: ReleaseUsageInput = {
          scope: input.scope,
          reservationId: reservation.id,
          reason: "Reservation expired before commit.",
          actor: SYSTEM_ACTOR,
          idempotencyKey: `expire:${reservation.id}`,
        };
        const expirationHash = sha256({
          scope: expirationInput.scope,
          reservationId: expirationInput.reservationId,
          reason: expirationInput.reason,
          actor: expirationInput.actor,
        });
        const settled = this.settleReleaseLocked(
          expirationInput,
          reservation,
          "expiration",
          now,
          expirationHash,
        );
        this.saveIdempotency(
          input.scope,
          "expire",
          expirationInput.idempotencyKey,
          expirationHash,
          "receipt",
          settled.receipt.id,
          now,
        );
        return null;
      }

      const actualEstimate = estimateCoUnits(
        reservation.rateCatalog,
        reservation.operation,
        actualUsage,
      );
      const billable = input.outcome === "succeeded";
      const calculatedCoUnits = billable ? actualEstimate.coUnits.likely : 0;
      const committedCoUnits = Math.min(calculatedCoUnits, reservation.maximumCoUnits);
      const absorbedCoUnits = Math.max(0, calculatedCoUnits - reservation.maximumCoUnits);
      const releasedCoUnits = reservation.maximumCoUnits - committedCoUnits;
      const receiptId = deterministicId("urc", {
        kind: "commit",
        reservationId: reservation.id,
        requestHash,
      });
      const updatedUnsigned = {
        ...reservation,
        status: "committed" as const,
        committedCoUnits,
        releasedCoUnits,
        absorbedCoUnits,
        settledAt: now,
        settlementReceiptId: receiptId,
        integrityHash: undefined,
      };
      const { integrityHash: _integrityHash, ...reservationWithoutIntegrity } = updatedUnsigned;
      void _integrityHash;
      const updated: UsageReservation = {
        ...reservationWithoutIntegrity,
        integrityHash: sha256(reservationWithoutIntegrity),
      };
      this.repository.saveReservation(updated);

      const event = this.repository.appendLedgerEvent({
        scope: input.scope,
        type: "usage_committed",
        actor: input.actor,
        operationExecutionId: reservation.operationExecutionId,
        quoteId: reservation.quoteId,
        reservationId: reservation.id,
        receiptId,
        coUnits: committedCoUnits,
        idempotencyKey: input.idempotencyKey,
        rateVersion: reservation.rateVersion,
        pricingVersion: reservation.pricingVersion,
        occurredAt: now,
        details: {
          outcome: input.outcome,
          absorbed_co_units: absorbedCoUnits,
          released_co_units: releasedCoUnits,
          provider: providerCost?.provider ?? null,
          provider_rate_version: providerCost?.rateVersion ?? null,
          provider_cost_micros: providerCost?.calculatedCostMicros ?? null,
        },
      });
      const receiptUnsigned = {
        id: receiptId,
        schemaVersion: "usage-receipt.v1" as const,
        kind: "commit" as const,
        scope: input.scope,
        operationExecutionId: reservation.operationExecutionId,
        operation: reservation.operation,
        quoteId: reservation.quoteId,
        reservationId: reservation.id,
        outcome: input.outcome,
        reservedCoUnits: reservation.maximumCoUnits,
        committedCoUnits,
        releasedCoUnits,
        absorbedCoUnits,
        nativeUsage: actualUsage,
        providerCost,
        noDebitReason:
          input.outcome === "succeeded" ? null : NO_DEBIT_REASONS[input.outcome],
        rateVersion: reservation.rateVersion,
        rateCatalogHash: reservation.rateCatalogHash,
        pricingVersion: reservation.pricingVersion,
        pricingTermsHash: reservation.pricingTermsHash,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        actor: input.actor,
        occurredAt: now,
        ledgerEventIds: [event.id],
        paymentMutation: "none" as const,
      };
      const receipt: UsageReceipt = {
        ...receiptUnsigned,
        integrityHash: sha256(receiptUnsigned),
      };
      this.repository.saveReceipt(receipt);
      this.saveIdempotency(
        input.scope,
        "commit",
        input.idempotencyKey,
        requestHash,
        "receipt",
        receipt.id,
        now,
      );
      this.emitQuotaAlerts(input.scope, input.actor, now);
      return { reservation: updated, receipt, replayed: false };
    });
    if (result === null) {
      throw new MeteringError("reservation_expired", "Reservation expired before commit", 409);
    }
    return result;
  }

  async release(input: ReleaseUsageInput) {
    assertScope(input.scope);
    assertActor(input.actor);
    assertMeteringAuthority(input.actor, "release");
    assertIdempotencyKey(input.idempotencyKey);
    if (!input.reason.trim()) throw new MeteringError("release_reason_required", "Release reason is required");
    const requestHash = sha256({
      scope: input.scope,
      reservationId: input.reservationId,
      reason: input.reason.trim(),
      actor: input.actor,
    });

    return this.repository.runExclusive(input.scope, () => {
      const replay = this.getIdempotentResource(
        input.scope,
        "release",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) {
        const receipt = this.repository.getReceipt(replay.resourceId);
        const reservation = this.repository.getReservation(input.reservationId);
        if (!receipt || !reservation) {
          throw new MeteringError("idempotency_orphan", "Release replay target is missing", 500);
        }
        if (
          !sameScope(reservation.scope, input.scope) ||
          receipt.reservationId !== reservation.id ||
          !sameScope(receipt.scope, input.scope) ||
          receipt.integrityHash !== resourceIntegrity(receipt)
        ) {
          throw new MeteringError(
            "idempotency_integrity_failed",
            "Release replay target failed scope or integrity validation",
            409,
          );
        }
        return { reservation, receipt, replayed: true };
      }

      const reservation = this.repository.getReservation(input.reservationId);
      if (!reservation) throw new MeteringError("reservation_not_found", "Reservation not found", 404);
      if (!sameScope(reservation.scope, input.scope)) {
        throw new MeteringError("scope_mismatch", "Reservation belongs to another project", 403);
      }
      if (reservation.integrityHash !== resourceIntegrity(reservation)) {
        throw new MeteringError(
          "reservation_integrity_failed",
          "Reservation integrity hash is invalid",
          409,
        );
      }
      if (reservation.status !== "active") {
        const prior = this.repository.getReceipt(reservation.settlementReceiptId ?? "");
        if (prior?.requestHash === requestHash && ["release", "expiration"].includes(prior.kind)) {
          this.saveIdempotency(
            input.scope,
            "release",
            input.idempotencyKey,
            requestHash,
            "receipt",
            prior.id,
            this.now(),
          );
          return { reservation, receipt: prior, replayed: true };
        }
        throw new MeteringError("reservation_already_settled", `Reservation is ${reservation.status}`, 409);
      }

      const now = this.now();
      const settled = this.settleReleaseLocked(input, reservation, "release", now, requestHash);
      this.saveIdempotency(
        input.scope,
        "release",
        input.idempotencyKey,
        requestHash,
        "receipt",
        settled.receipt.id,
        now,
      );
      return { ...settled, replayed: false };
    });
  }

  async recordCollaboration(input: RecordCollaborationInput) {
    assertScope(input.scope);
    assertActor(input.actor);
    assertMeteringAuthority(input.actor, "collaboration");
    assertIdempotencyKey(input.idempotencyKey);
    const rate = this.catalog.rates[input.operation];
    if (!rate) throw new MeteringError("operation_unknown", "Operation is not in the rate catalog");
    if (rate.meterClass !== "free_collaboration") {
      throw new MeteringError(
        "reservation_required",
        rate.meterClass === "paid_compute"
          ? "Paid compute requires estimate and reservation"
          : "Storage and egress use separate meters",
        409,
      );
    }
    const requestHash = sha256({
      scope: input.scope,
      operation: input.operation,
      actor: input.actor,
      details: input.details ?? null,
    });

    return this.repository.runExclusive(input.scope, () => {
      const replay = this.getIdempotentResource(
        input.scope,
        "collaboration",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) {
        const receipt = this.repository.getReceipt(replay.resourceId);
        if (!receipt) throw new MeteringError("idempotency_orphan", "Collaboration receipt is missing", 500);
        return { receipt, replayed: true };
      }

      const now = this.now();
      const receiptId = deterministicId("urc", {
        kind: "collaboration",
        requestHash,
        occurredAt: now,
      });
      const event = this.repository.appendLedgerEvent({
        scope: input.scope,
        type: "collaboration_recorded",
        actor: input.actor,
        operationExecutionId: null,
        quoteId: null,
        reservationId: null,
        receiptId,
        coUnits: 0,
        idempotencyKey: input.idempotencyKey,
        rateVersion: this.catalog.version,
        pricingVersion: this.pricing.version,
        occurredAt: now,
        details: input.details ?? { boundary: rate.customerBoundary },
      });
      const unsigned = {
        id: receiptId,
        schemaVersion: "usage-receipt.v1" as const,
        kind: "collaboration" as const,
        scope: input.scope,
        operationExecutionId: null,
        operation: input.operation,
        quoteId: null,
        reservationId: null,
        outcome: "free" as const,
        reservedCoUnits: 0,
        committedCoUnits: 0,
        releasedCoUnits: 0,
        absorbedCoUnits: 0,
        nativeUsage: {},
        providerCost: null,
        noDebitReason: rate.customerBoundary,
        rateVersion: this.catalog.version,
        rateCatalogHash: this.catalog.integrityHash,
        pricingVersion: this.pricing.version,
        pricingTermsHash: sha256(this.pricing),
        idempotencyKey: input.idempotencyKey,
        requestHash,
        actor: input.actor,
        occurredAt: now,
        ledgerEventIds: [event.id],
        paymentMutation: "none" as const,
      };
      const receipt: UsageReceipt = { ...unsigned, integrityHash: sha256(unsigned) };
      this.repository.saveReceipt(receipt);
      this.saveIdempotency(
        input.scope,
        "collaboration",
        input.idempotencyKey,
        requestHash,
        "receipt",
        receipt.id,
        now,
      );
      return { receipt, replayed: false };
    });
  }

  private emitQuotaAlerts(scope: UsageScope, actor: MeteringActor, now: string) {
    const budgets = [
      this.repository.getTenantBudget(scope.organizationId),
      this.repository.getProjectBudget(scope),
    ].filter((budget): budget is BudgetPolicy => budget !== null);
    const existingIds = new Set(this.repository.listAlerts(scope).map((alert) => alert.id));

    for (const budget of budgets) {
      const snapshot = this.budgetUsage(budget, scope, now);
      for (const threshold of budget.alertThresholdBasisPoints) {
        if (snapshot.utilizationBasisPoints < threshold) continue;
        const alertId = deterministicId("qta", {
          budgetId: budget.id,
          threshold,
          periodStart: budget.periodStart,
        });
        if (existingIds.has(alertId)) continue;

        const event = this.repository.appendLedgerEvent({
          scope,
          type: "quota_alert_emitted",
          actor,
          operationExecutionId: null,
          quoteId: null,
          reservationId: null,
          receiptId: null,
          coUnits: safeIntegerAdd(
            snapshot.committedCoUnits,
            snapshot.reservedCoUnits,
            "quotaAlertCoUnits",
          ),
          idempotencyKey: null,
          rateVersion: this.catalog.version,
          pricingVersion: this.pricing.version,
          occurredAt: now,
          details: {
            alert_id: alertId,
            budget_id: budget.id,
            budget_scope: budget.scope,
            threshold_basis_points: threshold,
            utilization_basis_points: snapshot.utilizationBasisPoints,
          },
        });
        const alert: QuotaAlert = {
          id: alertId,
          budgetId: budget.id,
          scope,
          budgetScope: budget.scope,
          thresholdBasisPoints: threshold,
          consumedBasisPoints: snapshot.utilizationBasisPoints,
          committedCoUnits: snapshot.committedCoUnits,
          reservedCoUnits: snapshot.reservedCoUnits,
          emittedAt: now,
          eventId: event.id,
        };
        this.repository.saveAlert(alert);
        existingIds.add(alertId);
      }
    }
  }

  async summary(scope: UsageScope): Promise<UsageSummary> {
    assertScope(scope);
    return this.repository.runExclusive(scope, () => {
      const now = this.now();
      const budgets = this.requireBudgets(scope, now);
      return {
        scope,
        tenantBudget: budgets.tenant,
        projectBudget: budgets.project,
        activeReservations: this.repository
          .listReservations(scope)
          .filter((reservation) => reservation.status === "active" && reservation.expiresAt > now),
        receipts: this.repository.listReceipts(scope),
        alerts: this.repository.listAlerts(scope),
        generatedAt: now,
      };
    });
  }

  async reconcile(scope: UsageScope, actor: MeteringActor): Promise<ReconciliationReport> {
    assertScope(scope);
    assertActor(actor);
    if (!(["owner", "admin", "auditor", "service"] as const).includes(actor.role as "owner" | "admin" | "auditor" | "service")) {
      throw new MeteringError("forbidden", "Reconciliation requires audit authority", 403);
    }

    return this.repository.runExclusive(scope, () => {
      const checkedAt = this.now();
      const preEventReport = reconcileMeteringSnapshot(this.repository.snapshot(scope), checkedAt);
      this.repository.appendLedgerEvent({
        scope,
        type: "reconciliation_completed",
        actor,
        operationExecutionId: null,
        quoteId: null,
        reservationId: null,
        receiptId: null,
        coUnits: preEventReport.committedCoUnits,
        idempotencyKey: null,
        rateVersion: this.catalog.version,
        pricingVersion: this.pricing.version,
        occurredAt: checkedAt,
        details: {
          pre_event_report_id: preEventReport.id,
          passed: preEventReport.passed,
          finding_count: preEventReport.findings.length,
        },
      });
      return reconcileMeteringSnapshot(this.repository.snapshot(scope), checkedAt);
    });
  }

  async exportAudit(scope: UsageScope, actor: MeteringActor) {
    assertScope(scope);
    assertActor(actor);
    if (!(["owner", "admin", "auditor", "service"] as const).includes(actor.role as "owner" | "admin" | "auditor" | "service")) {
      throw new MeteringError("forbidden", "Audit export requires audit authority", 403);
    }

    return this.repository.runExclusive(scope, () => {
      const exportedAt = this.now();
      const snapshot = this.repository.snapshot(scope);
      const reconciliation = reconcileMeteringSnapshot(snapshot, exportedAt);
      const rateCatalogs = new Map<string, RateCatalog>([
        [this.catalog.integrityHash, this.catalog],
        ...snapshot.quotes.map(
          (quote) => [quote.rateCatalogHash, quote.rateCatalog] as const,
        ),
        ...snapshot.reservations.map(
          (reservation) =>
            [reservation.rateCatalogHash, reservation.rateCatalog] as const,
        ),
      ]);
      const pricingTerms = new Map<
        string,
        { terms: CommercialPricingTerms; integrityHash: string }
      >([
        [
          sha256(this.pricing),
          { terms: this.pricing, integrityHash: sha256(this.pricing) },
        ],
        ...snapshot.quotes.map(
          (quote) =>
            [
              quote.pricingTermsHash,
              {
                terms: quote.pricingTerms,
                integrityHash: quote.pricingTermsHash,
              },
            ] as const,
        ),
        ...snapshot.reservations.map(
          (reservation) =>
            [
              reservation.pricingTermsHash,
              {
                terms: reservation.pricingTerms,
                integrityHash: reservation.pricingTermsHash,
              },
            ] as const,
        ),
      ]);
      const records = [
        ...[...rateCatalogs.values()].map((record) => ({ type: "rate_catalog", record })),
        ...[...pricingTerms.values()].map((record) => ({ type: "pricing_terms", record })),
        ...snapshot.budgetHistory.map((record) => ({ type: "budget_policy", record })),
        ...snapshot.quotes.map((record) => ({ type: "quote", record })),
        ...snapshot.reservations.map((record) => ({ type: "reservation", record })),
        ...snapshot.receipts.map((record) => ({ type: "receipt", record })),
        ...snapshot.ledgerEvents.map((record) => ({ type: "ledger_event", record })),
        ...snapshot.alerts.map((record) => ({ type: "quota_alert", record })),
        ...snapshot.idempotencyRecords.map((record) => ({
          type: "idempotency_record",
          record,
        })),
        { type: "reconciliation", record: reconciliation },
      ];
      const manifest = {
        schemaVersion: "metering-audit-export.v1",
        scope,
        exportedAt,
        exportedBy: actor.id,
        recordCount: records.length,
        rateVersion: this.catalog.version,
        rateCatalogHash: this.catalog.integrityHash,
        pricingVersion: this.pricing.version,
        pricingTermsHash: sha256(this.pricing),
        ledgerHeadHash: snapshot.ledgerEvents.at(-1)?.hash ?? null,
        paymentMutation: "none" as const,
      };
      const lines = [
        canonicalJson({ type: "manifest", record: manifest }),
        ...records.map(canonicalJson),
      ];
      const jsonl = `${lines.join("\n")}\n`;
      return {
        manifest,
        reconciliation,
        jsonl,
        sha256: sha256(jsonl),
        filename: `co-credit-audit-${scope.organizationId}-${scope.projectId}.jsonl`,
      };
    });
  }

  getOperation(operation: MeteredOperation) {
    return this.catalog.rates[operation];
  }
}

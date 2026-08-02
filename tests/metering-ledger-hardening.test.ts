import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./typescript-resolver.mjs", import.meta.url);

const {
  createBudgetPolicy,
  DEFAULT_RATE_CATALOG,
  DEMO_COMMERCIAL_TERMS,
  InMemoryMeteringRepository,
  MeteringError,
  MeteringService,
  reconcileMeteringSnapshot,
} = await import("../lib/metering/index.ts");
const { assertActor, scopeKey } = await import("../lib/metering/policy.ts");
const { sha256 } = await import("../lib/metering/canonical.ts");

import type {
  BudgetPolicy,
  MeteringActor,
  UsageReceipt,
  UsageScope,
} from "../lib/metering/types.ts";

const owner: MeteringActor = { id: "owner-hardening", role: "owner", kind: "human" };
const scope: UsageScope = { organizationId: "org-hardening", projectId: "project-alpha" };

function clockedService(repository = new InMemoryMeteringRepository()) {
  let now = new Date("2026-07-14T12:00:00.000Z");
  const service = new MeteringService(repository, {
    pricing: DEMO_COMMERCIAL_TERMS,
    clock: () => now,
  });
  return {
    repository,
    service,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
    now: () => now.toISOString(),
  };
}

async function configure(
  service: InstanceType<typeof MeteringService>,
  target: UsageScope,
  now: string,
  options: Partial<{
    includedCoUnits: number;
    entitlementStatus: "active" | "suspended";
    allowedOperations: BudgetPolicy["allowedOperations"];
    maximumReservationCoUnits: number;
    versionSuffix: string;
  }> = {},
) {
  for (const budgetScope of ["tenant", "project"] as const) {
    await service.configureBudget(
      createBudgetPolicy({
        scope: target,
        budgetScope,
        includedCoUnits: options.includedCoUnits ?? 2_000,
        entitlementStatus: options.entitlementStatus,
        allowedOperations: options.allowedOperations,
        maximumReservationCoUnits: options.maximumReservationCoUnits,
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-08-01T00:00:00.000Z",
        configuredAt: now,
        actor: owner,
        version: `${budgetScope}.${options.versionSuffix ?? "v1"}`,
      }),
      owner,
      target,
    );
  }
}

async function reserveTranscription(
  service: InstanceType<typeof MeteringService>,
  target = scope,
  suffix = "1",
) {
  const quote = await service.estimate({
    scope: target,
    operationExecutionId: `hardening:execution:${suffix}`,
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: `hardening:estimate:${suffix}`,
  });
  const result = await service.reserve({
    scope: target,
    quoteId: quote.id,
    actor: owner,
    idempotencyKey: `hardening:reserve:${suffix}`,
  });
  return { quote, ...result };
}

test("scope keys cannot collide when identifiers contain delimiters", () => {
  const left = { organizationId: "org:a", projectId: "project" };
  const right = { organizationId: "org", projectId: "a:project" };
  assert.notEqual(scopeKey(left), scopeKey(right));
  assert.throws(
    () =>
      assertActor({
        id: "forged-root",
        role: "root" as never,
        kind: "human",
      }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "invalid_actor_role",
  );
  assert.throws(
    () =>
      assertActor({
        id: "forged-service",
        role: "service",
        kind: "human",
      }),
    (error: unknown) => error instanceof MeteringError && error.code === "invalid_actor",
  );
});

test("runtime identifiers reject missing execution authority instead of coercing it", async () => {
  const { service } = clockedService();
  await assert.rejects(
    service.estimate({
      scope,
      operationExecutionId: undefined as never,
      operation: "transcription",
      nativeUsage: { audio_milliseconds: 60_000 },
      requestedBy: owner,
      idempotencyKey: "hardening:estimate:missing-execution",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "invalid_identifier",
  );
});

test("repository transactions serialize organization-wide decisions and roll back failures", async () => {
  class FailingRepository extends InMemoryMeteringRepository {
    failReservationReceipt = true;

    override saveReceipt(receipt: UsageReceipt) {
      if (this.failReservationReceipt && receipt.kind === "reservation") {
        this.failReservationReceipt = false;
        throw new Error("simulated durable receipt failure");
      }
      super.saveReceipt(receipt);
    }
  }

  const repository = new FailingRepository();
  const { service, now } = clockedService(repository);
  await configure(service, scope, now());
  const quote = await service.estimate({
    scope,
    operationExecutionId: "hardening:execution:rollback",
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:rollback",
  });
  const before = repository.snapshot(scope);
  await assert.rejects(
    service.reserve({
      scope,
      quoteId: quote.id,
      actor: owner,
      idempotencyKey: "hardening:reserve:rollback",
    }),
    /simulated durable receipt failure/,
  );
  const afterFailure = repository.snapshot(scope);
  assert.equal(afterFailure.reservations.length, before.reservations.length);
  assert.equal(afterFailure.receipts.length, before.receipts.length);
  assert.equal(afterFailure.ledgerEvents.length, before.ledgerEvents.length);
  assert.equal(afterFailure.idempotencyRecords.length, before.idempotencyRecords.length);

  const retry = await service.reserve({
    scope,
    quoteId: quote.id,
    actor: owner,
    idempotencyKey: "hardening:reserve:rollback",
  });
  assert.equal(retry.replayed, false);

  let concurrent = 0;
  let maximumConcurrent = 0;
  const projectB = { ...scope, projectId: "project-beta" };
  await Promise.all([
    repository.runExclusive(scope, async () => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent -= 1;
    }),
    repository.runExclusive(projectB, async () => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent -= 1;
    }),
  ]);
  assert.equal(maximumConcurrent, 1);
});

test("idempotency records are integrity protected and append-only", async () => {
  const { repository, service } = clockedService();
  await service.estimate({
    scope,
    operationExecutionId: "hardening:execution:idempotency-index",
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:idempotency-index",
  });
  const [record] = repository.snapshot(scope).idempotencyRecords;
  assert.ok(record);

  const { integrityHash: _integrityHash, ...unsigned } = record;
  void _integrityHash;
  assert.throws(
    () =>
      repository.saveIdempotency({
        ...unsigned,
        resourceId: "quote_replacement",
        integrityHash: sha256({ ...unsigned, resourceId: "quote_replacement" }),
      }),
    /Idempotency conflict/,
  );
  assert.throws(
    () => repository.saveIdempotency({ ...record, integrityHash: "tampered" }),
    /Idempotency integrity failure/,
  );
});

test("runtime outcome validation prevents forged no-debit settlements", async () => {
  const { repository, service, now } = clockedService();
  await configure(service, scope, now());
  const { reservation } = await reserveTranscription(service, scope, "outcome");

  await assert.rejects(
    service.commit({
      scope,
      operationExecutionId: reservation.operationExecutionId,
      reservationId: reservation.id,
      outcome: "forged_no_debit" as never,
      actualUsage: { audio_milliseconds: 60_000 },
      providerCost: null,
      actor: owner,
      idempotencyKey: "hardening:commit:forged-outcome",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "invalid_usage_outcome",
  );
  assert.equal(repository.getReservation(reservation.id)?.status, "active");
  assert.equal(
    repository.listReceipts(scope).filter((receipt) => receipt.kind === "commit").length,
    0,
  );
});

test("entitlements deny suspended, excluded, and oversized compute before reservation", async () => {
  const suspended = clockedService();
  await configure(suspended.service, scope, suspended.now(), {
    entitlementStatus: "suspended",
  });
  const suspendedQuote = await suspended.service.estimate({
    scope,
    operationExecutionId: "hardening:execution:suspended",
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:suspended",
  });
  await assert.rejects(
    suspended.service.reserve({
      scope,
      quoteId: suspendedQuote.id,
      actor: owner,
      idempotencyKey: "hardening:reserve:suspended",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "entitlement_suspended",
  );

  const excluded = clockedService();
  await configure(excluded.service, scope, excluded.now(), {
    allowedOperations: ["ai_research"],
  });
  const excludedQuote = await excluded.service.estimate({
    scope,
    operationExecutionId: "hardening:execution:excluded",
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:excluded",
  });
  await assert.rejects(
    excluded.service.reserve({
      scope,
      quoteId: excludedQuote.id,
      actor: owner,
      idempotencyKey: "hardening:reserve:excluded",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "operation_not_entitled",
  );

  const capped = clockedService();
  await configure(capped.service, scope, capped.now(), {
    maximumReservationCoUnits: 100,
  });
  const cappedQuote = await capped.service.estimate({
    scope,
    operationExecutionId: "hardening:execution:capped",
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:capped",
  });
  await assert.rejects(
    capped.service.reserve({
      scope,
      quoteId: cappedQuote.id,
      actor: owner,
      idempotencyKey: "hardening:reserve:capped",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "reservation_entitlement_limit",
  );
});

test("budget history keeps old quote provenance reconcilable after policy replacement", async () => {
  const { repository, service, now } = clockedService();
  await configure(service, scope, now(), { versionSuffix: "v1" });
  const quote = await service.estimate({
    scope,
    operationExecutionId: "hardening:execution:history",
    operation: "ai_generation",
    nativeUsage: { input_tokens: 1_000, output_tokens: 1_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:history",
  });
  await configure(service, scope, now(), { versionSuffix: "v2" });

  const snapshot = repository.snapshot(scope);
  assert.equal(snapshot.budgetHistory.length, 4);
  for (const balance of quote.balances) {
    assert.equal(
      snapshot.budgetHistory.some(
        (budget) =>
          budget.id === balance.budgetId &&
          budget.integrityHash === balance.budgetIntegrityHash,
      ),
      true,
    );
  }
  const report = reconcileMeteringSnapshot(snapshot, now());
  assert.equal(report.passed, true, JSON.stringify(report.findings));
});

test("reconciliation detects broken receipt-to-ledger bindings", async () => {
  const { repository, service, now } = clockedService();
  await configure(service, scope, now());
  await reserveTranscription(service, scope, "binding");
  const snapshot = repository.snapshot(scope);
  const tampered = {
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) =>
      receipt.kind === "reservation"
        ? { ...receipt, ledgerEventIds: ["mle_missing"] }
        : receipt,
    ),
  };
  const report = reconcileMeteringSnapshot(tampered, now());
  assert.equal(report.passed, false);
  assert.equal(
    report.findings.some((finding) => finding.code === "receipt_ledger_event_missing"),
    true,
  );
});

test("oversized native usage fails closed before quote persistence", async () => {
  const { repository, service, now } = clockedService();
  await configure(service, scope, now());
  const before = repository.snapshot(scope);
  await assert.rejects(
    service.estimate({
      scope,
      operationExecutionId: "hardening:execution:overflow",
      operation: "ai_generation",
      nativeUsage: { output_tokens: Number.MAX_SAFE_INTEGER },
      requestedBy: owner,
      idempotencyKey: "hardening:estimate:overflow",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "integer_overflow",
  );
  assert.equal(repository.snapshot(scope).quotes.length, before.quotes.length);
});

test("expiration settlement commits atomically even though commit returns a conflict", async () => {
  const { repository, service, now, advance } = clockedService();
  await configure(service, scope, now());
  const { reservation } = await reserveTranscription(service, scope, "expiration");
  advance(16 * 60 * 1_000);

  await assert.rejects(
    service.commit({
      scope,
      operationExecutionId: reservation.operationExecutionId,
      reservationId: reservation.id,
      outcome: "succeeded",
      actualUsage: { audio_milliseconds: 60_000 },
      providerCost: null,
      actor: owner,
      idempotencyKey: "hardening:commit:expired",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "reservation_expired",
  );
  assert.equal(repository.getReservation(reservation.id)?.status, "expired");
  assert.equal(
    repository
      .listReceipts(scope)
      .some((receipt) => receipt.reservationId === reservation.id && receipt.kind === "expiration"),
    true,
  );
});

test("one logical execution cannot reserve or debit twice under new request keys", async () => {
  const { repository, service, now } = clockedService();
  await configure(service, scope, now());
  const operationExecutionId = "hardening:execution:retry-stable";

  const firstQuote = await service.estimate({
    scope,
    operationExecutionId,
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:retry-stable:first",
  });
  const first = await service.reserve({
    scope,
    quoteId: firstQuote.id,
    actor: owner,
    idempotencyKey: "hardening:reserve:retry-stable:first",
  });

  const retryQuote = await service.estimate({
    scope,
    operationExecutionId,
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:retry-stable:second",
  });
  assert.notEqual(firstQuote.id, retryQuote.id);
  const retry = await service.reserve({
    scope,
    quoteId: retryQuote.id,
    actor: owner,
    idempotencyKey: "hardening:reserve:retry-stable:second",
  });
  assert.equal(retry.replayed, true);
  assert.equal(retry.reservation.id, first.reservation.id);

  const commit = {
    scope,
    operationExecutionId,
    reservationId: first.reservation.id,
    outcome: "succeeded" as const,
    actualUsage: { audio_milliseconds: 60_000 },
    providerCost: null,
    actor: owner,
  };
  const firstCommit = await service.commit({
    ...commit,
    idempotencyKey: "hardening:commit:retry-stable:first",
  });
  const retryCommit = await service.commit({
    ...commit,
    idempotencyKey: "hardening:commit:retry-stable:second",
  });
  assert.equal(retryCommit.replayed, true);
  assert.equal(retryCommit.receipt.id, firstCommit.receipt.id);
  assert.equal(
    repository.listReceipts(scope).filter((receipt) => receipt.kind === "commit").length,
    1,
  );

  const conflictingQuote = await service.estimate({
    scope,
    operationExecutionId,
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 120_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:retry-stable:conflict",
  });
  await assert.rejects(
    service.reserve({
      scope,
      quoteId: conflictingQuote.id,
      actor: owner,
      idempotencyKey: "hardening:reserve:retry-stable:conflict",
    }),
    (error: unknown) =>
      error instanceof MeteringError && error.code === "operation_execution_conflict",
  );
  const report = reconcileMeteringSnapshot(repository.snapshot(scope), now());
  assert.equal(report.passed, true, JSON.stringify(report.findings));
});

test("catalog rollover settles with the immutable rate snapshot pinned at reservation", async () => {
  const repository = new InMemoryMeteringRepository();
  const now = new Date("2026-07-14T12:00:00.000Z");
  const catalog = (version: string, coUnitsPerMinute: number) => {
    const { integrityHash: _integrityHash, ...base } = DEFAULT_RATE_CATALOG;
    void _integrityHash;
    const unsigned = {
      ...base,
      version,
      status: "approved" as const,
      rates: {
        ...base.rates,
        transcription: {
          ...base.rates.transcription,
          components: [
            {
              dimension: "audio_milliseconds" as const,
              blockSize: 60_000,
              coUnitsPerBlock: coUnitsPerMinute,
            },
          ],
        },
      },
    };
    return { ...unsigned, integrityHash: sha256(unsigned) };
  };
  const v1 = catalog("hardening-rate.v1", 90);
  const v2 = catalog("hardening-rate.v2", 180);
  const serviceV1 = new MeteringService(repository, {
    catalog: v1,
    pricing: DEMO_COMMERCIAL_TERMS,
    clock: () => now,
  });
  await configure(serviceV1, scope, now.toISOString());
  const quote = await serviceV1.estimate({
    scope,
    operationExecutionId: "hardening:execution:catalog-rollover",
    operation: "transcription",
    nativeUsage: { audio_milliseconds: 60_000 },
    requestedBy: owner,
    idempotencyKey: "hardening:estimate:catalog-rollover",
  });
  const { reservation } = await serviceV1.reserve({
    scope,
    quoteId: quote.id,
    actor: owner,
    idempotencyKey: "hardening:reserve:catalog-rollover",
  });

  const serviceV2 = new MeteringService(repository, {
    catalog: v2,
    pricing: DEMO_COMMERCIAL_TERMS,
    clock: () => now,
  });
  const { receipt } = await serviceV2.commit({
    scope,
    operationExecutionId: reservation.operationExecutionId,
    reservationId: reservation.id,
    outcome: "succeeded",
    actualUsage: { audio_milliseconds: 60_000 },
    providerCost: null,
    actor: owner,
    idempotencyKey: "hardening:commit:catalog-rollover",
  });

  assert.equal(quote.coUnits.likely, 100);
  assert.equal(receipt.committedCoUnits, 100);
  assert.equal(receipt.rateVersion, v1.version);
  assert.equal(receipt.rateCatalogHash, v1.integrityHash);
  assert.notEqual(receipt.rateCatalogHash, v2.integrityHash);
  const audit = await serviceV2.exportAudit(scope, owner);
  assert.match(audit.jsonl, new RegExp(v1.integrityHash));
  assert.match(audit.jsonl, new RegExp(v2.integrityHash));
});

test("reconciliation fails when resource idempotency lineage is removed", async () => {
  const { repository, service, now } = clockedService();
  await configure(service, scope, now());
  const { reservation } = await reserveTranscription(service, scope, "missing-lineage");
  await service.commit({
    scope,
    operationExecutionId: reservation.operationExecutionId,
    reservationId: reservation.id,
    outcome: "succeeded",
    actualUsage: { audio_milliseconds: 60_000 },
    providerCost: null,
    actor: owner,
    idempotencyKey: "hardening:commit:missing-lineage",
  });
  const report = reconcileMeteringSnapshot(
    { ...repository.snapshot(scope), idempotencyRecords: [] },
    now(),
  );
  assert.equal(report.passed, false);
  assert.equal(
    report.findings.some((finding) => finding.code === "quote_idempotency_missing"),
    true,
  );
  assert.equal(
    report.findings.some((finding) => finding.code === "reservation_idempotency_missing"),
    true,
  );
  assert.equal(
    report.findings.some((finding) => finding.code === "receipt_idempotency_missing"),
    true,
  );
});

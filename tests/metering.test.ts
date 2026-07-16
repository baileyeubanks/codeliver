import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./typescript-resolver.mjs", import.meta.url);

const {
  createBudgetPolicy,
  createOverageConsent,
  DEMO_COMMERCIAL_TERMS,
  InMemoryMeteringRepository,
  MeteringError,
  MeteringService,
  reconcileMeteringSnapshot,
} = await import("../lib/metering/index.ts");

import type {
  MeteringActor,
  UsageScope,
} from "../lib/metering/types.ts";

const scope: UsageScope = {
  organizationId: "org-enterprise",
  projectId: "project-alpha",
};

const owner: MeteringActor = {
  id: "owner-1",
  role: "owner",
  kind: "human",
};

function harness(includedCoUnits = 2_000) {
  let now = new Date("2026-07-14T12:00:00.000Z");
  const repository = new InMemoryMeteringRepository();
  const service = new MeteringService(repository, {
    pricing: DEMO_COMMERCIAL_TERMS,
    clock: () => now,
  });

  const configure = async (overage = false) => {
    const consent = overage
      ? createOverageConsent({
          scope,
          additionalCoUnitCap: 1_000,
          currencyCapMicros: 1_000_000,
          pricingVersion: DEMO_COMMERCIAL_TERMS.version,
          actor: owner,
          grantedAt: now.toISOString(),
          expiresAt: "2026-08-01T00:00:00.000Z",
        })
      : null;

    for (const budgetScope of ["tenant", "project"] as const) {
      await service.configureBudget(
        createBudgetPolicy({
          scope,
          budgetScope,
          includedCoUnits,
          periodStart: "2026-07-01T00:00:00.000Z",
          periodEnd: "2026-08-01T00:00:00.000Z",
          configuredAt: now.toISOString(),
          actor: owner,
          version: `${budgetScope}.v1`,
          overageConsent: consent,
        }),
        owner,
        scope,
      );
    }
  };

  return {
    repository,
    service,
    configure,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

async function quoteTranscription(
  service: MeteringService,
  key: string,
  milliseconds = 60_000,
) {
  return service.estimate({
    scope,
    operation: "transcription",
    nativeUsage: { audio_milliseconds: milliseconds },
    requestedBy: owner,
    idempotencyKey: key,
  });
}

test("compute estimates are deterministic, integer-only, and version-provenanced", async () => {
  const { service, configure } = harness();
  await configure();

  const quote = await service.estimate({
    scope,
    operation: "ai_generation",
    nativeUsage: { output_tokens: 1_000, input_tokens: 1_000 },
    requestedBy: owner,
    idempotencyKey: "estimate:deterministic:1",
  });
  const replay = await service.estimate({
    scope,
    operation: "ai_generation",
    nativeUsage: { input_tokens: 1_000, output_tokens: 1_000 },
    requestedBy: owner,
    idempotencyKey: "estimate:deterministic:1",
  });

  assert.deepEqual(quote, replay);
  assert.deepEqual(quote.coUnits, { min: 22, likely: 27, max: 34 });
  assert.equal(Number.isInteger(quote.coUnits.max), true);
  assert.match(quote.rateVersion, /^cco-cu-contract-/);
  assert.equal(quote.rateCatalogHash.length, 64);
  assert.equal(quote.paymentMutation, "none");
});

test("free collaboration cannot create a reservation or customer debit", async () => {
  const { service, configure } = harness();
  await configure();
  const quote = await service.estimate({
    scope,
    operation: "approved_final_download",
    nativeUsage: {},
    requestedBy: owner,
    idempotencyKey: "estimate:free-final:1",
  });

  assert.equal(quote.meterClass, "free_collaboration");
  assert.deepEqual(quote.coUnits, { min: 0, likely: 0, max: 0 });
  await assert.rejects(
    service.reserve({
      scope,
      quoteId: quote.id,
      actor: owner,
      idempotencyKey: "reserve:free-final:1",
    }),
    (error: unknown) => error instanceof MeteringError && error.code === "free_operation",
  );

  const { receipt } = await service.recordCollaboration({
    scope,
    operation: "approved_final_download",
    actor: owner,
    idempotencyKey: "collab:free-final:1",
  });
  assert.equal(receipt.committedCoUnits, 0);
  assert.equal(receipt.paymentMutation, "none");
});

test("overage is default-off and requires matching CU, currency, and pricing caps", async () => {
  const blocked = harness(100);
  await blocked.configure(false);
  const blockedQuote = await quoteTranscription(blocked.service, "estimate:overage:blocked", 60_000);
  assert.equal(blockedQuote.coUnits.max, 125);
  assert.equal(blockedQuote.overage.required, true);
  assert.equal(blockedQuote.overage.allowedAtQuoteTime, false);
  await assert.rejects(
    blocked.service.reserve({
      scope,
      quoteId: blockedQuote.id,
      actor: owner,
      idempotencyKey: "reserve:overage:blocked",
    }),
    (error: unknown) => error instanceof MeteringError && error.code === "budget_exhausted",
  );

  const allowed = harness(100);
  await allowed.configure(true);
  const allowedQuote = await quoteTranscription(allowed.service, "estimate:overage:allowed", 60_000);
  assert.equal(allowedQuote.overage.allowedAtQuoteTime, true);
  const reservation = await allowed.service.reserve({
    scope,
    quoteId: allowedQuote.id,
    actor: owner,
    idempotencyKey: "reserve:overage:allowed",
  });
  assert.equal(reservation.reservation.maximumCoUnits, 125);
});

test("concurrent reservations serialize against tenant and project hard limits", async () => {
  const { service, configure } = harness(150);
  await configure();
  const [quoteA, quoteB] = await Promise.all([
    quoteTranscription(service, "estimate:race:a"),
    quoteTranscription(service, "estimate:race:b"),
  ]);

  const results = await Promise.allSettled([
    service.reserve({
      scope,
      quoteId: quoteA.id,
      actor: owner,
      idempotencyKey: "reserve:race:a",
    }),
    service.reserve({
      scope,
      quoteId: quoteB.id,
      actor: owner,
      idempotencyKey: "reserve:race:b",
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(
    rejected?.status === "rejected" && rejected.reason instanceof MeteringError
      ? rejected.reason.code
      : null,
    "budget_exhausted",
  );
});

test("reserve and commit retries are idempotent and commit at most once", async () => {
  const { service, configure } = harness();
  await configure();
  const quote = await quoteTranscription(service, "estimate:idempotent:1");
  const reserveInput = {
    scope,
    quoteId: quote.id,
    actor: owner,
    idempotencyKey: "reserve:idempotent:1",
  } as const;
  const [firstReservation, replayedReservation] = await Promise.all([
    service.reserve(reserveInput),
    service.reserve(reserveInput),
  ]);
  assert.equal(firstReservation.reservation.id, replayedReservation.reservation.id);
  assert.equal([firstReservation.replayed, replayedReservation.replayed].includes(true), true);

  const commitInput = {
    scope,
    reservationId: firstReservation.reservation.id,
    outcome: "succeeded" as const,
    actualUsage: { audio_milliseconds: 60_000 },
    providerCost: {
      provider: "demo-stt",
      service: "transcription",
      model: "accurate-v1",
      region: "us-central",
      providerRequestIdHash: "a".repeat(64),
      nativeUsage: { audio_milliseconds: 60_000 },
      rateVersion: "demo-stt-cost.v1",
      currency: "USD" as const,
      calculatedCostMicros: 12_000,
      reportedCostMicros: 12_000,
    },
    actor: owner,
    idempotencyKey: "commit:idempotent:1",
  };
  const [firstCommit, replayedCommit] = await Promise.all([
    service.commit(commitInput),
    service.commit(commitInput),
  ]);
  assert.equal(firstCommit.receipt.id, replayedCommit.receipt.id);

  const summary = await service.summary(scope);
  assert.equal(summary.receipts.filter((receipt) => receipt.kind === "commit").length, 1);
  assert.equal(summary.projectBudget.committedCoUnits, 100);
});

test("platform overruns are absorbed above the confirmed maximum", async () => {
  const { service, configure } = harness();
  await configure();
  const quote = await quoteTranscription(service, "estimate:absorbed:1", 60_000);
  const { reservation } = await service.reserve({
    scope,
    quoteId: quote.id,
    actor: owner,
    idempotencyKey: "reserve:absorbed:1",
  });
  const { receipt } = await service.commit({
    scope,
    reservationId: reservation.id,
    outcome: "succeeded",
    actualUsage: { audio_milliseconds: 180_000 },
    providerCost: null,
    actor: owner,
    idempotencyKey: "commit:absorbed:1",
  });

  assert.equal(receipt.committedCoUnits, quote.coUnits.max);
  assert.equal(receipt.absorbedCoUnits, 155);
  assert.equal(receipt.releasedCoUnits, 0);
});

test("failure, safety rejection, duplicate, cache, and retry outcomes never debit", async (t) => {
  for (const outcome of [
    "failed",
    "duplicate",
    "unusable_output",
    "safety_rejected",
    "cache_hit",
    "platform_retry",
  ] as const) {
    await t.test(outcome, async () => {
      const testScope = { ...scope, projectId: `project-${outcome}` };
      const { repository } = harness();
      let now = new Date("2026-07-14T12:00:00.000Z");
      const service = new MeteringService(repository, {
        pricing: DEMO_COMMERCIAL_TERMS,
        clock: () => now,
      });
      for (const budgetScope of ["tenant", "project"] as const) {
        await service.configureBudget(
          createBudgetPolicy({
            scope: testScope,
            budgetScope,
            includedCoUnits: 2_000,
            periodStart: "2026-07-01T00:00:00.000Z",
            periodEnd: "2026-08-01T00:00:00.000Z",
            configuredAt: now.toISOString(),
            actor: owner,
            version: `${budgetScope}.${outcome}.v1`,
          }),
          owner,
          testScope,
        );
      }
      const quote = await service.estimate({
        scope: testScope,
        operation: "ai_generation",
        nativeUsage: { input_tokens: 1_000, output_tokens: 1_000 },
        requestedBy: owner,
        idempotencyKey: `estimate:${outcome}:1`,
      });
      const { reservation } = await service.reserve({
        scope: testScope,
        quoteId: quote.id,
        actor: owner,
        idempotencyKey: `reserve:${outcome}:1`,
      });
      const { receipt } = await service.commit({
        scope: testScope,
        reservationId: reservation.id,
        outcome,
        actualUsage: { input_tokens: 10_000, output_tokens: 10_000 },
        providerCost: null,
        actor: owner,
        idempotencyKey: `commit:${outcome}:1`,
      });
      assert.equal(receipt.committedCoUnits, 0);
      assert.equal(receipt.releasedCoUnits, reservation.maximumCoUnits);
      assert.match(receipt.noDebitReason ?? "", /do(?:es)? not debit/);
      now = new Date(now.getTime() + 1);
    });
  }
});

test("idempotency keys reject payload substitution", async () => {
  const { service, configure } = harness();
  await configure();
  await quoteTranscription(service, "estimate:substitution:1", 60_000);
  await assert.rejects(
    quoteTranscription(service, "estimate:substitution:1", 120_000),
    (error: unknown) => error instanceof MeteringError && error.code === "idempotency_conflict",
  );
});

test("reconciliation proves a clean ledger and detects tampered receipts", async () => {
  const { repository, service, configure } = harness();
  await configure();
  const quote = await quoteTranscription(service, "estimate:reconcile:1");
  const { reservation } = await service.reserve({
    scope,
    quoteId: quote.id,
    actor: owner,
    idempotencyKey: "reserve:reconcile:1",
  });
  await service.commit({
    scope,
    reservationId: reservation.id,
    outcome: "succeeded",
    actualUsage: { audio_milliseconds: 60_000 },
    providerCost: null,
    actor: owner,
    idempotencyKey: "commit:reconcile:1",
  });

  const clean = await service.reconcile(scope, owner);
  assert.equal(clean.passed, true, JSON.stringify(clean.findings));

  const snapshot = repository.snapshot(scope);
  const tampered = {
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) =>
      receipt.kind === "commit"
        ? { ...receipt, committedCoUnits: receipt.committedCoUnits + 1 }
        : receipt,
    ),
  };
  const report = reconcileMeteringSnapshot(tampered, "2026-07-14T13:00:00.000Z");
  assert.equal(report.passed, false);
  assert.equal(
    report.findings.some((finding) => finding.code === "integrity_hash_mismatch"),
    true,
  );
  assert.equal(
    report.findings.some((finding) => finding.code === "ledger_receipt_debit_mismatch"),
    true,
  );
});

test("audit export is hashable JSONL and contains no payment action", async () => {
  const { service, configure } = harness();
  await configure();
  await service.recordCollaboration({
    scope,
    operation: "comment",
    actor: owner,
    idempotencyKey: "collab:audit:1",
  });
  const audit = await service.exportAudit(scope, owner);

  assert.match(audit.filename, /^co-credit-audit-/);
  assert.equal(audit.sha256.length, 64);
  assert.equal(audit.jsonl.endsWith("\n"), true);
  assert.equal(audit.jsonl.includes('"paymentMutation":"none"'), true);
  assert.equal(/checkout|payment_intent|charge_customer/i.test(audit.jsonl), false);
});

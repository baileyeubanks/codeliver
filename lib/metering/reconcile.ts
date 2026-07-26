import { compositeKey, deterministicId, sha256 } from "./canonical";
import { ledgerEventHash } from "./in-memory-repository";
import { sameScope, scopeKey } from "./policy";
import type { MeteringStateSnapshot } from "./repository";
import type {
  MeteringLedgerEvent,
  ReconciliationFinding,
  ReconciliationReport,
} from "./types";

function integrityHash(value: { integrityHash: string }) {
  const { integrityHash: _integrityHash, ...unsigned } = value;
  void _integrityHash;
  return sha256(unsigned);
}

function eventHash(event: MeteringLedgerEvent) {
  const { hash: _hash, ...unsigned } = event;
  void _hash;
  return ledgerEventHash(unsigned);
}

function expectedReceiptEventType(kind: string) {
  switch (kind) {
    case "collaboration":
      return "collaboration_recorded";
    case "reservation":
      return "reservation_created";
    case "commit":
      return "usage_committed";
    case "release":
      return "reservation_released";
    case "expiration":
      return "reservation_expired";
    default:
      return null;
  }
}

export function reconcileMeteringSnapshot(
  snapshot: MeteringStateSnapshot,
  checkedAt: string,
): ReconciliationReport {
  const findings: ReconciliationFinding[] = [];
  const add = (
    code: string,
    message: string,
    resourceId: string | null,
    severity: "error" | "warning" = "error",
  ) => findings.push({ code, severity, message, resourceId });

  const budgetsById = new Map(
    [...snapshot.budgetHistory, ...snapshot.budgets].map((budget) => [budget.id, budget]),
  );
  for (const resource of [
    ...budgetsById.values(),
    ...snapshot.quotes,
    ...snapshot.reservations,
    ...snapshot.receipts,
  ]) {
    let calculatedIntegrity: string | null = null;
    try {
      calculatedIntegrity = integrityHash(resource);
    } catch {
      add("integrity_payload_invalid", "Stored resource cannot be canonically hashed", resource.id);
    }
    if (calculatedIntegrity !== null && resource.integrityHash !== calculatedIntegrity) {
      add("integrity_hash_mismatch", "Stored resource integrity hash is invalid", resource.id);
    }
    if (resource.paymentMutation !== "none") {
      add("payment_mutation_forbidden", "Metering records may not express payment mutation", resource.id);
    }
  }

  let previousHash: string | null = null;
  const eventIds = new Set<string>();
  snapshot.ledgerEvents.forEach((event, index) => {
    if (eventIds.has(event.id)) {
      add("duplicate_ledger_event_id", "Ledger event ID is not unique", event.id);
    }
    eventIds.add(event.id);
    if (!sameScope(event.scope, snapshot.scope)) {
      add("ledger_scope_mismatch", "Ledger event belongs to another scope", event.id);
    }
    if (event.sequence !== index + 1) {
      add("ledger_sequence_gap", "Ledger sequence is not contiguous", event.id);
    }
    if (event.previousHash !== previousHash) {
      add("ledger_chain_break", "Ledger previousHash does not match", event.id);
    }
    try {
      if (event.hash !== eventHash(event)) {
        add("ledger_hash_mismatch", "Ledger event hash is invalid", event.id);
      }
    } catch {
      add("ledger_payload_invalid", "Ledger event cannot be canonically hashed", event.id);
    }
    if (event.paymentMutation !== "none") {
      add("payment_mutation_forbidden", "Ledger event may not express payment mutation", event.id);
    }
    previousHash = event.hash;
  });

  const quotesById = new Map(snapshot.quotes.map((quote) => [quote.id, quote]));
  const reservationsById = new Map(
    snapshot.reservations.map((reservation) => [reservation.id, reservation]),
  );
  const receiptsById = new Map(snapshot.receipts.map((receipt) => [receipt.id, receipt]));
  const eventsById = new Map(snapshot.ledgerEvents.map((event) => [event.id, event]));

  for (const quote of snapshot.quotes) {
    if (!sameScope(quote.scope, snapshot.scope)) {
      add("quote_scope_mismatch", "Quote belongs to another scope", quote.id);
    }
    for (const balance of quote.balances) {
      const budget = budgetsById.get(balance.budgetId);
      if (!budget) {
        add("quote_budget_missing", "Quote budget provenance is unavailable", quote.id);
        continue;
      }
      if (
        budget.integrityHash !== balance.budgetIntegrityHash ||
        budget.version !== balance.budgetVersion ||
        budget.scope !== balance.scope ||
        budget.subscriptionPlanId !== balance.subscriptionPlanId ||
        budget.entitlementStatus !== balance.entitlementStatus ||
        budget.periodStart !== balance.periodStart ||
        budget.periodEnd !== balance.periodEnd
      ) {
        add("quote_budget_provenance_mismatch", "Quote budget provenance does not match history", quote.id);
      }
    }
  }

  const receiptByReservation = new Map<string, typeof snapshot.receipts>();
  for (const receipt of snapshot.receipts) {
    if (!sameScope(receipt.scope, snapshot.scope)) {
      add("receipt_scope_mismatch", "Receipt belongs to another scope", receipt.id);
    }
    for (const [field, value] of [
      ["reserved", receipt.reservedCoUnits],
      ["committed", receipt.committedCoUnits],
      ["released", receipt.releasedCoUnits],
      ["absorbed", receipt.absorbedCoUnits],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 0) {
        add("receipt_integer_invalid", `Receipt ${field} Co-Units are invalid`, receipt.id);
      }
    }
    if (receipt.kind === "commit" && receipt.committedCoUnits + receipt.releasedCoUnits !== receipt.reservedCoUnits) {
      add("commit_receipt_unbalanced", "Commit receipt does not balance its reservation", receipt.id);
    }
    if (
      (receipt.kind === "release" || receipt.kind === "expiration") &&
      receipt.releasedCoUnits !== receipt.reservedCoUnits
    ) {
      add("release_receipt_unbalanced", "Release receipt does not release its reservation", receipt.id);
    }
    if (receipt.ledgerEventIds.length !== 1) {
      add("receipt_event_cardinality", "Receipt must bind exactly one ledger event", receipt.id);
    }
    const expectedType = expectedReceiptEventType(receipt.kind);
    for (const eventId of receipt.ledgerEventIds) {
      const event = eventsById.get(eventId);
      if (!event) {
        add("receipt_ledger_event_missing", "Receipt references a missing ledger event", receipt.id);
        continue;
      }
      const expectedCoUnits =
        receipt.kind === "commit"
          ? receipt.committedCoUnits
          : receipt.kind === "collaboration"
            ? 0
            : receipt.kind === "reservation"
              ? receipt.reservedCoUnits
              : receipt.releasedCoUnits;
      if (
        event.type !== expectedType ||
        event.receiptId !== receipt.id ||
        event.quoteId !== receipt.quoteId ||
        event.reservationId !== receipt.reservationId ||
        event.idempotencyKey !== receipt.idempotencyKey ||
        event.coUnits !== expectedCoUnits
      ) {
        add("receipt_ledger_binding_mismatch", "Receipt and ledger event binding disagree", receipt.id);
      }
    }
    if (!receipt.reservationId) continue;
    receiptByReservation.set(receipt.reservationId, [
      ...(receiptByReservation.get(receipt.reservationId) ?? []),
      receipt,
    ]);
    if (receipt.kind === "commit" && receipt.outcome !== "succeeded" && receipt.committedCoUnits !== 0) {
      add(
        "nonbillable_outcome_debited",
        `Outcome ${receipt.outcome} must not debit customer Co-Units`,
        receipt.id,
      );
    }
  }

  for (const reservation of snapshot.reservations) {
    if (!sameScope(reservation.scope, snapshot.scope)) {
      add("reservation_scope_mismatch", "Reservation belongs to another scope", reservation.id);
    }
    const quote = quotesById.get(reservation.quoteId);
    if (!quote) {
      add("reservation_quote_missing", "Reservation references a missing quote", reservation.id);
    } else if (
      !sameScope(quote.scope, reservation.scope) ||
      quote.operation !== reservation.operation ||
      quote.rateVersion !== reservation.rateVersion ||
      quote.pricingVersion !== reservation.pricingVersion
    ) {
      add("reservation_quote_mismatch", "Reservation does not match its quote", reservation.id);
    }
    if (reservation.committedCoUnits > reservation.maximumCoUnits) {
      add("reservation_overcommitted", "Committed Co-Units exceed reservation maximum", reservation.id);
    }
    if (reservation.committedCoUnits + reservation.releasedCoUnits !== reservation.maximumCoUnits && reservation.status !== "active") {
      add("reservation_not_balanced", "Settled reservation does not balance", reservation.id);
    }

    const lifecycleReceipts = receiptByReservation.get(reservation.id) ?? [];
    const reservationReceipts = lifecycleReceipts.filter((receipt) => receipt.kind === "reservation");
    const commits = lifecycleReceipts.filter((receipt) => receipt.kind === "commit");
    const terminalReleases = lifecycleReceipts.filter((receipt) =>
      ["release", "expiration"].includes(receipt.kind),
    );
    if (commits.length > 1) {
      add("duplicate_commit", "Reservation has more than one commit receipt", reservation.id);
    }
    if (terminalReleases.length > 1) {
      add("duplicate_release", "Reservation has more than one release receipt", reservation.id);
    }
    if (commits.length > 0 && terminalReleases.length > 0) {
      add("conflicting_settlement", "Reservation was both committed and released", reservation.id);
    }
    if (reservationReceipts.length !== 1) {
      add("reservation_receipt_missing", "Reservation must have exactly one reservation receipt", reservation.id);
    }
    if (reservation.status === "active" && reservation.settlementReceiptId !== null) {
      add("active_reservation_has_settlement", "Active reservation has a settlement receipt", reservation.id);
    }
    if (reservation.status !== "active") {
      const settlement = receiptsById.get(reservation.settlementReceiptId ?? "");
      if (!settlement || settlement.reservationId !== reservation.id) {
        add("settlement_receipt_missing", "Settled reservation has no matching settlement receipt", reservation.id);
      }
    }
  }

  for (const event of snapshot.ledgerEvents) {
    if (event.quoteId && !quotesById.has(event.quoteId)) {
      add("ledger_quote_missing", "Ledger event references a missing quote", event.id);
    }
    if (event.reservationId && !reservationsById.has(event.reservationId)) {
      add("ledger_reservation_missing", "Ledger event references a missing reservation", event.id);
    }
    if (event.receiptId && !receiptsById.has(event.receiptId)) {
      add("ledger_receipt_missing", "Ledger event references a missing receipt", event.id);
    }
  }

  const idempotencyKeys = new Set<string>();
  for (const record of snapshot.idempotencyRecords) {
    const { integrityHash: storedIntegrityHash, ...unsigned } = record;
    let calculatedIntegrityHash: string | null = null;
    try {
      calculatedIntegrityHash = sha256(unsigned);
    } catch {
      add(
        "idempotency_integrity_payload_invalid",
        "Idempotency record cannot be canonically hashed",
        record.resourceId,
      );
    }
    if (
      calculatedIntegrityHash !== null &&
      storedIntegrityHash !== calculatedIntegrityHash
    ) {
      add(
        "idempotency_integrity_hash_mismatch",
        "Idempotency record integrity hash is invalid",
        record.resourceId,
      );
    }
    const key = compositeKey(record.scopeKey, record.action, record.key);
    if (idempotencyKeys.has(key)) {
      add("duplicate_idempotency_record", "Duplicate idempotency record found", record.resourceId);
    }
    idempotencyKeys.add(key);
    if (record.scopeKey !== scopeKey(snapshot.scope)) {
      add("idempotency_scope_mismatch", "Idempotency record belongs to another scope", record.resourceId);
    }
    const resource =
      record.resourceType === "quote"
        ? quotesById.get(record.resourceId)
        : record.resourceType === "reservation"
          ? reservationsById.get(record.resourceId)
          : receiptsById.get(record.resourceId);
    if (!resource) {
      add("idempotency_resource_missing", "Idempotency target is missing", record.resourceId);
    } else if (resource.requestHash !== record.requestHash) {
      add("idempotency_request_hash_mismatch", "Idempotency request hash differs from its resource", record.resourceId);
    }
  }

  const committedCoUnits = snapshot.receipts
    .filter((receipt) => receipt.kind === "commit")
    .reduce((sum, receipt) => sum + receipt.committedCoUnits, 0);
  const ledgerCommitted = snapshot.ledgerEvents
    .filter((event) => event.type === "usage_committed")
    .reduce((sum, event) => sum + event.coUnits, 0);
  if (ledgerCommitted !== committedCoUnits) {
    add(
      "ledger_receipt_debit_mismatch",
      `Ledger commits ${ledgerCommitted} CU but receipts commit ${committedCoUnits} CU`,
      null,
    );
  }

  const activeReservedCoUnits = snapshot.reservations
    .filter(
      (reservation) =>
        reservation.status === "active" && reservation.expiresAt > checkedAt,
    )
    .reduce((sum, reservation) => sum + reservation.maximumCoUnits, 0);
  const providerCostMicros = snapshot.receipts.reduce(
    (sum, receipt) => sum + (receipt.providerCost?.calculatedCostMicros ?? 0),
    0,
  );
  const absorbedCoUnits = snapshot.receipts.reduce(
    (sum, receipt) => sum + receipt.absorbedCoUnits,
    0,
  );

  const unsigned = {
    id: deterministicId("rec", {
      scope: snapshot.scope,
      checkedAt,
      ledgerHeadHash: previousHash,
      findings,
    }),
    schemaVersion: "metering-reconciliation.v1" as const,
    scope: snapshot.scope,
    passed: findings.every((finding) => finding.severity !== "error"),
    findings,
    committedCoUnits,
    activeReservedCoUnits,
    providerCostMicros,
    absorbedCoUnits,
    eventCount: snapshot.ledgerEvents.length,
    receiptCount: snapshot.receipts.length,
    checkedAt,
    ledgerHeadHash: previousHash,
    paymentMutation: "none" as const,
  };

  return { ...unsigned, integrityHash: sha256(unsigned) };
}

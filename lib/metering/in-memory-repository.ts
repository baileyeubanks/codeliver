import { compositeKey, deterministicId, immutableClone, sha256 } from "./canonical";
import { scopeKey } from "./policy";
import type { LedgerEventDraft, MeteringRepository, MeteringStateSnapshot } from "./repository";
import type {
  BudgetPolicy,
  IdempotencyRecord,
  MeteringLedgerEvent,
  QuotaAlert,
  UsageQuote,
  UsageReceipt,
  UsageReservation,
  UsageScope,
} from "./types";

function tenantBudgetKey(organizationId: string) {
  return compositeKey("tenant", organizationId);
}

function projectBudgetKey(scope: UsageScope) {
  return compositeKey("project", scope.organizationId, scope.projectId);
}

function idempotencyKey(scope: UsageScope, action: string, key: string) {
  return compositeKey(scopeKey(scope), action, key);
}

function sameScope(scope: UsageScope, candidate: UsageScope) {
  return (
    scope.organizationId === candidate.organizationId &&
    scope.projectId === candidate.projectId
  );
}

export function ledgerEventHash(event: Omit<MeteringLedgerEvent, "hash">) {
  return sha256(event);
}

export class InMemoryMeteringRepository implements MeteringRepository {
  private readonly budgets = new Map<string, BudgetPolicy>();
  private readonly budgetHistory = new Map<string, BudgetPolicy>();
  private readonly quotes = new Map<string, UsageQuote>();
  private readonly reservations = new Map<string, UsageReservation>();
  private readonly receipts = new Map<string, UsageReceipt>();
  private readonly ledgerEvents = new Map<string, MeteringLedgerEvent[]>();
  private readonly alerts = new Map<string, QuotaAlert>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private transactionTail: Promise<void> = Promise.resolve();

  private captureState() {
    return immutableClone({
      budgets: [...this.budgets],
      budgetHistory: [...this.budgetHistory],
      quotes: [...this.quotes],
      reservations: [...this.reservations],
      receipts: [...this.receipts],
      ledgerEvents: [...this.ledgerEvents],
      alerts: [...this.alerts],
      idempotency: [...this.idempotency],
    });
  }

  private restoreState(snapshot: ReturnType<InMemoryMeteringRepository["captureState"]>) {
    const restore = <K, V>(target: Map<K, V>, entries: readonly (readonly [K, V])[]) => {
      target.clear();
      for (const [key, value] of entries) target.set(key, value);
    };
    restore(this.budgets, snapshot.budgets);
    restore(this.budgetHistory, snapshot.budgetHistory);
    restore(this.quotes, snapshot.quotes);
    restore(this.reservations, snapshot.reservations);
    restore(this.receipts, snapshot.receipts);
    restore(this.ledgerEvents, snapshot.ledgerEvents);
    restore(this.alerts, snapshot.alerts);
    restore(this.idempotency, snapshot.idempotency);
  }

  async runExclusive<T>(scope: UsageScope, operation: () => T | Promise<T>): Promise<T> {
    void scope;
    const previous = this.transactionTail;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    this.transactionTail = previous.then(() => gate);

    await previous;
    const snapshot = this.captureState();
    try {
      return await operation();
    } catch (error) {
      this.restoreState(snapshot);
      throw error;
    } finally {
      release();
    }
  }

  getTenantBudget(organizationId: string) {
    const value = this.budgets.get(tenantBudgetKey(organizationId));
    return value ? immutableClone(value) : null;
  }

  getProjectBudget(scope: UsageScope) {
    const value = this.budgets.get(projectBudgetKey(scope));
    return value ? immutableClone(value) : null;
  }

  saveBudget(budget: BudgetPolicy) {
    const key =
      budget.scope === "tenant"
        ? tenantBudgetKey(budget.organizationId)
        : projectBudgetKey({
            organizationId: budget.organizationId,
            projectId: budget.projectId ?? "",
          });
    const historical = this.budgetHistory.get(budget.id);
    if (historical && historical.integrityHash !== budget.integrityHash) {
      throw new Error(`Budget history is immutable: ${budget.id}`);
    }
    this.budgetHistory.set(budget.id, immutableClone(budget));
    this.budgets.set(key, immutableClone(budget));
  }

  listBudgetHistory(scope: UsageScope) {
    return [...this.budgetHistory.values()]
      .filter(
        (budget) =>
          budget.organizationId === scope.organizationId &&
          (budget.scope === "tenant" || budget.projectId === scope.projectId),
      )
      .sort(
        (a, b) =>
          a.configuredAt.localeCompare(b.configuredAt) || a.id.localeCompare(b.id),
      )
      .map(immutableClone);
  }

  getQuote(id: string) {
    const value = this.quotes.get(id);
    return value ? immutableClone(value) : null;
  }

  saveQuote(quote: UsageQuote) {
    if (this.quotes.has(quote.id)) throw new Error(`Quote already exists: ${quote.id}`);
    this.quotes.set(quote.id, immutableClone(quote));
  }

  getReservation(id: string) {
    const value = this.reservations.get(id);
    return value ? immutableClone(value) : null;
  }

  saveReservation(reservation: UsageReservation) {
    this.reservations.set(reservation.id, immutableClone(reservation));
  }

  listReservations(scope: UsageScope) {
    return [...this.reservations.values()]
      .filter((reservation) => sameScope(scope, reservation.scope))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(immutableClone);
  }

  listOrganizationReservations(organizationId: string) {
    return [...this.reservations.values()]
      .filter((reservation) => reservation.scope.organizationId === organizationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(immutableClone);
  }

  getReceipt(id: string) {
    const value = this.receipts.get(id);
    return value ? immutableClone(value) : null;
  }

  saveReceipt(receipt: UsageReceipt) {
    if (this.receipts.has(receipt.id)) throw new Error(`Receipt already exists: ${receipt.id}`);
    this.receipts.set(receipt.id, immutableClone(receipt));
  }

  listReceipts(scope: UsageScope) {
    return [...this.receipts.values()]
      .filter((receipt) => sameScope(scope, receipt.scope))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
      .map(immutableClone);
  }

  listOrganizationReceipts(organizationId: string) {
    return [...this.receipts.values()]
      .filter((receipt) => receipt.scope.organizationId === organizationId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
      .map(immutableClone);
  }

  appendLedgerEvent(draft: LedgerEventDraft) {
    const key = scopeKey(draft.scope);
    const events = this.ledgerEvents.get(key) ?? [];
    const previous = events.at(-1) ?? null;
    const sequence = events.length + 1;
    const eventWithoutHash: Omit<MeteringLedgerEvent, "hash"> = {
      id: deterministicId("mle", {
        scope: draft.scope,
        sequence,
        type: draft.type,
        occurredAt: draft.occurredAt,
        resource: draft.receiptId ?? draft.reservationId ?? draft.quoteId,
      }),
      schemaVersion: "metering-ledger-event.v1",
      ...immutableClone(draft),
      sequence,
      previousHash: previous?.hash ?? null,
      paymentMutation: "none",
    };
    const event: MeteringLedgerEvent = {
      ...eventWithoutHash,
      hash: ledgerEventHash(eventWithoutHash),
    };
    events.push(event);
    this.ledgerEvents.set(key, events);
    return immutableClone(event);
  }

  listLedgerEvents(scope: UsageScope) {
    return (this.ledgerEvents.get(scopeKey(scope)) ?? []).map(immutableClone);
  }

  saveAlert(alert: QuotaAlert) {
    if (!this.alerts.has(alert.id)) this.alerts.set(alert.id, immutableClone(alert));
  }

  listAlerts(scope: UsageScope) {
    return [...this.alerts.values()]
      .filter((alert) => sameScope(scope, alert.scope))
      .sort((a, b) => a.emittedAt.localeCompare(b.emittedAt) || a.id.localeCompare(b.id))
      .map(immutableClone);
  }

  getIdempotency(scope: UsageScope, action: string, key: string) {
    const value = this.idempotency.get(idempotencyKey(scope, action, key));
    return value ? immutableClone(value) : null;
  }

  saveIdempotency(record: IdempotencyRecord) {
    const key = compositeKey(record.scopeKey, record.action, record.key);
    const { integrityHash, ...unsigned } = record;
    if (integrityHash !== sha256(unsigned)) {
      throw new Error(`Idempotency integrity failure: ${record.action}:${record.key}`);
    }
    const existing = this.idempotency.get(key);
    if (existing) {
      if (existing.integrityHash !== record.integrityHash) {
        throw new Error(`Idempotency conflict: ${record.action}:${record.key}`);
      }
      return;
    }
    this.idempotency.set(key, immutableClone(record));
  }

  snapshot(scope: UsageScope): MeteringStateSnapshot {
    const budgets = [
      this.getTenantBudget(scope.organizationId),
      this.getProjectBudget(scope),
    ].filter((budget): budget is BudgetPolicy => budget !== null);

    return {
      scope: immutableClone(scope),
      budgets,
      budgetHistory: this.listBudgetHistory(scope),
      quotes: [...this.quotes.values()]
        .filter((quote) => sameScope(scope, quote.scope))
        .map(immutableClone),
      reservations: this.listReservations(scope),
      receipts: this.listReceipts(scope),
      ledgerEvents: this.listLedgerEvents(scope),
      alerts: this.listAlerts(scope),
      idempotencyRecords: [...this.idempotency.values()]
        .filter((record) => record.scopeKey === scopeKey(scope))
        .map(immutableClone),
    };
  }
}

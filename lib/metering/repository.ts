import type { JsonValue } from "./canonical";
import type {
  BudgetPolicy,
  IdempotencyRecord,
  LedgerEventType,
  MeteringActor,
  MeteringLedgerEvent,
  QuotaAlert,
  UsageQuote,
  UsageReceipt,
  UsageReservation,
  UsageScope,
} from "./types";

export interface LedgerEventDraft {
  scope: UsageScope;
  type: LedgerEventType;
  actor: MeteringActor;
  operationExecutionId: string | null;
  quoteId: string | null;
  reservationId: string | null;
  receiptId: string | null;
  coUnits: number;
  idempotencyKey: string | null;
  rateVersion: string | null;
  pricingVersion: string | null;
  occurredAt: string;
  details: JsonValue;
}

export interface MeteringStateSnapshot {
  scope: UsageScope;
  budgets: readonly BudgetPolicy[];
  budgetHistory: readonly BudgetPolicy[];
  quotes: readonly UsageQuote[];
  reservations: readonly UsageReservation[];
  receipts: readonly UsageReceipt[];
  ledgerEvents: readonly MeteringLedgerEvent[];
  alerts: readonly QuotaAlert[];
  idempotencyRecords: readonly IdempotencyRecord[];
}

export interface MeteringRepository {
  /**
   * Runs one atomic metering transaction. Implementations must serialize all
   * scopes sharing an organization budget and roll back every write on error.
   */
  runExclusive<T>(scope: UsageScope, operation: () => T | Promise<T>): Promise<T>;

  getTenantBudget(organizationId: string): BudgetPolicy | null;
  getProjectBudget(scope: UsageScope): BudgetPolicy | null;
  saveBudget(budget: BudgetPolicy): void;
  listBudgetHistory(scope: UsageScope): readonly BudgetPolicy[];

  getQuote(id: string): UsageQuote | null;
  saveQuote(quote: UsageQuote): void;

  getReservation(id: string): UsageReservation | null;
  saveReservation(reservation: UsageReservation): void;
  listReservations(scope: UsageScope): readonly UsageReservation[];
  listOrganizationReservations(organizationId: string): readonly UsageReservation[];

  getReceipt(id: string): UsageReceipt | null;
  saveReceipt(receipt: UsageReceipt): void;
  listReceipts(scope: UsageScope): readonly UsageReceipt[];
  listOrganizationReceipts(organizationId: string): readonly UsageReceipt[];

  appendLedgerEvent(draft: LedgerEventDraft): MeteringLedgerEvent;
  listLedgerEvents(scope: UsageScope): readonly MeteringLedgerEvent[];

  saveAlert(alert: QuotaAlert): void;
  listAlerts(scope: UsageScope): readonly QuotaAlert[];

  getIdempotency(scope: UsageScope, action: string, key: string): IdempotencyRecord | null;
  saveIdempotency(record: IdempotencyRecord): void;

  snapshot(scope: UsageScope): MeteringStateSnapshot;
}

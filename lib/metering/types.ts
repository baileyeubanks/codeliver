import type { JsonValue } from "./canonical";

export const CO_UNITS_PER_CREDIT = 1_000;

export type MeterClass =
  | "free_collaboration"
  | "paid_compute"
  | "storage"
  | "egress";

export type MeteredOperation =
  | "manual_edit"
  | "comment"
  | "approval"
  | "metadata_update"
  | "share"
  | "existing_proxy_playback"
  | "review_history"
  | "approved_final_download"
  | "ai_research"
  | "ai_generation"
  | "transcription"
  | "translation"
  | "media_analysis"
  | "generated_media"
  | "new_transcode"
  | "preview_render"
  | "export_render"
  | "storage_byte_hours"
  | "egress_bytes";

export type NativeUsageDimension =
  | "input_tokens"
  | "output_tokens"
  | "search_calls"
  | "audio_milliseconds"
  | "translated_characters"
  | "analyzed_media_milliseconds"
  | "generated_megapixels"
  | "transcoded_media_milliseconds"
  | "rendered_pixel_milliseconds"
  | "storage_byte_hours"
  | "egress_bytes";

export const NATIVE_USAGE_DIMENSIONS: readonly NativeUsageDimension[] = [
  "input_tokens",
  "output_tokens",
  "search_calls",
  "audio_milliseconds",
  "translated_characters",
  "analyzed_media_milliseconds",
  "generated_megapixels",
  "transcoded_media_milliseconds",
  "rendered_pixel_milliseconds",
  "storage_byte_hours",
  "egress_bytes",
];

export type NativeUsage = Partial<Record<NativeUsageDimension, number>>;

export interface UsageScope {
  organizationId: string;
  projectId: string;
}

export type ControlPlaneRole =
  | "owner"
  | "admin"
  | "creator"
  | "auditor"
  | "service"
  | "reviewer"
  | "client";

export interface MeteringActor {
  id: string;
  role: ControlPlaneRole;
  kind: "human" | "service" | "agent";
}

export interface RateComponent {
  dimension: NativeUsageDimension;
  blockSize: number;
  coUnitsPerBlock: number;
}

export interface OperationRate {
  operation: MeteredOperation;
  meterClass: MeterClass;
  displayName: string;
  baseCoUnits: number;
  components: readonly RateComponent[];
  minimumBasisPoints: number;
  maximumBasisPoints: number;
  customerBoundary: string;
}

export interface RateCatalog {
  version: string;
  effectiveAt: string;
  status: "fixture" | "internal" | "approved" | "retired";
  rates: Readonly<Record<MeteredOperation, OperationRate>>;
  integrityHash: string;
}

export interface CommercialPricingTerms {
  version: string;
  currency: "USD";
  overageMicrosPerCoUnit: number | null;
  status: "unpriced" | "demo" | "approved";
}

export interface CoUnitRange {
  min: number;
  likely: number;
  max: number;
}

export interface BudgetBalanceAtQuote {
  scope: "tenant" | "project";
  budgetId: string;
  budgetVersion: string;
  budgetIntegrityHash: string;
  subscriptionPlanId: string;
  entitlementStatus: "active" | "suspended";
  periodStart: string;
  periodEnd: string;
  includedCoUnits: number;
  committedCoUnits: number;
  reservedCoUnits: number;
  remainingIncludedCoUnits: number;
  effectiveLimitCoUnits: number;
  remainingEffectiveCoUnits: number;
  overageEnabled: boolean;
}

export interface OveragePreview {
  required: boolean;
  allowedAtQuoteTime: boolean;
  additionalCoUnits: number;
  estimatedCurrencyMicros: number | null;
  consentRequired: boolean;
}

export interface UsageQuote {
  id: string;
  schemaVersion: "usage-quote.v1";
  scope: UsageScope;
  operationExecutionId: string;
  operation: MeteredOperation;
  meterClass: MeterClass;
  nativeUsage: NativeUsage;
  coUnits: CoUnitRange;
  coCredits: CoUnitRange;
  assumptions: readonly string[];
  rateVersion: string;
  rateCatalogHash: string;
  rateCatalog: RateCatalog;
  pricingVersion: string;
  pricingTerms: CommercialPricingTerms;
  pricingTermsHash: string;
  balances: readonly BudgetBalanceAtQuote[];
  overage: OveragePreview;
  requestedBy: MeteringActor;
  requestedAt: string;
  expiresAt: string;
  requestHash: string;
  integrityHash: string;
  paymentMutation: "none";
}

export interface OverageConsent {
  consentId: string;
  scope: UsageScope;
  enabled: true;
  additionalCoUnitCap: number;
  currencyCapMicros: number;
  currency: "USD";
  pricingVersion: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string;
}

export interface BudgetPolicy {
  id: string;
  schemaVersion: "co-budget.v1";
  organizationId: string;
  projectId: string | null;
  scope: "tenant" | "project";
  periodStart: string;
  periodEnd: string;
  includedCoUnits: number;
  subscriptionPlanId: string;
  entitlementStatus: "active" | "suspended";
  allowedOperations: readonly MeteredOperation[];
  maximumReservationCoUnits: number;
  alertThresholdBasisPoints: readonly number[];
  overageConsent: OverageConsent | null;
  version: string;
  configuredBy: string;
  configuredAt: string;
  integrityHash: string;
  paymentMutation: "none";
}

export type ReservationStatus =
  | "active"
  | "committed"
  | "released"
  | "expired";

export interface UsageReservation {
  id: string;
  schemaVersion: "usage-reservation.v1";
  scope: UsageScope;
  operationExecutionId: string;
  quoteId: string;
  operation: MeteredOperation;
  status: ReservationStatus;
  maximumCoUnits: number;
  committedCoUnits: number;
  releasedCoUnits: number;
  absorbedCoUnits: number;
  idempotencyKey: string;
  requestHash: string;
  rateVersion: string;
  rateCatalogHash: string;
  rateCatalog: RateCatalog;
  pricingVersion: string;
  pricingTerms: CommercialPricingTerms;
  pricingTermsHash: string;
  createdBy: MeteringActor;
  createdAt: string;
  expiresAt: string;
  settledAt: string | null;
  settlementReceiptId: string | null;
  integrityHash: string;
  paymentMutation: "none";
}

export const USAGE_OUTCOMES = [
  "succeeded",
  "failed",
  "duplicate",
  "unusable_output",
  "safety_rejected",
  "cache_hit",
  "platform_retry",
] as const;

export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

export interface ProviderCostAttribution {
  provider: string;
  service: string;
  model: string | null;
  region: string | null;
  providerRequestIdHash: string | null;
  nativeUsage: NativeUsage;
  rateVersion: string;
  currency: "USD";
  calculatedCostMicros: number;
  reportedCostMicros: number | null;
}

export type UsageReceiptKind =
  | "collaboration"
  | "reservation"
  | "commit"
  | "release"
  | "expiration";

export interface UsageReceipt {
  id: string;
  schemaVersion: "usage-receipt.v1";
  kind: UsageReceiptKind;
  scope: UsageScope;
  operationExecutionId: string | null;
  operation: MeteredOperation;
  quoteId: string | null;
  reservationId: string | null;
  outcome: UsageOutcome | "reserved" | "released" | "expired" | "free";
  reservedCoUnits: number;
  committedCoUnits: number;
  releasedCoUnits: number;
  absorbedCoUnits: number;
  nativeUsage: NativeUsage;
  providerCost: ProviderCostAttribution | null;
  noDebitReason: string | null;
  rateVersion: string;
  rateCatalogHash: string;
  pricingVersion: string;
  pricingTermsHash: string;
  idempotencyKey: string;
  requestHash: string;
  actor: MeteringActor;
  occurredAt: string;
  ledgerEventIds: readonly string[];
  integrityHash: string;
  paymentMutation: "none";
}

export type LedgerEventType =
  | "budget_configured"
  | "quote_issued"
  | "collaboration_recorded"
  | "reservation_created"
  | "reservation_replayed"
  | "usage_committed"
  | "reservation_released"
  | "reservation_expired"
  | "quota_alert_emitted"
  | "reconciliation_completed";

export interface MeteringLedgerEvent {
  id: string;
  schemaVersion: "metering-ledger-event.v1";
  scope: UsageScope;
  sequence: number;
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
  previousHash: string | null;
  hash: string;
  paymentMutation: "none";
}

export interface QuotaAlert {
  id: string;
  budgetId: string;
  scope: UsageScope;
  budgetScope: "tenant" | "project";
  thresholdBasisPoints: number;
  consumedBasisPoints: number;
  committedCoUnits: number;
  reservedCoUnits: number;
  emittedAt: string;
  eventId: string;
}

export interface IdempotencyRecord {
  scopeKey: string;
  action: string;
  key: string;
  requestHash: string;
  resourceType: "quote" | "reservation" | "receipt";
  resourceId: string;
  createdAt: string;
  integrityHash: string;
}

export interface BudgetUsageSnapshot {
  budget: BudgetPolicy;
  committedCoUnits: number;
  reservedCoUnits: number;
  remainingIncludedCoUnits: number;
  effectiveLimitCoUnits: number;
  remainingEffectiveCoUnits: number;
  utilizationBasisPoints: number;
}

export interface UsageSummary {
  scope: UsageScope;
  tenantBudget: BudgetUsageSnapshot;
  projectBudget: BudgetUsageSnapshot;
  activeReservations: readonly UsageReservation[];
  receipts: readonly UsageReceipt[];
  alerts: readonly QuotaAlert[];
  generatedAt: string;
}

export interface ReconciliationFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
  resourceId: string | null;
}

export interface ReconciliationReport {
  id: string;
  schemaVersion: "metering-reconciliation.v1";
  scope: UsageScope;
  passed: boolean;
  findings: readonly ReconciliationFinding[];
  committedCoUnits: number;
  activeReservedCoUnits: number;
  providerCostMicros: number;
  absorbedCoUnits: number;
  eventCount: number;
  receiptCount: number;
  checkedAt: string;
  ledgerHeadHash: string | null;
  integrityHash: string;
  paymentMutation: "none";
}

export interface EstimateUsageInput {
  scope: UsageScope;
  operationExecutionId: string;
  operation: MeteredOperation;
  nativeUsage: NativeUsage;
  requestedBy: MeteringActor;
  idempotencyKey: string;
}

export interface ReserveUsageInput {
  scope: UsageScope;
  quoteId: string;
  actor: MeteringActor;
  idempotencyKey: string;
}

export interface CommitUsageInput {
  scope: UsageScope;
  operationExecutionId: string;
  reservationId: string;
  outcome: UsageOutcome;
  actualUsage: NativeUsage;
  providerCost: ProviderCostAttribution | null;
  actor: MeteringActor;
  idempotencyKey: string;
}

export interface ReleaseUsageInput {
  scope: UsageScope;
  reservationId: string;
  reason: string;
  actor: MeteringActor;
  idempotencyKey: string;
}

export interface RecordCollaborationInput {
  scope: UsageScope;
  operation: MeteredOperation;
  actor: MeteringActor;
  idempotencyKey: string;
  details?: JsonValue;
}

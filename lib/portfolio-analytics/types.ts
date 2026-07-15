export const PORTFOLIO_ANALYTICS_CONTRACT_VERSION = "m4.portfolio-analytics.v1" as const;
export const PORTFOLIO_ANALYTICS_ACCESS_VERSION = "m4.portfolio-analytics.access.v1" as const;
export const PORTFOLIO_ANALYTICS_READ_PERMISSION = "portfolio.analytics.read" as const;
export const PORTFOLIO_ANALYTICS_CORRECT_PERMISSION = "portfolio.analytics.correct" as const;

export const PORTFOLIO_LIMITS = {
  maxProjects: 25,
  maxAssets: 1_000,
  maxFacts: 1_000,
  maxWindowDays: 366,
  maxPageSize: 100,
  maxRequestBytes: 512 * 1_024,
} as const;

export type PortfolioFileType = "audio" | "document" | "image" | "other" | "video";
export type PortfolioAnalyticsRole = "tenant_owner" | "portfolio_analyst" | "portfolio_viewer";

export interface PortfolioAnalyticsPrincipal {
  subjectId: string;
  tenantId: string;
  role: PortfolioAnalyticsRole;
  accessVersion: typeof PORTFOLIO_ANALYTICS_ACCESS_VERSION;
  permissions: readonly string[];
}

export interface PortfolioWindow {
  from: string;
  to: string;
  asOf: string;
}

export interface PortfolioAnalyticsFilters {
  fileTypes?: readonly PortfolioFileType[];
}

export interface PortfolioAnalyticsPage {
  limit: number;
  cursor?: string;
}

export interface PortfolioFactBinding {
  versionId: string;
  fingerprint: string;
}

export interface PortfolioSnapshotBinding {
  contractVersion: typeof PORTFOLIO_ANALYTICS_CONTRACT_VERSION;
  tenantId: string;
  projectIds: readonly string[];
  window: PortfolioWindow;
  filters: PortfolioAnalyticsFilters;
  facts: readonly PortfolioFactBinding[];
}

export type PortfolioSnapshotRequest =
  | { mode: "capture" }
  | { mode: "replay"; binding: PortfolioSnapshotBinding };

export interface PortfolioAnalyticsQuery {
  contractVersion: typeof PORTFOLIO_ANALYTICS_CONTRACT_VERSION;
  tenantId: string;
  idempotencyKey: string;
  projectIds: readonly string[];
  window: PortfolioWindow;
  filters: PortfolioAnalyticsFilters;
  page: PortfolioAnalyticsPage;
  snapshot: PortfolioSnapshotRequest;
}

/**
 * A read-only metric fact. The API adapter derives it from an owned project,
 * asset, and immutable version row. Decimal strings preserve bigint precision.
 */
export interface PortfolioVersionFact {
  tenantId: string;
  projectId: string;
  assetId: string;
  assetUpdatedAt: string;
  fileType: PortfolioFileType;
  versionId: string;
  versionNumber: number;
  versionCreatedAt: string;
  fileSizeBytes: string;
  durationMilliseconds: string;
}

export interface PortfolioMetricTotals {
  versionCount: number;
  distinctAssetCount: number;
  storageBytesAdded: string;
  durationMillisecondsAdded: string;
}

export interface PortfolioProjectMetric extends PortfolioMetricTotals {
  projectId: string;
}

export interface PortfolioVersionMetricItem {
  projectId: string;
  assetId: string;
  versionId: string;
  versionNumber: number;
  versionCreatedAt: string;
  fileType: PortfolioFileType;
  fileSizeBytes: string;
  durationMilliseconds: string;
}

export interface PortfolioAnalyticsReceipt {
  receiptId: string;
  traceId: string;
  contractVersion: typeof PORTFOLIO_ANALYTICS_CONTRACT_VERSION;
  queryDigest: string;
  snapshotId: string;
  resultDigest: string;
  idempotencyKeyDigest: string;
  accessVersion: typeof PORTFOLIO_ANALYTICS_ACCESS_VERSION;
  sourceFactCount: number;
  acceptedFactCount: number;
  duplicateFactCount: number;
  generatedAt: string;
  readOnly: true;
}

export interface PortfolioSourceRevisionReceipt {
  receiptId: string;
  action: "corrected" | "reactivated" | "unchanged";
  tenantDigest: string;
  versionId: string;
  previousFingerprint: string;
  activeFingerprint: string;
  accessVersion: typeof PORTFOLIO_ANALYTICS_ACCESS_VERSION;
  reversible: true;
}

export interface PortfolioAnalyticsResult {
  tenantId: string;
  window: PortfolioWindow;
  snapshot: {
    mode: "captured" | "replayed";
    id: string;
    binding: PortfolioSnapshotBinding;
    rollback: "Replay this binding; source drift fails closed instead of mixing snapshots.";
  };
  totals: PortfolioMetricTotals;
  byFileType: Record<PortfolioFileType, number>;
  byProject: readonly PortfolioProjectMetric[];
  items: readonly PortfolioVersionMetricItem[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
  receipt: PortfolioAnalyticsReceipt;
  accessibility: {
    surface: "api-only";
    userInterfaceChanged: false;
  };
}

export interface PortfolioAnalyticsSource {
  loadCaptureFacts(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
  ): Promise<readonly PortfolioVersionFact[]>;
  loadReplayFacts(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
    binding: PortfolioSnapshotBinding,
  ): Promise<readonly PortfolioVersionFact[]>;
}

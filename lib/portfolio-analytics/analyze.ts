import { canonicalJson, digest } from "./canonical";
import { PortfolioAnalyticsError } from "./errors";
import {
  PORTFOLIO_ANALYTICS_READ_PERMISSION,
  PORTFOLIO_LIMITS,
  type PortfolioAnalyticsPrincipal,
  type PortfolioAnalyticsQuery,
  type PortfolioAnalyticsResult,
  type PortfolioFileType,
  type PortfolioMetricTotals,
  type PortfolioProjectMetric,
  type PortfolioSnapshotBinding,
  type PortfolioVersionFact,
  type PortfolioVersionMetricItem,
} from "./types";

const FILE_TYPES: readonly PortfolioFileType[] = ["audio", "document", "image", "other", "video"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(0|[1-9]\d*)$/;

function sourceFailure(message: string, details?: Readonly<Record<string, unknown>>): never {
  throw new PortfolioAnalyticsError("SOURCE_FAILURE", message, 502, details);
}

function parseNonNegativeDecimal(value: string, field: string): bigint {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value) || value.length > 40) {
    sourceFailure(`Analytics source returned an invalid ${field}`);
  }
  return BigInt(value);
}

function normalizeTimestamp(value: string, field: string): string {
  if (typeof value !== "string") sourceFailure(`Analytics source returned an invalid ${field}`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) sourceFailure(`Analytics source returned an invalid ${field}`);
  return new Date(parsed).toISOString();
}

function normalizeFact(fact: PortfolioVersionFact): PortfolioVersionFact {
  if (!fact || typeof fact !== "object") sourceFailure("Analytics source returned a malformed fact");
  for (const [field, value] of [
    ["tenantId", fact.tenantId],
    ["projectId", fact.projectId],
    ["assetId", fact.assetId],
    ["versionId", fact.versionId],
  ] as const) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      sourceFailure(`Analytics source returned an invalid ${field}`);
    }
  }
  if (!FILE_TYPES.includes(fact.fileType)) sourceFailure("Analytics source returned an invalid fileType");
  if (!Number.isSafeInteger(fact.versionNumber) || fact.versionNumber < 1) {
    sourceFailure("Analytics source returned an invalid versionNumber");
  }
  const fileSizeBytes = parseNonNegativeDecimal(fact.fileSizeBytes, "fileSizeBytes").toString();
  const durationMilliseconds = parseNonNegativeDecimal(
    fact.durationMilliseconds,
    "durationMilliseconds",
  ).toString();
  return {
    tenantId: fact.tenantId.toLowerCase(),
    projectId: fact.projectId.toLowerCase(),
    assetId: fact.assetId.toLowerCase(),
    assetUpdatedAt: normalizeTimestamp(fact.assetUpdatedAt, "assetUpdatedAt"),
    fileType: fact.fileType,
    versionId: fact.versionId.toLowerCase(),
    versionNumber: fact.versionNumber,
    versionCreatedAt: normalizeTimestamp(fact.versionCreatedAt, "versionCreatedAt"),
    fileSizeBytes,
    durationMilliseconds,
  };
}

function factFingerprint(fact: PortfolioVersionFact): string {
  return digest("portfolio-analytics-fact-v1", fact);
}

export function authorizePortfolioAnalytics(
  principal: PortfolioAnalyticsPrincipal,
  query: PortfolioAnalyticsQuery,
): void {
  if (
    !principal.permissions.includes(PORTFOLIO_ANALYTICS_READ_PERMISSION) ||
    principal.tenantId !== query.tenantId
  ) {
    throw new PortfolioAnalyticsError("FORBIDDEN", "Portfolio analytics access denied", 403);
  }
  if (principal.subjectId.length === 0) {
    throw new PortfolioAnalyticsError("FORBIDDEN", "Portfolio analytics access denied", 403);
  }
}

function assertQueryMatchesBinding(query: PortfolioAnalyticsQuery, binding: PortfolioSnapshotBinding): void {
  const queryScope = {
    contractVersion: query.contractVersion,
    tenantId: query.tenantId,
    projectIds: query.projectIds,
    window: query.window,
    filters: query.filters,
  };
  const bindingScope = {
    contractVersion: binding.contractVersion,
    tenantId: binding.tenantId,
    projectIds: binding.projectIds,
    window: binding.window,
    filters: binding.filters,
  };
  if (canonicalJson(queryScope) !== canonicalJson(bindingScope)) {
    throw new PortfolioAnalyticsError(
      "SNAPSHOT_CONFLICT",
      "Replay scope does not match the captured snapshot",
      409,
    );
  }
}

function normalizeAndDeduplicate(
  facts: readonly PortfolioVersionFact[],
  query: PortfolioAnalyticsQuery,
): { facts: PortfolioVersionFact[]; duplicateCount: number } {
  if (facts.length > PORTFOLIO_LIMITS.maxFacts) {
    throw new PortfolioAnalyticsError(
      "RESOURCE_LIMIT",
      `Portfolio query exceeds the ${PORTFOLIO_LIMITS.maxFacts}-fact limit`,
      413,
    );
  }

  const requestedProjects = new Set(query.projectIds);
  const requestedFileTypes = query.filters.fileTypes
    ? new Set(query.filters.fileTypes)
    : null;
  const byVersion = new Map<string, PortfolioVersionFact>();
  const versionNumberOwners = new Map<string, string>();
  let duplicateCount = 0;

  for (const rawFact of facts) {
    const fact = normalizeFact(rawFact);
    if (fact.tenantId !== query.tenantId || !requestedProjects.has(fact.projectId)) {
      throw new PortfolioAnalyticsError("FORBIDDEN", "Analytics source crossed the authorized scope", 403);
    }
    if (requestedFileTypes && !requestedFileTypes.has(fact.fileType)) {
      sourceFailure("Analytics source returned a fact outside the requested filters");
    }
    if (
      fact.versionCreatedAt < query.window.from ||
      fact.versionCreatedAt > query.window.to ||
      fact.versionCreatedAt > query.window.asOf
    ) {
      sourceFailure("Analytics source returned a fact outside the requested version window");
    }

    const existing = byVersion.get(fact.versionId);
    if (existing) {
      if (canonicalJson(existing) !== canonicalJson(fact)) {
        throw new PortfolioAnalyticsError(
          "SNAPSHOT_CONFLICT",
          "Conflicting duplicate version facts were rejected",
          409,
        );
      }
      duplicateCount += 1;
      continue;
    }

    const versionNumberKey = `${fact.assetId}:${fact.versionNumber}`;
    const existingVersionId = versionNumberOwners.get(versionNumberKey);
    if (existingVersionId && existingVersionId !== fact.versionId) {
      throw new PortfolioAnalyticsError(
        "SNAPSHOT_CONFLICT",
        "Mixed version identities were rejected",
        409,
      );
    }
    versionNumberOwners.set(versionNumberKey, fact.versionId);
    byVersion.set(fact.versionId, fact);
  }

  return {
    facts: [...byVersion.values()].sort(
      (left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        left.assetId.localeCompare(right.assetId) ||
        left.versionNumber - right.versionNumber ||
        left.versionId.localeCompare(right.versionId),
    ),
    duplicateCount,
  };
}

function createBinding(query: PortfolioAnalyticsQuery, facts: readonly PortfolioVersionFact[]): PortfolioSnapshotBinding {
  return {
    contractVersion: query.contractVersion,
    tenantId: query.tenantId,
    projectIds: [...query.projectIds],
    window: query.window,
    filters: query.filters,
    facts: facts
      .map((fact) => ({ versionId: fact.versionId, fingerprint: factFingerprint(fact) }))
      .sort((left, right) => left.versionId.localeCompare(right.versionId)),
  };
}

function assertReplayFacts(binding: PortfolioSnapshotBinding, captured: PortfolioSnapshotBinding): void {
  if (canonicalJson(binding.facts) !== canonicalJson(captured.facts)) {
    throw new PortfolioAnalyticsError(
      "SNAPSHOT_CONFLICT",
      "Snapshot facts are missing, stale, or changed",
      409,
    );
  }
}

function emptyTotals(): PortfolioMetricTotals {
  return {
    versionCount: 0,
    distinctAssetCount: 0,
    storageBytesAdded: "0",
    durationMillisecondsAdded: "0",
  };
}

function computeMetrics(facts: readonly PortfolioVersionFact[]): {
  totals: PortfolioMetricTotals;
  byFileType: Record<PortfolioFileType, number>;
  byProject: PortfolioProjectMetric[];
} {
  const assetIds = new Set<string>();
  let bytes = 0n;
  let duration = 0n;
  const byFileType: Record<PortfolioFileType, number> = {
    audio: 0,
    document: 0,
    image: 0,
    other: 0,
    video: 0,
  };
  const projects = new Map<
    string,
    { totals: PortfolioMetricTotals; assets: Set<string>; bytes: bigint; duration: bigint }
  >();

  for (const fact of facts) {
    const factBytes = BigInt(fact.fileSizeBytes);
    const factDuration = BigInt(fact.durationMilliseconds);
    assetIds.add(fact.assetId);
    bytes += factBytes;
    duration += factDuration;
    byFileType[fact.fileType] += 1;

    let project = projects.get(fact.projectId);
    if (!project) {
      project = { totals: emptyTotals(), assets: new Set(), bytes: 0n, duration: 0n };
      projects.set(fact.projectId, project);
    }
    project.totals.versionCount += 1;
    project.assets.add(fact.assetId);
    project.bytes += factBytes;
    project.duration += factDuration;
  }

  return {
    totals: {
      versionCount: facts.length,
      distinctAssetCount: assetIds.size,
      storageBytesAdded: bytes.toString(),
      durationMillisecondsAdded: duration.toString(),
    },
    byFileType,
    byProject: [...projects.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([projectId, project]) => ({
        projectId,
        versionCount: project.totals.versionCount,
        distinctAssetCount: project.assets.size,
        storageBytesAdded: project.bytes.toString(),
        durationMillisecondsAdded: project.duration.toString(),
      })),
  };
}

interface CursorPayload {
  version: 1;
  snapshotId: string;
  offset: number;
  checksum: string;
}

function encodeCursor(snapshotId: string, offset: number): string {
  const cursor = { version: 1 as const, snapshotId, offset };
  return Buffer.from(
    JSON.stringify({ ...cursor, checksum: digest("portfolio-cursor-v1", cursor).slice(0, 24) }),
  ).toString("base64url");
}

function decodeCursor(value: string | undefined, snapshotId: string, factCount: number): number {
  if (!value) return 0;
  let cursor: CursorPayload;
  try {
    cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CursorPayload;
  } catch {
    throw new PortfolioAnalyticsError("INVALID_QUERY", "page.cursor is malformed", 400);
  }
  const unsigned = { version: cursor.version, snapshotId: cursor.snapshotId, offset: cursor.offset };
  if (
    cursor.version !== 1 ||
    cursor.snapshotId !== snapshotId ||
    !Number.isSafeInteger(cursor.offset) ||
    cursor.offset < 0 ||
    cursor.offset > factCount ||
    cursor.checksum !== digest("portfolio-cursor-v1", unsigned).slice(0, 24)
  ) {
    throw new PortfolioAnalyticsError("INVALID_QUERY", "page.cursor does not match this snapshot", 400);
  }
  return cursor.offset;
}

function toMetricItem(fact: PortfolioVersionFact): PortfolioVersionMetricItem {
  return {
    projectId: fact.projectId,
    assetId: fact.assetId,
    versionId: fact.versionId,
    versionNumber: fact.versionNumber,
    versionCreatedAt: fact.versionCreatedAt,
    fileType: fact.fileType,
    fileSizeBytes: fact.fileSizeBytes,
    durationMilliseconds: fact.durationMilliseconds,
  };
}

export function analyzePortfolio(
  principal: PortfolioAnalyticsPrincipal,
  query: PortfolioAnalyticsQuery,
  sourceFacts: readonly PortfolioVersionFact[],
): PortfolioAnalyticsResult {
  authorizePortfolioAnalytics(principal, query);
  if (query.snapshot.mode === "replay") assertQueryMatchesBinding(query, query.snapshot.binding);

  const normalized = normalizeAndDeduplicate(sourceFacts, query);
  const capturedBinding = createBinding(query, normalized.facts);
  if (query.snapshot.mode === "replay") assertReplayFacts(query.snapshot.binding, capturedBinding);

  const binding = query.snapshot.mode === "replay" ? query.snapshot.binding : capturedBinding;
  const snapshotId = digest("portfolio-analytics-snapshot-v1", binding);
  const offset = decodeCursor(query.page.cursor, snapshotId, normalized.facts.length);
  const pageFacts = normalized.facts.slice(offset, offset + query.page.limit);
  const nextOffset = offset + pageFacts.length;
  const metrics = computeMetrics(normalized.facts);
  const items = pageFacts.map(toMetricItem);
  const nextCursor = nextOffset < normalized.facts.length ? encodeCursor(snapshotId, nextOffset) : null;
  const queryDigest = digest("portfolio-analytics-query-v1", {
    contractVersion: query.contractVersion,
    tenantId: query.tenantId,
    projectIds: query.projectIds,
    window: query.window,
    filters: query.filters,
    page: query.page,
    snapshotId,
  });
  const resultDigest = digest("portfolio-analytics-result-v1", {
    totals: metrics.totals,
    byFileType: metrics.byFileType,
    byProject: metrics.byProject,
    items,
    nextCursor,
  });
  const idempotencyKeyDigest = digest("portfolio-idempotency-key-v1", query.idempotencyKey);
  const receiptId = digest("portfolio-analytics-receipt-v1", {
    tenantId: query.tenantId,
    idempotencyKeyDigest,
    queryDigest,
    snapshotId,
    resultDigest,
  });

  return {
    tenantId: query.tenantId,
    window: query.window,
    snapshot: {
      mode: query.snapshot.mode === "capture" ? "captured" : "replayed",
      id: snapshotId,
      binding,
      rollback: "Replay this binding; source drift fails closed instead of mixing snapshots.",
    },
    totals: metrics.totals,
    byFileType: metrics.byFileType,
    byProject: metrics.byProject,
    items,
    page: { limit: query.page.limit, nextCursor },
    receipt: {
      receiptId,
      traceId: digest("portfolio-analytics-trace-v1", {
        tenantId: query.tenantId,
        subjectId: principal.subjectId,
        idempotencyKeyDigest,
      }).slice(0, 32),
      contractVersion: query.contractVersion,
      queryDigest,
      snapshotId,
      resultDigest,
      idempotencyKeyDigest,
      sourceFactCount: sourceFacts.length,
      acceptedFactCount: normalized.facts.length,
      duplicateFactCount: normalized.duplicateCount,
      generatedAt: query.window.asOf,
      readOnly: true,
    },
    accessibility: { surface: "api-only", userInterfaceChanged: false },
  };
}

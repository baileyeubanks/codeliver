import {
  authorizePortfolioAnalytics,
  fingerprintPortfolioFact,
  normalizePortfolioFact,
} from "./analyze";
import { digest } from "./canonical";
import { PortfolioAnalyticsError } from "./errors";
import {
  PORTFOLIO_ANALYTICS_ACCESS_VERSION,
  PORTFOLIO_ANALYTICS_CORRECT_PERMISSION,
  type PortfolioAnalyticsPrincipal,
  type PortfolioAnalyticsQuery,
  type PortfolioAnalyticsSource,
  type PortfolioSnapshotBinding,
  type PortfolioSourceRevisionReceipt,
  type PortfolioVersionFact,
} from "./types";

interface RevisionSet {
  activeFingerprint: string;
  byFingerprint: Map<string, PortfolioVersionFact>;
}

function revisionKey(tenantId: string, versionId: string): string {
  return `${tenantId}:${versionId}`;
}

function assertCorrectionAccess(principal: PortfolioAnalyticsPrincipal, tenantId: string): void {
  if (
    principal.accessVersion !== PORTFOLIO_ANALYTICS_ACCESS_VERSION ||
    principal.tenantId !== tenantId ||
    !principal.permissions.includes(PORTFOLIO_ANALYTICS_CORRECT_PERMISSION) ||
    !["tenant_owner", "portfolio_analyst"].includes(principal.role)
  ) {
    throw new PortfolioAnalyticsError("FORBIDDEN", "Portfolio source correction access denied", 403);
  }
}

function sameIdentity(left: PortfolioVersionFact, right: PortfolioVersionFact): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.projectId === right.projectId &&
    left.assetId === right.assetId &&
    left.versionId === right.versionId &&
    left.versionNumber === right.versionNumber &&
    left.versionCreatedAt === right.versionCreatedAt
  );
}

function revisionReceipt(
  principal: PortfolioAnalyticsPrincipal,
  action: PortfolioSourceRevisionReceipt["action"],
  versionId: string,
  previousFingerprint: string,
  activeFingerprint: string,
): PortfolioSourceRevisionReceipt {
  const tenantDigest = digest("portfolio-tenant-v1", principal.tenantId);
  return {
    receiptId: digest("portfolio-source-revision-receipt-v1", {
      tenantDigest,
      action,
      versionId,
      previousFingerprint,
      activeFingerprint,
      accessVersion: principal.accessVersion,
    }),
    action,
    tenantDigest,
    versionId,
    previousFingerprint,
    activeFingerprint,
    accessVersion: principal.accessVersion,
    reversible: true,
  };
}

/**
 * In-memory source/port proof adapter. Corrections append immutable revisions;
 * reactivation changes only the active pointer, so every prior revision stays
 * replayable. It performs no external writes and is not durable across a
 * process restart.
 */
export class InMemoryPortfolioAnalyticsSource implements PortfolioAnalyticsSource {
  private readonly revisions = new Map<string, RevisionSet>();

  constructor(initialFacts: readonly PortfolioVersionFact[] = []) {
    for (const fact of initialFacts) this.seed(fact);
  }

  private seed(rawFact: PortfolioVersionFact): void {
    const fact = normalizePortfolioFact(rawFact);
    const fingerprint = fingerprintPortfolioFact(fact);
    const key = revisionKey(fact.tenantId, fact.versionId);
    const existing = this.revisions.get(key);
    if (existing && existing.activeFingerprint !== fingerprint) {
      throw new PortfolioAnalyticsError(
        "SNAPSHOT_CONFLICT",
        "Initial portfolio facts contain conflicting active revisions",
        409,
      );
    }
    if (existing) {
      existing.byFingerprint.set(fingerprint, fact);
      return;
    }
    this.revisions.set(key, {
      activeFingerprint: fingerprint,
      byFingerprint: new Map([[fingerprint, fact]]),
    });
  }

  recordCorrection(
    principal: PortfolioAnalyticsPrincipal,
    expectedActiveFingerprint: string,
    rawFact: PortfolioVersionFact,
  ): PortfolioSourceRevisionReceipt {
    const fact = normalizePortfolioFact(rawFact);
    assertCorrectionAccess(principal, fact.tenantId);
    const key = revisionKey(fact.tenantId, fact.versionId);
    const revisions = this.revisions.get(key);
    if (!revisions || revisions.activeFingerprint !== expectedActiveFingerprint) {
      throw new PortfolioAnalyticsError(
        "SNAPSHOT_CONFLICT",
        "Correction expected revision is no longer active",
        409,
      );
    }
    const prior = revisions.byFingerprint.get(revisions.activeFingerprint);
    if (!prior || !sameIdentity(prior, fact)) {
      throw new PortfolioAnalyticsError(
        "SNAPSHOT_CONFLICT",
        "Correction cannot change tenant, project, asset, or version identity",
        409,
      );
    }
    const fingerprint = fingerprintPortfolioFact(fact);
    const previousFingerprint = revisions.activeFingerprint;
    revisions.byFingerprint.set(fingerprint, fact);
    revisions.activeFingerprint = fingerprint;
    return revisionReceipt(
      principal,
      fingerprint === previousFingerprint ? "unchanged" : "corrected",
      fact.versionId,
      previousFingerprint,
      fingerprint,
    );
  }

  reactivateRevision(
    principal: PortfolioAnalyticsPrincipal,
    versionId: string,
    expectedActiveFingerprint: string,
    targetFingerprint: string,
  ): PortfolioSourceRevisionReceipt {
    assertCorrectionAccess(principal, principal.tenantId);
    const revisions = this.revisions.get(revisionKey(principal.tenantId, versionId));
    if (
      !revisions ||
      revisions.activeFingerprint !== expectedActiveFingerprint ||
      !revisions.byFingerprint.has(targetFingerprint)
    ) {
      throw new PortfolioAnalyticsError(
        "SNAPSHOT_CONFLICT",
        "Requested source revision cannot be safely reactivated",
        409,
      );
    }
    const previousFingerprint = revisions.activeFingerprint;
    revisions.activeFingerprint = targetFingerprint;
    return revisionReceipt(
      principal,
      targetFingerprint === previousFingerprint ? "unchanged" : "reactivated",
      versionId,
      previousFingerprint,
      targetFingerprint,
    );
  }

  async loadCaptureFacts(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
  ): Promise<readonly PortfolioVersionFact[]> {
    authorizePortfolioAnalytics(principal, query);
    const projects = new Set(query.projectIds);
    const fileTypes = query.filters.fileTypes ? new Set(query.filters.fileTypes) : null;
    const facts: PortfolioVersionFact[] = [];
    for (const [key, revisions] of this.revisions) {
      if (!key.startsWith(`${query.tenantId}:`)) continue;
      const fact = revisions.byFingerprint.get(revisions.activeFingerprint);
      if (
        fact &&
        projects.has(fact.projectId) &&
        (!fileTypes || fileTypes.has(fact.fileType)) &&
        fact.versionCreatedAt >= query.window.from &&
        fact.versionCreatedAt <= query.window.to &&
        fact.versionCreatedAt <= query.window.asOf
      ) {
        facts.push(structuredClone(fact));
      }
    }
    return facts;
  }

  async loadReplayFacts(
    principal: PortfolioAnalyticsPrincipal,
    query: PortfolioAnalyticsQuery,
    binding: PortfolioSnapshotBinding,
  ): Promise<readonly PortfolioVersionFact[]> {
    authorizePortfolioAnalytics(principal, query);
    if (binding.tenantId !== query.tenantId) {
      throw new PortfolioAnalyticsError("SNAPSHOT_CONFLICT", "Snapshot tenant binding changed", 409);
    }
    const facts: PortfolioVersionFact[] = [];
    for (const bound of binding.facts) {
      const revisions = this.revisions.get(revisionKey(query.tenantId, bound.versionId));
      const fact = revisions?.byFingerprint.get(bound.fingerprint);
      if (fact) facts.push(structuredClone(fact));
    }
    return facts;
  }
}

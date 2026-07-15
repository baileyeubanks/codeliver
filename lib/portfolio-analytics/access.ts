import { PortfolioAnalyticsError } from "./errors";
import {
  PORTFOLIO_ANALYTICS_ACCESS_VERSION,
  PORTFOLIO_ANALYTICS_READ_PERMISSION,
  type PortfolioAnalyticsPrincipal,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * M2 has one owner per project and no enterprise membership table. This
 * server-only bridge derives the tenant-owner decision from the authenticated
 * subject; request JSON cannot add a role or permission. The enterprise lane
 * can replace this bridge with a versioned access-decision adapter.
 */
export function deriveM2OwnerPortfolioPrincipal(authenticatedSubjectId: string): PortfolioAnalyticsPrincipal {
  if (!UUID_PATTERN.test(authenticatedSubjectId)) {
    throw new PortfolioAnalyticsError("FORBIDDEN", "Portfolio analytics access denied", 403);
  }
  const subjectId = authenticatedSubjectId.toLowerCase();
  return {
    subjectId,
    tenantId: subjectId,
    role: "tenant_owner",
    accessVersion: PORTFOLIO_ANALYTICS_ACCESS_VERSION,
    permissions: [PORTFOLIO_ANALYTICS_READ_PERMISSION],
  };
}

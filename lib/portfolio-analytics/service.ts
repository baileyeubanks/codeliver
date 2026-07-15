import { analyzePortfolio, authorizePortfolioAnalytics } from "./analyze";
import { digest } from "./canonical";
import type { PortfolioAnalyticsExecutionLedger } from "./idempotency";
import type {
  PortfolioAnalyticsPrincipal,
  PortfolioAnalyticsQuery,
  PortfolioAnalyticsResult,
  PortfolioAnalyticsSource,
} from "./types";

/** Authorization runs before the source adapter, so a forged tenant never causes a read. */
export async function executePortfolioAnalytics(
  principal: PortfolioAnalyticsPrincipal,
  query: PortfolioAnalyticsQuery,
  source: PortfolioAnalyticsSource,
  ledger: PortfolioAnalyticsExecutionLedger,
): Promise<PortfolioAnalyticsResult> {
  authorizePortfolioAnalytics(principal, query);
  const idempotencyKeyDigest = digest("portfolio-idempotency-key-v1", query.idempotencyKey);
  const intentDigest = digest("portfolio-analytics-intent-v1", {
    contractVersion: query.contractVersion,
    tenantId: query.tenantId,
    projectIds: query.projectIds,
    window: query.window,
    filters: query.filters,
    page: query.page,
    snapshot: query.snapshot,
  });
  return ledger.execute(
    { tenantId: query.tenantId, idempotencyKeyDigest, intentDigest },
    async () => {
      const facts =
        query.snapshot.mode === "capture"
          ? await source.loadCaptureFacts(principal, query)
          : await source.loadReplayFacts(principal, query, query.snapshot.binding);
      return analyzePortfolio(principal, query, facts);
    },
  );
}

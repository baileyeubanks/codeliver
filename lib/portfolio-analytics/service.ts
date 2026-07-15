import { analyzePortfolio, authorizePortfolioAnalytics } from "./analyze";
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
): Promise<PortfolioAnalyticsResult> {
  authorizePortfolioAnalytics(principal, query);
  const facts =
    query.snapshot.mode === "capture"
      ? await source.loadCaptureFacts(principal, query)
      : await source.loadReplayFacts(principal, query, query.snapshot.binding);
  return analyzePortfolio(principal, query, facts);
}

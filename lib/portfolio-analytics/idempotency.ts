import { PortfolioAnalyticsError } from "./errors";
import type { PortfolioAnalyticsResult } from "./types";

export interface PortfolioAnalyticsExecutionClaim {
  tenantId: string;
  idempotencyKeyDigest: string;
  intentDigest: string;
}

export interface PortfolioAnalyticsExecutionLedger {
  execute(
    claim: PortfolioAnalyticsExecutionClaim,
    operation: () => Promise<PortfolioAnalyticsResult>,
  ): Promise<PortfolioAnalyticsResult>;
}

interface Entry {
  intentDigest: string;
  result: Promise<PortfolioAnalyticsResult>;
}

function clone(result: PortfolioAnalyticsResult): PortfolioAnalyticsResult {
  return structuredClone(result);
}

/**
 * Process-local proof adapter. It coalesces concurrent identical claims and
 * rejects key reuse with changed intent. It deliberately has no disk/network
 * durability; production wiring requires an approved atomic durable adapter.
 */
export class InMemoryPortfolioAnalyticsExecutionLedger implements PortfolioAnalyticsExecutionLedger {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly maxEntries = 1_000) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("maxEntries must be a positive safe integer");
    }
  }

  async execute(
    claim: PortfolioAnalyticsExecutionClaim,
    operation: () => Promise<PortfolioAnalyticsResult>,
  ): Promise<PortfolioAnalyticsResult> {
    const key = `${claim.tenantId}:${claim.idempotencyKeyDigest}`;
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.intentDigest !== claim.intentDigest) {
        throw new PortfolioAnalyticsError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used for a different portfolio query",
          409,
        );
      }
      return clone(await existing.result);
    }
    if (this.entries.size >= this.maxEntries) {
      throw new PortfolioAnalyticsError(
        "RESOURCE_LIMIT",
        "Portfolio idempotency ledger is at capacity",
        503,
        undefined,
        "Retry after process capacity is restored; production requires an approved bounded durable ledger.",
      );
    }

    const result = operation().then(clone);
    const entry = { intentDigest: claim.intentDigest, result };
    this.entries.set(key, entry);
    try {
      return clone(await result);
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

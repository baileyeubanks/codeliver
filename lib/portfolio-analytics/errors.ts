export type PortfolioAnalyticsErrorCode =
  | "FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_QUERY"
  | "NOT_FOUND"
  | "RESOURCE_LIMIT"
  | "SNAPSHOT_CONFLICT"
  | "SOURCE_FAILURE";

const RECOVERY: Record<PortfolioAnalyticsErrorCode, string> = {
  FORBIDDEN: "Sign in with a tenant role that grants portfolio analytics access, then retry without changing tenant scope.",
  IDEMPOTENCY_CONFLICT: "Retry the original request unchanged or use a new idempotency key for the changed request.",
  INVALID_QUERY: "Correct the named request field using the published contract and retry.",
  NOT_FOUND: "Confirm the requested projects still exist in the authenticated tenant and retry.",
  RESOURCE_LIMIT: "Narrow the project, time, fact, body, or page dimensions and retry.",
  SNAPSHOT_CONFLICT: "Recapture a new snapshot for current data or replay the exact prior binding against immutable source revisions.",
  SOURCE_FAILURE: "Retry later; if the failure persists, provide the receipt or trace identifier to support.",
};

export class PortfolioAnalyticsError extends Error {
  constructor(
    readonly code: PortfolioAnalyticsErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Readonly<Record<string, unknown>>,
    readonly recovery: string = RECOVERY[code],
  ) {
    super(message);
    this.name = "PortfolioAnalyticsError";
  }
}

export function invalidQuery(message: string, field?: string): never {
  throw new PortfolioAnalyticsError(
    "INVALID_QUERY",
    message,
    400,
    field ? { field } : undefined,
  );
}

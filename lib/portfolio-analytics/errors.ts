export type PortfolioAnalyticsErrorCode =
  | "FORBIDDEN"
  | "INVALID_QUERY"
  | "NOT_FOUND"
  | "RESOURCE_LIMIT"
  | "SNAPSHOT_CONFLICT"
  | "SOURCE_FAILURE";

export class PortfolioAnalyticsError extends Error {
  constructor(
    readonly code: PortfolioAnalyticsErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Readonly<Record<string, unknown>>,
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

export type CatalogErrorCode =
  | "invalid_request"
  | "internal_error"
  | "forbidden"
  | "tenant_scope_mismatch"
  | "not_found"
  | "revision_conflict"
  | "stale_asset_version"
  | "version_conflict"
  | "idempotency_conflict"
  | "invalid_cursor"
  | "stale_cursor"
  | "operation_not_reversible";

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  readonly status: number;

  constructor(code: CatalogErrorCode, message: string, status: number) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.status = status;
  }
}

export function asCatalogError(error: unknown): CatalogError {
  if (error instanceof CatalogError) return error;
  return new CatalogError(
    "internal_error",
    "The catalog request could not be completed safely.",
    500,
  );
}

export interface CatalogRecoveryGuidance {
  retryable: boolean;
  recovery: string;
}

const RECOVERY: Record<CatalogErrorCode, CatalogRecoveryGuidance> = {
  invalid_request: {
    retryable: false,
    recovery: "Correct the identified request field and submit a new request.",
  },
  internal_error: {
    retryable: true,
    recovery: "No change is confirmed. Retry later with the same idempotency key or contact support.",
  },
  forbidden: {
    retryable: false,
    recovery: "Request access from a tenant administrator before trying again.",
  },
  tenant_scope_mismatch: {
    retryable: false,
    recovery: "Use the tenant selected in the authenticated access scope.",
  },
  not_found: {
    retryable: false,
    recovery: "Verify the tenant, asset, and immutable version identifiers.",
  },
  revision_conflict: {
    retryable: true,
    recovery: "Refresh the item and retry with its current revision and a new idempotency key.",
  },
  stale_asset_version: {
    retryable: true,
    recovery: "Refresh the asset and bind the newest accessible immutable version.",
  },
  version_conflict: {
    retryable: false,
    recovery: "Verify the immutable version identifier, sequence, and checksum before retrying.",
  },
  idempotency_conflict: {
    retryable: false,
    recovery: "Keep the original payload for this key or submit the changed payload with a new key.",
  },
  invalid_cursor: {
    retryable: true,
    recovery: "Restart discovery without a cursor.",
  },
  stale_cursor: {
    retryable: true,
    recovery: "The catalog changed; restart discovery from the first page.",
  },
  operation_not_reversible: {
    retryable: false,
    recovery: "Refresh the item and choose a currently reversible operation.",
  },
};

export function catalogRecoveryGuidance(
  error: CatalogError,
): CatalogRecoveryGuidance {
  return RECOVERY[error.code];
}

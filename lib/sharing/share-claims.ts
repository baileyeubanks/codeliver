// Node's strip-types test runner requires explicit TypeScript extensions.
// @ts-expect-error TS5097: the runtime intentionally imports the source module.
import { CO_PRODUCTION_DATA_SCHEMA, getSupabaseDataSchema, type SupabaseDataSchema } from "../data-authority.ts";
// @ts-expect-error TS5097: the runtime intentionally imports the source module.
import { hashOpaqueToken } from "../security/opaque-token.ts";
// @ts-expect-error TS5097: the runtime intentionally imports the source module.
import { getSupabase } from "../supabase.ts";

export const REVIEW_VIEW_CLAIM_HEADER = "x-review-view-claim-id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEMPORARY_ERROR = "Review access is temporarily unavailable";

interface ShareClaimRpcClient {
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

interface ShareClaimDependencies {
  schema?: SupabaseDataSchema;
  client?: ShareClaimRpcClient;
}

export interface AtomicShareLinkViewClaim {
  claimId: string;
  projectId: string;
  assetId: string;
  inviteId: string;
  versionId: string | null;
  requestId: string;
  viewCount: number;
  maxViews: number | null;
  claimedAt: string;
  replayed: boolean;
}

export type ShareLinkViewClaimResult =
  | { ok: true; mode: "legacy" }
  | { ok: true; mode: "atomic"; claim: AtomicShareLinkViewClaim }
  | {
      ok: false;
      mode: "atomic";
      status: 400 | 404 | 410 | 503;
      code:
        | "invalid_request"
        | "not_found"
        | "revoked"
        | "expired"
        | "exhausted"
        | "unavailable";
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function unavailable(): ShareLinkViewClaimResult {
  return {
    ok: false,
    mode: "atomic",
    status: 503,
    code: "unavailable",
    error: TEMPORARY_ERROR,
  };
}

function parseClaimedResponse(
  value: Record<string, unknown>,
  requestId: string,
): ShareLinkViewClaimResult {
  const maxViews = value.max_views;
  if (
    typeof value.replayed !== "boolean" ||
    !isUuid(value.claim_id) ||
    !isUuid(value.project_id) ||
    !isUuid(value.asset_id) ||
    !isUuid(value.invite_id) ||
    !(value.version_id === null || isUuid(value.version_id)) ||
    !isPositiveInteger(value.view_count) ||
    !(maxViews === null || isPositiveInteger(maxViews)) ||
    (typeof maxViews === "number" && value.view_count > maxViews) ||
    !isIsoTimestamp(value.claimed_at)
  ) {
    return unavailable();
  }

  return {
    ok: true,
    mode: "atomic",
    claim: {
      claimId: value.claim_id,
      projectId: value.project_id,
      assetId: value.asset_id,
      inviteId: value.invite_id,
      versionId: value.version_id,
      requestId,
      viewCount: value.view_count,
      maxViews,
      claimedAt: value.claimed_at,
      replayed: value.replayed,
    },
  };
}

function parseRejectedResponse(
  value: Record<string, unknown>,
): ShareLinkViewClaimResult {
  if (value.replayed !== false) return unavailable();

  switch (value.status) {
    case "not_found":
      return {
        ok: false,
        mode: "atomic",
        status: 404,
        code: "not_found",
        error: "Invalid or expired review link",
      };
    case "revoked":
      return {
        ok: false,
        mode: "atomic",
        status: 410,
        code: "revoked",
        error: "This review link is no longer active",
      };
    case "expired":
      return {
        ok: false,
        mode: "atomic",
        status: 410,
        code: "expired",
        error: "This review link has expired",
      };
    case "exhausted":
      if (
        !Number.isSafeInteger(value.view_count) ||
        Number(value.view_count) < 0 ||
        !isPositiveInteger(value.max_views) ||
        Number(value.view_count) < value.max_views
      ) {
        return unavailable();
      }
      return {
        ok: false,
        mode: "atomic",
        status: 410,
        code: "exhausted",
        error: "This review link has reached its view limit",
      };
    default:
      return unavailable();
  }
}

export function usesAtomicShareLinkViewClaims(
  schema: SupabaseDataSchema = getSupabaseDataSchema(),
) {
  return schema === CO_PRODUCTION_DATA_SCHEMA;
}

export function reviewViewClaimRequestId(request: Request) {
  const value = request.headers.get(REVIEW_VIEW_CLAIM_HEADER)?.trim() ?? "";
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export async function claimShareLinkView(
  {
    token,
    requestId,
  }: {
    token: string;
    requestId: string | null;
  },
  dependencies: ShareClaimDependencies = {},
): Promise<ShareLinkViewClaimResult> {
  const schema = dependencies.schema ?? getSupabaseDataSchema();
  if (schema !== CO_PRODUCTION_DATA_SCHEMA) {
    return { ok: true, mode: "legacy" };
  }

  if (!requestId || !UUID_PATTERN.test(requestId)) {
    return {
      ok: false,
      mode: "atomic",
      status: 400,
      code: "invalid_request",
      error: "A valid review request ID is required",
    };
  }

  const client = dependencies.client ?? getSupabase();
  let result: { data: unknown; error: unknown };
  try {
    result = await client.rpc("claim_share_link_view", {
      p_token_hash: hashOpaqueToken(token),
      p_request_id: requestId,
    });
  } catch {
    return unavailable();
  }

  if (result.error || !isRecord(result.data)) return unavailable();
  if (result.data.status === "claimed") {
    return parseClaimedResponse(result.data, requestId.toLowerCase());
  }
  return parseRejectedResponse(result.data);
}

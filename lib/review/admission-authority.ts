import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
} from "@/lib/data-authority";
import { isOpaqueRouteToken } from "@/lib/dynamic-route-authority";
import type { ReviewInviteRecord } from "@/lib/review-invites";
import {
  findReviewAdmissionCookie,
  issueReviewAdmissionGrant,
  issueReviewAdmissionGrantFromTokenHash,
  readReviewAdmissionCookie,
  REVIEW_ADMISSION_GRANT_TTL_SECONDS,
  serializeReviewAdmissionCookie,
  verifyReviewAdmissionMediaGrant,
  type ReviewAdmissionClaims,
} from "@/lib/review/admission-grant";
import { hashOpaqueToken } from "@/lib/security/opaque-token";
import { getSupabase } from "@/lib/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SHARE_PERMISSIONS = new Set(["view", "comment", "approve"]);
const STORAGE_PROVIDERS = new Set([
  "local",
  "ccnas",
  "google-drive",
  "object-store",
]);
const REVIEW_ACTIONS = new Set([
  "comment",
  "approval",
  "edit_decision",
] as const);

export type ReviewAction = "comment" | "approval" | "edit_decision";

export interface ReviewAdmission {
  admissionId: string;
  inviteId: string;
  assetId: string;
  versionId: string;
  expiresAt: number;
  viewCount: number;
  maxViews: number | null;
}

export interface AuthorizedReviewMedia {
  admission_id: string;
  invite_id: string;
  asset_id: string;
  version_id: string;
  admission_expires_at: string;
  download_enabled: boolean;
  watermark_enabled: false;
  file_size: number;
  source_upload_id: string;
  storage_provider: string;
  storage_object_key: string;
  storage_sha256: string;
  storage_provider_version_id: string;
  storage_committed_at: string;
  original_filename: string;
  mime_type: string;
}

type AdmissionFailure = {
  ok: false;
  status: 403 | 404 | 410 | 429 | 503;
  code: string;
  retryAfterSeconds?: number;
};

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function nullableInteger(value: unknown): number | null | undefined {
  return value === null ? null : integer(value) ?? undefined;
}

function timestampSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? Math.floor(milliseconds / 1_000)
    : null;
}

function exactIdentity(
  row: Record<string, unknown>,
  claims: Pick<
    ReviewAdmissionClaims,
    "admissionId" | "inviteId" | "assetId" | "versionId"
  >,
): boolean {
  return (
    row.admission_id === claims.admissionId &&
    row.invite_id === claims.inviteId &&
    row.asset_id === claims.assetId &&
    row.version_id === claims.versionId
  );
}

function unavailable(code: string): AdmissionFailure {
  return { ok: false, status: 503, code };
}

function refreshedAdmissionCookie(
  claims: ReviewAdmissionClaims,
  binding: { token: string } | { tokenHash: string },
): string | null {
  const now = Math.floor(Date.now() / 1_000);
  const expiresAt = Math.min(
    claims.admissionExpiresAt,
    now + REVIEW_ADMISSION_GRANT_TTL_SECONDS,
  );
  if (expiresAt <= now) return null;

  try {
    const input = {
      admissionId: claims.admissionId,
      inviteId: claims.inviteId,
      assetId: claims.assetId,
      versionId: claims.versionId,
      issuedAt: now,
      expiresAt,
      admissionExpiresAt: claims.admissionExpiresAt,
    };
    const grant =
      "token" in binding
        ? issueReviewAdmissionGrant({ ...input, token: binding.token })
        : issueReviewAdmissionGrantFromTokenHash({
            ...input,
            tokenHash: binding.tokenHash,
          });
    return serializeReviewAdmissionCookie({
      admissionId: claims.admissionId,
      grant,
      admissionExpiresAt: claims.admissionExpiresAt,
      now,
    });
  } catch {
    return null;
  }
}

export async function admitReviewInvite({
  token,
  admissionId,
  networkBucket,
}: {
  token: string;
  admissionId: string;
  networkBucket: string;
}): Promise<
  | { ok: true; admission: ReviewAdmission }
  | AdmissionFailure
> {
  if (
    getSupabaseDataSchema() !== CO_PRODUCTION_DATA_SCHEMA ||
    !isOpaqueRouteToken(token) ||
    !UUID_PATTERN.test(admissionId) ||
    !SHA256_PATTERN.test(networkBucket)
  ) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }

  const result = await getSupabase().rpc("admit_review_invite", {
    p_token_hash: hashOpaqueToken(token),
    p_admission_id: admissionId,
    p_network_bucket: networkBucket,
  });
  if (result.error) return unavailable("REVIEW_ADMISSION_UNAVAILABLE");

  const row = firstRow(result.data);
  const status = row?.admission_status;
  if (status === "rate_limited" || status === "admission_limit") {
    const retryAfterSeconds = integer(row?.retry_after_seconds) ?? 60;
    return {
      ok: false,
      status: 429,
      code: "REVIEW_ADMISSION_RATE_LIMITED",
      retryAfterSeconds: Math.max(1, Math.min(3_600, retryAfterSeconds)),
    };
  }
  if (status === "password_required") {
    return {
      ok: false,
      status: 403,
      code: "REVIEW_PASSWORD_REQUIRED",
    };
  }
  if (status === "view_limit") {
    return {
      ok: false,
      status: 410,
      code: "REVIEW_VIEW_LIMIT_REACHED",
    };
  }
  if (status === "media_unavailable") {
    return unavailable("REVIEW_MEDIA_UNAVAILABLE");
  }
  if (status !== "admitted" || !row) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }

  const expiresAt = timestampSeconds(row.admission_expires_at);
  const viewCount = integer(row.view_count);
  const maxViews = nullableInteger(row.max_views);
  if (
    row.admission_id !== admissionId ||
    !UUID_PATTERN.test(String(row.invite_id ?? "")) ||
    !UUID_PATTERN.test(String(row.asset_id ?? "")) ||
    !UUID_PATTERN.test(String(row.version_id ?? "")) ||
    expiresAt === null ||
    expiresAt <= Math.floor(Date.now() / 1_000) ||
    viewCount === null ||
    viewCount < 0 ||
    maxViews === undefined ||
    (maxViews !== null &&
      (maxViews <= 0 || viewCount > maxViews))
  ) {
    return unavailable("REVIEW_ADMISSION_UNAVAILABLE");
  }

  return {
    ok: true,
    admission: {
      admissionId,
      inviteId: row.invite_id as string,
      assetId: row.asset_id as string,
      versionId: row.version_id as string,
      expiresAt,
      viewCount,
      maxViews,
    },
  };
}

function normalizeAdmittedInvite(
  row: Record<string, unknown>,
): ReviewInviteRecord | null {
  const permissions = row.permissions;
  const viewCount = integer(row.view_count);
  const maxViews = nullableInteger(row.max_views);
  if (
    !UUID_PATTERN.test(String(row.invite_id ?? "")) ||
    !UUID_PATTERN.test(String(row.asset_id ?? "")) ||
    !UUID_PATTERN.test(String(row.version_id ?? "")) ||
    !UUID_PATTERN.test(String(row.project_id ?? "")) ||
    !SHARE_PERMISSIONS.has(String(permissions ?? "")) ||
    typeof row.asset_title !== "string" ||
    typeof row.asset_file_type !== "string" ||
    typeof row.asset_status !== "string" ||
    typeof row.project_name !== "string" ||
    row.watermark_enabled !== false ||
    typeof row.download_enabled !== "boolean" ||
    viewCount === null ||
    viewCount < 0 ||
    maxViews === undefined ||
    (maxViews !== null &&
      (maxViews <= 0 || viewCount > maxViews)) ||
    (row.reviewer_name !== null && typeof row.reviewer_name !== "string") ||
    (row.reviewer_email !== null && typeof row.reviewer_email !== "string") ||
    (row.invite_expires_at !== null &&
      timestampSeconds(row.invite_expires_at) === null) ||
    (row.watermark_text !== null &&
      typeof row.watermark_text !== "string")
  ) {
    return null;
  }

  return {
    id: row.invite_id as string,
    asset_id: row.asset_id as string,
    version_id: row.version_id as string,
    reviewer_name: row.reviewer_name as string | null,
    reviewer_email: row.reviewer_email as string | null,
    permissions: permissions as ReviewInviteRecord["permissions"],
    password_hash: null,
    expires_at: row.invite_expires_at as string | null,
    watermark_enabled: row.watermark_enabled,
    watermark_text: row.watermark_text as string | null,
    download_enabled: row.download_enabled,
    view_count: viewCount,
    max_views: maxViews,
    last_viewed_at: null,
    active: true,
    assets: {
      id: row.asset_id as string,
      title: row.asset_title,
      file_type: row.asset_file_type,
      file_url: null,
      status: row.asset_status,
      deleted_at: null,
      projects: {
        id: row.project_id as string,
        name: row.project_name,
      },
    },
  };
}

export async function authorizeAdmittedReviewInvite(
  request: Request,
  token: string,
): Promise<
  | {
      ok: true;
      invite: ReviewInviteRecord;
      claims: ReviewAdmissionClaims;
      setCookie: string;
    }
  | AdmissionFailure
> {
  if (
    getSupabaseDataSchema() !== CO_PRODUCTION_DATA_SCHEMA ||
    !isOpaqueRouteToken(token)
  ) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }

  const admission = findReviewAdmissionCookie(request, token);
  if (!admission) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }
  const tokenHash = hashOpaqueToken(token);
  const result = await getSupabase().rpc("authorize_review_admission", {
    p_admission_id: admission.claims.admissionId,
    p_token_hash: tokenHash,
  });
  if (result.error) return unavailable("REVIEW_ADMISSION_UNAVAILABLE");
  const row = firstRow(result.data);
  if (!row) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }
  if (
    !exactIdentity(row, admission.claims) ||
    timestampSeconds(row.admission_expires_at) !==
      admission.claims.admissionExpiresAt
  ) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }
  const invite = normalizeAdmittedInvite(row);
  if (!invite) return unavailable("REVIEW_ADMISSION_UNAVAILABLE");
  const setCookie = refreshedAdmissionCookie(admission.claims, { token });
  if (!setCookie) return unavailable("REVIEW_ADMISSION_UNAVAILABLE");
  return { ok: true, invite, claims: admission.claims, setCookie };
}

export async function reserveReviewActionRate({
  token,
  claims,
  action,
}: {
  token: string;
  claims: ReviewAdmissionClaims;
  action: ReviewAction;
}): Promise<{ ok: true } | AdmissionFailure> {
  if (
    getSupabaseDataSchema() !== CO_PRODUCTION_DATA_SCHEMA ||
    !isOpaqueRouteToken(token) ||
    !REVIEW_ACTIONS.has(action) ||
    !UUID_PATTERN.test(claims.admissionId) ||
    !UUID_PATTERN.test(claims.inviteId) ||
    !UUID_PATTERN.test(claims.assetId) ||
    !UUID_PATTERN.test(claims.versionId)
  ) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }

  const result = await getSupabase().rpc(
    "reserve_review_action_rate_limit",
    {
      p_admission_id: claims.admissionId,
      p_token_hash: hashOpaqueToken(token),
      p_action: action,
    },
  );
  if (result.error) return unavailable("REVIEW_ACTION_UNAVAILABLE");

  const row = firstRow(result.data);
  if (!row || !exactIdentity(row, claims)) {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }
  if (row.action_status === "allowed") return { ok: true };
  if (row.action_status === "rate_limited") {
    return {
      ok: false,
      status: 429,
      code: "REVIEW_ACTION_RATE_LIMITED",
      retryAfterSeconds: Math.max(
        1,
        Math.min(60, integer(row.retry_after_seconds) ?? 60),
      ),
    };
  }
  if (row.action_status === "unavailable") {
    return { ok: false, status: 404, code: "REVIEW_ADMISSION_INVALID" };
  }
  return unavailable("REVIEW_ACTION_UNAVAILABLE");
}

function isSafeStorageObjectKey(value: string): boolean {
  if (
    !value ||
    value.length > 2_048 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== "..");
}

function normalizeMediaRecord(
  row: Record<string, unknown>,
): AuthorizedReviewMedia | null {
  const fileSize = integer(row.file_size);
  if (
    !UUID_PATTERN.test(String(row.admission_id ?? "")) ||
    !UUID_PATTERN.test(String(row.invite_id ?? "")) ||
    !UUID_PATTERN.test(String(row.asset_id ?? "")) ||
    !UUID_PATTERN.test(String(row.version_id ?? "")) ||
    !UUID_PATTERN.test(String(row.source_upload_id ?? "")) ||
    timestampSeconds(row.admission_expires_at) === null ||
    timestampSeconds(row.storage_committed_at) === null ||
    typeof row.download_enabled !== "boolean" ||
    row.watermark_enabled !== false ||
    fileSize === null ||
    fileSize <= 0 ||
    typeof row.storage_provider !== "string" ||
    !STORAGE_PROVIDERS.has(row.storage_provider) ||
    typeof row.storage_object_key !== "string" ||
    !isSafeStorageObjectKey(row.storage_object_key) ||
    typeof row.storage_sha256 !== "string" ||
    !SHA256_PATTERN.test(row.storage_sha256) ||
    typeof row.storage_provider_version_id !== "string" ||
    !row.storage_provider_version_id ||
    row.storage_provider_version_id.length > 1_024 ||
    CONTROL_CHARACTERS.test(row.storage_provider_version_id) ||
    typeof row.original_filename !== "string" ||
    !row.original_filename ||
    row.original_filename.length > 512 ||
    CONTROL_CHARACTERS.test(row.original_filename) ||
    typeof row.mime_type !== "string" ||
    !row.mime_type ||
    row.mime_type.length > 256 ||
    CONTROL_CHARACTERS.test(row.mime_type)
  ) {
    return null;
  }
  return {
    admission_id: row.admission_id as string,
    invite_id: row.invite_id as string,
    asset_id: row.asset_id as string,
    version_id: row.version_id as string,
    admission_expires_at: row.admission_expires_at as string,
    download_enabled: row.download_enabled,
    watermark_enabled: false,
    file_size: fileSize,
    source_upload_id: row.source_upload_id as string,
    storage_provider: row.storage_provider,
    storage_object_key: row.storage_object_key,
    storage_sha256: row.storage_sha256,
    storage_provider_version_id: row.storage_provider_version_id,
    storage_committed_at: row.storage_committed_at as string,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
  };
}

export async function authorizeReviewMedia(
  request: Request,
  admissionId: string,
): Promise<
  | {
      ok: true;
      media: AuthorizedReviewMedia;
      claims: ReviewAdmissionClaims;
      setCookie: string;
    }
  | AdmissionFailure
> {
  if (
    getSupabaseDataSchema() !== CO_PRODUCTION_DATA_SCHEMA ||
    !UUID_PATTERN.test(admissionId)
  ) {
    return { ok: false, status: 404, code: "REVIEW_MEDIA_NOT_FOUND" };
  }
  const grant = readReviewAdmissionCookie(request, admissionId);
  if (!grant) {
    return { ok: false, status: 404, code: "REVIEW_MEDIA_NOT_FOUND" };
  }
  const verified = verifyReviewAdmissionMediaGrant(grant, {
    admissionId,
  });
  if (!verified) {
    return { ok: false, status: 404, code: "REVIEW_MEDIA_NOT_FOUND" };
  }
  const result = await getSupabase().rpc("authorize_review_media", {
    p_admission_id: admissionId,
    p_token_hash: verified.tokenHash,
  });
  if (result.error) return unavailable("REVIEW_MEDIA_UNAVAILABLE");
  const row = firstRow(result.data);
  if (!row) {
    return { ok: false, status: 404, code: "REVIEW_MEDIA_NOT_FOUND" };
  }
  if (
    !exactIdentity(row, verified.claims) ||
    timestampSeconds(row.admission_expires_at) !==
      verified.claims.admissionExpiresAt
  ) {
    return { ok: false, status: 404, code: "REVIEW_MEDIA_NOT_FOUND" };
  }
  const media = normalizeMediaRecord(row);
  if (!media) return unavailable("REVIEW_MEDIA_UNAVAILABLE");
  const setCookie = refreshedAdmissionCookie(verified.claims, {
    tokenHash: verified.tokenHash,
  });
  if (!setCookie) return unavailable("REVIEW_MEDIA_UNAVAILABLE");
  return { ok: true, media, claims: verified.claims, setCookie };
}

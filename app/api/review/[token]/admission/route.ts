import { randomUUID } from "node:crypto";

import { isOpaqueRouteToken } from "@/lib/dynamic-route-authority";
import { admitReviewInvite } from "@/lib/review/admission-authority";
import {
  assertReviewAdmissionSigningConfiguration,
  findReviewAdmissionCookie,
  issueReviewAdmissionGrant,
  REVIEW_ADMISSION_GRANT_TTL_SECONDS,
  serializeReviewAdmissionCookie,
} from "@/lib/review/admission-grant";
import {
  readReviewJsonObject,
  reviewAdmissionNetworkBucket,
  validateReviewMutationRequest,
} from "@/lib/review/request-boundary";
import {
  reviewBackendUnavailable,
  reviewError,
  reviewJson,
} from "@/lib/review/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function admit(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const boundary = validateReviewMutationRequest(request);
  if (!boundary.ok) {
    return reviewError(
      "Review request is not allowed",
      boundary.code,
      boundary.status,
    );
  }

  const { token } = await params;
  if (!isOpaqueRouteToken(token)) {
    return reviewError(
      "Review link is unavailable",
      "REVIEW_ADMISSION_INVALID",
      404,
    );
  }

  const bodyResult = await readReviewJsonObject(request);
  if (!bodyResult.ok) {
    return reviewError(
      bodyResult.status === 413
        ? "Admission request is too large"
        : "Admission request must be JSON",
      bodyResult.code,
      bodyResult.status,
    );
  }
  if (Object.keys(bodyResult.value).length > 0) {
    return reviewError(
      "Admission request must be an empty JSON object",
      "REVIEW_ADMISSION_REQUEST_INVALID",
      400,
    );
  }

  const prior = findReviewAdmissionCookie(request, token, {
    allowExpiredForRefresh: true,
  });
  const admissionId = prior?.claims.admissionId ?? randomUUID();
  assertReviewAdmissionSigningConfiguration();
  const networkBucket = reviewAdmissionNetworkBucket(request);
  const result = await admitReviewInvite({
    token,
    admissionId,
    networkBucket,
  });
  if (!result.ok) {
    const headers =
      result.status === 429
        ? {
            "Retry-After": String(
              Math.max(1, result.retryAfterSeconds ?? 60),
            ),
          }
        : undefined;
    return reviewError(
      result.status === 429
        ? "Review admission rate exceeded"
        : "Review link is unavailable",
      result.code,
      result.status,
      headers,
    );
  }

  const now = Math.floor(Date.now() / 1_000);
  const grantExpiresAt = Math.min(
    result.admission.expiresAt,
    now + REVIEW_ADMISSION_GRANT_TTL_SECONDS,
  );
  if (grantExpiresAt <= now) return reviewBackendUnavailable();

  const grant = issueReviewAdmissionGrant({
    token,
    admissionId: result.admission.admissionId,
    inviteId: result.admission.inviteId,
    assetId: result.admission.assetId,
    versionId: result.admission.versionId,
    issuedAt: now,
    expiresAt: grantExpiresAt,
    admissionExpiresAt: result.admission.expiresAt,
  });
  const cookie = serializeReviewAdmissionCookie({
    admissionId: result.admission.admissionId,
    grant,
    admissionExpiresAt: result.admission.expiresAt,
    now,
  });
  const reused =
    prior?.claims.admissionId === result.admission.admissionId;

  return reviewJson(
    {
      admission_id: result.admission.admissionId,
      expires_at: new Date(
        result.admission.expiresAt * 1_000,
      ).toISOString(),
      grant_expires_at: new Date(grantExpiresAt * 1_000).toISOString(),
      view_count: result.admission.viewCount,
      max_views: result.admission.maxViews,
    },
    {
      status: reused ? 200 : 201,
      headers: { "Set-Cookie": cookie },
    },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    return await admit(request, context);
  } catch {
    return reviewBackendUnavailable();
  }
}

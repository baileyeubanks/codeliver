import { parseExternalReviewEditDecision } from "@/lib/edit-decisions";
import {
  authorizeAdmittedReviewInvite,
  reserveReviewActionRate,
} from "@/lib/review/admission-authority";
import { inviteCanComment } from "@/lib/review-invites";
import {
  readReviewJsonObject,
  validateReviewMutationRequest,
  validateReviewReadRequest,
} from "@/lib/review/request-boundary";
import {
  reviewBackendUnavailable,
  reviewError as reviewResponseError,
  reviewJson,
} from "@/lib/review/responses";
import { getSupabase } from "@/lib/supabase";
import type { Version } from "@/lib/types/codeliver";
import { resolveAssetVersion } from "@/lib/versions";

const EXTERNAL_DECISION_SELECTION =
  "id, asset_id, version_id, review_invite_id, created_by_name, decision_type, source, status, start_seconds, end_seconds, label, confidence, client_request_id, created_at, updated_at";
const EDIT_DECISION_BODY_LIMIT_BYTES = 16 * 1_024;

function projectExternalDecision(
  decision: Record<string, unknown>,
) {
  return {
    id: decision.id,
    asset_id: decision.asset_id,
    version_id: decision.version_id,
    created_by_name: decision.created_by_name,
    decision_type: decision.decision_type,
    source: decision.source,
    status: decision.status,
    start_seconds: decision.start_seconds,
    end_seconds: decision.end_seconds,
    label: decision.label,
    confidence: decision.confidence,
    created_at: decision.created_at,
    updated_at: decision.updated_at,
  };
}

function projectExternalReviewVersion(
  version: Version,
  admissionId: string,
) {
  return {
    id: version.id,
    asset_id: version.asset_id,
    version_number: version.version_number,
    file_url: `/api/review/media/${admissionId}`,
    file_size: version.file_size,
    thumbnail_url: null,
    duration_seconds: version.duration_seconds,
    resolution: version.resolution,
    is_current: version.is_current,
    created_at: version.created_at,
  };
}

function externalReviewerName(input: unknown, fallback: string | null) {
  const requested = typeof input === "string" ? input.trim() : "";
  return (requested || fallback || "Client reviewer").slice(0, 120);
}

function reviewError(
  error: string,
  status: number,
  code = "REVIEW_REQUEST_INVALID",
  headers?: HeadersInit,
) {
  if (status >= 500) return reviewBackendUnavailable(headers);
  return reviewResponseError(error, code, status, headers);
}

async function getEditDecisions(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const boundary = validateReviewReadRequest(req);
  if (!boundary.ok) {
    return reviewError(
      "Review edit-decision request is not allowed",
      boundary.status,
      boundary.code,
    );
  }

  const { token } = await params;
  const authority = await authorizeAdmittedReviewInvite(req, token);
  if (!authority.ok) {
    return reviewError(
      "Review link is unavailable",
      authority.status,
      authority.code,
    );
  }
  const responseHeaders = { "Set-Cookie": authority.setCookie };
  const { invite } = authority;
  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });

  if (!versionLookup.ok) {
    return reviewError(
      versionLookup.error,
      versionLookup.status,
      "REVIEW_VERSION_UNAVAILABLE",
      responseHeaders,
    );
  }

  const { data, error } = await getSupabase()
    .from("edit_decisions")
    .select(EXTERNAL_DECISION_SELECTION)
    .eq("asset_id", invite.asset_id)
    .eq("version_id", versionLookup.version.id)
    .or(`review_invite_id.eq.${invite.id},status.in.(accepted,applied)`)
    .order("start_seconds", { ascending: true });

  if (error) return reviewBackendUnavailable(responseHeaders);

  return reviewJson({
    items: (data ?? []).map((decision) =>
      projectExternalDecision(decision)
    ),
    version: projectExternalReviewVersion(
      versionLookup.version,
      authority.claims.admissionId,
    ),
  }, { headers: responseHeaders });
}

async function postEditDecision(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const boundary = validateReviewMutationRequest(req, {
    maxBytes: EDIT_DECISION_BODY_LIMIT_BYTES,
  });
  if (!boundary.ok) {
    return reviewError(
      "Review edit-decision request is not allowed",
      boundary.status,
      boundary.code,
    );
  }

  const { token } = await params;
  const authority = await authorizeAdmittedReviewInvite(req, token);
  if (!authority.ok) {
    return reviewError(
      "Review link is unavailable",
      authority.status,
      authority.code,
    );
  }
  const responseHeaders = { "Set-Cookie": authority.setCookie };
  const rate = await reserveReviewActionRate({
    token,
    claims: authority.claims,
    action: "edit_decision",
  });
  if (!rate.ok) {
    return reviewError(
      rate.status === 429
        ? "Review edit-decision rate exceeded"
        : "Review link is unavailable",
      rate.status,
      rate.code,
      {
        ...responseHeaders,
        ...(rate.status === 429
          ? {
              "Retry-After": String(
                Math.max(1, rate.retryAfterSeconds ?? 60),
              ),
            }
          : {}),
      },
    );
  }
  const bodyResult = await readReviewJsonObject(req, {
    maxBytes: EDIT_DECISION_BODY_LIMIT_BYTES,
  });
  if (!bodyResult.ok) {
    return reviewError(
      bodyResult.status === 413
        ? "Edit-decision request is too large"
        : "Edit-decision request must be JSON",
      bodyResult.status,
      bodyResult.code,
      responseHeaders,
    );
  }
  const body = bodyResult.value;
  const parsed = parseExternalReviewEditDecision(body);

  if (!parsed.ok) {
    return reviewError(
      parsed.error,
      parsed.status ?? 400,
      "REVIEW_REQUEST_INVALID",
      responseHeaders,
    );
  }

  const { invite } = authority;
  if (!inviteCanComment(invite)) {
    return reviewError(
      "This review link cannot add edit decisions",
      403,
      "REVIEW_EDIT_DECISION_FORBIDDEN",
      responseHeaders,
    );
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });

  if (!versionLookup.ok) {
    return reviewError(
      versionLookup.error,
      versionLookup.status,
      "REVIEW_VERSION_UNAVAILABLE",
      responseHeaders,
    );
  }

  const supabase = getSupabase();
  const existing = await supabase
    .from("edit_decisions")
    .select(EXTERNAL_DECISION_SELECTION)
    .eq("version_id", versionLookup.version.id)
    .eq("review_invite_id", invite.id)
    .eq("client_request_id", parsed.value.client_request_id)
    .maybeSingle();

  if (existing.error) {
    return reviewBackendUnavailable(responseHeaders);
  }

  if (existing.data) {
    return reviewJson(
      projectExternalDecision(existing.data),
      { headers: responseHeaders },
    );
  }

  const reviewerName = externalReviewerName(
    body && typeof body === "object" ? (body as Record<string, unknown>).reviewer_name : null,
    invite.reviewer_name || invite.reviewer_email,
  );
  const { data, error } = await supabase
    .from("edit_decisions")
    .insert({
      asset_id: invite.asset_id,
      version_id: versionLookup.version.id,
      review_invite_id: invite.id,
      created_by: null,
      created_by_name: reviewerName,
      ...parsed.value,
      status: "proposed",
      metadata: {
        ...parsed.value.metadata,
        entry_surface: "public_review",
      },
    })
    .select(EXTERNAL_DECISION_SELECTION)
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicate = await supabase
        .from("edit_decisions")
        .select(EXTERNAL_DECISION_SELECTION)
        .eq("version_id", versionLookup.version.id)
        .eq("review_invite_id", invite.id)
        .eq("client_request_id", parsed.value.client_request_id)
        .single();

      if (duplicate.data) {
        return reviewJson(
          projectExternalDecision(duplicate.data),
          { headers: responseHeaders },
        );
      }

      return reviewError(
        "This edit-decision request ID is already in use",
        409,
        "REVIEW_EDIT_DECISION_CONFLICT",
        responseHeaders,
      );
    }

    return reviewBackendUnavailable(responseHeaders);
  }

  const projectId = invite.assets?.projects?.id ?? null;
  await supabase.from("activity_log").insert({
    project_id: projectId,
    asset_id: invite.asset_id,
    actor_id: null,
    actor_name: reviewerName,
    action: "proposed_edit_decision",
    details: {
      decision_id: data.id,
      decision_type: data.decision_type,
      start_seconds: data.start_seconds,
      version_id: data.version_id,
      via: "review_link",
    },
  });

  return reviewJson(
    data ? projectExternalDecision(data) : {},
    { status: 201, headers: responseHeaders },
  );
}

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return await getEditDecisions(req, context);
  } catch {
    return reviewBackendUnavailable();
  }
}

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return await postEditDecision(req, context);
  } catch {
    return reviewBackendUnavailable();
  }
}

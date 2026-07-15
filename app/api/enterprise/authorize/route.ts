import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  evaluateEnterpriseAuthorization,
  isEnterpriseRole,
  MAX_ENTERPRISE_AUTHORIZATION_BODY_BYTES,
  parseEnterpriseAuthorizationJson,
  type EnterpriseAuthorizationDecision,
} from "@/lib/enterprise/authorization";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = randomUUID();
  const headers = responseHeaders(requestId);
  const { user, supabase } = await requireAuthWithClient();

  if (!user) {
    auditFailure(requestId, "UNAUTHENTICATED");
    return NextResponse.json(
      {
        error: "Authentication is required",
        reason: "UNAUTHENTICATED",
        recovery: "Sign in and retry the same read-only authorization request.",
        requestId,
      },
      { status: 401, headers },
    );
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    auditFailure(requestId, "UNSUPPORTED_MEDIA_TYPE");
    return NextResponse.json(
      {
        error: "Content-Type must be application/json",
        reason: "UNSUPPORTED_MEDIA_TYPE",
        recovery: "Retry with Content-Type: application/json.",
        requestId,
      },
      { status: 415, headers },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_ENTERPRISE_AUTHORIZATION_BODY_BYTES
  ) {
    auditFailure(requestId, "BODY_TOO_LARGE");
    return NextResponse.json(
      {
        error: "Request body is too large",
        reason: "BODY_TOO_LARGE",
        recovery: `Reduce the UTF-8 request body to ${MAX_ENTERPRISE_AUTHORIZATION_BODY_BYTES} bytes or fewer.`,
        requestId,
      },
      { status: 413, headers },
    );
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    auditFailure(requestId, "REQUEST_BODY_UNREADABLE");
    return NextResponse.json(
      {
        error: "Request body could not be read",
        reason: "REQUEST_BODY_UNREADABLE",
        recovery: "Retry with a complete application/json request body.",
        requestId,
      },
      { status: 400, headers },
    );
  }

  const parsed = parseEnterpriseAuthorizationJson(text);
  if (!parsed.ok) {
    auditFailure(requestId, parsed.reason);
    const status = parsed.reason === "BODY_TOO_LARGE" ? 413 : 400;
    return NextResponse.json(
      {
        error:
          parsed.reason === "BODY_TOO_LARGE"
            ? "Request body is too large"
            : parsed.reason === "MALFORMED_JSON"
              ? "Request body must be valid JSON"
              : "Enterprise authorization request is invalid",
        reason: parsed.reason,
        issues: parsed.issues,
        recovery:
          parsed.reason === "BODY_TOO_LARGE"
            ? `Reduce the UTF-8 request body to ${MAX_ENTERPRISE_AUTHORIZATION_BODY_BYTES} bytes or fewer.`
            : "Correct the reported request issues and retry with a new payload-bound idempotency key.",
        requestId,
      },
      { status, headers },
    );
  }

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", parsed.value.tenantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    auditFailure(requestId, "MEMBERSHIP_LOOKUP_FAILED");
    return NextResponse.json(
      {
        error: "Authorization could not be evaluated",
        reason: "MEMBERSHIP_LOOKUP_FAILED",
        recovery: "Retry later; if the problem continues, provide this request id to support.",
        requestId,
      },
      { status: 503, headers },
    );
  }

  if (!membership || !isEnterpriseRole(membership.role)) {
    auditFailure(requestId, "TENANT_MEMBERSHIP_REQUIRED");
    return NextResponse.json(
      {
        error: "Tenant membership is required",
        reason: "TENANT_MEMBERSHIP_REQUIRED",
        recovery: "Select a tenant where you have an active membership or ask a tenant owner for access.",
        requestId,
      },
      { status: 403, headers },
    );
  }

  const decision = evaluateEnterpriseAuthorization(
    parsed.value,
    {
      id: user.id,
      tenantId: parsed.value.tenantId,
      role: membership.role,
    },
    { requestId },
  );

  auditDecision(decision);
  headers.set("X-Enterprise-Decision-Id", decision.decisionId);

  if (decision.effect === "deny") {
    return NextResponse.json(
      {
        error: "Authorization denied",
        recovery: recoveryForDecision(decision.reason),
        decision,
      },
      { status: denialStatus(decision.reason), headers },
    );
  }

  return NextResponse.json({ decision }, { status: 200, headers });
}

function recoveryForDecision(
  reason: EnterpriseAuthorizationDecision["reason"],
): string {
  switch (reason) {
    case "INVALID_POLICY_CONFIGURATION":
      return "Provide the request id to an operator; authorization remains disabled until a registered policy version is selected.";
    case "TENANT_MISMATCH":
      return "Use one tenant consistently for the request, target, and authenticated membership.";
    case "STALE_POLICY_VERSION":
      return "Refresh policy metadata, rebuild the payload, and generate its new idempotency key before retrying.";
    case "IDEMPOTENCY_KEY_MISMATCH":
      return "Recompute the SHA-256 idempotency key from the exact canonical request payload before retrying.";
    case "TARGET_ACTION_MISMATCH":
      return "Use an identity target for identity actions and a tenant target for governance or tenant actions.";
    case "OWNER_SELF_MUTATION":
      return "Ask another tenant owner to perform the role change through an approved mutation workflow.";
    case "PERMISSION_DENIED":
      return "Ask a tenant owner for the required permission; do not retry unchanged.";
    case "ALLOWED":
      return "No recovery is required.";
  }
}

function denialStatus(reason: EnterpriseAuthorizationDecision["reason"]): number {
  if (
    reason === "STALE_POLICY_VERSION" ||
    reason === "IDEMPOTENCY_KEY_MISMATCH"
  ) {
    return 409;
  }
  if (reason === "INVALID_POLICY_CONFIGURATION") return 503;
  return 403;
}

function responseHeaders(requestId: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  });
}

function auditDecision(decision: EnterpriseAuthorizationDecision): void {
  console.info(
    JSON.stringify({
      event: "enterprise.authorization.decision",
      requestId: decision.observability.requestId,
      decisionId: decision.decisionId,
      effect: decision.effect,
      reason: decision.reason,
      tenantId: decision.binding.tenantId,
      actorId: decision.actor.subjectId,
      actorRole: decision.actor.role,
      action: decision.action,
      policyVersion: decision.binding.policyVersion,
    }),
  );
}

function auditFailure(requestId: string, reason: string): void {
  console.warn(
    JSON.stringify({
      event: "enterprise.authorization.rejected",
      requestId,
      reason,
    }),
  );
}

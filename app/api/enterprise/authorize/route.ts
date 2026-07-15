import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  evaluateEnterpriseAuthorization,
  isEnterpriseRole,
  parseEnterpriseAuthorizationRequest,
  type EnterpriseAuthorizationDecision,
} from "@/lib/enterprise/authorization";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const requestId = randomUUID();
  const headers = responseHeaders(requestId);
  const { user, supabase } = await requireAuthWithClient();

  if (!user) {
    auditFailure(requestId, "UNAUTHENTICATED");
    return NextResponse.json(
      { error: "Authentication is required", reason: "UNAUTHENTICATED", requestId },
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
        requestId,
      },
      { status: 415, headers },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    auditFailure(requestId, "BODY_TOO_LARGE");
    return NextResponse.json(
      { error: "Request body is too large", reason: "BODY_TOO_LARGE", requestId },
      { status: 413, headers },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      auditFailure(requestId, "BODY_TOO_LARGE");
      return NextResponse.json(
        { error: "Request body is too large", reason: "BODY_TOO_LARGE", requestId },
        { status: 413, headers },
      );
    }
    body = JSON.parse(text) as unknown;
  } catch {
    auditFailure(requestId, "MALFORMED_JSON");
    return NextResponse.json(
      { error: "Request body must be valid JSON", reason: "MALFORMED_JSON", requestId },
      { status: 400, headers },
    );
  }

  const parsed = parseEnterpriseAuthorizationRequest(body);
  if (!parsed.ok) {
    auditFailure(requestId, "INVALID_REQUEST");
    return NextResponse.json(
      {
        error: "Enterprise authorization request is invalid",
        reason: "INVALID_REQUEST",
        issues: parsed.issues,
        requestId,
      },
      { status: 400, headers },
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
      { error: "Authorization denied", decision },
      { status: denialStatus(decision.reason), headers },
    );
  }

  return NextResponse.json({ decision }, { status: 200, headers });
}

function denialStatus(reason: EnterpriseAuthorizationDecision["reason"]): number {
  if (
    reason === "STALE_POLICY_VERSION" ||
    reason === "IDEMPOTENCY_KEY_MISMATCH"
  ) {
    return 409;
  }
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

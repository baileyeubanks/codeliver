import { NextResponse } from "next/server";
import {
  DEFAULT_EVENT_READ_LIMIT,
  parseCollaborationScope,
} from "@/lib/collaboration/control-plane";
import { authorizationProblemResponse, problemResponse, requestTraceId } from "@/lib/collaboration/http";
import { authorizeCollaborationScope, getCollaborationControlPlane } from "@/lib/collaboration/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = requestTraceId(request);
  const { searchParams } = new URL(request.url);
  const knownKeys = new Set([
    "tenantId",
    "projectId",
    "assetId",
    "assetVersionId",
    "afterSequence",
    "limit",
  ]);
  if (Array.from(searchParams.keys()).some((key) => !knownKeys.has(key))) {
    return problemResponse({
      code: "invalid_request",
      status: 400,
      message: "The event read query contains unsupported parameters.",
      recovery: "Remove unsupported query parameters and retry the event read.",
      traceId,
      retryable: false,
    });
  }

  const scope = parseCollaborationScope({
    tenantId: searchParams.get("tenantId"),
    projectId: searchParams.get("projectId"),
    assetId: searchParams.get("assetId"),
    assetVersionId: searchParams.get("assetVersionId"),
  });
  if (!scope.ok) return problemResponse({ ...scope.problem, traceId });

  const afterSequence = Number(searchParams.get("afterSequence") ?? 0);
  const limit = Number(searchParams.get("limit") ?? DEFAULT_EVENT_READ_LIMIT);
  const authorization = await authorizeCollaborationScope(scope.value);
  if (!authorization.ok) return authorizationProblemResponse(authorization, traceId);

  const result = getCollaborationControlPlane().readEvents(
    scope.value,
    afterSequence,
    limit,
    authorization.principal,
    authorization.resource,
    traceId,
  );
  if (!result.ok) return problemResponse(result.problem);

  return NextResponse.json(result.value, {
    headers: { "cache-control": "no-store", "x-request-id": traceId },
  });
}

import { NextResponse } from "next/server";
import { problemResponse, authorizationProblemResponse, requestTraceId } from "@/lib/collaboration/http";
import { parseCollaborationCommand } from "@/lib/collaboration/control-plane";
import { authorizeCollaborationScope, getCollaborationControlPlane } from "@/lib/collaboration/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMMAND_BYTES = 32_768;

export async function POST(request: Request) {
  const traceId = requestTraceId(request);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COMMAND_BYTES) {
    return problemResponse({
      code: "invalid_request",
      status: 413,
      message: `Collaboration commands cannot exceed ${MAX_COMMAND_BYTES} bytes.`,
      recovery: `Reduce the JSON request to ${MAX_COMMAND_BYTES} bytes or fewer.`,
      traceId,
      retryable: false,
    });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_COMMAND_BYTES) throw new Error("payload_too_large");
    body = JSON.parse(text) as unknown;
  } catch {
    return problemResponse({
      code: "invalid_request",
      status: 400,
      message: "The request body must be valid, bounded JSON.",
      recovery: "Send a valid JSON command that uses only the documented fields.",
      traceId,
      retryable: false,
    });
  }

  const command = parseCollaborationCommand(body, traceId);
  if (!command.ok) return problemResponse(command.problem);

  const authorization = await authorizeCollaborationScope(command.value.scope);
  if (!authorization.ok) return authorizationProblemResponse(authorization, traceId);

  const result = getCollaborationControlPlane().execute(
    command.value,
    authorization.principal,
    authorization.resource,
    traceId,
  );
  if (!result.ok) return problemResponse(result.problem);

  return NextResponse.json(
    { receipt: result.value },
    {
      status: result.value.duplicate ? 200 : 201,
      headers: { "cache-control": "no-store", "x-request-id": traceId },
    },
  );
}

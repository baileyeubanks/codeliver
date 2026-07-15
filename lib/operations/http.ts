import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveOperationsAuthority } from "./authorization";
import {
  OPERATIONS_LIMITS,
  OperationsError,
  parseEnvelope,
  type OperationObservation,
  type OperationsAuthority,
} from "./contracts";

type AuthorizedRequest =
  | { ok: true; authority: OperationsAuthority; input: unknown }
  | { ok: false; response: NextResponse };

export async function authorizeOperationsRequest(
  request: NextRequest,
): Promise<AuthorizedRequest> {
  const user = await requireAuth();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication is required." } },
        { status: 401 },
      ),
    };
  }

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > OPERATIONS_LIMITS.maximumRequestBytes) {
      throw new OperationsError("LIMIT_EXCEEDED", "Request body is too large.", 413);
    }
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > OPERATIONS_LIMITS.maximumRequestBytes) {
      throw new OperationsError("LIMIT_EXCEEDED", "Request body is too large.", 413);
    }
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      throw new OperationsError("INVALID_REQUEST", "Request body must be valid JSON.");
    }
    const envelope = parseEnvelope(input);
    const authority = await resolveOperationsAuthority(user.id, envelope.tenantId);
    if (!authority) {
      throw new OperationsError(
        "FORBIDDEN",
        "No server-derived role grants access to this tenant.",
        403,
      );
    }
    return { ok: true, authority, input };
  } catch (error) {
    return { ok: false, response: operationsErrorResponse(error) };
  }
}
export function operationsErrorResponse(error: unknown): NextResponse {
  if (error instanceof OperationsError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error(JSON.stringify({
    event: "enterprise_operation_failed",
    code: "INTERNAL_ERROR",
  }));
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "The operation failed closed." } },
    { status: 500 },
  );
}

export function emitOperationObservation(observation: OperationObservation): void {
  // Tenant and actor identifiers are one-way references; payloads and secrets are never logged.
  console.info(JSON.stringify(observation));
}

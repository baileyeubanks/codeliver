import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getTeamRole } from "@/lib/middleware/rbac";
import type { CatalogPrincipal } from "./contracts";
import {
  asCatalogError,
  catalogRecoveryGuidance,
  CatalogError,
} from "./errors";

const MAX_BODY_BYTES = 64 * 1_024;

export async function readCatalogJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new CatalogError("invalid_request", "Catalog request bodies cannot exceed 64 KiB.", 413);
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new CatalogError("invalid_request", "Catalog request bodies cannot exceed 64 KiB.", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CatalogError("invalid_request", "The request body must contain valid JSON.", 400);
  }
}

export async function catalogPrincipal(
  user: User,
  tenantId: string,
): Promise<CatalogPrincipal> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(tenantId)) {
    throw new CatalogError("invalid_request", "tenantId is invalid.", 400);
  }
  const role = await getTeamRole(tenantId, user.id);
  if (!role) {
    throw new CatalogError("forbidden", "The authenticated user is not a member of this tenant.", 403);
  }
  return { actorId: user.id, tenantId, role };
}

export function catalogResponse(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function catalogUnauthorizedResponse(): NextResponse {
  return catalogResponse({
    error: {
      code: "unauthorized",
      message: "Authentication is required.",
      retryable: false,
      recovery: "Authenticate and select an authorized tenant before trying again.",
    },
  }, 401);
}

export function catalogErrorResponse(error: unknown): NextResponse {
  const catalogError = asCatalogError(error);
  const guidance = catalogRecoveryGuidance(catalogError);
  return catalogResponse({
    error: {
      code: catalogError.code,
      message: catalogError.message,
      ...guidance,
    },
  }, catalogError.status);
}

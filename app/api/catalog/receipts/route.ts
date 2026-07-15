import { requireAuthWithClient } from "@/lib/auth-client";
import {
  catalogErrorResponse,
  catalogPrincipal,
  catalogResponse,
  catalogUnauthorizedResponse,
} from "@/lib/catalog/http";
import { getCatalogRuntime } from "@/lib/catalog/runtime";

export async function GET(request: Request) {
  const { user } = await requireAuthWithClient();
  if (!user) return catalogUnauthorizedResponse();

  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") ?? "";
    const principal = await catalogPrincipal(user, tenantId);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? 100 : Number(rawLimit);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    return catalogResponse(getCatalogRuntime().service.audit(principal, limit, requestId));
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

import { requireAuthWithClient } from "@/lib/auth-client";
import {
  catalogErrorResponse,
  catalogPrincipal,
  catalogResponse,
  catalogUnauthorizedResponse,
  readCatalogJson,
} from "@/lib/catalog/http";
import { getCatalogRuntime } from "@/lib/catalog/runtime";
import { parseRevertInput } from "@/lib/catalog/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { user } = await requireAuthWithClient();
  if (!user) return catalogUnauthorizedResponse();

  try {
    const body = await readCatalogJson(request);
    const raw = body && typeof body === "object" && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>), operationId: (await params).operationId }
      : body;
    const input = parseRevertInput(raw);
    const principal = await catalogPrincipal(user, input.tenantId);
    const result = getCatalogRuntime().service.revert(principal, input);
    return catalogResponse(result);
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

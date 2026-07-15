import { requireAuthWithClient } from "@/lib/auth-client";
import {
  catalogErrorResponse,
  catalogPrincipal,
  catalogResponse,
  catalogUnauthorizedResponse,
  readCatalogJson,
} from "@/lib/catalog/http";
import { getCatalogRuntime } from "@/lib/catalog/runtime";
import { parseTransitionInput } from "@/lib/catalog/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { user } = await requireAuthWithClient();
  if (!user) return catalogUnauthorizedResponse();

  try {
    const body = await readCatalogJson(request);
    const raw = body && typeof body === "object" && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>), assetId: (await params).assetId }
      : body;
    const input = parseTransitionInput(raw);
    const principal = await catalogPrincipal(user, input.tenantId);
    const result = getCatalogRuntime().service.transition(principal, input);
    return catalogResponse(result);
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

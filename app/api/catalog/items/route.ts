import { requireAuthWithClient } from "@/lib/auth-client";
import { assertAccessibleVersionBinding } from "@/lib/catalog/asset-binding";
import {
  catalogErrorResponse,
  catalogPrincipal,
  catalogResponse,
  catalogUnauthorizedResponse,
  readCatalogJson,
} from "@/lib/catalog/http";
import { getCatalogRuntime } from "@/lib/catalog/runtime";
import { parseIngestInput } from "@/lib/catalog/validation";

export async function GET(request: Request) {
  const { user } = await requireAuthWithClient();
  if (!user) return catalogUnauthorizedResponse();

  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") ?? "";
    const principal = await catalogPrincipal(user, tenantId);
    const rawLimit = url.searchParams.get("limit");
    const result = getCatalogRuntime().service.discover(principal, {
      tenantId,
      query: url.searchParams.get("q") ?? "",
      tags: url.searchParams.getAll("tag"),
      lifecycleState: url.searchParams.get("state"),
      limit: rawLimit === null ? undefined : Number(rawLimit),
      cursor: url.searchParams.get("cursor"),
      requestId: request.headers.get("x-request-id") ?? undefined,
    });
    return catalogResponse(result);
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return catalogUnauthorizedResponse();

  try {
    const body = await readCatalogJson(request);
    const input = parseIngestInput(body);
    const principal = await catalogPrincipal(user, input.tenantId);
    await assertAccessibleVersionBinding(supabase, input.version);
    const result = getCatalogRuntime().service.ingest(principal, input);
    return catalogResponse(result, result.receipt.outcome === "applied" && result.item.revision === 1 ? 201 : 200);
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

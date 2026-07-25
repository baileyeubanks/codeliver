import { requireAuth } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import { getExternalNotificationAdapters } from "@/lib/notifications/adapters";
import { executeShareManifest } from "@/lib/sharing/share-api";
import {
  parseBatchShareManifest,
  SHARE_MANIFEST_MAX_ITEMS,
  SHARE_POLICY_TEMPLATES,
} from "@/lib/sharing/share-manifest";
import { getSupabase } from "@/lib/supabase";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { withAssetRouteBoundary } from "../asset-route-boundary";

async function GETHandler() {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  return apiJson({
    tenant_id: user.id,
    max_items: SHARE_MANIFEST_MAX_ITEMS,
    policy_templates: Object.values(SHARE_POLICY_TEMPLATES).map((policy) => ({
      ...policy,
      tenant_id: user.id,
    })),
    notification_channels: getExternalNotificationAdapters().map((adapter) => ({
      channel: adapter.channel,
      provider: adapter.provider,
      configured: adapter.configured,
    })),
  });
}

async function POSTHandler(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const body = await req.json().catch(() => null);
  const parsed = parseBatchShareManifest(body, { authenticatedTenantId: user.id });
  if (!parsed.ok) {
    return apiError(parsed.error, "INVALID_REQUEST", 400);
  }

  const result = await executeShareManifest({
    manifest: parsed.value,
    user,
    client: getSupabase(),
    baseUrl: getBaseUrl(),
    adapters: getExternalNotificationAdapters(),
  });
  const headers = new Headers();
  const retryAfter = (result.body as Record<string, unknown>).retry_after_seconds;
  if (typeof retryAfter === "number") headers.set("Retry-After", String(retryAfter));
  const metrics = (result.body as { metrics?: { duration_ms?: unknown } }).metrics;
  if (typeof metrics?.duration_ms === "number") {
    headers.set("Server-Timing", `cco-batch-sharing;dur=${metrics.duration_ms}`);
  }
  return apiJson(result.body as Record<string, unknown>, { status: result.status, headers });
}

export const GET = withAssetRouteBoundary(GETHandler);
export const POST = withAssetRouteBoundary(POSTHandler);

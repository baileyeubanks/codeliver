import { NextResponse } from "next/server";
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

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
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

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseBatchShareManifest(body, { authenticatedTenantId: user.id });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field, mutation_performed: false },
      { status: 400 },
    );
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
  return NextResponse.json(result.body, { status: result.status, headers });
}

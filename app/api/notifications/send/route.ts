import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
} from "@/lib/data-authority";
import { getBaseUrl } from "@/lib/email";
import {
  createInAppNotificationAdapter,
  getExternalNotificationAdapters,
} from "@/lib/notifications/adapters";
import { parseNotificationRequest } from "@/lib/notifications/authority";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/preferences";
import { dispatchAuditedNotification } from "@/lib/notifications/server-delivery";
import {
  dispatchDurableNotification,
  isNotificationQueueFailure,
} from "@/lib/notifications/transactional";
import { tenantAuthorityKey } from "@/lib/tenant-authority";

type NotificationClient = Parameters<typeof dispatchAuditedNotification>[0]["client"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET() {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = supabase as unknown as NotificationClient;
  const channels =
    getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA
      ? [
          {
            channel: "in_app",
            provider: "supabase-notifications",
            configured: true,
          },
          { channel: "email", provider: "durable-outbox", configured: true },
          { channel: "sms", provider: "durable-outbox", configured: false },
          {
            channel: "imessage",
            provider: "durable-outbox",
            configured: false,
          },
        ]
      : [
          createInAppNotificationAdapter({
            client,
            authenticatedUserId: user.id,
          }),
          ...getExternalNotificationAdapters(),
        ].map((adapter) => ({
          channel: adapter.channel,
          provider: adapter.provider,
          configured: adapter.configured,
        }));
  const tenantId = tenantAuthorityKey("personal", user.id);
  return NextResponse.json({
    tenant_id: tenantId,
    preview_safe: true,
    live_send_requires: ["action=send", "confirm_live_send=true", "idempotency_key"],
    channels,
  });
}

export async function POST(req: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = supabase as unknown as NotificationClient;

  const body = await req.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }

  const recipient = isRecord(body.recipient) ? body.recipient : {};
  if (
    Array.isArray(body.channels) &&
    body.channels.some((channel) => channel === "sms" || channel === "imessage")
  ) {
    return NextResponse.json(
      { error: "SMS and iMessage authority is available only from an explicit share recipient contract" },
      { status: 400 },
    );
  }
  if (recipient.user_id != null && recipient.user_id !== user.id) {
    return NextResponse.json(
      { error: "This endpoint can only send to the authenticated user's verified identity" },
      { status: 403 },
    );
  }

  const verifiedEmail = user.email ?? null;
  const tenantId = tenantAuthorityKey("personal", user.id);
  if (
    recipient.email != null &&
    (typeof recipient.email !== "string" ||
      !verifiedEmail ||
      recipient.email.trim().toLowerCase() !== verifiedEmail.trim().toLowerCase())
  ) {
    return NextResponse.json(
      { error: "recipient.email does not match the authenticated user's verified email" },
      { status: 403 },
    );
  }

  const normalizedInput = {
    ...body,
    tenant_id: tenantId,
    recipient: {
      ...recipient,
      user_id: user.id,
      email: verifiedEmail,
      phone: null,
      imessage_handle: null,
    },
  };
  const parsed = parseNotificationRequest(normalizedInput, {
    authenticatedTenantId: tenantId,
    allowedOrigin: getBaseUrl(),
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, field: parsed.field, mutation_performed: false },
      { status: 400 },
    );
  }
  if (!(NOTIFICATION_EVENT_TYPES as readonly string[]).includes(parsed.value.eventType)) {
    return NextResponse.json(
      { error: "event_type is not supported by the in-app notification contract" },
      { status: 400 },
    );
  }

  const preference = await client
    .from("notification_preferences")
    .select("email_enabled, email_frequency, in_app_enabled")
    .eq("user_id", user.id)
    .eq("event_type", parsed.value.eventType)
    .limit(1)
    .maybeSingle();
  if (preference.error) {
    return NextResponse.json(
      { error: "Notification preferences could not be verified; no notification was sent" },
      { status: 503 },
    );
  }
  const emailInstant =
    preference.data?.email_enabled === true && preference.data.email_frequency === "instant";
  const preferenceEnabled = {
    in_app: preference.data?.in_app_enabled ?? true,
    email: preference.data ? emailInstant : false,
  };
  const result =
    getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA
      ? await dispatchDurableNotification({
          request: parsed.value,
          client,
          actorId: user.id,
          actorName: user.email ?? "Co-VideoPro user",
          preferenceEnabled,
        })
      : await dispatchAuditedNotification({
          request: parsed.value,
          client,
          adapters: [
            createInAppNotificationAdapter({
              client,
              authenticatedUserId: user.id,
            }),
            ...getExternalNotificationAdapters(),
          ],
          actorId: user.id,
          actorName: user.email ?? "Co-VideoPro user",
          preferenceEnabled,
        });

  if (isNotificationQueueFailure(result)) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 503 },
    );
  }

  if (!result.ok) {
    const headers = new Headers();
    if ("retry_after_seconds" in result && typeof result.retry_after_seconds === "number") {
      headers.set("Retry-After", String(result.retry_after_seconds));
    }
    return NextResponse.json(result, { status: result.status, headers });
  }
  return NextResponse.json(result, {
    status: result.mode === "queued" ? 202 : 200,
  });
}

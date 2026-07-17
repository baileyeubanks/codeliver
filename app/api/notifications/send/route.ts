import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import {
  createInAppNotificationAdapter,
  getExternalNotificationAdapters,
} from "@/lib/notifications/adapters";
import { parseNotificationRequest } from "@/lib/notifications/authority";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/preferences";
import { dispatchAuditedNotification } from "@/lib/notifications/server-delivery";
import { getSupabase } from "@/lib/supabase";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = getSupabase();
  const adapters = [
    createInAppNotificationAdapter({ client, authenticatedUserId: user.id }),
    ...getExternalNotificationAdapters(),
  ];
  return NextResponse.json({
    tenant_id: user.id,
    preview_safe: true,
    live_send_requires: ["action=send", "confirm_live_send=true", "idempotency_key"],
    channels: adapters.map((adapter) => ({
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

  const client = getSupabase();
  const identity = await client.auth.admin.getUserById(user.id);
  if (identity.error || !identity.data.user) {
    return NextResponse.json(
      { error: "Recipient identity could not be verified; no notification was sent" },
      { status: 503 },
    );
  }
  const verifiedEmail = identity.data.user.email ?? user.email ?? null;
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
    tenant_id: user.id,
    recipient: {
      ...recipient,
      user_id: user.id,
      email: verifiedEmail,
      phone: null,
      imessage_handle: null,
    },
  };
  const parsed = parseNotificationRequest(normalizedInput, {
    authenticatedTenantId: user.id,
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
  const adapters = [
    createInAppNotificationAdapter({ client, authenticatedUserId: user.id }),
    ...getExternalNotificationAdapters(),
  ];
  const result = await dispatchAuditedNotification({
    request: parsed.value,
    client,
    adapters,
    actorId: user.id,
    actorName: user.email ?? "Webster user",
    preferenceEnabled,
  });

  if (!result.ok) {
    const headers = new Headers();
    if ("retry_after_seconds" in result && typeof result.retry_after_seconds === "number") {
      headers.set("Retry-After", String(result.retry_after_seconds));
    }
    return NextResponse.json(result, { status: result.status, headers });
  }
  return NextResponse.json(result);
}

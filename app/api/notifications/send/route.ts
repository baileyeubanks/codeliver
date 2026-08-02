import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { getBaseUrl } from "@/lib/email";
import {
  createInAppNotificationAdapter,
  getExternalNotificationAdapters,
} from "@/lib/notifications/adapters";
import { parseNotificationRequest } from "@/lib/notifications/authority";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/preferences";
import { dispatchAuditedNotification } from "@/lib/notifications/server-delivery";

async function getSession() {
  try {
    const session = await requireAuthWithClient();
    return session.user ? session : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
  } catch (error) {
    return { response: isBackendUnavailableError(error) ? backendUnavailable() : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET() {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase: client } = session;
  const user = session.user!;
  try {
    const adapters = [
      createInAppNotificationAdapter({ client: client as never, authenticatedUserId: user.id }),
      ...getExternalNotificationAdapters(),
    ];
    return apiJson({
      tenant_id: user.id,
      preview_safe: true,
      live_send_requires: ["action=send", "confirm_live_send=true", "idempotency_key"],
      channels: adapters.map((adapter) => ({
        channel: adapter.channel,
        provider: adapter.provider,
        configured: adapter.configured,
      })),
    });
  } catch {
    return backendUnavailable();
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase: client } = session;
  const user = session.user!;

  const body = await req.json().catch(() => null);
  if (!isRecord(body)) {
    return apiError("A JSON object is required", "INVALID_REQUEST", 400);
  }

  const recipient = isRecord(body.recipient) ? body.recipient : {};
  if (
    Array.isArray(body.channels) &&
    body.channels.some((channel) => channel === "sms" || channel === "imessage")
  ) {
    return apiError("SMS and iMessage authority is available only from an explicit share recipient contract", "INVALID_REQUEST", 400);
  }
  if (recipient.user_id != null && recipient.user_id !== user.id) {
    return apiError("This endpoint can only send to the authenticated user's verified identity", "FORBIDDEN", 403);
  }

  let identity;
  try {
    identity = await client.auth.admin.getUserById(user.id);
  } catch {
    return backendUnavailable();
  }
  if (identity.error || !identity.data.user) {
    return apiError("Recipient identity could not be verified; no notification was sent", "BACKEND_UNAVAILABLE", 503);
  }
  const verifiedEmail = identity.data.user.email ?? user.email ?? null;
  if (
    recipient.email != null &&
    (typeof recipient.email !== "string" ||
      !verifiedEmail ||
      recipient.email.trim().toLowerCase() !== verifiedEmail.trim().toLowerCase())
  ) {
    return apiError("recipient.email does not match the authenticated user's verified email", "FORBIDDEN", 403);
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
    return apiJson({ error: parsed.error, code: "INVALID_REQUEST", field: parsed.field, mutation_performed: false }, { status: 400 });
  }
  if (!(NOTIFICATION_EVENT_TYPES as readonly string[]).includes(parsed.value.eventType)) {
    return apiError("event_type is not supported by the in-app notification contract", "INVALID_REQUEST", 400);
  }

  let preference;
  try {
    preference = await client
      .from("notification_preferences")
      .select("email_enabled, email_frequency, in_app_enabled")
      .eq("user_id", user.id)
      .eq("event_type", parsed.value.eventType)
      .limit(1)
      .maybeSingle();
  } catch {
    return backendUnavailable();
  }
  if (preference.error) {
    return apiError("Notification preferences could not be verified; no notification was sent", "BACKEND_UNAVAILABLE", 503);
  }
  const emailInstant =
    preference.data?.email_enabled === true && preference.data.email_frequency === "instant";
  const preferenceEnabled = {
    in_app: preference.data?.in_app_enabled ?? true,
    email: preference.data ? emailInstant : false,
  };
  const adapters = [
    createInAppNotificationAdapter({ client: client as never, authenticatedUserId: user.id }),
    ...getExternalNotificationAdapters(),
  ];
  let result;
  try {
    result = await dispatchAuditedNotification({
      request: parsed.value,
      client: client as never,
      adapters,
      actorId: user.id,
      actorName: user.email ?? "Co-VideoPro user",
      preferenceEnabled,
    });
  } catch {
    return backendUnavailable();
  }

  if (!result.ok) {
    const headers = new Headers();
    if ("retry_after_seconds" in result && typeof result.retry_after_seconds === "number") {
      headers.set("Retry-After", String(result.retry_after_seconds));
    }
    return apiJson(result, { status: result.status, headers });
  }
  return apiJson(result);
}

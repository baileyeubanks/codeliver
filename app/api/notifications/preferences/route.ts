import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { getExternalNotificationAdapters } from "@/lib/notifications/adapters";
import {
  defaultNotificationPreference,
  NOTIFICATION_EVENT_TYPES,
  parseNotificationPreferences,
} from "@/lib/notifications/preferences";

async function getSession() {
  try {
    const session = await requireAuthWithClient();
    return session.user ? session : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
  } catch (error) {
    return { response: isBackendUnavailableError(error) ? backendUnavailable() : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503) };
  }
}

export async function GET() {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;

  let data;
  try {
    const result = await supabase
      .from("notification_preferences")
      .select("event_type, email_enabled, email_frequency, in_app_enabled")
      .eq("user_id", user.id);
    if (result.error) return backendUnavailable();
    data = result.data;
  } catch {
    return backendUnavailable();
  }

  const stored = new Map((data ?? []).map((row) => [row.event_type, row]));
  const preferences = Object.fromEntries(
    NOTIFICATION_EVENT_TYPES.map((eventType) => {
      const row = stored.get(eventType);
      return [
        eventType,
        row
          ? {
              email_enabled: row.email_enabled,
              email_frequency: row.email_frequency,
              in_app_enabled: row.in_app_enabled,
            }
          : defaultNotificationPreference(),
      ];
    }),
  );

  return apiJson({
    preferences,
    channels: {
      in_app: { configured: true, consent_required: false },
      email: {
        configured: getExternalNotificationAdapters().some(
          (adapter) => adapter.channel === "email" && adapter.configured,
        ),
        consent_required: false,
      },
      sms: { configured: false, preview_only: true, consent_required: true },
      imessage: { configured: false, preview_only: true, consent_required: true },
    },
  });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;

  const body = await req.json().catch(() => null);
  const preferencesInput =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).preferences
      : null;
  const parsed = parseNotificationPreferences(preferencesInput);
  if (!parsed.ok) {
    return apiError(parsed.error, "INVALID_REQUEST", 400);
  }

  const rows = Object.entries(parsed.value).map(([eventType, preference]) => ({
    user_id: user.id,
    event_type: eventType,
    email_enabled: preference.email_enabled,
    email_frequency: preference.email_frequency,
    in_app_enabled: preference.in_app_enabled,
  }));
  try {
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(rows, { onConflict: "user_id,event_type" });
    if (error) return backendUnavailable();
    return apiJson({ ok: true, updated: rows.length });
  } catch {
    return backendUnavailable();
  }
}

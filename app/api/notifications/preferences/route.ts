import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getExternalNotificationAdapters } from "@/lib/notifications/adapters";
import {
  defaultNotificationPreference,
  NOTIFICATION_EVENT_TYPES,
  parseNotificationPreferences,
} from "@/lib/notifications/preferences";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabase()
    .from("notification_preferences")
    .select("event_type, email_enabled, email_frequency, in_app_enabled")
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  return NextResponse.json({
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
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const preferencesInput =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).preferences
      : null;
  const parsed = parseNotificationPreferences(preferencesInput);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 });
  }

  const rows = Object.entries(parsed.value).map(([eventType, preference]) => ({
    user_id: user.id,
    event_type: eventType,
    email_enabled: preference.email_enabled,
    email_frequency: preference.email_frequency,
    in_app_enabled: preference.in_app_enabled,
  }));
  const { error } = await getSupabase()
    .from("notification_preferences")
    .upsert(rows, { onConflict: "user_id,event_type" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: rows.length });
}

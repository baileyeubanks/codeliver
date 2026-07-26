export const NOTIFICATION_EVENT_TYPES = [
  "comment_added",
  "comment_resolved",
  "comment_reply",
  "approval_requested",
  "approval_decided",
  "asset_uploaded",
  "version_uploaded",
  "share_link_viewed",
  "mention",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export type EmailFrequency = "instant" | "daily" | "weekly" | "off";

export interface NotificationPreferenceValue {
  email_enabled: boolean;
  email_frequency: EmailFrequency;
  in_app_enabled: boolean;
}

export function defaultNotificationPreference(): NotificationPreferenceValue {
  return { email_enabled: false, email_frequency: "off", in_app_enabled: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEventType(value: string): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

function isFrequency(value: unknown): value is EmailFrequency {
  return value === "instant" || value === "daily" || value === "weekly" || value === "off";
}

export function parseNotificationPreferences(input: unknown):
  | { ok: true; value: Partial<Record<NotificationEventType, NotificationPreferenceValue>> }
  | { ok: false; error: string; field?: string } {
  if (!isRecord(input)) return { ok: false, error: "preferences object is required" };

  const parsed: Partial<Record<NotificationEventType, NotificationPreferenceValue>> = {};
  for (const [eventType, rawPreference] of Object.entries(input)) {
    if (!isEventType(eventType)) {
      return { ok: false, error: "Unknown notification event type", field: eventType };
    }
    if (!isRecord(rawPreference)) {
      return { ok: false, error: "Preference must be an object", field: eventType };
    }
    if (
      typeof rawPreference.email_enabled !== "boolean" ||
      typeof rawPreference.in_app_enabled !== "boolean" ||
      !isFrequency(rawPreference.email_frequency)
    ) {
      return { ok: false, error: "Preference fields are invalid", field: eventType };
    }

    parsed[eventType] = {
      email_enabled: rawPreference.email_enabled,
      email_frequency: rawPreference.email_enabled ? rawPreference.email_frequency : "off",
      in_app_enabled: rawPreference.in_app_enabled,
    };
  }

  if (Object.keys(parsed).length === 0) {
    return { ok: false, error: "At least one preference is required" };
  }
  return { ok: true, value: parsed };
}

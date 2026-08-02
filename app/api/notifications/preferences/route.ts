import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getExternalNotificationAdapters } from "@/lib/notifications/adapters";
import {
  defaultNotificationPreference,
  NOTIFICATION_EVENT_TYPES,
  parseNotificationPreferences,
} from "@/lib/notifications/preferences";

const BODY_LIMIT_BYTES = 64 * 1024;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function json(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: NO_STORE_HEADERS });
}

type StoredPreference = {
  event_type: string;
  email_enabled: boolean;
  email_frequency: string;
  in_app_enabled: boolean;
  authority_version: number;
};

function preferencePayload(data: StoredPreference[]) {
  const stored = new Map(data.map((row) => [row.event_type, row]));
  return Object.fromEntries(
    NOTIFICATION_EVENT_TYPES.map((eventType) => {
      const row = stored.get(eventType);
      return [
        eventType,
        row
          ? {
              email_enabled: row.email_enabled,
              email_frequency: row.email_frequency,
              in_app_enabled: row.in_app_enabled,
              version: row.authority_version,
            }
          : { ...defaultNotificationPreference(), version: 0 },
      ];
    }),
  );
}

function channelsPayload() {
  return {
    in_app: { configured: true, consent_required: false },
    email: {
      configured: getExternalNotificationAdapters().some(
        (adapter) => adapter.channel === "email" && adapter.configured,
      ),
      consent_required: false,
    },
    sms: { configured: false, preview_only: true, consent_required: true },
    imessage: { configured: false, preview_only: true, consent_required: true },
  };
}

export async function GET() {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("event_type, email_enabled, email_frequency, in_app_enabled, authority_version")
    .eq("user_id", user.id);
  if (error) {
    return json(
      { error: "Notification preferences are temporarily unavailable" },
      { status: 503 },
    );
  }

  return json({
    preferences: preferencePayload((data ?? []) as StoredPreference[]),
    channels: channelsPayload(),
  });
}

export async function PUT(req: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
    return json({ error: "Notification preference request is too large" }, { status: 413 });
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > BODY_LIMIT_BYTES) {
    return json({ error: "Notification preference request is too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Notification preferences must be valid JSON" }, { status: 400 });
  }
  const preferencesInput =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).preferences
      : null;
  const versionsInput =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).expected_versions
      : null;
  const parsed = parseNotificationPreferences(preferencesInput);
  if (!parsed.ok) {
    return json({ error: parsed.error, field: parsed.field }, { status: 400 });
  }

  if (!versionsInput || typeof versionsInput !== "object" || Array.isArray(versionsInput)) {
    return json({ error: "expected_versions object is required", field: "expected_versions" }, { status: 400 });
  }
  const expectedVersions = versionsInput as Record<string, unknown>;
  const parsedKeys = Object.keys(parsed.value);
  if (
    Object.keys(expectedVersions).length !== parsedKeys.length ||
    parsedKeys.some(
      (eventType) =>
        !Number.isInteger(expectedVersions[eventType]) ||
        Number(expectedVersions[eventType]) < 0 ||
        Number(expectedVersions[eventType]) >= 2_147_483_647,
    )
  ) {
    return json({ error: "expected_versions are invalid", field: "expected_versions" }, { status: 400 });
  }

  const rows = Object.entries(parsed.value).map(([eventType, preference]) => ({
    user_id: user.id,
    event_type: eventType,
    email_enabled: preference.email_enabled,
    email_frequency: preference.email_frequency,
    in_app_enabled: preference.in_app_enabled,
  }));
  const { data, error } = await supabase.rpc("update_notification_preferences", {
    p_expected_versions: expectedVersions,
    p_preferences: parsed.value,
    p_request_id: randomUUID(),
  });
  if (error) {
    if (error.message?.toLowerCase().includes("notification_preferences_version_conflict")) {
      return json(
        {
          error: "Notification preferences changed elsewhere. Reload before saving again.",
          code: "NOTIFICATION_VERSION_CONFLICT",
        },
        { status: 409 },
      );
    }
    return json(
      { error: "Notification preferences could not be updated" },
      { status: 503 },
    );
  }

  const confirmedRows = Array.isArray(data) ? (data as StoredPreference[]) : [];
  const confirmed = new Map(confirmedRows.map((row) => [row.event_type, row]));
  const exactMatch = rows.every((row) => {
    const stored = confirmed.get(row.event_type);
    return Boolean(
      stored &&
        stored.email_enabled === row.email_enabled &&
        stored.email_frequency === row.email_frequency &&
        stored.in_app_enabled === row.in_app_enabled &&
        Number.isInteger(stored.authority_version) &&
        stored.authority_version > Number(expectedVersions[row.event_type]),
    );
  });
  if (!exactMatch) {
    return json(
      {
        error: "The saved preferences did not match the requested values. Reload before editing again.",
        code: "NOTIFICATION_CONFIRMATION_MISMATCH",
      },
      { status: 409 },
    );
  }

  return json({
    ok: true,
    updated: rows.length,
    preferences: preferencePayload(confirmedRows),
    channels: channelsPayload(),
  });
}

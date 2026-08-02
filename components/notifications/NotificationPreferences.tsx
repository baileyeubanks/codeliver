"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Mail,
  MessageSquareText,
  RefreshCw,
  Save,
  Smartphone,
} from "lucide-react";
import type { NotificationType } from "@/lib/types/codeliver";

interface EventPreference {
  email_enabled: boolean;
  in_app_enabled: boolean;
  email_frequency: string;
  version: number;
}

type PreferencesMap = Record<string, EventPreference>;

const EVENT_TYPES: { type: NotificationType; label: string }[] = [
  { type: "comment_added", label: "New comment" },
  { type: "comment_resolved", label: "Comment resolved" },
  { type: "comment_reply", label: "Comment reply" },
  { type: "approval_requested", label: "Approval requested" },
  { type: "approval_decided", label: "Approval decided" },
  { type: "asset_uploaded", label: "Asset uploaded" },
  { type: "version_uploaded", label: "Version uploaded" },
  { type: "share_link_viewed", label: "Share link viewed" },
  { type: "mention", label: "Mentioned" },
];

const FREQUENCY_OPTIONS = [
  { value: "instant", label: "Instant" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
  { value: "off", label: "Off" },
];

function defaultPreference(): EventPreference {
  return {
    email_enabled: false,
    in_app_enabled: true,
    email_frequency: "off",
    version: 0,
  };
}

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<PreferencesMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [channels, setChannels] = useState<Record<string, { configured?: boolean; preview_only?: boolean }>>({});

  const loadPreferences = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch("/api/notifications/preferences", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.preferences || typeof data.preferences !== "object") {
        throw new Error(data?.error || "Notification preferences could not be loaded.");
      }
      const merged: PreferencesMap = {};
      for (const evt of EVENT_TYPES) {
        merged[evt.type] = data.preferences[evt.type] ?? defaultPreference();
      }
      setPreferences(merged);
      setChannels(data.channels ?? {});
      setDirty(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPreferences({});
      setChannels({});
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : "Notification preferences could not be loaded.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPreferences(controller.signal);
    return () => controller.abort();
  }, [loadPreferences]);

  const updatePreference = useCallback(
    (type: string, field: keyof EventPreference, value: boolean | string) => {
      setPreferences((prev) => ({
        ...prev,
        [type]: {
          ...(prev[type] ?? defaultPreference()),
          [field]: value,
        },
      }));
      setSaved(false);
      setDirty(true);
    },
    []
  );

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferences: Object.fromEntries(
            Object.entries(preferences).map(([eventType, preference]) => [
              eventType,
              {
                email_enabled: preference.email_enabled,
                email_frequency: preference.email_frequency,
                in_app_enabled: preference.in_app_enabled,
              },
            ]),
          ),
          expected_versions: Object.fromEntries(
            Object.entries(preferences).map(([eventType, preference]) => [
              eventType,
              preference.version,
            ]),
          ),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true || !data?.preferences) {
        throw new Error(data?.error || "Preferences could not be saved.");
      }
      const confirmed: PreferencesMap = {};
      for (const evt of EVENT_TYPES) {
        confirmed[evt.type] = data.preferences[evt.type] ?? defaultPreference();
      }
      setPreferences(confirmed);
      setChannels(data.channels ?? channels);
      setDirty(false);
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "Preferences could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--dim)]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-48 flex-col items-start justify-center gap-4" role="alert">
        <div className="flex items-start gap-2 text-sm text-[var(--red)]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void loadPreferences()}
        >
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            Notification Preferences
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Choose how you want to be notified for each event type.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { id: "email", label: "Email", icon: Mail },
          { id: "sms", label: "SMS", icon: Smartphone },
          { id: "imessage", label: "iMessage", icon: MessageSquareText },
        ].map(({ id, label, icon: Icon }) => (
          <div
            key={id}
            className="flex min-h-11 items-center gap-2 border-b border-[var(--border)] px-1 py-2 text-sm"
          >
            <Icon size={14} className="text-[var(--muted)]" />
            <span className="text-[var(--ink)]">{label}</span>
            <span className="ml-auto text-xs text-[var(--dim)]">
              {channels[id]?.configured ? "Ready" : channels[id]?.preview_only ? "Preview only" : "Not configured"}
            </span>
          </div>
        ))}
      </div>

      {saveError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="m-0 text-sm text-[var(--red)]">{saveError}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadPreferences()}
          >
            <RefreshCw size={14} aria-hidden="true" /> Reload saved values
          </button>
        </div>
      ) : saved ? (
        <p className="text-sm text-[var(--green)]" role="status">
          Preferences confirmed and saved.
        </p>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
        <div className="min-w-[620px]">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_80px_140px] gap-4 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--dim)]">
            Event
          </span>
          <span className="text-center text-xs font-medium uppercase tracking-wider text-[var(--dim)]">
            In-app
          </span>
          <span className="text-center text-xs font-medium uppercase tracking-wider text-[var(--dim)]">
            Email
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--dim)]">
            Email frequency
          </span>
        </div>

        {/* Rows */}
        {EVENT_TYPES.map((evt) => {
          const pref = preferences[evt.type] ?? defaultPreference();
          return (
            <div
              key={evt.type}
              className="grid grid-cols-[1fr_80px_80px_140px] items-center gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 last:border-b-0"
            >
              <span className="text-sm text-[var(--ink)]">{evt.label}</span>

              {/* In-app toggle */}
              <div className="flex justify-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={pref.in_app_enabled}
                  aria-label={`${pref.in_app_enabled ? "Disable" : "Enable"} in-app notifications for ${evt.label}`}
                  disabled={saving}
                  onClick={() =>
                    updatePreference(
                      evt.type,
                      "in_app_enabled",
                      !pref.in_app_enabled
                    )
                  }
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    pref.in_app_enabled
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--surface-2)]"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      pref.in_app_enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Email toggle */}
              <div className="flex justify-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={pref.email_enabled}
                  aria-label={`${pref.email_enabled ? "Disable" : "Enable"} email notifications for ${evt.label}`}
                  disabled={saving}
                  onClick={() => {
                    setSaved(false);
                    setDirty(true);
                    setPreferences((prev) => ({
                      ...prev,
                      [evt.type]: {
                        ...pref,
                        email_enabled: !pref.email_enabled,
                        email_frequency: pref.email_enabled
                          ? "off"
                          : pref.email_frequency === "off"
                            ? "instant"
                            : pref.email_frequency,
                      },
                    }));
                  }}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    pref.email_enabled
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--surface-2)]"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      pref.email_enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Email frequency */}
              <select
                value={pref.email_frequency}
                onChange={(e) =>
                  updatePreference(evt.type, "email_frequency", e.target.value)
                }
                disabled={!pref.email_enabled || saving}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--ink)] disabled:opacity-40"
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

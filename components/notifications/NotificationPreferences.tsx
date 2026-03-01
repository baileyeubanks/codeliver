"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { NotificationType } from "@/lib/types/codeliver";

interface EventPreference {
  email_enabled: boolean;
  in_app_enabled: boolean;
  email_frequency: string;
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
  return { email_enabled: true, in_app_enabled: true, email_frequency: "instant" };
}

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<PreferencesMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/notifications/preferences");
        if (res.ok) {
          const data = await res.json();
          // Merge fetched with defaults for any missing types
          const merged: PreferencesMap = {};
          for (const evt of EVENT_TYPES) {
            merged[evt.type] = data.preferences?.[evt.type] ?? defaultPreference();
          }
          setPreferences(merged);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
    },
    []
  );

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
      if (res.ok) {
        setSaved(true);
      }
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
          onClick={handleSave}
          disabled={saving}
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

      {/* Table */}
      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
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
                  onClick={() =>
                    updatePreference(
                      evt.type,
                      "email_enabled",
                      !pref.email_enabled
                    )
                  }
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
                disabled={!pref.email_enabled}
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
  );
}

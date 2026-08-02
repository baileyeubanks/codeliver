"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquareText, ShieldCheck, Smartphone } from "lucide-react";

export type ExternalNotificationChannel = "email" | "sms" | "imessage";

export interface NotificationAuthorityValue {
  action: "none" | "preview" | "send";
  channels: ExternalNotificationChannel[];
  phone: string;
  imessageHandle: string;
  smsConsentConfirmed: boolean;
  smsConsentRecordedAt: string | null;
  imessageConsentConfirmed: boolean;
  imessageConsentRecordedAt: string | null;
  confirmLiveSend: boolean;
}

interface NotificationAuthorityControlProps {
  email: string;
  value: NotificationAuthorityValue;
  onChange: (value: NotificationAuthorityValue) => void;
}

const CHANNELS: Array<{
  id: ExternalNotificationChannel;
  label: string;
  icon: typeof Mail;
}> = [
  { id: "email", label: "Email", icon: Mail },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "imessage", label: "iMessage", icon: MessageSquareText },
];

export const EMPTY_NOTIFICATION_AUTHORITY: NotificationAuthorityValue = {
  action: "none",
  channels: [],
  phone: "",
  imessageHandle: "",
  smsConsentConfirmed: false,
  smsConsentRecordedAt: null,
  imessageConsentConfirmed: false,
  imessageConsentRecordedAt: null,
  confirmLiveSend: false,
};

export default function NotificationAuthorityControl({
  email,
  value,
  onChange,
}: NotificationAuthorityControlProps) {
  const [configured, setConfigured] = useState<Record<string, boolean>>({
    email: false,
    sms: false,
    imessage: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/send")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.channels)) return;
        const next: Record<string, boolean> = {};
        for (const channel of data.channels) next[channel.channel] = channel.configured === true;
        setConfigured(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function update(patch: Partial<NotificationAuthorityValue>) {
    onChange({ ...value, ...patch });
  }

  function toggleChannel(channel: ExternalNotificationChannel) {
    const selected = value.channels.includes(channel);
    const consentReset = selected
      ? channel === "sms"
        ? { smsConsentConfirmed: false, smsConsentRecordedAt: null }
        : channel === "imessage"
          ? { imessageConsentConfirmed: false, imessageConsentRecordedAt: null }
          : {}
      : {};
    update({
      channels: selected
        ? value.channels.filter((candidate) => candidate !== channel)
        : [...value.channels, channel],
      confirmLiveSend: false,
      ...consentReset,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]">
        {(["none", "preview", "send"] as const).map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => update({ action, confirmLiveSend: false })}
            className={`min-h-9 px-2 text-xs font-medium capitalize transition-colors ${
              value.action === action
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {action === "none" ? "No message" : action}
          </button>
        ))}
      </div>

      {value.action !== "none" ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {CHANNELS.map(({ id, label, icon: Icon }) => {
              const selected = value.channels.includes(id);
              const addressReady = id !== "email" || Boolean(email.trim());
              return (
                <label
                  key={id}
                  className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-xs ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent)]/8 text-[var(--ink)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
                  } ${addressReady ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!addressReady}
                    onChange={() => toggleChannel(id)}
                    className="accent-[var(--accent)]"
                  />
                  <Icon size={14} />
                  <span className="min-w-0 flex-1">{label}</span>
                  <span className="text-[10px] text-[var(--dim)]">
                    {configured[id] ? "Ready" : "Preview"}
                  </span>
                </label>
              );
            })}
          </div>

          {value.channels.includes("sms") ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                SMS number
              </label>
              <input
                value={value.phone}
                onChange={(event) =>
                  update({
                    phone: event.target.value,
                    smsConsentConfirmed: false,
                    smsConsentRecordedAt: null,
                    confirmLiveSend: false,
                  })
                }
                placeholder="+12145550199"
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              {value.action === "send" ? (
                <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={value.smsConsentConfirmed}
                    onChange={(event) => {
                      const confirmed = event.target.checked;
                      update({
                        smsConsentConfirmed: confirmed,
                        smsConsentRecordedAt: confirmed ? new Date().toISOString() : null,
                        confirmLiveSend: false,
                      });
                    }}
                    className="accent-[var(--accent)]"
                  />
                  SMS consent is recorded in the client record
                </label>
              ) : null}
            </div>
          ) : null}

          {value.channels.includes("imessage") ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                iMessage handle
              </label>
              <input
                value={value.imessageHandle}
                onChange={(event) =>
                  update({
                    imessageHandle: event.target.value,
                    imessageConsentConfirmed: false,
                    imessageConsentRecordedAt: null,
                    confirmLiveSend: false,
                  })
                }
                placeholder="Email or +12145550199"
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              {value.action === "send" ? (
                <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={value.imessageConsentConfirmed}
                    onChange={(event) => {
                      const confirmed = event.target.checked;
                      update({
                        imessageConsentConfirmed: confirmed,
                        imessageConsentRecordedAt: confirmed ? new Date().toISOString() : null,
                        confirmLiveSend: false,
                      });
                    }}
                    className="accent-[var(--accent)]"
                  />
                  iMessage consent is recorded in the client record
                </label>
              ) : null}
            </div>
          ) : null}

          {value.action === "send" ? (
            <label className="flex min-h-11 items-center gap-3 border-t border-[var(--border)] pt-4 text-sm font-medium text-[var(--ink)]">
              <input
                type="checkbox"
                checked={value.confirmLiveSend}
                onChange={(event) => update({ confirmLiveSend: event.target.checked })}
                className="accent-[var(--accent)]"
              />
              <ShieldCheck size={15} className="text-[var(--accent)]" />
              I authorize this live send
            </label>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

"use client";

import { Mail, MessageSquareText, Smartphone } from "lucide-react";

const ICONS = {
  email: Mail,
  sms: Smartphone,
  imessage: MessageSquareText,
};

interface NotificationPreviewProps {
  preview: unknown;
}

export default function NotificationPreview({ preview }: NotificationPreviewProps) {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return null;
  const data = preview as Record<string, unknown>;
  const message =
    data.message && typeof data.message === "object" && !Array.isArray(data.message)
      ? (data.message as Record<string, unknown>)
      : {};
  const channels = Array.isArray(data.channels) ? data.channels : [];

  return (
    <div className="border-l-2 border-[var(--accent)] pl-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dim)]">
        Notification preview
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{String(message.title ?? "")}</p>
      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[var(--muted)]">
        {String(message.body ?? "")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {channels.map((rawChannel, index) => {
          const channel =
            rawChannel && typeof rawChannel === "object" && !Array.isArray(rawChannel)
              ? (rawChannel as Record<string, unknown>)
              : {};
          const name = String(channel.channel ?? "email") as keyof typeof ICONS;
          const Icon = ICONS[name] ?? Mail;
          return (
            <span
              key={`${name}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--muted)]"
            >
              <Icon size={11} />
              {name} {String(channel.recipient ?? "")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

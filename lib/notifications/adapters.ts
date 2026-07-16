import type { SupabaseClient } from "@supabase/supabase-js";
import { getBaseUrl, sendEmail } from "@/lib/email";
import {
  fingerprintNotificationRequest,
  type NotificationAdapter,
} from "@/lib/notifications/authority";
import {
  createIMessageRelayAdapter,
  readIMessageRelayConfigFromEnv,
  type IMessageRelayTransport,
} from "@/lib/notifications/imessage-relay";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderEmailHtml({
  title,
  body,
  actionUrl,
}: {
  title: string;
  body: string;
  actionUrl: string | null;
}) {
  const safeBody = escapeHtml(body).replaceAll("\n", "<br />");
  const resolvedActionUrl = actionUrl?.startsWith("/") ? `${getBaseUrl()}${actionUrl}` : actionUrl;
  const action = resolvedActionUrl
    ? `<p style="margin-top: 20px;"><a href="${escapeHtml(resolvedActionUrl)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Open in Co-Production Pro</a></p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
      <h2 style="font-size:18px;line-height:1.4;margin:0 0 12px;">${escapeHtml(title)}</h2>
      <p style="font-size:14px;line-height:1.6;margin:0;">${safeBody}</p>
      ${action}
    </div>
  `;
}

export function getExternalNotificationAdapters({
  imessageRelayTransport,
  imessageRelayEnv = process.env,
}: {
  imessageRelayTransport?: IMessageRelayTransport;
  imessageRelayEnv?: NodeJS.ProcessEnv;
} = {}): NotificationAdapter[] {
  return [
    {
      channel: "email",
      provider: "resend",
      configured: Boolean(process.env.RESEND_API_KEY),
      async send({ request, address }) {
        const result = await sendEmail({
          to: address,
          subject: request.message.title,
          html: renderEmailHtml(request.message),
        });
        return result
          ? { status: "sent", providerMessageId: result.id, retryable: false }
          : { status: "failed", retryable: false, errorCode: "resend_rejected" };
      },
    },
    {
      channel: "sms",
      provider: "sms-not-configured",
      configured: false,
      async send() {
        return { status: "failed", retryable: false, errorCode: "provider_not_configured" };
      },
    },
    createIMessageRelayAdapter({
      config: readIMessageRelayConfigFromEnv(imessageRelayEnv),
      transport: imessageRelayTransport,
      fingerprintRequest: fingerprintNotificationRequest,
    }),
  ];
}

export function createInAppNotificationAdapter({
  client,
  authenticatedUserId,
}: {
  client: SupabaseClient;
  authenticatedUserId: string;
}): NotificationAdapter {
  return {
    channel: "in_app",
    provider: "supabase-notifications",
    configured: true,
    async send({ request }) {
      if (request.recipient.userId !== authenticatedUserId) {
        return { status: "failed", retryable: false, errorCode: "recipient_not_authorized" };
      }

      const { data, error } = await client
        .from("notifications")
        .insert({
          user_id: authenticatedUserId,
          type: request.eventType,
          title: request.message.title,
          body: request.message.body,
          data: {
            action_url: request.message.actionUrl,
            idempotency_key: request.idempotencyKey,
          },
          read: false,
        })
        .select("id")
        .single();

      return error
        ? { status: "failed", retryable: true, errorCode: "in_app_insert_failed" }
        : { status: "sent", providerMessageId: data.id, retryable: false };
    },
  };
}

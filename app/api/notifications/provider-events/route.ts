import {
  parseProviderDeliveryEvent,
  providerEventSuppressesRecipient,
  providerReceiptMatchesEvent,
  verifyProviderEventSignature,
} from "@/lib/notifications/provider-events";
import { hashNotificationRecipient } from "@/lib/notifications/server-delivery";
import { getSupabase } from "@/lib/supabase";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";

const MAX_EVENT_BODY_BYTES = 64 * 1024;

async function ingestProviderEvent(req: Request) {
  const secret = process.env.NOTIFICATION_WEBHOOK_SECRET;
  if (!secret) {
    return apiError("Provider event ingestion is not configured", "NOTIFICATION_PROVIDER_UNAVAILABLE", 503);
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_EVENT_BODY_BYTES) {
    return apiError("Provider event payload is too large", "NOTIFICATION_EVENT_TOO_LARGE", 413);
  }
  const rawBody = await req.text().catch(() => null);
  if (rawBody === null || new TextEncoder().encode(rawBody).byteLength > MAX_EVENT_BODY_BYTES) {
    return apiError("Provider event payload is too large", "NOTIFICATION_EVENT_TOO_LARGE", 413);
  }
  const signature = req.headers.get("x-cco-notification-signature");
  if (!verifyProviderEventSignature(rawBody, signature, secret)) {
    return apiError("Invalid provider event signature", "NOTIFICATION_SIGNATURE_INVALID", 401);
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return apiError("Provider event JSON is invalid", "NOTIFICATION_EVENT_INVALID", 400);
  }
  const parsed = parseProviderDeliveryEvent(input);
  if (!parsed.ok) return apiError(parsed.error, "NOTIFICATION_EVENT_INVALID", 400);

  const event = parsed.value;
  const client = getSupabase();
  const eventIdentity = { provider: event.provider, event_id: event.eventId };
  const existing = await client
    .from("activity_log")
    .select("id")
    .contains("details", eventIdentity)
    .in("action", ["notification_provider_event", "notification_recipient_suppressed"])
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return backendUnavailable();
  }
  if (existing.data) {
    return apiJson({ ok: true, deduplicated: true, receipt_id: existing.data.id });
  }

  const suppress = providerEventSuppressesRecipient(event.type);
  const recipientHash = hashNotificationRecipient(event.channel, event.recipient);
  const delivery = await client
    .from("activity_log")
    .select("id, project_id, asset_id, details")
    .eq("action", "notification_send_receipt")
    .contains("details", {
      receipts: [
        {
          channel: event.channel,
          status: "sent",
          provider: event.provider,
          providerMessageId: event.providerMessageId,
        },
      ],
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (delivery.error) {
    return backendUnavailable();
  }
  if (!delivery.data || !providerReceiptMatchesEvent(delivery.data.details?.receipts, event)) {
    return apiError("Provider event does not match a recorded notification delivery", "NOTIFICATION_EVENT_CONFLICT", 409);
  }

  const deliveryTenantId = delivery.data.details?.tenant_id;
  if (typeof deliveryTenantId !== "string") {
    return apiError("Provider event delivery has no recoverable tenant authority", "NOTIFICATION_EVENT_CONFLICT", 409);
  }
  const authorityReceiptId = delivery.data.details?.authority_receipt_id;
  if (typeof authorityReceiptId !== "string") {
    return apiError("Provider event delivery has no recoverable authority receipt", "NOTIFICATION_EVENT_CONFLICT", 409);
  }
  const authority = await client
    .from("activity_log")
    .select("id")
    .eq("id", authorityReceiptId)
    .eq("action", "notification_send_authorized")
    .contains("details", {
      tenant_id: deliveryTenantId,
      recipient_hashes: [{ channel: event.channel, hash: recipientHash }],
    })
    .limit(1)
    .maybeSingle();
  if (authority.error) {
    return backendUnavailable();
  }
  if (!authority.data) {
    return apiError("Provider event recipient does not match the authorized delivery", "NOTIFICATION_EVENT_CONFLICT", 409);
  }

  const retainUntil = new Date(Date.now() + 2_555 * 24 * 60 * 60 * 1000).toISOString();
  const receipt = await client
    .from("activity_log")
    .insert({
      project_id: delivery.data.project_id,
      asset_id: delivery.data.asset_id,
      actor_id: null,
      actor_name: event.provider,
      action: suppress ? "notification_recipient_suppressed" : "notification_provider_event",
      details: {
        ...eventIdentity,
        tenant_id: deliveryTenantId,
        source_delivery_receipt_id: delivery.data.id,
        source_authority_receipt_id: authority.data.id,
        provider_message_id: event.providerMessageId,
        channel: event.channel,
        event_type: event.type,
        occurred_at: event.occurredAt,
        reason_code: event.reasonCode,
        recipient_hash: recipientHash,
        suppression_active: suppress,
        retention_class: suppress ? "communications_suppression" : "communications_receipt",
        retain_until: retainUntil,
      },
    })
    .select("id, created_at")
    .single();
  if (receipt.error || !receipt.data) {
    return backendUnavailable();
  }

  return apiJson({
    ok: true,
    deduplicated: false,
    suppressed: suppress,
    receipt_id: receipt.data.id,
  });
}

export async function POST(req: Request) {
  try {
    return await ingestProviderEvent(req);
  } catch {
    return backendUnavailable();
  }
}

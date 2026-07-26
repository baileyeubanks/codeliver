import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildNotificationPreview,
  dispatchNotificationChannels,
  evaluateFixedWindowRateLimit,
  fingerprintNotificationRequest,
  notificationAddress,
  type AuthorizedNotificationRequest,
  type NotificationAdapter,
  type NotificationChannel,
} from "@/lib/notifications/authority";

const SEND_RATE_LIMIT = 20;
const SEND_RATE_WINDOW_MS = 60_000;
const AUDIT_RETENTION_DAYS = 2_555;

export function hashNotificationRecipient(channel: NotificationChannel, address: string) {
  return crypto
    .createHash("sha256")
    .update(`${channel}:${address.trim().toLowerCase()}`)
    .digest("hex");
}

function retainUntil(now: Date) {
  return new Date(now.getTime() + AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function dispatchAuditedNotification({
  request,
  client,
  adapters,
  actorId,
  actorName,
  projectId = null,
  assetId = null,
  preferenceEnabled = {},
  now = new Date(),
}: {
  request: AuthorizedNotificationRequest;
  client: SupabaseClient;
  adapters: NotificationAdapter[];
  actorId: string;
  actorName: string;
  projectId?: string | null;
  assetId?: string | null;
  preferenceEnabled?: Partial<Record<NotificationChannel, boolean>>;
  now?: Date;
}) {
  if (request.action === "preview") {
    return {
      ok: true as const,
      mode: "preview" as const,
      preview: buildNotificationPreview(request, adapters),
      receipts: [],
      audit: { status: "not_written" as const, receipt_id: null },
    };
  }

  const idempotencyKey = request.idempotencyKey as string;
  const requestFingerprint = fingerprintNotificationRequest(request);
  const dedupeFilter = {
    tenant_id: request.tenantId,
    idempotency_key: idempotencyKey,
  };
  const existingReceipt = await client
    .from("activity_log")
    .select("id, details, created_at")
    .eq("actor_id", actorId)
    .eq("action", "notification_send_receipt")
    .contains("details", dedupeFilter)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingReceipt.error) {
    return {
      ok: false as const,
      status: 503,
      code: "dedupe_check_failed",
      error: "Notification deduplication is unavailable; no message was sent",
    };
  }
  if (existingReceipt.data) {
    if (existingReceipt.data.details?.request_fingerprint !== requestFingerprint) {
      return {
        ok: false as const,
        status: 409,
        code: "idempotency_conflict",
        error: "This notification idempotency key is already bound to a different request",
      };
    }
    return {
      ok: true as const,
      mode: "send" as const,
      deduplicated: true,
      receipts: existingReceipt.data.details?.receipts ?? [],
      audit: { status: "recorded" as const, receipt_id: existingReceipt.data.id },
    };
  }

  const existingAuthority = await client
    .from("activity_log")
    .select("id, details, created_at")
    .eq("actor_id", actorId)
    .eq("action", "notification_send_authorized")
    .contains("details", dedupeFilter)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingAuthority.error) {
    return {
      ok: false as const,
      status: 503,
      code: "dedupe_check_failed",
      error: "Notification deduplication is unavailable; no message was sent",
    };
  }
  if (existingAuthority.data) {
    if (existingAuthority.data.details?.request_fingerprint !== requestFingerprint) {
      return {
        ok: false as const,
        status: 409,
        code: "idempotency_conflict",
        error: "This notification idempotency key is already bound to a different request",
      };
    }
    return {
      ok: false as const,
      status: 409,
      code: "delivery_indeterminate",
      error:
        "A send authority receipt exists without a delivery receipt. Automatic retry is blocked to prevent duplicates.",
      authority_receipt_id: existingAuthority.data.id,
    };
  }

  const windowStart = new Date(now.getTime() - SEND_RATE_WINDOW_MS).toISOString();
  const rateQuery = await client
    .from("activity_log")
    .select("details")
    .eq("actor_id", actorId)
    .eq("action", "notification_send_authorized")
    .gte("created_at", windowStart);
  if (rateQuery.error) {
    return {
      ok: false as const,
      status: 503,
      code: "rate_limit_unavailable",
      error: "Notification rate authority is unavailable; no message was sent",
    };
  }

  const attemptsInWindow = (rateQuery.data ?? []).reduce((total, row) => {
    const channels = row.details?.channels;
    return total + (Array.isArray(channels) && channels.length > 0 ? channels.length : 1);
  }, 0);
  const rate = evaluateFixedWindowRateLimit({
    attemptsInWindow,
    requestedAttempts: request.channels.length,
    limit: SEND_RATE_LIMIT,
  });
  if (!rate.allowed) {
    return {
      ok: false as const,
      status: 429,
      code: "rate_limited",
      error: "Notification send rate exceeded",
      retry_after_seconds: Math.ceil(SEND_RATE_WINDOW_MS / 1000),
      limit: SEND_RATE_LIMIT,
    };
  }

  const recipientHashes = request.channels.flatMap((channel) => {
    const address = notificationAddress(request.recipient, channel);
    return address ? [{ channel, address, hash: hashNotificationRecipient(channel, address) }] : [];
  });
  const suppressionChecks = await Promise.all(
    recipientHashes.map(({ channel, hash }) =>
      client
        .from("activity_log")
        .select("id")
        .eq("action", "notification_recipient_suppressed")
        .contains("details", {
          tenant_id: request.tenantId,
          channel,
          recipient_hash: hash,
        })
        .limit(1)
        .maybeSingle(),
    ),
  );
  if (suppressionChecks.some((result) => result.error)) {
    return {
      ok: false as const,
      status: 503,
      code: "suppression_check_failed",
      error: "Recipient suppression authority is unavailable; no message was sent",
    };
  }
  const suppressedAddresses = new Set(
    recipientHashes
      .filter((_, index) => Boolean(suppressionChecks[index].data))
      .map(({ address }) => address),
  );

  const authorityInsert = await client
    .from("activity_log")
    .insert({
      project_id: projectId,
      asset_id: assetId,
      actor_id: actorId,
      actor_name: actorName,
      action: "notification_send_authorized",
      details: {
        ...dedupeFilter,
        request_fingerprint: requestFingerprint,
        event_type: request.eventType,
        purpose: request.purpose,
        channels: request.channels,
        recipient_hashes: recipientHashes.map(({ channel, hash }) => ({ channel, hash })),
        retention_class: "communications_authority",
        retain_until: retainUntil(now),
      },
    })
    .select("id, created_at")
    .single();

  if (authorityInsert.error || !authorityInsert.data) {
    return {
      ok: false as const,
      status: 503,
      code: "authority_audit_failed",
      error: "Send authority could not be recorded; no message was sent",
    };
  }

  const receipts = await dispatchNotificationChannels({
    request,
    adapters,
    preferenceEnabled,
    suppressedAddresses,
  });
  const receiptInsert = await client
    .from("activity_log")
    .insert({
      project_id: projectId,
      asset_id: assetId,
      actor_id: actorId,
      actor_name: actorName,
      action: "notification_send_receipt",
      details: {
        ...dedupeFilter,
        request_fingerprint: requestFingerprint,
        authority_receipt_id: authorityInsert.data.id,
        recipient_hashes: recipientHashes.map(({ channel, hash }) => ({ channel, hash })),
        receipts,
        retention_class: "communications_receipt",
        retain_until: retainUntil(now),
      },
    })
    .select("id, created_at")
    .single();

  if (receiptInsert.error || !receiptInsert.data) {
    return {
      ok: false as const,
      status: 503,
      code: "delivery_receipt_failed",
      error: "Delivery completed with an unrecorded receipt; automatic retry is blocked",
      receipts,
      authority_receipt_id: authorityInsert.data.id,
    };
  }

  return {
    ok: true as const,
    mode: "send" as const,
    deduplicated: false,
    receipts,
    audit: {
      status: "recorded" as const,
      authority_receipt_id: authorityInsert.data.id,
      receipt_id: receiptInsert.data.id,
    },
  };
}

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CO_PRODUCTION_DATA_SCHEMA } from "@/lib/data-authority";
import {
  buildNotificationPreview,
  notificationAddress,
  type NotificationAdapter,
} from "@/lib/notifications/authority";
import { createNotificationOutboxEnvelope } from "@/lib/notifications/outbox";
import {
  persistedOpaqueTokenFields,
  recoverOpaqueToken,
} from "@/lib/security/opaque-token";
import { hashReviewPassword } from "@/lib/security/review-password";
import { buildShareNotificationRequests } from "@/lib/sharing/share-notifications";
import {
  serializePreparedShareInvite,
  type PreparedShareManifest,
  type ReviewInviteRow,
} from "@/lib/sharing/share-service";

const SHARE_RATE_LIMIT = 100;

interface AtomicShareNotificationSnapshot {
  channel: "email";
  scopeFingerprint: string;
  status: "queued" | "suppressed";
  outboxId: string | null;
  replayed: boolean;
}

interface AtomicShareSnapshot {
  replayed: boolean;
  receiptId: string;
  manifestId: string;
  manifestFingerprint: string;
  inviteIds: string[];
  notifications: AtomicShareNotificationSnapshot[];
  rateLimitRemaining: number;
}

type AtomicShareFailure = {
  ok: false;
  status: 400 | 401 | 403 | 409 | 429 | 503;
  code: string;
  error: string;
  mutationPerformed: boolean | null;
  retryWithSameManifest: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function newToken() {
  return randomBytes(32).toString("hex");
}

function retentionDate(days: number, now: Date) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function notificationIntentFingerprint(request: {
  message: { actionUrl: string | null; body: string; title: string };
}) {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        action_url: request.message.actionUrl,
        body: request.message.body,
        title: request.message.title,
      }),
      "utf8",
    )
    .digest("hex")}`;
}

function parseAtomicShareSnapshot(value: unknown): AtomicShareSnapshot {
  if (!isRecord(value)) throw new Error("Atomic share RPC returned no receipt");
  if (
    typeof value.replayed !== "boolean" ||
    typeof value.receipt_id !== "string" ||
    typeof value.manifest_id !== "string" ||
    typeof value.manifest_fingerprint !== "string" ||
    !Array.isArray(value.invite_ids) ||
    !Array.isArray(value.notifications) ||
    !Number.isInteger(value.rate_limit_remaining)
  ) {
    throw new Error("Atomic share RPC returned an invalid receipt");
  }

  const inviteIds = value.invite_ids.filter(
    (inviteId): inviteId is string => typeof inviteId === "string" && inviteId.length > 0,
  );
  if (
    inviteIds.length !== value.invite_ids.length ||
    new Set(inviteIds).size !== inviteIds.length
  ) {
    throw new Error("Atomic share RPC returned invalid invite authority");
  }

  const notifications = value.notifications.map((notification) => {
    if (
      !isRecord(notification) ||
      notification.channel !== "email" ||
      (notification.status !== "queued" && notification.status !== "suppressed") ||
      typeof notification.scope_fingerprint !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(notification.scope_fingerprint) ||
      (notification.outbox_id !== null && typeof notification.outbox_id !== "string") ||
      typeof notification.replayed !== "boolean"
    ) {
      throw new Error("Atomic share RPC returned invalid notification authority");
    }
    if (
      (notification.status === "queued" && !notification.outbox_id) ||
      (notification.status === "suppressed" && notification.outbox_id !== null)
    ) {
      throw new Error("Atomic share RPC returned inconsistent notification authority");
    }
    return {
      channel: "email" as const,
      scopeFingerprint: notification.scope_fingerprint,
      status: notification.status as "queued" | "suppressed",
      outboxId: notification.outbox_id,
      replayed: notification.replayed,
    };
  });

  return {
    replayed: value.replayed,
    receiptId: value.receipt_id,
    manifestId: value.manifest_id,
    manifestFingerprint: value.manifest_fingerprint,
    inviteIds,
    notifications,
    rateLimitRemaining: value.rate_limit_remaining as number,
  };
}

function rpcFailure(error: { code?: string; message?: string } | null): AtomicShareFailure {
  const code = error?.code ?? "database_error";
  const message = error?.message ?? "atomic_share_transaction_failed";
  if (
    code === "23505" ||
    message.includes("share_manifest_idempotency_conflict") ||
    message.includes("share_manifest_legacy_receipt_conflict") ||
    message.includes("notification_outbox_idempotency_conflict")
  ) {
    return {
      ok: false,
      status: 409,
      code: "share_manifest_idempotency_conflict",
      error: "This manifest_id is already bound to different sharing authority",
      mutationPerformed: false,
      retryWithSameManifest: false,
    };
  }
  if (message.includes("share_manifest_rate_limited")) {
    return {
      ok: false,
      status: 429,
      code: "share_manifest_rate_limited",
      error: "Share link creation rate exceeded",
      mutationPerformed: false,
      retryWithSameManifest: true,
    };
  }
  if (code === "28000") {
    return {
      ok: false,
      status: 401,
      code: "authentication_required",
      error: "An authenticated operator is required",
      mutationPerformed: false,
      retryWithSameManifest: false,
    };
  }
  if (code === "42501" || code === "23503") {
    return {
      ok: false,
      status: code === "42501" ? 403 : 409,
      code: code === "42501" ? "share_authority_denied" : "share_authority_conflict",
      error:
        code === "42501"
          ? "The operator no longer has producer authority for every asset"
          : "The requested share authority changed before it could be committed",
      mutationPerformed: false,
      retryWithSameManifest: false,
    };
  }
  if (code.startsWith("22")) {
    return {
      ok: false,
      status: 400,
      code: "invalid_share_transaction",
      error: "The managed share transaction failed database validation",
      mutationPerformed: false,
      retryWithSameManifest: false,
    };
  }
  return {
    ok: false,
    status: 503,
    code: "share_transaction_indeterminate",
    error:
      "The share transaction response was interrupted. Retry with the same manifest_id to recover the authoritative result.",
    mutationPerformed: null,
    retryWithSameManifest: true,
  };
}

function queuedNotificationResult(notification: AtomicShareNotificationSnapshot) {
  return {
    ok: true as const,
    mode: notification.status === "queued" ? ("queued" as const) : ("suppressed" as const),
    deduplicated: notification.replayed,
    receipts: [
      {
        channel: notification.channel,
        status: notification.status,
        provider: null,
        providerMessageId: null,
        attemptedProviders: [],
        errorCode:
          notification.status === "suppressed" ? "recipient_suppressed" : null,
        outboxId: notification.outboxId ?? undefined,
        replayed: notification.replayed,
      },
    ],
    audit: {
      status: "outbox_recorded" as const,
      outbox_ids: notification.outboxId ? [notification.outboxId] : [],
      authority_scope_fingerprint: notification.scopeFingerprint,
    },
  };
}

export async function createAtomicShareManifest({
  manifest,
  manifestFingerprint,
  client,
  baseUrl,
  adapters,
  now = new Date(),
}: {
  manifest: PreparedShareManifest;
  manifestFingerprint: string;
  client: SupabaseClient;
  baseUrl: string;
  adapters: NotificationAdapter[];
  now?: Date;
}): Promise<
  | {
      ok: true;
      replayed: boolean;
      receiptId: string;
      rateLimitRemaining: number;
      items: Array<Record<string, unknown> & { asset_id: string; version_id: string; token: string }>;
      notifications: unknown[];
    }
  | AtomicShareFailure
> {
  const tokens = manifest.items.map(() => newToken());
  let passwordHashes: Array<string | null>;
  try {
    passwordHashes = await Promise.all(
      manifest.items.map((item) =>
        item.password ? hashReviewPassword(item.password) : Promise.resolve(null),
      ),
    );
  } catch {
    return {
      ok: false,
      status: 503,
      code: "share_password_authority_unavailable",
      error: "Share password protection is unavailable; no links were created",
      mutationPerformed: false,
      retryWithSameManifest: true,
    };
  }

  let inviteInputs: Array<Record<string, unknown>>;
  try {
    inviteInputs = manifest.items.map((item, index) => {
      const tokenFields = persistedOpaqueTokenFields(
        tokens[index],
        CO_PRODUCTION_DATA_SCHEMA,
      );
      if (!("token_hash" in tokenFields) || !("token_ciphertext" in tokenFields)) {
        throw new Error("Managed token authority is unavailable");
      }
      return {
        asset_id: item.assetId,
        version_id: item.version.id,
        version_number: item.version.version_number,
        token_hash: tokenFields.token_hash,
        token_ciphertext: tokenFields.token_ciphertext,
        password_hash: passwordHashes[index],
        reviewer_name: item.recipient.name,
        reviewer_email: item.recipient.email,
        permissions: item.permissions,
        expires_at: item.expiresAt,
        watermark_enabled: item.watermarkEnabled,
        watermark_text: item.watermarkText,
        download_enabled: item.downloadEnabled,
        max_views: item.maxViews,
        share_intent: item.shareIntent,
        policy_template_id: item.policy.id,
        approval_id: item.approvalRoute?.approvalId ?? null,
        retention_until: retentionDate(item.policy.auditRetentionDays, now),
      };
    });
  } catch {
    return {
      ok: false,
      status: 503,
      code: "share_token_authority_unavailable",
      error: "Secure share token authority is unavailable; no links were created",
      mutationPerformed: false,
      retryWithSameManifest: true,
    };
  }

  const createdTokenIdentities = manifest.items.map((item, index) => ({
    asset_id: item.assetId,
    version_id: item.version.id,
    token: tokens[index],
  }));
  const notificationAuthority = buildShareNotificationRequests({
    manifest,
    createdItems: createdTokenIdentities,
    baseUrl,
  });
  if (!notificationAuthority.ok) {
    return {
      ok: false,
      status: 400,
      code: "invalid_share_notification",
      error: notificationAuthority.error,
      mutationPerformed: false,
      retryWithSameManifest: false,
    };
  }

  const itemIndex = new Map(
    manifest.items.map((item, index) => [`${item.assetId}:${item.version.id}`, index]),
  );
  const notificationIntents: Array<Record<string, unknown>> = [];
  if (notificationAuthority.action === "send") {
    for (const notification of notificationAuthority.requests) {
      if (
        notification.request.channels.length !== 1 ||
        notification.request.channels[0] !== "email"
      ) {
        return {
          ok: false,
          status: 400,
          code: "managed_share_channel_preview_only",
          error:
            "Managed share delivery currently queues email only. SMS, iMessage, and in-app channels remain preview-only.",
          mutationPerformed: false,
          retryWithSameManifest: false,
        };
      }
      const address = notificationAddress(notification.request.recipient, "email");
      if (!address || !notification.request.idempotencyKey) {
        return {
          ok: false,
          status: 400,
          code: "invalid_share_notification_recipient",
          error: "Queued share email requires a verified recipient and idempotency key",
          mutationPerformed: false,
          retryWithSameManifest: false,
        };
      }
      const scopedIndexes = notification.assetIds.map((assetId, index) =>
        itemIndex.get(`${assetId}:${notification.versionIds[index]}`),
      );
      if (scopedIndexes.some((index) => index === undefined)) {
        return {
          ok: false,
          status: 409,
          code: "share_notification_scope_changed",
          error: "Share notification scope no longer matches the prepared manifest",
          mutationPerformed: false,
          retryWithSameManifest: false,
        };
      }
      const envelope = createNotificationOutboxEnvelope(
        {
          tenantKey: manifest.tenantId,
          channel: "email",
          idempotencyKey: notification.request.idempotencyKey,
          eventType: notification.request.eventType,
          recipientIdentity: address,
          payload: {
            schema_version: "cco.transactional-notification.v1",
            intent_fingerprint: notificationIntentFingerprint(notification.request),
            resolver_contract: "authoritative-resource-lookup-v1",
            purpose: notification.request.purpose,
            project_id: notification.projectId,
            asset_id: notification.assetId,
          },
        },
        { now },
      );
      notificationIntents.push({
        channel: envelope.channel,
        idempotency_key: envelope.idempotencyKey,
        event_type: envelope.eventType,
        recipient_identity_hash: envelope.recipientIdentityHash,
        recipient_redacted: envelope.recipientRedacted,
        payload: envelope.payload,
        max_attempts: envelope.maxAttempts,
        item_indexes: scopedIndexes,
      });
    }
  }

  const tenantSeparator = manifest.tenantId.indexOf(":");
  const tenantKind = manifest.tenantId.slice(0, tenantSeparator);
  const tenantId = manifest.tenantId.slice(tenantSeparator + 1);
  const rpc = await client.rpc("create_share_manifest_with_outbox", {
    p_manifest_id: manifest.manifestId,
    p_manifest_fingerprint: manifestFingerprint,
    p_tenant_kind: tenantKind,
    p_tenant_id: tenantId,
    p_items: inviteInputs,
    p_notification_intents: notificationIntents,
  });
  if (rpc.error) return rpcFailure(rpc.error);

  let snapshot: AtomicShareSnapshot;
  try {
    snapshot = parseAtomicShareSnapshot(rpc.data);
  } catch {
    return {
      ok: false,
      status: 503,
      code: "share_transaction_response_invalid",
      error:
        "The share transaction committed without a recoverable response. Retry with the same manifest_id.",
      mutationPerformed: true,
      retryWithSameManifest: true,
    };
  }
  if (
    snapshot.manifestId !== manifest.manifestId ||
    snapshot.manifestFingerprint !== manifestFingerprint ||
    snapshot.inviteIds.length !== manifest.items.length
  ) {
    return {
      ok: false,
      status: 503,
      code: "share_transaction_authority_mismatch",
      error:
        "The share authority response did not match this manifest. Retry with the same manifest_id.",
      mutationPerformed: true,
      retryWithSameManifest: true,
    };
  }

  const inviteLookup = await client
    .from("review_invites")
    .select("*")
    .in("id", snapshot.inviteIds);
  if (inviteLookup.error || !inviteLookup.data) {
    return {
      ok: false,
      status: 503,
      code: "share_transaction_recovery_unavailable",
      error:
        "The links were committed but could not be recovered. Retry with the same manifest_id.",
      mutationPerformed: true,
      retryWithSameManifest: true,
    };
  }

  const rowById = new Map(
    inviteLookup.data.map((row) => [row.id, row as ReviewInviteRow]),
  );
  const items: Array<
    Record<string, unknown> & { asset_id: string; version_id: string; token: string }
  > = [];
  try {
    for (let index = 0; index < snapshot.inviteIds.length; index += 1) {
      const row = rowById.get(snapshot.inviteIds[index]);
      const item = manifest.items[index];
      if (
        !row ||
        row.asset_id !== item.assetId ||
        row.version_id !== item.version.id
      ) {
        throw new Error("Share receipt item mismatch");
      }
      const token = snapshot.replayed
        ? recoverOpaqueToken(row as unknown as Record<string, unknown>)
        : tokens[index];
      items.push(
        serializePreparedShareInvite(row, item, token) as Record<string, unknown> & {
          asset_id: string;
          version_id: string;
          token: string;
        },
      );
    }
  } catch {
    return {
      ok: false,
      status: 503,
      code: "share_transaction_recovery_invalid",
      error:
        "The links were committed but their receipt could not be verified. Retry with the same manifest_id.",
      mutationPerformed: true,
      retryWithSameManifest: true,
    };
  }

  let notifications: unknown[] = [];
  if (notificationAuthority.action === "send") {
    if (snapshot.notifications.length !== notificationAuthority.requests.length) {
      return {
        ok: false,
        status: 503,
        code: "share_notification_receipt_incomplete",
        error:
          "The links were committed but notification authority was incomplete. Retry with the same manifest_id.",
        mutationPerformed: true,
        retryWithSameManifest: true,
      };
    }
    notifications = snapshot.notifications.map(queuedNotificationResult);
  } else if (notificationAuthority.action === "preview") {
    const previewAuthority = buildShareNotificationRequests({
      manifest,
      createdItems: items,
      baseUrl,
      forcePreview: true,
    });
    if (!previewAuthority.ok) {
      return {
        ok: false,
        status: 503,
        code: "share_notification_preview_unavailable",
        error: "The links were committed but the notification preview could not be rebuilt",
        mutationPerformed: true,
        retryWithSameManifest: true,
      };
    }
    notifications = previewAuthority.requests.map(({ request }) => ({
      ok: true,
      mode: "preview",
      preview: buildNotificationPreview(request, adapters),
      receipts: [],
      audit: { status: "not_written", receipt_id: null },
    }));
  }

  return {
    ok: true,
    replayed: snapshot.replayed,
    receiptId: snapshot.receiptId,
    rateLimitRemaining: Math.min(
      SHARE_RATE_LIMIT,
      Math.max(0, snapshot.rateLimitRemaining),
    ),
    items,
    notifications,
  };
}

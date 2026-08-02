import { createHash } from "node:crypto";

import { getBaseUrl } from "@/lib/email";
import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
  type SupabaseDataSchema,
} from "@/lib/data-authority";
import {
  createInAppNotificationAdapter,
  getExternalNotificationAdapters,
} from "@/lib/notifications/adapters";
import {
  buildNotificationPreview,
  notificationAddress,
  parseNotificationRequest,
  type AuthorizedNotificationRequest,
  type NotificationAdapter,
  type NotificationChannel,
  type NotificationChannelReceipt,
  type NotificationDeliveryStatus,
} from "@/lib/notifications/authority";
import {
  enqueueNotificationOutbox,
  type NotificationOutboxRecord,
} from "@/lib/notifications/outbox";
import { defaultNotificationPreference } from "@/lib/notifications/preferences";
import { dispatchAuditedNotification } from "@/lib/notifications/server-delivery";
import type { DataSupabaseClient } from "@/lib/supabase";

type AuditedDispatch = typeof dispatchAuditedNotification;
type AuditedDispatchResult = Awaited<ReturnType<AuditedDispatch>>;

export type TransactionalNotificationChannel = Extract<
  NotificationChannel,
  "in_app" | "email"
>;

export interface TransactionalNotificationInput {
  client: DataSupabaseClient;
  tenantId: string;
  actorId: string;
  actorName: string;
  eventType: string;
  idempotencyKey: string;
  channels: TransactionalNotificationChannel[];
  recipient: {
    userId?: string | null;
    name?: string | null;
    email?: string | null;
  };
  message: {
    title: string;
    body: string;
    actionUrl?: string | null;
  };
  projectId?: string | null;
  assetId?: string | null;
  preferenceMode?: "bypass" | "recipient";
  authorityReference?: DurableNotificationAuthorityReference;
}

export type TransactionalNotificationDeliveryStatus =
  | NotificationDeliveryStatus
  | "queued";

export interface TransactionalNotificationReceipt
  extends Omit<NotificationChannelReceipt, "status"> {
  status: TransactionalNotificationDeliveryStatus;
  outboxId?: string;
  replayed?: boolean;
}

export interface NotificationQueueFailure {
  ok: false;
  status: 503;
  code: "notification_queue_unavailable";
  error: "Notification queue authority is unavailable; no external notification was sent";
}

export interface DurableNotificationDispatchResult {
  ok: true;
  mode: "queued";
  deduplicated: boolean;
  receipts: TransactionalNotificationReceipt[];
  audit: {
    status: "outbox_recorded";
    outbox_ids: string[];
  };
}

export type TransactionalNotificationResult =
  | AuditedDispatchResult
  | DurableNotificationDispatchResult
  | NotificationQueueFailure
  | {
      ok: false;
      status: 400 | 503;
      code: "invalid_request" | "preference_check_failed";
      error: string;
    };

interface TransactionalNotificationDependencies {
  adapters?: NotificationAdapter[];
  dispatch?: AuditedDispatch;
  enqueue?: typeof enqueueNotificationOutbox;
  dataSchema?: SupabaseDataSchema;
}

export interface DurableNotificationAuthorityReference {
  kind: "share_manifest_created";
  id: string;
  scopeFingerprint: string;
}

interface DurableNotificationInput {
  client: DataSupabaseClient;
  request: AuthorizedNotificationRequest;
  actorId: string;
  actorName: string;
  projectId?: string | null;
  assetId?: string | null;
  preferenceEnabled?: Partial<Record<NotificationChannel, boolean>>;
  authorityReference?: DurableNotificationAuthorityReference;
}

function queueUnavailable(): NotificationQueueFailure {
  return {
    ok: false,
    status: 503,
    code: "notification_queue_unavailable",
    error:
      "Notification queue authority is unavailable; no external notification was sent",
  };
}

function suppressionRecipientHash(
  channel: NotificationChannel,
  address: string,
) {
  return createHash("sha256")
    .update(`${channel}:${address.trim().toLowerCase()}`)
    .digest("hex");
}

function preferenceDisabledReceipt(
  channel: NotificationChannel,
): TransactionalNotificationReceipt {
  return {
    channel,
    status: "preference_disabled",
    provider: null,
    providerMessageId: null,
    attemptedProviders: [],
    errorCode: "preference_disabled",
  };
}

function suppressedReceipt(
  channel: NotificationChannel,
): TransactionalNotificationReceipt {
  return {
    channel,
    status: "suppressed",
    provider: null,
    providerMessageId: null,
    attemptedProviders: [],
    errorCode: "recipient_suppressed",
  };
}

function outboxReceipt(
  channel: NotificationChannel,
  record: NotificationOutboxRecord,
): TransactionalNotificationReceipt {
  return {
    channel,
    status: record.state === "sent" ? "sent" : "queued",
    provider: null,
    providerMessageId: null,
    attemptedProviders: [],
    errorCode: null,
    outboxId: record.id,
    replayed: record.replayed,
  };
}

function orderedReceipts(
  channels: NotificationChannel[],
  receipts: TransactionalNotificationReceipt[],
) {
  const order = new Map(channels.map((channel, index) => [channel, index]));
  return [...receipts].sort(
    (left, right) =>
      (order.get(left.channel) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.channel) ?? Number.MAX_SAFE_INTEGER),
  );
}

function notificationIntentFingerprint(request: AuthorizedNotificationRequest) {
  const canonical = JSON.stringify({
    action_url: request.message.actionUrl,
    body: request.message.body,
    title: request.message.title,
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function durableAuthorityReference(
  reference: DurableNotificationAuthorityReference | undefined,
) {
  if (!reference) return {};
  if (
    !/^[a-z][a-z0-9_.-]{2,79}$/.test(reference.kind) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(reference.id) ||
    !/^sha256:[0-9a-f]{64}$/.test(reference.scopeFingerprint)
  ) {
    throw new Error("Durable notification authority reference is invalid");
  }
  return {
    authority_kind: reference.kind,
    authority_id: reference.id,
    authority_scope_fingerprint: reference.scopeFingerprint,
  };
}

/**
 * Records external delivery authority without invoking a provider. In-app
 * notifications remain synchronous so existing inbox behavior does not change.
 */
export async function dispatchDurableNotification(
  input: DurableNotificationInput,
  dependencies: Pick<
    TransactionalNotificationDependencies,
    "dispatch" | "enqueue"
  > = {},
): Promise<TransactionalNotificationResult> {
  const { request } = input;
  if (request.action === "preview") {
    const previewAdapters =
      request.channels.includes("in_app") && request.recipient.userId
        ? [
            createInAppNotificationAdapter({
              client: input.client as Parameters<
                typeof createInAppNotificationAdapter
              >[0]["client"],
              authenticatedUserId: request.recipient.userId,
            }),
          ]
        : [];
    return {
      ok: true,
      mode: "preview",
      preview: buildNotificationPreview(request, previewAdapters),
      receipts: [],
      audit: { status: "not_written", receipt_id: null },
    };
  }

  const receipts: TransactionalNotificationReceipt[] = [];
  const records: NotificationOutboxRecord[] = [];
  const enqueue = dependencies.enqueue ?? enqueueNotificationOutbox;

  for (const channel of request.channels) {
    if (channel === "in_app") continue;
    if (input.preferenceEnabled?.[channel] === false) {
      receipts.push(preferenceDisabledReceipt(channel));
      continue;
    }

    const address = notificationAddress(request.recipient, channel);
    if (!address) return queueUnavailable();

    const suppression = await input.client
      .from("activity_log")
      .select("id")
      .eq("action", "notification_recipient_suppressed")
      .contains("details", {
        tenant_id: request.tenantId,
        channel,
        recipient_hash: suppressionRecipientHash(channel, address),
      })
      .limit(1)
      .maybeSingle();
    if (suppression.error) return queueUnavailable();
    if (suppression.data) {
      receipts.push(suppressedReceipt(channel));
      continue;
    }

    try {
      const record = await enqueue(input.client, {
        tenantKey: request.tenantId,
        channel,
        idempotencyKey: request.idempotencyKey as string,
        eventType: request.eventType,
        recipientIdentity: address,
        payload: {
          schema_version: "cco.transactional-notification.v1",
          intent_fingerprint: notificationIntentFingerprint(request),
          resolver_contract: "authoritative-resource-lookup-v1",
          ...durableAuthorityReference(input.authorityReference),
          purpose: request.purpose,
          project_id: input.projectId ?? null,
          asset_id: input.assetId ?? null,
        },
      });
      if (record.state === "dead") return queueUnavailable();
      records.push(record);
      receipts.push(outboxReceipt(channel, record));
    } catch {
      return queueUnavailable();
    }
  }

  let inAppDeduplicated = true;
  if (request.channels.includes("in_app")) {
    if (!request.recipient.userId) return queueUnavailable();
    const inAppRequest: AuthorizedNotificationRequest = {
      ...request,
      channels: ["in_app"],
    };
    const inAppResult = await (
      dependencies.dispatch ?? dispatchAuditedNotification
    )({
      request: inAppRequest,
      client: input.client as Parameters<AuditedDispatch>[0]["client"],
      adapters: [
        createInAppNotificationAdapter({
          client: input.client as Parameters<
            typeof createInAppNotificationAdapter
          >[0]["client"],
          authenticatedUserId: request.recipient.userId,
        }),
      ],
      actorId: input.actorId,
      actorName: input.actorName,
      projectId: input.projectId ?? null,
      assetId: input.assetId ?? null,
      preferenceEnabled: {
        in_app: input.preferenceEnabled?.in_app ?? true,
      },
    });
    if (!inAppResult.ok) return inAppResult;
    inAppDeduplicated =
      "deduplicated" in inAppResult && inAppResult.deduplicated === true;
    receipts.push(
      ...(inAppResult.receipts as TransactionalNotificationReceipt[]),
    );
  }

  return {
    ok: true,
    mode: "queued",
    deduplicated:
      records.length > 0 &&
      records.every((record) => record.replayed) &&
      inAppDeduplicated,
    receipts: orderedReceipts(request.channels, receipts),
    audit: {
      status: "outbox_recorded",
      outbox_ids: records.map((record) => record.id),
    },
  };
}

async function resolvePreferenceEnabled({
  client,
  recipientUserId,
  eventType,
}: {
  client: DataSupabaseClient;
  recipientUserId: string | null;
  eventType: string;
}) {
  if (!recipientUserId) {
    return {
      ok: false as const,
      error: "Recipient preferences require a verified user identity",
    };
  }

  const preference = await client
    .from("notification_preferences")
    .select("email_enabled, email_frequency, in_app_enabled")
    .eq("user_id", recipientUserId)
    .eq("event_type", eventType)
    .limit(1)
    .maybeSingle();
  if (preference.error) {
    return {
      ok: false as const,
      error: "Recipient notification preferences could not be verified",
    };
  }

  const stored = preference.data ?? defaultNotificationPreference();
  return {
    ok: true as const,
    value: {
      in_app: stored.in_app_enabled === true,
      email:
        stored.email_enabled === true && stored.email_frequency === "instant",
    },
  };
}

export async function dispatchTransactionalNotification(
  input: TransactionalNotificationInput,
  dependencies: TransactionalNotificationDependencies = {},
): Promise<TransactionalNotificationResult> {
  const parsed = parseNotificationRequest(
    {
      action: "send",
      tenant_id: input.tenantId,
      event_type: input.eventType,
      purpose: "transactional",
      channels: input.channels,
      recipient: {
        user_id: input.recipient.userId ?? null,
        name: input.recipient.name ?? null,
        email: input.recipient.email ?? null,
        phone: null,
        imessage_handle: null,
      },
      message: {
        title: input.message.title,
        body: input.message.body,
        action_url: input.message.actionUrl ?? null,
      },
      consent: {},
      idempotency_key: input.idempotencyKey,
      confirm_live_send: true,
    },
    {
      authenticatedTenantId: input.tenantId,
      allowedOrigin: getBaseUrl(),
    },
  );
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      error: parsed.error,
    };
  }

  let preferenceEnabled: Partial<Record<NotificationChannel, boolean>> =
    Object.fromEntries(input.channels.map((channel) => [channel, true]));
  if ((input.preferenceMode ?? "bypass") === "recipient") {
    const preference = await resolvePreferenceEnabled({
      client: input.client,
      recipientUserId: input.recipient.userId ?? null,
      eventType: input.eventType,
    });
    if (!preference.ok) {
      return {
        ok: false,
        status: 503,
        code: "preference_check_failed",
        error: `${preference.error}; no notification was sent`,
      };
    }
    preferenceEnabled = preference.value;
  }

  const dataSchema = dependencies.dataSchema ?? getSupabaseDataSchema();
  if (dataSchema === CO_PRODUCTION_DATA_SCHEMA) {
    return dispatchDurableNotification(
      {
        client: input.client,
        request: parsed.value,
        actorId: input.actorId,
        actorName: input.actorName,
        projectId: input.projectId,
        assetId: input.assetId,
        preferenceEnabled,
        authorityReference: input.authorityReference,
      },
      dependencies,
    );
  }

  const adapters = dependencies.adapters ?? [
    ...(input.channels.includes("in_app") && input.recipient.userId
      ? [
          createInAppNotificationAdapter({
            client: input.client as Parameters<
              typeof createInAppNotificationAdapter
            >[0]["client"],
            authenticatedUserId: input.recipient.userId,
          }),
        ]
      : []),
    ...getExternalNotificationAdapters(),
  ];

  return (dependencies.dispatch ?? dispatchAuditedNotification)({
    request: parsed.value,
    client: input.client as Parameters<AuditedDispatch>[0]["client"],
    adapters,
    actorId: input.actorId,
    actorName: input.actorName,
    projectId: input.projectId ?? null,
    assetId: input.assetId ?? null,
    preferenceEnabled,
  });
}

export function notificationChannelStatus(
  result: TransactionalNotificationResult,
  channel: TransactionalNotificationChannel,
) {
  if (!result.ok) return "authority_failed" as const;
  return result.receipts.find(
    (receipt: TransactionalNotificationReceipt) => receipt.channel === channel,
  )?.status ?? "failed";
}

export function isNotificationQueueFailure(
  result: TransactionalNotificationResult,
): result is NotificationQueueFailure {
  return (
    !result.ok &&
    "code" in result &&
    result.code === "notification_queue_unavailable"
  );
}

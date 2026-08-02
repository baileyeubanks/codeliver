import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
  type SupabaseDataSchema,
} from "@/lib/data-authority";
import {
  buildNotificationPreview,
  type NotificationAdapter,
} from "@/lib/notifications/authority";
import { dispatchAuditedNotification } from "@/lib/notifications/server-delivery";
import { dispatchDurableNotification } from "@/lib/notifications/transactional";
import {
  fingerprintShareManifest,
  type ParsedShareManifest,
} from "@/lib/sharing/share-manifest";
import { buildShareNotificationRequests } from "@/lib/sharing/share-notifications";
import {
  createPreparedShareManifest,
  enforceShareCreationRate,
  findExistingShareManifest,
  prepareShareManifest,
  previewPreparedShareManifest,
  type PreparedShareManifest,
} from "@/lib/sharing/share-service";
import { createAtomicShareManifest } from "@/lib/sharing/share-transaction";

type CreatedShareIdentity = {
  asset_id: string;
  version_id: string;
  token: string;
};

type SerializedShareItem = Record<string, unknown> & CreatedShareIdentity;

function serializeRecoveredItems(
  manifest: PreparedShareManifest,
  rows: Array<Record<string, unknown>>,
): SerializedShareItem[] {
  const rowByVersion = new Map(
    rows.flatMap((row) =>
      typeof row.asset_id === "string" &&
      typeof row.version_id === "string" &&
      typeof row.token === "string"
        ? [[`${row.asset_id}:${row.version_id}`, row as SerializedShareItem] as const]
        : [],
    ),
  );
  return manifest.items.flatMap((item) => {
    const row = rowByVersion.get(`${item.assetId}:${item.version.id}`);
    if (!row) return [];
    return [
      {
        ...row,
        share_intent: item.shareIntent,
        policy_template_id: item.policy.id,
        version: {
          id: item.version.id,
          version_number: item.version.version_number,
          is_current: item.version.is_current,
        },
        approval_route: item.approvalRoute
          ? {
              approval_id: item.approvalRoute.approvalId,
              step_order: item.approvalRoute.stepOrder,
            }
          : null,
      },
    ];
  });
}

interface ShareNotificationDispatchDependencies {
  dataSchema?: SupabaseDataSchema;
  durableDispatch?: typeof dispatchDurableNotification;
  auditedDispatch?: typeof dispatchAuditedNotification;
}

export async function dispatchCreatedShareNotifications({
  manifest,
  createdItems,
  auditReceiptId,
  baseUrl,
  client,
  adapters,
  user,
  dependencies = {},
}: {
  manifest: PreparedShareManifest;
  createdItems: CreatedShareIdentity[];
  auditReceiptId: string | null;
  baseUrl: string;
  client: SupabaseClient;
  adapters: NotificationAdapter[];
  user: { id: string; email?: string | null };
  dependencies?: ShareNotificationDispatchDependencies;
}) {
  const authority = buildShareNotificationRequests({ manifest, createdItems, baseUrl });
  if (!authority.ok) {
    return [
      {
        ok: false as const,
        code: "notification_contract_changed",
        error: authority.error,
      },
    ];
  }

  const results: unknown[] = [];
  const dataSchema = dependencies.dataSchema ?? getSupabaseDataSchema();
  for (const notification of authority.requests) {
    if (dataSchema === CO_PRODUCTION_DATA_SCHEMA) {
      if (!auditReceiptId) {
        results.push({
          ok: false as const,
          status: 503,
          code: "share_audit_authority_unavailable",
          error:
            "Share links were created, but durable delivery is pending because the audit authority is unavailable",
        });
        continue;
      }
      results.push(
        await (dependencies.durableDispatch ?? dispatchDurableNotification)({
          request: notification.request,
          client,
          actorId: user.id,
          actorName: user.email ?? "Co-VideoPro operator",
          projectId: notification.projectId,
          assetId: notification.assetId,
          authorityReference: {
            kind: "share_manifest_created",
            id: auditReceiptId,
            scopeFingerprint: notification.recipientGroupFingerprint,
          },
        }),
      );
      continue;
    }
    results.push(
      await (dependencies.auditedDispatch ?? dispatchAuditedNotification)({
        request: notification.request,
        client,
        adapters,
        actorId: user.id,
        actorName: user.email ?? "Co-VideoPro operator",
        projectId: notification.projectId,
        assetId: notification.assetId,
      }),
    );
  }
  return results;
}

export function summarizeShareDeliveryStatus(results: unknown[]) {
  if (results.length === 0) return "not_requested" as const;
  if (
    results.some(
      (result) =>
        !result ||
        typeof result !== "object" ||
        !("ok" in result) ||
        result.ok !== true,
    )
  ) {
    return "delivery_pending" as const;
  }
  if (
    results.every(
      (result) =>
        result &&
        typeof result === "object" &&
        "mode" in result &&
        (result.mode === "queued" || result.mode === "suppressed"),
    )
  ) {
    return results.some(
      (result) =>
        result &&
        typeof result === "object" &&
        "mode" in result &&
        result.mode === "queued",
    )
      ? ("queued" as const)
      : ("suppressed" as const);
  }
  return "delivered" as const;
}

export async function executeShareManifest({
  manifest,
  user,
  client,
  baseUrl,
  adapters,
}: {
  manifest: ParsedShareManifest;
  user: { id: string; email?: string | null };
  client: SupabaseClient;
  baseUrl: string;
  adapters: NotificationAdapter[];
}) {
  const startedAt = performance.now();
  const prepared = await prepareShareManifest({ manifest, userId: user.id, client });
  if (!prepared.ok) {
    return {
      status: prepared.status,
      body: {
        error: prepared.error,
        item_index: prepared.item_index,
        mutation_performed: false,
      },
    };
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const manifestFingerprint = fingerprintShareManifest(prepared.value);
  const notificationAuthority = buildShareNotificationRequests({
    manifest: prepared.value,
    baseUrl: normalizedBaseUrl,
    forcePreview: manifest.operation === "preview",
  });
  if (!notificationAuthority.ok) {
    return {
      status: 400,
      body: {
        error: notificationAuthority.error,
        field: notificationAuthority.field,
        mutation_performed: false,
      },
    };
  }

  if (manifest.operation === "preview") {
    return {
      status: 200,
      body: {
        operation: "preview",
        mutation_performed: false,
        manifest: previewPreparedShareManifest(prepared.value),
        notifications: notificationAuthority.requests.map(({ request }) =>
          buildNotificationPreview(request, adapters),
        ),
        metrics: { duration_ms: Math.round((performance.now() - startedAt) * 100) / 100 },
      },
    };
  }

  if (getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA) {
    const atomic = await createAtomicShareManifest({
      manifest: prepared.value,
      manifestFingerprint,
      client,
      baseUrl: normalizedBaseUrl,
      adapters,
    });
    if (!atomic.ok) {
      return {
        status: atomic.status,
        body: {
          error: atomic.error,
          code: atomic.code,
          mutation_performed: atomic.mutationPerformed,
          retry_with_same_manifest: atomic.retryWithSameManifest,
          manifest_id: manifest.manifestId,
        },
      };
    }

    return {
      status: atomic.replayed ? 200 : 201,
      body: {
        operation: "create",
        mutation_performed: !atomic.replayed,
        deduplicated: atomic.replayed,
        manifest_id: manifest.manifestId,
        audit_receipt_id: atomic.receiptId,
        rate_limit_remaining: atomic.rateLimitRemaining,
        items: atomic.items,
        notifications: atomic.notifications,
        delivery_status: summarizeShareDeliveryStatus(atomic.notifications),
        metrics: {
          duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
        },
      },
    };
  }

  const existing = await findExistingShareManifest({
    client,
    actorId: user.id,
    manifestId: manifest.manifestId,
    manifestFingerprint,
  });
  if (!existing.ok) {
    return { status: existing.status, body: { error: existing.error, mutation_performed: false } };
  }
  if (existing.found) {
    const recoveredItems = serializeRecoveredItems(
      prepared.value,
      existing.invites as Array<Record<string, unknown>>,
    );
    if (recoveredItems.length !== prepared.value.items.length) {
      return {
        status: 409,
        body: {
          error: "The existing manifest receipt does not match the requested asset versions",
          mutation_performed: false,
        },
      };
    }
    const notificationResults = await dispatchCreatedShareNotifications({
      manifest: prepared.value,
      createdItems: recoveredItems,
      auditReceiptId: existing.receiptId,
      baseUrl: normalizedBaseUrl,
      client,
      adapters,
      user,
    });
    return {
      status: 200,
      body: {
        operation: "create",
        mutation_performed: false,
        deduplicated: true,
        manifest_id: manifest.manifestId,
        audit_receipt_id: existing.receiptId,
        items: recoveredItems,
        notifications: notificationResults,
        delivery_status: summarizeShareDeliveryStatus(notificationResults),
        metrics: { duration_ms: Math.round((performance.now() - startedAt) * 100) / 100 },
      },
    };
  }

  const rate = await enforceShareCreationRate({
    client,
    actorId: user.id,
    requestedLinks: prepared.value.items.length,
  });
  if (!rate.ok) {
    return {
      status: rate.status,
      body: {
        error: rate.error,
        retry_after_seconds: rate.retry_after_seconds,
        mutation_performed: false,
      },
    };
  }

  const created = await createPreparedShareManifest({
    manifest: prepared.value,
    manifestFingerprint,
    client,
    actor: { id: user.id, name: user.email ?? "Co-VideoPro operator" },
  });
  if (!created.ok) {
    return {
      status: created.status,
      body: {
        error: created.error,
        rollback_failed: created.rollback_failed ?? false,
        mutation_performed: Boolean(created.rollback_failed),
      },
    };
  }

  const notificationResults = await dispatchCreatedShareNotifications({
    manifest: prepared.value,
    createdItems: created.items,
    auditReceiptId: created.receiptId,
    baseUrl: normalizedBaseUrl,
    client,
    adapters,
    user,
  });

  return {
    status: 201,
    body: {
      operation: "create",
      mutation_performed: true,
      deduplicated: false,
      manifest_id: manifest.manifestId,
      audit_receipt_id: created.receiptId,
      rate_limit_remaining: rate.remaining,
      items: created.items,
      notifications: notificationResults,
      delivery_status: summarizeShareDeliveryStatus(notificationResults),
      metrics: { duration_ms: Math.round((performance.now() - startedAt) * 100) / 100 },
    },
  };
}

export function singleShareResponseBody(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? body.items : [];
  const item = items[0] as Record<string, unknown> | undefined;
  if (!item) return body;
  return {
    ...body,
    token: item.token,
    invite: item,
    version: item.version,
    notification: Array.isArray(body.notifications) ? body.notifications[0] ?? null : null,
  };
}

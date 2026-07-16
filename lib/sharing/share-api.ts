import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildNotificationPreview,
  type NotificationAdapter,
} from "@/lib/notifications/authority";
import { dispatchAuditedNotification } from "@/lib/notifications/server-delivery";
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

async function dispatchCreatedShareNotifications({
  manifest,
  createdItems,
  baseUrl,
  client,
  adapters,
  user,
}: {
  manifest: PreparedShareManifest;
  createdItems: CreatedShareIdentity[];
  baseUrl: string;
  client: SupabaseClient;
  adapters: NotificationAdapter[];
  user: { id: string; email?: string | null };
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
  for (const notification of authority.requests) {
    results.push(
      await dispatchAuditedNotification({
        request: notification.request,
        client,
        adapters,
        actorId: user.id,
        actorName: user.email ?? "Co-Production Pro operator",
        projectId: notification.projectId,
        assetId: notification.assetId,
      }),
    );
  }
  return results;
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
    actor: { id: user.id, name: user.email ?? "Co-Production Pro operator" },
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

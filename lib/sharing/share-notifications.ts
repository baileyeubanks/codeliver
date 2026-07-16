import crypto from "crypto";
import {
  parseNotificationRequest,
  type AuthorizedNotificationRequest,
} from "@/lib/notifications/authority";
import type { PreparedShareManifest } from "@/lib/sharing/share-service";

type CreatedShareItem = {
  asset_id: string;
  version_id: string;
  token: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function groupKey(item: PreparedShareManifest["items"][number]) {
  return JSON.stringify([
    item.recipient.email,
    item.recipient.phone,
    item.recipient.imessageHandle,
  ]);
}

function recipientKeySuffix(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function scopedIdempotencyKey(base: unknown, key: string, multipleRecipients: boolean) {
  if (typeof base !== "string" || !base.trim()) return base;
  if (!multipleRecipients) return base.trim();
  return `${base.trim().slice(0, 114)}:${recipientKeySuffix(key)}`;
}

export function buildShareNotificationRequests({
  manifest,
  createdItems = [],
  baseUrl,
  forcePreview = false,
}: {
  manifest: PreparedShareManifest;
  createdItems?: CreatedShareItem[];
  baseUrl: string;
  forcePreview?: boolean;
}):
  | {
      ok: true;
      action: "not_requested" | "preview" | "send";
      requests: Array<{
        request: AuthorizedNotificationRequest;
        assetId: string;
        projectId: string;
      }>;
    }
  | { ok: false; error: string; field?: string } {
  if (!isRecord(manifest.notification) || manifest.notification.action === "none") {
    return { ok: true, action: "not_requested", requests: [] };
  }

  const requestedAction = manifest.notification.action;
  if (requestedAction !== "preview" && requestedAction !== "send") {
    return { ok: false, error: "notification.action must be none, preview, or send", field: "notification.action" };
  }

  const groups = new Map<string, PreparedShareManifest["items"]>();
  for (const item of manifest.items) {
    const key = groupKey(item);
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }
  const createdByVersion = new Map(
    createdItems.map((item) => [`${item.asset_id}:${item.version_id}`, item]),
  );
  const requests: Array<{
    request: AuthorizedNotificationRequest;
    assetId: string;
    projectId: string;
  }> = [];

  for (const [key, items] of groups) {
    const links = items.map((item) => {
      const created = createdByVersion.get(`${item.assetId}:${item.version.id}`);
      return created
        ? `${baseUrl}/review/${created.token}`
        : `${baseUrl}/review/link-created-after-confirmation`;
    });
    const itemLines = items.map(
      (item, index) => `${item.asset.title} v${item.version.version_number}: ${links[index]}`,
    );
    const message = {
      title:
        items.length === 1
          ? `${items[0].asset.title} v${items[0].version.version_number} is ready`
          : `${items.length} Co-Production Pro assets are ready`,
      body: itemLines.join("\n"),
      action_url: links[0],
    };
    const recipient = items[0].recipient;
    const parsed = parseNotificationRequest(
      {
        ...manifest.notification,
        action: forcePreview ? "preview" : requestedAction,
        tenant_id: manifest.tenantId,
        event_type: items.length === 1 ? "share_link_ready" : "share_manifest_ready",
        purpose: "transactional",
        recipient: {
          name: recipient.name,
          email: recipient.email,
          phone: recipient.phone,
          imessage_handle: recipient.imessageHandle,
        },
        message,
        idempotency_key: scopedIdempotencyKey(
          manifest.notification.idempotency_key,
          key,
          groups.size > 1,
        ),
      },
      {
        authenticatedTenantId: manifest.tenantId,
        allowedOrigin: baseUrl,
        forcePreview,
      },
    );
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        field: parsed.field ? `notification.${parsed.field}` : "notification",
      };
    }

    requests.push({
      request: parsed.value,
      assetId: items.length === 1 ? items[0].assetId : items[0].assetId,
      projectId: items[0].asset.project_id,
    });
  }

  return {
    ok: true,
    action: forcePreview ? "preview" : requestedAction,
    requests,
  };
}

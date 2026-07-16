import crypto from "crypto";

export const SHARE_MANIFEST_MAX_ITEMS = 20;
export const SHARE_MAX_VIEWS = 10_000;

export type ShareManifestOperation = "preview" | "create";
export type ShareManifestIntent =
  | "internal_review"
  | "client_review"
  | "approval_needed"
  | "final_delivery";
export type ShareManifestPermission = "view" | "comment" | "approve";
export type SharePolicyTemplateId =
  | "standard-review"
  | "approval-route"
  | "final-delivery"
  | "regulated-review";

export interface ShareRecipientIdentity {
  name: string | null;
  email: string | null;
  phone: string | null;
  imessageHandle: string | null;
}

export interface SharePolicyTemplate {
  id: SharePolicyTemplateId;
  label: string;
  intents: ShareManifestIntent[];
  allowedPermissions: ShareManifestPermission[];
  maxExpiryDays: number;
  maxItems: number;
  requireRecipientEmail: boolean;
  watermarkRule: "optional" | "required";
  downloadRule: "optional" | "required" | "forbidden";
  auditRetentionDays: number;
}

export interface ParsedShareManifestItem {
  assetId: string;
  versionId: string;
  shareIntent: ShareManifestIntent;
  policy: SharePolicyTemplate & { tenantId: string };
  recipient: ShareRecipientIdentity;
  permissions: ShareManifestPermission;
  expiresAt: string;
  watermarkEnabled: boolean;
  watermarkText: string | null;
  downloadEnabled: boolean;
  maxViews: number | null;
}

export interface ParsedShareManifest {
  operation: ShareManifestOperation;
  manifestId: string;
  tenantId: string;
  items: ParsedShareManifestItem[];
  notification: unknown;
}

export type ShareManifestParseResult =
  | { ok: true; value: ParsedShareManifest }
  | { ok: false; error: string; field?: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function canonicalizeManifestValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(canonicalizeManifestValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalizeManifestValue(record[key])]),
    );
  }
  return null;
}

/** A non-reversible receipt binding; the plaintext manifest is never written to audit details. */
export function fingerprintShareManifest(
  manifest: Pick<ParsedShareManifest, "tenantId" | "items" | "notification">,
) {
  const items = manifest.items
    .map((item) => ({
      asset_id: item.assetId,
      version_id: item.versionId,
      share_intent: item.shareIntent,
      policy_template_id: item.policy.id,
      recipient: item.recipient,
      permissions: item.permissions,
      expires_at: item.expiresAt,
      watermark_enabled: item.watermarkEnabled,
      watermark_text: item.watermarkText,
      download_enabled: item.downloadEnabled,
      max_views: item.maxViews,
    }))
    .sort((left, right) => {
      const leftKey = `${left.asset_id}:${left.version_id}`;
      const rightKey = `${right.asset_id}:${right.version_id}`;
      return leftKey.localeCompare(rightKey);
    });

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tenant_id: manifest.tenantId,
        items,
        notification: canonicalizeManifestValue(manifest.notification),
      }),
    )
    .digest("hex");
}

export const SHARE_POLICY_TEMPLATES: Record<SharePolicyTemplateId, SharePolicyTemplate> = {
  "standard-review": {
    id: "standard-review",
    label: "Standard review",
    intents: ["internal_review", "client_review"],
    allowedPermissions: ["view", "comment"],
    maxExpiryDays: 30,
    maxItems: SHARE_MANIFEST_MAX_ITEMS,
    requireRecipientEmail: false,
    watermarkRule: "optional",
    downloadRule: "optional",
    auditRetentionDays: 365,
  },
  "approval-route": {
    id: "approval-route",
    label: "Approval route",
    intents: ["approval_needed"],
    allowedPermissions: ["approve"],
    maxExpiryDays: 14,
    maxItems: SHARE_MANIFEST_MAX_ITEMS,
    requireRecipientEmail: true,
    watermarkRule: "optional",
    downloadRule: "forbidden",
    auditRetentionDays: 2_555,
  },
  "final-delivery": {
    id: "final-delivery",
    label: "Final delivery",
    intents: ["final_delivery"],
    allowedPermissions: ["view"],
    maxExpiryDays: 30,
    maxItems: SHARE_MANIFEST_MAX_ITEMS,
    requireRecipientEmail: false,
    watermarkRule: "optional",
    downloadRule: "optional",
    auditRetentionDays: 365,
  },
  "regulated-review": {
    id: "regulated-review",
    label: "Regulated review",
    intents: ["internal_review", "client_review", "final_delivery"],
    allowedPermissions: ["view", "comment"],
    maxExpiryDays: 7,
    maxItems: 10,
    requireRecipientEmail: true,
    watermarkRule: "required",
    downloadRule: "forbidden",
    auditRetentionDays: 2_555,
  },
};

const INTENT_DEFAULTS: Record<
  ShareManifestIntent,
  {
    permission: ShareManifestPermission;
    expiresInDays: number;
    watermarkEnabled: boolean;
    downloadEnabled: boolean;
    templateId: SharePolicyTemplateId;
  }
> = {
  internal_review: {
    permission: "comment",
    expiresInDays: 7,
    watermarkEnabled: true,
    downloadEnabled: false,
    templateId: "standard-review",
  },
  client_review: {
    permission: "comment",
    expiresInDays: 7,
    watermarkEnabled: false,
    downloadEnabled: false,
    templateId: "standard-review",
  },
  approval_needed: {
    permission: "approve",
    expiresInDays: 7,
    watermarkEnabled: false,
    downloadEnabled: false,
    templateId: "approval-route",
  },
  final_delivery: {
    permission: "view",
    expiresInDays: 14,
    watermarkEnabled: false,
    downloadEnabled: true,
    templateId: "final-delivery",
  },
};

function fail(error: string, field?: string): ShareManifestParseResult {
  return { ok: false, error, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, maxLength: number) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) return undefined;
  return normalized;
}

function normalizeIntent(value: unknown): ShareManifestIntent | null {
  return value === "internal_review" ||
    value === "client_review" ||
    value === "approval_needed" ||
    value === "final_delivery"
    ? value
    : null;
}

function normalizePermission(value: unknown): ShareManifestPermission | null {
  return value === "view" || value === "comment" || value === "approve" ? value : null;
}

function normalizePolicyId(value: unknown): SharePolicyTemplateId | null {
  return value === "standard-review" ||
    value === "approval-route" ||
    value === "final-delivery" ||
    value === "regulated-review"
    ? value
    : null;
}

function normalizeEmail(value: unknown) {
  const email = stringValue(value, 254);
  if (email === undefined) return undefined;
  if (email === null) return null;
  const normalized = email.toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizePhone(value: unknown) {
  const phone = stringValue(value, 32);
  if (phone === undefined) return undefined;
  if (phone === null) return null;
  const normalized = phone.replace(/[\s().-]/g, "");
  return E164_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizeImessageHandle(value: unknown) {
  const handle = stringValue(value, 254);
  if (handle === undefined) return undefined;
  if (handle === null) return null;
  const email = normalizeEmail(handle);
  if (email) return email;
  const phone = normalizePhone(handle);
  return phone || undefined;
}

function normalizeExpiry(value: unknown, fallbackDays: number, now: Date) {
  if (value == null || value === "") {
    return new Date(now.getTime() + fallbackDays * DAY_MS).toISOString();
  }
  if (typeof value !== "string" || value.length > 64) return null;
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function ownValue(item: Record<string, unknown>, root: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(item, key) ? item[key] : root[key];
}

function parseRecipient(
  item: Record<string, unknown>,
  root: Record<string, unknown>,
): { ok: true; value: ShareRecipientIdentity } | { ok: false; error: string; field: string } {
  const recipient = isRecord(item.recipient)
    ? item.recipient
    : isRecord(root.recipient)
      ? root.recipient
      : {};
  const name = stringValue(
    recipient.name ?? ownValue(item, root, "reviewer_name"),
    120,
  );
  const email = normalizeEmail(
    recipient.email ?? ownValue(item, root, "reviewer_email"),
  );
  const phone = normalizePhone(
    recipient.phone ?? ownValue(item, root, "reviewer_phone"),
  );
  const imessageHandle = normalizeImessageHandle(
    recipient.imessage_handle ?? ownValue(item, root, "reviewer_imessage_handle"),
  );

  if (name === undefined) return { ok: false, error: "Recipient name is too long", field: "recipient.name" };
  if (email === undefined) return { ok: false, error: "Recipient email is invalid", field: "recipient.email" };
  if (phone === undefined) return { ok: false, error: "Recipient phone must use E.164 format", field: "recipient.phone" };
  if (imessageHandle === undefined) {
    return {
      ok: false,
      error: "iMessage handle must be an email address or E.164 phone number",
      field: "recipient.imessage_handle",
    };
  }

  return { ok: true, value: { name, email, phone, imessageHandle } };
}

function parseManifest(
  input: unknown,
  context: { authenticatedTenantId: string; fixedAssetId?: string; now?: Date },
): ShareManifestParseResult {
  if (!isRecord(input)) return fail("A JSON object is required");

  const now = context.now ?? new Date();
  const operation = input.operation;
  if (operation !== "preview" && operation !== "create") {
    return fail("operation must be preview or create", "operation");
  }

  const manifestId = stringValue(input.manifest_id ?? input.request_id, 128);
  if (!manifestId || !REQUEST_ID_PATTERN.test(manifestId)) {
    return fail(
      "manifest_id must be 8-128 letters, numbers, dots, colons, underscores, or hyphens",
      "manifest_id",
    );
  }

  const requestedTenantId = stringValue(input.tenant_id, 128);
  if (requestedTenantId === undefined) return fail("tenant_id is invalid", "tenant_id");
  if (requestedTenantId && requestedTenantId !== context.authenticatedTenantId) {
    return fail("The policy tenant does not match the authenticated tenant", "tenant_id");
  }
  const tenantId = context.authenticatedTenantId;

  let rawItems: unknown[];
  if (context.fixedAssetId) {
    if (input.items !== undefined) {
      return fail("Single-asset sharing does not accept an items array", "items");
    }
    rawItems = [{ ...input, asset_id: context.fixedAssetId }];
  } else {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      return fail("items must contain at least one asset version", "items");
    }
    rawItems = input.items;
  }

  if (rawItems.length > SHARE_MANIFEST_MAX_ITEMS) {
    return fail(`A manifest can contain at most ${SHARE_MANIFEST_MAX_ITEMS} asset versions`, "items");
  }

  const parsedItems: ParsedShareManifestItem[] = [];
  const seenVersions = new Set<string>();

  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index];
    const prefix = `items[${index}]`;
    if (!isRecord(item)) return fail("Each manifest item must be an object", prefix);

    const assetId = stringValue(item.asset_id, 128);
    const versionId = stringValue(item.version_id, 128);
    if (!assetId) return fail("asset_id is required", `${prefix}.asset_id`);
    if (!versionId) {
      return fail("version_id is required so every link binds to immutable media", `${prefix}.version_id`);
    }
    if (context.fixedAssetId && assetId !== context.fixedAssetId) {
      return fail("asset_id does not match the route asset", `${prefix}.asset_id`);
    }

    const versionKey = `${assetId}:${versionId}`;
    if (seenVersions.has(versionKey)) {
      return fail("A manifest cannot contain the same asset version twice", `${prefix}.version_id`);
    }
    seenVersions.add(versionKey);

    const rawIntent = ownValue(item, input, "share_intent") ?? "client_review";
    const shareIntent = normalizeIntent(rawIntent);
    if (!shareIntent) return fail("share_intent is invalid", `${prefix}.share_intent`);
    const defaults = INTENT_DEFAULTS[shareIntent];

    const rawPolicyId = ownValue(item, input, "policy_template_id") ?? defaults.templateId;
    const policyId = normalizePolicyId(rawPolicyId);
    if (!policyId) return fail("policy_template_id is invalid", `${prefix}.policy_template_id`);
    const policy = SHARE_POLICY_TEMPLATES[policyId];
    if (!policy.intents.includes(shareIntent)) {
      return fail(`${policy.label} cannot govern ${shareIntent}`, `${prefix}.policy_template_id`);
    }
    if (rawItems.length > policy.maxItems) {
      return fail(`${policy.label} allows at most ${policy.maxItems} items`, "items");
    }

    const rawPermission = ownValue(item, input, "permissions");
    const permission = rawPermission == null ? defaults.permission : normalizePermission(rawPermission);
    if (!permission) return fail("permissions is invalid", `${prefix}.permissions`);
    if (!policy.allowedPermissions.includes(permission)) {
      return fail(`${policy.label} does not allow ${permission} permission`, `${prefix}.permissions`);
    }

    const recipientResult = parseRecipient(item, input);
    if (!recipientResult.ok) {
      return fail(recipientResult.error, `${prefix}.${recipientResult.field}`);
    }
    const recipient = recipientResult.value;
    if ((policy.requireRecipientEmail || shareIntent === "approval_needed") && !recipient.email) {
      return fail(`${policy.label} requires a recipient email`, `${prefix}.recipient.email`);
    }

    const expiresAt = normalizeExpiry(
      ownValue(item, input, "expires_at"),
      defaults.expiresInDays,
      now,
    );
    if (!expiresAt) return fail("expires_at is invalid", `${prefix}.expires_at`);
    const expiresMs = new Date(expiresAt).getTime();
    if (expiresMs <= now.getTime() + 5 * 60 * 1000) {
      return fail("expires_at must be at least five minutes in the future", `${prefix}.expires_at`);
    }
    if (expiresMs > now.getTime() + (policy.maxExpiryDays + 1) * DAY_MS) {
      return fail(
        `${policy.label} limits expiration to ${policy.maxExpiryDays} days`,
        `${prefix}.expires_at`,
      );
    }

    const rawWatermark = ownValue(item, input, "watermark_enabled");
    if (rawWatermark != null && typeof rawWatermark !== "boolean") {
      return fail("watermark_enabled must be boolean", `${prefix}.watermark_enabled`);
    }
    const watermarkEnabled =
      policy.watermarkRule === "required"
        ? true
        : typeof rawWatermark === "boolean"
          ? rawWatermark
          : defaults.watermarkEnabled;
    if (policy.watermarkRule === "required" && rawWatermark === false) {
      return fail(`${policy.label} requires a watermark`, `${prefix}.watermark_enabled`);
    }
    const requestedWatermarkText = stringValue(ownValue(item, input, "watermark_text"), 160);
    if (requestedWatermarkText === undefined) {
      return fail("watermark_text is too long", `${prefix}.watermark_text`);
    }
    const watermarkText = watermarkEnabled
      ? requestedWatermarkText || recipient.email || recipient.name || "Confidential"
      : null;

    const rawDownload = ownValue(item, input, "download_enabled");
    if (rawDownload != null && typeof rawDownload !== "boolean") {
      return fail("download_enabled must be boolean", `${prefix}.download_enabled`);
    }
    const downloadEnabled =
      policy.downloadRule === "required"
        ? true
        : policy.downloadRule === "forbidden"
          ? false
          : typeof rawDownload === "boolean"
            ? rawDownload
            : defaults.downloadEnabled;
    if (policy.downloadRule === "forbidden" && rawDownload === true) {
      return fail(`${policy.label} forbids downloads`, `${prefix}.download_enabled`);
    }
    if (policy.downloadRule === "required" && rawDownload === false) {
      return fail(`${policy.label} requires downloads`, `${prefix}.download_enabled`);
    }

    const rawMaxViews = ownValue(item, input, "max_views");
    const maxViews = rawMaxViews == null || rawMaxViews === "" ? null : rawMaxViews;
    if (
      maxViews !== null &&
      (typeof maxViews !== "number" ||
        !Number.isInteger(maxViews) ||
        maxViews < 1 ||
        maxViews > SHARE_MAX_VIEWS)
    ) {
      return fail(`max_views must be an integer from 1 to ${SHARE_MAX_VIEWS}`, `${prefix}.max_views`);
    }

    parsedItems.push({
      assetId,
      versionId,
      shareIntent,
      policy: { ...policy, tenantId },
      recipient,
      permissions: permission,
      expiresAt,
      watermarkEnabled,
      watermarkText,
      downloadEnabled,
      maxViews: maxViews as number | null,
    });
  }

  return {
    ok: true,
    value: {
      operation,
      manifestId,
      tenantId,
      items: parsedItems,
      notification: input.notification ?? null,
    },
  };
}

export function parseSingleShareRequest(
  input: unknown,
  context: { authenticatedTenantId: string; assetId: string; now?: Date },
) {
  return parseManifest(input, {
    authenticatedTenantId: context.authenticatedTenantId,
    fixedAssetId: context.assetId,
    now: context.now,
  });
}

export function parseBatchShareManifest(
  input: unknown,
  context: { authenticatedTenantId: string; now?: Date },
) {
  return parseManifest(input, {
    authenticatedTenantId: context.authenticatedTenantId,
    now: context.now,
  });
}

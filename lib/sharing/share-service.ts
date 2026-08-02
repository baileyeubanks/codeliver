import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAssetAccess, type AccessibleAsset } from "@/lib/access-control";
import type {
  ParsedShareManifest,
  ParsedShareManifestItem,
  ShareManifestIntent,
} from "@/lib/sharing/share-manifest";
import {
  persistedOpaqueTokenFields,
  recoverOpaqueToken,
  withoutPersistedTokenSecrets,
} from "@/lib/security/opaque-token";
import { hashReviewPassword } from "@/lib/security/review-password";
import type { Version } from "@/lib/types/codeliver";
import { resolveAssetVersion } from "@/lib/versions";

const SHARE_RATE_LIMIT = 100;
const SHARE_RATE_WINDOW_MS = 10 * 60 * 1000;

interface ApprovalRoute {
  approvalId: string;
  stepOrder: number;
}

export interface PreparedShareItem extends ParsedShareManifestItem {
  asset: AccessibleAsset;
  version: Version;
  approvalRoute: ApprovalRoute | null;
}

export interface PreparedShareManifest extends Omit<ParsedShareManifest, "items"> {
  items: PreparedShareItem[];
}

export type ReviewInviteRow = {
  id: string;
  asset_id: string;
  version_id: string;
  approval_id: string | null;
  token?: string;
  token_hash?: string;
  token_ciphertext?: string;
  password_hash?: string | null;
  password_protected?: boolean;
  permissions: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  expires_at: string;
  watermark_enabled: boolean;
  watermark_text: string | null;
  download_enabled: boolean;
  max_views: number | null;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string | null;
  created_at: string;
};

function normalizedEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function retentionDate(days: number, now: Date) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

function withoutShareSecrets(row: Record<string, unknown>) {
  const safe = withoutPersistedTokenSecrets(row);
  delete safe.password_hash;
  return safe;
}

export function serializePreparedShareInvite(
  row: ReviewInviteRow,
  item: PreparedShareItem,
  token: string,
) {
  return {
    ...withoutShareSecrets(row as unknown as Record<string, unknown>),
    asset_id: row.asset_id,
    version_id: row.version_id,
    token,
    password_protected: Boolean(item.password),
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
  };
}

async function resolveApprovalRoute({
  client,
  item,
  versionId,
}: {
  client: SupabaseClient;
  item: ParsedShareManifestItem;
  versionId: string;
}) {
  if (item.shareIntent !== "approval_needed") {
    return { ok: true as const, route: null };
  }

  if (!item.approvalId) {
    return {
      ok: false as const,
      status: 400,
      error: "Approval-needed shares must identify one approval step",
    };
  }

  const { data, error } = await client
    .from("approvals")
    .select("id, step_order, assignee_email, status")
    .eq("id", item.approvalId)
    .eq("asset_id", item.assetId)
    .eq("version_id", versionId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };

  const reviewerEmail = normalizedEmail(item.recipient.email);
  if (!data || normalizedEmail(data.assignee_email) !== reviewerEmail) {
    return {
      ok: false as const,
      status: 409,
      error: "The approval step is not assigned to this recipient for this asset version",
    };
  }

  return {
    ok: true as const,
    route: { approvalId: data.id, stepOrder: data.step_order } satisfies ApprovalRoute,
  };
}

export async function prepareShareManifest({
  manifest,
  userId,
  client,
}: {
  manifest: ParsedShareManifest;
  userId: string;
  client: SupabaseClient;
}): Promise<
  | { ok: true; value: PreparedShareManifest }
  | { ok: false; status: number; error: string; item_index?: number }
> {
  const minimumRole = manifest.operation === "preview" ? "editor" : "producer";
  const results = await Promise.all(
    manifest.items.map(async (item) => {
      const assetAccess = await getAssetAccess(
        item.assetId,
        userId,
        minimumRole,
        client,
      );
      if (!assetAccess.ok) return assetAccess;

      const versionLookup = await resolveAssetVersion({
        assetId: item.assetId,
        versionId: item.versionId,
        client,
      });
      if (!versionLookup.ok) return versionLookup;

      const approvalRoute = await resolveApprovalRoute({
        client,
        item,
        versionId: versionLookup.version.id,
      });
      if (!approvalRoute.ok) return approvalRoute;

      return {
        ok: true as const,
        item: {
          ...item,
          asset: assetAccess.data,
          version: versionLookup.version,
          approvalRoute: approvalRoute.route,
        } satisfies PreparedShareItem,
      };
    }),
  );

  const failedIndex = results.findIndex((result) => !result.ok);
  if (failedIndex >= 0) {
    const failure = results[failedIndex];
    if (failure.ok) throw new Error("Unreachable manifest validation state");
    return { ok: false, status: failure.status, error: failure.error, item_index: failedIndex };
  }

  const preparedItems = results.map((result) => {
    if (!result.ok) throw new Error("Unreachable manifest validation state");
    return result.item;
  });
  const tenantKeys = new Set(
    preparedItems.map((item) => item.asset.tenant_authority.key),
  );
  if (tenantKeys.size !== 1) {
    return {
      ok: false,
      status: 409,
      error: "All shared asset versions must belong to the same workspace",
    };
  }
  const tenantId = preparedItems[0].asset.tenant_authority.key;

  return {
    ok: true,
    value: {
      ...manifest,
      tenantId,
      items: preparedItems.map((item) => ({
        ...item,
        policy: { ...item.policy, tenantId },
      })),
    },
  };
}

export function previewPreparedShareManifest(manifest: PreparedShareManifest) {
  return {
    manifest_id: manifest.manifestId,
    tenant_id: manifest.tenantId,
    item_count: manifest.items.length,
    items: manifest.items.map((item) => ({
      asset: { id: item.asset.id, title: item.asset.title },
      version: {
        id: item.version.id,
        version_number: item.version.version_number,
        is_current: item.version.is_current,
      },
      share_intent: item.shareIntent,
      policy_template_id: item.policy.id,
      recipient: {
        name: item.recipient.name,
        email: item.recipient.email,
      },
      permissions: item.permissions,
      expires_at: item.expiresAt,
      watermark_enabled: item.watermarkEnabled,
      download_enabled: item.downloadEnabled,
      max_views: item.maxViews,
      password_protected: Boolean(item.password),
      approval_route: item.approvalRoute
        ? {
            approval_id: item.approvalRoute.approvalId,
            step_order: item.approvalRoute.stepOrder,
          }
        : null,
    })),
  };
}

export async function enforceShareCreationRate({
  client,
  actorId,
  requestedLinks,
  now = new Date(),
}: {
  client: SupabaseClient;
  actorId: string;
  requestedLinks: number;
  now?: Date;
}) {
  const { data, error } = await client
    .from("activity_log")
    .select("details")
    .eq("actor_id", actorId)
    .eq("action", "share_manifest_created")
    .gte("created_at", new Date(now.getTime() - SHARE_RATE_WINDOW_MS).toISOString());
  if (error) {
    return {
      ok: false as const,
      status: 503,
      error: "Share rate authority is unavailable; no links were created",
    };
  }

  const linksInWindow = (data ?? []).reduce((total, row) => {
    const count = row.details?.link_count;
    return total + (typeof count === "number" && Number.isFinite(count) ? count : 0);
  }, 0);
  if (requestedLinks < 1 || linksInWindow + requestedLinks > SHARE_RATE_LIMIT) {
    return {
      ok: false as const,
      status: 429,
      error: "Share link creation rate exceeded",
      retry_after_seconds: Math.ceil(SHARE_RATE_WINDOW_MS / 1000),
    };
  }

  return { ok: true as const, remaining: SHARE_RATE_LIMIT - linksInWindow - requestedLinks };
}

export async function findExistingShareManifest({
  client,
  actorId,
  manifestId,
  manifestFingerprint,
}: {
  client: SupabaseClient;
  actorId: string;
  manifestId: string;
  manifestFingerprint: string;
}) {
  const receipt = await client
    .from("activity_log")
    .select("id, details, created_at")
    .eq("actor_id", actorId)
    .eq("action", "share_manifest_created")
    .contains("details", { manifest_id: manifestId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (receipt.error) {
    return { ok: false as const, status: 503, error: "Share deduplication is unavailable" };
  }
  if (!receipt.data) return { ok: true as const, found: false as const };
  if (receipt.data.details?.manifest_fingerprint !== manifestFingerprint) {
    return {
      ok: false as const,
      status: 409,
      error: "This manifest_id is already bound to a different sharing request",
    };
  }

  const inviteIds = Array.isArray(receipt.data.details?.invite_ids)
    ? receipt.data.details.invite_ids.filter((value: unknown): value is string => typeof value === "string")
    : [];
  if (inviteIds.length === 0) {
    return {
      ok: false as const,
      status: 409,
      error: "A manifest receipt exists without recoverable share links",
    };
  }

  const invites = await client.from("review_invites").select("*").in("id", inviteIds);
  if (invites.error) return { ok: false as const, status: 503, error: invites.error.message };
  let recoveredInvites: ReviewInviteRow[];
  try {
    recoveredInvites = (invites.data ?? []).map((row) => ({
      ...withoutShareSecrets(row as Record<string, unknown>),
      token: recoverOpaqueToken(row as Record<string, unknown>),
      password_protected: Boolean(row.password_hash),
    })) as ReviewInviteRow[];
  } catch {
    return {
      ok: false as const,
      status: 503,
      error: "Stored share links could not be securely recovered",
    };
  }
  return {
    ok: true as const,
    found: true as const,
    receiptId: receipt.data.id,
    invites: recoveredInvites,
    itemMetadata: Array.isArray(receipt.data.details?.items) ? receipt.data.details.items : [],
  };
}

export async function createPreparedShareManifest({
  manifest,
  manifestFingerprint,
  client,
  actor,
  now = new Date(),
}: {
  manifest: PreparedShareManifest;
  manifestFingerprint: string;
  client: SupabaseClient;
  actor: { id: string; name: string };
  now?: Date;
}) {
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
      ok: false as const,
      status: 503,
      error: "Share password protection is unavailable; no links were created",
    };
  }
  const rows = manifest.items.map((item, index) => ({
    asset_id: item.assetId,
    version_id: item.version.id,
    approval_id: item.approvalRoute?.approvalId ?? null,
    ...persistedOpaqueTokenFields(tokens[index]),
    permissions: item.permissions,
    created_by: actor.id,
    reviewer_email: item.recipient.email,
    reviewer_name: item.recipient.name,
    expires_at: item.expiresAt,
    watermark_enabled: item.watermarkEnabled,
    watermark_text: item.watermarkText,
    download_enabled: item.downloadEnabled,
    max_views: item.maxViews,
    password_hash: passwordHashes[index],
  }));
  const inserted = await client.from("review_invites").insert(rows).select();
  if (inserted.error || !inserted.data || inserted.data.length !== rows.length) {
    return {
      ok: false as const,
      status: 500,
      error: inserted.error?.message || "The complete share manifest could not be created",
    };
  }

  const insertedRows = inserted.data as ReviewInviteRow[];
  const rowByVersion = new Map(
    insertedRows.map((row) => [`${row.asset_id}:${row.version_id}`, row]),
  );
  const orderedRows = manifest.items.map((item) => rowByVersion.get(`${item.assetId}:${item.version.id}`));
  if (orderedRows.some((row) => !row)) {
    await client.from("review_invites").delete().in("id", insertedRows.map((row) => row.id));
    return { ok: false as const, status: 500, error: "Share manifest response was incomplete" };
  }

  const itemDetails = manifest.items.map((item, index) => {
    const row = orderedRows[index] as ReviewInviteRow;
    return {
      invite_id: row.id,
      asset_id: item.assetId,
      version_id: item.version.id,
      version_number: item.version.version_number,
      share_intent: item.shareIntent,
      policy_template_id: item.policy.id,
      permissions: item.permissions,
      download_enabled: item.downloadEnabled,
      watermark_enabled: item.watermarkEnabled,
      password_protected: Boolean(item.password),
      expires_at: item.expiresAt,
      approval_id: item.approvalRoute?.approvalId ?? null,
      retention_class: "share_authority",
      retain_until: retentionDate(item.policy.auditRetentionDays, now),
    };
  });
  const auditRows = [
    ...manifest.items.map((item, index) => ({
      project_id: item.asset.project_id,
      asset_id: item.assetId,
      actor_id: actor.id,
      actor_name: actor.name,
      action: "share_link_created",
      details: { manifest_id: manifest.manifestId, ...itemDetails[index] },
    })),
    {
      project_id: manifest.items[0].asset.project_id,
      asset_id: manifest.items.length === 1 ? manifest.items[0].assetId : null,
      actor_id: actor.id,
      actor_name: actor.name,
      action: "share_manifest_created",
      details: {
        tenant_id: manifest.tenantId,
        manifest_id: manifest.manifestId,
        manifest_fingerprint: manifestFingerprint,
        link_count: manifest.items.length,
        invite_ids: orderedRows.map((row) => (row as ReviewInviteRow).id),
        items: itemDetails,
        retention_class: "share_manifest",
        retain_until: retentionDate(
          Math.max(...manifest.items.map((item) => item.policy.auditRetentionDays)),
          now,
        ),
      },
    },
  ];
  const audit = await client.from("activity_log").insert(auditRows).select("id, action");
  if (audit.error) {
    const rollback = await client
      .from("review_invites")
      .delete()
      .in("id", insertedRows.map((row) => row.id));
    return {
      ok: false as const,
      status: 503,
      error: rollback.error
        ? "Share audit failed and inserted links could not be rolled back"
        : "Share audit failed; no links were retained",
      rollback_failed: Boolean(rollback.error),
    };
  }

  const receipt = (audit.data ?? []).find((row) => row.action === "share_manifest_created");
  return {
    ok: true as const,
    receiptId: receipt?.id ?? null,
    items: manifest.items.map((item, index) =>
      serializePreparedShareInvite(
        orderedRows[index] as ReviewInviteRow,
        item,
        tokens[index],
      ),
    ),
  };
}

export async function revokeShareLink({
  client,
  assetId,
  inviteId,
  actor,
  now = new Date(),
}: {
  client: SupabaseClient;
  assetId: string;
  inviteId: string;
  actor: { id: string; name: string };
  now?: Date;
}) {
  const existing = await client
    .from("review_invites")
    .select("id, version_id, expires_at")
    .eq("id", inviteId)
    .eq("asset_id", assetId)
    .maybeSingle();
  if (existing.error) return { ok: false as const, status: 500, error: existing.error.message };
  if (!existing.data) return { ok: false as const, status: 404, error: "Share link not found" };

  const alreadyRevoked =
    existing.data.expires_at && new Date(existing.data.expires_at).getTime() <= now.getTime();
  if (!alreadyRevoked) {
    const revoked = await client
      .from("review_invites")
      .update({ expires_at: now.toISOString() })
      .eq("id", inviteId)
      .eq("asset_id", assetId);
    if (revoked.error) return { ok: false as const, status: 500, error: revoked.error.message };
  }

  const audit = await client
    .from("activity_log")
    .insert({
      asset_id: assetId,
      actor_id: actor.id,
      actor_name: actor.name,
      action: "share_link_revoked",
      details: {
        invite_id: inviteId,
        version_id: existing.data.version_id,
        already_revoked: Boolean(alreadyRevoked),
        retention_class: "share_authority",
        retain_until: retentionDate(2_555, now),
      },
    })
    .select("id")
    .single();

  return audit.error
    ? {
        ok: false as const,
        status: 503,
        error: "The link was revoked but its audit receipt could not be recorded",
        revoked: true,
      }
    : { ok: true as const, revoked: true, alreadyRevoked: Boolean(alreadyRevoked), receiptId: audit.data.id };
}

export async function rotateShareLink({
  client,
  assetId,
  inviteId,
  requestId,
  actor,
  now = new Date(),
}: {
  client: SupabaseClient;
  assetId: string;
  inviteId: string;
  requestId: string;
  actor: { id: string; name: string };
  now?: Date;
}) {
  const priorReceipt = await client
    .from("activity_log")
    .select("id, details")
    .eq("actor_id", actor.id)
    .eq("action", "share_link_rotated")
    .contains("details", { request_id: requestId, old_invite_id: inviteId })
    .limit(1)
    .maybeSingle();
  if (priorReceipt.error) {
    return { ok: false as const, status: 503, error: "Rotation deduplication is unavailable" };
  }
  if (priorReceipt.data?.details?.new_invite_id) {
    const recovered = await client
      .from("review_invites")
      .select("*")
      .eq("id", priorReceipt.data.details.new_invite_id)
      .eq("asset_id", assetId)
      .maybeSingle();
    if (recovered.data) {
      const version = await resolveAssetVersion({
        assetId,
        versionId: recovered.data.version_id,
        client,
      });
      if (version.ok) {
        let token: string;
        try {
          token = recoverOpaqueToken(recovered.data as Record<string, unknown>);
        } catch {
          return {
            ok: false as const,
            status: 503,
            error: "The rotated link could not be securely recovered",
          };
        }
        return {
          ok: true as const,
          deduplicated: true,
          receiptId: priorReceipt.data.id,
          invite: {
            ...withoutShareSecrets(recovered.data as Record<string, unknown>),
            token,
            password_protected: Boolean(recovered.data.password_hash),
            version: {
              id: version.version.id,
              version_number: version.version.version_number,
              is_current: version.version.is_current,
            },
          },
        };
      }
    }
    return { ok: false as const, status: 409, error: "Rotation receipt could not be recovered" };
  }

  const existing = await client
    .from("review_invites")
    .select("*")
    .eq("id", inviteId)
    .eq("asset_id", assetId)
    .maybeSingle();
  if (existing.error) return { ok: false as const, status: 500, error: existing.error.message };
  if (!existing.data) return { ok: false as const, status: 404, error: "Share link not found" };
  if (!existing.data.version_id) {
    return { ok: false as const, status: 409, error: "Legacy links without a version cannot be rotated" };
  }
  if (existing.data.expires_at && new Date(existing.data.expires_at).getTime() <= now.getTime()) {
    return { ok: false as const, status: 409, error: "Expired links cannot be rotated" };
  }

  const version = await resolveAssetVersion({
    assetId,
    versionId: existing.data.version_id,
    client,
  });
  if (!version.ok) return version;
  const replacementToken = newToken();
  const replacement = await client
    .from("review_invites")
    .insert({
      asset_id: assetId,
      version_id: version.version.id,
      ...persistedOpaqueTokenFields(replacementToken),
      permissions: existing.data.permissions,
      created_by: actor.id,
      reviewer_email: existing.data.reviewer_email,
      reviewer_name: existing.data.reviewer_name,
      expires_at: existing.data.expires_at,
      watermark_enabled: existing.data.watermark_enabled,
      watermark_text: existing.data.watermark_text,
      download_enabled: existing.data.download_enabled,
      max_views: existing.data.max_views,
      password_hash: existing.data.password_hash ?? null,
    })
    .select()
    .single();
  if (replacement.error || !replacement.data) {
    return { ok: false as const, status: 500, error: replacement.error?.message || "Rotation failed" };
  }

  const revoke = await client
    .from("review_invites")
    .update({ expires_at: now.toISOString() })
    .eq("id", inviteId)
    .eq("asset_id", assetId);
  if (revoke.error) {
    await client.from("review_invites").delete().eq("id", replacement.data.id);
    return { ok: false as const, status: 500, error: "The original link could not be revoked" };
  }

  const audit = await client
    .from("activity_log")
    .insert({
      asset_id: assetId,
      actor_id: actor.id,
      actor_name: actor.name,
      action: "share_link_rotated",
      details: {
        request_id: requestId,
        old_invite_id: inviteId,
        new_invite_id: replacement.data.id,
        version_id: version.version.id,
        version_number: version.version.version_number,
        retention_class: "share_authority",
        retain_until: retentionDate(2_555, now),
      },
    })
    .select("id")
    .single();
  if (audit.error) {
    const restore = await client
      .from("review_invites")
      .update({ expires_at: existing.data.expires_at })
      .eq("id", inviteId);
    const cleanup = await client.from("review_invites").delete().eq("id", replacement.data.id);
    return {
      ok: false as const,
      status: 503,
      error:
        restore.error || cleanup.error
          ? "Rotation audit failed and rollback was incomplete"
          : "Rotation audit failed; the original link remains active",
      rollback_failed: Boolean(restore.error || cleanup.error),
    };
  }

  return {
    ok: true as const,
    deduplicated: false,
    receiptId: audit.data.id,
    invite: {
      ...withoutShareSecrets(replacement.data as Record<string, unknown>),
      token: replacementToken,
      password_protected: Boolean(existing.data.password_hash),
      version: {
        id: version.version.id,
        version_number: version.version.version_number,
        is_current: version.version.is_current,
      },
    },
  };
}

export function deriveShareIntentFromRow(row: {
  permissions: string;
  download_enabled?: boolean | null;
  watermark_enabled?: boolean | null;
}): ShareManifestIntent {
  if (row.permissions === "approve") return "approval_needed";
  if (row.permissions === "view") return "final_delivery";
  if (row.watermark_enabled && row.download_enabled === false) return "internal_review";
  return "client_review";
}

import { recoverOpaqueToken } from "@/lib/security/opaque-token";

export const CLIENT_REVIEW_INBOX_LIMIT = 100;

export type ClientReviewAccessStatus =
  | "open"
  | "expired"
  | "revoked"
  | "view_limit_reached";

export interface ClientReviewInboxItem {
  id: string;
  assetId: string;
  versionId: string;
  assetTitle: string;
  assetStatus: string;
  projectId: string | null;
  projectName: string | null;
  reviewerName: string | null;
  permission: "view" | "comment" | "approve";
  createdAt: string;
  expiresAt: string | null;
  accessStatus: ClientReviewAccessStatus;
  reviewHref: string | null;
}

export interface ClientReviewInbox {
  items: ClientReviewInboxItem[];
  summary: {
    total: number;
    open: number;
    history: number;
    approvals: number;
  };
}

type RecoverToken = (row: Record<string, unknown>) => string;

function record(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.length === 1 ? record(value[0]) : null;
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid client review inbox ${field}`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizedEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function accessStatus(row: Record<string, unknown>, now: number) {
  if (row.active === false) return "revoked" as const;

  const expiresAt = optionalString(row.expires_at);
  if (expiresAt) {
    const expiration = Date.parse(expiresAt);
    if (!Number.isFinite(expiration)) {
      throw new Error("Invalid client review inbox expiration");
    }
    if (expiration <= now) return "expired" as const;
  }

  if (
    typeof row.max_views === "number" &&
    typeof row.view_count === "number" &&
    row.view_count >= row.max_views
  ) {
    return "view_limit_reached" as const;
  }

  return "open" as const;
}

export function buildClientReviewInbox(
  rows: readonly Record<string, unknown>[],
  expectedReviewerEmail: string,
  options: { now?: number; recoverToken?: RecoverToken } = {},
): ClientReviewInbox {
  const expectedEmail = normalizedEmail(expectedReviewerEmail);
  if (!expectedEmail) throw new Error("Invalid client review inbox identity");

  const now = options.now ?? Date.now();
  const recoverToken = options.recoverToken ?? recoverOpaqueToken;
  const items = rows.map((row): ClientReviewInboxItem => {
    if (normalizedEmail(row.reviewer_email) !== expectedEmail) {
      throw new Error("Client review inbox identity mismatch");
    }

    const asset = record(row.assets);
    if (!asset) throw new Error("Invalid client review inbox asset");
    const project = record(asset.projects);
    const permission = row.permissions;
    if (permission !== "view" && permission !== "comment" && permission !== "approve") {
      throw new Error("Invalid client review inbox permission");
    }

    const createdAt = requiredString(row.created_at, "creation time");
    if (!Number.isFinite(Date.parse(createdAt))) {
      throw new Error("Invalid client review inbox creation time");
    }

    const status = accessStatus(row, now);
    let reviewHref: string | null = null;
    if (status === "open") {
      const token = requiredString(recoverToken(row), "credential");
      reviewHref = `/review/${encodeURIComponent(token)}`;
    }

    return {
      id: requiredString(row.id, "id"),
      assetId: requiredString(row.asset_id, "asset id"),
      versionId: requiredString(row.version_id, "version id"),
      assetTitle: requiredString(asset.title, "asset title"),
      assetStatus: optionalString(asset.status) ?? "in_review",
      projectId: project ? optionalString(project.id) : null,
      projectName: project ? optionalString(project.name) : null,
      reviewerName: optionalString(row.reviewer_name),
      permission,
      createdAt,
      expiresAt: optionalString(row.expires_at),
      accessStatus: status,
      reviewHref,
    };
  });

  items.sort((left, right) => {
    if (left.accessStatus === "open" && right.accessStatus !== "open") return -1;
    if (right.accessStatus === "open" && left.accessStatus !== "open") return 1;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });

  const open = items.filter((item) => item.accessStatus === "open").length;
  return {
    items,
    summary: {
      total: items.length,
      open,
      history: items.length - open,
      approvals: items.filter(
        (item) => item.accessStatus === "open" && item.permission === "approve",
      ).length,
    },
  };
}

/**
 * P23 Client Portal — read-model derivations for the portal home.
 *
 * Everything here is a pure projection of workspace state: active projects
 * with plain-language status, latest review links, recently delivered files,
 * and the client identity for the shell. No DOM, no React.
 */

import { clientProjectStatus, type ClientProjectStatus } from "./status.ts";

export interface PortalProjectRef {
  id: string;
  name: string;
  stage?: string | null;
  organization_id?: string | null;
}

export interface PortalAssetViewRef {
  id: string;
  project_id: string;
  title: string;
  thumbnail_url?: string;
  file_url?: string | null;
  file_type: string;
  status: string;
  version_count?: number;
  reviewer_count?: number;
  reviewer_done?: number;
  created_at: string;
}

export interface PortalPlanItemRef {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  date: string | null;
  status: string;
}

export interface PortalDeliverableRef {
  id: string;
  project_id: string;
  name: string;
  spec: { resolution: string; codec: string; aspect: string };
  status: string;
  delivered_at: string | null;
}

export interface PortalShareLinkViewRef {
  id: string;
  asset_ids: string[];
  reviewer_email?: string | null;
  is_active: boolean;
  public_url: string;
  created_at: string;
}

export interface PortalContactRef {
  id: string;
  organization_id: string | null;
  name: string;
  email: string;
  is_primary: boolean;
}

export interface PortalOrganizationRef {
  id: string;
  name: string;
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-24" (or an ISO datetime) → "Jul 24". UTC-based so tests and SSR
 * agree regardless of the host timezone. */
export function formatPortalDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/* ── Client identity ───────────────────────────────────────────────────── */

export interface PortalClientIdentity {
  organizationName: string | null;
  contactName: string | null;
}

/** The demo client is whoever the live review links were sent to: the most
 * common reviewer-email domain across active share links resolves through
 * the contacts/organizations records. Null when nothing links out yet. */
export function resolveClientIdentity(
  shareLinks: PortalShareLinkViewRef[],
  contacts: PortalContactRef[],
  organizations: PortalOrganizationRef[],
): PortalClientIdentity {
  const domainCounts = new Map<string, number>();
  for (const link of shareLinks) {
    if (!link.is_active) continue;
    const domain = link.reviewer_email?.split("@")[1]?.trim().toLowerCase();
    if (!domain) continue;
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }
  const topDomain = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topDomain) return { organizationName: null, contactName: null };

  const orgContacts = contacts.filter(
    (contact) => contact.email.split("@")[1]?.trim().toLowerCase() === topDomain,
  );
  const organizationId = orgContacts[0]?.organization_id;
  const organization = organizations.find((candidate) => candidate.id === organizationId);
  const primary =
    orgContacts.find((contact) => contact.is_primary) ?? orgContacts[0] ?? null;
  return {
    organizationName: organization?.name ?? null,
    contactName: primary?.name ?? null,
  };
}

/* ── Active projects ───────────────────────────────────────────────────── */

export interface PortalProjectView {
  id: string;
  name: string;
  status: ClientProjectStatus;
  milestoneTitle: string | null;
  nextDateLabel: string | null;
  thumbnailUrl: string | null;
}

export function activePortalProjects(input: {
  projects: PortalProjectRef[];
  planItems: PortalPlanItemRef[];
  assets: PortalAssetViewRef[];
}): PortalProjectView[] {
  const views: PortalProjectView[] = [];
  for (const project of input.projects) {
    const status = clientProjectStatus(project.stage);
    if (!status) continue;

    const upcoming = input.planItems
      .filter(
        (item) =>
          item.project_id === project.id && item.status !== "done" && item.date,
      )
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const milestone =
      upcoming.find((item) => item.kind === "milestone") ?? upcoming[0] ?? null;

    const projectAssets = input.assets
      .filter((asset) => asset.project_id === project.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    views.push({
      id: project.id,
      name: project.name,
      status,
      milestoneTitle: milestone?.title ?? null,
      nextDateLabel: milestone?.date ? formatPortalDate(milestone.date) : null,
      thumbnailUrl: projectAssets[0]?.thumbnail_url ?? null,
    });
  }
  return views;
}

/* ── Latest reviews ────────────────────────────────────────────────────── */

export type PortalReviewStatus =
  | "Needs Review"
  | "Feedback Submitted"
  | "Approved";

export interface PortalReviewItem {
  id: string;
  assetId: string;
  title: string;
  projectId: string;
  versionLabel: string | null;
  status: PortalReviewStatus;
  href: string;
  createdAt: string;
}

export function reviewStatusForAsset(
  asset: PortalAssetViewRef,
): PortalReviewStatus {
  if (asset.status === "approved") return "Approved";
  const reviewers = asset.reviewer_count ?? 0;
  const done = asset.reviewer_done ?? 0;
  if (reviewers > 0 && done >= reviewers) return "Feedback Submitted";
  return "Needs Review";
}

export function latestReviews(input: {
  assets: PortalAssetViewRef[];
  shareLinks: PortalShareLinkViewRef[];
}): PortalReviewItem[] {
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const items: PortalReviewItem[] = [];
  const seenAssets = new Set<string>();

  const links = [...input.shareLinks]
    .filter((link) => link.is_active)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  for (const link of links) {
    for (const assetId of link.asset_ids) {
      if (seenAssets.has(assetId)) continue;
      const asset = assetById.get(assetId);
      if (!asset) continue;
      seenAssets.add(assetId);
      items.push({
        id: `${link.id}-${assetId}`,
        assetId,
        title: asset.title,
        projectId: asset.project_id,
        versionLabel: asset.version_count ? `v${asset.version_count}` : null,
        status: reviewStatusForAsset(asset),
        href: link.public_url,
        createdAt: link.created_at,
      });
    }
  }
  return items;
}

/* ── Recently delivered ────────────────────────────────────────────────── */

export interface PortalDelivery {
  id: string;
  name: string;
  projectId: string;
  formatChips: string[];
  deliveredAt: string | null;
  /** Real file under /public only; null renders "Available on request". */
  downloadHref: string | null;
}

function fileExtension(href: string | null | undefined): string | null {
  const match = href?.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

export function recentDeliveries(input: {
  deliverables: PortalDeliverableRef[];
  assets: PortalAssetViewRef[];
}): PortalDelivery[] {
  const deliveries: PortalDelivery[] = [];

  for (const deliverable of input.deliverables) {
    if (deliverable.status !== "delivered") continue;
    deliveries.push({
      id: deliverable.id,
      name: deliverable.name,
      projectId: deliverable.project_id,
      formatChips: [
        deliverable.spec.codec,
        deliverable.spec.aspect,
        deliverable.spec.resolution,
      ].filter(Boolean),
      deliveredAt: deliverable.delivered_at,
      downloadHref: null,
    });
  }

  for (const asset of input.assets) {
    if (asset.status !== "approved") continue;
    const extension = fileExtension(asset.file_url);
    deliveries.push({
      id: asset.id,
      name: asset.title,
      projectId: asset.project_id,
      formatChips: [asset.file_type.toUpperCase(), extension].filter(
        (chip): chip is string => Boolean(chip),
      ),
      deliveredAt: asset.created_at,
      downloadHref: asset.file_url ?? null,
    });
  }

  return deliveries.sort((a, b) =>
    (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""),
  );
}

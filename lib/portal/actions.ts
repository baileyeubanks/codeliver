/**
 * P23 Client Portal — "What we need from you" action-item derivation.
 *
 * Every item is derived from real workspace state (approval stages, share
 * links, open comments, studio-configured upload requests). Nothing is
 * invented: no pending stage, no item.
 */

export interface PortalAssetRef {
  id: string;
  project_id: string;
  title: string;
}

export interface PortalShareLinkRef {
  id: string;
  asset_ids: string[];
  is_active: boolean;
  public_url: string;
}

export interface PortalApprovalStageRef {
  id: string;
  project_id: string;
  asset_id: string;
  name: string;
  status: string;
  reviewer_names: string[];
  approved_reviewer_names: string[];
}

export interface PortalCommentRef {
  id: string;
  asset_id: string;
  author_name: string;
  body: string;
  status: string;
}

/** Studio-configured request for client files (brief docs, logos, releases). */
export interface PortalUploadRequest {
  id: string;
  project_id: string;
  title: string;
  due_label?: string | null;
  /** Destination the studio set up for the request; null renders no action. */
  href?: string | null;
}

export type PortalActionKind = "approval" | "feedback" | "upload" | "question";

export interface PortalActionItem {
  id: string;
  kind: PortalActionKind;
  projectId: string;
  assetId: string | null;
  /** Plain-language label, e.g. `Approve “ICA_ROADSHOW_x_FINAL”`. */
  title: string;
  /** Due context, e.g. `Client Review · 1 of 2 reviewers in`. */
  detail: string;
  /** Verb for the single clear action. */
  actionLabel: string;
  href: string | null;
}

export interface DeriveActionItemsInput {
  assets: PortalAssetRef[];
  shareLinks: PortalShareLinkRef[];
  approvalStages: PortalApprovalStageRef[];
  comments?: PortalCommentRef[];
  uploadRequests?: PortalUploadRequest[];
  /** Author names treated as the studio (their open questions need answers). */
  studioAuthorNames?: string[];
}

const DEFAULT_STUDIO_AUTHORS = ["Content Co-op"];
const QUESTION_BODY_MAX = 90;

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/** The client-facing review URL for an asset: the live share link when one
 * exists, otherwise the plain demo review surface. */
export function reviewHrefForAsset(
  assetId: string,
  shareLinks: PortalShareLinkRef[],
): string {
  const link = shareLinks.find(
    (candidate) => candidate.is_active && candidate.asset_ids.includes(assetId),
  );
  return link?.public_url ?? `/review/demo?demo=1&asset=${encodeURIComponent(assetId)}`;
}

function isFinalApprovalStage(stageName: string): boolean {
  return /final/i.test(stageName);
}

export function deriveActionItems(input: DeriveActionItemsInput): PortalActionItem[] {
  const items: PortalActionItem[] = [];
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]));

  for (const stage of input.approvalStages) {
    if (stage.status === "approved") continue;
    const asset = assetById.get(stage.asset_id);
    if (!asset) continue;
    const kind: PortalActionKind = isFinalApprovalStage(stage.name) ? "approval" : "feedback";
    const total = stage.reviewer_names.length;
    const done = stage.approved_reviewer_names.length;
    items.push({
      id: `action-${stage.id}`,
      kind,
      projectId: stage.project_id,
      assetId: asset.id,
      title:
        kind === "approval"
          ? `Approve “${asset.title}”`
          : `Share feedback on “${asset.title}”`,
      detail:
        total > 0
          ? `${stage.name} · ${done} of ${total} reviewers in`
          : stage.name,
      actionLabel: kind === "approval" ? "Review & approve" : "Give feedback",
      href: reviewHrefForAsset(asset.id, input.shareLinks),
    });
  }

  for (const request of input.uploadRequests ?? []) {
    items.push({
      id: `action-${request.id}`,
      kind: "upload",
      projectId: request.project_id,
      assetId: null,
      title: `Upload: ${request.title}`,
      detail: request.due_label ? `Requested · ${request.due_label}` : "Requested by the studio",
      actionLabel: "Upload files",
      href: request.href ?? null,
    });
  }

  const studioAuthors = new Set(input.studioAuthorNames ?? DEFAULT_STUDIO_AUTHORS);
  for (const comment of input.comments ?? []) {
    if (comment.status !== "open") continue;
    if (!studioAuthors.has(comment.author_name)) continue;
    if (!comment.body.trim().endsWith("?")) continue;
    const asset = assetById.get(comment.asset_id);
    items.push({
      id: `action-${comment.id}`,
      kind: "question",
      projectId: asset?.project_id ?? "",
      assetId: asset?.id ?? null,
      title: `Answer: “${truncate(comment.body, QUESTION_BODY_MAX)}”`,
      detail: asset ? `Question on ${asset.title}` : "Question from the studio",
      actionLabel: "Reply in review",
      href: asset ? reviewHrefForAsset(asset.id, input.shareLinks) : null,
    });
  }

  const KIND_ORDER: Record<PortalActionKind, number> = {
    approval: 0,
    feedback: 1,
    upload: 2,
    question: 3,
  };
  return items.sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind]);
}

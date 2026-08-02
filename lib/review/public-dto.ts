import type {
  ApprovalStep,
  Comment,
  EditDecision,
  Version,
} from "../types/codeliver.ts";
// @ts-expect-error Node's source-TypeScript test runner requires the explicit extension.
import { reviewPinNormalizedToPercent } from "./pin-coordinates.ts";

type PublicReviewAssetInput = {
  id: string;
  title: string;
  file_type: string;
  status: string;
  projects: { name: string } | null;
};

export function toPublicReviewAsset(
  asset: PublicReviewAssetInput,
  mediaUrl: string,
) {
  return {
    id: asset.id,
    title: asset.title,
    file_type: asset.file_type,
    file_url: mediaUrl,
    status: asset.status,
    projects: asset.projects ? { name: asset.projects.name } : null,
  };
}

export function toPublicReviewVersion(
  version: Version,
  mediaUrl: string,
): Version {
  return {
    id: version.id,
    asset_id: version.asset_id,
    version_number: version.version_number,
    file_url: mediaUrl,
    file_size: version.file_size,
    thumbnail_url: null,
    duration_seconds: version.duration_seconds,
    resolution: version.resolution,
    is_current: version.is_current,
    notes: null,
    uploaded_by: null,
    created_at: version.created_at,
  };
}

export function toPublicReviewComment(
  comment: Record<string, unknown>,
): Comment {
  return {
    id: String(comment.id),
    review_id: null,
    review_invite_id: null,
    asset_id: String(comment.asset_id),
    version_id:
      typeof comment.version_id === "string" ? comment.version_id : null,
    parent_id: typeof comment.parent_id === "string" ? comment.parent_id : null,
    author_name:
      typeof comment.author_name === "string" && comment.author_name.trim()
        ? comment.author_name
        : "External reviewer",
    author_email: null,
    author_id: null,
    body: typeof comment.body === "string" ? comment.body : "",
    rich_body: null,
    timecode_seconds:
      typeof comment.timecode_seconds === "number"
        ? comment.timecode_seconds
        : null,
    frame_number:
      typeof comment.frame_number === "number" ? comment.frame_number : null,
    pin_x: reviewPinNormalizedToPercent(comment.pin_x) ?? null,
    pin_y: reviewPinNormalizedToPercent(comment.pin_y) ?? null,
    mentions: [],
    status:
      comment.status === "resolved" || comment.status === "archived"
        ? comment.status
        : "open",
    visibility: "external",
    resolved_by: null,
    resolved_at:
      typeof comment.resolved_at === "string" ? comment.resolved_at : null,
    created_at: String(comment.created_at),
    updated_at: String(comment.updated_at),
  };
}

export function toPublicApprovalStep(
  approval: ApprovalStep,
  canDecide = false,
): ApprovalStep {
  return {
    id: approval.id,
    asset_id: approval.asset_id,
    version_id: approval.version_id,
    workflow_id: approval.workflow_id,
    step_order: approval.step_order,
    role_label: approval.role_label,
    assignee_email: null,
    assignee_id: null,
    status: approval.status,
    decision_note: approval.decision_note,
    decided_at: approval.decided_at,
    can_decide: canDecide,
    created_at: approval.created_at,
  };
}

export function toPublicEditDecision(
  decision: Record<string, unknown>,
): EditDecision {
  return {
    id: String(decision.id),
    asset_id: String(decision.asset_id),
    version_id: String(decision.version_id),
    review_invite_id: null,
    created_by: null,
    created_by_name:
      typeof decision.created_by_name === "string"
        ? decision.created_by_name
        : "External reviewer",
    decision_type: decision.decision_type as EditDecision["decision_type"],
    source: decision.source as EditDecision["source"],
    status: decision.status as EditDecision["status"],
    start_seconds:
      typeof decision.start_seconds === "number" ? decision.start_seconds : 0,
    end_seconds:
      typeof decision.end_seconds === "number" ? decision.end_seconds : null,
    label: typeof decision.label === "string" ? decision.label : null,
    confidence:
      typeof decision.confidence === "number" ? decision.confidence : null,
    client_request_id:
      typeof decision.client_request_id === "string"
        ? decision.client_request_id
        : "",
    metadata: {},
    created_at: String(decision.created_at),
    updated_at: String(decision.updated_at),
  };
}

import type { ApprovalStep, WorkflowMode } from "../types/codeliver.ts";

export interface DemoApprovalRound {
  project_id: string;
  asset_id: string;
  version_id: string;
  review_invite_id: string;
  reviewer_name: string;
  reviewer_email: string;
  workflow_mode: WorkflowMode;
  approvals: ApprovalStep[];
  asset_status: string;
  active_approval_ids: string[];
  approval_access_message: string;
  locked_asset_ids: string[];
  updated_at: string;
}

export function createDemoApprovalRound(input: {
  projectId: string;
  assetId: string;
  versionId: string;
  reviewInviteId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  initialAssetStatus: string;
  createdAt: string;
}): DemoApprovalRound | null {
  const reviewerEmail = input.reviewerEmail?.trim().toLowerCase() || null;
  if (!reviewerEmail) return null;

  const reviewerName = input.reviewerName?.trim() || reviewerEmail;
  const approvalId = `approval-${input.reviewInviteId}`;
  const approval: ApprovalStep = {
    id: approvalId,
    asset_id: input.assetId,
    workflow_id: `workflow-${input.reviewInviteId}`,
    step_order: 1,
    role_label: `${reviewerName} approval`,
    assignee_email: reviewerEmail,
    assignee_id: null,
    status: "pending",
    decision_note: null,
    decided_at: null,
    created_at: input.createdAt,
  };

  return {
    project_id: input.projectId,
    asset_id: input.assetId,
    version_id: input.versionId,
    review_invite_id: input.reviewInviteId,
    reviewer_name: reviewerName,
    reviewer_email: reviewerEmail,
    workflow_mode: "sequential",
    approvals: [approval],
    asset_status: input.initialAssetStatus,
    active_approval_ids: [approvalId],
    approval_access_message: "Your approval step is ready.",
    locked_asset_ids: [],
    updated_at: input.createdAt,
  };
}

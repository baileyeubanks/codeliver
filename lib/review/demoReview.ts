import type {
  ApprovalStep,
  Comment,
  SharePermission,
  WorkflowMode,
} from "@/lib/types/codeliver";

interface DemoReviewAsset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  /** Honest per-asset frame rate override (24000/1001 for the demo preview). */
  frame_rate?: number;
  projects: { name: string } | null;
}

interface DemoReviewPayload {
  asset: DemoReviewAsset;
  approvals: ApprovalStep[];
  comments: Comment[];
  permissions: SharePermission;
  reviewer_name: string | null;
  reviewer_email: string | null;
  expires_at: string | null;
  download_enabled: boolean;
  watermark_enabled: boolean;
  watermark_text: string | null;
  workflow_mode: WorkflowMode | null;
  invite: {
    id: string;
    view_count: number;
    max_views: number | null;
  };
}

export function bindDemoReviewApprovals({
  approvals,
  assetId,
  reviewerEmail,
  permission,
}: {
  approvals: ApprovalStep[];
  assetId: string;
  reviewerEmail: string | null;
  permission: SharePermission;
}) {
  const normalizedReviewerEmail = reviewerEmail?.trim().toLowerCase() || null;
  const recipientApprovalId =
    permission === "approve" && normalizedReviewerEmail
      ? [...approvals]
          .sort((left, right) => left.step_order - right.step_order)
          .find((approval) => approval.status === "pending")?.id
      : null;

  return approvals.map((approval) => ({
    ...approval,
    asset_id: assetId,
    assignee_email:
      approval.id === recipientApprovalId
        ? normalizedReviewerEmail
        : approval.assignee_email,
  }));
}

const now = new Date();

function minutesAgo(minutes: number) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export const demoReviewPayload: DemoReviewPayload = {
  asset: {
    id: "demo-asset",
    title: "Denie McDonald_v4",
    file_type: "video",
    file_url: "/demo/ica-ceo-preview.mp4",
    status: "in_review",
    // Measured with ffprobe: 24000/1001 (23.976), 120 frames over 5.005s.
    frame_rate: 24000 / 1001,
    projects: { name: "ICA / Nashville Roadshow" },
  },
  approvals: [
    {
      id: "approval-1",
      asset_id: "demo-asset",
      workflow_id: "workflow-1",
      step_order: 1,
      role_label: "Client Lead",
      assignee_email: "reviewer@client.example",
      assignee_id: null,
      status: "pending",
      decision_note: null,
      decided_at: null,
      created_at: minutesAgo(160),
    },
    {
      id: "approval-2",
      asset_id: "demo-asset",
      workflow_id: "workflow-1",
      step_order: 2,
      role_label: "Content Co-op Producer",
      assignee_email: "producer@contentcoop.example",
      assignee_id: null,
      status: "approved",
      decision_note: "Editorial pass is complete and ready for client sign-off.",
      decided_at: minutesAgo(45),
      created_at: minutesAgo(220),
    },
  ],
  comments: [
    {
      id: "comment-1",
      review_id: null,
      review_invite_id: "invite-demo",
      asset_id: "demo-asset",
      version_id: null,
      parent_id: null,
      author_name: "Client Reviewer",
      author_email: "reviewer@client.example",
      author_id: null,
      body: "Start the response a beat earlier so the answer lands before the lower third animates in.",
      rich_body: null,
      timecode_seconds: 1.2,
      frame_number: null,
      pin_x: 27,
      pin_y: 34,
      mentions: [],
      status: "open",
      visibility: "external",
      resolved_by: null,
      resolved_at: null,
      created_at: minutesAgo(95),
      updated_at: minutesAgo(95),
    },
    {
      id: "comment-2",
      review_id: null,
      review_invite_id: "invite-demo",
      asset_id: "demo-asset",
      version_id: null,
      parent_id: "comment-1",
      author_name: "Content Co-op",
      author_email: null,
      author_id: null,
      body: "Adjusted in this pass. The dialogue now starts four frames earlier.",
      rich_body: null,
      timecode_seconds: 1.2,
      frame_number: null,
      pin_x: null,
      pin_y: null,
      mentions: [],
      status: "open",
      visibility: "external",
      resolved_by: null,
      resolved_at: null,
      created_at: minutesAgo(81),
      updated_at: minutesAgo(81),
    },
    {
      id: "comment-3",
      review_id: null,
      review_invite_id: "invite-demo",
      asset_id: "demo-asset",
      version_id: null,
      parent_id: null,
      author_name: "Client Reviewer",
      author_email: "reviewer@client.example",
      author_id: null,
      body: "The title treatment and framing work here. No further changes on this section.",
      rich_body: null,
      timecode_seconds: 3.1,
      frame_number: null,
      pin_x: 64,
      pin_y: 48,
      mentions: [],
      status: "resolved",
      visibility: "external",
      resolved_by: null,
      resolved_at: minutesAgo(52),
      created_at: minutesAgo(74),
      updated_at: minutesAgo(52),
    },
    {
      id: "comment-4",
      review_id: null,
      review_invite_id: "invite-demo",
      asset_id: "demo-asset",
      version_id: null,
      parent_id: null,
      author_name: "Client Reviewer",
      author_email: "reviewer@client.example",
      author_id: null,
      body: "Please give the closing lockup another half second before the fade to black.",
      rich_body: null,
      timecode_seconds: 4.1,
      frame_number: null,
      pin_x: 73,
      pin_y: 68,
      mentions: [],
      status: "open",
      visibility: "external",
      resolved_by: null,
      resolved_at: null,
      created_at: minutesAgo(28),
      updated_at: minutesAgo(28),
    },
  ],
  permissions: "approve",
  reviewer_name: "Client Reviewer",
  reviewer_email: "reviewer@client.example",
  expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  download_enabled: true,
  watermark_enabled: true,
  watermark_text: "ICA Client Review",
  workflow_mode: "sequential",
  invite: {
    id: "invite-demo",
    view_count: 18,
    max_views: null,
  },
};

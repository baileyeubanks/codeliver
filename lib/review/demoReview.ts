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

const now = new Date();

function minutesAgo(minutes: number) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export const demoReviewPayload: DemoReviewPayload = {
  asset: {
    id: "demo-asset",
    title: "Founder Story Cutdown",
    file_type: "video",
    file_url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    status: "in_review",
    projects: { name: "Atlas Launch Campaign" },
  },
  approvals: [
    {
      id: "approval-1",
      asset_id: "demo-asset",
      workflow_id: "workflow-1",
      step_order: 1,
      role_label: "Client Marketing Lead",
      assignee_email: "maya@atlas.example",
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
      role_label: "Brand Director",
      assignee_email: "brand@atlas.example",
      assignee_id: null,
      status: "approved",
      decision_note: "Direction is strong. Keep the closing claim as-is.",
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
      parent_id: null,
      author_name: "Maya Chen",
      author_email: "maya@atlas.example",
      author_id: null,
      body: "Open a beat earlier here so the headline lands before the music swell.",
      rich_body: null,
      timecode_seconds: 2.2,
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
      parent_id: "comment-1",
      author_name: "Bailey",
      author_email: null,
      author_id: null,
      body: "Makes sense. I’ll trim the pre-roll so the message comes in on frame.",
      rich_body: null,
      timecode_seconds: 2.2,
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
      parent_id: null,
      author_name: "Jordan Lee",
      author_email: "jordan@atlas.example",
      author_id: null,
      body: "The product frame feels premium here. No further changes from brand.",
      rich_body: null,
      timecode_seconds: 5.8,
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
      parent_id: null,
      author_name: "Maya Chen",
      author_email: "maya@atlas.example",
      author_id: null,
      body: "Approval will be clear once the CTA lockup has a little more breathing room.",
      rich_body: null,
      timecode_seconds: 7.4,
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
  reviewer_name: "Maya Chen",
  reviewer_email: "maya@atlas.example",
  expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  download_enabled: true,
  watermark_enabled: true,
  watermark_text: "Atlas Internal Review",
  workflow_mode: "sequential",
  invite: {
    id: "invite-demo",
    view_count: 18,
    max_views: null,
  },
};

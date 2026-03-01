/* ── CoDeliver V2 — Unified Types ─────────────────────────── */

// ── Enums ──

export type AnnotationType = "pin" | "rectangle" | "freehand" | "arrow" | "text";
export type FileType = "video" | "image" | "audio" | "document" | "other";
export type AssetStatus = "draft" | "in_review" | "approved" | "needs_changes" | "final";
export type CommentStatus = "open" | "resolved" | "archived";
export type ApprovalDecision = "pending" | "approved" | "approved_with_changes" | "changes_requested" | "rejected";
export type WorkflowMode = "sequential" | "parallel";
export type SharePermission = "view" | "comment" | "approve";
export type TeamRole = "owner" | "admin" | "member" | "viewer";
export type NotificationType =
  | "comment_added"
  | "comment_resolved"
  | "comment_reply"
  | "approval_requested"
  | "approval_decided"
  | "asset_uploaded"
  | "version_uploaded"
  | "share_link_viewed"
  | "mention";

// ── Core Models ──

export interface Annotation {
  id: string;
  comment_id: string | null;
  asset_id: string;
  version_id: string | null;
  type: AnnotationType;
  data: AnnotationData;
  frame_number: number | null;
  created_by: string | null;
  created_at: string;
}

export type AnnotationData =
  | { kind: "pin"; x: number; y: number; label?: string }
  | { kind: "rectangle"; x: number; y: number; width: number; height: number }
  | { kind: "freehand"; points: number[] }
  | { kind: "arrow"; points: [number, number, number, number] }
  | { kind: "text"; x: number; y: number; text: string };

export interface Comment {
  id: string;
  review_id: string | null;
  asset_id: string;
  parent_id: string | null;
  author_name: string;
  author_email: string | null;
  author_id: string | null;
  body: string;
  rich_body: string | null;
  timecode_seconds: number | null;
  frame_number: number | null;
  pin_x: number | null;
  pin_y: number | null;
  mentions: string[];
  status: CommentStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Client-side enrichment
  replies?: Comment[];
  reactions?: CommentReaction[];
  attachments?: CommentAttachment[];
  annotations?: Annotation[];
}

export interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface CommentAttachment {
  id: string;
  comment_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

export interface ApprovalStep {
  id: string;
  asset_id: string;
  workflow_id: string | null;
  step_order: number;
  role_label: string;
  assignee_email: string | null;
  assignee_id: string | null;
  status: ApprovalDecision;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ApprovalWorkflow {
  id: string;
  asset_id: string;
  mode: WorkflowMode;
  created_by: string | null;
  status: string;
  steps?: ApprovalStep[];
}

export interface Version {
  id: string;
  asset_id: string;
  version_number: number;
  file_url: string;
  file_size: number | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  resolution: string | null;
  is_current: boolean;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ShareLink {
  id: string;
  asset_id: string;
  token: string;
  password_hash: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  permissions: SharePermission;
  watermark_enabled: boolean;
  watermark_text: string | null;
  download_enabled: boolean;
  view_count: number;
  max_views: number | null;
  last_viewed_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  invited_by: string | null;
  joined_at: string;
}

export interface Folder {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_by: string | null;
  children?: Folder[];
}

export interface Tag {
  id: string;
  project_id: string;
  name: string;
  color: string;
}

export interface Transcription {
  id: string;
  asset_id: string;
  version_id: string | null;
  segments: TranscriptionSegment[];
  language: string;
  status: string;
  created_at: string;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface BrandCheck {
  id: string;
  asset_id: string;
  results: Record<string, unknown>;
  score: number;
  created_at: string;
}

// ── UI State Types ──

export interface PlayerState {
  currentTime: number;
  duration: number;
  playing: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  fullscreen: boolean;
}

export interface AnnotationToolState {
  activeTool: AnnotationType | null;
  color: string;
  opacity: number;
  strokeWidth: number;
}

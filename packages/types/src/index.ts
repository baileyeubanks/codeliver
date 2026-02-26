/* ─── Shared type definitions ─── */

/* ─── Roles ─── */
export type RoleTag = "context" | "trust" | "process" | "texture";

/* ─── Curated Frames (Landing) ─── */
export interface CuratedFrame {
  id: string;
  assetId: string;
  frameTimecode: string;
  roleTag: RoleTag;
  approvedBy: string;
  approvedAt: string;
  caption: string;
  imageUrl: string;
}

/* ─── Co-Edit ─── */
export type ReviewStatus = "In review" | "Needs changes" | "Ready to approve" | "Approved";

export interface ReviewAsset {
  id: string;
  title: string;
  project: string;
  status: ReviewStatus;
}

export interface QueueItem {
  id: string;
  asset: string;
  project: string;
  owner: string;
  reviewers: number;
  status: ReviewStatus;
  updated: string;
  due: string;
  durationSeconds: number;
  poster: string;
}

export interface TimecodedComment {
  id: string;
  assetId?: string;
  at: number;
  body: string;
  state: "open" | "resolved";
  author: string;
  role: string;
}

export interface ApprovalGate {
  id: string;
  stakeholder: string;
  role: string;
  state: "pending" | "approved" | "changes_requested";
  updated: string;
}

/* ─── Co-Script ─── */
export interface ScriptBrief {
  id: string;
  scriptType: string;
  audience: string;
  objective: string;
  constraints: string;
  keyPoints: string;
}

export interface ScriptVariant {
  id: string;
  key: string;
  label: string;
  body: string;
  revisionNumber: number;
}

/* ─── Media ─── */
export interface MediaDerivative {
  id: string;
  assetId: string;
  format: string;
  url: string;
  sizeBytes: number;
}

/**
 * Co-VideoPro — Project Operating Record: canonical entity model.
 *
 * Framework-free TypeScript consumed by BOTH runtimes (demo workspace store
 * and Supabase API routes). State changes never happen by assignment — they go
 * through the transition validators in `./transitions.ts`.
 *
 * Governing docs: docs/COVIDEOPRO_PRODUCT_MODEL.md, docs/COVIDEOPRO_TARGET_ARCHITECTURE.md
 */

/* -------------------------------------------------------------------------- */
/* Project lifecycle stage (the spine)                                        */
/* -------------------------------------------------------------------------- */

export const PROJECT_STAGES = [
  "inquiry",
  "intake",
  "development",
  "preproduction",
  "production",
  "post",
  "review",
  "delivery",
  "archived",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export interface ProjectStageMeta {
  id: ProjectStage;
  label: string;
  /** One-line description for UI chips and lifecycle navigation. */
  summary: string;
  /** What must be true for a project to enter this stage. */
  entryRequirement: string;
}

export const PROJECT_STAGE_META: Record<ProjectStage, ProjectStageMeta> = {
  inquiry: {
    id: "inquiry",
    label: "Inquiry",
    summary: "Inbound request captured, not yet qualified.",
    entryRequirement: "An inquiry record exists.",
  },
  intake: {
    id: "intake",
    label: "Intake",
    summary: "Qualified as an opportunity; client and contacts linked.",
    entryRequirement: "Client organization and at least one contact confirmed.",
  },
  development: {
    id: "development",
    label: "Development",
    summary: "Creative brief and proposal in progress.",
    entryRequirement: "A creative brief v1 exists.",
  },
  preproduction: {
    id: "preproduction",
    label: "Pre-production",
    summary: "Proposal approved; plan, schedule, and crew forming.",
    entryRequirement: "A proposal version is approved.",
  },
  production: {
    id: "production",
    label: "Production",
    summary: "Shoot days underway.",
    entryRequirement: "A production-day plan item is scheduled.",
  },
  post: {
    id: "post",
    label: "Post",
    summary: "Media ingested, edit underway.",
    entryRequirement: "A sequence exists.",
  },
  review: {
    id: "review",
    label: "Review",
    summary: "Versions in internal or client review.",
    entryRequirement: "A review link or internal review round is active.",
  },
  delivery: {
    id: "delivery",
    label: "Delivery",
    summary: "Approved; encoding, QC, and packages.",
    entryRequirement: "Final approval recorded; at least one deliverable specced.",
  },
  archived: {
    id: "archived",
    label: "Archived",
    summary: "Closed, with learnings captured.",
    entryRequirement: "All deliverables delivered or explicitly cancelled.",
  },
};

export function projectStageIndex(stage: ProjectStage): number {
  return PROJECT_STAGES.indexOf(stage);
}

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                              */
/* -------------------------------------------------------------------------- */

export type ISODateTime = string;

export interface RecordBase {
  id: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  created_by: string;
}

/** Every lifecycle entity resolves to exactly one project (except the
 * workspace-scoped entities noted below, and inquiries pre-conversion). */
export interface ProjectScoped extends RecordBase {
  project_id: string;
}

/* -------------------------------------------------------------------------- */
/* CRM (workspace-scoped)                                                     */
/* -------------------------------------------------------------------------- */

export interface Organization extends RecordBase {
  name: string;
  industry: string | null;
  website: string | null;
  notes: string | null;
}

export interface Contact extends RecordBase {
  organization_id: string | null;
  name: string;
  email: string;
  role: string | null;
  is_primary: boolean;
}

export const INQUIRY_STATUSES = ["new", "triaged", "qualified", "converted", "declined"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export interface Inquiry extends RecordBase {
  /** Null until conversion links/creates a project. */
  project_id: string | null;
  organization_id: string | null;
  contact_id: string | null;
  source: string;
  summary: string;
  received_at: ISODateTime;
  status: InquiryStatus;
}

/* -------------------------------------------------------------------------- */
/* Creative                                                                   */
/* -------------------------------------------------------------------------- */

export const BRIEF_STATUSES = ["draft", "in_review", "approved", "superseded"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export interface Brief extends ProjectScoped {
  version: number;
  status: BriefStatus;
  objectives: string;
  audience: string;
  message: string;
  references: string[];
  deliverables_notes: string;
}

/** Immutable snapshot; the current brief row carries the live pointer. */
export interface BriefVersion extends ProjectScoped {
  brief_id: string;
  version: number;
  status: BriefStatus;
  objectives: string;
  audience: string;
  message: string;
  references: string[];
  deliverables_notes: string;
}

/* -------------------------------------------------------------------------- */
/* Commercial                                                                 */
/* -------------------------------------------------------------------------- */

export const PROPOSAL_STATUSES = ["draft", "in_review", "sent", "approved", "declined", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const ESTIMATE_CATEGORIES = ["crew", "equipment", "travel", "post", "deliverable", "other"] as const;
export type EstimateCategory = (typeof ESTIMATE_CATEGORIES)[number];

export interface EstimateLine {
  id: string;
  category: EstimateCategory;
  description: string;
  quantity: number;
  unit_rate: number;
  markup_pct: number;
  optional: boolean;
}

export interface Proposal extends ProjectScoped {
  version: number;
  status: ProposalStatus;
  title: string;
  narrative: string;
  estimate_lines: EstimateLine[];
  valid_until: string | null;
  approved_by: string | null;
  approved_at: ISODateTime | null;
}

export interface ProposalVersion extends ProjectScoped {
  proposal_id: string;
  version: number;
  status: ProposalStatus;
  title: string;
  narrative: string;
  estimate_lines: EstimateLine[];
}

export function estimateLineTotal(line: EstimateLine): number {
  return line.quantity * line.unit_rate * (1 + line.markup_pct / 100);
}

export function proposalEstimateTotal(
  lines: EstimateLine[],
  { includeOptional = false }: { includeOptional?: boolean } = {},
): number {
  return lines
    .filter((line) => includeOptional || !line.optional)
    .reduce((sum, line) => sum + estimateLineTotal(line), 0);
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

export const PLAN_ITEM_KINDS = ["milestone", "task", "production_day"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const PLAN_ITEM_STATUSES = ["pending", "in_progress", "done", "blocked"] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];

export interface PlanItem extends ProjectScoped {
  kind: PlanItemKind;
  title: string;
  date: string | null;
  assignee: string | null;
  status: PlanItemStatus;
  depends_on: string[];
  /** Free-form crew/location/equipment notes until dedicated models land. */
  meta: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Media / Edit                                                               */
/* -------------------------------------------------------------------------- */

export const SELECT_SOURCES = ["transcript", "review", "manual"] as const;
export type SelectSource = (typeof SELECT_SOURCES)[number];

export interface Select extends ProjectScoped {
  asset_id: string;
  version_id: string | null;
  in_seconds: number;
  out_seconds: number;
  label: string;
  source: SelectSource;
  transcript_segment_ids: string[];
}

export const SEQUENCE_STATUSES = ["draft", "in_review", "approved", "locked"] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export interface Sequence extends ProjectScoped {
  name: string;
  version: number;
  status: SequenceStatus;
  fps: number;
  created_from: "manual" | "transcript-assembly";
}

export interface SequenceClip {
  id: string;
  sequence_id: string;
  asset_id: string;
  version_id: string | null;
  select_id: string | null;
  track_index: number;
  timeline_in_seconds: number;
  timeline_out_seconds: number;
  source_in_seconds: number;
  source_out_seconds: number;
}

/* -------------------------------------------------------------------------- */
/* Review consolidation / Delivery                                            */
/* -------------------------------------------------------------------------- */

export const REVISION_REQUEST_STATUSES = ["open", "in_progress", "addressed", "verified"] as const;
export type RevisionRequestStatus = (typeof REVISION_REQUEST_STATUSES)[number];

export interface RevisionRequest extends ProjectScoped {
  asset_id: string;
  version_id: string | null;
  round: number;
  summary: string;
  status: RevisionRequestStatus;
  comment_ids: string[];
}

export const DECISION_SOURCES = ["review", "comment", "meeting", "hermes"] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

export interface Decision extends ProjectScoped {
  subject: string;
  body: string;
  decided_by: string;
  source: DecisionSource;
  comment_ids: string[];
}

export const DELIVERABLE_STATUSES = [
  "specced",
  "encoding",
  "qc",
  "ready",
  "delivered",
  "expired",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export interface DeliverableSpec {
  resolution: string;
  codec: string;
  aspect: string;
  captions: boolean;
  audio: string;
  watermark: boolean;
}

export interface Deliverable extends ProjectScoped {
  name: string;
  spec: DeliverableSpec;
  /** Frozen from the moment QC starts — never re-pointed in place. */
  source_version_id: string | null;
  status: DeliverableStatus;
  qc_notes: string;
  delivered_at: ISODateTime | null;
}

/* -------------------------------------------------------------------------- */
/* The Project Operating Record                                               */
/* -------------------------------------------------------------------------- */

/** A project header as the record sees it. The underlying `projects` row is
 * owned by the existing schema; the record adds stage + links. */
export interface ProjectRecordHeader {
  id: string;
  name: string;
  stage: ProjectStage;
  organization_id: string | null;
  primary_contact_id: string | null;
}

/** One authoritative, connected view of a single production. */
export interface ProjectOperatingRecord {
  project: ProjectRecordHeader;
  inquiry: Inquiry | null;
  briefs: Brief[];
  proposals: Proposal[];
  plan_items: PlanItem[];
  selects: Select[];
  sequences: Sequence[];
  sequence_clips: SequenceClip[];
  revision_requests: RevisionRequest[];
  decisions: Decision[];
  deliverables: Deliverable[];
}

export function currentBrief(briefs: Brief[]): Brief | null {
  return briefs.filter((brief) => brief.status !== "superseded").sort((a, b) => b.version - a.version)[0] ?? null;
}

export function currentProposal(proposals: Proposal[]): Proposal | null {
  return proposals.filter((proposal) => proposal.status !== "superseded").sort((a, b) => b.version - a.version)[0] ?? null;
}

export function openRevisionRequests(requests: RevisionRequest[]): RevisionRequest[] {
  return requests.filter((request) => request.status === "open" || request.status === "in_progress");
}

/* -------------------------------------------------------------------------- */
/* Payments (milestones on approved proposals)                                */
/* -------------------------------------------------------------------------- */

export const PAYMENT_MILESTONE_KINDS = ["deposit", "balance"] as const;
export type PaymentMilestoneKind = (typeof PAYMENT_MILESTONE_KINDS)[number];

export const PAYMENT_MILESTONE_STATUSES = ["pending", "checkout_created", "paid", "void"] as const;
export type PaymentMilestoneStatus = (typeof PAYMENT_MILESTONE_STATUSES)[number];

export const PAYMENT_METHODS = ["checkout", "manual"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A scheduled payment against an approved proposal. Money is integer cents. */
export interface PaymentMilestone extends ProjectScoped {
  proposal_id: string;
  kind: PaymentMilestoneKind;
  label: string;
  amount_cents: number;
  currency: string;
  status: PaymentMilestoneStatus;
  method: PaymentMethod | null;
  checkout_url: string | null;
  checkout_provider: string | null;
  paid_at: ISODateTime | null;
}

/* -------------------------------------------------------------------------- */
/* Notification outbox (provider-neutral, dry-run by default)                  */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_CHANNELS = ["email", "sms", "imessage"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_OUTBOX_STATUSES = [
  "queued",
  "dry_run_sent",
  "pending_provider",
  "failed",
] as const;
export type NotificationOutboxStatus = (typeof NOTIFICATION_OUTBOX_STATUSES)[number];

export interface NotificationOutboxItem extends RecordBase {
  project_id: string;
  intent: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  status: NotificationOutboxStatus;
  provider: string | null;
  idempotency_key: string;
  attempt_count: number;
  last_error: string | null;
}

/* -------------------------------------------------------------------------- */
/* Production entities (PRODUCTION_MACHINE_v1.md Part 7 — El Paso spec)        */
/* -------------------------------------------------------------------------- */

export const PRODUCTION_DAY_TYPES = ["scout", "principal", "contingency"] as const;
export type ProductionDayType = (typeof PRODUCTION_DAY_TYPES)[number];

export const PRODUCTION_DAY_STATUSES = ["scheduled", "in_progress", "wrapped", "cancelled"] as const;
export type ProductionDayStatus = (typeof PRODUCTION_DAY_STATUSES)[number];

export interface ProductionDay extends ProjectScoped {
  date: string;
  call: string | null;
  wrap: string | null;
  type: ProductionDayType;
  status: ProductionDayStatus;
  notes: string;
}

export const CREW_RATE_BASES = ["day", "half_day", "flat", "hourly"] as const;
export type CrewRateBasis = (typeof CREW_RATE_BASES)[number];

export interface CrewMember extends ProjectScoped {
  name: string;
  role: string;
  rate_basis: CrewRateBasis;
  days: number;
  contact: string | null;
}

export const LOCATION_AGREEMENT_STATUSES = ["none", "drafted", "sent", "signed"] as const;
export type LocationAgreementStatus = (typeof LOCATION_AGREEMENT_STATUSES)[number];

export interface Location extends ProjectScoped {
  name: string;
  address: string | null;
  contact: string | null;
  access_window: string | null;
  /** What may be filmed (screens, labels, credentials — spelled out). */
  cleared_to_film: string[];
  /** What may NOT be filmed. */
  restricted: string[];
  agreement_status: LocationAgreementStatus;
}

export const RELEASE_TYPES = ["appearance", "location"] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export const RELEASE_STATUSES = ["unsent", "sent", "signed"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export interface Release extends ProjectScoped {
  person_name: string;
  type: ReleaseType;
  status: ReleaseStatus;
  signed_at: ISODateTime | null;
  file_url: string | null;
  language: string;
  /** Production days this person is expected on set (ids). */
  production_day_ids: string[];
}

export interface CallSheet extends ProjectScoped {
  production_day_id: string;
  version: number;
  generated_at: ISODateTime;
  pdf_url: string | null;
  /** The generated one-page content (markdown-ish text, printable). */
  content: string;
}

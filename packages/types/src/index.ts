/* ─── Shared type definitions ─── */

/* ─── ROOT Canonical Ontology ─── */
export * from "./ontology";
export * from "./platform";
export * from "./workflow";

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

/* ─── Co-Cut ─── */
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

/* ─── Creative Brief Intake ─── */
export type CreativeBriefSubmissionMode = "form" | "voice";

export type CreativeBriefHandoffVersion =
  | "cco.home.creative-brief.v2"
  | "cco.home.creative-brief.v3";

export type CreativeBriefBookingIntent =
  | "decide_after_brief"
  | "book_after_brief"
  | "booked_or_planning";

export type CreativeDiagnosticGoal =
  | "Build trust"
  | "Explain clearly"
  | "Support sales"
  | "Train people"
  | "Recruit talent"
  | "Capture an event"
  | "Leadership message"
  | "Product/service showcase"
  | "Not sure yet";

export type CreativeDiagnosticAudience =
  | "Prospects"
  | "Customers"
  | "Internal team"
  | "New hires"
  | "Leadership"
  | "Public"
  | "Event attendees";

export type CreativeDiagnosticPlacement =
  | "Website"
  | "Sales deck"
  | "Social"
  | "Email"
  | "Event screen"
  | "Recruiting page"
  | "Training portal"
  | "Multiple places";

export type CreativeDiagnosticVideoCount = "1" | "2" | "3" | "4+";
export type CreativeDiagnosticCutdownVolume = "1-2" | "3-5" | "6+";
export type CreativeDiagnosticRuntime =
  | "Under 30 sec"
  | "30-60 sec"
  | "60-90 sec"
  | "2-3 min"
  | "3-5 min"
  | "Not sure";
export type CreativeDiagnosticProductionNeed =
  | "Interviews"
  | "Voiceover"
  | "Motion graphics"
  | "Drone"
  | "B-roll only"
  | "Script help"
  | "Location sound"
  | "Subtitles"
  | "Vertical versions";
export type CreativeDiagnosticShootDayCount = "2" | "3" | "4+";
export type CreativeDiagnosticLocationCount = "1" | "2" | "3" | "4+";
export type CreativeDiagnosticTravelScope =
  | "Texas regional"
  | "Domestic"
  | "Extended / custom";
export type CreativeDiagnosticTimeline =
  | "ASAP"
  | "2-4 weeks"
  | "1-2 months"
  | "Flexible";
export type CreativeDiagnosticEngagement = "One-time" | "Ongoing / recurring";
export type CreativeDiagnosticCameraComfort =
  | "Comfortable"
  | "Mixed"
  | "Prefer minimal on-camera presence";
export type CreativeDiagnosticPolish =
  | "Simple and direct"
  | "Polished and professional"
  | "Cinematic and premium";
export type CreativeDiagnosticEditingStyle =
  | "Basic clean edit"
  | "Edit with graphics"
  | "Edit with advanced motion design";
export type CreativeDiagnosticRevisionExpectation = "1 round" | "2 rounds" | "3+ rounds";
export type CreativeDiagnosticBudgetComfort =
  | "Figuring it out"
  | "Under $5,000"
  | "$5,000-$10,000"
  | "$10,000-$20,000"
  | "$20,000+ / best approach";
export type CreativeDiagnosticContactMethod = "Email" | "Phone call" | "Text";
export type CreativeRecommendationType =
  | "Brand Trust Video / Brand Story"
  | "Explainer / Service Overview"
  | "Sales Enablement / Capabilities Video"
  | "Training / Instructional Video"
  | "Recruitment / Culture Video"
  | "Executive Communication Video"
  | "Event Recap / Event Opener / Sizzle"
  | "Multi-Asset Campaign Package"
  | "Custom Diagnostic Recommendation";
export type CreativeDiagnosticScopeClass =
  | "Lite"
  | "Standard"
  | "Expanded"
  | "Complex / custom";
export type CreativeBriefQuoteMode = "range" | "custom_quote_required";
export type CreativeBriefNextStep =
  | "Book a Call"
  | "Send Brief"
  | "Send Brief + Book a Call";

export interface CreativeDiagnosticInput {
  goal: CreativeDiagnosticGoal | "";
  audiences: CreativeDiagnosticAudience[];
  placement: CreativeDiagnosticPlacement | "";
  primary_placement: Exclude<CreativeDiagnosticPlacement, "Multiple places"> | "";
  main_video_count: CreativeDiagnosticVideoCount | "";
  need_cutdowns: boolean | null;
  cutdown_volume: CreativeDiagnosticCutdownVolume | "";
  target_runtime: CreativeDiagnosticRuntime | "";
  production_needs: CreativeDiagnosticProductionNeed[];
  multiple_shoot_days: boolean | null;
  shoot_day_count: CreativeDiagnosticShootDayCount | "";
  need_message_shaping: boolean | null;
  filming_locations: CreativeDiagnosticLocationCount | "";
  travel_needed: boolean | null;
  travel_scope: CreativeDiagnosticTravelScope | "";
  timeline: CreativeDiagnosticTimeline | "";
  hard_deadline: string;
  engagement_model: CreativeDiagnosticEngagement | "";
  comfort_on_camera: CreativeDiagnosticCameraComfort | "";
  additional_context: string;
  reference_link: string;
  polish_level: CreativeDiagnosticPolish | "";
  editing_style: CreativeDiagnosticEditingStyle | "";
  revision_expectation: CreativeDiagnosticRevisionExpectation | "";
  budget_comfort: CreativeDiagnosticBudgetComfort | "";
  need_fast_quote: boolean | null;
}

export interface CreativeBriefFileAttachmentMeta {
  name: string;
  size: number;
  type: string;
}

export interface CreativeDiagnosticContactInput {
  name: string;
  company: string;
  email: string;
  confirm_email: string;
  phone: string;
  confirm_phone: string;
  best_contact_method: CreativeDiagnosticContactMethod | "";
  notes: string;
  reference_link: string;
  attachments: CreativeBriefFileAttachmentMeta[];
}

export interface CreativeBriefModifier {
  code: string;
  label: string;
  low: number;
  high: number;
}

export interface CreativeRecommendation {
  recommended_video_type: CreativeRecommendationType;
  recommendation_reason: string;
  likely_scope: CreativeDiagnosticScopeClass;
  estimated_production_level: Exclude<CreativeDiagnosticPolish, "">;
  quote_mode: CreativeBriefQuoteMode;
  starting_range_low: number | null;
  starting_range_high: number | null;
  next_step: CreativeBriefNextStep;
}

export interface CreativeQuoteSignal {
  base_package: CreativeRecommendationType;
  base_range_low: number | null;
  base_range_high: number | null;
  modifiers: CreativeBriefModifier[];
  rush: boolean;
  custom_quote_required: boolean;
  budget_warning: string | null;
}

export interface CreativeBriefSummaryCard {
  recommended_video_type: CreativeRecommendationType;
  likely_scope: CreativeDiagnosticScopeClass;
  estimated_production_level: Exclude<CreativeDiagnosticPolish, "">;
  quote_mode: CreativeBriefQuoteMode;
  starting_range_low: number | null;
  starting_range_high: number | null;
  why_this_fit: string;
  next_step: CreativeBriefNextStep;
  budget_warning: string | null;
}

export interface CreativeBriefSubmissionPayloadV3 {
  version: "cco.home.creative-brief.v3";
  intake: CreativeBriefIntakeMetadata;
  diagnostic: CreativeDiagnosticInput;
  contact: CreativeDiagnosticContactInput;
}

export interface CreativeBriefEstimate {
  low: number;
  high: number;
  weeks: number;
}

export interface CreativeBriefFormData {
  contact_name: string;
  contact_email: string;
  phone: string;
  company: string;
  role: string;
  location: string;
  content_type: string;
  deliverables: string[];
  audience: string;
  tone: string;
  deadline: string;
  objective: string;
  key_messages: string;
  references: string;
  constraints: string;
  booking_intent: CreativeBriefBookingIntent;
}

export interface CreativeBriefIntakeMetadata {
  source_surface: "cco_home";
  source_path: string;
  handoff_version: CreativeBriefHandoffVersion;
  submission_mode: CreativeBriefSubmissionMode;
  booking_intent: CreativeBriefBookingIntent;
}

export interface CreativeBriefContact {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  contact_key: string;
}

export interface CreativeBriefProject {
  content_type: string;
  deliverables: string[];
  audience: string | null;
  tone: string | null;
  deadline: string | null;
  objective: string | null;
  key_messages: string | null;
  references: string | null;
  constraints: string | null;
}

export interface CreativeBriefReadiness {
  intake_complete: boolean;
  quote_ready: boolean;
  missing_fields: string[];
  blockers: string[];
}

export interface CreativeBriefRoutingContext extends CreativeBriefIntakeMetadata {
  booking_url: string;
  pairing_key: string;
  should_pair_booking: boolean;
}

export interface CreativeBriefStructuredIntake {
  contact: CreativeBriefContact;
  project: CreativeBriefProject;
  routing: CreativeBriefRoutingContext;
  readiness: CreativeBriefReadiness;
  diagnostic?: CreativeDiagnosticInput;
  recommendation?: CreativeRecommendation;
  quote_signal?: CreativeQuoteSignal;
  summary_card?: CreativeBriefSummaryCard;
}

export type CreativeBriefRootAction =
  | "match_contact"
  | "triage_intake"
  | "collect_missing_scope"
  | "prepare_quote_follow_up"
  | "pair_booking_if_present";

export interface CreativeBriefRootHandoffPlan {
  requested_actions: CreativeBriefRootAction[];
  deferred_entities: Array<"quote" | "proposal">;
  pairing_key: string;
}

export interface CreativeBriefSubmissionPayload extends CreativeBriefFormData {
  intake: CreativeBriefIntakeMetadata;
}

export interface CreativeBriefHandoffEnvelope {
  version: CreativeBriefHandoffVersion;
  event_type: "brief_submitted";
  target: "root_managed_services";
  brief_id: string;
  portal_url: string;
  booking_url: string;
  intake: CreativeBriefIntakeMetadata;
  brief: CreativeBriefFormData;
  structured_intake: CreativeBriefStructuredIntake;
  root_handoff: CreativeBriefRootHandoffPlan;
}

export interface CreativeBriefSubmissionResponse {
  id: string;
  access_token: string;
  status: string;
  created_at: string;
  portal_url: string;
  booking_url: string;
  summary?: CreativeBriefSummaryCard;
  warnings?: string[];
  workflow?: {
    ok: boolean;
    status_code: number;
  };
  email_queued?: boolean;
  persistence?: {
    structured_fields: "full" | "legacy_only";
  };
  handoff: {
    version: CreativeBriefHandoffVersion;
    event_type: "brief_submitted";
    target: "root_managed_services";
    contact_key: string;
    quote_ready: boolean;
    blockers: string[];
    requested_actions: CreativeBriefRootAction[];
    channels: Array<"supabase_event" | "orchestrator" | "hermes" | "email">;
    orchestrator?: {
      ok: boolean;
      status_code: number;
    };
    hermes: {
      ok: boolean;
      skipped: boolean;
      status_code: number | null;
    };
  };
  hermes?: {
    ok: boolean;
    skipped: boolean;
    status_code: number | null;
  };
}

/* ─── Public Site Content ─── */
export type PortfolioAssetAlignment = "client_specific" | "shared_environment";

export type PortfolioReviewStatus = "approved" | "needs_review" | "blocked";

export interface PortfolioProofImage {
  src: string;
  alt: string;
  alignment?: PortfolioAssetAlignment;
}

export interface PortfolioReviewMetadata {
  status: PortfolioReviewStatus;
  reviewedBy: string;
  reviewedAt: string;
  notes?: string;
}

export interface PortfolioCaseStudy {
  id: string;
  title: string;
  client: string;
  sector: string;
  year: string;
  format: string;
  scope: string;
  headline: string;
  summary: string;
  mandate: string;
  execution: string;
  outcome: string;
  proofPoints: string[];
  deliverables: string[];
  thumbnail?: string;
  preview?: string;
  video?: string;
  remoteMediaUrl?: string | null;
  review: PortfolioReviewMetadata;
  gallery: PortfolioProofImage[];
}

export interface PortfolioManifest {
  version: string;
  flagshipStudyId: string;
  featuredStudyIds: string[];
  entries: PortfolioCaseStudy[];
}

export type RepoHealthStatus = "healthy" | "degraded" | "critical";

export type RepoHealthCheckStatus = "ok" | "warn" | "fail" | "missing";

export interface RepoHealthCheck {
  id: string;
  label: string;
  status: RepoHealthCheckStatus;
  detail: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
}

export interface RepoHealthSnapshot {
  service: "contentco-op-monorepo";
  scope: "full" | "local";
  status: RepoHealthStatus;
  generatedAt: string;
  version: string;
  summary: {
    ok: number;
    warn: number;
    fail: number;
    missing: number;
  };
  checks: RepoHealthCheck[];
}

/* ─── Media ─── */
export interface MediaDerivative {
  id: string;
  assetId: string;
  format: string;
  url: string;
  sizeBytes: number;
}

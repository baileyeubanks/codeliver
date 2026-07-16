/* ─── ROOT Canonical Ontology Types ─── */

/* ─── Companies (Attio pattern) ─── */
export interface Company {
  id: string;
  business_unit: "ACS" | "CC";
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  logo_url: string | null;
  billing_address: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ─── Relationships (Attio typed connections) ─── */
export type RelationshipType =
  | "employee"
  | "owner"
  | "decision_maker"
  | "billing_contact"
  | "property_manager"
  | "tenant"
  | "vendor"
  | "contractor";

export interface Relationship {
  id: string;
  contact_id: string;
  company_id: string;
  role: string | null;
  relationship_type: RelationshipType;
  is_primary: boolean;
  started_at: string | null;
  ended_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ─── Opportunities (HubSpot deal pipeline) ─── */
export type OpportunityStage =
  | "discovery"
  | "qualification"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export type Pipeline = "default" | "acs_residential" | "acs_commercial" | "cc_production" | "cc_retainer";

export interface Opportunity {
  id: string;
  business_unit: "ACS" | "CC";
  contact_id: string | null;
  company_id: string | null;
  title: string;
  stage: OpportunityStage;
  pipeline: Pipeline;
  value_cents: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  owner_id: string | null;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ─── Projects (Airtable connected records) ─── */
export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export interface Project {
  id: string;
  business_unit: "ACS" | "CC";
  company_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  title: string;
  status: ProjectStatus;
  project_type: string | null;
  start_date: string | null;
  due_date: string | null;
  budget_cents: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ─── Deliverables ─── */
export type DeliverableStatus =
  | "draft"
  | "in_progress"
  | "in_review"
  | "revision"
  | "approved"
  | "delivered";

export type DeliverableType =
  | "video"
  | "photo"
  | "graphic"
  | "document"
  | "website"
  | "script"
  | "other";

export interface Deliverable {
  id: string;
  project_id: string;
  title: string;
  deliverable_type: DeliverableType;
  status: DeliverableStatus;
  assignee_id: string | null;
  due_date: string | null;
  brief: Record<string, unknown> | null;
  review_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ─── Campaigns (HubSpot marketing) ─── */
export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled";
export type CampaignType = "outbound" | "inbound" | "nurture" | "reactivation" | "event" | "referral";

export interface Campaign {
  id: string;
  business_unit: "ACS" | "CC";
  title: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  budget_cents: number;
  channels: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CampaignContactStatus = "enrolled" | "active" | "completed" | "opted_out" | "bounced";

export interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: CampaignContactStatus;
  enrolled_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

/* ─── Payments (FreshBooks ledger) ─── */
export type PaymentMethod = "manual" | "stripe" | "e_transfer" | "cheque" | "cash" | "credit_card";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export interface Payment {
  id: string;
  business_unit: "ACS" | "CC";
  invoice_id: string | null;
  contact_id: string | null;
  amount_cents: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference_number: string | null;
  paid_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ─── Catalog Items ─── */
export interface CatalogItem {
  id: string;
  business_unit: "ACS" | "CC" | "ALL";
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  unit_price_cents: number;
  default_unit: string;
  currency: string;
  revenue_account_code: string | null;
  cost_account_code: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/* ─── Automation Rules ─── */
export interface AutomationCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "gt" | "lt" | "in" | "exists";
  value: unknown;
}

export type AutomationActionType =
  | "send_email"
  | "create_task"
  | "update_field"
  | "notify_slack"
  | "invoke_blaze"
  | "create_event"
  | "webhook";

export interface AutomationAction {
  type: AutomationActionType;
  config: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  business_unit: "ACS" | "CC" | "ALL";
  name: string;
  description: string | null;
  trigger_event: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  is_active: boolean;
  last_triggered_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export type AutomationRunStatus = "running" | "completed" | "failed";

export interface AutomationRun {
  id: string;
  rule_id: string;
  trigger_event_id: string | null;
  status: AutomationRunStatus;
  input_payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

/* ─── Extended Contact (with ontology columns) ─── */
export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "nurturing";
export type LifecycleStage = "subscriber" | "lead" | "mql" | "sql" | "opportunity" | "customer" | "evangelist";

export interface ContactOntologyExtension {
  lead_score: number;
  lead_status: LeadStatus;
  company_id: string | null;
  lifecycle_stage: LifecycleStage;
}

/* ─── Extended Event (with object binding) ─── */
export type EventObjectType =
  | "contact"
  | "company"
  | "opportunity"
  | "invoice"
  | "payment"
  | "project"
  | "deliverable"
  | "campaign"
  | "job"
  | "automation";

export interface TypedEvent {
  id: string;
  type: string;
  business_id: string | null;
  business_unit: "ACS" | "CC" | null;
  contact_id: string | null;
  object_type: EventObjectType | null;
  object_id: string | null;
  event_category: string | null;
  text: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  channel: string;
  direction: string;
  created_at: string;
}

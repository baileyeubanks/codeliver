import type { CoProduceLifecyclePhaseId as CockpitLifecyclePhaseId } from "../../components/cockpit/CoProduceLifecycleDrawer";
import type { WorkspaceCapability } from "../../components/navigation/navigation-model";
import type { SharePermission } from "../types/codeliver";

type Assert<T extends true> = T;

export type CoProducePhaseId = CockpitLifecyclePhaseId;
export type CoProduceReviewPermission = SharePermission;

export type CoProduceCapabilityOwnerId =
  | "workspace-shell"
  | CoProducePhaseId
  | "human-agent-loop";

export type CoProduceExtensionPermission =
  | "preproduction:write"
  | "production:manage"
  | "postproduction:write"
  | "delivery:manage"
  | "business:manage"
  | "analytics:read"
  | "storage:manage"
  | "integrations:manage"
  | "agents:propose"
  | "agents:approve";

export type CoProducePermissionId = WorkspaceCapability | CoProduceExtensionPermission;

export interface CoProducePermissionContract {
  authority: "workspace-rbac";
  state: "enforced" | "planned";
  description: string;
}

export const CO_PRODUCE_PERMISSION_CONTRACTS = {
  "projects:read": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Read projects and project-scoped summaries.",
  },
  "projects:create": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Create projects under the authenticated workspace.",
  },
  "media:read": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Read project assets and immutable versions.",
  },
  "media:write": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Upload assets, create versions, and update media metadata.",
  },
  "reviews:read": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Read review, comment, and approval state.",
  },
  "reviews:comment": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Create review comments and share review work.",
  },
  "reviews:approve": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Record approval decisions for an authorized review step.",
  },
  "activity:read": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Read append-only project activity.",
  },
  "workspace:manage": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Manage team, workspace, and policy settings.",
  },
  "home:read": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Read the cross-project attention queue and production home.",
  },
  "opportunities:read": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Read inquiries, clients, contacts, and the proposal pipeline.",
  },
  "opportunities:write": {
    authority: "workspace-rbac",
    state: "enforced",
    description: "Capture, qualify, convert, and decline inquiries; manage client records.",
  },
  "preproduction:write": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Write briefs, scripts, schedules, and production planning records.",
  },
  "production:manage": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Manage production sessions, on-set logs, and reports.",
  },
  "postproduction:write": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Write sequence, graphics, audio, and composition revisions.",
  },
  "delivery:manage": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Prepare and confirm final delivery, distribution, and compliance records.",
  },
  "business:manage": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Manage client intake, CRM, proposals, contracts, deposits, invoices, payments, and expenses.",
  },
  "analytics:read": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Read governed project analytics and insight projections.",
  },
  "storage:manage": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Manage storage placement, retention, and capacity policy.",
  },
  "integrations:manage": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Manage project integration and API connections.",
  },
  "agents:propose": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Start a proposal-only agent run within project and budget policy.",
  },
  "agents:approve": {
    authority: "workspace-rbac",
    state: "planned",
    description: "Accept or reject an agent proposal without granting direct mutation authority.",
  },
} as const satisfies Record<CoProducePermissionId, CoProducePermissionContract>;

type _ExistingWorkspacePermissionsRemainCovered = Assert<
  Exclude<WorkspaceCapability, keyof typeof CO_PRODUCE_PERMISSION_CONTRACTS> extends never
    ? true
    : false
>;

export type CoProduceReferenceImageId =
  | "lifecycle-dashboard"
  | "system-map"
  | "review-cockpit"
  | "agentic-cycle";

export interface CoProduceSurfaceReference {
  id: string;
  label: string;
  images: readonly CoProduceReferenceImageId[];
}

export type CoProduceStatusContract =
  | {
      kind: "authoritative-field";
      field: string;
      values: readonly string[];
      transitionRule: string;
    }
  | {
      kind: "derived";
      field: string | null;
      values: readonly string[];
      transitionRule: string;
    }
  | {
      kind: "immutable";
      field: null;
      values: readonly [];
      transitionRule: string;
    }
  | {
      kind: "not-implemented";
      field: null;
      values: readonly [];
      transitionRule: string;
    };

export interface CoProduceRecordContract {
  authority: "co-deliver" | "co-script" | "co-edit" | "project-vault" | "shared";
  deployment: "canonical" | "planned";
  storage: string | null;
  scope: "workspace" | "project" | "asset" | "version" | "review" | "agent-run";
  parent: string | null;
  writeRule: string;
  status: CoProduceStatusContract;
}

export const CO_PRODUCE_RECORDS = {
  project: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "projects",
    scope: "project",
    parent: null,
    writeRule: "Project writes remain under authenticated Co‑ProVideo project ownership.",
    status: {
      kind: "authoritative-field",
      field: "projects.status",
      values: ["active", "archived", "completed"],
      transitionRule: "Only a project-authorized command may change project status.",
    },
  },
  "planned.client_lead": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "workspace",
    parent: null,
    writeRule: "Lead and CRM records require durable workspace-scoped identity and source attribution before use.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Project intake notes must not be presented as a live CRM record.",
    },
  },
  "planned.proposal_contract": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Quotes, estimates, proposals, contracts, signatures, and acceptance events require append-only project records.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No proposal, contract, or signature state may be shown as accepted or executed without durable evidence.",
    },
  },
  "planned.billing_record": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Deposits, invoices, payments, refunds, and balances require explicit billing authority and audit evidence.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No deposit, invoice, payment, or balance may be marked received or settled from project intake copy.",
    },
  },
  "planned.expense_record": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Production expenses, vendor costs, and profitability records require durable ledger semantics.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No expense or profitability number is authoritative until a ledger record exists.",
    },
  },
  asset: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "assets",
    scope: "asset",
    parent: "project",
    writeRule: "Assets are project-owned containers; source media is never overwritten by a draft action.",
    status: {
      kind: "authoritative-field",
      field: "assets.status",
      values: [
        "draft",
        "processing",
        "ready",
        "in_review",
        "needs_changes",
        "approved",
        "final",
        "failed",
      ],
      transitionRule: "Media processing and review commands own their explicit status transitions.",
    },
  },
  version: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "versions",
    scope: "version",
    parent: "asset",
    writeRule: "Versions are append-only media revisions bound to exactly one asset.",
    status: {
      kind: "derived",
      field: "versions.is_current",
      values: ["current", "superseded"],
      transitionRule: "Current is a pointer projection; publishing creates a version instead of mutating prior media.",
    },
  },
  review: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "reviews",
    scope: "review",
    parent: "asset",
    writeRule: "A review binds one asset and, when supplied, one immutable version.",
    status: {
      kind: "authoritative-field",
      field: "reviews.status",
      values: ["open", "completed", "cancelled"],
      transitionRule: "Review state changes only through an authorized review command.",
    },
  },
  comment: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "comments",
    scope: "review",
    parent: "review",
    writeRule: "Comments bind to an asset and exact version when version context exists.",
    status: {
      kind: "authoritative-field",
      field: "comments.status",
      values: ["open", "resolved", "archived"],
      transitionRule: "Resolution never changes media or approval state implicitly.",
    },
  },
  annotation: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "annotations",
    scope: "review",
    parent: "comment",
    writeRule: "Annotations must remain version-bound review evidence, not media edits.",
    status: {
      kind: "immutable",
      field: null,
      values: [],
      transitionRule: "Corrections create or remove annotation records under comment authority.",
    },
  },
  approval_workflow: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "approval_workflows",
    scope: "review",
    parent: "asset",
    writeRule: "Workflow mode and steps are configured by project-authorized users.",
    status: {
      kind: "authoritative-field",
      field: "approval_workflows.status",
      values: ["active", "completed", "cancelled"],
      transitionRule: "Workflow completion derives from persisted step decisions, then is recorded explicitly.",
    },
  },
  approval_step: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "approvals",
    scope: "review",
    parent: "approval_workflow",
    writeRule: "Only the project owner or authorized assignee may record a decision.",
    status: {
      kind: "authoritative-field",
      field: "approvals.status",
      values: ["pending", "approved", "approved_with_changes", "changes_requested", "rejected"],
      transitionRule: "Every decision appends approval history; no UI-only approval is authoritative.",
    },
  },
  approval_history: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "approval_history",
    scope: "review",
    parent: "approval_step",
    writeRule: "Approval history is append-only decision evidence.",
    status: {
      kind: "immutable",
      field: null,
      values: [],
      transitionRule: "A correction appends another decision event; history is not rewritten.",
    },
  },
  review_invite: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "review_invites",
    scope: "review",
    parent: "asset",
    writeRule: "Share tokens bind recipient policy and the selected version where version context is required.",
    status: {
      kind: "derived",
      field: "review_invites.authority_status",
      values: ["active", "expired", "revoked", "exhausted"],
      transitionRule: "Access is evaluated from persisted policy, expiry, revocation, and view limits.",
    },
  },
  activity_event: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "activity_log",
    scope: "project",
    parent: "project",
    writeRule: "Committed project mutations append a sanitized activity event.",
    status: {
      kind: "immutable",
      field: null,
      values: [],
      transitionRule: "Events are append-only and never substitute for the authoritative record.",
    },
  },
  notification: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "notifications",
    scope: "workspace",
    parent: null,
    writeRule: "Notification records describe delivery state; they do not grant review authority.",
    status: {
      kind: "derived",
      field: "notifications.read",
      values: ["unread", "read"],
      transitionRule: "Read state is presentation state and cannot imply an external send succeeded.",
    },
  },
  team: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "teams",
    scope: "workspace",
    parent: null,
    writeRule: "Workspace membership and roles remain Co‑ProVideo identity authority.",
    status: {
      kind: "immutable",
      field: null,
      values: [],
      transitionRule: "Team changes occur through member or invite records, not lifecycle phase state.",
    },
  },
  team_member: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "team_members",
    scope: "workspace",
    parent: "team",
    writeRule: "Role assignment is explicit and cannot be inferred from project activity.",
    status: {
      kind: "authoritative-field",
      field: "team_members.role",
      values: ["owner", "admin", "member", "viewer"],
      transitionRule: "Only workspace management may change a member role.",
    },
  },
  transcription: {
    authority: "co-edit",
    deployment: "canonical",
    storage: "transcriptions",
    scope: "version",
    parent: "version",
    writeRule: "Transcripts remain version-bound derivatives and never replace source media.",
    status: {
      kind: "authoritative-field",
      field: "transcriptions.status",
      values: ["pending", "processing", "completed", "failed"],
      transitionRule: "Workers own processing transitions; human text corrections require a revision record.",
    },
  },
  edit_decision: {
    authority: "co-edit",
    deployment: "canonical",
    storage: "edit_decisions",
    scope: "version",
    parent: "version",
    writeRule: "Edit decisions are reversible source-time commands and cannot mutate the bound version.",
    status: {
      kind: "authoritative-field",
      field: "edit_decisions.status",
      values: ["proposed", "accepted", "rejected", "applied"],
      transitionRule: "Applying a decision updates a composition revision; publication remains a separate command.",
    },
  },
  transcode_job: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "transcode_jobs",
    scope: "version",
    parent: "version",
    writeRule: "Workers append job outcomes and write only derived media locations.",
    status: {
      kind: "authoritative-field",
      field: "transcode_jobs.status",
      values: ["pending", "processing", "completed", "failed", "cancelled"],
      transitionRule: "Worker transitions are idempotent and cannot approve or publish an asset.",
    },
  },
  project_analytics: {
    authority: "co-deliver",
    deployment: "canonical",
    storage: "project_analytics_cache",
    scope: "project",
    parent: "project",
    writeRule: "Analytics are rebuildable projections; source records remain authoritative.",
    status: {
      kind: "derived",
      field: "project_analytics_cache.computed_at",
      values: ["fresh", "stale"],
      transitionRule: "Freshness is derived from source revisions and computation time.",
    },
  },
  "planned.project_brief_revision": {
    authority: "co-script",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Brief revisions require a new durable schema before use.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No brief status may be presented as live until persistence and routes exist.",
    },
  },
  "planned.script_revision": {
    authority: "co-script",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Scripts and storyboards must be append-only project-scoped revisions.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No script or storyboard status is authoritative in this repository yet.",
    },
  },
  "planned.shot_schedule": {
    authority: "co-script",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Shot lists, schedules, and call sheets require versioned project records.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Calendar-like UI must not imply a saved schedule.",
    },
  },
  "planned.location_talent_release": {
    authority: "co-script",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Locations, talent, permits, rights, and releases require durable provenance.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No permit or release may be shown as cleared without an authoritative record.",
    },
  },
  "planned.production_task": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Tasks need durable assignment, due-date, completion, and audit semantics.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Demo task state is never project authority.",
    },
  },
  "planned.production_session": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Live production requires a durable session and participant authority model.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "A live badge or monitor cannot claim an active production session.",
    },
  },
  "planned.production_log": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Scene notes, takes, metadata, and daily reports require append-only records.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "On-set logs are unavailable until persistence exists.",
    },
  },
  "planned.sequence_revision": {
    authority: "co-edit",
    deployment: "planned",
    storage: null,
    scope: "version",
    parent: "version",
    writeRule: "Sequences must be immutable composition revisions over source-time spans.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "A visual timeline is not a saved sequence or published version.",
    },
  },
  "planned.graphics_revision": {
    authority: "co-edit",
    deployment: "planned",
    storage: null,
    scope: "version",
    parent: "version",
    writeRule: "Graphics and titles require immutable templates and versioned render inputs.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No graphics revision is currently durable.",
    },
  },
  "planned.audio_mix_revision": {
    authority: "co-edit",
    deployment: "planned",
    storage: null,
    scope: "version",
    parent: "version",
    writeRule: "Mixes, stems, music, and SFX require rights-aware immutable revisions.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No audio mix status is authoritative yet.",
    },
  },
  "planned.delivery_record": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "version",
    parent: "version",
    writeRule: "A final delivery must bind approved versions, package checksums, recipients, and proof of handoff.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Exports and downloads do not prove final delivery.",
    },
  },
  "planned.distribution_record": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "version",
    parent: "planned.delivery_record",
    writeRule: "Distribution requires destination, policy, attempt, and outcome evidence.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No publish or distribution action is live from this contract.",
    },
  },
  "planned.compliance_record": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Retention, legal hold, and rights evidence require explicit policy records.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Archive status alone cannot claim compliance.",
    },
  },
  "planned.storage_allocation": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "workspace",
    parent: null,
    writeRule: "Storage placement and quota changes require a durable allocation ledger.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Displayed capacity cannot be treated as a management control.",
    },
  },
  "planned.workflow_template": {
    authority: "shared",
    deployment: "planned",
    storage: null,
    scope: "workspace",
    parent: null,
    writeRule: "Templates require versioned capability grants and project instantiation history.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "No custom workflow or template is live.",
    },
  },
  "planned.integration_connection": {
    authority: "co-deliver",
    deployment: "planned",
    storage: null,
    scope: "workspace",
    parent: null,
    writeRule: "Connections require secret isolation, scopes, health, and revocation records.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Existing webhook code does not establish an integrations product surface.",
    },
  },
  "planned.agent_run": {
    authority: "project-vault",
    deployment: "planned",
    storage: null,
    scope: "agent-run",
    parent: "project",
    writeRule: "Agent runs are proposal-only, source-scoped, budget-bound, and human-gated.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "In-memory or demo harness state is never a live agent-run authority.",
    },
  },
  "planned.search_index": {
    authority: "shared",
    deployment: "planned",
    storage: null,
    scope: "project",
    parent: "project",
    writeRule: "Semantic discovery requires provenance, ACL filtering, and rebuildable indexing.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Local command filtering is not AI or semantic search.",
    },
  },
  "planned.mobile_certification": {
    authority: "shared",
    deployment: "planned",
    storage: null,
    scope: "workspace",
    parent: null,
    writeRule: "Mobile access requires certified responsive workflows, not a separate data authority.",
    status: {
      kind: "not-implemented",
      field: null,
      values: [],
      transitionRule: "Mobile access remains unavailable until its required journeys are certified.",
    },
  },
} as const satisfies Record<string, CoProduceRecordContract>;

export type CoProduceRecordType = keyof typeof CO_PRODUCE_RECORDS;

export interface CoProduceRouteContract {
  template: string;
  params: readonly string[];
  audience: "workspace" | "review-invite";
}

export const CO_PRODUCE_ROUTES = {
  dashboard: { template: "/", params: [], audience: "workspace" },
  projects: { template: "/projects", params: [], audience: "workspace" },
  project_create: { template: "/projects/new", params: [], audience: "workspace" },
  project: { template: "/projects/:projectId", params: ["projectId"], audience: "workspace" },
  asset_review: {
    template: "/projects/:projectId/assets/:assetId",
    params: ["projectId", "assetId"],
    audience: "workspace",
  },
  reviews: { template: "/reviews", params: [], audience: "workspace" },
  library: { template: "/library", params: [], audience: "workspace" },
  activity: { template: "/activity", params: [], audience: "workspace" },
  settings: { template: "/settings", params: [], audience: "workspace" },
  archive: { template: "/projects/archive", params: [], audience: "workspace" },
  trash: { template: "/projects/trash", params: [], audience: "workspace" },
  public_review: {
    template: "/review/:reviewToken",
    params: ["reviewToken"],
    audience: "review-invite",
  },
} as const satisfies Record<string, CoProduceRouteContract>;

export type CoProduceRouteId = keyof typeof CO_PRODUCE_ROUTES;

export type CoProduceRouteIntent =
  | {
      kind: "page";
      intent: string;
      routeId: CoProduceRouteId;
    }
  | {
      kind: "action";
      intent: string;
      routeId: CoProduceRouteId;
      action: string;
    }
  | {
      kind: "unavailable";
      intent: string;
      routeId: null;
      reason: string;
    };

export type CoProducePermissionClause =
  | {
      principal: "workspace";
      allOf: readonly CoProducePermissionId[];
    }
  | {
      principal: "review-invite";
      minimum: CoProduceReviewPermission;
    };

export interface CoProducePermissionRequirement {
  anyOf: readonly CoProducePermissionClause[];
  enforcement: "server-and-record-policy";
}

export type CoProduceAuditContract =
  | {
      responsibility: "read-only";
      record: null;
      events: readonly [];
      rule: string;
    }
  | {
      responsibility: "append-after-commit" | "append-attempt-and-outcome";
      record: CoProduceRecordType;
      events: readonly string[];
      rule: string;
    }
  | {
      responsibility: "unavailable";
      record: null;
      events: readonly [];
      rule: string;
    };

export type CoProduceReadiness =
  | {
      state: "operational" | "read-only" | "guarded";
      claim: string;
      blockers: readonly string[];
    }
  | {
      state: "unavailable";
      claim: string;
      blockers: readonly string[];
    };

export interface CoProduceCapability {
  id: `${CoProduceCapabilityOwnerId}.${string}`;
  owner: CoProduceCapabilityOwnerId;
  label: string;
  summary: string;
  surfaces: readonly CoProduceSurfaceReference[];
  route: CoProduceRouteIntent;
  permission: CoProducePermissionRequirement;
  data: {
    primary: CoProduceRecordType;
    supporting: readonly CoProduceRecordType[];
    authorityRule: string;
  };
  audit: CoProduceAuditContract;
  readiness: CoProduceReadiness;
}

export interface CoProduceCapabilityGroup {
  owner: {
    id: CoProduceCapabilityOwnerId;
    kind: "shell" | "phase" | "loop";
    label: string;
  };
  capabilities: readonly CoProduceCapability[];
}

function surface(
  id: string,
  label: string,
  ...images: CoProduceReferenceImageId[]
): CoProduceSurfaceReference {
  return { id, label, images };
}

function workspacePermission(
  ...allOf: CoProducePermissionId[]
): CoProducePermissionRequirement {
  return {
    anyOf: [{ principal: "workspace", allOf }],
    enforcement: "server-and-record-policy",
  };
}

function reviewInvitePermission(
  minimum: CoProduceReviewPermission,
): CoProducePermissionRequirement {
  return {
    anyOf: [{ principal: "review-invite", minimum }],
    enforcement: "server-and-record-policy",
  };
}

function readOnlyAudit(rule: string): CoProduceAuditContract {
  return { responsibility: "read-only", record: null, events: [], rule };
}

function unavailableAudit(reason: string): CoProduceAuditContract {
  return { responsibility: "unavailable", record: null, events: [], rule: reason };
}

function unavailableRoute(intent: string, reason: string): CoProduceRouteIntent {
  return { kind: "unavailable", intent, routeId: null, reason };
}

function unavailableReadiness(reason: string): CoProduceReadiness {
  return { state: "unavailable", claim: "Not available", blockers: [reason] };
}

const NO_ROUTE_WITHOUT_DURABILITY =
  "No durable record and production route currently satisfy this surface.";

export const CO_PRODUCE_CAPABILITY_GROUPS = [
  {
    owner: { id: "workspace-shell", kind: "shell", label: "Workspace shell" },
    capabilities: [
      {
        id: "workspace-shell.dashboard",
        owner: "workspace-shell",
        label: "Dashboard",
        summary: "Read project, review, asset, and activity projections without becoming their authority.",
        surfaces: [
          surface("nav.dashboard", "Dashboard", "lifecycle-dashboard", "system-map"),
          surface("system.unified-workspace", "Unified Workspace", "system-map"),
          surface("dashboard.project-progress", "Project Progress", "lifecycle-dashboard", "system-map"),
        ],
        route: { kind: "page", intent: "view-workspace-dashboard", routeId: "dashboard" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "project",
          supporting: ["asset", "review", "approval_step", "activity_event"],
          authorityRule: "Dashboard status is a projection over canonical project records.",
        },
        audit: readOnlyAudit("Reading aggregate project state emits no mutation event."),
        readiness: {
          state: "read-only",
          claim: "The authenticated dashboard route reads canonical project data.",
          blockers: [],
        },
      },
      {
        id: "workspace-shell.projects",
        owner: "workspace-shell",
        label: "Projects",
        summary: "Browse projects and enter one project-scoped workspace.",
        surfaces: [
          surface("nav.projects", "Projects", "lifecycle-dashboard", "system-map", "review-cockpit"),
          surface("nav.all-projects", "All Projects", "system-map", "review-cockpit"),
          surface("system.project-hub", "Project Hub", "system-map"),
          surface("cockpit.project-browser", "Project Browser", "review-cockpit"),
        ],
        route: { kind: "page", intent: "browse-projects", routeId: "projects" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "project",
          supporting: ["asset"],
          authorityRule: "The project record is the root scope for every lifecycle capability.",
        },
        audit: readOnlyAudit("Browsing projects does not append project activity."),
        readiness: {
          state: "operational",
          claim: "Project list and project workspace routes are present.",
          blockers: [],
        },
      },
      {
        id: "workspace-shell.business-intake",
        owner: "workspace-shell",
        label: "Client intake and business ops",
        summary:
          "Capture client, quote, proposal, contract, deposit, invoice, payment, and expense readiness without claiming business authority.",
        surfaces: [
          surface("business.client-intake", "Client Intake", "system-map", "lifecycle-dashboard"),
          surface("business.proposals-contracts", "Quotes, Proposals & Contracts", "system-map"),
          surface("business.billing-readiness", "Deposits, Invoices & Payments", "system-map"),
        ],
        route: { kind: "page", intent: "start-client-business-intake", routeId: "project_create" },
        permission: workspacePermission("projects:create"),
        data: {
          primary: "project",
          supporting: [
            "planned.client_lead",
            "planned.proposal_contract",
            "planned.billing_record",
            "planned.expense_record",
          ],
          authorityRule:
            "Project intake may collect business context; CRM, proposal, contract, billing, payment, and expense truth requires durable records.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["project.created"],
          rule: "Append project creation activity after the workspace commits; intake notes cannot assert a lead conversion, signed contract, payment, or expense event.",
        },
        readiness: {
          state: "guarded",
          claim: "The project intake route can collect client and business context before workspace creation.",
          blockers: [
            "CRM, proposal, signature, deposit, invoice, payment, and expense records remain planned and cannot be marked complete.",
          ],
        },
      },
      {
        id: "workspace-shell.project-overview",
        owner: "workspace-shell",
        label: "Project overview",
        summary: "Open one project and inspect its current media and collaboration state.",
        surfaces: [
          surface("project.overview-tab", "Overview", "lifecycle-dashboard", "system-map"),
          surface("project.collaboration-tab", "Collaboration", "review-cockpit"),
        ],
        route: { kind: "page", intent: "view-project-overview", routeId: "project" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "project",
          supporting: ["asset", "comment", "approval_step", "activity_event"],
          authorityRule: "Overview metrics derive from canonical records and are never written back as lifecycle truth.",
        },
        audit: readOnlyAudit("Opening the overview is not a project lifecycle event."),
        readiness: {
          state: "read-only",
          claim: "The project cockpit reads live project and asset routes.",
          blockers: [],
        },
      },
      {
        id: "workspace-shell.search",
        owner: "workspace-shell",
        label: "Workspace search",
        summary: "Filter routes and already-authorized project and asset records.",
        surfaces: [surface("global.search", "Search projects, assets, people", "lifecycle-dashboard", "system-map", "review-cockpit")],
        route: { kind: "action", intent: "search-authorized-workspace", routeId: "dashboard", action: "open-command-search" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "project",
          supporting: ["asset", "team_member"],
          authorityRule: "Search results never widen record access and never become a source of truth.",
        },
        audit: readOnlyAudit("Local authorized filtering emits no audit event."),
        readiness: {
          state: "read-only",
          claim: "Command and workspace filtering exists; this is not semantic or AI search.",
          blockers: [],
        },
      },
      {
        id: "workspace-shell.notifications",
        owner: "workspace-shell",
        label: "Notifications",
        summary: "Read notification records without treating them as proof of external delivery.",
        surfaces: [surface("global.notifications", "Notifications", "lifecycle-dashboard", "system-map", "review-cockpit")],
        route: { kind: "action", intent: "view-notifications", routeId: "dashboard", action: "open-notification-list" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "notification",
          supporting: ["activity_event"],
          authorityRule: "Provider receipts and notification records, not the bell UI, own delivery state.",
        },
        audit: readOnlyAudit("Reading or presenting a notification does not create project activity."),
        readiness: {
          state: "read-only",
          claim: "Notification records and list surfaces exist.",
          blockers: [],
        },
      },
      {
        id: "workspace-shell.team-management",
        owner: "workspace-shell",
        label: "Team",
        summary: "Manage workspace membership separately from project phase progress.",
        surfaces: [surface("nav.team", "Team", "lifecycle-dashboard", "system-map", "review-cockpit")],
        route: { kind: "page", intent: "manage-workspace-team", routeId: "settings" },
        permission: workspacePermission("workspace:manage"),
        data: {
          primary: "team_member",
          supporting: ["team", "activity_event"],
          authorityRule: "Persisted membership and roles own access; presence and activity do not.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["team.member.invited", "team.member.role_changed", "team.member.removed"],
          rule: "Append a sanitized team audit event only after the membership change commits.",
        },
        readiness: {
          state: "guarded",
          claim: "Team records and settings route exist behind workspace management.",
          blockers: ["Project-specific delegated roles are not a separate durable authority."],
        },
      },
      {
        id: "workspace-shell.activity",
        owner: "workspace-shell",
        label: "Activity",
        summary: "Read append-only project events generated by authoritative writes.",
        surfaces: [
          surface("nav.activity", "Activity", "lifecycle-dashboard", "system-map", "review-cockpit"),
          surface("dashboard.activity", "Recent Activity", "system-map"),
        ],
        route: { kind: "page", intent: "view-project-activity", routeId: "activity" },
        permission: workspacePermission("activity:read"),
        data: {
          primary: "activity_event",
          supporting: ["project", "asset"],
          authorityRule: "Activity explains committed actions but never replaces the record that was changed.",
        },
        audit: readOnlyAudit("Reading the audit trail cannot append to it."),
        readiness: {
          state: "read-only",
          claim: "The activity route reads persisted activity events.",
          blockers: [],
        },
      },
      {
        id: "workspace-shell.settings",
        owner: "workspace-shell",
        label: "Settings",
        summary: "Open workspace policy and account settings.",
        surfaces: [
          surface("nav.settings", "Settings", "lifecycle-dashboard", "system-map", "review-cockpit"),
          surface("global.profile", "Profile", "lifecycle-dashboard", "system-map", "review-cockpit"),
        ],
        route: { kind: "page", intent: "manage-workspace-settings", routeId: "settings" },
        permission: workspacePermission("workspace:manage"),
        data: {
          primary: "team",
          supporting: ["team_member", "notification"],
          authorityRule: "Each settings panel must write its own canonical policy record.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["workspace.settings.changed"],
          rule: "Security-sensitive setting changes require a sanitized post-commit audit event.",
        },
        readiness: {
          state: "guarded",
          claim: "The settings route exists; readiness remains panel-specific.",
          blockers: ["A visible settings section is not evidence that every policy family is durable."],
        },
      },
      {
        id: "workspace-shell.timeline",
        owner: "workspace-shell",
        label: "Project timeline",
        summary: "Inspect source-time media, comments, and review markers without claiming sequence-edit authority.",
        surfaces: [
          surface("project.timeline-tab", "Timeline", "lifecycle-dashboard", "system-map", "review-cockpit"),
          surface("cockpit.review-timeline", "Review timeline", "review-cockpit"),
        ],
        route: { kind: "page", intent: "view-version-timeline", routeId: "asset_review" },
        permission: workspacePermission("media:read", "reviews:read"),
        data: {
          primary: "version",
          supporting: ["comment", "edit_decision"],
          authorityRule: "Source time on the bound version is canonical; visual tracks are a projection.",
        },
        audit: readOnlyAudit("Seeking and inspecting the timeline are not edit operations."),
        readiness: {
          state: "read-only",
          claim: "The internal asset review route renders version-bound review timing.",
          blockers: ["No durable multi-track sequence revision exists."],
        },
      },
      {
        id: "workspace-shell.details",
        owner: "workspace-shell",
        label: "Details",
        summary: "Read project and asset metadata from their canonical records.",
        surfaces: [surface("project.details-tab", "Details", "lifecycle-dashboard", "review-cockpit")],
        route: { kind: "page", intent: "view-project-details", routeId: "project" },
        permission: workspacePermission("projects:read", "media:read"),
        data: {
          primary: "asset",
          supporting: ["project", "version"],
          authorityRule: "Metadata fields remain attached to their owning project, asset, or version record.",
        },
        audit: readOnlyAudit("Viewing details emits no metadata event."),
        readiness: {
          state: "read-only",
          claim: "Project and asset metadata are readable in the project workspace.",
          blockers: [],
        },
      },
      {
        id: "workspace-shell.storage-management",
        owner: "workspace-shell",
        label: "Storage management",
        summary: "Manage workspace capacity, placement, retention, and continuity policy.",
        surfaces: [
          surface("dashboard.storage", "Storage", "lifecycle-dashboard"),
          surface("dashboard.manage-storage", "Manage Storage", "lifecycle-dashboard"),
        ],
        route: unavailableRoute("manage-storage", "Storage readiness checks exist, but no durable allocation ledger and management surface exist."),
        permission: workspacePermission("storage:manage"),
        data: {
          primary: "planned.storage_allocation",
          supporting: ["asset", "version"],
          authorityRule: "Capacity UI cannot change storage authority without an allocation record.",
        },
        audit: unavailableAudit("No storage-management mutation is available."),
        readiness: unavailableReadiness("A durable storage allocation and quota authority is missing."),
      },
    ],
  },
  {
    owner: { id: "pre-production", kind: "phase", label: "Pre-production" },
    capabilities: [
      {
        id: "pre-production.project-brief",
        owner: "pre-production",
        label: "Project brief",
        summary: "Version creative goals, requirements, references, and acceptance criteria.",
        surfaces: [
          surface("phase.pre-production", "Pre-production", "lifecycle-dashboard", "system-map", "agentic-cycle"),
          surface("pre-production.project-brief", "Project Brief", "lifecycle-dashboard", "system-map"),
        ],
        route: unavailableRoute("open-project-brief", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("preproduction:write"),
        data: {
          primary: "planned.project_brief_revision",
          supporting: ["project"],
          authorityRule: "A brief must be a project-scoped revision; project metadata is not a substitute.",
        },
        audit: unavailableAudit("No project brief write path exists."),
        readiness: unavailableReadiness("Project brief revisions are not durably modeled."),
      },
      {
        id: "pre-production.scripts-storyboards",
        owner: "pre-production",
        label: "Scripts and storyboards",
        summary: "Version scripts, storyboards, annotations, and production notes under project authority.",
        surfaces: [surface("pre-production.scripts-storyboards", "Scripts & Storyboards", "lifecycle-dashboard", "system-map")],
        route: unavailableRoute("open-scripts-storyboards", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("preproduction:write"),
        data: {
          primary: "planned.script_revision",
          supporting: ["project"],
          authorityRule: "Co-Script may own script revisions but may not create a second project or permission authority.",
        },
        audit: unavailableAudit("No script or storyboard write path exists."),
        readiness: unavailableReadiness("Script and storyboard revisions are not durably modeled."),
      },
      {
        id: "pre-production.shot-lists-schedules",
        owner: "pre-production",
        label: "Shot lists and schedules",
        summary: "Coordinate shots, schedules, and call sheets as versioned project records.",
        surfaces: [surface("pre-production.shot-lists-schedules", "Shot Lists & Schedules", "lifecycle-dashboard", "system-map")],
        route: unavailableRoute("open-shot-lists-schedules", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("preproduction:write"),
        data: {
          primary: "planned.shot_schedule",
          supporting: ["project"],
          authorityRule: "Schedule completion must come from persisted schedule records.",
        },
        audit: unavailableAudit("No shot-list or schedule mutation is available."),
        readiness: unavailableReadiness("Shot-list and schedule records are absent."),
      },
      {
        id: "pre-production.locations-talent",
        owner: "pre-production",
        label: "Locations and talent",
        summary: "Track scouting, casting, permits, releases, and rights evidence.",
        surfaces: [surface("pre-production.locations-talent", "Locations & Talent", "lifecycle-dashboard", "system-map")],
        route: unavailableRoute("open-locations-talent", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("preproduction:write"),
        data: {
          primary: "planned.location_talent_release",
          supporting: ["project"],
          authorityRule: "Rights and release clearance must be explicit durable evidence.",
        },
        audit: unavailableAudit("No location, talent, permit, or release write path exists."),
        readiness: unavailableReadiness("Locations, talent, permits, and releases are not modeled."),
      },
      {
        id: "pre-production.tasks-approvals",
        owner: "pre-production",
        label: "Tasks and approvals",
        summary: "Assign planning work and record human approval checkpoints.",
        surfaces: [
          surface("pre-production.tasks-approvals", "Tasks & Approvals", "lifecycle-dashboard"),
          surface("nav.tasks", "Tasks", "lifecycle-dashboard", "system-map", "review-cockpit"),
        ],
        route: unavailableRoute("open-production-tasks", "Approval records exist for media review, but no durable production task authority exists."),
        permission: workspacePermission("preproduction:write"),
        data: {
          primary: "planned.production_task",
          supporting: ["project", "approval_workflow"],
          authorityRule: "Media approval steps cannot be reused as task completion records.",
        },
        audit: unavailableAudit("Demo task completion must not emit production audit events."),
        readiness: unavailableReadiness("Durable task assignment and completion records are absent."),
      },
    ],
  },
  {
    owner: { id: "production", kind: "phase", label: "Production" },
    capabilities: [
      {
        id: "production.live-production",
        owner: "production",
        label: "Live production",
        summary: "Monitor a governed production session and its authorized participants.",
        surfaces: [
          surface("phase.production", "Production", "lifecycle-dashboard", "system-map", "agentic-cycle"),
          surface("production.live-production", "Live Production", "lifecycle-dashboard", "system-map"),
        ],
        route: unavailableRoute("open-live-production", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("production:manage"),
        data: {
          primary: "planned.production_session",
          supporting: ["project", "team_member"],
          authorityRule: "Presence alone cannot establish a production session.",
        },
        audit: unavailableAudit("No live production session events may be emitted."),
        readiness: unavailableReadiness("Production session persistence and routing are absent."),
      },
      {
        id: "production.on-set-media",
        owner: "production",
        label: "On-set media",
        summary: "Ingest project-owned media and create immutable versions plus processing jobs.",
        surfaces: [
          surface("production.on-set-media", "On-Set Media", "lifecycle-dashboard", "system-map"),
          surface("global.upload-media", "Upload Media", "lifecycle-dashboard", "system-map", "review-cockpit"),
        ],
        route: { kind: "action", intent: "upload-project-media", routeId: "project", action: "open-project-upload" },
        permission: workspacePermission("media:write"),
        data: {
          primary: "asset",
          supporting: ["version", "transcode_job", "activity_event"],
          authorityRule: "The asset and version records own ingest state; browser progress is only a projection.",
        },
        audit: {
          responsibility: "append-attempt-and-outcome",
          record: "activity_event",
          events: ["asset.upload.started", "asset.upload.completed", "asset.upload.failed"],
          rule: "Record a sanitized attempt and terminal outcome without logging source credentials or URLs.",
        },
        readiness: {
          state: "guarded",
          claim: "Authenticated asset upload, version, and processing routes exist.",
          blockers: ["Runtime storage and worker readiness must pass before accepting media."],
        },
      },
      {
        id: "production.logging-metadata",
        owner: "production",
        label: "Logging and metadata",
        summary: "Read and organize metadata already owned by project assets and versions.",
        surfaces: [surface("production.logging-metadata", "Logging & Metadata", "lifecycle-dashboard", "system-map")],
        route: { kind: "page", intent: "view-asset-metadata", routeId: "project" },
        permission: workspacePermission("media:read"),
        data: {
          primary: "asset",
          supporting: ["version"],
          authorityRule: "Asset and version metadata remain canonical; there is no separate scene-log authority.",
        },
        audit: readOnlyAudit("Reading existing media metadata does not append activity."),
        readiness: {
          state: "read-only",
          claim: "Asset metadata is readable from the project workspace.",
          blockers: ["Take, scene, and on-set log records are not implemented."],
        },
      },
      {
        id: "production.team-communication",
        owner: "production",
        label: "Team communication",
        summary: "Publish project-scoped updates and announcements with durable recipients and delivery state.",
        surfaces: [surface("production.team-communication", "Team & Communication", "lifecycle-dashboard", "system-map")],
        route: unavailableRoute("open-production-communication", "Comments and notifications exist, but no durable production announcement channel exists."),
        permission: workspacePermission("production:manage"),
        data: {
          primary: "planned.production_log",
          supporting: ["team_member", "notification"],
          authorityRule: "Review comments and notifications cannot masquerade as a production communication log.",
        },
        audit: unavailableAudit("No production communication mutation is available."),
        readiness: unavailableReadiness("A project-scoped production communication record is absent."),
      },
      {
        id: "production.daily-reports",
        owner: "production",
        label: "Daily reports",
        summary: "Record notes, images, summaries, incidents, and handoff evidence for a production day.",
        surfaces: [surface("production.daily-reports", "Daily Reports", "lifecycle-dashboard")],
        route: unavailableRoute("open-daily-reports", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("production:manage"),
        data: {
          primary: "planned.production_log",
          supporting: ["project", "asset"],
          authorityRule: "A report requires an immutable production-day record and attachments.",
        },
        audit: unavailableAudit("No daily report write path exists."),
        readiness: unavailableReadiness("Daily production reports are not modeled."),
      },
    ],
  },
  {
    owner: { id: "post-production", kind: "phase", label: "Post-production" },
    capabilities: [
      {
        id: "post-production.editor-workspace",
        owner: "post-production",
        label: "Editor workspace",
        summary: "Edit a durable sequence revision with reversible source-time operations.",
        surfaces: [
          surface("phase.post-production", "Post-production", "lifecycle-dashboard", "system-map", "agentic-cycle"),
          surface("post-production.editor-workspace", "Editor Workspace", "lifecycle-dashboard", "system-map"),
          surface("nav.sequences", "Sequences", "lifecycle-dashboard", "system-map", "review-cockpit"),
        ],
        route: unavailableRoute("open-editor-workspace", "Review timing and edit decisions exist, but no durable sequence revision or editor route exists."),
        permission: workspacePermission("postproduction:write"),
        data: {
          primary: "planned.sequence_revision",
          supporting: ["version", "edit_decision", "transcription"],
          authorityRule: "A rendered timeline is not authoritative until a composition revision is persisted.",
        },
        audit: unavailableAudit("No sequence mutation or editor publication is available."),
        readiness: unavailableReadiness("Immutable composition and sequence revisions are absent."),
      },
      {
        id: "post-production.reviews-feedback",
        owner: "post-production",
        label: "Reviews and feedback",
        summary: "Review one version and create durable, source-time comments.",
        surfaces: [
          surface("post-production.reviews-feedback", "Reviews & Feedback", "lifecycle-dashboard", "system-map"),
          surface("nav.reviews", "Reviews", "lifecycle-dashboard", "system-map", "review-cockpit"),
          surface("cockpit.review-player", "Review Player", "lifecycle-dashboard", "review-cockpit"),
          surface("cockpit.comments", "Comments", "lifecycle-dashboard", "review-cockpit"),
        ],
        route: { kind: "page", intent: "review-version-and-comment", routeId: "asset_review" },
        permission: workspacePermission("reviews:read", "reviews:comment"),
        data: {
          primary: "comment",
          supporting: ["review", "asset", "version", "activity_event"],
          authorityRule: "Comments bind to exact asset/version source time; asset status changes remain explicit.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["review.comment.created", "review.comment.resolved"],
          rule: "Append activity only after the comment or resolution commits.",
        },
        readiness: {
          state: "operational",
          claim: "Internal review, comments, and source-time routing exist.",
          blockers: [],
        },
      },
      {
        id: "post-production.public-review",
        owner: "post-production",
        label: "Public review workspace",
        summary: "Expose only the version and actions granted by one review invite.",
        surfaces: [surface("cockpit.public-review", "Shared Review", "lifecycle-dashboard", "review-cockpit")],
        route: { kind: "page", intent: "open-shared-review", routeId: "public_review" },
        permission: reviewInvitePermission("view"),
        data: {
          primary: "review_invite",
          supporting: ["asset", "version", "comment", "approval_step"],
          authorityRule: "The token policy and selected immutable version bound public access.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["review.link.viewed"],
          rule: "Record a sanitized view only after token policy succeeds; never log the token.",
        },
        readiness: {
          state: "guarded",
          claim: "The public review route enforces token-scoped view, comment, and approval actions.",
          blockers: ["Availability depends on an active, unexpired invite bound to the requested version."],
        },
      },
      {
        id: "post-production.public-review-comment",
        owner: "post-production",
        label: "Public review comment",
        summary: "Create a version-bound comment only when the invite grants comment authority.",
        surfaces: [surface("cockpit.public-review-comment", "Public Review Comment", "review-cockpit")],
        route: { kind: "action", intent: "comment-on-shared-review", routeId: "public_review", action: "submit-public-review-comment" },
        permission: reviewInvitePermission("comment"),
        data: {
          primary: "comment",
          supporting: ["review_invite", "asset", "version", "activity_event"],
          authorityRule: "The invite must grant comment authority and the comment must bind to its selected version.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["review.comment.created"],
          rule: "Append token-free activity only after the public comment commits.",
        },
        readiness: {
          state: "guarded",
          claim: "The public review comment route enforces invite permission and version scope.",
          blockers: ["View-only invites cannot comment."],
        },
      },
      {
        id: "post-production.public-review-approval",
        owner: "post-production",
        label: "Public review approval",
        summary: "Record a review decision only when the invite grants approve authority.",
        surfaces: [surface("cockpit.public-review-approval", "Public Review Approval", "review-cockpit")],
        route: { kind: "action", intent: "approve-shared-review", routeId: "public_review", action: "submit-public-review-approval" },
        permission: reviewInvitePermission("approve"),
        data: {
          primary: "approval_step",
          supporting: ["review_invite", "approval_workflow", "approval_history", "asset", "version"],
          authorityRule: "The invite must grant approve authority and match the version and approval step being decided.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "approval_history",
          events: ["review.approval.decided"],
          rule: "Append approval history only after token, assignee, version, and transition checks pass.",
        },
        readiness: {
          state: "guarded",
          claim: "The public approval route enforces approve-level invite authority.",
          blockers: ["View and comment invites cannot approve."],
        },
      },
      {
        id: "post-production.review-approvals",
        owner: "post-production",
        label: "Review approvals",
        summary: "Record approve, request-changes, or reject decisions through authorized workflow steps.",
        surfaces: [
          surface("cockpit.review-approval", "Review & Approval", "lifecycle-dashboard"),
          surface("cockpit.approval", "Approval", "review-cockpit"),
          surface("cockpit.approve", "Approve", "lifecycle-dashboard", "review-cockpit"),
          surface("cockpit.request-changes", "Request Changes", "lifecycle-dashboard", "review-cockpit"),
        ],
        route: { kind: "page", intent: "decide-review-approval", routeId: "asset_review" },
        permission: workspacePermission("reviews:approve"),
        data: {
          primary: "approval_step",
          supporting: ["approval_workflow", "approval_history", "asset", "version"],
          authorityRule: "Persisted approval steps and history own decisions; badges and progress indicators are derived.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "approval_history",
          events: ["review.approval.decided"],
          rule: "Every decision appends approval history and then reconciles workflow and asset state.",
        },
        readiness: {
          state: "guarded",
          claim: "Approval workflows and decision routes exist.",
          blockers: ["The caller must be the authorized owner, assignee, or approve-capable invite."],
        },
      },
      {
        id: "post-production.spatial-annotations",
        owner: "post-production",
        label: "Spatial annotations",
        summary: "Attach one clear frame pin to a timecoded review comment.",
        surfaces: [surface("cockpit.frame-pin-comment", "Frame pin comments", "review-cockpit")],
        route: unavailableRoute("annotate-review-frame", "Frame-pin comments are live; the canonical review cockpit does not expose a full drawing workflow."),
        permission: workspacePermission("reviews:comment"),
        data: {
          primary: "annotation",
          supporting: ["comment", "version"],
          authorityRule: "Annotation records remain review evidence and cannot become edit decisions.",
        },
        audit: unavailableAudit("No full annotation-tool workflow is claimed as live; durable evidence is captured through timecoded comments and frame pins."),
        readiness: unavailableReadiness("Full drawing markup is intentionally not exposed; reviewers should use frame pins, comments, and cut markers."),
      },
      {
        id: "post-production.graphics-titles",
        owner: "post-production",
        label: "Graphics and titles",
        summary: "Version templates, title content, and render inputs.",
        surfaces: [surface("post-production.graphics-titles", "Graphics & Titles", "lifecycle-dashboard", "system-map")],
        route: unavailableRoute("open-graphics-titles", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("postproduction:write"),
        data: {
          primary: "planned.graphics_revision",
          supporting: ["version"],
          authorityRule: "A drawn timeline label is not a graphics revision.",
        },
        audit: unavailableAudit("No graphics or title mutation is available."),
        readiness: unavailableReadiness("Graphics and title revisions are not modeled."),
      },
      {
        id: "post-production.audio-music",
        owner: "post-production",
        label: "Audio and music",
        summary: "Version mixes, stems, music, SFX, rights, and render inputs.",
        surfaces: [surface("post-production.audio-music", "Audio & Music", "lifecycle-dashboard", "system-map")],
        route: unavailableRoute("open-audio-music", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("postproduction:write"),
        data: {
          primary: "planned.audio_mix_revision",
          supporting: ["version"],
          authorityRule: "Waveform display and mute controls are not an audio mix authority.",
        },
        audit: unavailableAudit("No audio mix mutation is available."),
        readiness: unavailableReadiness("Audio mix and music-rights revisions are absent."),
      },
      {
        id: "post-production.exports-versions",
        owner: "post-production",
        label: "Exports and versions",
        summary: "Create immutable versions and request derived exports without overwriting source media.",
        surfaces: [
          surface("post-production.exports-versions", "Exports & Versions", "lifecycle-dashboard", "system-map"),
          surface("project.version", "Version", "lifecycle-dashboard", "system-map", "review-cockpit"),
        ],
        route: { kind: "page", intent: "manage-asset-versions", routeId: "asset_review" },
        permission: workspacePermission("media:write"),
        data: {
          primary: "version",
          supporting: ["asset", "transcode_job", "activity_event"],
          authorityRule: "Each output is a derivative or new version; source URLs and prior versions remain immutable.",
        },
        audit: {
          responsibility: "append-attempt-and-outcome",
          record: "activity_event",
          events: ["version.created", "export.requested", "export.completed", "export.failed"],
          rule: "Bind each event to the exact asset and version after permission and readiness checks.",
        },
        readiness: {
          state: "guarded",
          claim: "Version creation and export routes exist.",
          blockers: ["An export is not proof of final delivery or publication."],
        },
      },
    ],
  },
  {
    owner: { id: "delivery-assets", kind: "phase", label: "Delivery & Assets" },
    capabilities: [
      {
        id: "delivery-assets.deliverables",
        owner: "delivery-assets",
        label: "Deliverables",
        summary: "Prepare a checksum-bound package of approved versions for explicit handoff.",
        surfaces: [
          surface("phase.delivery-assets", "Delivery & Assets", "lifecycle-dashboard", "system-map"),
          surface("delivery-assets.deliverables", "Deliverables", "lifecycle-dashboard", "system-map"),
          surface("nav.deliverables", "Deliverables", "lifecycle-dashboard"),
        ],
        route: unavailableRoute("open-deliverables", "Exports exist, but no canonical final-delivery record or route exists."),
        permission: workspacePermission("delivery:manage"),
        data: {
          primary: "planned.delivery_record",
          supporting: ["project", "asset", "version", "approval_step"],
          authorityRule: "Only a delivery record can prove selected approved versions and handoff outcome.",
        },
        audit: unavailableAudit("No final delivery may be recorded from this surface."),
        readiness: unavailableReadiness("Final delivery preparation and handoff are not canonical."),
      },
      {
        id: "delivery-assets.asset-library",
        owner: "delivery-assets",
        label: "Asset library",
        summary: "Browse and organize project assets, folders, tags, and versions.",
        surfaces: [
          surface("delivery-assets.asset-library", "Asset Library", "lifecycle-dashboard", "system-map"),
          surface("nav.media-library", "Media Library", "lifecycle-dashboard", "system-map", "review-cockpit"),
          surface("dashboard.recent-assets", "Recent Assets", "lifecycle-dashboard"),
          surface("system.smart-asset-management", "Smart Asset Management", "system-map"),
        ],
        route: { kind: "page", intent: "browse-asset-library", routeId: "library" },
        permission: workspacePermission("media:read"),
        data: {
          primary: "asset",
          supporting: ["version", "project"],
          authorityRule: "Asset and version records own media identity; cards and filters are projections.",
        },
        audit: readOnlyAudit("Browsing and filtering the library emit no mutation event."),
        readiness: {
          state: "operational",
          claim: "The media library route reads canonical assets and versions.",
          blockers: [],
        },
      },
      {
        id: "delivery-assets.permissions-sharing",
        owner: "delivery-assets",
        label: "Permissions and sharing",
        summary: "Create version-bound review links with explicit recipient permissions.",
        surfaces: [
          surface("delivery-assets.permissions", "Permissions", "lifecycle-dashboard"),
          surface("system.team-permissions", "Team & Permissions", "system-map"),
          surface("global.share", "Share", "lifecycle-dashboard", "system-map", "review-cockpit"),
        ],
        route: { kind: "action", intent: "share-version-for-review", routeId: "asset_review", action: "open-share-policy" },
        permission: workspacePermission("reviews:comment"),
        data: {
          primary: "review_invite",
          supporting: ["asset", "version", "team_member", "activity_event"],
          authorityRule: "Persisted invite policy and workspace membership own access; copied URLs do not.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["review.link.created", "review.link.revoked"],
          rule: "Append a token-free audit event after link policy commits or is revoked.",
        },
        readiness: {
          state: "guarded",
          claim: "Version-aware sharing and review permission routes exist.",
          blockers: ["The selected version and recipient policy must pass server-side validation."],
        },
      },
      {
        id: "delivery-assets.distribution",
        owner: "delivery-assets",
        label: "Distribution",
        summary: "Publish approved packages to explicit destinations with attempt and outcome receipts.",
        surfaces: [surface("delivery-assets.distribution", "Distributions", "lifecycle-dashboard", "system-map")],
        route: unavailableRoute("distribute-approved-delivery", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("delivery:manage"),
        data: {
          primary: "planned.distribution_record",
          supporting: ["planned.delivery_record", "version"],
          authorityRule: "No integration or webhook may imply successful publication without a distribution receipt.",
        },
        audit: unavailableAudit("No distribution or publication action is live."),
        readiness: unavailableReadiness("Distribution destinations and receipts are not modeled."),
      },
      {
        id: "delivery-assets.project-archive",
        owner: "delivery-assets",
        label: "Project archive",
        summary: "Move a project into its canonical archived state without claiming legal compliance.",
        surfaces: [surface("nav.archive", "Archive", "system-map", "review-cockpit")],
        route: { kind: "page", intent: "browse-archived-projects", routeId: "archive" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "project",
          supporting: ["activity_event"],
          authorityRule: "projects.status = archived is the only archive authority currently implemented.",
        },
        audit: readOnlyAudit("Browsing archived projects emits no event; archive mutations audit at their command boundary."),
        readiness: {
          state: "operational",
          claim: "The archive route and canonical project status exist.",
          blockers: ["Archived does not mean retention-compliant or finally delivered."],
        },
      },
      {
        id: "delivery-assets.archive-compliance",
        owner: "delivery-assets",
        label: "Archive and compliance",
        summary: "Apply retention, rights, legal hold, and continuity-pack policy.",
        surfaces: [surface("delivery-assets.archive-compliance", "Archive & Compliance", "lifecycle-dashboard")],
        route: unavailableRoute("manage-archive-compliance", "Project archive exists, but compliance and continuity records do not."),
        permission: workspacePermission("delivery:manage"),
        data: {
          primary: "planned.compliance_record",
          supporting: ["project", "planned.delivery_record"],
          authorityRule: "Project archive status cannot establish rights, retention, legal hold, or continuity compliance.",
        },
        audit: unavailableAudit("No compliance mutation is available."),
        readiness: unavailableReadiness("Compliance, retention, and continuity records are absent."),
      },
    ],
  },
  {
    owner: { id: "human-agent-loop", kind: "loop", label: "Human + agent loop" },
    capabilities: [
      {
        id: "human-agent-loop.lifecycle-control",
        owner: "human-agent-loop",
        label: "Lifecycle control",
        summary: "Show phase readiness as a derived projection and keep human checkpoints explicit.",
        surfaces: [
          surface("system.end-to-end-workflow", "End-to-End Workflow", "system-map"),
          surface("agentic-cycle.human-loop", "Agentic + Human in the Loop", "agentic-cycle", "system-map"),
        ],
        route: { kind: "page", intent: "view-lifecycle-readiness", routeId: "project" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "project",
          supporting: ["asset", "version", "review", "approval_workflow", "approval_step"],
          authorityRule: "Phase state is derived from capability readiness and canonical records; it is never independently writable.",
        },
        audit: readOnlyAudit("Rendering lifecycle progress emits no event."),
        readiness: {
          state: "read-only",
          claim: "The contract can derive lifecycle visibility from canonical records.",
          blockers: ["Unavailable capability groups cannot be displayed as complete."],
        },
      },
      {
        id: "human-agent-loop.human-checkpoint",
        owner: "human-agent-loop",
        label: "Human checkpoint",
        summary: "Require an authorized human decision before approval or future agent output takes effect.",
        surfaces: [surface("agentic-cycle.human-checkpoint", "Human in the Loop", "agentic-cycle", "system-map")],
        route: { kind: "page", intent: "review-human-checkpoint", routeId: "asset_review" },
        permission: workspacePermission("reviews:approve"),
        data: {
          primary: "approval_step",
          supporting: ["approval_workflow", "approval_history"],
          authorityRule: "Only the persisted human decision is authoritative; agent confidence never substitutes for approval.",
        },
        audit: readOnlyAudit("This surface reads checkpoint state; decision commands own their approval-history event."),
        readiness: {
          state: "read-only",
          claim: "Media review approval checkpoints are durable.",
          blockers: ["Agent proposal decisions remain unavailable until agent runs are durable."],
        },
      },
      {
        id: "human-agent-loop.agent-copilot",
        owner: "human-agent-loop",
        label: "AI co-pilot",
        summary: "Create a source-grounded, proposal-only agent run under budget and project policy.",
        surfaces: [surface("system.ai-copilot", "AI Co-Pilot", "system-map")],
        route: unavailableRoute("start-agent-proposal", "The repository agent harness is local/demo-only and has no durable production repository."),
        permission: workspacePermission("agents:propose"),
        data: {
          primary: "planned.agent_run",
          supporting: ["project"],
          authorityRule: "The project vault and append-only agent events must own every run; model memory is never authority.",
        },
        audit: unavailableAudit("No production agent run may be started from this contract."),
        readiness: unavailableReadiness("Durable agent-run storage and authenticated project authority are absent."),
      },
      {
        id: "human-agent-loop.ai-automations",
        owner: "human-agent-loop",
        label: "AI-powered automations",
        summary: "Propose governed automation while preserving human approval and explicit side-effect authority.",
        surfaces: [
          surface("system.ai-automations", "AI-Powered Automations", "system-map"),
          surface("post-production.ai-assist", "AI Assist & Automations", "system-map"),
        ],
        route: unavailableRoute("configure-agent-automation", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("agents:propose", "agents:approve"),
        data: {
          primary: "planned.agent_run",
          supporting: ["planned.workflow_template", "project"],
          authorityRule: "Automations may propose; only authorized domain commands may mutate canonical records.",
        },
        audit: unavailableAudit("No autonomous or scheduled mutation is enabled."),
        readiness: unavailableReadiness("Durable agent runs, policies, and automation schedules are absent."),
      },
      {
        id: "human-agent-loop.smart-search",
        owner: "human-agent-loop",
        label: "Smart search and discovery",
        summary: "Search project knowledge with ACL-filtered provenance and citations.",
        surfaces: [surface("system.smart-search", "Smart Search & Discovery", "system-map")],
        route: unavailableRoute("search-project-knowledge", "Current command filtering is not a governed semantic index."),
        permission: workspacePermission("projects:read"),
        data: {
          primary: "planned.search_index",
          supporting: ["project", "asset"],
          authorityRule: "Search index entries are rebuildable and may never widen source-record access.",
        },
        audit: unavailableAudit("No semantic retrieval receipt is produced."),
        readiness: unavailableReadiness("ACL-filtered semantic indexing and retrieval are not durably deployed."),
      },
      {
        id: "human-agent-loop.real-time-collaboration",
        owner: "human-agent-loop",
        label: "Real-time collaboration",
        summary: "Synchronize review comments and presence while comments remain the durable record.",
        surfaces: [surface("system.real-time-collaboration", "Real-Time Collaboration", "system-map")],
        route: { kind: "page", intent: "collaborate-on-review", routeId: "asset_review" },
        permission: workspacePermission("reviews:read", "reviews:comment"),
        data: {
          primary: "comment",
          supporting: ["review", "version", "team_member"],
          authorityRule: "Realtime transport is ephemeral; persisted comments and decisions remain authoritative.",
        },
        audit: {
          responsibility: "append-after-commit",
          record: "activity_event",
          events: ["review.comment.created", "review.comment.resolved"],
          rule: "Audit the committed collaboration artifact, never transient presence heartbeats.",
        },
        readiness: {
          state: "guarded",
          claim: "Realtime review hooks and durable comments exist.",
          blockers: ["Presence is advisory and may be unavailable without changing record truth."],
        },
      },
      {
        id: "human-agent-loop.analytics-insights",
        owner: "human-agent-loop",
        label: "Analytics and insights",
        summary: "Read rebuildable project analytics derived from canonical events and records.",
        surfaces: [surface("system.analytics-insights", "Analytics & Insights", "system-map")],
        route: { kind: "page", intent: "view-project-analytics", routeId: "project" },
        permission: workspacePermission("projects:read"),
        data: {
          primary: "project_analytics",
          supporting: ["project", "asset", "review", "activity_event"],
          authorityRule: "Analytics are cached projections and cannot write project, review, or delivery status.",
        },
        audit: readOnlyAudit("Reading analytics emits no lifecycle event."),
        readiness: {
          state: "read-only",
          claim: "Project analytics endpoints and projection storage exist.",
          blockers: ["The dedicated analytics:read grant is planned; current access inherits project read authority."],
        },
      },
      {
        id: "human-agent-loop.custom-workflows",
        owner: "human-agent-loop",
        label: "Custom workflows and templates",
        summary: "Instantiate versioned workflow templates without creating parallel identity or audit systems.",
        surfaces: [
          surface("system.custom-workflows", "Custom Workflows & Templates", "system-map"),
          surface("nav.templates", "Templates", "review-cockpit"),
        ],
        route: unavailableRoute("manage-workflow-templates", NO_ROUTE_WITHOUT_DURABILITY),
        permission: workspacePermission("workspace:manage"),
        data: {
          primary: "planned.workflow_template",
          supporting: ["project", "approval_workflow"],
          authorityRule: "Templates configure domain records; they do not own project or approval state.",
        },
        audit: unavailableAudit("No workflow template mutation is available."),
        readiness: unavailableReadiness("Versioned workflow templates and instantiation history are absent."),
      },
      {
        id: "human-agent-loop.integrations-apis",
        owner: "human-agent-loop",
        label: "Integrations and APIs",
        summary: "Manage scoped connections with health, revocation, secret isolation, and delivery receipts.",
        surfaces: [
          surface("system.integrations-apis", "Integrations & APIs", "system-map"),
          surface("nav.integrations", "Integrations", "review-cockpit"),
        ],
        route: unavailableRoute("manage-integrations", "Webhook primitives do not establish a governed integrations surface."),
        permission: workspacePermission("integrations:manage"),
        data: {
          primary: "planned.integration_connection",
          supporting: ["project", "activity_event"],
          authorityRule: "Every connection needs explicit scope and revocation; callbacks cannot become project authority.",
        },
        audit: unavailableAudit("No integration connection mutation is exposed."),
        readiness: unavailableReadiness("Durable connection, credential, and health records are absent."),
      },
      {
        id: "human-agent-loop.mobile-access",
        owner: "human-agent-loop",
        label: "Mobile access",
        summary: "Expose the same permission and record authority through certified mobile workflows.",
        surfaces: [surface("system.mobile-access", "Mobile Access", "system-map")],
        route: unavailableRoute("open-certified-mobile-workspace", "Responsive components alone do not certify required mobile production journeys."),
        permission: workspacePermission("projects:read"),
        data: {
          primary: "planned.mobile_certification",
          supporting: ["project", "asset", "review"],
          authorityRule: "Mobile is a presentation channel and may not create a separate data or permission authority.",
        },
        audit: unavailableAudit("No separate mobile mutation surface is claimed."),
        readiness: unavailableReadiness("Mobile review and production journeys are not certified end to end."),
      },
      {
        id: "human-agent-loop.secure-cloud",
        owner: "human-agent-loop",
        label: "Secure and scalable cloud",
        summary: "Operate storage and compute through verified runtime, residency, and continuity policy.",
        surfaces: [surface("system.secure-cloud", "Secure & Scalable Cloud", "system-map")],
        route: unavailableRoute("manage-cloud-policy", "Runtime adapters and readiness checks do not constitute a customer cloud-management surface."),
        permission: workspacePermission("storage:manage"),
        data: {
          primary: "planned.storage_allocation",
          supporting: ["asset", "version", "transcode_job"],
          authorityRule: "Runtime health is operational evidence, not a user-editable lifecycle record.",
        },
        audit: unavailableAudit("No cloud policy mutation is available."),
        readiness: unavailableReadiness("Storage allocation, residency, and continuity policy are not durably managed here."),
      },
    ],
  },
] as const satisfies readonly CoProduceCapabilityGroup[];

export const CO_PRODUCE_CAPABILITIES: readonly CoProduceCapability[] =
  CO_PRODUCE_CAPABILITY_GROUPS.flatMap(
    (group) => group.capabilities as readonly CoProduceCapability[],
  );

export const CO_PRODUCE_PHASES = [
  { id: "pre-production", order: 1, label: "Pre-production" },
  { id: "production", order: 2, label: "Production" },
  { id: "post-production", order: 3, label: "Post-production" },
  { id: "delivery-assets", order: 4, label: "Delivery & Assets" },
] as const satisfies readonly {
  id: CoProducePhaseId;
  order: number;
  label: string;
}[];

type _CockpitPhaseIdsRemainExact = Assert<
  Exclude<CockpitLifecyclePhaseId, (typeof CO_PRODUCE_PHASES)[number]["id"]> extends never
    ? Exclude<(typeof CO_PRODUCE_PHASES)[number]["id"], CockpitLifecyclePhaseId> extends never
      ? true
      : false
    : false
>;

export const CO_PRODUCE_PHASE_STATUS_CONTRACT = {
  authority: "derived",
  states: ["not-started", "in-progress", "waiting-on-human", "blocked", "complete"],
  progressUnit: "basis-points",
  rule: "Phase state and progress are derived from capability readiness plus canonical records; neither may be written as independent lifecycle truth.",
} as const;

export const CO_PRODUCE_HUMAN_AGENT_STATUS_CONTRACT = {
  agentStates: [
    "unavailable",
    "proposed",
    "blocked",
    "awaiting-human",
    "accepted",
    "rejected",
    "cancelled",
  ],
  humanDecisionStates: ["not-required", "pending", "approved", "rejected"],
  rule: "Agent output is always a proposal. Only an authorized human command may transition a canonical project, asset, version, review, approval, or delivery record.",
} as const;

export interface CoProducePhaseProjection {
  phaseId: CoProducePhaseId;
  state: (typeof CO_PRODUCE_PHASE_STATUS_CONTRACT.states)[number];
  progressBasisPoints: number;
  capabilityStates: Readonly<Record<string, CoProduceReadiness["state"]>>;
  sourceRevision: string;
  derivedAt: string;
}

export type CoProduceAccessContext =
  | {
      principal: "workspace";
      granted: readonly CoProducePermissionId[];
    }
  | {
      principal: "review-invite";
      permission: CoProduceReviewPermission;
    };

const REVIEW_PERMISSION_RANK: Record<CoProduceReviewPermission, number> = {
  view: 1,
  comment: 2,
  approve: 3,
};

export function isCoProduceCapabilityAvailable(capability: CoProduceCapability): boolean {
  return capability.readiness.state !== "unavailable";
}

export function canAccessCoProduceCapability(
  capability: CoProduceCapability,
  context: CoProduceAccessContext,
): boolean {
  if (!isCoProduceCapabilityAvailable(capability)) return false;

  return capability.permission.anyOf.some((clause) => {
    if (clause.principal !== context.principal) return false;
    if (clause.principal === "workspace" && context.principal === "workspace") {
      const grants = new Set(context.granted);
      return clause.allOf.every((permission) => grants.has(permission));
    }
    if (clause.principal === "review-invite" && context.principal === "review-invite") {
      return REVIEW_PERMISSION_RANK[context.permission] >= REVIEW_PERMISSION_RANK[clause.minimum];
    }
    return false;
  });
}

export function getCoProduceCapability(id: string): CoProduceCapability | null {
  return CO_PRODUCE_CAPABILITIES.find((capability) => capability.id === id) ?? null;
}

const SAFE_ROUTE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/;

export function buildCoProduceRoute(
  routeId: CoProduceRouteId,
  params: Readonly<Record<string, string>> = {},
): string {
  const route = CO_PRODUCE_ROUTES[routeId];
  const expected = [...route.params].sort();
  const provided = Object.keys(params).sort();

  if (expected.length !== provided.length || expected.some((key, index) => key !== provided[index])) {
    throw new Error(`Route ${routeId} requires exactly: ${expected.join(", ") || "no parameters"}.`);
  }

  let path: string = route.template;
  for (const key of route.params) {
    const value = params[key];
    if (!SAFE_ROUTE_SEGMENT.test(value) || value === "." || value === "..") {
      throw new Error(`Unsafe ${key} route segment.`);
    }
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }

  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) {
    throw new Error(`Route ${routeId} did not resolve to a safe local path.`);
  }
  return path;
}

export function resolveCoProduceCapabilityRoute(
  capability: CoProduceCapability,
  params: Readonly<Record<string, string>> = {},
): string | null {
  if (!isCoProduceCapabilityAvailable(capability) || capability.route.kind === "unavailable") {
    return null;
  }
  return buildCoProduceRoute(capability.route.routeId, params);
}

export interface CoProduceContractIssue {
  code: string;
  message: string;
}

function routeTemplateParams(template: string): string[] {
  return Array.from(template.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g), (match) => match[1]);
}

export function validateCoProduceLifecycleContract(): CoProduceContractIssue[] {
  const issues: CoProduceContractIssue[] = [];
  const phaseIds = new Set(CO_PRODUCE_PHASES.map((phase) => phase.id));
  const capabilityIds = new Set<string>();
  const surfaceIds = new Set<string>();

  CO_PRODUCE_PHASES.forEach((phase, index) => {
    if (phase.order !== index + 1) {
      issues.push({ code: "phase-order", message: `${phase.id} must have order ${index + 1}.` });
    }
  });

  for (const [routeId, route] of Object.entries(CO_PRODUCE_ROUTES)) {
    const params = routeTemplateParams(route.template).sort();
    const declared = [...route.params].sort();
    if (
      !route.template.startsWith("/") ||
      route.template.startsWith("//") ||
      /[?#\\]/.test(route.template)
    ) {
      issues.push({ code: "unsafe-route-template", message: `${routeId} is not a safe local route template.` });
    }
    if (params.length !== declared.length || params.some((param, index) => param !== declared[index])) {
      issues.push({ code: "route-params", message: `${routeId} has mismatched route parameters.` });
    }
  }

  for (const literalGroup of CO_PRODUCE_CAPABILITY_GROUPS) {
    const group = literalGroup as CoProduceCapabilityGroup;
    if (group.owner.kind === "phase" && !phaseIds.has(group.owner.id as CoProducePhaseId)) {
      issues.push({ code: "unknown-phase-owner", message: `${group.owner.id} is not a lifecycle phase.` });
    }

    for (const capability of group.capabilities) {
      if (capabilityIds.has(capability.id)) {
        issues.push({ code: "duplicate-capability", message: `${capability.id} has duplicate ownership.` });
      }
      capabilityIds.add(capability.id);

      if (capability.owner !== group.owner.id) {
        issues.push({ code: "owner-mismatch", message: `${capability.id} is listed under the wrong owner.` });
      }
      if (!capability.id.startsWith(`${capability.owner}.`)) {
        issues.push({ code: "unstable-capability-id", message: `${capability.id} must be namespaced by its owner.` });
      }
      if (capability.surfaces.length === 0) {
        issues.push({ code: "missing-surface", message: `${capability.id} has no visible surface mapping.` });
      }
      for (const mappedSurface of capability.surfaces) {
        if (surfaceIds.has(mappedSurface.id)) {
          issues.push({ code: "duplicate-surface", message: `${mappedSurface.id} maps to more than one capability.` });
        }
        surfaceIds.add(mappedSurface.id);
        if (mappedSurface.images.length === 0) {
          issues.push({ code: "missing-image", message: `${mappedSurface.id} has no reference image.` });
        }
      }

      if (!(capability.data.primary in CO_PRODUCE_RECORDS)) {
        issues.push({ code: "unknown-record", message: `${capability.id} has an unknown primary record.` });
      }
      for (const supporting of capability.data.supporting) {
        if (!(supporting in CO_PRODUCE_RECORDS)) {
          issues.push({ code: "unknown-record", message: `${capability.id} references unknown record ${supporting}.` });
        }
      }
      if ((capability.permission.anyOf as readonly CoProducePermissionClause[]).length === 0) {
        issues.push({ code: "missing-permission", message: `${capability.id} has no permission requirement.` });
      }

      const unavailable = capability.readiness.state === "unavailable";
      if (unavailable && capability.route.kind !== "unavailable") {
        issues.push({ code: "unavailable-route", message: `${capability.id} must not expose a route.` });
      }
      if (unavailable && capability.audit.responsibility !== "unavailable") {
        issues.push({ code: "unavailable-audit", message: `${capability.id} must not claim live audit writes.` });
      }
      if (!unavailable && capability.route.kind === "unavailable") {
        issues.push({ code: "available-without-route", message: `${capability.id} needs a real route intent.` });
      }
      if (!unavailable && CO_PRODUCE_RECORDS[capability.data.primary].deployment !== "canonical") {
        issues.push({ code: "available-planned-record", message: `${capability.id} cannot be available on a planned record.` });
      }
      if (capability.route.kind !== "unavailable") {
        const route = CO_PRODUCE_ROUTES[capability.route.routeId];
        const allowedPrincipal = route.audience === "workspace" ? "workspace" : "review-invite";
        if (!capability.permission.anyOf.some((clause) => clause.principal === allowedPrincipal)) {
          issues.push({ code: "route-permission-audience", message: `${capability.id} does not match its route audience.` });
        }
      }
    }
  }

  for (const [recordId, record] of Object.entries(CO_PRODUCE_RECORDS)) {
    if (record.parent && !(record.parent in CO_PRODUCE_RECORDS)) {
      issues.push({ code: "unknown-record-parent", message: `${recordId} has unknown parent ${record.parent}.` });
    }
    if (record.deployment === "planned" && record.status.kind !== "not-implemented") {
      issues.push({ code: "planned-record-status", message: `${recordId} must remain explicitly not implemented.` });
    }
  }

  return issues;
}

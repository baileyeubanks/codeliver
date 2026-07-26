/**
 * P28: project recap rollup.
 *
 * Pure, DOM-free logic that rolls the demo workspace's Project Operating
 * Record collections (deliverables, plan items, approval stages, activity,
 * proposals, payment milestones, share links) into a per-project recap.
 * Inputs are structural so the store's record types satisfy them directly.
 *
 * The budget summary is INTERNAL-ONLY: estimate cost and markup (internal
 * margin) must never be rendered on a client-facing surface.
 */

export interface RecapDeliverable {
  id: string;
  project_id: string;
  name: string;
  status: string;
  delivered_at: string | null;
  spec: { resolution: string; codec: string; aspect: string };
}

export interface RecapPlanItem {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  date: string | null;
  status: string;
  updated_at: string;
}

export interface RecapApprovalStage {
  id: string;
  project_id: string;
  asset_id: string;
  name: string;
  reviewer_names: string[];
  approved_reviewer_names: string[];
  status: string;
}

export interface RecapActivityItem {
  id: string;
  project_id: string;
  action: string;
  actor_name: string;
  details: Record<string, string>;
  created_at: string;
}

export interface RecapEstimateLine {
  category: string;
  description: string;
  quantity: number;
  unit_rate: number;
  markup_pct: number;
  optional: boolean;
}

export interface RecapProposal {
  id: string;
  project_id: string;
  version: number;
  status: string;
  title: string;
  estimate_lines: RecapEstimateLine[];
  approved_at: string | null;
}

export interface RecapPaymentMilestone {
  id: string;
  project_id: string;
  proposal_id: string;
  label: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
}

export interface RecapShareLink {
  id: string;
  message: string;
  permission: string;
  is_active: boolean;
  public_url: string;
  asset_ids: string[];
}

export interface BuildRecapInput {
  projectId: string;
  projectName: string;
  deliverables: RecapDeliverable[];
  planItems: RecapPlanItem[];
  approvalStages: RecapApprovalStage[];
  activity: RecapActivityItem[];
  proposals: RecapProposal[];
  paymentMilestones: RecapPaymentMilestone[];
  shareLinks: RecapShareLink[];
  /** Asset titles keyed by id, used to label approval stages. */
  assetTitles?: Record<string, string>;
  /** Ids of the project's assets — share links attach through these. */
  assetIds?: string[];
}

export interface RecapTimelineEntry {
  id: string;
  title: string;
  kind: string;
  plannedDate: string | null;
  /** updated_at (date portion) once the item is done; null while open. */
  actualDate: string | null;
  status: string;
  /** null while the item is still open. */
  onTime: boolean | null;
}

export interface RecapApprovalEntry {
  id: string;
  name: string;
  assetId: string;
  assetTitle: string | null;
  reviewerCount: number;
  approvedCount: number;
  approvedNames: string[];
  status: string;
}

export interface RecapBudgetMilestone {
  id: string;
  label: string;
  amountCents: number;
  status: string;
  paidAt: string | null;
}

export interface ProjectRecap {
  projectId: string;
  projectName: string;
  deliverables: {
    total: number;
    completed: number;
    items: {
      id: string;
      name: string;
      status: string;
      deliveredAt: string | null;
      specLabel: string;
    }[];
  };
  timeline: RecapTimelineEntry[];
  approvals: RecapApprovalEntry[];
  approvalEvents: {
    id: string;
    actor: string;
    at: string;
    detail: string;
  }[];
  budget: {
    /** Standing rule: this block is internal-only, never client-visible. */
    internal: true;
    proposalTitle: string | null;
    proposalVersion: number | null;
    approvedAt: string | null;
    /** Non-optional estimate cost (Σ quantity × unit rate), in cents. */
    costCents: number;
    /** Internal markup over cost, in cents. Never client-visible. */
    marginCents: number;
    /** Client-facing total (cost + margin), in cents. */
    totalCents: number;
    /** Optional (not yet approved) estimate lines, in cents. */
    optionalCents: number;
    paidCents: number;
    outstandingCents: number;
    milestones: RecapBudgetMilestone[];
  };
  finalLinks: {
    id: string;
    url: string;
    message: string;
    permission: string;
  }[];
}

const TIMELINE_KINDS = new Set(["milestone", "task"]);
const APPROVAL_ACTIONS = new Set(["approved_asset", "requested_changes", "approval_granted"]);

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function datePart(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** Current proposal for the recap: approved first (highest version wins),
 * then the highest-version non-superseded proposal, else null. */
export function currentRecapProposal(proposals: RecapProposal[]): RecapProposal | null {
  const live = proposals.filter((proposal) => proposal.status !== "superseded");
  const approved = live.filter((proposal) => proposal.status === "approved");
  const pool = approved.length > 0 ? approved : live;
  return pool.sort((a, b) => b.version - a.version)[0] ?? null;
}

export function buildProjectRecap(input: BuildRecapInput): ProjectRecap {
  const deliverables = input.deliverables.filter((item) => item.project_id === input.projectId);
  const planItems = input.planItems.filter((item) => item.project_id === input.projectId);
  const stages = input.approvalStages.filter((stage) => stage.project_id === input.projectId);
  const proposals = input.proposals.filter((proposal) => proposal.project_id === input.projectId);
  const milestones = input.paymentMilestones.filter(
    (milestone) => milestone.project_id === input.projectId,
  );

  const completed = deliverables.filter((item) => item.status === "delivered").length;

  const timeline: RecapTimelineEntry[] = planItems
    .filter((item) => TIMELINE_KINDS.has(item.kind))
    .map((item) => {
      const done = item.status === "done";
      const plannedDate = item.date;
      const actualDate = done ? datePart(item.updated_at) : null;
      return {
        id: item.id,
        title: item.title,
        kind: item.kind,
        plannedDate,
        actualDate,
        status: item.status,
        onTime: done && plannedDate && actualDate ? actualDate <= plannedDate : null,
      };
    })
    .sort((a, b) => (a.plannedDate ?? "9999").localeCompare(b.plannedDate ?? "9999"));

  const approvals: RecapApprovalEntry[] = stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    assetId: stage.asset_id,
    assetTitle: input.assetTitles?.[stage.asset_id] ?? null,
    reviewerCount: stage.reviewer_names.length,
    approvedCount: stage.approved_reviewer_names.length,
    approvedNames: [...stage.approved_reviewer_names],
    status: stage.status,
  }));

  const approvalEvents = input.activity
    .filter((event) => event.project_id === input.projectId && APPROVAL_ACTIONS.has(event.action))
    .map((event) => ({
      id: event.id,
      actor: event.actor_name,
      at: event.created_at,
      detail: event.details.asset_title ?? "",
    }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const proposal = currentRecapProposal(proposals);
  const proposalMilestones = proposal
    ? milestones.filter((milestone) => milestone.proposal_id === proposal.id)
    : milestones;
  const requiredLines = proposal?.estimate_lines.filter((line) => !line.optional) ?? [];
  const optionalLines = proposal?.estimate_lines.filter((line) => line.optional) ?? [];
  const costCents = requiredLines.reduce(
    (total, line) => total + toCents(line.quantity * line.unit_rate),
    0,
  );
  const marginCents = requiredLines.reduce(
    (total, line) => total + toCents(line.quantity * line.unit_rate * (line.markup_pct / 100)),
    0,
  );
  const optionalCents = optionalLines.reduce(
    (total, line) => total + toCents(line.quantity * line.unit_rate),
    0,
  );
  const paidCents = proposalMilestones
    .filter((milestone) => milestone.status === "paid")
    .reduce((total, milestone) => total + milestone.amount_cents, 0);
  const outstandingCents = proposalMilestones
    .filter((milestone) => milestone.status === "pending" || milestone.status === "checkout_created")
    .reduce((total, milestone) => total + milestone.amount_cents, 0);

  const projectAssetIds = new Set(input.assetIds ?? []);
  const finalLinks = input.shareLinks
    .filter((link) => link.is_active)
    .filter((link) => link.asset_ids.some((assetId) => projectAssetIds.has(assetId)))
    .map((link) => ({
      id: link.id,
      url: link.public_url,
      message: link.message,
      permission: link.permission,
    }));

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    deliverables: {
      total: deliverables.length,
      completed,
      items: deliverables.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        deliveredAt: item.delivered_at,
        specLabel: `${item.spec.aspect} · ${item.spec.resolution} · ${item.spec.codec}`,
      })),
    },
    timeline,
    approvals,
    approvalEvents,
    budget: {
      internal: true,
      proposalTitle: proposal?.title ?? null,
      proposalVersion: proposal?.version ?? null,
      approvedAt: proposal?.approved_at ?? null,
      costCents,
      marginCents,
      totalCents: costCents + marginCents,
      optionalCents,
      paidCents,
      outstandingCents,
      milestones: proposalMilestones.map((milestone) => ({
        id: milestone.id,
        label: milestone.label,
        amountCents: milestone.amount_cents,
        status: milestone.status,
        paidAt: milestone.paid_at,
      })),
    },
    finalLinks,
  };
}

/** USD formatting for the internal budget summary. */
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

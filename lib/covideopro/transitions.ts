/**
 * Co-VideoPro — Project Operating Record: transition validators.
 *
 * The ONLY way lifecycle state changes. Pure functions, framework-free, shared
 * by the demo runtime, the API routes, and the test suite. Every validator
 * returns a structured result; callers write an activity event on success.
 *
 * Governing doc: docs/COVIDEOPRO_PRODUCT_MODEL.md §3
 */

import {
  PROJECT_STAGES,
  projectStageIndex,
  type Brief,
  type BriefStatus,
  type CallSheet,
  type Deliverable,
  type DeliverableStatus,
  type Inquiry,
  type InquiryStatus,
  type Location,
  type LocationAgreementStatus,
  type PaymentMethod,
  type PaymentMilestone,
  type PaymentMilestoneStatus,
  type PlanItem,
  type ProductionDay,
  type ProductionDayStatus,
  type ProjectRecordHeader,
  type ProjectStage,
  type Release,
  type ReleaseStatus,
  type Decision,
  type DecisionImplementationStatus,
  type Proposal,
  type ProposalStatus,
  type RevisionRequest,
  type RevisionRequestStatus,
  type Select,
  type Sequence,
  type SequenceClip,
  type SequenceStatus,
} from "./record.ts";

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

const OK: TransitionResult = { ok: true };

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function assertEdge<Status extends string>(
  table: Record<Status, readonly Status[]>,
  from: Status,
  to: Status,
): TransitionResult {
  if (from === to) return fail(`Already ${from}.`);
  return table[from]?.includes(to)
    ? OK
    : fail(`Invalid transition ${from} → ${to}.`);
}

/* -------------------------------------------------------------------------- */
/* Inquiry                                                                    */
/* -------------------------------------------------------------------------- */

const INQUIRY_EDGES: Record<InquiryStatus, readonly InquiryStatus[]> = {
  new: ["triaged", "declined"],
  triaged: ["qualified", "declined"],
  qualified: ["converted", "declined"],
  converted: [],
  declined: [],
};

export interface InquiryTransitionContext {
  hasOrganization: boolean;
  hasContact: boolean;
}

export function transitionInquiry(
  inquiry: Pick<Inquiry, "status" | "organization_id" | "contact_id" | "project_id">,
  to: InquiryStatus,
): TransitionResult {
  const edge = assertEdge(INQUIRY_EDGES, inquiry.status, to);
  if (!edge.ok) return edge;
  if (to === "qualified" && (!inquiry.organization_id || !inquiry.contact_id)) {
    return fail("Qualifying an inquiry requires a linked client organization and contact.");
  }
  if (to === "converted" && !inquiry.project_id) {
    return fail("Converting an inquiry requires a linked project.");
  }
  return OK;
}

/* -------------------------------------------------------------------------- */
/* Brief                                                                      */
/* -------------------------------------------------------------------------- */

const BRIEF_EDGES: Record<BriefStatus, readonly BriefStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "draft"],
  approved: ["superseded"],
  superseded: [],
};

export function transitionBrief(
  brief: Pick<Brief, "status" | "objectives" | "audience" | "message">,
  to: BriefStatus,
): TransitionResult {
  const edge = assertEdge(BRIEF_EDGES, brief.status, to);
  if (!edge.ok) return edge;
  if (to === "in_review" && !brief.objectives.trim()) {
    return fail("A brief needs objectives before it can enter review.");
  }
  if (to === "approved" && (!brief.audience.trim() || !brief.message.trim())) {
    return fail("Approving a brief requires a defined audience and message.");
  }
  return OK;
}

/**
 * Editing an approved brief starts a new draft version; the prior version is
 * superseded. Returns the version assignments for caller persistence.
 */
export function nextBriefVersion(current: Pick<Brief, "version" | "status">):
  | { ok: true; version: number; supersedePrevious: boolean }
  | { ok: false; reason: string } {
  if (current.status === "superseded") {
    return fail("A superseded brief cannot be revised; edit the current version.");
  }
  return { ok: true, version: current.version + 1, supersedePrevious: current.status === "approved" };
}

/* -------------------------------------------------------------------------- */
/* Proposal                                                                   */
/* -------------------------------------------------------------------------- */

const PROPOSAL_EDGES: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["in_review"],
  in_review: ["sent", "draft"],
  sent: ["approved", "declined"],
  approved: ["superseded"],
  declined: [],
  superseded: [],
};

export interface ProposalTransitionContext {
  actorEmail: string | null;
}

export function transitionProposal(
  proposal: Pick<Proposal, "status" | "estimate_lines">,
  to: ProposalStatus,
  context: ProposalTransitionContext = { actorEmail: null },
): TransitionResult {
  const edge = assertEdge(PROPOSAL_EDGES, proposal.status, to);
  if (!edge.ok) return edge;
  if (to === "sent") {
    const requiredLines = proposal.estimate_lines.filter((line) => !line.optional);
    if (requiredLines.length === 0) {
      return fail("Sending a proposal requires at least one non-optional estimate line.");
    }
    if (requiredLines.some((line) => line.quantity <= 0 || line.unit_rate < 0)) {
      return fail("Estimate lines must have positive quantity and non-negative rates.");
    }
  }
  if (to === "approved" && !context.actorEmail) {
    return fail("Approving a proposal requires an identified approver.");
  }
  return OK;
}

/** Change orders on an approved proposal create a new draft version. */
export function nextProposalVersion(current: Pick<Proposal, "version" | "status">):
  | { ok: true; version: number; supersedePrevious: boolean }
  | { ok: false; reason: string } {
  if (current.status === "superseded" || current.status === "declined") {
    return fail(`A ${current.status} proposal cannot be revised; create a new proposal.`);
  }
  return { ok: true, version: current.version + 1, supersedePrevious: current.status === "approved" };
}

/* -------------------------------------------------------------------------- */
/* Sequence                                                                   */
/* -------------------------------------------------------------------------- */

const SEQUENCE_EDGES: Record<SequenceStatus, readonly SequenceStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "draft"],
  approved: ["locked"],
  locked: [],
};

export interface SequenceTransitionContext {
  clips: Pick<SequenceClip, "sequence_id">[];
  hasReviewVersion: boolean;
}

export function transitionSequence(
  sequence: Pick<Sequence, "id" | "status">,
  to: SequenceStatus,
  context: SequenceTransitionContext,
): TransitionResult {
  const edge = assertEdge(SEQUENCE_EDGES, sequence.status, to);
  if (!edge.ok) return edge;
  if (to === "in_review") {
    const clipCount = context.clips.filter((clip) => clip.sequence_id === sequence.id).length;
    if (clipCount === 0) return fail("A sequence needs at least one clip before review.");
    if (!context.hasReviewVersion) {
      return fail("Sending a sequence to review requires a linked review version.");
    }
  }
  return OK;
}

/** Validate a clip placement against its sequence and source. */
export function validateSequenceClip(
  clip: Pick<SequenceClip, "timeline_in_seconds" | "timeline_out_seconds" | "source_in_seconds" | "source_out_seconds">,
): TransitionResult {
  if (clip.source_out_seconds <= clip.source_in_seconds) {
    return fail("Clip source out-point must be after its in-point.");
  }
  if (clip.timeline_out_seconds <= clip.timeline_in_seconds) {
    return fail("Clip timeline out-point must be after its in-point.");
  }
  const sourceDuration = clip.source_out_seconds - clip.source_in_seconds;
  const timelineDuration = clip.timeline_out_seconds - clip.timeline_in_seconds;
  if (Math.abs(sourceDuration - timelineDuration) > 0.001) {
    return fail("Speed changes are not supported: source and timeline durations must match.");
  }
  return OK;
}

/** Assemble clips from selects (transcript-driven radio cut). */
export function clipsFromSelects(
  sequenceId: string,
  selects: Pick<Select, "id" | "asset_id" | "version_id" | "in_seconds" | "out_seconds">[],
  makeId: () => string,
): SequenceClip[] {
  let cursor = 0;
  return selects.map((select, index) => {
    const duration = select.out_seconds - select.in_seconds;
    const clip: SequenceClip = {
      id: makeId(),
      sequence_id: sequenceId,
      asset_id: select.asset_id,
      version_id: select.version_id,
      select_id: select.id,
      track_index: index === 0 ? 0 : 0,
      timeline_in_seconds: cursor,
      timeline_out_seconds: cursor + duration,
      source_in_seconds: select.in_seconds,
      source_out_seconds: select.out_seconds,
    };
    cursor += duration;
    return clip;
  });
}

/* -------------------------------------------------------------------------- */
/* Revision requests (consolidated feedback)                                  */
/* -------------------------------------------------------------------------- */

const REVISION_REQUEST_EDGES: Record<RevisionRequestStatus, readonly RevisionRequestStatus[]> = {
  open: ["in_progress"],
  in_progress: ["addressed", "open"],
  addressed: ["verified", "in_progress"],
  verified: [],
};

export interface RevisionTransitionContext {
  unresolvedCommentCount: number;
  waivedUnresolved: boolean;
}

export function transitionRevisionRequest(
  request: Pick<RevisionRequest, "status">,
  to: RevisionRequestStatus,
  context: RevisionTransitionContext = { unresolvedCommentCount: 0, waivedUnresolved: false },
): TransitionResult {
  const edge = assertEdge(REVISION_REQUEST_EDGES, request.status, to);
  if (!edge.ok) return edge;
  if (to === "verified" && context.unresolvedCommentCount > 0 && !context.waivedUnresolved) {
    return fail(
      `Verifying a revision requires resolving or waiving ${context.unresolvedCommentCount} open comment(s).`,
    );
  }
  return OK;
}

/** A new consolidation round = max(round) + 1 for the asset. */
export function nextRevisionRound(existing: Pick<RevisionRequest, "asset_id" | "round">[], assetId: string): number {
  const rounds = existing.filter((request) => request.asset_id === assetId).map((request) => request.round);
  return rounds.length === 0 ? 1 : Math.max(...rounds) + 1;
}

/* -------------------------------------------------------------------------- */
/* Deliverables                                                               */
/* -------------------------------------------------------------------------- */

const DELIVERABLE_EDGES: Record<DeliverableStatus, readonly DeliverableStatus[]> = {
  specced: ["encoding"],
  encoding: ["qc", "specced"],
  qc: ["ready", "encoding"],
  ready: ["delivered", "expired"],
  delivered: [],
  expired: [],
};

export function transitionDeliverable(
  deliverable: Pick<Deliverable, "status" | "source_version_id">,
  to: DeliverableStatus,
): TransitionResult {
  const edge = assertEdge(DELIVERABLE_EDGES, deliverable.status, to);
  if (!edge.ok) return edge;
  if (to === "qc" && !deliverable.source_version_id) {
    return fail("QC requires a frozen source version.");
  }
  return OK;
}

/* -------------------------------------------------------------------------- */
/* Project stage (the spine)                                                  */
/* -------------------------------------------------------------------------- */

export interface ProjectStageContext {
  hasOrganization: boolean;
  hasContact: boolean;
  hasBrief: boolean;
  hasApprovedProposal: boolean;
  hasProductionDay: boolean;
  hasSequence: boolean;
  hasActiveReview: boolean;
  hasFinalApproval: boolean;
  hasSpeccedDeliverable: boolean;
  allDeliverablesClosed: boolean;
  planItems: Pick<PlanItem, "kind" | "status">[];
}

/** Stage advances one step at a time; skipping is rejected. */
export function transitionProjectStage(
  project: Pick<ProjectRecordHeader, "stage">,
  to: ProjectStage,
  context: ProjectStageContext,
): TransitionResult {
  const from = projectStageIndex(project.stage);
  const target = projectStageIndex(to);
  if (target === from) return fail(`Project is already in ${to}.`);
  if (target < from) {
    return fail("Stage never regresses silently — record a revision request or decision instead.");
  }
  if (target !== from + 1) {
    return fail(`Stage advances one step at a time (${PROJECT_STAGES[from]} → ${PROJECT_STAGES[from + 1]}).`);
  }

  switch (to) {
    case "intake":
      if (!context.hasOrganization || !context.hasContact) {
        return fail("Intake requires a linked client organization and primary contact.");
      }
      return OK;
    case "development":
      if (!context.hasBrief) return fail("Development requires a creative brief v1.");
      return OK;
    case "preproduction":
      if (!context.hasApprovedProposal) return fail("Pre-production requires an approved proposal.");
      return OK;
    case "production":
      if (!context.hasProductionDay) return fail("Production requires a scheduled production day.");
      return OK;
    case "post":
      if (!context.hasSequence) return fail("Post requires at least one sequence.");
      return OK;
    case "review":
      if (!context.hasActiveReview) return fail("Review requires an active review link or round.");
      return OK;
    case "delivery":
      if (!context.hasFinalApproval || !context.hasSpeccedDeliverable) {
        return fail("Delivery requires final approval and at least one specced deliverable.");
      }
      return OK;
    case "archived":
      if (!context.allDeliverablesClosed) {
        return fail("Archiving requires all deliverables delivered or cancelled.");
      }
      return OK;
    default:
      return OK;
  }
}

/* -------------------------------------------------------------------------- */
/* Payment milestones                                                         */
/* -------------------------------------------------------------------------- */

const PAYMENT_MILESTONE_EDGES: Record<PaymentMilestoneStatus, readonly PaymentMilestoneStatus[]> = {
  pending: ["checkout_created", "paid", "void"],
  checkout_created: ["paid", "void"],
  paid: [],
  void: [],
};

export interface PaymentTransitionContext {
  method: PaymentMethod | null;
}

export function transitionPaymentMilestone(
  milestone: Pick<PaymentMilestone, "status">,
  to: PaymentMilestoneStatus,
  context: PaymentTransitionContext = { method: null },
): TransitionResult {
  const edge = assertEdge(PAYMENT_MILESTONE_EDGES, milestone.status, to);
  if (!edge.ok) return edge;
  if (to === "checkout_created" && context.method !== "checkout") {
    return fail("Creating a checkout requires the checkout method.");
  }
  if (to === "paid" && milestone.status === "pending" && context.method !== "manual") {
    return fail("A pending milestone can only be marked paid as a manual (offline) payment.");
  }
  return OK;
}

/* -------------------------------------------------------------------------- */
/* Production entities (El Paso doctrine)                                     */
/* -------------------------------------------------------------------------- */

const PRODUCTION_DAY_EDGES: Record<ProductionDayStatus, readonly ProductionDayStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["wrapped"],
  wrapped: [],
  cancelled: ["scheduled"],
};

export function transitionProductionDay(
  day: Pick<ProductionDay, "status">,
  to: ProductionDayStatus,
): TransitionResult {
  return assertEdge(PRODUCTION_DAY_EDGES, day.status, to);
}

const RELEASE_EDGES: Record<ReleaseStatus, readonly ReleaseStatus[]> = {
  unsent: ["sent"],
  sent: ["signed", "unsent"],
  signed: [],
};

export function transitionRelease(
  release: Pick<Release, "status" | "person_name">,
  to: ReleaseStatus,
): TransitionResult {
  const edge = assertEdge(RELEASE_EDGES, release.status, to);
  if (!edge.ok) return edge;
  return OK;
}

const LOCATION_AGREEMENT_EDGES: Record<LocationAgreementStatus, readonly LocationAgreementStatus[]> = {
  none: ["drafted"],
  drafted: ["sent"],
  sent: ["signed", "drafted"],
  signed: [],
};

export function transitionLocationAgreement(
  location: Pick<Location, "agreement_status">,
  to: LocationAgreementStatus,
): TransitionResult {
  return assertEdge(LOCATION_AGREEMENT_EDGES, location.agreement_status, to);
}

/* --------------------------- The chase list --------------------------------- */

export interface ChaseListEntry {
  releaseId: string;
  personName: string;
  status: ReleaseStatus;
  productionDayId: string;
  productionDate: string;
  daysUntilShoot: number;
}

/**
 * The query that justifies the build: who films within `withinDays` of
 * `fromDate` and has NOT signed? Sorted nearest shoot first.
 */
export function chaseList(
  releases: Pick<Release, "id" | "person_name" | "status" | "production_day_ids">[],
  productionDays: Pick<ProductionDay, "id" | "date" | "status">[],
  fromDate: string,
  withinDays = 2,
): ChaseListEntry[] {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const dayMs = 86_400_000;
  const dayById = new Map(productionDays.map((day) => [day.id, day]));

  const entries: ChaseListEntry[] = [];
  for (const release of releases) {
    if (release.status === "signed") continue;
    for (const dayId of release.production_day_ids) {
      const day = dayById.get(dayId);
      if (!day || day.status === "cancelled") continue;
      const shootAt = new Date(`${day.date}T00:00:00Z`).getTime();
      const daysUntil = Math.round((shootAt - from) / dayMs);
      if (daysUntil < 0 || daysUntil > withinDays) continue;
      entries.push({
        releaseId: release.id,
        personName: release.person_name,
        status: release.status,
        productionDayId: day.id,
        productionDate: day.date,
        daysUntilShoot: daysUntil,
      });
    }
  }
  return entries.sort((a, b) => a.daysUntilShoot - b.daysUntilShoot || a.personName.localeCompare(b.personName));
}

/** Call-sheet versioning: each generation bumps the version for that day. */
export function nextCallSheetVersion(existing: Pick<CallSheet, "production_day_id" | "version">[], productionDayId: string): number {
  const versions = existing.filter((sheet) => sheet.production_day_id === productionDayId).map((sheet) => sheet.version);
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

/* -------------------------------------------------------------------------- */
/* Decision ledger                                                            */
/* -------------------------------------------------------------------------- */

const DECISION_IMPLEMENTATION_EDGES: Record<DecisionImplementationStatus, readonly DecisionImplementationStatus[]> = {
  pending: ["in_progress", "done", "wont_do"],
  in_progress: ["done", "wont_do", "pending"],
  done: [],
  wont_do: ["pending"],
};

export function transitionDecisionImplementation(
  decision: Pick<Decision, "implementation_status">,
  to: DecisionImplementationStatus,
): TransitionResult {
  return assertEdge(DECISION_IMPLEMENTATION_EDGES, decision.implementation_status, to);
}

/** Map a Finish Review outcome to the decision's initial implementation state. */
export function implementationForFinishOutcome(
  outcome: "approved" | "changes_requested" | "notes_only",
): DecisionImplementationStatus {
  return outcome === "changes_requested" ? "pending" : "done";
}

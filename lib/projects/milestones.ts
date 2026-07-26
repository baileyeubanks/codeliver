/**
 * Milestone derivation for the project workspace (P24).
 *
 * The founder's milestone spine — kickoff, pre-production, shoot dates, edit
 * rounds, approval, delivery — derived truthfully from the Project Operating
 * Record: lifecycle stage sets the coarse position, record detail (briefs,
 * proposals, plan items, revision rounds, approvals, deliverables) supplies
 * dates and plain-language detail. Nothing is stored; nothing is invented.
 */

import { projectStageIndex, type ProjectStage } from "../covideopro/record.ts";

export type WorkspaceMilestoneState = "done" | "current" | "upcoming" | "at_risk";

export type WorkspaceMilestoneId =
  | "kickoff"
  | "preproduction"
  | "production"
  | "edit"
  | "approval"
  | "delivery";

export interface WorkspaceMilestone {
  id: WorkspaceMilestoneId;
  label: string;
  state: WorkspaceMilestoneState;
  /** ISO date/datetime straight from the seeds; null when nothing is on record. */
  date: string | null;
  detail: string;
}

export interface MilestoneInput {
  stage: ProjectStage;
  briefs: readonly { version: number; status: string; created_at: string }[];
  proposals: readonly { status: string; approved_at: string | null }[];
  planItems: readonly {
    id: string;
    kind: string;
    title: string;
    date: string | null;
    status: string;
  }[];
  productionDays: readonly { id: string; date: string; type: string; status?: string }[];
  revisionRequests: readonly { round: number; status: string; updated_at: string }[];
  approvalStages: readonly { status: string }[];
  deliverables: readonly { status: string; delivered_at: string | null }[];
  /** Today as a `YYYY-MM-DD` key — injected so derivation stays pure. */
  today: string;
}

function earliest(values: (string | null)[]): string | null {
  const present = values.filter((value): value is string => Boolean(value)).sort();
  return present[0] ?? null;
}

function latest(values: (string | null)[]): string | null {
  const present = values.filter((value): value is string => Boolean(value)).sort();
  return present[present.length - 1] ?? null;
}

export function deriveProjectMilestones(input: MilestoneInput): WorkspaceMilestone[] {
  const stageIndex = projectStageIndex(input.stage);
  const briefs = [...input.briefs].sort((a, b) => a.version - b.version);
  const firstBrief = briefs[0] ?? null;
  const approvedProposal = input.proposals.find((proposal) => proposal.status === "approved") ?? null;
  const openRounds = input.revisionRequests.filter(
    (request) => request.status === "open" || request.status === "in_progress",
  );
  const latestRound = [...input.revisionRequests].sort((a, b) => b.round - a.round)[0] ?? null;
  const approvedCount = input.approvalStages.filter((stage) => stage.status === "approved").length;

  /* Kickoff — the project exists and a brief opened it. */
  const kickoffState: WorkspaceMilestoneState =
    stageIndex > projectStageIndex("development")
      ? "done"
      : stageIndex === projectStageIndex("development")
        ? "current"
        : "upcoming";
  const kickoff: WorkspaceMilestone = {
    id: "kickoff",
    label: "Kickoff",
    state: kickoffState,
    date: firstBrief?.created_at ?? null,
    detail: firstBrief
      ? `Brief v${firstBrief.version} opened the project.`
      : "Brief not started yet.",
  };

  /* Pre-production — proposal approved, plan forming. */
  const preproductionDone =
    stageIndex > projectStageIndex("preproduction") ||
    (approvedProposal !== null && stageIndex >= projectStageIndex("preproduction"));
  const preproduction: WorkspaceMilestone = {
    id: "preproduction",
    label: "Pre-production",
    state: preproductionDone
      ? "done"
      : stageIndex === projectStageIndex("preproduction")
        ? "current"
        : "upcoming",
    date: approvedProposal?.approved_at ?? null,
    detail: approvedProposal
      ? "Proposal approved — scope and plan are set."
      : "Waiting on proposal approval.",
  };

  /* Production — shoot days, from plan items and production-day records. */
  const productionItems = input.planItems.filter((item) => item.kind === "production_day");
  const blockedShoot = productionItems.find((item) => item.status === "blocked") ?? null;
  const overdueShoot = productionItems.find(
    (item) => item.date !== null && item.date < input.today && item.status === "pending",
  ) ?? null;
  const shootDate = earliest([
    ...productionItems.map((item) => item.date),
    ...input.productionDays.map((day) => day.date),
  ]);
  const productionBase: WorkspaceMilestoneState =
    stageIndex > projectStageIndex("production")
      ? "done"
      : stageIndex === projectStageIndex("production")
        ? "current"
        : "upcoming";
  const production: WorkspaceMilestone = {
    id: "production",
    label: "Shoot dates",
    state: blockedShoot || overdueShoot ? "at_risk" : productionBase,
    date: shootDate,
    detail: blockedShoot
      ? `Blocked: ${blockedShoot.title}.`
      : overdueShoot
        ? `Overdue: ${overdueShoot.title}.`
        : shootDate
          ? "Shoot days are on the calendar."
          : stageIndex > projectStageIndex("production")
            ? "Production wrapped."
            : "No shoot days scheduled yet.",
  };

  /* Edit rounds — open revision rounds keep the edit current even in review. */
  const editState: WorkspaceMilestoneState =
    openRounds.length > 0
      ? "current"
      : stageIndex > projectStageIndex("review")
        ? "done"
        : stageIndex === projectStageIndex("post") || stageIndex === projectStageIndex("review")
          ? latestRound
            ? "done"
            : "current"
          : "upcoming";
  const edit: WorkspaceMilestone = {
    id: "edit",
    label: "Edit rounds",
    state: editState,
    date: latestRound?.updated_at ?? null,
    detail: openRounds.length > 0
      ? `Round ${Math.max(...openRounds.map((request) => request.round))} in progress.`
      : latestRound
        ? `Round ${latestRound.round} ${latestRound.status}.`
        : "No edit rounds on record yet.",
  };

  /* Approval — client approvals on the review record. */
  const approvalState: WorkspaceMilestoneState =
    stageIndex > projectStageIndex("review")
      ? "done"
      : stageIndex === projectStageIndex("review")
        ? "current"
        : "upcoming";
  const approval: WorkspaceMilestone = {
    id: "approval",
    label: "Approval",
    state: approvalState,
    date: null,
    detail: input.approvalStages.length > 0
      ? `${approvedCount} of ${input.approvalStages.length} approvals complete.`
      : "No approval steps on record yet.",
  };

  /* Delivery — export packages on the delivery record. */
  const anyExpired = input.deliverables.some((deliverable) => deliverable.status === "expired");
  const allDelivered =
    input.deliverables.length > 0 &&
    input.deliverables.every((deliverable) => deliverable.status === "delivered");
  const someDelivered = input.deliverables.some((deliverable) => deliverable.status === "delivered");
  const deliveredCount = input.deliverables.filter(
    (deliverable) => deliverable.status === "delivered",
  ).length;
  const deliveryState: WorkspaceMilestoneState = anyExpired
    ? "at_risk"
    : allDelivered || input.stage === "archived"
      ? "done"
      : someDelivered ||
          input.deliverables.length > 0 && stageIndex >= projectStageIndex("review") ||
          input.stage === "delivery"
        ? "current"
        : "upcoming";
  const delivery: WorkspaceMilestone = {
    id: "delivery",
    label: "Delivery",
    state: deliveryState,
    date: latest(input.deliverables.map((deliverable) => deliverable.delivered_at)),
    detail: input.deliverables.length > 0
      ? `${deliveredCount} of ${input.deliverables.length} export packages delivered.`
      : "No export packages specced yet.",
  };

  return [kickoff, preproduction, production, edit, approval, delivery];
}

/**
 * Co-VideoPro — Production Pipeline strip (S2).
 *
 * The master narrative's stage rhythm: Pre-Production → Production →
 * Post-Production → Delivery & Assets. State comes from the project's own
 * stage (the record's coarse truth); progress comes from record detail
 * (briefs, proposals, days, shots, releases, sequences, assets,
 * deliverables). Every stage names an owner, a next action, and a doorway
 * into the cockpit section where the work happens. Deterministic — no
 * stored rollups.
 */

import type {
  Brief,
  Deliverable,
  ProductionDay,
  ProjectStage,
  Proposal,
  Release,
  Sequence,
  Shot,
} from "./record.ts";

export type PipelineStageId = "preproduction" | "production" | "postproduction" | "delivery";
export type PipelineStageState = "complete" | "active" | "upcoming";
export type PipelineSurface = "creative" | "plan" | "sequences" | "delivery";

export interface PipelineStageSignal {
  id: PipelineStageId;
  label: string;
  state: PipelineStageState;
  progress: number;
  owner: string;
  nextAction: string;
  surface: PipelineSurface;
}

export interface PipelineInput {
  stage: ProjectStage;
  briefs: readonly Brief[];
  proposals: readonly Proposal[];
  productionDays: readonly ProductionDay[];
  releases: readonly Release[];
  shots: readonly Shot[];
  sequences: readonly Sequence[];
  deliverables: readonly Deliverable[];
  assets: readonly { status: string }[];
}

const STAGE_ORDER: Record<PipelineStageId, number> = {
  preproduction: 0,
  production: 1,
  postproduction: 2,
  delivery: 3,
};

/** Map the nine project stages onto the four pipeline phases. */
export function projectPhaseIndex(stage: ProjectStage): number {
  switch (stage) {
    case "inquiry":
    case "intake":
    case "development":
    case "preproduction":
      return 0;
    case "production":
      return 1;
    case "post":
    case "review":
      return 2;
    case "delivery":
    case "archived":
      return 3;
  }
}

function stageState(phase: number, id: PipelineStageId, archived: boolean): PipelineStageState {
  if (archived) return "complete";
  if (phase > STAGE_ORDER[id]) return "complete";
  if (phase < STAGE_ORDER[id]) return "upcoming";
  return "active";
}

export function projectPipeline(input: PipelineInput): PipelineStageSignal[] {
  const archived = input.stage === "archived";
  const phase = projectPhaseIndex(input.stage);
  const principalDays = input.productionDays.filter((day) => day.type === "principal" && day.status !== "cancelled");

  /* ------------------------------ Pre-Production --------------------------- */
  const briefApproved = input.briefs.some((brief) => brief.status === "approved");
  const proposalApproved = input.proposals.some((proposal) => proposal.status === "approved");
  const daysScheduled = principalDays.length > 0;
  const allDaysListed = daysScheduled && principalDays.every((day) =>
    input.shots.some((shot) => shot.production_day_id === day.id && shot.status !== "dropped"),
  );
  const allReleasesSigned = daysScheduled && input.releases.length > 0 && input.releases.every((release) => release.status === "signed");
  const preProgress = (briefApproved ? 30 : 0) + (proposalApproved ? 25 : 0) + (daysScheduled ? 10 : 0) + (allDaysListed ? 20 : 0) + (allReleasesSigned ? 15 : 0);
  const preNext = !briefApproved
    ? "Lock the brief"
    : !proposalApproved
      ? "Win proposal approval"
      : !daysScheduled
        ? "Schedule a production day"
        : !allDaysListed
          ? "List every shoot day"
          : !allReleasesSigned
            ? "Chase unsigned releases"
            : "Pre-production locked";

  /* ------------------------------- Production ------------------------------ */
  const wrappedDays = principalDays.filter((day) => day.status === "wrapped").length;
  const productionProgress = daysScheduled ? Math.round((wrappedDays / principalDays.length) * 100) : 0;
  const nextDay = principalDays.find((day) => day.status === "in_progress") ?? principalDays.find((day) => day.status === "scheduled");
  const productionNext = !daysScheduled
    ? "Schedule production"
    : nextDay
      ? `${nextDay.status === "in_progress" ? "Wrap" : "Shoot"} ${nextDay.date}`
      : "All days wrapped";

  /* ----------------------------- Post-Production --------------------------- */
  const reviewedAssets = input.assets.filter((asset) => asset.status !== "draft").length;
  const assetShare = input.assets.length > 0 ? reviewedAssets / input.assets.length : 0;
  const postProgress = Math.min(100, Math.round(assetShare * 70) + (input.sequences.length > 0 ? 30 : 0));
  const postNext = input.sequences.length === 0
    ? "Open the edit bay"
    : reviewedAssets === 0
      ? "Move the cut to review"
      : "Prepare deliverables";

  /* -------------------------------- Delivery ------------------------------- */
  const deliveredCount = input.deliverables.filter((deliverable) => deliverable.status === "delivered").length;
  const deliveryProgress = input.deliverables.length > 0 ? Math.round((deliveredCount / input.deliverables.length) * 100) : 0;
  const qcItem = input.deliverables.find((deliverable) => deliverable.status === "qc");
  const readyItem = input.deliverables.find((deliverable) => deliverable.status === "ready");
  const deliveryNext = qcItem
    ? `Finish QC on ${qcItem.name}`
    : readyItem
      ? `Deliver ${readyItem.name}`
      : input.deliverables.length === 0
        ? "Spec the first deliverable"
        : "All deliverables shipped";

  return [
    {
      id: "preproduction",
      label: "Pre-Production",
      state: stageState(phase, "preproduction", archived),
      progress: archived || phase > 0 ? 100 : preProgress,
      owner: "Producer",
      nextAction: phase >= 0 && !archived ? preNext : "Pre-production locked",
      surface: briefApproved && proposalApproved ? "plan" : "creative",
    },
    {
      id: "production",
      label: "Production",
      state: stageState(phase, "production", archived),
      progress: archived || phase > 1 ? 100 : productionProgress,
      owner: "Production Lead",
      nextAction: productionNext,
      surface: "plan",
    },
    {
      id: "postproduction",
      label: "Post-Production",
      state: stageState(phase, "postproduction", archived),
      progress: archived || phase > 2 ? 100 : postProgress,
      owner: "Editor",
      nextAction: postNext,
      surface: "sequences",
    },
    {
      id: "delivery",
      label: "Delivery & Assets",
      state: stageState(phase, "delivery", archived),
      progress: archived ? 100 : deliveryProgress,
      owner: "Asset Manager",
      nextAction: deliveryNext,
      surface: "delivery",
    },
  ];
}

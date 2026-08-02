/**
 * Co-VideoPro — exception engine (N2).
 *
 * Exception-first operating model: an exception is a promise-vs-prediction
 * divergence, pre-declared, risk-ranked, carrying an owner and a repair verb.
 * Exceptions clear by STATE CHANGE only — never by dismissal. Quiet board =
 * good day. Deterministic derivation over the Project Operating Record.
 */

import type {
  Deliverable,
  PlanItem,
  ProductionDay,
  Proposal,
  Release,
  RevisionRequest,
  Shot,
} from "./record.ts";
import { shotReadinessForDay } from "./shots.ts";

export type ExceptionKind =
  | "release_unsigned"
  | "shots_unplanned"
  | "proposal_stale"
  | "revision_stale"
  | "qc_stale"
  | "plan_overdue";

export interface RecordException {
  id: string;
  kind: ExceptionKind;
  severity: "critical" | "attention";
  title: string;
  detail: string;
  owner: string;
  repair: { label: string; href: string };
  clearCondition: string;
  rankScore: number;
}

interface ExceptionInput {
  releases: Release[];
  productionDays: ProductionDay[];
  shots: Shot[];
  proposals: Proposal[];
  revisionRequests: RevisionRequest[];
  deliverables: Deliverable[];
  planItems: PlanItem[];
  ownerName: string;
}

const DAY_MS = 86_400_000;

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) / DAY_MS);
}

function ageDays(fromDate: string, iso: string): number {
  return Math.floor((new Date(`${fromDate}T00:00:00Z`).getTime() - new Date(iso).getTime()) / DAY_MS);
}

/** Derive the ranked exception rail from the record. Nearest/sharpest first. */
export function deriveExceptions(input: ExceptionInput, fromDate: string): RecordException[] {
  const exceptions: RecordException[] = [];
  const dayById = new Map(input.productionDays.map((day) => [day.id, day]));

  // Unsigned releases with a shoot approaching (the chase list, generalized).
  for (const release of input.releases) {
    if (release.status === "signed") continue;
    for (const dayId of release.production_day_ids) {
      const day = dayById.get(dayId);
      if (!day || day.status === "cancelled") continue;
      const until = daysBetween(fromDate, day.date);
      if (until < 0 || until > 14) continue;
      const severity = until <= 2 ? "critical" : "attention";
      exceptions.push({
        id: `release-${release.id}-${day.id}`,
        kind: "release_unsigned",
        severity,
        title: `${release.person_name} has not signed — shoots ${until === 0 ? "today" : until === 1 ? "tomorrow" : `in ${until} days`}`,
        detail: `${release.type} release is ${release.status}. No release, no film.`,
        owner: input.ownerName,
        repair: { label: release.status === "unsent" ? "Send release" : "Chase signature", href: `/projects/${release.project_id}?surface=plan` },
        clearCondition: "Release reaches signed.",
        rankScore: (severity === "critical" ? 100 : 60) - until,
      });
    }
  }

  // Shoot days approaching with no shot list — no list, no plan.
  for (const day of input.productionDays) {
    if (day.status === "cancelled") continue;
    if (day.type !== "principal") continue;
    const until = daysBetween(fromDate, day.date);
    if (until < 0 || until > 14) continue;
    if (shotReadinessForDay(day, input.shots).readiness !== "unplanned") continue;
    const severity = until <= 2 ? "critical" : "attention";
    exceptions.push({
      id: `shots-${day.id}`,
      kind: "shots_unplanned",
      severity,
      title: `${day.type === "principal" ? "Shoot" : day.type} ${day.date} has no shot list — ${until === 0 ? "today" : until === 1 ? "tomorrow" : `in ${until} days`}`,
      detail: day.notes || "The day owes the edit nothing on paper yet.",
      owner: input.ownerName,
      repair: { label: "Build shot list", href: `/projects/${day.project_id}?surface=plan` },
      clearCondition: "Day has a planned shot list (or is cancelled).",
      rankScore: (severity === "critical" ? 90 : 55) - until,
    });
  }

  // Proposals sent and unanswered past the patience window.
  for (const proposal of input.proposals) {
    if (proposal.status !== "sent") continue;
    const age = ageDays(fromDate, proposal.updated_at);
    if (age < 7) continue;
    exceptions.push({
      id: `proposal-${proposal.id}`,
      kind: "proposal_stale",
      severity: "attention",
      title: `Proposal v${proposal.version} sent ${age} days ago — no client answer`,
      detail: proposal.title,
      owner: input.ownerName,
      repair: { label: "Nudge client", href: `/projects/${proposal.project_id}?surface=proposal` },
      clearCondition: "Proposal approved, declined, or superseded.",
      rankScore: 55 - Math.min(age, 30),
    });
  }

  // Revision rounds open past the consolidation window.
  for (const request of input.revisionRequests) {
    if (request.status !== "open" && request.status !== "in_progress") continue;
    const age = ageDays(fromDate, request.updated_at);
    if (age < 5) continue;
    exceptions.push({
      id: `revision-${request.id}`,
      kind: "revision_stale",
      severity: "attention",
      title: `Revision round ${request.round} has been ${request.status.replace("_", " ")} for ${age} days`,
      detail: request.summary.slice(0, 90),
      owner: input.ownerName,
      repair: { label: request.status === "open" ? "Start work" : "Mark addressed", href: `/projects/${request.project_id}?surface=reviews` },
      clearCondition: "Round verified (or waived).",
      rankScore: 45 - Math.min(age, 25),
    });
  }

  // Deliverables sitting in QC past the freshness window.
  for (const deliverable of input.deliverables) {
    if (deliverable.status !== "qc") continue;
    const age = ageDays(fromDate, deliverable.updated_at);
    if (age < 3) continue;
    exceptions.push({
      id: `qc-${deliverable.id}`,
      kind: "qc_stale",
      severity: "attention",
      title: `${deliverable.name} has waited in QC for ${age} days`,
      detail: deliverable.qc_notes || "QC checklist unfinished.",
      owner: input.ownerName,
      repair: { label: "Finish QC", href: `/projects/${deliverable.project_id}?surface=delivery` },
      clearCondition: "Deliverable ready or re-encoded.",
      rankScore: 40 - Math.min(age, 20),
    });
  }

  // Overdue plan items.
  for (const item of input.planItems) {
    if (item.status === "done" || !item.date) continue;
    const overdue = daysBetween(item.date, fromDate);
    if (overdue <= 0) continue;
    exceptions.push({
      id: `plan-${item.id}`,
      kind: "plan_overdue",
      severity: item.kind === "milestone" ? "critical" : "attention",
      title: `${item.kind === "milestone" ? "Milestone" : item.kind === "production_day" ? "Production day" : "Task"} overdue by ${overdue} day${overdue === 1 ? "" : "s"}`,
      detail: item.title,
      owner: item.assignee ?? input.ownerName,
      repair: { label: "Reschedule or complete", href: `/projects/${item.project_id}?surface=plan` },
      clearCondition: "Item done or re-dated.",
      rankScore: (item.kind === "milestone" ? 70 : 35) - Math.min(overdue, 20),
    });
  }

  return exceptions.sort((a, b) => b.rankScore - a.rankScore);
}

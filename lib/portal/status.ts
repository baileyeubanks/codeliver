/**
 * P23 Client Portal — plain-language project status.
 *
 * Clients never see internal pipeline stage names ("preproduction", "post",
 * "review"). The whole lifecycle collapses onto the five phrases the founder
 * specced: Planning, Production, Editing, Awaiting Feedback, Final Delivery.
 */

import type { ProjectStage } from "../covideopro/record.ts";

export type ClientProjectStatus =
  | "Planning"
  | "Production"
  | "Editing"
  | "Awaiting Feedback"
  | "Final Delivery";

export const CLIENT_PROJECT_STATUSES: readonly ClientProjectStatus[] = [
  "Planning",
  "Production",
  "Editing",
  "Awaiting Feedback",
  "Final Delivery",
];

/** archived is not client-visible: active-project lists drop it instead of
 * dressing it up as a live status. */
const STATUS_BY_STAGE: Record<ProjectStage, ClientProjectStatus | null> = {
  inquiry: "Planning",
  intake: "Planning",
  development: "Planning",
  preproduction: "Planning",
  production: "Production",
  post: "Editing",
  review: "Awaiting Feedback",
  delivery: "Final Delivery",
  archived: null,
};

export function clientProjectStatus(
  stage: ProjectStage | string | null | undefined,
): ClientProjectStatus | null {
  if (!stage) return null;
  return (STATUS_BY_STAGE as Record<string, ClientProjectStatus | null>)[stage] ?? null;
}

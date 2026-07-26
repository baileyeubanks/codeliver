/**
 * Standing brand guardrails shown with every version of the creative brief
 * (P24). The living, versioned part of the brief is the Brief record itself;
 * guardrails are standing rules of engagement and stay constant across
 * versions, so they live here as data rather than in the workspace store.
 */

const PROJECT_BRAND_GUARDRAILS: Record<string, readonly string[]> = {
  ica: [
    "ICA primary blue only for lower thirds — never recolor the mark.",
    "Crew and contractor footage shows full PPE; no exceptions in the final cut.",
    "Logo clear space equals the height of the “I” in ICA on all sides.",
    "No competitor marks, license plates, or site credentials in frame.",
  ],
};

/** Guardrails for a project; empty when none are on file (never invented). */
export function projectBrandGuardrails(projectId: string): readonly string[] {
  return PROJECT_BRAND_GUARDRAILS[projectId] ?? [];
}

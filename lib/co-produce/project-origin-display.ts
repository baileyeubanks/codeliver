export interface ProjectOriginDisplay {
  source: "Accepted proposal" | "Manual project" | "Origin needs confirmation";
  authority: "Co-VideoPro CRM" | "External reference" | "Co-VideoPro" | "Unlinked";
  reference: string;
  verification: "Verified handoff" | "Read-only reference" | "No proposal handoff" | "No durable origin record";
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function deriveProjectOriginDisplay(
  payload: unknown,
): ProjectOriginDisplay | null {
  const record = asRecord(payload);
  const authority = asRecord(record?.authority);
  const lineage = asRecord(record?.lineage);
  if (!authority || !lineage) return null;

  if (lineage.source === "manual_project") {
    return {
      source: "Manual project",
      authority: "Co-VideoPro",
      reference: "Created in workspace",
      verification: "No proposal handoff",
    };
  }

  if (lineage.source === "unlinked_project") {
    return {
      source: "Origin needs confirmation",
      authority: "Unlinked",
      reference: "Legacy project",
      verification: "No durable origin record",
    };
  }

  if (lineage.source !== "accepted_proposal") return null;

  const displayNumber = nonEmptyString(lineage.displayNumber);
  const linkedToCrm =
    authority.preproject === "Co-VideoPro CRM" &&
    lineage.preprojectOrigin === "linked";

  return {
    source: "Accepted proposal",
    authority: linkedToCrm ? "Co-VideoPro CRM" : "External reference",
    reference: displayNumber ?? "Accepted proposal receipt",
    verification: linkedToCrm ? "Verified handoff" : "Read-only reference",
  };
}

export const DEMO_PROJECT_ORIGIN: ProjectOriginDisplay = {
  source: "Manual project",
  authority: "Co-VideoPro",
  reference: "Preview workspace",
  verification: "No proposal handoff",
};

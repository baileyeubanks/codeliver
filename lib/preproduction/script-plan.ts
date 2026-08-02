import type { ProjectScriptContent } from "./project-script.ts";
// @ts-expect-error TS5097: Node's source-TypeScript test runner requires explicit local extensions.
import { parseProductionPlanDraft, parseProductionPlanReceipt, type ProductionPlanDraft, type ProductionPlanReceipt } from "./production-plan.ts";

export const PROJECT_SCRIPT_PLAN_COMMAND_MAX_BYTES = 16 * 1024;
export const PROJECT_SCRIPT_PLAN_DERIVATION_VERSION = "cco.script-plan.v1" as const;

export interface ProjectScriptPlanDraftRecord {
  id: string;
  derivationVersion: typeof PROJECT_SCRIPT_PLAN_DERIVATION_VERSION;
  content: ProductionPlanDraft;
  contentHash: string;
  generatedAt: string;
}

export interface ProjectScriptPlanProposal {
  projectId: string;
  authorityVersion: number;
  currentPlanRevision: number;
  available: boolean;
  scriptRevisionId: string | null;
  scriptRevisionNumber: number | null;
  scriptTitle: string | null;
  preview: ProductionPlanDraft | null;
  draft: ProjectScriptPlanDraftRecord | null;
  alreadyMaterialized: boolean;
  materializedPlanRevision: number | null;
  permissions: {
    canGenerate: boolean;
    canApprove: boolean;
  };
}

export interface ProjectScriptPlanDraftCommand {
  expectedAuthorityVersion: number;
  expectedScriptRevisionId: string;
  requestId: string;
}

export interface ProjectScriptPlanApprovalCommand {
  draftId: string;
  expectedPlanRevision: number;
  requestId: string;
  note: string;
}

export interface ProjectScriptPlanDraftReceipt {
  draftId: string;
  projectId: string;
  scriptRevisionId: string;
  scriptRevisionNumber: number;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export interface ProjectScriptPlanApprovalReceipt extends ProductionPlanReceipt {
  draftId: string;
  scriptRevisionId: string;
  scriptRevisionNumber: number;
}

export function classifyProjectScriptPlanDatabaseError(
  error: { code?: string; message?: string } | null,
) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("forbidden")) {
    return { status: 403, error: "Forbidden" } as const;
  }
  if (message.includes("not_found")) {
    return { status: 404, error: "Project script plan not found" } as const;
  }
  if (
    message.includes("version_conflict")
    || message.includes("idempotency_conflict")
    || message.includes("already_materialized")
    || message.includes("stale")
  ) {
    return {
      status: 409,
      error: "The script or production plan changed elsewhere. Reload before trying again.",
    } as const;
  }
  if (message.includes("invalid_")) {
    return { status: 422, error: "The script production plan request is invalid" } as const;
  }
  return { status: 503, error: "Script production planning is temporarily unavailable" } as const;
}

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BLOCK_LABELS: Record<ProjectScriptContent["sections"][number]["blocks"][number]["kind"], string> = {
  scene_heading: "Scene",
  visual: "Visual",
  action: "Action",
  dialogue: "Dialogue",
  voice_over: "Voice over",
  interview_question: "Interview question",
  b_roll: "B-roll",
  on_screen_text: "On-screen text",
  graphic: "Graphic",
  music: "Music",
  sfx: "Sound effect",
  transition: "Transition",
  note: "Production note",
};

function truncate(value: string, maximumCharacters: number) {
  return Array.from(value).slice(0, maximumCharacters).join("").trim();
}

function sectionTaskTitle(section: ProjectScriptContent["sections"][number]) {
  const kinds = new Set(section.blocks.map((block) => block.kind));
  const prefix = kinds.has("interview_question")
    ? "Plan interview: "
    : kinds.has("visual") || kinds.has("action") || kinds.has("b_roll")
      ? "Plan coverage: "
      : "Plan section: ";
  return truncate(`${prefix}${section.heading}`, 240);
}

function sectionTaskDescription(section: ProjectScriptContent["sections"][number]) {
  const lines: string[] = [];
  if (section.summary) lines.push(`Purpose: ${section.summary}`);
  if (section.estimatedDurationSeconds !== null) {
    lines.push(`Target runtime: ${section.estimatedDurationSeconds} seconds`);
  }
  lines.push("Script cues:");
  for (const block of section.blocks) {
    const speaker = block.speaker ? ` (${block.speaker})` : "";
    const parenthetical = block.parenthetical ? ` [${block.parenthetical}]` : "";
    lines.push(`${BLOCK_LABELS[block.kind]}${speaker}${parenthetical}: ${block.text}`);
  }
  return truncate(lines.join("\n"), 4_000);
}

export function deriveProjectScriptPlanDraft(
  content: ProjectScriptContent,
): ProductionPlanDraft {
  const format = content.format.replaceAll("_", " ");
  return parseProductionPlanDraft({
    title: truncate(`${content.title} production plan`, 240),
    summary: content.logline
      ? truncate(content.logline, 4_000)
      : `Production plan derived from the approved ${format} script.`,
    tasks: content.sections.map((section, index) => ({
      clientTaskId: `script-section-${String(index + 1).padStart(3, "0")}`,
      title: sectionTaskTitle(section),
      description: sectionTaskDescription(section),
      priority: "normal",
      assigneeId: null,
      dueDate: null,
      sourceKind: "plan",
      sourceRef: `script-section:${section.id}`,
      dependsOnClientTaskIds: [],
    })),
  });
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function exactKeys(value: JsonObject, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function integer(value: unknown, minimum: number, maximum = 2_147_483_647) {
  return Number.isSafeInteger(value)
    && (value as number) >= minimum
    && (value as number) <= maximum
    ? value as number
    : null;
}

function requiredText(value: unknown, maximumCharacters: number) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  return normalized
    && Array.from(normalized).length <= maximumCharacters
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(normalized)
    ? normalized
    : null;
}

function parseDraftRecord(value: unknown): ProjectScriptPlanDraftRecord | null {
  const draft = objectValue(value);
  if (!draft || !exactKeys(draft, [
    "id",
    "derivationVersion",
    "content",
    "contentHash",
    "generatedAt",
  ])) return null;
  const id = uuid(draft.id);
  const contentHash = typeof draft.contentHash === "string" && SHA256_PATTERN.test(draft.contentHash)
    ? draft.contentHash
    : null;
  const generatedAt = requiredText(draft.generatedAt, 64);
  let content: ProductionPlanDraft | null = null;
  try {
    content = parseProductionPlanDraft(draft.content);
  } catch {
    return null;
  }
  if (
    !id
    || draft.derivationVersion !== PROJECT_SCRIPT_PLAN_DERIVATION_VERSION
    || !content
    || !contentHash
    || !generatedAt
    || !Number.isFinite(new Date(generatedAt).valueOf())
  ) return null;
  return {
    id,
    derivationVersion: PROJECT_SCRIPT_PLAN_DERIVATION_VERSION,
    content,
    contentHash,
    generatedAt,
  };
}

export function parseProjectScriptPlanProposal(
  value: unknown,
): ProjectScriptPlanProposal | null {
  const proposal = objectValue(value);
  if (!proposal || !exactKeys(proposal, [
    "projectId",
    "authorityVersion",
    "currentPlanRevision",
    "available",
    "scriptRevisionId",
    "scriptRevisionNumber",
    "scriptTitle",
    "preview",
    "draft",
    "alreadyMaterialized",
    "materializedPlanRevision",
    "permissions",
  ])) return null;

  const projectId = uuid(proposal.projectId);
  const authorityVersion = integer(proposal.authorityVersion, 0);
  const currentPlanRevision = integer(proposal.currentPlanRevision, 0, 2_147_483_646);
  const permissions = objectValue(proposal.permissions);
  if (
    !projectId
    || authorityVersion === null
    || currentPlanRevision === null
    || typeof proposal.available !== "boolean"
    || typeof proposal.alreadyMaterialized !== "boolean"
    || !permissions
    || !exactKeys(permissions, ["canGenerate", "canApprove"])
    || typeof permissions.canGenerate !== "boolean"
    || typeof permissions.canApprove !== "boolean"
  ) return null;

  if (!proposal.available) {
    if (
      proposal.scriptRevisionId !== null
      || proposal.scriptRevisionNumber !== null
      || proposal.scriptTitle !== null
      || proposal.preview !== null
      || proposal.draft !== null
      || proposal.alreadyMaterialized
      || proposal.materializedPlanRevision !== null
    ) return null;
    return {
      projectId,
      authorityVersion,
      currentPlanRevision,
      available: false,
      scriptRevisionId: null,
      scriptRevisionNumber: null,
      scriptTitle: null,
      preview: null,
      draft: null,
      alreadyMaterialized: false,
      materializedPlanRevision: null,
      permissions: {
        canGenerate: permissions.canGenerate,
        canApprove: permissions.canApprove,
      },
    };
  }

  const scriptRevisionId = uuid(proposal.scriptRevisionId);
  const scriptRevisionNumber = integer(proposal.scriptRevisionNumber, 1);
  const scriptTitle = requiredText(proposal.scriptTitle, 240);
  let preview: ProductionPlanDraft | null = null;
  try {
    preview = parseProductionPlanDraft(proposal.preview);
  } catch {
    return null;
  }
  const draft = proposal.draft === null ? null : parseDraftRecord(proposal.draft);
  const materializedPlanRevision = proposal.materializedPlanRevision === null
    ? null
    : integer(proposal.materializedPlanRevision, 1);
  if (
    !scriptRevisionId
    || scriptRevisionNumber === null
    || !scriptTitle
    || !preview
    || (proposal.draft !== null && !draft)
    || (proposal.alreadyMaterialized && (!draft || materializedPlanRevision === null))
    || (!proposal.alreadyMaterialized && materializedPlanRevision !== null)
  ) return null;

  return {
    projectId,
    authorityVersion,
    currentPlanRevision,
    available: true,
    scriptRevisionId,
    scriptRevisionNumber,
    scriptTitle,
    preview,
    draft,
    alreadyMaterialized: proposal.alreadyMaterialized,
    materializedPlanRevision,
    permissions: {
      canGenerate: permissions.canGenerate,
      canApprove: permissions.canApprove,
    },
  };
}

export function parseProjectScriptPlanDraftCommand(
  value: unknown,
): ProjectScriptPlanDraftCommand | null {
  const command = objectValue(value);
  if (!command || !exactKeys(command, [
    "expectedAuthorityVersion",
    "expectedScriptRevisionId",
    "requestId",
  ])) return null;
  const expectedAuthorityVersion = integer(command.expectedAuthorityVersion, 0, 2_147_483_646);
  const expectedScriptRevisionId = uuid(command.expectedScriptRevisionId);
  const requestId = uuid(command.requestId);
  return expectedAuthorityVersion === null || !expectedScriptRevisionId || !requestId
    ? null
    : { expectedAuthorityVersion, expectedScriptRevisionId, requestId };
}

export function parseProjectScriptPlanApprovalCommand(
  value: unknown,
): ProjectScriptPlanApprovalCommand | null {
  const command = objectValue(value);
  if (!command || !exactKeys(command, [
    "draftId",
    "expectedPlanRevision",
    "requestId",
    "note",
  ])) return null;
  const draftId = uuid(command.draftId);
  const expectedPlanRevision = integer(command.expectedPlanRevision, 0, 2_147_483_646);
  const requestId = uuid(command.requestId);
  const note = requiredText(command.note, 4_000);
  return !draftId || expectedPlanRevision === null || !requestId || !note
    ? null
    : { draftId, expectedPlanRevision, requestId, note };
}

export function parseProjectScriptPlanDraftReceipt(
  value: unknown,
): ProjectScriptPlanDraftReceipt | null {
  const receipt = objectValue(value);
  if (!receipt || !exactKeys(receipt, [
    "draftId",
    "projectId",
    "scriptRevisionId",
    "scriptRevisionNumber",
    "authorityVersion",
    "requestId",
    "replayed",
  ])) return null;
  const draftId = uuid(receipt.draftId);
  const projectId = uuid(receipt.projectId);
  const scriptRevisionId = uuid(receipt.scriptRevisionId);
  const scriptRevisionNumber = integer(receipt.scriptRevisionNumber, 1);
  const authorityVersion = integer(receipt.authorityVersion, 1);
  const requestId = uuid(receipt.requestId);
  if (
    !draftId
    || !projectId
    || !scriptRevisionId
    || scriptRevisionNumber === null
    || authorityVersion === null
    || !requestId
    || typeof receipt.replayed !== "boolean"
  ) return null;
  return {
    draftId,
    projectId,
    scriptRevisionId,
    scriptRevisionNumber,
    authorityVersion,
    requestId,
    replayed: receipt.replayed,
  };
}

export function parseProjectScriptPlanApprovalReceipt(
  value: unknown,
): ProjectScriptPlanApprovalReceipt | null {
  const receipt = objectValue(value);
  const base = parseProductionPlanReceipt(value);
  if (!receipt || !base) return null;
  const draftId = uuid(receipt.draftId);
  const scriptRevisionId = uuid(receipt.scriptRevisionId);
  const scriptRevisionNumber = integer(receipt.scriptRevisionNumber, 1);
  if (!draftId || !scriptRevisionId || scriptRevisionNumber === null) return null;
  return { ...base, draftId, scriptRevisionId, scriptRevisionNumber };
}

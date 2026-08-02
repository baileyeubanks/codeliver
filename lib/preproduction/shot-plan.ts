import type {
  ProjectScriptBlock,
  ProjectScriptContent,
} from "./project-script";

export const PROJECT_SHOT_PLAN_SCHEMA_VERSION = "cco.shot-plan.v1" as const;
export const SHOT_PLAN_SCHEMA_VERSION = PROJECT_SHOT_PLAN_SCHEMA_VERSION;
export const PROJECT_SHOT_PLAN_MAX_BYTES = 4 * 1024 * 1024;
export const PROJECT_SHOT_PLAN_CONTENT_MAX_BYTES = PROJECT_SHOT_PLAN_MAX_BYTES;
export const PROJECT_SHOT_PLAN_APPEND_MAX_BYTES = PROJECT_SHOT_PLAN_MAX_BYTES;
export const PROJECT_SHOT_PLAN_COMMAND_MAX_BYTES = 16 * 1024;
export const PROJECT_SHOT_PLAN_ACTION_MAX_BYTES =
  PROJECT_SHOT_PLAN_COMMAND_MAX_BYTES;
export const PROJECT_SHOT_PLAN_SCENE_LIMIT = 200;
export const PROJECT_SHOT_PLAN_SHOT_LIMIT = 2_000;
export const PROJECT_SHOT_PLAN_PANEL_LIMIT = 10_000;
export const PROJECT_SHOT_PLAN_TEXT_CHARACTER_LIMIT =
  PROJECT_SHOT_PLAN_MAX_BYTES;

export const PROJECT_SHOT_PLAN_COVERAGE_KINDS = [
  "establishing",
  "coverage",
  "interview",
  "b_roll",
  "action",
  "graphic",
  "transition",
  "other",
] as const;

export const PROJECT_SHOT_PLAN_FRAMINGS = [
  "unspecified",
  "extreme_wide",
  "wide",
  "medium",
  "medium_close_up",
  "close_up",
  "extreme_close_up",
  "over_shoulder",
  "two_shot",
  "detail",
  "aerial",
  "pov",
] as const;

export const PROJECT_SHOT_PLAN_MOVEMENTS = [
  "unspecified",
  "locked",
  "pan",
  "tilt",
  "dolly",
  "truck",
  "crane",
  "gimbal",
  "handheld",
  "drone",
  "zoom",
] as const;

export const PROJECT_SHOT_PLAN_STATES = [
  "draft",
  "submitted",
  "approved",
  "changes_requested",
] as const;

export const PROJECT_SHOT_PLAN_REVISION_KINDS = [
  "generated",
  "authored",
] as const;

export const PROJECT_SHOT_PLAN_DECISIONS = [
  "approved",
  "changes_requested",
] as const;

export type ProjectShotPlanCoverageKind =
  (typeof PROJECT_SHOT_PLAN_COVERAGE_KINDS)[number];
export type ProjectShotPlanFraming =
  (typeof PROJECT_SHOT_PLAN_FRAMINGS)[number];
export type ProjectShotPlanMovement =
  (typeof PROJECT_SHOT_PLAN_MOVEMENTS)[number];
export type ProjectShotPlanState =
  (typeof PROJECT_SHOT_PLAN_STATES)[number];
export type ProjectShotPlanDecision =
  (typeof PROJECT_SHOT_PLAN_DECISIONS)[number];
export type ProjectShotPlanRevisionKind =
  (typeof PROJECT_SHOT_PLAN_REVISION_KINDS)[number];

export interface ProjectShotPlanStoryboardPanel {
  id: string;
  order: number;
  visualDescription: string;
  assetId: string | null;
  versionId: string | null;
}

export interface ProjectShotPlanShot {
  id: string;
  order: number;
  scriptBlockIds: string[];
  purpose: string;
  coverageKind: ProjectShotPlanCoverageKind;
  framing: ProjectShotPlanFraming;
  movement: ProjectShotPlanMovement;
  subject: string | null;
  description: string;
  audioIntent: string | null;
  estimatedDurationSeconds: number | null;
  storyboardPanels: ProjectShotPlanStoryboardPanel[];
}

export interface ProjectShotPlanScene {
  id: string;
  scriptSectionId: string;
  order: number;
  heading: string;
  objective: string | null;
  estimatedDurationSeconds: number | null;
  shots: ProjectShotPlanShot[];
}

export interface ProjectShotPlanContent {
  schemaVersion: typeof PROJECT_SHOT_PLAN_SCHEMA_VERSION;
  title: string;
  scenes: ProjectShotPlanScene[];
}

export interface ProjectShotPlanSource {
  scriptRevisionId: string;
  scriptRevisionNumber: number;
  scriptContentHash: string;
  productionPlanRevisionId: string;
  productionPlanRevisionNumber: number;
  productionPlanContentHash: string;
  productionPlanScriptBindingId: string;
}

export interface ProjectShotPlanGenerateRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  expectedScriptRevisionId: string;
  expectedProductionPlanRevisionId: string;
}

export interface ProjectShotPlanAppendRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  baseRevisionId: string;
  changeSummary: string | null;
  content: ProjectShotPlanContent;
}

export interface ProjectShotPlanSubmitRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  note: string | null;
}

export interface ProjectShotPlanDecisionRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  decision: ProjectShotPlanDecision;
  note: string | null;
}

export interface ProjectShotPlanWorkflow {
  state: ProjectShotPlanState;
  isStale: boolean;
  isActive: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  submissionNote: string | null;
  decision: ProjectShotPlanDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ProjectShotPlanRevisionMetadata {
  revisionId: string;
  projectId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  revisionKind: ProjectShotPlanRevisionKind;
  derivationVersion: typeof PROJECT_SHOT_PLAN_SCHEMA_VERSION;
  title: string;
  state: ProjectShotPlanState;
  stale: boolean;
  active: boolean;
  changeSummary: string | null;
  contentHash: string;
  scriptRevisionId: string;
  scriptRevisionNumber: number;
  scriptContentHash: string;
  productionPlanRevisionId: string;
  productionPlanRevisionNumber: number;
  productionPlanContentHash: string;
  productionPlanScriptBindingId: string;
  createdBy: string;
  createdAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  submissionNote: string | null;
  decision: ProjectShotPlanDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ProjectShotPlanRevision
  extends ProjectShotPlanRevisionMetadata {
  content: ProjectShotPlanContent;
}

export type ProjectShotPlanHeadRevision = ProjectShotPlanRevision;

export interface ProjectShotPlanPermissions {
  canGenerate: boolean;
  canRevise: boolean;
  canSubmit: boolean;
  canDecide: boolean;
}

export interface ProjectShotPlanSnapshot {
  projectId: string;
  authorityVersion: number;
  eventHeadHash: string;
  source: ProjectShotPlanSource | null;
  head: ProjectShotPlanHeadRevision | null;
  active: ProjectShotPlanRevisionMetadata | null;
  revisions: ProjectShotPlanRevisionMetadata[];
  permissions: ProjectShotPlanPermissions;
}

export interface ProjectShotPlanRevisionReceipt {
  shotPlanRevisionId: string;
  projectId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  workflowState: "draft";
  source: ProjectShotPlanSource;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export interface ProjectShotPlanTransitionReceipt {
  shotPlanRevisionId: string;
  projectId: string;
  revisionNumber: number;
  workflowState: "submitted" | ProjectShotPlanDecision;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export type ProjectShotPlanGenerateReceipt = ProjectShotPlanRevisionReceipt;
export type ProjectShotPlanAppendReceipt = ProjectShotPlanRevisionReceipt;
export type ProjectShotPlanSubmitReceipt = ProjectShotPlanTransitionReceipt;
export type ProjectShotPlanDecisionReceipt = ProjectShotPlanTransitionReceipt;

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SCENE_ID_PATTERN = /^scene-[0-9]{3,}$/;
const SHOT_ID_PATTERN = /^shot-[0-9]{3,}-[0-9]{3,}$/;
const PANEL_ID_PATTERN = /^panel-[0-9]{3,}-[0-9]{3,}-[0-9]{3,}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UNSAFE_CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_EXPECTED_AUTHORITY_VERSION = 2_147_483_646;
const MAX_DURATION_SECONDS = 86_400;
const INVALID_OUTPUT = Symbol("invalid_project_shot_plan_output");

export class ProjectShotPlanValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "ProjectShotPlanValidationError";
    this.code = code;
    this.field = field;
  }
}

function fail(code: string, message: string, field?: string): never {
  throw new ProjectShotPlanValidationError(code, message, field);
}

function normalizeTextValue(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

function safeText(value: unknown, field: string, maximumCharacters: number) {
  if (typeof value !== "string") {
    fail("invalid_string", `${field} must be a string`, field);
  }
  const normalized = normalizeTextValue(value);
  if (
    normalized.length === 0 ||
    Array.from(normalized).length > maximumCharacters ||
    UNSAFE_CONTROL_PATTERN.test(normalized)
  ) {
    fail("invalid_string", `${field} contains invalid text`, field);
  }
  return normalized;
}

function nullableText(
  value: unknown,
  field: string,
  maximumCharacters: number,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    fail("invalid_string", `${field} must be a string or null`, field);
  }
  const normalized = normalizeTextValue(value);
  if (
    Array.from(normalized).length > maximumCharacters ||
    UNSAFE_CONTROL_PATTERN.test(normalized)
  ) {
    fail("invalid_string", `${field} contains invalid text`, field);
  }
  return normalized.length === 0 ? null : normalized;
}

function inputObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_object", `${field} must be an object`, field);
  }
  return value as JsonObject;
}

function assertExactKeys(
  value: JsonObject,
  field: string,
  expected: readonly string[],
) {
  const expectedKeys = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedKeys.has(key)) {
      fail("unknown_field", `${field}.${key} is not accepted`, `${field}.${key}`);
    }
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail("missing_field", `${field}.${key} is required`, `${field}.${key}`);
    }
  }
}

function uuid(value: unknown, field: string): string {
  const normalized = safeText(value, field, 64).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    fail("invalid_uuid", `${field} must be a UUID`, field);
  }
  return normalized;
}

export function normalizeProjectShotPlanUuid(value: unknown, field: string) {
  return uuid(value, field);
}

function stableId(
  value: unknown,
  field: string,
  pattern: RegExp = STABLE_ID_PATTERN,
): string {
  const normalized = safeText(value, field, 80).toLowerCase();
  if (!pattern.test(normalized)) {
    fail("invalid_stable_id", `${field} must be a stable ID`, field);
  }
  return normalized;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum = MAX_DATABASE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    fail(
      "invalid_integer",
      `${field} must be an integer from ${minimum} to ${maximum}`,
      field,
    );
  }
  return value as number;
}

function nullableInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  return value === null ? null : integer(value, field, minimum, maximum);
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  const normalized = safeText(value, field, 80);
  if (!(allowed as readonly string[]).includes(normalized)) {
    fail("invalid_enum", `${field} is invalid`, field);
  }
  return normalized as T[number];
}

function jsonByteLength(value: unknown, field: string): number {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail("invalid_json", `${field} must be JSON serializable`, field);
  }
  if (serialized === undefined) {
    fail("invalid_json", `${field} must be JSON serializable`, field);
  }
  return new TextEncoder().encode(serialized).byteLength;
}

function jsonbText(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(", ")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.entries(object)
    .map(([key, child]) => `${JSON.stringify(key)}: ${jsonbText(child)}`)
    .join(", ")}}`;
}

function jsonbByteLength(value: unknown) {
  return new TextEncoder().encode(jsonbText(value)).byteLength;
}

function textLength(value: string | null): number {
  return value === null ? 0 : Array.from(value).length;
}

interface ContentCounters {
  shots: number;
  panels: number;
  textCharacters: number;
}

function parsePanel(
  value: unknown,
  field: string,
  expectedOrder: number,
  expectedId: string,
  panelIds: Set<string>,
  counters: ContentCounters,
): ProjectShotPlanStoryboardPanel {
  const panel = inputObject(value, field);
  assertExactKeys(panel, field, [
    "id",
    "order",
    "visualDescription",
    "assetId",
    "versionId",
  ]);
  const id = stableId(panel.id, `${field}.id`, PANEL_ID_PATTERN);
  if (id !== expectedId) {
    fail("invalid_stable_id", `${field}.id must be ${expectedId}`, `${field}.id`);
  }
  if (panelIds.has(id)) {
    fail("duplicate_id", `${field}.id must be unique`, `${field}.id`);
  }
  panelIds.add(id);
  const order = integer(panel.order, `${field}.order`, 1, 50);
  if (order !== expectedOrder) {
    fail("invalid_order", `${field}.order must match its array position`, `${field}.order`);
  }
  const visualDescription = safeText(
    panel.visualDescription,
    `${field}.visualDescription`,
    20_000,
  );
  if (panel.assetId !== null || panel.versionId !== null) {
    fail(
      "attachment_not_supported",
      `${field} cannot attach media in Shot Plan v1`,
      `${field}.assetId`,
    );
  }
  counters.panels += 1;
  if (counters.panels > PROJECT_SHOT_PLAN_PANEL_LIMIT) {
    fail(
      "too_many_panels",
      `content may contain no more than ${PROJECT_SHOT_PLAN_PANEL_LIMIT} panels`,
      field,
    );
  }
  counters.textCharacters += textLength(visualDescription);
  return {
    id,
    order,
    visualDescription,
    assetId: null,
    versionId: null,
  };
}

function parseShot(
  value: unknown,
  field: string,
  sceneOrder: number,
  expectedOrder: number,
  shotIds: Set<string>,
  panelIds: Set<string>,
  counters: ContentCounters,
): ProjectShotPlanShot {
  const shot = inputObject(value, field);
  assertExactKeys(shot, field, [
    "id",
    "order",
    "scriptBlockIds",
    "purpose",
    "coverageKind",
    "framing",
    "movement",
    "subject",
    "description",
    "audioIntent",
    "estimatedDurationSeconds",
    "storyboardPanels",
  ]);
  if (!Array.isArray(shot.scriptBlockIds) || shot.scriptBlockIds.length > 200) {
    fail(
      "invalid_script_block_ids",
      `${field}.scriptBlockIds must be an array with no more than 200 IDs`,
      `${field}.scriptBlockIds`,
    );
  }
  if (
    !Array.isArray(shot.storyboardPanels) ||
    shot.storyboardPanels.length < 1 ||
    shot.storyboardPanels.length > 50
  ) {
    fail(
      "invalid_storyboard_panels",
      `${field}.storyboardPanels must contain between 1 and 50 panels`,
      `${field}.storyboardPanels`,
    );
  }
  const id = stableId(shot.id, `${field}.id`, SHOT_ID_PATTERN);
  const expectedId = `shot-${paddedOrdinal(sceneOrder)}-${paddedOrdinal(expectedOrder)}`;
  if (id !== expectedId) {
    fail("invalid_stable_id", `${field}.id must be ${expectedId}`, `${field}.id`);
  }
  if (shotIds.has(id)) {
    fail("duplicate_id", `${field}.id must be unique`, `${field}.id`);
  }
  shotIds.add(id);
  const order = integer(shot.order, `${field}.order`, 1, 200);
  if (order !== expectedOrder) {
    fail("invalid_order", `${field}.order must match its array position`, `${field}.order`);
  }
  const seenScriptBlockIds = new Set<string>();
  const scriptBlockIds = shot.scriptBlockIds.map((rawId, index) => {
    const blockId = stableId(rawId, `${field}.scriptBlockIds[${index}]`);
    if (seenScriptBlockIds.has(blockId)) {
      fail(
        "duplicate_id",
        `${field}.scriptBlockIds must be unique within the shot`,
        `${field}.scriptBlockIds[${index}]`,
      );
    }
    seenScriptBlockIds.add(blockId);
    return blockId;
  });
  const purpose = safeText(shot.purpose, `${field}.purpose`, 4_000);
  const subject = nullableText(shot.subject, `${field}.subject`, 1_000);
  const description = safeText(shot.description, `${field}.description`, 20_000);
  const audioIntent = nullableText(shot.audioIntent, `${field}.audioIntent`, 20_000);
  const storyboardPanels = shot.storyboardPanels.map((panel, index) =>
    parsePanel(
      panel,
      `${field}.storyboardPanels[${index}]`,
      index + 1,
      `panel-${paddedOrdinal(sceneOrder)}-${paddedOrdinal(expectedOrder)}-${paddedOrdinal(index + 1)}`,
      panelIds,
      counters,
    ),
  );
  counters.shots += 1;
  if (counters.shots > PROJECT_SHOT_PLAN_SHOT_LIMIT) {
    fail(
      "too_many_shots",
      `content may contain no more than ${PROJECT_SHOT_PLAN_SHOT_LIMIT} shots`,
      field,
    );
  }
  counters.textCharacters +=
    textLength(purpose) +
    textLength(subject) +
    textLength(description) +
    textLength(audioIntent);
  return {
    id,
    order,
    scriptBlockIds,
    purpose,
    coverageKind: enumValue(
      shot.coverageKind,
      `${field}.coverageKind`,
      PROJECT_SHOT_PLAN_COVERAGE_KINDS,
    ),
    framing: enumValue(
      shot.framing,
      `${field}.framing`,
      PROJECT_SHOT_PLAN_FRAMINGS,
    ),
    movement: enumValue(
      shot.movement,
      `${field}.movement`,
      PROJECT_SHOT_PLAN_MOVEMENTS,
    ),
    subject,
    description,
    audioIntent,
    estimatedDurationSeconds: nullableInteger(
      shot.estimatedDurationSeconds,
      `${field}.estimatedDurationSeconds`,
      1,
      MAX_DURATION_SECONDS,
    ),
    storyboardPanels,
  };
}

function parseScene(
  value: unknown,
  index: number,
  sceneIds: Set<string>,
  scriptSectionIds: Set<string>,
  shotIds: Set<string>,
  panelIds: Set<string>,
  counters: ContentCounters,
): ProjectShotPlanScene {
  const field = `content.scenes[${index}]`;
  const scene = inputObject(value, field);
  assertExactKeys(scene, field, [
    "id",
    "scriptSectionId",
    "order",
    "heading",
    "objective",
    "estimatedDurationSeconds",
    "shots",
  ]);
  if (!Array.isArray(scene.shots) || scene.shots.length < 1 || scene.shots.length > 200) {
    fail(
      "invalid_shots",
      `${field}.shots must contain between 1 and 200 shots`,
      `${field}.shots`,
    );
  }
  const id = stableId(scene.id, `${field}.id`, SCENE_ID_PATTERN);
  const expectedId = `scene-${paddedOrdinal(index + 1)}`;
  if (id !== expectedId) {
    fail("invalid_stable_id", `${field}.id must be ${expectedId}`, `${field}.id`);
  }
  if (sceneIds.has(id)) {
    fail("duplicate_id", `${field}.id must be unique`, `${field}.id`);
  }
  sceneIds.add(id);
  const order = integer(scene.order, `${field}.order`, 1, PROJECT_SHOT_PLAN_SCENE_LIMIT);
  if (order !== index + 1) {
    fail("invalid_order", `${field}.order must match its array position`, `${field}.order`);
  }
  const heading = safeText(scene.heading, `${field}.heading`, 240);
  const objective = nullableText(scene.objective, `${field}.objective`, 4_000);
  const scriptSectionId = stableId(
    scene.scriptSectionId,
    `${field}.scriptSectionId`,
  );
  if (scriptSectionIds.has(scriptSectionId)) {
    fail(
      "duplicate_id",
      `${field}.scriptSectionId must be unique`,
      `${field}.scriptSectionId`,
    );
  }
  scriptSectionIds.add(scriptSectionId);
  counters.textCharacters += textLength(heading) + textLength(objective);
  return {
    id,
    scriptSectionId,
    order,
    heading,
    objective,
    estimatedDurationSeconds: nullableInteger(
      scene.estimatedDurationSeconds,
      `${field}.estimatedDurationSeconds`,
      1,
      MAX_DURATION_SECONDS,
    ),
    shots: scene.shots.map((shot, shotIndex) =>
      parseShot(
        shot,
        `${field}.shots[${shotIndex}]`,
        index + 1,
        shotIndex + 1,
        shotIds,
        panelIds,
        counters,
      ),
    ),
  };
}

export function parseProjectShotPlanContent(value: unknown): ProjectShotPlanContent {
  if (jsonByteLength(value, "content") > PROJECT_SHOT_PLAN_CONTENT_MAX_BYTES) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_SHOT_PLAN_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }
  const content = inputObject(value, "content");
  assertExactKeys(content, "content", ["schemaVersion", "title", "scenes"]);
  if (
    !Array.isArray(content.scenes) ||
    content.scenes.length < 1 ||
    content.scenes.length > PROJECT_SHOT_PLAN_SCENE_LIMIT
  ) {
    fail(
      "invalid_scenes",
      `content.scenes must contain between 1 and ${PROJECT_SHOT_PLAN_SCENE_LIMIT} scenes`,
      "content.scenes",
    );
  }
  if (content.schemaVersion !== PROJECT_SHOT_PLAN_SCHEMA_VERSION) {
    fail(
      "invalid_schema_version",
      `content.schemaVersion must be ${PROJECT_SHOT_PLAN_SCHEMA_VERSION}`,
      "content.schemaVersion",
    );
  }
  const title = safeText(content.title, "content.title", 240);
  const counters: ContentCounters = {
    shots: 0,
    panels: 0,
    textCharacters: textLength(title),
  };
  const sceneIds = new Set<string>();
  const scriptSectionIds = new Set<string>();
  const shotIds = new Set<string>();
  const panelIds = new Set<string>();
  const scenes = content.scenes.map((scene, index) => {
    const parsed = parseScene(
      scene,
      index,
      sceneIds,
      scriptSectionIds,
      shotIds,
      panelIds,
      counters,
    );
    if (counters.textCharacters > PROJECT_SHOT_PLAN_TEXT_CHARACTER_LIMIT) {
      fail(
        "too_much_text",
        `content may contain no more than ${PROJECT_SHOT_PLAN_TEXT_CHARACTER_LIMIT} text characters`,
        "content",
      );
    }
    return parsed;
  });
  const normalized: ProjectShotPlanContent = {
    schemaVersion: PROJECT_SHOT_PLAN_SCHEMA_VERSION,
    title,
    scenes,
  };
  if (jsonbByteLength(normalized) > PROJECT_SHOT_PLAN_CONTENT_MAX_BYTES) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_SHOT_PLAN_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }
  return normalized;
}

export const normalizeProjectShotPlanContent = parseProjectShotPlanContent;

type EligibleScriptBlockKind = Extract<
  ProjectScriptBlock["kind"],
  | "scene_heading"
  | "visual"
  | "action"
  | "interview_question"
  | "b_roll"
  | "on_screen_text"
  | "graphic"
  | "transition"
>;

const ELIGIBLE_BLOCK_KINDS = new Set<ProjectScriptBlock["kind"]>([
  "scene_heading",
  "visual",
  "action",
  "interview_question",
  "b_roll",
  "on_screen_text",
  "graphic",
  "transition",
]);

const SHOT_RULES: Record<
  EligibleScriptBlockKind,
  { purpose: string; coverageKind: ProjectShotPlanCoverageKind }
> = {
  scene_heading: {
    purpose: "Establish the scripted scene.",
    coverageKind: "establishing",
  },
  visual: {
    purpose: "Capture the scripted visual.",
    coverageKind: "coverage",
  },
  action: {
    purpose: "Capture the scripted action.",
    coverageKind: "action",
  },
  interview_question: {
    purpose: "Capture the scripted interview question.",
    coverageKind: "interview",
  },
  b_roll: {
    purpose: "Capture the scripted B-roll.",
    coverageKind: "b_roll",
  },
  on_screen_text: {
    purpose: "Present the scripted on-screen text.",
    coverageKind: "graphic",
  },
  graphic: {
    purpose: "Present the scripted graphic.",
    coverageKind: "graphic",
  },
  transition: {
    purpose: "Capture the scripted transition.",
    coverageKind: "transition",
  },
};

function paddedOrdinal(value: number) {
  return String(value).padStart(3, "0");
}

function fallbackVisualBrief(summary: string | null) {
  const base = "Visual coverage is not specified.";
  return summary ? `${base} Section summary: ${summary}` : base;
}

function derivedShot(
  block: ProjectScriptBlock,
  sceneNumber: number,
  shotNumber: number,
): ProjectShotPlanShot {
  const kind = block.kind as EligibleScriptBlockKind;
  const rule = SHOT_RULES[kind];
  const shotOrdinal = `${paddedOrdinal(sceneNumber)}-${paddedOrdinal(shotNumber)}`;
  return {
    id: `shot-${shotOrdinal}`,
    order: shotNumber,
    scriptBlockIds: [block.id],
    purpose: rule.purpose,
    coverageKind: rule.coverageKind,
    framing: "unspecified",
    movement: "unspecified",
    subject: null,
    description: block.text,
    audioIntent: kind === "interview_question" ? block.text : null,
    estimatedDurationSeconds: null,
    storyboardPanels: [
      {
        id: `panel-${shotOrdinal}-001`,
        order: 1,
        visualDescription: block.text,
        assetId: null,
        versionId: null,
      },
    ],
  };
}

export function deriveProjectShotPlanContent(
  scriptContent: ProjectScriptContent,
): ProjectShotPlanContent {
  return parseProjectShotPlanContent({
    schemaVersion: PROJECT_SHOT_PLAN_SCHEMA_VERSION,
    title: scriptContent.title,
    scenes: scriptContent.sections.map((section, sceneIndex) => {
      const sceneNumber = sceneIndex + 1;
      const eligibleBlocks = section.blocks.filter((block) =>
        ELIGIBLE_BLOCK_KINDS.has(block.kind),
      );
      const shots = eligibleBlocks.length > 0
        ? eligibleBlocks.map((block, shotIndex) =>
            derivedShot(block, sceneNumber, shotIndex + 1),
          )
        : [
            {
              id: `shot-${paddedOrdinal(sceneNumber)}-001`,
              order: 1,
              scriptBlockIds: [],
              purpose: "Define visual coverage for this script section.",
              coverageKind: "coverage" as const,
              framing: "unspecified" as const,
              movement: "unspecified" as const,
              subject: null,
              description: fallbackVisualBrief(section.summary),
              audioIntent: null,
              estimatedDurationSeconds: null,
              storyboardPanels: [
                {
                  id: `panel-${paddedOrdinal(sceneNumber)}-001-001`,
                  order: 1,
                  visualDescription: fallbackVisualBrief(section.summary),
                  assetId: null,
                  versionId: null,
                },
              ],
            },
          ];
      return {
        id: `scene-${paddedOrdinal(sceneNumber)}`,
        scriptSectionId: section.id,
        order: sceneNumber,
        heading: section.heading,
        objective: section.summary,
        estimatedDurationSeconds: section.estimatedDurationSeconds,
        shots,
      };
    }),
  });
}

export const deriveProjectShotPlan = deriveProjectShotPlanContent;

export function parseProjectShotPlanGenerateRequest(
  value: unknown,
): ProjectShotPlanGenerateRequest {
  const request = inputObject(value, "request");
  assertExactKeys(request, "request", [
    "requestId",
    "expectedAuthorityVersion",
    "expectedScriptRevisionId",
    "expectedProductionPlanRevisionId",
  ]);
  return {
    requestId: uuid(request.requestId, "request.requestId"),
    expectedAuthorityVersion: integer(
      request.expectedAuthorityVersion,
      "request.expectedAuthorityVersion",
      0,
      MAX_EXPECTED_AUTHORITY_VERSION,
    ),
    expectedScriptRevisionId: uuid(
      request.expectedScriptRevisionId,
      "request.expectedScriptRevisionId",
    ),
    expectedProductionPlanRevisionId: uuid(
      request.expectedProductionPlanRevisionId,
      "request.expectedProductionPlanRevisionId",
    ),
  };
}

export function parseProjectShotPlanAppendRequest(
  value: unknown,
): ProjectShotPlanAppendRequest {
  const request = inputObject(value, "request");
  assertExactKeys(request, "request", [
    "requestId",
    "expectedAuthorityVersion",
    "baseRevisionId",
    "changeSummary",
    "content",
  ]);
  return {
    requestId: uuid(request.requestId, "request.requestId"),
    expectedAuthorityVersion: integer(
      request.expectedAuthorityVersion,
      "request.expectedAuthorityVersion",
      0,
      MAX_EXPECTED_AUTHORITY_VERSION,
    ),
    baseRevisionId: uuid(request.baseRevisionId, "request.baseRevisionId"),
    changeSummary: nullableText(
      request.changeSummary,
      "request.changeSummary",
      4_000,
    ),
    content: parseProjectShotPlanContent(request.content),
  };
}

export function parseProjectShotPlanSubmitRequest(
  value: unknown,
): ProjectShotPlanSubmitRequest {
  const request = inputObject(value, "request");
  assertExactKeys(request, "request", [
    "requestId",
    "expectedAuthorityVersion",
    "revisionId",
    "note",
  ]);
  return {
    requestId: uuid(request.requestId, "request.requestId"),
    expectedAuthorityVersion: integer(
      request.expectedAuthorityVersion,
      "request.expectedAuthorityVersion",
      0,
      MAX_EXPECTED_AUTHORITY_VERSION,
    ),
    revisionId: uuid(request.revisionId, "request.revisionId"),
    note: nullableText(request.note, "request.note", 4_000),
  };
}

export function parseProjectShotPlanDecisionRequest(
  value: unknown,
): ProjectShotPlanDecisionRequest {
  const request = inputObject(value, "request");
  assertExactKeys(request, "request", [
    "requestId",
    "expectedAuthorityVersion",
    "revisionId",
    "decision",
    "note",
  ]);
  const decision = enumValue(
    request.decision,
    "request.decision",
    PROJECT_SHOT_PLAN_DECISIONS,
  );
  const note = nullableText(request.note, "request.note", 4_000);
  if (decision === "changes_requested" && note === null) {
    fail(
      "note_required",
      "request.note is required when changes are requested",
      "request.note",
    );
  }
  return {
    requestId: uuid(request.requestId, "request.requestId"),
    expectedAuthorityVersion: integer(
      request.expectedAuthorityVersion,
      "request.expectedAuthorityVersion",
      0,
      MAX_EXPECTED_AUTHORITY_VERSION,
    ),
    revisionId: uuid(request.revisionId, "request.revisionId"),
    decision,
    note,
  };
}

export const parseGenerateProjectShotPlanRevisionRequest =
  parseProjectShotPlanGenerateRequest;
export const parseAppendProjectShotPlanRevisionRequest =
  parseProjectShotPlanAppendRequest;
export const parseSubmitProjectShotPlanRevisionRequest =
  parseProjectShotPlanSubmitRequest;
export const parseDecideProjectShotPlanRevisionRequest =
  parseProjectShotPlanDecisionRequest;

function outputObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function hasExactOutputKeys(value: JsonObject, expected: readonly string[]) {
  const actual = Object.keys(value);
  if (actual.length !== expected.length) return false;
  const expectedKeys = new Set(expected);
  return actual.every((key) => expectedKeys.has(key));
}

function outputString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function outputBoundedText(value: unknown, maximumCharacters: number) {
  return typeof value === "string" &&
    value.length > 0 &&
    normalizeTextValue(value) === value &&
    Array.from(value).length <= maximumCharacters &&
    !UNSAFE_CONTROL_PATTERN.test(value)
    ? value
    : null;
}

function outputNullableBoundedText(
  value: unknown,
  maximumCharacters: number,
): string | null | typeof INVALID_OUTPUT {
  return value === null
    ? null
    : outputBoundedText(value, maximumCharacters) ?? INVALID_OUTPUT;
}

function outputUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function outputInteger(value: unknown, minimum: number): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= MAX_DATABASE_INTEGER
    ? (value as number)
    : null;
}

function outputNullableUuid(value: unknown): string | null | typeof INVALID_OUTPUT {
  return value === null ? null : outputUuid(value) ?? INVALID_OUTPUT;
}

function outputNullableString(
  value: unknown,
): string | null | typeof INVALID_OUTPUT {
  return value === null ? null : outputString(value) ?? INVALID_OUTPUT;
}

function outputTimestamp(value: unknown): string | null {
  const timestamp = outputString(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

function outputHash(value: unknown): string | null {
  return typeof value === "string" && SHA256_PATTERN.test(value) ? value : null;
}

const SOURCE_KEYS = [
  "scriptRevisionId",
  "scriptRevisionNumber",
  "scriptContentHash",
  "productionPlanRevisionId",
  "productionPlanRevisionNumber",
  "productionPlanContentHash",
  "productionPlanScriptBindingId",
] as const;

function parseSource(value: unknown): ProjectShotPlanSource | null {
  const source = outputObject(value);
  if (!source || !hasExactOutputKeys(source, SOURCE_KEYS)) return null;
  const scriptRevisionId = outputUuid(source.scriptRevisionId);
  const scriptRevisionNumber = outputInteger(source.scriptRevisionNumber, 1);
  const scriptContentHash = outputHash(source.scriptContentHash);
  const productionPlanRevisionId = outputUuid(source.productionPlanRevisionId);
  const productionPlanRevisionNumber = outputInteger(
    source.productionPlanRevisionNumber,
    1,
  );
  const productionPlanContentHash = outputHash(source.productionPlanContentHash);
  const productionPlanScriptBindingId = outputUuid(
    source.productionPlanScriptBindingId,
  );
  return scriptRevisionId &&
    scriptRevisionNumber !== null &&
    scriptContentHash &&
    productionPlanRevisionId &&
    productionPlanRevisionNumber !== null &&
    productionPlanContentHash &&
    productionPlanScriptBindingId
    ? {
        scriptRevisionId,
        scriptRevisionNumber,
        scriptContentHash,
        productionPlanRevisionId,
        productionPlanRevisionNumber,
        productionPlanContentHash,
        productionPlanScriptBindingId,
      }
    : null;
}

const WORKFLOW_KEYS = [
  "state",
  "isStale",
  "isActive",
  "submittedBy",
  "submittedAt",
  "submissionNote",
  "decision",
  "decidedBy",
  "decidedAt",
  "decisionNote",
] as const;

function parseWorkflow(value: unknown): ProjectShotPlanWorkflow | null {
  const workflow = outputObject(value);
  if (!workflow || !hasExactOutputKeys(workflow, WORKFLOW_KEYS)) return null;
  const state = typeof workflow.state === "string" &&
    (PROJECT_SHOT_PLAN_STATES as readonly string[]).includes(workflow.state)
    ? (workflow.state as ProjectShotPlanState)
    : null;
  const submittedBy = outputNullableUuid(workflow.submittedBy);
  const submittedAt = outputNullableString(workflow.submittedAt);
  const submissionNote = outputNullableBoundedText(
    workflow.submissionNote,
    4_000,
  );
  const decision = workflow.decision === null
    ? null
    : typeof workflow.decision === "string" &&
        (PROJECT_SHOT_PLAN_DECISIONS as readonly string[]).includes(
          workflow.decision,
        )
      ? (workflow.decision as ProjectShotPlanDecision)
      : INVALID_OUTPUT;
  const decidedBy = outputNullableUuid(workflow.decidedBy);
  const decidedAt = outputNullableString(workflow.decidedAt);
  const decisionNote = outputNullableBoundedText(workflow.decisionNote, 4_000);
  if (
    !state ||
    typeof workflow.isStale !== "boolean" ||
    typeof workflow.isActive !== "boolean" ||
    submittedBy === INVALID_OUTPUT ||
    submittedAt === INVALID_OUTPUT ||
    submissionNote === INVALID_OUTPUT ||
    decision === INVALID_OUTPUT ||
    decidedBy === INVALID_OUTPUT ||
    decidedAt === INVALID_OUTPUT ||
    decisionNote === INVALID_OUTPUT ||
    (submittedAt !== null && !Number.isFinite(Date.parse(submittedAt))) ||
    (decidedAt !== null && !Number.isFinite(Date.parse(decidedAt))) ||
    (submittedBy === null) !== (submittedAt === null) ||
    (decidedBy === null) !== (decidedAt === null) ||
    (decision === null) !== (decidedBy === null) ||
    (submittedBy === null && submissionNote !== null) ||
    (decision === null && decisionNote !== null) ||
    (decision === "changes_requested" && decisionNote === null) ||
    (state === "draft" && (submittedBy !== null || decision !== null)) ||
    (state === "submitted" && (submittedBy === null || decision !== null)) ||
    ((state === "approved" || state === "changes_requested") &&
      (submittedBy === null || decision !== state || decidedBy === null)) ||
    (workflow.isActive && (state !== "approved" || workflow.isStale))
  ) {
    return null;
  }
  return {
    state,
    isStale: workflow.isStale,
    isActive: workflow.isActive,
    submittedBy,
    submittedAt,
    submissionNote,
    decision,
    decidedBy,
    decidedAt,
    decisionNote,
  };
}

const REVISION_KEYS = [
  "id",
  "projectId",
  "revisionNumber",
  "baseRevisionId",
  "revisionKind",
  "derivationVersion",
  "title",
  "changeSummary",
  "contentHash",
  "source",
  "workflow",
  "createdBy",
  "createdAt",
] as const;

const HEAD_KEYS = [...REVISION_KEYS, "content"] as const;

function parseRevisionFields(
  revision: JsonObject,
): ProjectShotPlanRevisionMetadata | null {
  const id = outputUuid(revision.id);
  const projectId = outputUuid(revision.projectId);
  const revisionNumber = outputInteger(revision.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(revision.baseRevisionId);
  const revisionKind = typeof revision.revisionKind === "string" &&
    (PROJECT_SHOT_PLAN_REVISION_KINDS as readonly string[]).includes(
      revision.revisionKind,
    )
    ? (revision.revisionKind as ProjectShotPlanRevisionKind)
    : null;
  const title = outputBoundedText(revision.title, 240);
  const changeSummary = outputNullableBoundedText(
    revision.changeSummary,
    4_000,
  );
  const contentHash = outputHash(revision.contentHash);
  const source = parseSource(revision.source);
  const workflow = parseWorkflow(revision.workflow);
  const createdBy = outputUuid(revision.createdBy);
  const createdAt = outputTimestamp(revision.createdAt);
  if (
    !id ||
    !projectId ||
    revisionNumber === null ||
    baseRevisionId === INVALID_OUTPUT ||
    (revisionNumber === 1 ? baseRevisionId !== null : baseRevisionId === null) ||
    !revisionKind ||
    (revisionKind === "authored" && baseRevisionId === null) ||
    revision.derivationVersion !== PROJECT_SHOT_PLAN_SCHEMA_VERSION ||
    !title ||
    changeSummary === INVALID_OUTPUT ||
    (revisionKind === "generated" && changeSummary !== null) ||
    !contentHash ||
    !source ||
    !workflow ||
    !createdBy ||
    !createdAt
  ) {
    return null;
  }
  return {
    revisionId: id,
    projectId,
    revisionNumber,
    baseRevisionId,
    revisionKind,
    derivationVersion: PROJECT_SHOT_PLAN_SCHEMA_VERSION,
    title,
    state: workflow.state,
    stale: workflow.isStale,
    active: workflow.isActive,
    changeSummary,
    contentHash,
    scriptRevisionId: source.scriptRevisionId,
    scriptRevisionNumber: source.scriptRevisionNumber,
    scriptContentHash: source.scriptContentHash,
    productionPlanRevisionId: source.productionPlanRevisionId,
    productionPlanRevisionNumber: source.productionPlanRevisionNumber,
    productionPlanContentHash: source.productionPlanContentHash,
    productionPlanScriptBindingId: source.productionPlanScriptBindingId,
    createdBy,
    createdAt,
    submittedBy: workflow.submittedBy,
    submittedAt: workflow.submittedAt,
    submissionNote: workflow.submissionNote,
    decision: workflow.decision,
    decidedBy: workflow.decidedBy,
    decidedAt: workflow.decidedAt,
    decisionNote: workflow.decisionNote,
  };
}

function parseRevision(value: unknown): ProjectShotPlanRevisionMetadata | null {
  const revision = outputObject(value);
  return revision && hasExactOutputKeys(revision, REVISION_KEYS)
    ? parseRevisionFields(revision)
    : null;
}

function parseHead(value: unknown): ProjectShotPlanHeadRevision | null {
  const head = outputObject(value);
  if (!head || !hasExactOutputKeys(head, HEAD_KEYS)) return null;
  const metadata = parseRevisionFields(head);
  if (!metadata) return null;
  try {
    const content = parseProjectShotPlanContent(head.content);
    return content.title === metadata.title ? { ...metadata, content } : null;
  } catch {
    return null;
  }
}

function revisionMatchesSource(
  revision: ProjectShotPlanRevisionMetadata,
  source: ProjectShotPlanSource,
) {
  return revision.scriptRevisionId === source.scriptRevisionId &&
    revision.scriptRevisionNumber === source.scriptRevisionNumber &&
    revision.scriptContentHash === source.scriptContentHash &&
    revision.productionPlanRevisionId === source.productionPlanRevisionId &&
    revision.productionPlanRevisionNumber === source.productionPlanRevisionNumber &&
    revision.productionPlanContentHash === source.productionPlanContentHash &&
    revision.productionPlanScriptBindingId ===
      source.productionPlanScriptBindingId;
}

function sameRevision(
  left: ProjectShotPlanRevisionMetadata,
  right: ProjectShotPlanRevisionMetadata,
) {
  return left.revisionId === right.revisionId &&
    left.projectId === right.projectId &&
    left.revisionNumber === right.revisionNumber &&
    left.baseRevisionId === right.baseRevisionId &&
    left.revisionKind === right.revisionKind &&
    left.derivationVersion === right.derivationVersion &&
    left.title === right.title &&
    left.state === right.state &&
    left.stale === right.stale &&
    left.active === right.active &&
    left.changeSummary === right.changeSummary &&
    left.contentHash === right.contentHash &&
    left.scriptRevisionId === right.scriptRevisionId &&
    left.scriptRevisionNumber === right.scriptRevisionNumber &&
    left.scriptContentHash === right.scriptContentHash &&
    left.productionPlanRevisionId === right.productionPlanRevisionId &&
    left.productionPlanRevisionNumber === right.productionPlanRevisionNumber &&
    left.productionPlanContentHash === right.productionPlanContentHash &&
    left.productionPlanScriptBindingId ===
      right.productionPlanScriptBindingId &&
    left.createdBy === right.createdBy &&
    left.createdAt === right.createdAt &&
    left.submittedBy === right.submittedBy &&
    left.submittedAt === right.submittedAt &&
    left.submissionNote === right.submissionNote &&
    left.decision === right.decision &&
    left.decidedBy === right.decidedBy &&
    left.decidedAt === right.decidedAt &&
    left.decisionNote === right.decisionNote;
}

export function parseProjectShotPlanSnapshot(
  value: unknown,
): ProjectShotPlanSnapshot | null {
  const snapshot = outputObject(value);
  if (
    !snapshot ||
    !hasExactOutputKeys(snapshot, [
      "projectId",
      "authorityVersion",
      "eventHeadHash",
      "source",
      "head",
      "revisions",
      "permissions",
    ]) ||
    !Array.isArray(snapshot.revisions)
  ) {
    return null;
  }
  const projectId = outputUuid(snapshot.projectId);
  const authorityVersion = outputInteger(snapshot.authorityVersion, 0);
  const eventHeadHash = outputHash(snapshot.eventHeadHash);
  const source = snapshot.source === null ? null : parseSource(snapshot.source);
  const head = snapshot.head === null ? null : parseHead(snapshot.head);
  const permissions = outputObject(snapshot.permissions);
  if (
    !projectId ||
    authorityVersion === null ||
    !eventHeadHash ||
    (snapshot.source !== null && !source) ||
    (snapshot.head !== null && !head) ||
    !permissions ||
    !hasExactOutputKeys(permissions, [
      "canGenerate",
      "canRevise",
      "canSubmit",
      "canDecide",
    ]) ||
    typeof permissions.canGenerate !== "boolean" ||
    typeof permissions.canRevise !== "boolean" ||
    typeof permissions.canSubmit !== "boolean" ||
    typeof permissions.canDecide !== "boolean"
  ) {
    return null;
  }
  const revisions: ProjectShotPlanRevisionMetadata[] = [];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const rawRevision of snapshot.revisions) {
    const revision = parseRevision(rawRevision);
    const previous = revisions.at(-1);
    if (
      !revision ||
      revision.projectId !== projectId ||
      ids.has(revision.revisionId) ||
      numbers.has(revision.revisionNumber) ||
      (previous !== undefined &&
        previous.revisionNumber <= revision.revisionNumber)
    ) {
      return null;
    }
    ids.add(revision.revisionId);
    numbers.add(revision.revisionNumber);
    revisions.push(revision);
  }
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = revisions[index];
    const nextOlderRevision = revisions[index + 1] ?? null;
    if (
      revision.revisionNumber !== revisions.length - index ||
      revision.baseRevisionId !== nextOlderRevision?.revisionId &&
        !(nextOlderRevision === null && revision.baseRevisionId === null)
    ) {
      return null;
    }
  }
  if (
    (head === null) !== (revisions.length === 0) ||
    (head !== null &&
      (head.projectId !== projectId || !sameRevision(head, revisions[0]))) ||
    (permissions.canGenerate && source === null) ||
    (permissions.canGenerate &&
      source !== null &&
      revisions.some(
        (revision) =>
          revision.revisionKind === "generated" &&
          revisionMatchesSource(revision, source),
      )) ||
    (permissions.canRevise &&
      (!head || head.stale || head.state === "submitted")) ||
    (permissions.canSubmit &&
      (!head || head.stale || head.state !== "draft")) ||
    (permissions.canDecide &&
      (!head || head.stale || head.state !== "submitted"))
  ) {
    return null;
  }
  for (const revision of revisions) {
    const expectedStale = source === null || !revisionMatchesSource(revision, source);
    if (revision.stale !== expectedStale) return null;
  }
  const expectedActive = revisions.find(
    (revision) =>
      revision.state === "approved" && !revision.stale,
  );
  if (
    revisions.some(
      (revision) =>
        revision.active !==
        (revision.revisionId === expectedActive?.revisionId),
    )
  ) {
    return null;
  }
  return {
    projectId,
    authorityVersion,
    eventHeadHash,
    source,
    head,
    active: expectedActive ?? null,
    revisions,
    permissions: {
      canGenerate: permissions.canGenerate,
      canRevise: permissions.canRevise,
      canSubmit: permissions.canSubmit,
      canDecide: permissions.canDecide,
    },
  };
}

const REVISION_RECEIPT_KEYS = [
  "shotPlanRevisionId",
  "projectId",
  "revisionNumber",
  "baseRevisionId",
  "workflowState",
  "source",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;

export function parseProjectShotPlanRevisionReceipt(
  value: unknown,
): ProjectShotPlanRevisionReceipt | null {
  const receipt = outputObject(value);
  if (!receipt || !hasExactOutputKeys(receipt, REVISION_RECEIPT_KEYS)) {
    return null;
  }
  const shotPlanRevisionId = outputUuid(receipt.shotPlanRevisionId);
  const projectId = outputUuid(receipt.projectId);
  const revisionNumber = outputInteger(receipt.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(receipt.baseRevisionId);
  const source = parseSource(receipt.source);
  const authorityVersion = outputInteger(receipt.authorityVersion, 1);
  const requestId = outputUuid(receipt.requestId);
  return shotPlanRevisionId &&
    projectId &&
    revisionNumber !== null &&
    baseRevisionId !== INVALID_OUTPUT &&
    (revisionNumber === 1 ? baseRevisionId === null : baseRevisionId !== null) &&
    receipt.workflowState === "draft" &&
    source &&
    authorityVersion !== null &&
    requestId &&
    typeof receipt.replayed === "boolean"
    ? {
        shotPlanRevisionId,
        projectId,
        revisionNumber,
        baseRevisionId,
        workflowState: "draft",
        source,
        authorityVersion,
        requestId,
        replayed: receipt.replayed,
      }
    : null;
}

const TRANSITION_RECEIPT_KEYS = [
  "shotPlanRevisionId",
  "projectId",
  "revisionNumber",
  "workflowState",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;

function parseTransitionReceipt(
  value: unknown,
  expectedStates: readonly ProjectShotPlanTransitionReceipt["workflowState"][],
): ProjectShotPlanTransitionReceipt | null {
  const receipt = outputObject(value);
  if (!receipt || !hasExactOutputKeys(receipt, TRANSITION_RECEIPT_KEYS)) {
    return null;
  }
  const shotPlanRevisionId = outputUuid(receipt.shotPlanRevisionId);
  const projectId = outputUuid(receipt.projectId);
  const revisionNumber = outputInteger(receipt.revisionNumber, 1);
  const workflowState = typeof receipt.workflowState === "string" &&
    expectedStates.includes(
      receipt.workflowState as ProjectShotPlanTransitionReceipt["workflowState"],
    )
    ? (receipt.workflowState as ProjectShotPlanTransitionReceipt["workflowState"])
    : null;
  const authorityVersion = outputInteger(receipt.authorityVersion, 1);
  const requestId = outputUuid(receipt.requestId);
  return shotPlanRevisionId &&
    projectId &&
    revisionNumber !== null &&
    workflowState &&
    authorityVersion !== null &&
    requestId &&
    typeof receipt.replayed === "boolean"
    ? {
        shotPlanRevisionId,
        projectId,
        revisionNumber,
        workflowState,
        authorityVersion,
        requestId,
        replayed: receipt.replayed,
      }
    : null;
}

export const parseProjectShotPlanGenerateReceipt =
  parseProjectShotPlanRevisionReceipt;
export const parseProjectShotPlanAppendReceipt =
  parseProjectShotPlanRevisionReceipt;

export function parseProjectShotPlanSubmitReceipt(value: unknown) {
  return parseTransitionReceipt(value, ["submitted"]);
}

export function parseProjectShotPlanDecisionReceipt(value: unknown) {
  return parseTransitionReceipt(value, ["approved", "changes_requested"]);
}

export interface ProjectShotPlanPublicError {
  status: 403 | 404 | 409 | 422 | 503;
  error: string;
}

export function classifyProjectShotPlanDatabaseError(error: {
  code?: string;
  message?: string;
} | null): ProjectShotPlanPublicError {
  const code = error?.code?.toUpperCase() ?? "";
  const signal = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    code === "23505" ||
    code === "40001" ||
    signal.includes("idempotency_conflict") ||
    signal.includes("version_conflict") ||
    signal.includes("source_conflict") ||
    signal.includes("source_unavailable") ||
    signal.includes("stale") ||
    signal.includes("invalid_transition")
  ) {
    return {
      status: 409,
      error: "The shot plan or its approved sources changed elsewhere. Reload before trying again.",
    };
  }
  if (
    code === "42501" ||
    signal.includes("forbidden") ||
    signal.includes("permission denied")
  ) {
    return { status: 403, error: "Forbidden" };
  }
  if (
    code === "P0002" ||
    signal.includes("not_found") ||
    signal.includes("not found")
  ) {
    return { status: 404, error: "Project shot plan not found" };
  }
  if (
    code === "22023" ||
    code === "23514" ||
    signal.includes("invalid_project_shot_plan") ||
    signal.includes("project_shot_plan_invalid") ||
    signal.includes("invalid_shot_plan")
  ) {
    return { status: 422, error: "The project shot plan request is invalid" };
  }
  return {
    status: 503,
    error: "Project shot planning is temporarily unavailable",
  };
}

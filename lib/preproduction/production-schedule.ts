import {
  parseProjectShotPlanContent,
  type ProjectShotPlanContent,
} from "./shot-plan";

export const PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION =
  "cco.production-schedule.v1" as const;
export const PRODUCTION_SCHEDULE_SCHEMA_VERSION =
  PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION;
export const PROJECT_PRODUCTION_SCHEDULE_MAX_BYTES = 4 * 1024 * 1024;
export const PROJECT_PRODUCTION_SCHEDULE_CONTENT_MAX_BYTES =
  PROJECT_PRODUCTION_SCHEDULE_MAX_BYTES;
export const PROJECT_PRODUCTION_SCHEDULE_APPEND_MAX_BYTES =
  PROJECT_PRODUCTION_SCHEDULE_MAX_BYTES;
export const PROJECT_PRODUCTION_SCHEDULE_COMMAND_MAX_BYTES = 16 * 1024;
export const PROJECT_PRODUCTION_SCHEDULE_ACTION_MAX_BYTES =
  PROJECT_PRODUCTION_SCHEDULE_COMMAND_MAX_BYTES;
export const PROJECT_PRODUCTION_SCHEDULE_DAY_LIMIT = 366;
export const PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT = 10_000;
export const PROJECT_PRODUCTION_SCHEDULE_UNSCHEDULED_LIMIT =
  PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT;
export const PROJECT_PRODUCTION_SCHEDULE_TEXT_CHARACTER_LIMIT =
  PROJECT_PRODUCTION_SCHEDULE_MAX_BYTES;

export const PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS = [
  "shot",
  "setup",
  "meal",
  "company_move",
  "break",
  "note",
] as const;

export const PROJECT_PRODUCTION_SCHEDULE_STATES = [
  "draft",
  "submitted",
  "approved",
  "changes_requested",
] as const;

export const PROJECT_PRODUCTION_SCHEDULE_REVISION_KINDS = [
  "generated",
  "authored",
] as const;

export const PROJECT_PRODUCTION_SCHEDULE_DECISIONS = [
  "approved",
  "changes_requested",
] as const;

export type ProjectProductionScheduleItemKind =
  (typeof PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS)[number];
export type ProjectProductionScheduleState =
  (typeof PROJECT_PRODUCTION_SCHEDULE_STATES)[number];
export type ProjectProductionScheduleRevisionKind =
  (typeof PROJECT_PRODUCTION_SCHEDULE_REVISION_KINDS)[number];
export type ProjectProductionScheduleDecision =
  (typeof PROJECT_PRODUCTION_SCHEDULE_DECISIONS)[number];

export interface ProjectProductionScheduleItem {
  id: string;
  order: number;
  kind: ProjectProductionScheduleItemKind;
  sourceSceneId: string | null;
  sourceShotId: string | null;
  label: string | null;
  notes: string | null;
  startTime: string | null;
  plannedDurationMinutes: number | null;
}

export interface ProjectProductionScheduleDay {
  id: string;
  order: number;
  date: string | null;
  unitCallTime: string | null;
  notes: string | null;
  items: ProjectProductionScheduleItem[];
}

export interface ProjectProductionScheduleContent {
  schemaVersion: typeof PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION;
  title: string;
  timeZone: string | null;
  days: ProjectProductionScheduleDay[];
  unscheduled: ProjectProductionScheduleItem[];
}

export interface ProjectProductionScheduleSourceBinding {
  shotPlanRevisionId: string;
  shotPlanRevisionNumber: number;
  shotPlanContentHash: string;
  shotPlanApprovalBindingId: string;
}

export interface ProjectProductionScheduleSource
  extends ProjectProductionScheduleSourceBinding {
  shotPlanContent: ProjectShotPlanContent;
}

export interface ProjectProductionScheduleGenerateRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  expectedShotPlanRevisionId: string;
}

export interface ProjectProductionScheduleAppendRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  baseRevisionId: string;
  changeSummary: string | null;
  content: ProjectProductionScheduleContent;
}

export interface ProjectProductionScheduleSubmitRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  note: string | null;
}

export interface ProjectProductionScheduleDecisionRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  decision: ProjectProductionScheduleDecision;
  note: string | null;
}

export interface ProjectProductionScheduleWorkflow {
  state: ProjectProductionScheduleState;
  isStale: boolean;
  isActive: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  submissionNote: string | null;
  decision: ProjectProductionScheduleDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ProjectProductionScheduleRevisionMetadata {
  revisionId: string;
  projectId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  revisionKind: ProjectProductionScheduleRevisionKind;
  derivationVersion: typeof PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION;
  title: string;
  state: ProjectProductionScheduleState;
  stale: boolean;
  active: boolean;
  changeSummary: string | null;
  contentHash: string;
  shotPlanRevisionId: string;
  shotPlanRevisionNumber: number;
  shotPlanContentHash: string;
  shotPlanApprovalBindingId: string;
  createdBy: string;
  createdAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  submissionNote: string | null;
  decision: ProjectProductionScheduleDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ProjectProductionScheduleRevision
  extends ProjectProductionScheduleRevisionMetadata {
  content: ProjectProductionScheduleContent;
}

export type ProjectProductionScheduleHeadRevision =
  ProjectProductionScheduleRevision;

export interface ProjectProductionSchedulePermissions {
  canRead: boolean;
  canGenerate: boolean;
  canRevise: boolean;
  canSubmit: boolean;
  canDecide: boolean;
}

export interface ProjectProductionScheduleSnapshot {
  projectId: string;
  authorityVersion: number;
  eventHeadHash: string;
  source: ProjectProductionScheduleSource | null;
  head: ProjectProductionScheduleHeadRevision | null;
  active: ProjectProductionScheduleRevisionMetadata | null;
  revisions: ProjectProductionScheduleRevisionMetadata[];
  permissions: ProjectProductionSchedulePermissions;
}

export interface ProjectProductionScheduleRevisionReceipt {
  productionScheduleRevisionId: string;
  projectId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  workflowState: "draft";
  source: ProjectProductionScheduleSourceBinding;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export interface ProjectProductionScheduleTransitionReceipt {
  productionScheduleRevisionId: string;
  projectId: string;
  revisionNumber: number;
  workflowState: "submitted" | ProjectProductionScheduleDecision;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export type ProjectProductionScheduleGenerateReceipt =
  ProjectProductionScheduleRevisionReceipt;
export type ProjectProductionScheduleAppendReceipt =
  ProjectProductionScheduleRevisionReceipt;
export type ProjectProductionScheduleSubmitReceipt =
  ProjectProductionScheduleTransitionReceipt;
export type ProjectProductionScheduleDecisionReceipt =
  ProjectProductionScheduleTransitionReceipt;

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const UNSAFE_CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_EXPECTED_AUTHORITY_VERSION = 2_147_483_646;
const MAX_PLANNED_DURATION_MINUTES = 1_440;
const MAX_TITLE_CHARACTERS = 260;
const INVALID_OUTPUT = Symbol("invalid_project_production_schedule_output");

export class ProjectProductionScheduleValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "ProjectProductionScheduleValidationError";
    this.code = code;
    this.field = field;
  }
}

function fail(code: string, message: string, field?: string): never {
  throw new ProjectProductionScheduleValidationError(code, message, field);
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

export function normalizeProjectProductionScheduleUuid(
  value: unknown,
  field: string,
) {
  return uuid(value, field);
}

function stableId(value: unknown, field: string): string {
  const normalized = safeText(value, field, 80);
  if (!STABLE_ID_PATTERN.test(normalized)) {
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

function nullableIsoDate(value: unknown, field: string): string | null {
  if (value === null) return null;
  const normalized = safeText(value, field, 10);
  const match = ISO_DATE_PATTERN.exec(normalized);
  if (!match) fail("invalid_date", `${field} must be an ISO date`, field);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  if (year < 1 || day < 1 || day > daysInMonth) {
    fail("invalid_date", `${field} must be an ISO date`, field);
  }
  return normalized;
}

function nullableTime(value: unknown, field: string): string | null {
  if (value === null) return null;
  const normalized = safeText(value, field, 5);
  if (!TIME_PATTERN.test(normalized)) {
    fail("invalid_time", `${field} must use HH:mm`, field);
  }
  return normalized;
}

function nullableTimeZone(value: unknown, field: string): string | null {
  if (value === null) return null;
  const normalized = safeText(value, field, 128);
  if (normalized !== "UTC" && !normalized.includes("/")) {
    fail("invalid_time_zone", `${field} must be an IANA time zone`, field);
  }
  try {
    const canonical = new Intl.DateTimeFormat("en-US", {
      timeZone: normalized,
    }).resolvedOptions().timeZone;
    if (canonical !== "UTC" && !canonical.includes("/")) {
      fail("invalid_time_zone", `${field} must be an IANA time zone`, field);
    }
    return canonical;
  } catch {
    fail("invalid_time_zone", `${field} must be an IANA time zone`, field);
  }
}

interface ContentCounters {
  items: number;
  textCharacters: number;
}

function parseItem(
  value: unknown,
  field: string,
  expectedOrder: number,
  itemIds: Set<string>,
  sourceShotIds: Set<string>,
  counters: ContentCounters,
): ProjectProductionScheduleItem {
  const item = inputObject(value, field);
  assertExactKeys(item, field, [
    "id",
    "order",
    "kind",
    "sourceSceneId",
    "sourceShotId",
    "label",
    "notes",
    "startTime",
    "plannedDurationMinutes",
  ]);
  const id = stableId(item.id, `${field}.id`);
  if (itemIds.has(id)) {
    fail("duplicate_id", `${field}.id must be globally unique`, `${field}.id`);
  }
  itemIds.add(id);
  const order = integer(item.order, `${field}.order`, 1, PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT);
  if (order !== expectedOrder) {
    fail(
      "invalid_order",
      `${field}.order must match its array position`,
      `${field}.order`,
    );
  }
  const kind = enumValue(
    item.kind,
    `${field}.kind`,
    PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS,
  );
  const sourceSceneId = item.sourceSceneId === null
    ? null
    : stableId(item.sourceSceneId, `${field}.sourceSceneId`);
  const sourceShotId = item.sourceShotId === null
    ? null
    : stableId(item.sourceShotId, `${field}.sourceShotId`);
  const label = nullableText(item.label, `${field}.label`, 1_000);
  if (kind === "shot") {
    if (sourceSceneId === null || sourceShotId === null || label !== null) {
      fail(
        "invalid_shot_item",
        `${field} shot items require source IDs and a null label`,
        field,
      );
    }
    if (sourceShotIds.has(sourceShotId)) {
      fail(
        "duplicate_source_shot",
        `${field}.sourceShotId must be globally unique`,
        `${field}.sourceShotId`,
      );
    }
    sourceShotIds.add(sourceShotId);
  } else if (
    sourceSceneId !== null ||
    sourceShotId !== null ||
    label === null
  ) {
    fail(
      "invalid_non_shot_item",
      `${field} non-shot items require null source IDs and a nonempty label`,
      field,
    );
  }
  const notes = nullableText(item.notes, `${field}.notes`, 20_000);
  counters.items += 1;
  if (counters.items > PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT) {
    fail(
      "too_many_items",
      `content may contain no more than ${PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT} items`,
      field,
    );
  }
  counters.textCharacters += textLength(label) + textLength(notes);
  return {
    id,
    order,
    kind,
    sourceSceneId,
    sourceShotId,
    label,
    notes,
    startTime: nullableTime(item.startTime, `${field}.startTime`),
    plannedDurationMinutes: nullableInteger(
      item.plannedDurationMinutes,
      `${field}.plannedDurationMinutes`,
      1,
      MAX_PLANNED_DURATION_MINUTES,
    ),
  };
}

function parseDay(
  value: unknown,
  index: number,
  dayIds: Set<string>,
  itemIds: Set<string>,
  sourceShotIds: Set<string>,
  counters: ContentCounters,
): ProjectProductionScheduleDay {
  const field = `content.days[${index}]`;
  const day = inputObject(value, field);
  assertExactKeys(day, field, [
    "id",
    "order",
    "date",
    "unitCallTime",
    "notes",
    "items",
  ]);
  if (
    !Array.isArray(day.items) ||
    day.items.length > PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT
  ) {
    fail(
      "invalid_items",
      `${field}.items must be an array with no more than ${PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT} items`,
      `${field}.items`,
    );
  }
  const id = stableId(day.id, `${field}.id`);
  if (dayIds.has(id)) {
    fail("duplicate_id", `${field}.id must be unique`, `${field}.id`);
  }
  dayIds.add(id);
  const order = integer(
    day.order,
    `${field}.order`,
    1,
    PROJECT_PRODUCTION_SCHEDULE_DAY_LIMIT,
  );
  if (order !== index + 1) {
    fail(
      "invalid_order",
      `${field}.order must match its array position`,
      `${field}.order`,
    );
  }
  const notes = nullableText(day.notes, `${field}.notes`, 20_000);
  counters.textCharacters += textLength(notes);
  return {
    id,
    order,
    date: nullableIsoDate(day.date, `${field}.date`),
    unitCallTime: nullableTime(day.unitCallTime, `${field}.unitCallTime`),
    notes,
    items: day.items.map((item, itemIndex) =>
      parseItem(
        item,
        `${field}.items[${itemIndex}]`,
        itemIndex + 1,
        itemIds,
        sourceShotIds,
        counters,
      ),
    ),
  };
}

export function parseProjectProductionScheduleContent(
  value: unknown,
): ProjectProductionScheduleContent {
  if (
    jsonByteLength(value, "content") >
    PROJECT_PRODUCTION_SCHEDULE_CONTENT_MAX_BYTES
  ) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_PRODUCTION_SCHEDULE_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }
  const content = inputObject(value, "content");
  assertExactKeys(content, "content", [
    "schemaVersion",
    "title",
    "timeZone",
    "days",
    "unscheduled",
  ]);
  if (content.schemaVersion !== PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION) {
    fail(
      "invalid_schema_version",
      `content.schemaVersion must be ${PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION}`,
      "content.schemaVersion",
    );
  }
  if (
    !Array.isArray(content.days) ||
    content.days.length > PROJECT_PRODUCTION_SCHEDULE_DAY_LIMIT
  ) {
    fail(
      "invalid_days",
      `content.days must be an array with no more than ${PROJECT_PRODUCTION_SCHEDULE_DAY_LIMIT} days`,
      "content.days",
    );
  }
  if (
    !Array.isArray(content.unscheduled) ||
    content.unscheduled.length > PROJECT_PRODUCTION_SCHEDULE_UNSCHEDULED_LIMIT
  ) {
    fail(
      "invalid_unscheduled",
      `content.unscheduled must be an array with no more than ${PROJECT_PRODUCTION_SCHEDULE_UNSCHEDULED_LIMIT} items`,
      "content.unscheduled",
    );
  }
  const title = safeText(content.title, "content.title", MAX_TITLE_CHARACTERS);
  const counters: ContentCounters = {
    items: 0,
    textCharacters: textLength(title),
  };
  const dayIds = new Set<string>();
  const itemIds = new Set<string>();
  const sourceShotIds = new Set<string>();
  const days = content.days.map((day, index) =>
    parseDay(day, index, dayIds, itemIds, sourceShotIds, counters),
  );
  const unscheduled = content.unscheduled.map((item, index) =>
    parseItem(
      item,
      `content.unscheduled[${index}]`,
      index + 1,
      itemIds,
      sourceShotIds,
      counters,
    ),
  );
  if (
    counters.textCharacters >
    PROJECT_PRODUCTION_SCHEDULE_TEXT_CHARACTER_LIMIT
  ) {
    fail(
      "too_much_text",
      `content may contain no more than ${PROJECT_PRODUCTION_SCHEDULE_TEXT_CHARACTER_LIMIT} text characters`,
      "content",
    );
  }
  const normalized: ProjectProductionScheduleContent = {
    schemaVersion: PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
    title,
    timeZone: nullableTimeZone(content.timeZone, "content.timeZone"),
    days,
    unscheduled,
  };
  if (
    jsonbByteLength(normalized) > PROJECT_PRODUCTION_SCHEDULE_CONTENT_MAX_BYTES
  ) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_PRODUCTION_SCHEDULE_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }
  return normalized;
}

export const normalizeProjectProductionScheduleContent =
  parseProjectProductionScheduleContent;

export function deriveProjectProductionScheduleContent(
  shotPlanContent: ProjectShotPlanContent,
): ProjectProductionScheduleContent {
  const parsedShotPlan = parseProjectShotPlanContent(shotPlanContent);
  let itemNumber = 0;
  return parseProjectProductionScheduleContent({
    schemaVersion: PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
    title: `${parsedShotPlan.title} production schedule`,
    timeZone: null,
    days: [],
    unscheduled: parsedShotPlan.scenes.flatMap((scene) =>
      scene.shots.map((shot) => {
        itemNumber += 1;
        return {
          id: shot.id,
          order: itemNumber,
          kind: "shot" as const,
          sourceSceneId: scene.id,
          sourceShotId: shot.id,
          label: null,
          notes: null,
          startTime: null,
          plannedDurationMinutes: null,
        };
      }),
    ),
  });
}

export const deriveProjectProductionSchedule =
  deriveProjectProductionScheduleContent;

export function isProjectProductionScheduleSubmittable(
  content: ProjectProductionScheduleContent,
): boolean {
  let parsed: ProjectProductionScheduleContent;
  try {
    parsed = parseProjectProductionScheduleContent(content);
  } catch {
    return false;
  }
  const seenDates = new Set<string>();
  return parsed.timeZone !== null &&
    parsed.days.length > 0 &&
    parsed.unscheduled.length === 0 &&
    parsed.days.every(
      (day) => {
        if (
          day.date === null ||
          day.unitCallTime === null ||
          seenDates.has(day.date)
        ) {
          return false;
        }
        seenDates.add(day.date);
        return day.items.every(
          (item) =>
            item.startTime !== null &&
            item.plannedDurationMinutes !== null,
        );
      },
    );
}

export function parseProjectProductionScheduleGenerateRequest(
  value: unknown,
): ProjectProductionScheduleGenerateRequest {
  const request = inputObject(value, "request");
  assertExactKeys(request, "request", [
    "requestId",
    "expectedAuthorityVersion",
    "expectedShotPlanRevisionId",
  ]);
  return {
    requestId: uuid(request.requestId, "request.requestId"),
    expectedAuthorityVersion: integer(
      request.expectedAuthorityVersion,
      "request.expectedAuthorityVersion",
      0,
      MAX_EXPECTED_AUTHORITY_VERSION,
    ),
    expectedShotPlanRevisionId: uuid(
      request.expectedShotPlanRevisionId,
      "request.expectedShotPlanRevisionId",
    ),
  };
}

export function parseProjectProductionScheduleAppendRequest(
  value: unknown,
): ProjectProductionScheduleAppendRequest {
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
    content: parseProjectProductionScheduleContent(request.content),
  };
}

export function parseProjectProductionScheduleSubmitRequest(
  value: unknown,
): ProjectProductionScheduleSubmitRequest {
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

export function parseProjectProductionScheduleDecisionRequest(
  value: unknown,
): ProjectProductionScheduleDecisionRequest {
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
    PROJECT_PRODUCTION_SCHEDULE_DECISIONS,
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

export const parseGenerateProjectProductionScheduleRevisionRequest =
  parseProjectProductionScheduleGenerateRequest;
export const parseAppendProjectProductionScheduleRevisionRequest =
  parseProjectProductionScheduleAppendRequest;
export const parseSubmitProjectProductionScheduleRevisionRequest =
  parseProjectProductionScheduleSubmitRequest;
export const parseDecideProjectProductionScheduleRevisionRequest =
  parseProjectProductionScheduleDecisionRequest;

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

function outputNullableUuid(
  value: unknown,
): string | null | typeof INVALID_OUTPUT {
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

const SOURCE_BINDING_KEYS = [
  "shotPlanRevisionId",
  "shotPlanRevisionNumber",
  "shotPlanContentHash",
  "shotPlanApprovalBindingId",
] as const;

const SOURCE_KEYS = [...SOURCE_BINDING_KEYS, "shotPlanContent"] as const;

function parseSourceBinding(
  value: unknown,
): ProjectProductionScheduleSourceBinding | null {
  const source = outputObject(value);
  if (!source || !hasExactOutputKeys(source, SOURCE_BINDING_KEYS)) return null;
  const shotPlanRevisionId = outputUuid(source.shotPlanRevisionId);
  const shotPlanRevisionNumber = outputInteger(source.shotPlanRevisionNumber, 1);
  const shotPlanContentHash = outputHash(source.shotPlanContentHash);
  const shotPlanApprovalBindingId = outputUuid(source.shotPlanApprovalBindingId);
  return shotPlanRevisionId &&
    shotPlanRevisionNumber !== null &&
    shotPlanContentHash &&
    shotPlanApprovalBindingId
    ? {
        shotPlanRevisionId,
        shotPlanRevisionNumber,
        shotPlanContentHash,
        shotPlanApprovalBindingId,
      }
    : null;
}

function parseSource(value: unknown): ProjectProductionScheduleSource | null {
  const source = outputObject(value);
  if (!source || !hasExactOutputKeys(source, SOURCE_KEYS)) return null;
  const binding = parseSourceBinding(
    Object.fromEntries(
      SOURCE_BINDING_KEYS.map((key) => [key, source[key]]),
    ),
  );
  if (!binding) return null;
  try {
    return {
      ...binding,
      shotPlanContent: parseProjectShotPlanContent(source.shotPlanContent),
    };
  } catch {
    return null;
  }
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

function parseWorkflow(value: unknown): ProjectProductionScheduleWorkflow | null {
  const workflow = outputObject(value);
  if (!workflow || !hasExactOutputKeys(workflow, WORKFLOW_KEYS)) return null;
  const state = typeof workflow.state === "string" &&
      (PROJECT_PRODUCTION_SCHEDULE_STATES as readonly string[]).includes(
        workflow.state,
      )
    ? (workflow.state as ProjectProductionScheduleState)
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
        (PROJECT_PRODUCTION_SCHEDULE_DECISIONS as readonly string[]).includes(
          workflow.decision,
        )
      ? (workflow.decision as ProjectProductionScheduleDecision)
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
): ProjectProductionScheduleRevisionMetadata | null {
  const id = outputUuid(revision.id);
  const projectId = outputUuid(revision.projectId);
  const revisionNumber = outputInteger(revision.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(revision.baseRevisionId);
  const revisionKind = typeof revision.revisionKind === "string" &&
      (PROJECT_PRODUCTION_SCHEDULE_REVISION_KINDS as readonly string[]).includes(
        revision.revisionKind,
      )
    ? (revision.revisionKind as ProjectProductionScheduleRevisionKind)
    : null;
  const title = outputBoundedText(revision.title, MAX_TITLE_CHARACTERS);
  const changeSummary = outputNullableBoundedText(
    revision.changeSummary,
    4_000,
  );
  const contentHash = outputHash(revision.contentHash);
  const source = parseSourceBinding(revision.source);
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
    revision.derivationVersion !==
      PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION ||
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
    derivationVersion: PROJECT_PRODUCTION_SCHEDULE_SCHEMA_VERSION,
    title,
    state: workflow.state,
    stale: workflow.isStale,
    active: workflow.isActive,
    changeSummary,
    contentHash,
    shotPlanRevisionId: source.shotPlanRevisionId,
    shotPlanRevisionNumber: source.shotPlanRevisionNumber,
    shotPlanContentHash: source.shotPlanContentHash,
    shotPlanApprovalBindingId: source.shotPlanApprovalBindingId,
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

function parseRevision(
  value: unknown,
): ProjectProductionScheduleRevisionMetadata | null {
  const revision = outputObject(value);
  return revision && hasExactOutputKeys(revision, REVISION_KEYS)
    ? parseRevisionFields(revision)
    : null;
}

function parseHead(
  value: unknown,
): ProjectProductionScheduleHeadRevision | null {
  const head = outputObject(value);
  if (!head || !hasExactOutputKeys(head, HEAD_KEYS)) return null;
  const metadata = parseRevisionFields(head);
  if (!metadata) return null;
  try {
    const content = parseProjectProductionScheduleContent(head.content);
    return content.title === metadata.title ? { ...metadata, content } : null;
  } catch {
    return null;
  }
}

function revisionMatchesSource(
  revision: ProjectProductionScheduleRevisionMetadata,
  source: ProjectProductionScheduleSourceBinding,
) {
  return revision.shotPlanRevisionId === source.shotPlanRevisionId &&
    revision.shotPlanRevisionNumber === source.shotPlanRevisionNumber &&
    revision.shotPlanContentHash === source.shotPlanContentHash &&
    revision.shotPlanApprovalBindingId === source.shotPlanApprovalBindingId;
}

function sameRevision(
  left: ProjectProductionScheduleRevisionMetadata,
  right: ProjectProductionScheduleRevisionMetadata,
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
    left.shotPlanRevisionId === right.shotPlanRevisionId &&
    left.shotPlanRevisionNumber === right.shotPlanRevisionNumber &&
    left.shotPlanContentHash === right.shotPlanContentHash &&
    left.shotPlanApprovalBindingId === right.shotPlanApprovalBindingId &&
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

function contentUsesOnlySourceShots(
  content: ProjectProductionScheduleContent,
  source: ProjectProductionScheduleSource,
) {
  const sourceShots = new Map<string, string>();
  for (const scene of source.shotPlanContent.scenes) {
    for (const shot of scene.shots) sourceShots.set(shot.id, scene.id);
  }
  const items = [
    ...content.days.flatMap((day) => day.items),
    ...content.unscheduled,
  ].filter((item) => item.kind === "shot");
  return items.length === sourceShots.size && items.every(
    (item) =>
      sourceShots.get(item.sourceShotId as string) === item.sourceSceneId,
  );
}

export function parseProjectProductionScheduleSnapshot(
  value: unknown,
): ProjectProductionScheduleSnapshot | null {
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
    !Array.isArray(snapshot.revisions) ||
    snapshot.revisions.length > PROJECT_PRODUCTION_SCHEDULE_ITEM_LIMIT
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
      "canRead",
      "canGenerate",
      "canRevise",
      "canSubmit",
      "canDecide",
    ]) ||
    typeof permissions.canRead !== "boolean" ||
    typeof permissions.canGenerate !== "boolean" ||
    typeof permissions.canRevise !== "boolean" ||
    typeof permissions.canSubmit !== "boolean" ||
    typeof permissions.canDecide !== "boolean"
  ) {
    return null;
  }
  const revisions: ProjectProductionScheduleRevisionMetadata[] = [];
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
      (revision.baseRevisionId !== nextOlderRevision?.revisionId &&
        !(nextOlderRevision === null && revision.baseRevisionId === null))
    ) {
      return null;
    }
  }
  if (
    (head === null) !== (revisions.length === 0) ||
    (head !== null &&
      (head.projectId !== projectId || !sameRevision(head, revisions[0]))) ||
    !permissions.canRead ||
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
      (!head ||
        head.stale ||
        head.state !== "draft" ||
        !isProjectProductionScheduleSubmittable(head.content))) ||
    (permissions.canDecide &&
      (!head || head.stale || head.state !== "submitted")) ||
    (head !== null &&
      source !== null &&
      revisionMatchesSource(head, source) &&
      !contentUsesOnlySourceShots(head.content, source))
  ) {
    return null;
  }
  for (const revision of revisions) {
    const expectedStale = source === null || !revisionMatchesSource(revision, source);
    if (revision.stale !== expectedStale) return null;
  }
  const expectedActive = revisions.find(
    (revision) => revision.state === "approved" && !revision.stale,
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
      canRead: permissions.canRead,
      canGenerate: permissions.canGenerate,
      canRevise: permissions.canRevise,
      canSubmit: permissions.canSubmit,
      canDecide: permissions.canDecide,
    },
  };
}

const REVISION_RECEIPT_KEYS = [
  "productionScheduleRevisionId",
  "projectId",
  "revisionNumber",
  "baseRevisionId",
  "workflowState",
  "source",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;

export function parseProjectProductionScheduleRevisionReceipt(
  value: unknown,
): ProjectProductionScheduleRevisionReceipt | null {
  const receipt = outputObject(value);
  if (!receipt || !hasExactOutputKeys(receipt, REVISION_RECEIPT_KEYS)) {
    return null;
  }
  const productionScheduleRevisionId = outputUuid(
    receipt.productionScheduleRevisionId,
  );
  const projectId = outputUuid(receipt.projectId);
  const revisionNumber = outputInteger(receipt.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(receipt.baseRevisionId);
  const source = parseSourceBinding(receipt.source);
  const authorityVersion = outputInteger(receipt.authorityVersion, 1);
  const requestId = outputUuid(receipt.requestId);
  return productionScheduleRevisionId &&
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
        productionScheduleRevisionId,
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
  "productionScheduleRevisionId",
  "projectId",
  "revisionNumber",
  "workflowState",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;

function parseTransitionReceipt(
  value: unknown,
  expectedStates: readonly ProjectProductionScheduleTransitionReceipt["workflowState"][],
): ProjectProductionScheduleTransitionReceipt | null {
  const receipt = outputObject(value);
  if (!receipt || !hasExactOutputKeys(receipt, TRANSITION_RECEIPT_KEYS)) {
    return null;
  }
  const productionScheduleRevisionId = outputUuid(
    receipt.productionScheduleRevisionId,
  );
  const projectId = outputUuid(receipt.projectId);
  const revisionNumber = outputInteger(receipt.revisionNumber, 1);
  const workflowState = typeof receipt.workflowState === "string" &&
      expectedStates.includes(
        receipt.workflowState as ProjectProductionScheduleTransitionReceipt["workflowState"],
      )
    ? (receipt.workflowState as ProjectProductionScheduleTransitionReceipt["workflowState"])
    : null;
  const authorityVersion = outputInteger(receipt.authorityVersion, 1);
  const requestId = outputUuid(receipt.requestId);
  return productionScheduleRevisionId &&
    projectId &&
    revisionNumber !== null &&
    workflowState &&
    authorityVersion !== null &&
    requestId &&
    typeof receipt.replayed === "boolean"
    ? {
        productionScheduleRevisionId,
        projectId,
        revisionNumber,
        workflowState,
        authorityVersion,
        requestId,
        replayed: receipt.replayed,
      }
    : null;
}

export const parseProjectProductionScheduleGenerateReceipt =
  parseProjectProductionScheduleRevisionReceipt;
export const parseProjectProductionScheduleAppendReceipt =
  parseProjectProductionScheduleRevisionReceipt;

export function parseProjectProductionScheduleSubmitReceipt(value: unknown) {
  return parseTransitionReceipt(value, ["submitted"]);
}

export function parseProjectProductionScheduleDecisionReceipt(value: unknown) {
  return parseTransitionReceipt(value, ["approved", "changes_requested"]);
}

export interface ProjectProductionSchedulePublicError {
  status: 403 | 404 | 409 | 422 | 503;
  error: string;
}

export function classifyProjectProductionScheduleDatabaseError(error: {
  code?: string;
  message?: string;
} | null): ProjectProductionSchedulePublicError {
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
      error:
        "The production schedule or its approved shot plan changed elsewhere. Reload before trying again.",
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
    return { status: 404, error: "Project production schedule not found" };
  }
  if (
    code === "22023" ||
    code === "23514" ||
    signal.includes("invalid_project_production_schedule") ||
    signal.includes("project_production_schedule_invalid") ||
    signal.includes("invalid_production_schedule")
  ) {
    return {
      status: 422,
      error: "The project production schedule request is invalid",
    };
  }
  return {
    status: 503,
    error: "Project production scheduling is temporarily unavailable",
  };
}

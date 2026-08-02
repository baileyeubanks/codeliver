import {
  parseProjectProductionScheduleContent,
  PROJECT_PRODUCTION_SCHEDULE_ITEM_KINDS,
  type ProjectProductionScheduleContent,
  type ProjectProductionScheduleDay,
  type ProjectProductionScheduleItemKind,
} from "./production-schedule";

export const PROJECT_CALL_SHEET_SCHEMA_VERSION = "cco.call-sheet.v1" as const;
export const CALL_SHEET_SCHEMA_VERSION = PROJECT_CALL_SHEET_SCHEMA_VERSION;
export const PROJECT_CALL_SHEET_MAX_BYTES = 4 * 1024 * 1024;
export const PROJECT_CALL_SHEET_CONTENT_MAX_BYTES = PROJECT_CALL_SHEET_MAX_BYTES;
export const PROJECT_CALL_SHEET_APPEND_MAX_BYTES = PROJECT_CALL_SHEET_MAX_BYTES;
export const PROJECT_CALL_SHEET_COMMAND_MAX_BYTES = 16 * 1024;
export const PROJECT_CALL_SHEET_ACTION_MAX_BYTES =
  PROJECT_CALL_SHEET_COMMAND_MAX_BYTES;
export const PROJECT_CALL_SHEET_CONTACT_LIMIT = 1_000;
export const PROJECT_CALL_SHEET_SECTION_LIMIT = 1_000;
export const PROJECT_CALL_SHEET_AGENDA_LIMIT = 10_000;
export const PROJECT_CALL_SHEET_REVISION_LIMIT = 10_000;
export const PROJECT_CALL_SHEET_TEXT_CHARACTER_LIMIT =
  PROJECT_CALL_SHEET_MAX_BYTES;

export const PROJECT_CALL_SHEET_SECTION_KINDS = [
  "safety",
  "weather",
  "transport",
  "meal",
  "equipment",
  "note",
] as const;

export const PROJECT_CALL_SHEET_STATES = [
  "draft",
  "submitted",
  "approved",
  "changes_requested",
] as const;

export const PROJECT_CALL_SHEET_REVISION_KINDS = [
  "generated",
  "authored",
] as const;

export const PROJECT_CALL_SHEET_DECISIONS = [
  "approved",
  "changes_requested",
] as const;

export type ProjectCallSheetSectionKind =
  (typeof PROJECT_CALL_SHEET_SECTION_KINDS)[number];
export type ProjectCallSheetAgendaKind = ProjectProductionScheduleItemKind;
export type ProjectCallSheetState =
  (typeof PROJECT_CALL_SHEET_STATES)[number];
export type ProjectCallSheetRevisionKind =
  (typeof PROJECT_CALL_SHEET_REVISION_KINDS)[number];
export type ProjectCallSheetDecision =
  (typeof PROJECT_CALL_SHEET_DECISIONS)[number];

export interface ProjectCallSheetLocation {
  name: string | null;
  address: string | null;
  parkingNotes: string | null;
  accessNotes: string | null;
  contactName: string | null;
  contactPhone: string | null;
}

export interface ProjectCallSheetContact {
  id: string;
  order: number;
  name: string;
  role: string;
  department: string | null;
  email: string | null;
  phone: string | null;
  callTime: string | null;
  notes: string | null;
}

export interface ProjectCallSheetSection {
  id: string;
  order: number;
  kind: ProjectCallSheetSectionKind;
  title: string;
  body: string;
}

export interface ProjectCallSheetAgendaItem {
  scheduleItemId: string;
  order: number;
  kind: ProjectCallSheetAgendaKind;
  sourceSceneId: string | null;
  sourceShotId: string | null;
  label: string;
  startTime: string;
  plannedDurationMinutes: number;
}

export interface ProjectCallSheetContent {
  schemaVersion: typeof PROJECT_CALL_SHEET_SCHEMA_VERSION;
  title: string;
  scheduleDayId: string;
  shootDate: string;
  timeZone: string;
  unitCallTime: string;
  location: ProjectCallSheetLocation;
  contacts: ProjectCallSheetContact[];
  sections: ProjectCallSheetSection[];
  agenda: ProjectCallSheetAgendaItem[];
  generalNotes: string | null;
}

export interface ProjectCallSheetSourceBinding {
  productionScheduleRevisionId: string;
  productionScheduleRevisionNumber: number;
  productionScheduleContentHash: string;
  productionScheduleApprovalBindingId: string;
  scheduleDayId: string;
}

export interface ProjectCallSheetSource extends ProjectCallSheetSourceBinding {
  productionScheduleContent: ProjectProductionScheduleContent;
}

export interface ProjectCallSheetGenerateRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  expectedProductionScheduleRevisionId: string;
  scheduleDayId: string;
}

export interface ProjectCallSheetAppendRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  baseRevisionId: string;
  changeSummary: string | null;
  content: ProjectCallSheetContent;
}

export interface ProjectCallSheetSubmitRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  note: string | null;
}

export interface ProjectCallSheetDecisionRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  decision: ProjectCallSheetDecision;
  note: string | null;
}

export interface ProjectCallSheetWorkflow {
  state: ProjectCallSheetState;
  isStale: boolean;
  isActive: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  submissionNote: string | null;
  decision: ProjectCallSheetDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ProjectCallSheetRevisionMetadata {
  revisionId: string;
  projectId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  revisionKind: ProjectCallSheetRevisionKind;
  derivationVersion: typeof PROJECT_CALL_SHEET_SCHEMA_VERSION;
  title: string;
  state: ProjectCallSheetState;
  stale: boolean;
  active: boolean;
  changeSummary: string | null;
  contentHash: string;
  productionScheduleRevisionId: string;
  productionScheduleRevisionNumber: number;
  productionScheduleContentHash: string;
  productionScheduleApprovalBindingId: string;
  scheduleDayId: string;
  createdBy: string;
  createdAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  submissionNote: string | null;
  decision: ProjectCallSheetDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ProjectCallSheetRevision
  extends ProjectCallSheetRevisionMetadata {
  content: ProjectCallSheetContent;
}

export type ProjectCallSheetHeadRevision = ProjectCallSheetRevision;

export interface ProjectCallSheetPermissions {
  canRead: boolean;
  canGenerate: boolean;
  canRevise: boolean;
  canSubmit: boolean;
  canDecide: boolean;
}

export interface ProjectCallSheetSnapshot {
  projectId: string;
  authorityVersion: number;
  eventHeadHash: string;
  source: ProjectCallSheetSource | null;
  selectedScheduleDayId: string | null;
  head: ProjectCallSheetHeadRevision | null;
  active: ProjectCallSheetRevisionMetadata | null;
  revisions: ProjectCallSheetRevisionMetadata[];
  permissions: ProjectCallSheetPermissions;
}

export interface ProjectCallSheetRevisionReceipt {
  callSheetRevisionId: string;
  projectId: string;
  scheduleDayId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  workflowState: "draft";
  source: ProjectCallSheetSourceBinding;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export interface ProjectCallSheetTransitionReceipt {
  callSheetRevisionId: string;
  projectId: string;
  scheduleDayId: string;
  revisionNumber: number;
  workflowState: "submitted" | ProjectCallSheetDecision;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export type ProjectCallSheetGenerateReceipt = ProjectCallSheetRevisionReceipt;
export type ProjectCallSheetAppendReceipt = ProjectCallSheetRevisionReceipt;
export type ProjectCallSheetSubmitReceipt = ProjectCallSheetTransitionReceipt;
export type ProjectCallSheetDecisionReceipt = ProjectCallSheetTransitionReceipt;

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNSAFE_CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_EXPECTED_AUTHORITY_VERSION = 2_147_483_646;
const MAX_PLANNED_DURATION_MINUTES = 1_440;
const MAX_TITLE_CHARACTERS = 500;
const INVALID_OUTPUT = Symbol("invalid_project_call_sheet_output");

export class ProjectCallSheetValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "ProjectCallSheetValidationError";
    this.code = code;
    this.field = field;
  }
}

function fail(code: string, message: string, field?: string): never {
  throw new ProjectCallSheetValidationError(code, message, field);
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

function safeSingleLineText(
  value: unknown,
  field: string,
  maximumCharacters: number,
) {
  const normalized = safeText(value, field, maximumCharacters);
  if (normalized.includes("\n")) {
    fail("invalid_string", `${field} must be a single line`, field);
  }
  return normalized;
}

function nullableSingleLineText(
  value: unknown,
  field: string,
  maximumCharacters: number,
) {
  const normalized = nullableText(value, field, maximumCharacters);
  if (normalized?.includes("\n")) {
    fail("invalid_string", `${field} must be a single line`, field);
  }
  return normalized;
}

function nullableEmail(value: unknown, field: string): string | null {
  const normalized = nullableSingleLineText(value, field, 254);
  if (normalized !== null && !EMAIL_PATTERN.test(normalized)) {
    fail("invalid_email", `${field} must be a valid email address`, field);
  }
  return normalized;
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

export function normalizeProjectCallSheetUuid(value: unknown, field: string) {
  return uuid(value, field);
}

function stableId(value: unknown, field: string): string {
  const normalized = safeText(value, field, 80);
  if (!STABLE_ID_PATTERN.test(normalized)) {
    fail("invalid_stable_id", `${field} must be a stable ID`, field);
  }
  return normalized;
}

export function normalizeProjectCallSheetScheduleDayId(
  value: unknown,
  field = "scheduleDayId",
) {
  return stableId(value, field);
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

function canonicalJsonText(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonText).join(",")}]`;
  }
  return `{${Object.entries(value as JsonObject)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, child]) => `${JSON.stringify(key)}:${canonicalJsonText(child)}`,
    )
    .join(",")}}`;
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
  const daysInMonth =
    month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;
  if (year < 1 || day < 1 || day > daysInMonth) {
    fail("invalid_date", `${field} must be an ISO date`, field);
  }
  return normalized;
}

function isoDate(value: unknown, field: string): string {
  const parsed = nullableIsoDate(value, field);
  if (parsed === null) fail("invalid_date", `${field} must be an ISO date`, field);
  return parsed;
}

function nullableTime(value: unknown, field: string): string | null {
  if (value === null) return null;
  const normalized = safeText(value, field, 5);
  if (!TIME_PATTERN.test(normalized)) {
    fail("invalid_time", `${field} must use HH:mm`, field);
  }
  return normalized;
}

function time(value: unknown, field: string): string {
  const parsed = nullableTime(value, field);
  if (parsed === null) fail("invalid_time", `${field} must use HH:mm`, field);
  return parsed;
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

function timeZone(value: unknown, field: string): string {
  const parsed = nullableTimeZone(value, field);
  if (parsed === null) {
    fail("invalid_time_zone", `${field} must be an IANA time zone`, field);
  }
  return parsed;
}

interface ContentCounters {
  contacts: number;
  sections: number;
  agendaItems: number;
  textCharacters: number;
}

function parseLocation(
  value: unknown,
  counters: ContentCounters,
): ProjectCallSheetLocation {
  const field = "content.location";
  const location = inputObject(value, field);
  assertExactKeys(location, field, [
    "name",
    "address",
    "parkingNotes",
    "accessNotes",
    "contactName",
    "contactPhone",
  ]);
  const parsed: ProjectCallSheetLocation = {
    name: nullableSingleLineText(location.name, `${field}.name`, 500),
    address: nullableText(location.address, `${field}.address`, 2_000),
    parkingNotes: nullableText(
      location.parkingNotes,
      `${field}.parkingNotes`,
      10_000,
    ),
    accessNotes: nullableText(
      location.accessNotes,
      `${field}.accessNotes`,
      10_000,
    ),
    contactName: nullableSingleLineText(
      location.contactName,
      `${field}.contactName`,
      240,
    ),
    contactPhone: nullableSingleLineText(
      location.contactPhone,
      `${field}.contactPhone`,
      100,
    ),
  };
  counters.textCharacters += Object.values(parsed).reduce(
    (total, child) => total + textLength(child),
    0,
  );
  return parsed;
}

function parseContact(
  value: unknown,
  index: number,
  ids: Set<string>,
  counters: ContentCounters,
): ProjectCallSheetContact {
  const field = `content.contacts[${index}]`;
  const contact = inputObject(value, field);
  assertExactKeys(contact, field, [
    "id",
    "order",
    "name",
    "role",
    "department",
    "email",
    "phone",
    "callTime",
    "notes",
  ]);
  const id = stableId(contact.id, `${field}.id`);
  if (ids.has(id)) {
    fail("duplicate_id", `${field}.id must be unique`, `${field}.id`);
  }
  ids.add(id);
  const order = integer(
    contact.order,
    `${field}.order`,
    1,
    PROJECT_CALL_SHEET_CONTACT_LIMIT,
  );
  if (order !== index + 1) {
    fail(
      "invalid_order",
      `${field}.order must match its array position`,
      `${field}.order`,
    );
  }
  const parsed: ProjectCallSheetContact = {
    id,
    order,
    name: safeSingleLineText(contact.name, `${field}.name`, 240),
    role: safeSingleLineText(contact.role, `${field}.role`, 160),
    department: nullableSingleLineText(
      contact.department,
      `${field}.department`,
      160,
    ),
    email: nullableEmail(contact.email, `${field}.email`),
    phone: nullableSingleLineText(contact.phone, `${field}.phone`, 100),
    callTime: nullableTime(contact.callTime, `${field}.callTime`),
    notes: nullableText(contact.notes, `${field}.notes`, 4_000),
  };
  counters.contacts += 1;
  counters.textCharacters +=
    textLength(parsed.name) +
    textLength(parsed.role) +
    textLength(parsed.department) +
    textLength(parsed.email) +
    textLength(parsed.phone) +
    textLength(parsed.notes);
  return parsed;
}

function parseSection(
  value: unknown,
  index: number,
  ids: Set<string>,
  counters: ContentCounters,
): ProjectCallSheetSection {
  const field = `content.sections[${index}]`;
  const section = inputObject(value, field);
  assertExactKeys(section, field, ["id", "order", "kind", "title", "body"]);
  const id = stableId(section.id, `${field}.id`);
  if (ids.has(id)) {
    fail("duplicate_id", `${field}.id must be unique`, `${field}.id`);
  }
  ids.add(id);
  const order = integer(
    section.order,
    `${field}.order`,
    1,
    PROJECT_CALL_SHEET_SECTION_LIMIT,
  );
  if (order !== index + 1) {
    fail(
      "invalid_order",
      `${field}.order must match its array position`,
      `${field}.order`,
    );
  }
  const parsed: ProjectCallSheetSection = {
    id,
    order,
    kind: enumValue(
      section.kind,
      `${field}.kind`,
      PROJECT_CALL_SHEET_SECTION_KINDS,
    ),
    title: safeSingleLineText(section.title, `${field}.title`, 500),
    body: safeText(section.body, `${field}.body`, 20_000),
  };
  counters.sections += 1;
  counters.textCharacters += textLength(parsed.title) + textLength(parsed.body);
  return parsed;
}

function parseAgendaItem(
  value: unknown,
  index: number,
  scheduleItemIds: Set<string>,
  counters: ContentCounters,
): ProjectCallSheetAgendaItem {
  const field = `content.agenda[${index}]`;
  const item = inputObject(value, field);
  assertExactKeys(item, field, [
    "scheduleItemId",
    "order",
    "kind",
    "sourceSceneId",
    "sourceShotId",
    "label",
    "startTime",
    "plannedDurationMinutes",
  ]);
  const scheduleItemId = stableId(
    item.scheduleItemId,
    `${field}.scheduleItemId`,
  );
  if (scheduleItemIds.has(scheduleItemId)) {
    fail(
      "duplicate_schedule_item",
      `${field}.scheduleItemId must be unique`,
      `${field}.scheduleItemId`,
    );
  }
  scheduleItemIds.add(scheduleItemId);
  const order = integer(
    item.order,
    `${field}.order`,
    1,
    PROJECT_CALL_SHEET_AGENDA_LIMIT,
  );
  if (order !== index + 1) {
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
  const sourceSceneId =
    item.sourceSceneId === null
      ? null
      : stableId(item.sourceSceneId, `${field}.sourceSceneId`);
  const sourceShotId =
    item.sourceShotId === null
      ? null
      : stableId(item.sourceShotId, `${field}.sourceShotId`);
  const label = safeSingleLineText(item.label, `${field}.label`, 1_000);
  if (kind === "shot") {
    if (sourceSceneId === null || sourceShotId === null) {
      fail(
        "invalid_shot_item",
        `${field} shot items require source IDs`,
        field,
      );
    }
  } else if (sourceSceneId !== null || sourceShotId !== null) {
    fail(
      "invalid_non_shot_item",
      `${field} non-shot items require null source IDs`,
      field,
    );
  }
  counters.agendaItems += 1;
  counters.textCharacters += textLength(label);
  return {
    scheduleItemId,
    order,
    kind,
    sourceSceneId,
    sourceShotId,
    label,
    startTime: time(item.startTime, `${field}.startTime`),
    plannedDurationMinutes: integer(
      item.plannedDurationMinutes,
      `${field}.plannedDurationMinutes`,
      1,
      MAX_PLANNED_DURATION_MINUTES,
    ),
  };
}

export function parseProjectCallSheetContent(
  value: unknown,
): ProjectCallSheetContent {
  if (
    jsonByteLength(value, "content") > PROJECT_CALL_SHEET_CONTENT_MAX_BYTES
  ) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_CALL_SHEET_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }
  const content = inputObject(value, "content");
  assertExactKeys(content, "content", [
    "schemaVersion",
    "title",
    "scheduleDayId",
    "shootDate",
    "timeZone",
    "unitCallTime",
    "location",
    "contacts",
    "sections",
    "agenda",
    "generalNotes",
  ]);
  if (content.schemaVersion !== PROJECT_CALL_SHEET_SCHEMA_VERSION) {
    fail(
      "invalid_schema_version",
      `content.schemaVersion must be ${PROJECT_CALL_SHEET_SCHEMA_VERSION}`,
      "content.schemaVersion",
    );
  }
  if (
    !Array.isArray(content.contacts) ||
    content.contacts.length > PROJECT_CALL_SHEET_CONTACT_LIMIT
  ) {
    fail(
      "invalid_contacts",
      `content.contacts must be an array with no more than ${PROJECT_CALL_SHEET_CONTACT_LIMIT} contacts`,
      "content.contacts",
    );
  }
  if (
    !Array.isArray(content.sections) ||
    content.sections.length > PROJECT_CALL_SHEET_SECTION_LIMIT
  ) {
    fail(
      "invalid_sections",
      `content.sections must be an array with no more than ${PROJECT_CALL_SHEET_SECTION_LIMIT} sections`,
      "content.sections",
    );
  }
  if (
    !Array.isArray(content.agenda) ||
    content.agenda.length > PROJECT_CALL_SHEET_AGENDA_LIMIT
  ) {
    fail(
      "invalid_agenda",
      `content.agenda must be an array with no more than ${PROJECT_CALL_SHEET_AGENDA_LIMIT} items`,
      "content.agenda",
    );
  }
  const title = safeSingleLineText(
    content.title,
    "content.title",
    MAX_TITLE_CHARACTERS,
  );
  const counters: ContentCounters = {
    contacts: 0,
    sections: 0,
    agendaItems: 0,
    textCharacters: textLength(title),
  };
  const contactIds = new Set<string>();
  const sectionIds = new Set<string>();
  const scheduleItemIds = new Set<string>();
  const location = parseLocation(content.location, counters);
  const contacts = content.contacts.map((contact, index) =>
    parseContact(contact, index, contactIds, counters),
  );
  const sections = content.sections.map((section, index) =>
    parseSection(section, index, sectionIds, counters),
  );
  const agenda = content.agenda.map((item, index) =>
    parseAgendaItem(
      item,
      index,
      scheduleItemIds,
      counters,
    ),
  );
  const generalNotes = nullableText(
    content.generalNotes,
    "content.generalNotes",
    20_000,
  );
  counters.textCharacters += textLength(generalNotes);
  if (
    counters.contacts > PROJECT_CALL_SHEET_CONTACT_LIMIT ||
    counters.sections > PROJECT_CALL_SHEET_SECTION_LIMIT ||
    counters.agendaItems > PROJECT_CALL_SHEET_AGENDA_LIMIT ||
    counters.textCharacters > PROJECT_CALL_SHEET_TEXT_CHARACTER_LIMIT
  ) {
    fail(
      "content_limit_exceeded",
      "content exceeds the governed call-sheet limits",
      "content",
    );
  }
  const normalized: ProjectCallSheetContent = {
    schemaVersion: PROJECT_CALL_SHEET_SCHEMA_VERSION,
    title,
    scheduleDayId: stableId(content.scheduleDayId, "content.scheduleDayId"),
    shootDate: isoDate(content.shootDate, "content.shootDate"),
    timeZone: timeZone(content.timeZone, "content.timeZone"),
    unitCallTime: time(content.unitCallTime, "content.unitCallTime"),
    location,
    contacts,
    sections,
    agenda,
    generalNotes,
  };
  if (jsonbByteLength(normalized) > PROJECT_CALL_SHEET_CONTENT_MAX_BYTES) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_CALL_SHEET_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }
  return normalized;
}

export const normalizeProjectCallSheetContent = parseProjectCallSheetContent;

function selectedScheduleDay(
  content: ProjectProductionScheduleContent,
  scheduleDayId: string,
): ProjectProductionScheduleDay {
  const day = content.days.find((candidate) => candidate.id === scheduleDayId);
  if (!day) {
    fail(
      "schedule_day_not_found",
      "scheduleDayId must identify a day in the production schedule",
      "scheduleDayId",
    );
  }
  return day;
}

export function deriveProjectCallSheetContent(
  productionScheduleContent: ProjectProductionScheduleContent,
  scheduleDayId: string,
): ProjectCallSheetContent {
  const schedule = parseProjectProductionScheduleContent(
    productionScheduleContent,
  );
  const normalizedDayId = stableId(scheduleDayId, "scheduleDayId");
  const day = selectedScheduleDay(schedule, normalizedDayId);
  return parseProjectCallSheetContent({
    schemaVersion: PROJECT_CALL_SHEET_SCHEMA_VERSION,
    title: `${schedule.title} - ${day.date ?? "unscheduled"}`,
    scheduleDayId: day.id,
    shootDate: day.date,
    timeZone: schedule.timeZone,
    unitCallTime: day.unitCallTime,
    location: {
      name: null,
      address: null,
      parkingNotes: null,
      accessNotes: null,
      contactName: null,
      contactPhone: null,
    },
    contacts: [],
    sections: [],
    agenda: day.items.map((item) => ({
      scheduleItemId: item.id,
      order: item.order,
      kind: item.kind,
      sourceSceneId: item.sourceSceneId,
      sourceShotId: item.sourceShotId,
      label:
        item.kind === "shot"
          ? `Shot ${item.sourceShotId as string}`
          : (item.label as string),
      startTime: item.startTime,
      plannedDurationMinutes: item.plannedDurationMinutes,
    })),
    generalNotes: day.notes,
  });
}

export const deriveProjectCallSheet = deriveProjectCallSheetContent;

export function isProjectCallSheetSubmittable(
  content: ProjectCallSheetContent,
): boolean {
  let parsed: ProjectCallSheetContent;
  try {
    parsed = parseProjectCallSheetContent(content);
  } catch {
    return false;
  }
  return (
    parsed.location.name !== null &&
    parsed.location.address !== null &&
    parsed.contacts.length > 0 &&
    parsed.contacts.every(
      (contact) =>
        contact.callTime !== null &&
        (contact.email !== null || contact.phone !== null),
    ) &&
    parsed.sections.some((section) => section.kind === "safety")
  );
}

export function parseProjectCallSheetGenerateRequest(
  value: unknown,
): ProjectCallSheetGenerateRequest {
  const request = inputObject(value, "request");
  assertExactKeys(request, "request", [
    "requestId",
    "expectedAuthorityVersion",
    "expectedProductionScheduleRevisionId",
    "scheduleDayId",
  ]);
  return {
    requestId: uuid(request.requestId, "request.requestId"),
    expectedAuthorityVersion: integer(
      request.expectedAuthorityVersion,
      "request.expectedAuthorityVersion",
      0,
      MAX_EXPECTED_AUTHORITY_VERSION,
    ),
    expectedProductionScheduleRevisionId: uuid(
      request.expectedProductionScheduleRevisionId,
      "request.expectedProductionScheduleRevisionId",
    ),
    scheduleDayId: stableId(request.scheduleDayId, "request.scheduleDayId"),
  };
}

export function parseProjectCallSheetAppendRequest(
  value: unknown,
): ProjectCallSheetAppendRequest {
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
    content: parseProjectCallSheetContent(request.content),
  };
}

export function parseProjectCallSheetSubmitRequest(
  value: unknown,
): ProjectCallSheetSubmitRequest {
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

export function parseProjectCallSheetDecisionRequest(
  value: unknown,
): ProjectCallSheetDecisionRequest {
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
    PROJECT_CALL_SHEET_DECISIONS,
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

export const parseGenerateProjectCallSheetRevisionRequest =
  parseProjectCallSheetGenerateRequest;
export const parseAppendProjectCallSheetRevisionRequest =
  parseProjectCallSheetAppendRequest;
export const parseSubmitProjectCallSheetRevisionRequest =
  parseProjectCallSheetSubmitRequest;
export const parseDecideProjectCallSheetRevisionRequest =
  parseProjectCallSheetDecisionRequest;

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
  return typeof value === "string" &&
      UUID_PATTERN.test(value) &&
      value === value.toLowerCase()
    ? value
    : null;
}

function outputStableId(value: unknown): string | null {
  return typeof value === "string" &&
      STABLE_ID_PATTERN.test(value) &&
      normalizeTextValue(value) === value
    ? value
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
  return value === null
    ? null
    : typeof value === "string" && value.length > 0
      ? value
      : INVALID_OUTPUT;
}

function outputTimestamp(value: unknown): string | null {
  return typeof value === "string" &&
      value.length > 0 &&
      Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function outputHash(value: unknown): string | null {
  return typeof value === "string" && SHA256_PATTERN.test(value) ? value : null;
}

const SOURCE_BINDING_KEYS = [
  "productionScheduleRevisionId",
  "productionScheduleRevisionNumber",
  "productionScheduleContentHash",
  "productionScheduleApprovalBindingId",
  "scheduleDayId",
] as const;

const DATABASE_SOURCE_BINDING_KEYS = [
  ...SOURCE_BINDING_KEYS,
  "scheduleDayContentHash",
] as const;

const SOURCE_KEYS = [...SOURCE_BINDING_KEYS, "productionScheduleContent"] as const;

const DATABASE_SOURCE_KEYS = [
  ...DATABASE_SOURCE_BINDING_KEYS,
  "productionScheduleContent",
  "scheduleDay",
] as const;

function parseSourceBinding(
  value: unknown,
): ProjectCallSheetSourceBinding | null {
  const source = outputObject(value);
  if (
    !source ||
    (!hasExactOutputKeys(source, SOURCE_BINDING_KEYS) &&
      !hasExactOutputKeys(source, DATABASE_SOURCE_BINDING_KEYS))
  ) {
    return null;
  }
  const productionScheduleRevisionId = outputUuid(
    source.productionScheduleRevisionId,
  );
  const productionScheduleRevisionNumber = outputInteger(
    source.productionScheduleRevisionNumber,
    1,
  );
  const productionScheduleContentHash = outputHash(
    source.productionScheduleContentHash,
  );
  const productionScheduleApprovalBindingId = outputUuid(
    source.productionScheduleApprovalBindingId,
  );
  const scheduleDayId = outputStableId(source.scheduleDayId);
  if (
    Object.prototype.hasOwnProperty.call(source, "scheduleDayContentHash") &&
    !outputHash(source.scheduleDayContentHash)
  ) {
    return null;
  }
  return productionScheduleRevisionId &&
      productionScheduleRevisionNumber !== null &&
      productionScheduleContentHash &&
      productionScheduleApprovalBindingId &&
      scheduleDayId
    ? {
        productionScheduleRevisionId,
        productionScheduleRevisionNumber,
        productionScheduleContentHash,
        productionScheduleApprovalBindingId,
        scheduleDayId,
      }
    : null;
}

function parseSource(value: unknown): ProjectCallSheetSource | null {
  const source = outputObject(value);
  if (
    !source ||
    (!hasExactOutputKeys(source, SOURCE_KEYS) &&
      !hasExactOutputKeys(source, DATABASE_SOURCE_KEYS))
  ) {
    return null;
  }
  const databaseShape = Object.prototype.hasOwnProperty.call(
    source,
    "scheduleDayContentHash",
  );
  const bindingKeys = databaseShape
    ? DATABASE_SOURCE_BINDING_KEYS
    : SOURCE_BINDING_KEYS;
  const binding = parseSourceBinding(
    Object.fromEntries(bindingKeys.map((key) => [key, source[key]])),
  );
  if (!binding) return null;
  try {
    const productionScheduleContent = parseProjectProductionScheduleContent(
      source.productionScheduleContent,
    );
    const day = productionScheduleContent.days.find(
      (candidate) => candidate.id === binding.scheduleDayId,
    );
    if (!day) {
      return null;
    }
    if (
      databaseShape &&
      (!source.scheduleDay ||
        typeof source.scheduleDay !== "object" ||
        Array.isArray(source.scheduleDay) ||
        canonicalJsonText(source.scheduleDay) !== canonicalJsonText(day))
    ) {
      return null;
    }
    return { ...binding, productionScheduleContent };
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

function parseWorkflow(value: unknown): ProjectCallSheetWorkflow | null {
  const workflow = outputObject(value);
  if (!workflow || !hasExactOutputKeys(workflow, WORKFLOW_KEYS)) return null;
  const state =
    typeof workflow.state === "string" &&
    (PROJECT_CALL_SHEET_STATES as readonly string[]).includes(workflow.state)
      ? (workflow.state as ProjectCallSheetState)
      : null;
  const submittedBy = outputNullableUuid(workflow.submittedBy);
  const submittedAt = outputNullableString(workflow.submittedAt);
  const submissionNote = outputNullableBoundedText(
    workflow.submissionNote,
    4_000,
  );
  const decision =
    workflow.decision === null
      ? null
      : typeof workflow.decision === "string" &&
          (PROJECT_CALL_SHEET_DECISIONS as readonly string[]).includes(
            workflow.decision,
          )
        ? (workflow.decision as ProjectCallSheetDecision)
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
  "scheduleDayId",
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
): ProjectCallSheetRevisionMetadata | null {
  const id = outputUuid(revision.id);
  const projectId = outputUuid(revision.projectId);
  const scheduleDayId = outputStableId(revision.scheduleDayId);
  const revisionNumber = outputInteger(revision.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(revision.baseRevisionId);
  const revisionKind =
    typeof revision.revisionKind === "string" &&
    (PROJECT_CALL_SHEET_REVISION_KINDS as readonly string[]).includes(
      revision.revisionKind,
    )
      ? (revision.revisionKind as ProjectCallSheetRevisionKind)
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
    !scheduleDayId ||
    revisionNumber === null ||
    baseRevisionId === INVALID_OUTPUT ||
    (revisionNumber === 1 ? baseRevisionId !== null : baseRevisionId === null) ||
    !revisionKind ||
    (revisionKind === "authored" && baseRevisionId === null) ||
    revision.derivationVersion !== PROJECT_CALL_SHEET_SCHEMA_VERSION ||
    !title ||
    changeSummary === INVALID_OUTPUT ||
    (revisionKind === "generated" && changeSummary !== null) ||
    !contentHash ||
    !source ||
    source.scheduleDayId !== scheduleDayId ||
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
    derivationVersion: PROJECT_CALL_SHEET_SCHEMA_VERSION,
    title,
    state: workflow.state,
    stale: workflow.isStale,
    active: workflow.isActive,
    changeSummary,
    contentHash,
    productionScheduleRevisionId: source.productionScheduleRevisionId,
    productionScheduleRevisionNumber: source.productionScheduleRevisionNumber,
    productionScheduleContentHash: source.productionScheduleContentHash,
    productionScheduleApprovalBindingId:
      source.productionScheduleApprovalBindingId,
    scheduleDayId,
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

function parseRevision(value: unknown): ProjectCallSheetRevisionMetadata | null {
  const revision = outputObject(value);
  return revision && hasExactOutputKeys(revision, REVISION_KEYS)
    ? parseRevisionFields(revision)
    : null;
}

function parseHead(value: unknown): ProjectCallSheetHeadRevision | null {
  const head = outputObject(value);
  if (!head || !hasExactOutputKeys(head, HEAD_KEYS)) return null;
  const metadata = parseRevisionFields(head);
  if (!metadata) return null;
  try {
    const content = parseProjectCallSheetContent(head.content);
    return content.title === metadata.title &&
        content.scheduleDayId === metadata.scheduleDayId
      ? { ...metadata, content }
      : null;
  } catch {
    return null;
  }
}

const PUBLIC_REVISION_KEYS = [
  "revisionId",
  "projectId",
  "revisionNumber",
  "baseRevisionId",
  "revisionKind",
  "derivationVersion",
  "title",
  "state",
  "stale",
  "active",
  "changeSummary",
  "contentHash",
  "productionScheduleRevisionId",
  "productionScheduleRevisionNumber",
  "productionScheduleContentHash",
  "productionScheduleApprovalBindingId",
  "scheduleDayId",
  "createdBy",
  "createdAt",
  "submittedBy",
  "submittedAt",
  "submissionNote",
  "decision",
  "decidedBy",
  "decidedAt",
  "decisionNote",
] as const;

const PUBLIC_HEAD_KEYS = [...PUBLIC_REVISION_KEYS, "content"] as const;

function parsePublicRevisionFields(
  revision: JsonObject,
): ProjectCallSheetRevisionMetadata | null {
  if (!hasExactOutputKeys(revision, PUBLIC_REVISION_KEYS)) return null;
  return parseRevisionFields({
    id: revision.revisionId,
    projectId: revision.projectId,
    scheduleDayId: revision.scheduleDayId,
    revisionNumber: revision.revisionNumber,
    baseRevisionId: revision.baseRevisionId,
    revisionKind: revision.revisionKind,
    derivationVersion: revision.derivationVersion,
    title: revision.title,
    changeSummary: revision.changeSummary,
    contentHash: revision.contentHash,
    source: {
      productionScheduleRevisionId: revision.productionScheduleRevisionId,
      productionScheduleRevisionNumber:
        revision.productionScheduleRevisionNumber,
      productionScheduleContentHash: revision.productionScheduleContentHash,
      productionScheduleApprovalBindingId:
        revision.productionScheduleApprovalBindingId,
      scheduleDayId: revision.scheduleDayId,
    },
    workflow: {
      state: revision.state,
      isStale: revision.stale,
      isActive: revision.active,
      submittedBy: revision.submittedBy,
      submittedAt: revision.submittedAt,
      submissionNote: revision.submissionNote,
      decision: revision.decision,
      decidedBy: revision.decidedBy,
      decidedAt: revision.decidedAt,
      decisionNote: revision.decisionNote,
    },
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
  });
}

function parsePublicRevision(
  value: unknown,
): ProjectCallSheetRevisionMetadata | null {
  const revision = outputObject(value);
  return revision ? parsePublicRevisionFields(revision) : null;
}

function parsePublicHead(value: unknown): ProjectCallSheetHeadRevision | null {
  const head = outputObject(value);
  if (!head || !hasExactOutputKeys(head, PUBLIC_HEAD_KEYS)) return null;
  const metadata = parsePublicRevisionFields(
    Object.fromEntries(PUBLIC_REVISION_KEYS.map((key) => [key, head[key]])),
  );
  if (!metadata) return null;
  try {
    const content = parseProjectCallSheetContent(head.content);
    return content.title === metadata.title &&
        content.scheduleDayId === metadata.scheduleDayId
      ? { ...metadata, content }
      : null;
  } catch {
    return null;
  }
}

function revisionMatchesSource(
  revision: ProjectCallSheetRevisionMetadata,
  source: ProjectCallSheetSourceBinding,
) {
  return (
    revision.productionScheduleRevisionId ===
      source.productionScheduleRevisionId &&
    revision.productionScheduleRevisionNumber ===
      source.productionScheduleRevisionNumber &&
    revision.productionScheduleContentHash ===
      source.productionScheduleContentHash &&
    revision.productionScheduleApprovalBindingId ===
      source.productionScheduleApprovalBindingId &&
    revision.scheduleDayId === source.scheduleDayId
  );
}

function sameRevision(
  left: ProjectCallSheetRevisionMetadata,
  right: ProjectCallSheetRevisionMetadata,
) {
  return (
    left.revisionId === right.revisionId &&
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
    left.productionScheduleRevisionId === right.productionScheduleRevisionId &&
    left.productionScheduleRevisionNumber ===
      right.productionScheduleRevisionNumber &&
    left.productionScheduleContentHash ===
      right.productionScheduleContentHash &&
    left.productionScheduleApprovalBindingId ===
      right.productionScheduleApprovalBindingId &&
    left.scheduleDayId === right.scheduleDayId &&
    left.createdBy === right.createdBy &&
    left.createdAt === right.createdAt &&
    left.submittedBy === right.submittedBy &&
    left.submittedAt === right.submittedAt &&
    left.submissionNote === right.submissionNote &&
    left.decision === right.decision &&
    left.decidedBy === right.decidedBy &&
    left.decidedAt === right.decidedAt &&
    left.decisionNote === right.decisionNote
  );
}

function agendaMatchesDay(
  agenda: readonly ProjectCallSheetAgendaItem[],
  day: ProjectProductionScheduleDay,
) {
  return (
    agenda.length === day.items.length &&
    agenda.every((item, index) => {
      const source = day.items[index];
      return (
        item.scheduleItemId === source.id &&
        item.order === source.order &&
        item.kind === source.kind &&
        item.sourceSceneId === source.sourceSceneId &&
        item.sourceShotId === source.sourceShotId &&
        item.startTime === source.startTime &&
        item.plannedDurationMinutes === source.plannedDurationMinutes
      );
    })
  );
}

function contentMatchesSource(
  content: ProjectCallSheetContent,
  source: ProjectCallSheetSource,
) {
  const day = source.productionScheduleContent.days.find(
    (candidate) => candidate.id === source.scheduleDayId,
  );
  return (
    day !== undefined &&
    content.scheduleDayId === source.scheduleDayId &&
    content.shootDate === day.date &&
    content.timeZone === source.productionScheduleContent.timeZone &&
    content.unitCallTime === day.unitCallTime &&
    agendaMatchesDay(content.agenda, day)
  );
}

export function parseProjectCallSheetSnapshot(
  value: unknown,
): ProjectCallSheetSnapshot | null {
  const snapshot = outputObject(value);
  const rawSnapshotKeys = [
    "projectId",
    "authorityVersion",
    "eventHeadHash",
    "source",
    "selectedScheduleDayId",
    "head",
    "revisions",
    "permissions",
  ] as const;
  const publicSnapshotKeys = [...rawSnapshotKeys, "active"] as const;
  const isRawSnapshot = snapshot
    ? hasExactOutputKeys(snapshot, rawSnapshotKeys)
    : false;
  const isPublicSnapshot = snapshot
    ? hasExactOutputKeys(snapshot, publicSnapshotKeys)
    : false;
  if (
    !snapshot ||
    (!isRawSnapshot && !isPublicSnapshot) ||
    !Array.isArray(snapshot.revisions) ||
    snapshot.revisions.length > PROJECT_CALL_SHEET_REVISION_LIMIT
  ) {
    return null;
  }
  const projectId = outputUuid(snapshot.projectId);
  const authorityVersion = outputInteger(snapshot.authorityVersion, 0);
  const eventHeadHash = outputHash(snapshot.eventHeadHash);
  const source = snapshot.source === null ? null : parseSource(snapshot.source);
  const selectedScheduleDayId =
    snapshot.selectedScheduleDayId === null
      ? null
      : outputStableId(snapshot.selectedScheduleDayId);
  const head = snapshot.head === null
    ? null
    : isPublicSnapshot
      ? parsePublicHead(snapshot.head)
      : parseHead(snapshot.head);
  const declaredActive = !isPublicSnapshot || snapshot.active === null
    ? null
    : parsePublicRevision(snapshot.active);
  const permissions = outputObject(snapshot.permissions);
  if (
    !projectId ||
    authorityVersion === null ||
    !eventHeadHash ||
    (snapshot.source !== null && !source) ||
    (snapshot.selectedScheduleDayId !== null && !selectedScheduleDayId) ||
    (source !== null && source.scheduleDayId !== selectedScheduleDayId) ||
    (snapshot.head !== null && !head) ||
    (isPublicSnapshot && snapshot.active !== null && !declaredActive) ||
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
  const revisions: ProjectCallSheetRevisionMetadata[] = [];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const rawRevision of snapshot.revisions) {
    const revision = isPublicSnapshot
      ? parsePublicRevision(rawRevision)
      : parseRevision(rawRevision);
    const previous = revisions.at(-1);
    if (
      !revision ||
      revision.projectId !== projectId ||
      revision.scheduleDayId !== selectedScheduleDayId ||
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
      (head.projectId !== projectId ||
        head.scheduleDayId !== selectedScheduleDayId ||
        !sameRevision(head, revisions[0]))) ||
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
        !isProjectCallSheetSubmittable(head.content))) ||
    (permissions.canDecide &&
      (!head || head.stale || head.state !== "submitted")) ||
    (head !== null &&
      source !== null &&
      revisionMatchesSource(head, source) &&
      !contentMatchesSource(head.content, source))
  ) {
    return null;
  }
  for (const revision of revisions) {
    const expectedStale =
      source === null || !revisionMatchesSource(revision, source);
    if (revision.stale !== expectedStale) return null;
  }
  const expectedActive = revisions.find(
    (revision) => revision.state === "approved" && !revision.stale,
  );
  if (
    (isPublicSnapshot &&
      ((declaredActive === null) !== (expectedActive === undefined) ||
        (declaredActive !== null &&
          expectedActive !== undefined &&
          !sameRevision(declaredActive, expectedActive)))) ||
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
    selectedScheduleDayId,
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
  "callSheetRevisionId",
  "projectId",
  "scheduleDayId",
  "revisionNumber",
  "baseRevisionId",
  "workflowState",
  "source",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;

export function parseProjectCallSheetRevisionReceipt(
  value: unknown,
): ProjectCallSheetRevisionReceipt | null {
  const receipt = outputObject(value);
  if (!receipt || !hasExactOutputKeys(receipt, REVISION_RECEIPT_KEYS)) {
    return null;
  }
  const callSheetRevisionId = outputUuid(receipt.callSheetRevisionId);
  const projectId = outputUuid(receipt.projectId);
  const scheduleDayId = outputStableId(receipt.scheduleDayId);
  const revisionNumber = outputInteger(receipt.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(receipt.baseRevisionId);
  const source = parseSourceBinding(receipt.source);
  const authorityVersion = outputInteger(receipt.authorityVersion, 1);
  const requestId = outputUuid(receipt.requestId);
  return callSheetRevisionId &&
      projectId &&
      scheduleDayId &&
      revisionNumber !== null &&
      baseRevisionId !== INVALID_OUTPUT &&
      (revisionNumber === 1
        ? baseRevisionId === null
        : baseRevisionId !== null) &&
      receipt.workflowState === "draft" &&
      source &&
      source.scheduleDayId === scheduleDayId &&
      authorityVersion !== null &&
      requestId &&
      typeof receipt.replayed === "boolean"
    ? {
        callSheetRevisionId,
        projectId,
        scheduleDayId,
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
  "callSheetRevisionId",
  "projectId",
  "scheduleDayId",
  "revisionNumber",
  "workflowState",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;

function parseTransitionReceipt(
  value: unknown,
  expectedStates: readonly ProjectCallSheetTransitionReceipt["workflowState"][],
): ProjectCallSheetTransitionReceipt | null {
  const receipt = outputObject(value);
  if (!receipt || !hasExactOutputKeys(receipt, TRANSITION_RECEIPT_KEYS)) {
    return null;
  }
  const callSheetRevisionId = outputUuid(receipt.callSheetRevisionId);
  const projectId = outputUuid(receipt.projectId);
  const scheduleDayId = outputStableId(receipt.scheduleDayId);
  const revisionNumber = outputInteger(receipt.revisionNumber, 1);
  const workflowState =
    typeof receipt.workflowState === "string" &&
    expectedStates.includes(
      receipt.workflowState as ProjectCallSheetTransitionReceipt["workflowState"],
    )
      ? (receipt.workflowState as ProjectCallSheetTransitionReceipt["workflowState"])
      : null;
  const authorityVersion = outputInteger(receipt.authorityVersion, 1);
  const requestId = outputUuid(receipt.requestId);
  return callSheetRevisionId &&
      projectId &&
      scheduleDayId &&
      revisionNumber !== null &&
      workflowState &&
      authorityVersion !== null &&
      requestId &&
      typeof receipt.replayed === "boolean"
    ? {
        callSheetRevisionId,
        projectId,
        scheduleDayId,
        revisionNumber,
        workflowState,
        authorityVersion,
        requestId,
        replayed: receipt.replayed,
      }
    : null;
}

export const parseProjectCallSheetGenerateReceipt =
  parseProjectCallSheetRevisionReceipt;
export const parseProjectCallSheetAppendReceipt =
  parseProjectCallSheetRevisionReceipt;

export function parseProjectCallSheetSubmitReceipt(value: unknown) {
  return parseTransitionReceipt(value, ["submitted"]);
}

export function parseProjectCallSheetDecisionReceipt(value: unknown) {
  return parseTransitionReceipt(value, ["approved", "changes_requested"]);
}

export interface ProjectCallSheetPublicError {
  status: 403 | 404 | 409 | 422 | 503;
  error: string;
}

export function classifyProjectCallSheetDatabaseError(error: {
  code?: string;
  message?: string;
} | null): ProjectCallSheetPublicError {
  const code = error?.code?.toUpperCase() ?? "";
  const signal = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    code === "23505" ||
    code === "40001" ||
    signal.includes("idempotency_conflict") ||
    signal.includes("version_conflict") ||
    signal.includes("source_conflict") ||
    signal.includes("source_unavailable") ||
    signal.includes("schedule_day_conflict") ||
    signal.includes("stale") ||
    signal.includes("invalid_transition")
  ) {
    return {
      status: 409,
      error:
        "The call sheet or its approved production schedule day changed elsewhere. Reload before trying again.",
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
    return { status: 404, error: "Project call sheet not found" };
  }
  if (
    code === "22023" ||
    code === "23514" ||
    signal.includes("invalid_project_call_sheet") ||
    signal.includes("project_call_sheet_invalid") ||
    signal.includes("invalid_call_sheet")
  ) {
    return { status: 422, error: "The project call sheet request is invalid" };
  }
  return {
    status: 503,
    error: "Project call sheets are temporarily unavailable",
  };
}

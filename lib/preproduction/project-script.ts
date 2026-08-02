export const PROJECT_SCRIPT_SCHEMA_VERSION = "cco.script-content.v1" as const;
export const PROJECT_SCRIPT_MAX_BYTES = 512 * 1024;
export const PROJECT_SCRIPT_CONTENT_MAX_BYTES = PROJECT_SCRIPT_MAX_BYTES;
export const PROJECT_SCRIPT_APPEND_MAX_BYTES = PROJECT_SCRIPT_MAX_BYTES;
export const PROJECT_SCRIPT_COMMAND_MAX_BYTES = 16 * 1024;
export const PROJECT_SCRIPT_ACTION_MAX_BYTES = PROJECT_SCRIPT_COMMAND_MAX_BYTES;
export const PROJECT_SCRIPT_SECTION_LIMIT = 200;
export const PROJECT_SCRIPT_BLOCK_LIMIT = 2_000;
export const PROJECT_SCRIPT_TEXT_CHARACTER_LIMIT = 200_000;

export const PROJECT_SCRIPT_FORMATS = [
  "commercial",
  "documentary",
  "interview",
  "voice_over",
  "screenplay",
  "outline",
] as const;

export const PROJECT_SCRIPT_BLOCK_KINDS = [
  "scene_heading",
  "visual",
  "action",
  "dialogue",
  "voice_over",
  "interview_question",
  "b_roll",
  "on_screen_text",
  "graphic",
  "music",
  "sfx",
  "transition",
  "note",
] as const;

export const PROJECT_SCRIPT_STATES = [
  "draft",
  "submitted",
  "approved",
  "changes_requested",
  "superseded",
] as const;

export const PROJECT_SCRIPT_DECISIONS = [
  "approved",
  "changes_requested",
] as const;

export const PROJECT_SCRIPT_SOURCE_KINDS = [
  "accepted_proposal",
  "manual",
] as const;

export type ProjectScriptFormat = (typeof PROJECT_SCRIPT_FORMATS)[number];
export type ProjectScriptBlockKind =
  (typeof PROJECT_SCRIPT_BLOCK_KINDS)[number];
export type ProjectScriptState = (typeof PROJECT_SCRIPT_STATES)[number];
export type ProjectScriptRevisionState = ProjectScriptState;
export type ProjectScriptDecision = (typeof PROJECT_SCRIPT_DECISIONS)[number];
export type ProjectScriptSourceKind =
  (typeof PROJECT_SCRIPT_SOURCE_KINDS)[number];

export interface ProjectScriptBlock {
  id: string;
  kind: ProjectScriptBlockKind;
  text: string;
  speaker: string | null;
  parenthetical: string | null;
}

export interface ProjectScriptSection {
  id: string;
  heading: string;
  summary: string | null;
  estimatedDurationSeconds: number | null;
  blocks: ProjectScriptBlock[];
}

export interface ProjectScriptContent {
  schemaVersion: typeof PROJECT_SCRIPT_SCHEMA_VERSION;
  title: string;
  logline: string | null;
  format: ProjectScriptFormat;
  estimatedRuntimeSeconds: number | null;
  sections: ProjectScriptSection[];
}

export interface ProjectScriptAppendRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  baseRevisionId: string | null;
  changeSummary: string | null;
  content: ProjectScriptContent;
}

export interface ProjectScriptSubmitRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  note: string | null;
}

export interface ProjectScriptDecisionRequest {
  requestId: string;
  expectedAuthorityVersion: number;
  revisionId: string;
  decision: ProjectScriptDecision;
  note: string | null;
}

export interface ProjectScriptRevisionMetadata {
  revisionId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  state: ProjectScriptState;
  changeSummary: string | null;
  contentHash: string;
  createdBy: string;
  createdAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ProjectScriptHeadRevision
  extends ProjectScriptRevisionMetadata {
  content: ProjectScriptContent;
}

export interface ProjectScriptPermissions {
  canRevise: boolean;
  canSubmit: boolean;
  canDecide: boolean;
}

export interface ProjectScriptSnapshot {
  projectId: string;
  authorityVersion: number;
  eventHeadHash: string;
  head: ProjectScriptHeadRevision | null;
  revisions: ProjectScriptRevisionMetadata[];
  permissions: ProjectScriptPermissions;
}

export interface ProjectScriptReceiptBase {
  projectId: string;
  revisionId: string;
  authorityVersion: number;
  requestId: string;
  replayed: boolean;
}

export interface ProjectScriptAppendReceipt extends ProjectScriptReceiptBase {
  revisionNumber: number;
}

export type ProjectScriptTransitionReceipt = ProjectScriptReceiptBase;

export type ProjectScriptSubmitReceipt = ProjectScriptTransitionReceipt;
export type ProjectScriptDecisionReceipt = ProjectScriptTransitionReceipt;
export type ProjectScriptRevisionReceipt = ProjectScriptAppendReceipt;
export type ProjectScriptReceipt = ProjectScriptTransitionReceipt;

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UNSAFE_CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const MAX_SAFE_DATABASE_INTEGER = 2_147_483_647;
const MAX_EXPECTED_AUTHORITY_VERSION = 2_147_483_646;
const MAX_SCRIPT_DURATION_SECONDS = 86_400;
const INVALID_OUTPUT = Symbol("invalid_project_script_output");

export class ProjectScriptValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "ProjectScriptValidationError";
    this.code = code;
    this.field = field;
  }
}

function fail(code: string, message: string, field?: string): never {
  throw new ProjectScriptValidationError(code, message, field);
}

function normalizeTextValue(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

function safeText(
  value: unknown,
  field: string,
  maximumCharacters = PROJECT_SCRIPT_TEXT_CHARACTER_LIMIT,
): string {
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
  maximumCharacters = PROJECT_SCRIPT_TEXT_CHARACTER_LIMIT,
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

function jsonObject(value: unknown, field: string): JsonObject {
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
  const normalized = safeText(value, field).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    fail("invalid_uuid", `${field} must be a UUID`, field);
  }
  return normalized;
}

export function normalizeProjectScriptUuid(
  value: unknown,
  field: string,
): string {
  return uuid(value, field);
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  return uuid(value, field);
}

function stableId(value: unknown, field: string): string {
  const normalized = safeText(value, field, 80).toLowerCase();
  if (!STABLE_ID_PATTERN.test(normalized)) {
    fail("invalid_stable_id", `${field} must be a stable ID`, field);
  }
  return normalized;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum = MAX_SAFE_DATABASE_INTEGER,
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
  if (value === null) return null;
  return integer(value, field, minimum, maximum);
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  const normalized = safeText(value, field);
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
  return Buffer.byteLength(serialized, "utf8");
}

function jsonbText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jsonbText).join(", ")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.entries(object)
    .map(([key, child]) => `${JSON.stringify(key)}: ${jsonbText(child)}`)
    .join(", ")}}`;
}

function jsonbByteLength(value: unknown): number {
  return Buffer.byteLength(jsonbText(value), "utf8");
}

function textCharacterCount(value: string | null): number {
  return value === null ? 0 : Array.from(value).length;
}

interface ParsedBlock {
  block: ProjectScriptBlock;
  textCharacters: number;
}

function parseBlock(value: unknown, field: string): ParsedBlock {
  const block = jsonObject(value, field);
  assertExactKeys(block, field, [
    "id",
    "kind",
    "text",
    "speaker",
    "parenthetical",
  ]);
  const text = safeText(block.text, `${field}.text`, 20_000);
  const speaker = nullableText(block.speaker, `${field}.speaker`, 240);
  const parenthetical = nullableText(
    block.parenthetical,
    `${field}.parenthetical`,
    1_000,
  );
  return {
    block: {
      id: stableId(block.id, `${field}.id`),
      kind: enumValue(
        block.kind,
        `${field}.kind`,
        PROJECT_SCRIPT_BLOCK_KINDS,
      ),
      text,
      speaker,
      parenthetical,
    },
    textCharacters:
      textCharacterCount(text) +
      textCharacterCount(speaker) +
      textCharacterCount(parenthetical),
  };
}

interface ParsedSection {
  section: ProjectScriptSection;
  textCharacters: number;
}

function parseSection(
  value: unknown,
  index: number,
  stableIds: Set<string>,
  blockCounter: { value: number },
): ParsedSection {
  const field = `content.sections[${index}]`;
  const section = jsonObject(value, field);
  assertExactKeys(section, field, [
    "id",
    "heading",
    "summary",
    "estimatedDurationSeconds",
    "blocks",
  ]);
  if (!Array.isArray(section.blocks)) {
    fail("invalid_blocks", `${field}.blocks must be an array`, `${field}.blocks`);
  }
  if (blockCounter.value + section.blocks.length > PROJECT_SCRIPT_BLOCK_LIMIT) {
    fail(
      "too_many_blocks",
      `content may contain no more than ${PROJECT_SCRIPT_BLOCK_LIMIT} blocks`,
      `${field}.blocks`,
    );
  }
  if (section.blocks.length < 1 || section.blocks.length > 200) {
    fail(
      "invalid_blocks",
      `${field}.blocks must contain between 1 and 200 blocks`,
      `${field}.blocks`,
    );
  }

  const sectionId = stableId(section.id, `${field}.id`);
  if (stableIds.has(sectionId)) {
    fail("duplicate_id", `${field}.id must be unique`, `${field}.id`);
  }
  stableIds.add(sectionId);

  const heading = safeText(section.heading, `${field}.heading`, 240);
  const summary = nullableText(section.summary, `${field}.summary`, 4_000);
  let textCharacters =
    textCharacterCount(heading) + textCharacterCount(summary);
  const blocks: ProjectScriptBlock[] = [];

  for (let blockIndex = 0; blockIndex < section.blocks.length; blockIndex += 1) {
    blockCounter.value += 1;
    if (blockCounter.value > PROJECT_SCRIPT_BLOCK_LIMIT) {
      fail(
        "too_many_blocks",
        `content may contain no more than ${PROJECT_SCRIPT_BLOCK_LIMIT} blocks`,
        `${field}.blocks`,
      );
    }
    const parsed = parseBlock(
      section.blocks[blockIndex],
      `${field}.blocks[${blockIndex}]`,
    );
    if (stableIds.has(parsed.block.id)) {
      fail(
        "duplicate_id",
        `${field}.blocks[${blockIndex}].id must be unique`,
        `${field}.blocks[${blockIndex}].id`,
      );
    }
    stableIds.add(parsed.block.id);
    blocks.push(parsed.block);
    textCharacters += parsed.textCharacters;
  }

  return {
    section: {
      id: sectionId,
      heading,
      summary,
      estimatedDurationSeconds: nullableInteger(
        section.estimatedDurationSeconds,
        `${field}.estimatedDurationSeconds`,
        1,
        MAX_SCRIPT_DURATION_SECONDS,
      ),
      blocks,
    },
    textCharacters,
  };
}

export function parseProjectScriptContent(value: unknown): ProjectScriptContent {
  if (jsonByteLength(value, "content") > PROJECT_SCRIPT_CONTENT_MAX_BYTES) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_SCRIPT_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }

  const content = jsonObject(value, "content");
  assertExactKeys(content, "content", [
    "schemaVersion",
    "title",
    "logline",
    "format",
    "estimatedRuntimeSeconds",
    "sections",
  ]);
  if (
    !Array.isArray(content.sections) ||
    content.sections.length < 1 ||
    content.sections.length > PROJECT_SCRIPT_SECTION_LIMIT
  ) {
    fail(
      "invalid_sections",
      `content.sections must contain between 1 and ${PROJECT_SCRIPT_SECTION_LIMIT} sections`,
      "content.sections",
    );
  }

  const schemaVersion = safeText(content.schemaVersion, "content.schemaVersion");
  if (schemaVersion !== PROJECT_SCRIPT_SCHEMA_VERSION) {
    fail(
      "invalid_schema_version",
      `content.schemaVersion must be ${PROJECT_SCRIPT_SCHEMA_VERSION}`,
      "content.schemaVersion",
    );
  }

  const title = safeText(content.title, "content.title", 240);
  const logline = nullableText(content.logline, "content.logline", 2_000);
  let textCharacters =
    textCharacterCount(title) + textCharacterCount(logline);
  const stableIds = new Set<string>();
  const blockCounter = { value: 0 };
  const sections = content.sections.map((section, index) => {
    const parsed = parseSection(section, index, stableIds, blockCounter);
    textCharacters += parsed.textCharacters;
    if (textCharacters > PROJECT_SCRIPT_TEXT_CHARACTER_LIMIT) {
      fail(
        "too_much_text",
        `content may contain no more than ${PROJECT_SCRIPT_TEXT_CHARACTER_LIMIT} text characters`,
        "content",
      );
    }
    return parsed.section;
  });

  const normalized: ProjectScriptContent = {
    schemaVersion: PROJECT_SCRIPT_SCHEMA_VERSION,
    title,
    logline,
    format: enumValue(
      content.format,
      "content.format",
      PROJECT_SCRIPT_FORMATS,
    ),
    estimatedRuntimeSeconds: nullableInteger(
      content.estimatedRuntimeSeconds,
      "content.estimatedRuntimeSeconds",
      1,
      MAX_SCRIPT_DURATION_SECONDS,
    ),
    sections,
  };
  if (
    jsonbByteLength(normalized) > PROJECT_SCRIPT_CONTENT_MAX_BYTES
  ) {
    fail(
      "content_too_large",
      `content must not exceed ${PROJECT_SCRIPT_CONTENT_MAX_BYTES} bytes`,
      "content",
    );
  }
  return normalized;
}

export function parseProjectScriptAppendRequest(
  value: unknown,
): ProjectScriptAppendRequest {
  const request = jsonObject(value, "request");
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
    baseRevisionId: nullableUuid(
      request.baseRevisionId,
      "request.baseRevisionId",
    ),
    changeSummary: nullableText(
      request.changeSummary,
      "request.changeSummary",
      4_000,
    ),
    content: parseProjectScriptContent(request.content),
  };
}

export function parseProjectScriptSubmitRequest(
  value: unknown,
): ProjectScriptSubmitRequest {
  const request = jsonObject(value, "request");
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

export function parseProjectScriptDecisionRequest(
  value: unknown,
): ProjectScriptDecisionRequest {
  const request = jsonObject(value, "request");
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
    PROJECT_SCRIPT_DECISIONS,
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

export const parseProjectScriptAppendMutation =
  parseProjectScriptAppendRequest;
export const parseProjectScriptSubmitMutation =
  parseProjectScriptSubmitRequest;
export const parseProjectScriptDecisionMutation =
  parseProjectScriptDecisionRequest;
export const parseAppendProjectScriptRevisionRequest =
  parseProjectScriptAppendRequest;
export const parseSubmitProjectScriptRevisionRequest =
  parseProjectScriptSubmitRequest;
export const parseDecideProjectScriptRevisionRequest =
  parseProjectScriptDecisionRequest;

export type AppendProjectScriptRevisionRequest = ProjectScriptAppendRequest;
export type SubmitProjectScriptRevisionRequest = ProjectScriptSubmitRequest;
export type DecideProjectScriptRevisionRequest = ProjectScriptDecisionRequest;

function outputObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function hasExactOutputKeys(
  value: JsonObject,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  if (keys.length !== expected.length) return false;
  const expectedKeys = new Set(expected);
  return keys.every((key) => expectedKeys.has(key));
}

function outputString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeTextValue(value);
  return normalized.length > 0 && !UNSAFE_CONTROL_PATTERN.test(normalized)
    ? normalized
    : null;
}

function outputUuid(value: unknown): string | null {
  const normalized = outputString(value)?.toLowerCase() ?? null;
  return normalized && UUID_PATTERN.test(normalized) ? normalized : null;
}

function outputInteger(value: unknown, minimum: number): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= MAX_SAFE_DATABASE_INTEGER
    ? (value as number)
    : null;
}

function outputNullableUuid(
  value: unknown,
): string | null | typeof INVALID_OUTPUT {
  if (value === null) return null;
  return outputUuid(value) ?? INVALID_OUTPUT;
}

function outputNullableString(
  value: unknown,
): string | null | typeof INVALID_OUTPUT {
  if (value === null) return null;
  return outputString(value) ?? INVALID_OUTPUT;
}

function outputScriptState(value: unknown): ProjectScriptState | null {
  return typeof value === "string" &&
    (PROJECT_SCRIPT_STATES as readonly string[]).includes(value)
    ? (value as ProjectScriptState)
    : null;
}

function outputSourceKind(value: unknown): ProjectScriptSourceKind | null {
  return typeof value === "string" &&
    (PROJECT_SCRIPT_SOURCE_KINDS as readonly string[]).includes(value)
    ? (value as ProjectScriptSourceKind)
    : null;
}

const API_REVISION_KEYS = [
  "revisionId",
  "revisionNumber",
  "baseRevisionId",
  "state",
  "changeSummary",
  "contentHash",
  "createdBy",
  "createdAt",
  "submittedBy",
  "submittedAt",
  "decidedBy",
  "decidedAt",
  "decisionNote",
] as const;

const API_HEAD_KEYS = [...API_REVISION_KEYS, "content"] as const;

function parseApiRevisionFields(
  revision: JsonObject,
): ProjectScriptRevisionMetadata | null {
  const revisionId = outputUuid(revision.revisionId);
  const revisionNumber = outputInteger(revision.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(revision.baseRevisionId);
  const state = outputScriptState(revision.state);
  const changeSummary = outputNullableString(revision.changeSummary);
  const contentHash = outputString(revision.contentHash);
  const createdBy = outputUuid(revision.createdBy);
  const createdAt = outputString(revision.createdAt);
  const submittedBy = outputNullableUuid(revision.submittedBy);
  const submittedAt = outputNullableString(revision.submittedAt);
  const decidedBy = outputNullableUuid(revision.decidedBy);
  const decidedAt = outputNullableString(revision.decidedAt);
  const decisionNote = outputNullableString(revision.decisionNote);
  if (
    !revisionId ||
    revisionNumber === null ||
    baseRevisionId === INVALID_OUTPUT ||
    (revisionNumber === 1 ? baseRevisionId !== null : baseRevisionId === null) ||
    !state ||
    changeSummary === INVALID_OUTPUT ||
    !contentHash ||
    !SHA256_PATTERN.test(contentHash) ||
    !createdBy ||
    !createdAt ||
    submittedBy === INVALID_OUTPUT ||
    submittedAt === INVALID_OUTPUT ||
    decidedBy === INVALID_OUTPUT ||
    decidedAt === INVALID_OUTPUT ||
    decisionNote === INVALID_OUTPUT
  ) {
    return null;
  }
  return {
    revisionId,
    revisionNumber,
    baseRevisionId,
    state,
    changeSummary,
    contentHash,
    createdBy,
    createdAt,
    submittedBy,
    submittedAt,
    decidedBy,
    decidedAt,
    decisionNote,
  };
}

function parseApiRevisionMetadata(
  value: unknown,
): ProjectScriptRevisionMetadata | null {
  const revision = outputObject(value);
  return revision && hasExactOutputKeys(revision, API_REVISION_KEYS)
    ? parseApiRevisionFields(revision)
    : null;
}

function parseApiHead(value: unknown): ProjectScriptHeadRevision | null {
  const revision = outputObject(value);
  if (!revision || !hasExactOutputKeys(revision, API_HEAD_KEYS)) return null;
  const metadata = parseApiRevisionFields(revision);
  if (!metadata) return null;
  try {
    return { ...metadata, content: parseProjectScriptContent(revision.content) };
  } catch {
    return null;
  }
}

interface ParsedRpcRevision {
  projectId: string;
  metadata: ProjectScriptRevisionMetadata;
  content: ProjectScriptContent;
}

const RPC_REVISION_KEYS = [
  "id",
  "projectId",
  "revisionNumber",
  "baseRevisionId",
  "effectiveState",
  "changeSummary",
  "content",
  "contentHash",
  "sourceKind",
  "sourceProjectBriefRevisionId",
  "sourceProjectBriefContentHash",
  "createdBy",
  "createdAt",
] as const;

function parseRpcRevision(value: unknown): ParsedRpcRevision | null {
  const revision = outputObject(value);
  if (!revision || !hasExactOutputKeys(revision, RPC_REVISION_KEYS)) return null;
  const revisionId = outputUuid(revision.id);
  const projectId = outputUuid(revision.projectId);
  const revisionNumber = outputInteger(revision.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(revision.baseRevisionId);
  const state = outputScriptState(revision.effectiveState);
  const changeSummary = outputNullableString(revision.changeSummary);
  const contentHash = outputString(revision.contentHash);
  const sourceKind = outputSourceKind(revision.sourceKind);
  const sourceRevisionId = outputNullableUuid(
    revision.sourceProjectBriefRevisionId,
  );
  const sourceContentHash = outputNullableString(
    revision.sourceProjectBriefContentHash,
  );
  const createdBy = outputUuid(revision.createdBy);
  const createdAt = outputString(revision.createdAt);
  if (
    !revisionId ||
    !projectId ||
    revisionNumber === null ||
    baseRevisionId === INVALID_OUTPUT ||
    (revisionNumber === 1 ? baseRevisionId !== null : baseRevisionId === null) ||
    !state ||
    changeSummary === INVALID_OUTPUT ||
    !contentHash ||
    !SHA256_PATTERN.test(contentHash) ||
    !sourceKind ||
    sourceRevisionId === INVALID_OUTPUT ||
    sourceContentHash === INVALID_OUTPUT ||
    (sourceRevisionId === null) !== (sourceContentHash === null) ||
    (typeof sourceContentHash === "string" &&
      !SHA256_PATTERN.test(sourceContentHash)) ||
    (sourceKind === "manual" && sourceRevisionId !== null) ||
    (sourceKind === "accepted_proposal" && sourceRevisionId === null) ||
    !createdBy ||
    !createdAt
  ) {
    return null;
  }
  let content: ProjectScriptContent;
  try {
    content = parseProjectScriptContent(revision.content);
  } catch {
    return null;
  }
  return {
    projectId,
    content,
    metadata: {
      revisionId,
      revisionNumber,
      baseRevisionId,
      state,
      changeSummary,
      contentHash,
      createdBy,
      createdAt,
      submittedBy: null,
      submittedAt: null,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    },
  };
}

function validateRevisionList(
  revisions: ProjectScriptRevisionMetadata[],
): boolean {
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const revision of revisions) {
    if (ids.has(revision.revisionId) || numbers.has(revision.revisionNumber)) {
      return false;
    }
    ids.add(revision.revisionId);
    numbers.add(revision.revisionNumber);
  }
  return true;
}

function sameRevisionMetadata(
  left: ProjectScriptRevisionMetadata,
  right: ProjectScriptRevisionMetadata,
): boolean {
  return API_REVISION_KEYS.every((key) => left[key] === right[key]);
}

function parseApiSnapshot(snapshot: JsonObject): ProjectScriptSnapshot | null {
  if (
    !hasExactOutputKeys(snapshot, [
      "projectId",
      "authorityVersion",
      "eventHeadHash",
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
  const eventHeadHash = outputString(snapshot.eventHeadHash);
  const permissions = outputObject(snapshot.permissions);
  if (
    !projectId ||
    authorityVersion === null ||
    !eventHeadHash ||
    !SHA256_PATTERN.test(eventHeadHash) ||
    !permissions ||
    !hasExactOutputKeys(permissions, ["canRevise", "canSubmit", "canDecide"]) ||
    typeof permissions.canRevise !== "boolean" ||
    typeof permissions.canSubmit !== "boolean" ||
    typeof permissions.canDecide !== "boolean"
  ) {
    return null;
  }
  const head = snapshot.head === null ? null : parseApiHead(snapshot.head);
  if (snapshot.head !== null && !head) return null;
  const revisions: ProjectScriptRevisionMetadata[] = [];
  for (const rawRevision of snapshot.revisions) {
    const revision = parseApiRevisionMetadata(rawRevision);
    if (!revision) return null;
    revisions.push(revision);
  }
  if (!validateRevisionList(revisions)) return null;
  if (
    head &&
    !revisions.some(
      (revision) =>
        revision.revisionId === head.revisionId &&
        sameRevisionMetadata(revision, head),
    )
  ) {
    return null;
  }
  return {
    projectId,
    authorityVersion,
    eventHeadHash,
    head,
    revisions,
    permissions: {
      canRevise: permissions.canRevise,
      canSubmit: permissions.canSubmit,
      canDecide: permissions.canDecide,
    },
  };
}

function parseRpcSnapshot(snapshot: JsonObject): ProjectScriptSnapshot | null {
  if (
    !hasExactOutputKeys(snapshot, [
      "projectId",
      "authorityVersion",
      "eventHeadHash",
      "script",
      "revisions",
      "permissions",
    ]) ||
    !Array.isArray(snapshot.revisions)
  ) {
    return null;
  }
  const projectId = outputUuid(snapshot.projectId);
  const authorityVersion = outputInteger(snapshot.authorityVersion, 0);
  const eventHeadHash = outputString(snapshot.eventHeadHash);
  const permissions = outputObject(snapshot.permissions);
  if (
    !projectId ||
    authorityVersion === null ||
    !eventHeadHash ||
    !SHA256_PATTERN.test(eventHeadHash) ||
    !permissions ||
    !hasExactOutputKeys(permissions, [
      "role",
      "canAppend",
      "canSubmit",
      "canDecide",
    ]) ||
    !outputString(permissions.role) ||
    typeof permissions.canAppend !== "boolean" ||
    typeof permissions.canSubmit !== "boolean" ||
    typeof permissions.canDecide !== "boolean"
  ) {
    return null;
  }
  const parsedRevisions: ParsedRpcRevision[] = [];
  for (const rawRevision of snapshot.revisions) {
    const revision = parseRpcRevision(rawRevision);
    if (!revision || revision.projectId !== projectId) return null;
    parsedRevisions.push(revision);
  }
  const revisions = parsedRevisions.map((revision) => revision.metadata);
  if (!validateRevisionList(revisions)) return null;
  let head: ProjectScriptHeadRevision | null = null;
  if (snapshot.script !== null) {
    const parsedHead = parseRpcRevision(snapshot.script);
    if (!parsedHead || parsedHead.projectId !== projectId) return null;
    if (
      !revisions.some(
        (revision) =>
          revision.revisionId === parsedHead.metadata.revisionId &&
          sameRevisionMetadata(revision, parsedHead.metadata),
      )
    ) {
      return null;
    }
    head = { ...parsedHead.metadata, content: parsedHead.content };
  }
  return {
    projectId,
    authorityVersion,
    eventHeadHash,
    head,
    revisions,
    permissions: {
      canRevise: permissions.canAppend,
      canSubmit: permissions.canSubmit,
      canDecide: permissions.canDecide,
    },
  };
}

export function parseProjectScriptSnapshot(
  value: unknown,
): ProjectScriptSnapshot | null {
  const snapshot = outputObject(value);
  if (!snapshot) return null;
  return Object.prototype.hasOwnProperty.call(snapshot, "head")
    ? parseApiSnapshot(snapshot)
    : parseRpcSnapshot(snapshot);
}

const API_REVISION_RECEIPT_KEYS = [
  "projectId",
  "revisionId",
  "revisionNumber",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;
const API_COMMAND_RECEIPT_KEYS = [
  "projectId",
  "revisionId",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;
const RPC_APPEND_RECEIPT_KEYS = [
  "scriptRevisionId",
  "projectId",
  "revisionNumber",
  "baseRevisionId",
  "effectiveState",
  "contentHash",
  "sourceProjectBriefRevisionId",
  "sourceProjectBriefContentHash",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;
const RPC_COMMAND_RECEIPT_KEYS = [
  "scriptRevisionId",
  "projectId",
  "revisionNumber",
  "effectiveState",
  "authorityVersion",
  "requestId",
  "replayed",
] as const;

function receiptBase(
  receipt: JsonObject,
  revisionKey: "revisionId" | "scriptRevisionId",
): ProjectScriptReceiptBase | null {
  const projectId = outputUuid(receipt.projectId);
  const revisionId = outputUuid(receipt[revisionKey]);
  const authorityVersion = outputInteger(receipt.authorityVersion, 1);
  const requestId = outputUuid(receipt.requestId);
  const replayed =
    typeof receipt.replayed === "boolean" ? receipt.replayed : null;
  return projectId && revisionId && authorityVersion !== null && requestId && replayed !== null
    ? { projectId, revisionId, authorityVersion, requestId, replayed }
    : null;
}

export function parseProjectScriptAppendReceipt(
  value: unknown,
): ProjectScriptAppendReceipt | null {
  const receipt = outputObject(value);
  if (!receipt) return null;
  if (hasExactOutputKeys(receipt, API_REVISION_RECEIPT_KEYS)) {
    const base = receiptBase(receipt, "revisionId");
    const revisionNumber = outputInteger(receipt.revisionNumber, 1);
    return base && revisionNumber !== null ? { ...base, revisionNumber } : null;
  }
  if (!hasExactOutputKeys(receipt, RPC_APPEND_RECEIPT_KEYS)) return null;
  const base = receiptBase(receipt, "scriptRevisionId");
  const revisionNumber = outputInteger(receipt.revisionNumber, 1);
  const baseRevisionId = outputNullableUuid(receipt.baseRevisionId);
  const contentHash = outputString(receipt.contentHash);
  const sourceRevisionId = outputNullableUuid(
    receipt.sourceProjectBriefRevisionId,
  );
  const sourceContentHash = outputNullableString(
    receipt.sourceProjectBriefContentHash,
  );
  if (
    !base ||
    revisionNumber === null ||
    baseRevisionId === INVALID_OUTPUT ||
    (revisionNumber === 1 ? baseRevisionId !== null : baseRevisionId === null) ||
    receipt.effectiveState !== "draft" ||
    !contentHash ||
    !SHA256_PATTERN.test(contentHash) ||
    sourceRevisionId === INVALID_OUTPUT ||
    sourceContentHash === INVALID_OUTPUT ||
    (sourceRevisionId === null) !== (sourceContentHash === null) ||
    (typeof sourceContentHash === "string" &&
      !SHA256_PATTERN.test(sourceContentHash))
  ) {
    return null;
  }
  return { ...base, revisionNumber };
}

function parseCommandReceipt(
  value: unknown,
  allowedStates: readonly ("submitted" | "approved" | "changes_requested")[],
): ProjectScriptTransitionReceipt | null {
  const receipt = outputObject(value);
  if (!receipt) return null;
  if (hasExactOutputKeys(receipt, API_COMMAND_RECEIPT_KEYS)) {
    return receiptBase(receipt, "revisionId");
  }
  if (!hasExactOutputKeys(receipt, RPC_COMMAND_RECEIPT_KEYS)) return null;
  if (
    outputInteger(receipt.revisionNumber, 1) === null ||
    typeof receipt.effectiveState !== "string" ||
    !allowedStates.includes(
      receipt.effectiveState as "submitted" | "approved" | "changes_requested",
    )
  ) {
    return null;
  }
  return receiptBase(receipt, "scriptRevisionId");
}

export function parseProjectScriptSubmitReceipt(
  value: unknown,
): ProjectScriptSubmitReceipt | null {
  return parseCommandReceipt(value, ["submitted"]);
}

export function parseProjectScriptDecisionReceipt(
  value: unknown,
): ProjectScriptDecisionReceipt | null {
  return parseCommandReceipt(value, ["approved", "changes_requested"]);
}

export function parseProjectScriptCommandReceipt(
  value: unknown,
): ProjectScriptReceipt | null {
  return parseCommandReceipt(value, [
    "submitted",
    "approved",
    "changes_requested",
  ]);
}

export const parseProjectScriptReceipt = parseProjectScriptCommandReceipt;
export const parseProjectScriptRevisionReceipt =
  parseProjectScriptAppendReceipt;

export interface ProjectScriptPublicError {
  status: 403 | 404 | 409 | 422 | 503;
  error: string;
}

export function classifyProjectScriptDatabaseError(error: {
  code?: string;
  message?: string;
} | null): ProjectScriptPublicError {
  const code = error?.code?.toUpperCase() ?? "";
  const signal = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    code === "23505" ||
    code === "40001" ||
    (signal.includes("script") &&
      (signal.includes("conflict") ||
        signal.includes("stale") ||
        signal.includes("invalid_transition") ||
        signal.includes("origin_authority_invalid")))
  ) {
    return {
      status: 409,
      error: "The project script changed elsewhere. Reload before trying again.",
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
    return { status: 404, error: "Project script not found" };
  }
  if (
    code === "22023" ||
    code === "23514" ||
    signal.includes("invalid_project_script") ||
    signal.includes("project_script_invalid") ||
    signal.includes("invalid_script")
  ) {
    return { status: 422, error: "The project script request is invalid" };
  }
  return {
    status: 503,
    error: "Project script is temporarily unavailable",
  };
}

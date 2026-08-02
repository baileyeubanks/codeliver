import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

export const HERMES_ORCHESTRATION_SCHEMA_VERSION = "1.0.0" as const;
export const HERMES_ORCHESTRATION_MAX_BYTES = 24 * 1024;
export const HERMES_ORCHESTRATION_MAX_DEPTH = 6;
export const HERMES_ATTESTATION_MAX_AGE_MS = 5 * 60 * 1000;
export const HERMES_ATTESTATION_MAX_TTL_MS = 10 * 60 * 1000;
export const HERMES_ATTESTATION_CLOCK_SKEW_MS = 30 * 1000;
export const HERMES_PROPOSAL_MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;
export const HERMES_PROPOSAL_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const HERMES_CANDIDATE_CHANNELS = [
  "in_app",
  "email",
  "sms",
  "imessage",
] as const;

export const HERMES_AUDIENCES = ["customer", "crew", "operator"] as const;
export const HERMES_PURPOSES = ["transactional", "operational"] as const;
export const HERMES_COMMUNICATION_CLASSES = [
  "notification",
  "private_operator_imessage_command_response",
] as const;

export const HERMES_SOURCE_RECORD_KINDS = [
  "project",
  "production_task",
  "deliverable",
  "asset",
  "review",
  "approval",
  "comment",
  "export",
  "operator_command",
] as const;

export const HERMES_EVENT_TYPES = [
  "project_invitation",
  "project_status_changed",
  "crew_assignment",
  "schedule_changed",
  "deadline_reminder",
  "asset_uploaded",
  "review_requested",
  "review_reminder",
  "comment_added",
  "approval_requested",
  "approval_recorded",
  "deliverable_ready",
  "delivery_completed",
  "operator_command_response",
] as const;

export type HermesCandidateChannel =
  (typeof HERMES_CANDIDATE_CHANNELS)[number];
export type HermesAudience = (typeof HERMES_AUDIENCES)[number];
export type HermesPurpose = (typeof HERMES_PURPOSES)[number];
export type HermesCommunicationClass =
  (typeof HERMES_COMMUNICATION_CLASSES)[number];
export type HermesSourceRecordKind =
  (typeof HERMES_SOURCE_RECORD_KINDS)[number];
export type HermesEventType = (typeof HERMES_EVENT_TYPES)[number];

export interface HermesOrchestrationPayload {
  readonly orchestrationMode: "proposal_only";
  readonly communicationClass: HermesCommunicationClass;
  readonly tenantId: string;
  readonly sourceRecord: {
    readonly kind: HermesSourceRecordKind;
    readonly id: string;
  };
  readonly eventType: HermesEventType;
  readonly template: {
    readonly id: string;
    readonly revision: number;
  };
  readonly recipientContactIds: readonly string[];
  readonly candidateChannels: readonly HermesCandidateChannel[];
  readonly purpose: HermesPurpose;
  readonly requestedSchedule: {
    readonly notBefore: string;
    readonly expiresAt: string;
  };
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly humanApprovalRequired: true;
  readonly audience: HermesAudience;
}

export interface HermesOrchestrationAttestation {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly payloadHash: `sha256:${string}`;
  readonly signature: string;
}

export interface HermesOrchestrationRequest {
  readonly schemaVersion: typeof HERMES_ORCHESTRATION_SCHEMA_VERSION;
  readonly attestation: HermesOrchestrationAttestation;
  readonly payload: HermesOrchestrationPayload;
}

export interface HermesNonceClaim {
  readonly keyId: string;
  readonly nonce: string;
  readonly expiresAtMs: number;
  readonly nowMs: number;
}

export interface HermesNonceRegistry {
  claim(input: HermesNonceClaim): boolean;
}

export class InMemoryHermesNonceRegistry implements HermesNonceRegistry {
  readonly #claims = new Map<string, number>();

  claim({ keyId, nonce, expiresAtMs, nowMs }: HermesNonceClaim): boolean {
    for (const [key, expiry] of this.#claims) {
      if (expiry <= nowMs) this.#claims.delete(key);
    }

    const claimKey = `${keyId}\u0000${nonce}`;
    if (this.#claims.has(claimKey)) return false;
    this.#claims.set(claimKey, expiresAtMs);
    return true;
  }
}

export class HermesOrchestrationValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "HermesOrchestrationValidationError";
    this.code = code;
    this.field = field;
  }
}

type JsonObject = Record<string, unknown>;

const MAX_JSON_NODES = 512;
const MAX_JSON_ARRAY_ITEMS = 64;
const MAX_JSON_STRING_BYTES = 2_048;

const MESSAGE_CONTENT_KEYS = new Set([
  "body",
  "content",
  "html",
  "markdown",
  "message",
  "messagebody",
  "messagetext",
  "subject",
  "text",
]);

const RAW_RECIPIENT_KEYS = new Set([
  "address",
  "bcc",
  "cc",
  "email",
  "emailaddress",
  "emails",
  "from",
  "phone",
  "phonenumber",
  "phones",
  "rawrecipient",
  "rawrecipients",
  "recipient",
  "recipients",
  "replyto",
  "to",
]);

const COMMERCIAL_KEY_PARTS = [
  "amount",
  "billing",
  "budget",
  "card",
  "charge",
  "commercial",
  "cost",
  "currency",
  "deposit",
  "invoice",
  "margin",
  "payment",
  "price",
  "stripe",
  "subtotal",
  "tax",
  "total",
] as const;

const SECRET_KEY_PARTS = [
  "authorization",
  "cookie",
  "credential",
  "password",
  "secret",
  "token",
] as const;

const TOOL_EXECUTION_KEYS = new Set([
  "action",
  "arguments",
  "command",
  "commandline",
  "dispatch",
  "endpoint",
  "execute",
  "execution",
  "function",
  "functioncall",
  "mutation",
  "patch",
  "send",
  "sendat",
  "statechange",
  "statepatch",
  "tool",
  "toolcall",
  "toolname",
  "url",
  "webhook",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rejectForbiddenKey(key: string, field: string) {
  const normalized = normalizedKey(key);
  if (MESSAGE_CONTENT_KEYS.has(normalized)) {
    throw new HermesOrchestrationValidationError(
      "message_content_forbidden",
      `${field} cannot carry message content; Hermes may reference templates only`,
      field,
    );
  }
  if (RAW_RECIPIENT_KEYS.has(normalized)) {
    throw new HermesOrchestrationValidationError(
      "raw_recipient_forbidden",
      `${field} cannot carry a raw recipient; use recipientContactIds`,
      field,
    );
  }
  if (COMMERCIAL_KEY_PARTS.some((part) => normalized.includes(part))) {
    throw new HermesOrchestrationValidationError(
      "commercial_field_forbidden",
      `${field} cannot carry commercial or payment data`,
      field,
    );
  }
  if (SECRET_KEY_PARTS.some((part) => normalized.includes(part))) {
    throw new HermesOrchestrationValidationError(
      "secret_field_forbidden",
      `${field} cannot carry secrets or tokens`,
      field,
    );
  }
  if (TOOL_EXECUTION_KEYS.has(normalized)) {
    throw new HermesOrchestrationValidationError(
      "tool_execution_field_forbidden",
      `${field} cannot request sending, tool execution, or state mutation`,
      field,
    );
  }
}

function inspectJsonValue(
  value: unknown,
  field: string,
  depth: number,
  state: { nodes: number; seen: Set<object> },
) {
  if (depth > HERMES_ORCHESTRATION_MAX_DEPTH) {
    throw new HermesOrchestrationValidationError(
      "payload_too_deep",
      `Hermes orchestration requests cannot exceed depth ${HERMES_ORCHESTRATION_MAX_DEPTH}`,
      field,
    );
  }

  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES) {
    throw new HermesOrchestrationValidationError(
      "request_too_large",
      "Hermes orchestration request contains too many values",
      field,
    );
  }

  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > MAX_JSON_STRING_BYTES) {
      throw new HermesOrchestrationValidationError(
        "request_too_large",
        `${field} exceeds the maximum string size`,
        field,
      );
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new HermesOrchestrationValidationError(
        "invalid_json_value",
        `${field} must be a safe integer`,
        field,
      );
    }
    return;
  }
  if (!value || typeof value !== "object") {
    throw new HermesOrchestrationValidationError(
      "invalid_json_value",
      `${field} contains a non-JSON value`,
      field,
    );
  }

  if (state.seen.has(value)) {
    throw new HermesOrchestrationValidationError(
      "invalid_json_value",
      `${field} contains a cyclic value`,
      field,
    );
  }
  state.seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_ITEMS) {
      throw new HermesOrchestrationValidationError(
        "request_too_large",
        `${field} contains too many items`,
        field,
      );
    }
    value.forEach((item, index) =>
      inspectJsonValue(item, `${field}[${index}]`, depth + 1, state),
    );
    state.seen.delete(value);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new HermesOrchestrationValidationError(
      "invalid_json_value",
      `${field} must be a plain JSON object`,
      field,
    );
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new HermesOrchestrationValidationError(
      "invalid_json_value",
      `${field} cannot contain symbol keys`,
      field,
    );
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    const propertyField = `${field}.${key}`;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new HermesOrchestrationValidationError(
        "invalid_json_value",
        `${propertyField} must be an enumerable JSON value`,
        propertyField,
      );
    }
    rejectForbiddenKey(key, propertyField);
    inspectJsonValue(descriptor.value, propertyField, depth + 1, state);
  }
  state.seen.delete(value);
}

function canonicalJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonValue).join(",")}]`;
  }
  const object = value as JsonObject;
  const keys = Object.keys(object).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(object[key])}`)
    .join(",")}}`;
}

function inspectedCanonicalJson(value: unknown, field: string): string {
  inspectJsonValue(value, field, 0, { nodes: 0, seen: new Set() });
  return canonicalJsonValue(value);
}

function objectValue(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HermesOrchestrationValidationError(
      "invalid_object",
      `${field} must be an object`,
      field,
    );
  }
  return value as JsonObject;
}

function assertAllowedKeys(
  value: JsonObject,
  field: string,
  allowed: readonly string[],
) {
  const allowlist = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowlist.has(key));
  if (unknown) {
    throw new HermesOrchestrationValidationError(
      "unknown_field",
      `${field}.${unknown} is not part of the Hermes orchestration contract`,
      `${field}.${unknown}`,
    );
  }
}

function stringValue(value: unknown, field: string, maxLength = 160): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength ||
    value !== value.trim()
  ) {
    throw new HermesOrchestrationValidationError(
      "invalid_string",
      `${field} must be a non-empty canonical string of at most ${maxLength} characters`,
      field,
    );
  }
  return value;
}

function identifierValue(value: unknown, field: string, maxLength = 200): string {
  const identifier = stringValue(value, field, maxLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(identifier)) {
    throw new HermesOrchestrationValidationError(
      "invalid_identifier",
      `${field} must be an opaque identifier`,
      field,
    );
  }
  return identifier;
}

function stableContactId(value: unknown, field: string): string {
  const contactId = stringValue(value, field, 160);
  const prefixed = /^contact[-_:][A-Za-z0-9][A-Za-z0-9._:-]{1,150}$/.test(
    contactId,
  );
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      contactId,
    );
  if (!prefixed && !uuid) {
    throw new HermesOrchestrationValidationError(
      "raw_recipient_forbidden",
      `${field} must be a stable contact ID, never an email address or phone number`,
      field,
    );
  }
  return contactId;
}

function uuidValue(value: unknown, field: string): string {
  const identifier = stringValue(value, field, 36).toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      identifier,
    )
  ) {
    throw new HermesOrchestrationValidationError(
      "invalid_uuid",
      `${field} must be a UUID`,
      field,
    );
  }
  return identifier;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HermesOrchestrationValidationError(
      "invalid_enum",
      `${field} must be one of: ${allowed.join(", ")}`,
      field,
    );
  }
  return value as T;
}

function canonicalTimestamp(value: unknown, field: string): string {
  const timestamp = stringValue(value, field, 24);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) ||
    Number.isNaN(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString() !== timestamp
  ) {
    throw new HermesOrchestrationValidationError(
      "invalid_timestamp",
      `${field} must be a canonical UTC timestamp with milliseconds`,
      field,
    );
  }
  return timestamp;
}

function sha256Reference(value: unknown, field: string): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new HermesOrchestrationValidationError(
      "invalid_payload_hash",
      `${field} must be a lowercase SHA-256 reference`,
      field,
    );
  }
  return value as `sha256:${string}`;
}

function base64urlBytes(
  value: unknown,
  field: string,
  minimumBytes: number,
  maximumBytes: number,
): string {
  const encoded = stringValue(value, field, 512);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new HermesOrchestrationValidationError(
      "invalid_base64url",
      `${field} must use unpadded base64url`,
      field,
    );
  }
  const decoded = Buffer.from(encoded, "base64url");
  if (
    decoded.length < minimumBytes ||
    decoded.length > maximumBytes ||
    decoded.toString("base64url") !== encoded
  ) {
    throw new HermesOrchestrationValidationError(
      "invalid_base64url",
      `${field} has an invalid encoded length`,
      field,
    );
  }
  return encoded;
}

function parseSourceRecord(
  value: unknown,
): HermesOrchestrationPayload["sourceRecord"] {
  const source = objectValue(value, "payload.sourceRecord");
  assertAllowedKeys(source, "payload.sourceRecord", ["kind", "id"]);
  return {
    kind: enumValue(
      source.kind,
      "payload.sourceRecord.kind",
      HERMES_SOURCE_RECORD_KINDS,
    ),
    id: identifierValue(source.id, "payload.sourceRecord.id"),
  };
}

function parseTemplate(value: unknown): HermesOrchestrationPayload["template"] {
  const template = objectValue(value, "payload.template");
  assertAllowedKeys(template, "payload.template", ["id", "revision"]);
  if (
    !Number.isSafeInteger(template.revision) ||
    Number(template.revision) < 1 ||
    Number(template.revision) > 1_000_000
  ) {
    throw new HermesOrchestrationValidationError(
      "invalid_template_revision",
      "payload.template.revision must be a positive integer no greater than 1000000",
      "payload.template.revision",
    );
  }
  return {
    id: identifierValue(template.id, "payload.template.id"),
    revision: Number(template.revision),
  };
}

function parseRecipients(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new HermesOrchestrationValidationError(
      "invalid_recipients",
      "payload.recipientContactIds must contain between 1 and 50 stable contact IDs",
      "payload.recipientContactIds",
    );
  }
  const recipients = value.map((item, index) =>
    stableContactId(item, `payload.recipientContactIds[${index}]`),
  );
  if (new Set(recipients).size !== recipients.length) {
    throw new HermesOrchestrationValidationError(
      "duplicate_recipient",
      "payload.recipientContactIds cannot contain duplicates",
      "payload.recipientContactIds",
    );
  }
  return recipients;
}

function parseChannels(value: unknown): readonly HermesCandidateChannel[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new HermesOrchestrationValidationError(
      "invalid_channels",
      "payload.candidateChannels must contain between 1 and 4 channels",
      "payload.candidateChannels",
    );
  }
  const channels = value.map((item, index) =>
    enumValue(
      item,
      `payload.candidateChannels[${index}]`,
      HERMES_CANDIDATE_CHANNELS,
    ),
  );
  if (new Set(channels).size !== channels.length) {
    throw new HermesOrchestrationValidationError(
      "duplicate_channel",
      "payload.candidateChannels cannot contain duplicates",
      "payload.candidateChannels",
    );
  }
  return channels;
}

function parseRequestedSchedule(
  value: unknown,
): HermesOrchestrationPayload["requestedSchedule"] {
  const schedule = objectValue(value, "payload.requestedSchedule");
  assertAllowedKeys(schedule, "payload.requestedSchedule", [
    "notBefore",
    "expiresAt",
  ]);
  const notBefore = canonicalTimestamp(
    schedule.notBefore,
    "payload.requestedSchedule.notBefore",
  );
  const expiresAt = canonicalTimestamp(
    schedule.expiresAt,
    "payload.requestedSchedule.expiresAt",
  );
  const lifetime = Date.parse(expiresAt) - Date.parse(notBefore);
  if (lifetime <= 0 || lifetime > HERMES_PROPOSAL_MAX_LIFETIME_MS) {
    throw new HermesOrchestrationValidationError(
      "invalid_requested_schedule",
      "The requested expiry must follow the schedule and be no more than seven days later",
      "payload.requestedSchedule.expiresAt",
    );
  }
  return { notBefore, expiresAt };
}

function assertCommandChannelSeparation(
  payload: HermesOrchestrationPayload,
) {
  const isCommandResponse =
    payload.communicationClass ===
    "private_operator_imessage_command_response";

  if (isCommandResponse) {
    const isPrivateOperatorCommand =
      payload.audience === "operator" &&
      payload.purpose === "operational" &&
      payload.sourceRecord.kind === "operator_command" &&
      payload.eventType === "operator_command_response" &&
      payload.recipientContactIds.length === 1 &&
      payload.candidateChannels.length === 1 &&
      payload.candidateChannels[0] === "imessage";
    if (!isPrivateOperatorCommand) {
      throw new HermesOrchestrationValidationError(
        "command_channel_separation_violation",
        "Private operator command responses require one operator contact and iMessage only",
        "payload.communicationClass",
      );
    }
    return;
  }

  if (
    payload.sourceRecord.kind === "operator_command" ||
    payload.eventType === "operator_command_response" ||
    payload.candidateChannels.includes("imessage")
  ) {
    throw new HermesOrchestrationValidationError(
      "command_channel_separation_violation",
      "Notification proposals cannot enter the private operator iMessage command channel",
      "payload.candidateChannels",
    );
  }
}

function parsePayload(value: unknown): HermesOrchestrationPayload {
  const payload = objectValue(value, "payload");
  assertAllowedKeys(payload, "payload", [
    "orchestrationMode",
    "communicationClass",
    "tenantId",
    "sourceRecord",
    "eventType",
    "template",
    "recipientContactIds",
    "candidateChannels",
    "purpose",
    "requestedSchedule",
    "idempotencyKey",
    "correlationId",
    "humanApprovalRequired",
    "audience",
  ]);

  if (payload.orchestrationMode !== "proposal_only") {
    throw new HermesOrchestrationValidationError(
      "proposal_only_required",
      "Hermes orchestration must remain proposal_only",
      "payload.orchestrationMode",
    );
  }
  if (payload.humanApprovalRequired !== true) {
    throw new HermesOrchestrationValidationError(
      "human_approval_required",
      "Every Hermes communication proposal requires human approval",
      "payload.humanApprovalRequired",
    );
  }

  const parsed: HermesOrchestrationPayload = {
    orchestrationMode: "proposal_only",
    communicationClass: enumValue(
      payload.communicationClass,
      "payload.communicationClass",
      HERMES_COMMUNICATION_CLASSES,
    ),
    tenantId: uuidValue(payload.tenantId, "payload.tenantId"),
    sourceRecord: parseSourceRecord(payload.sourceRecord),
    eventType: enumValue(
      payload.eventType,
      "payload.eventType",
      HERMES_EVENT_TYPES,
    ),
    template: parseTemplate(payload.template),
    recipientContactIds: parseRecipients(payload.recipientContactIds),
    candidateChannels: parseChannels(payload.candidateChannels),
    purpose: enumValue(payload.purpose, "payload.purpose", HERMES_PURPOSES),
    requestedSchedule: parseRequestedSchedule(payload.requestedSchedule),
    idempotencyKey: identifierValue(
      payload.idempotencyKey,
      "payload.idempotencyKey",
      240,
    ),
    correlationId: identifierValue(
      payload.correlationId,
      "payload.correlationId",
      240,
    ),
    humanApprovalRequired: true,
    audience: enumValue(payload.audience, "payload.audience", HERMES_AUDIENCES),
  };

  assertCommandChannelSeparation(parsed);
  return parsed;
}

function parseAttestation(value: unknown): HermesOrchestrationAttestation {
  const attestation = objectValue(value, "attestation");
  assertAllowedKeys(attestation, "attestation", [
    "algorithm",
    "keyId",
    "issuedAt",
    "expiresAt",
    "nonce",
    "payloadHash",
    "signature",
  ]);
  if (attestation.algorithm !== "Ed25519") {
    throw new HermesOrchestrationValidationError(
      "invalid_attestation_algorithm",
      "attestation.algorithm must be Ed25519",
      "attestation.algorithm",
    );
  }

  const signature = base64urlBytes(
    attestation.signature,
    "attestation.signature",
    64,
    64,
  );
  return {
    algorithm: "Ed25519",
    keyId: identifierValue(attestation.keyId, "attestation.keyId"),
    issuedAt: canonicalTimestamp(attestation.issuedAt, "attestation.issuedAt"),
    expiresAt: canonicalTimestamp(
      attestation.expiresAt,
      "attestation.expiresAt",
    ),
    nonce: base64urlBytes(attestation.nonce, "attestation.nonce", 16, 32),
    payloadHash: sha256Reference(
      attestation.payloadHash,
      "attestation.payloadHash",
    ),
    signature,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

export function parseHermesOrchestrationRequest(
  value: unknown,
): HermesOrchestrationRequest {
  const canonicalRequest = inspectedCanonicalJson(value, "request");
  if (Buffer.byteLength(canonicalRequest, "utf8") > HERMES_ORCHESTRATION_MAX_BYTES) {
    throw new HermesOrchestrationValidationError(
      "request_too_large",
      `Hermes orchestration requests cannot exceed ${HERMES_ORCHESTRATION_MAX_BYTES} bytes`,
      "request",
    );
  }

  const request = objectValue(value, "request");
  assertAllowedKeys(request, "request", [
    "schemaVersion",
    "attestation",
    "payload",
  ]);
  if (request.schemaVersion !== HERMES_ORCHESTRATION_SCHEMA_VERSION) {
    throw new HermesOrchestrationValidationError(
      "invalid_schema_version",
      `schemaVersion must be ${HERMES_ORCHESTRATION_SCHEMA_VERSION}`,
      "schemaVersion",
    );
  }

  return deepFreeze({
    schemaVersion: HERMES_ORCHESTRATION_SCHEMA_VERSION,
    attestation: parseAttestation(request.attestation),
    payload: parsePayload(request.payload),
  });
}

export function hermesOrchestrationCanonicalPayload(
  payload: HermesOrchestrationPayload,
): string {
  return inspectedCanonicalJson(payload, "payload");
}

export function hermesOrchestrationPayloadHash(
  payload: HermesOrchestrationPayload,
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(hermesOrchestrationCanonicalPayload(payload), "utf8")
    .digest("hex")}`;
}

export function hermesOrchestrationAttestationMessage(
  request: Pick<HermesOrchestrationRequest, "schemaVersion" | "attestation">,
): string {
  return inspectedCanonicalJson(
    {
      schemaVersion: request.schemaVersion,
      algorithm: request.attestation.algorithm,
      keyId: request.attestation.keyId,
      issuedAt: request.attestation.issuedAt,
      expiresAt: request.attestation.expiresAt,
      nonce: request.attestation.nonce,
      payloadHash: request.attestation.payloadHash,
    },
    "attestationMessage",
  );
}

export function verifyHermesOrchestrationAttestation({
  request,
  publicKey,
  nonceRegistry,
  now = new Date(),
}: {
  request: unknown;
  publicKey: string | Buffer;
  nonceRegistry: HermesNonceRegistry;
  now?: Date;
}): {
  request: HermesOrchestrationRequest;
  payloadHash: `sha256:${string}`;
} {
  const parsed = parseHermesOrchestrationRequest(request);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new HermesOrchestrationValidationError(
      "invalid_verification_time",
      "Verification time must be valid",
    );
  }

  const payloadHash = hermesOrchestrationPayloadHash(parsed.payload);
  if (payloadHash !== parsed.attestation.payloadHash) {
    throw new HermesOrchestrationValidationError(
      "attestation_payload_mismatch",
      "The signed payload hash does not match this Hermes proposal",
      "attestation.payloadHash",
    );
  }

  const issuedAtMs = Date.parse(parsed.attestation.issuedAt);
  const expiresAtMs = Date.parse(parsed.attestation.expiresAt);
  if (
    issuedAtMs > nowMs + HERMES_ATTESTATION_CLOCK_SKEW_MS ||
    nowMs - issuedAtMs > HERMES_ATTESTATION_MAX_AGE_MS ||
    expiresAtMs <= nowMs ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > HERMES_ATTESTATION_MAX_TTL_MS
  ) {
    throw new HermesOrchestrationValidationError(
      "invalid_attestation_window",
      "The Hermes attestation is stale, expired, future-dated, or outside its maximum TTL",
      "attestation.expiresAt",
    );
  }

  const scheduleAtMs = Date.parse(parsed.payload.requestedSchedule.notBefore);
  const proposalExpiresAtMs = Date.parse(
    parsed.payload.requestedSchedule.expiresAt,
  );
  if (
    scheduleAtMs < issuedAtMs - HERMES_ATTESTATION_CLOCK_SKEW_MS ||
    scheduleAtMs - issuedAtMs > HERMES_PROPOSAL_MAX_SCHEDULE_AHEAD_MS ||
    proposalExpiresAtMs <= nowMs
  ) {
    throw new HermesOrchestrationValidationError(
      "invalid_requested_schedule",
      "The proposed schedule is stale or outside the allowed scheduling horizon",
      "payload.requestedSchedule",
    );
  }

  let key;
  try {
    key = createPublicKey(publicKey);
  } catch {
    throw new HermesOrchestrationValidationError(
      "invalid_attestation_public_key",
      "The attestation public key is invalid",
    );
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new HermesOrchestrationValidationError(
      "invalid_attestation_public_key",
      "The attestation public key must be Ed25519",
    );
  }

  let verified = false;
  try {
    verified = verifySignature(
      null,
      Buffer.from(hermesOrchestrationAttestationMessage(parsed), "utf8"),
      key,
      Buffer.from(parsed.attestation.signature, "base64url"),
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    throw new HermesOrchestrationValidationError(
      "invalid_attestation_signature",
      "The Hermes attestation signature could not be verified",
      "attestation.signature",
    );
  }

  if (
    !nonceRegistry.claim({
      keyId: parsed.attestation.keyId,
      nonce: parsed.attestation.nonce,
      expiresAtMs,
      nowMs,
    })
  ) {
    throw new HermesOrchestrationValidationError(
      "attestation_replay",
      "The Hermes attestation nonce has already been claimed",
      "attestation.nonce",
    );
  }

  return { request: parsed, payloadHash };
}

import { createHash } from "node:crypto";

export const NOTIFICATION_OUTBOX_SCHEMA_VERSION =
  "cco.notification-outbox.v1" as const;
export const NOTIFICATION_OUTBOX_CHANNELS = [
  "in_app",
  "email",
  "sms",
  "imessage",
] as const;
export const NOTIFICATION_OUTBOX_STATES = [
  "queued",
  "leased",
  "retry",
  "dead",
  "sent",
] as const;
export const NOTIFICATION_OUTBOX_TENANT_KINDS = ["personal", "team"] as const;
export const NOTIFICATION_OUTBOX_DEFAULT_MAX_ATTEMPTS = 5;
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 12;
export const NOTIFICATION_OUTBOX_EXTERNAL_DELIVERY_ENABLED = false as const;

const MAX_PAYLOAD_BYTES = 65_536;
const MAX_PAYLOAD_DEPTH = 16;
const MAX_PAYLOAD_NODES = 2_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[a-z0-9][a-z0-9._:-]{15,199}$/;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_.-]{2,79}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const SAFE_CODE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const SAFE_PAYLOAD_SCALAR_PATTERN =
  /^(?:sha256:[0-9a-f]{64}|[A-Za-z0-9][A-Za-z0-9._+-]{0,119})$/;
const SENSITIVE_PAYLOAD_KEY =
  /(recipient|email|phone|imessage|address|token|secret|password|authorization|cookie|url|body|message|content|text|subject|title)|^(user[_-]?id|to|cc|bcc)$/i;

export type NotificationOutboxChannel =
  (typeof NOTIFICATION_OUTBOX_CHANNELS)[number];
export type NotificationOutboxState =
  (typeof NOTIFICATION_OUTBOX_STATES)[number];
export type NotificationOutboxTenantKind =
  (typeof NOTIFICATION_OUTBOX_TENANT_KINDS)[number];
export type NotificationOutboxSettlement = "sent" | "retry" | "dead";

export type NotificationOutboxJson =
  | null
  | boolean
  | number
  | string
  | NotificationOutboxJson[]
  | { [key: string]: NotificationOutboxJson };

export class NotificationOutboxError extends Error {
  readonly code:
    | "invalid_input"
    | "sensitive_payload"
    | "payload_too_large"
    | "invalid_transition"
    | "stale_fence"
    | "lease_expired"
    | "rpc_failed"
    | "invalid_response";

  constructor(code: NotificationOutboxError["code"], message: string) {
    super(message);
    this.name = "NotificationOutboxError";
    this.code = code;
  }
}

export interface NotificationOutboxDraft {
  readonly tenantKey: string;
  readonly channel: NotificationOutboxChannel;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly recipientIdentity: string;
  readonly payload: Record<string, unknown>;
  readonly availableAt?: string;
  readonly maxAttempts?: number;
}

export interface NotificationOutboxEnvelope {
  readonly schemaVersion: typeof NOTIFICATION_OUTBOX_SCHEMA_VERSION;
  readonly tenantKind: NotificationOutboxTenantKind;
  readonly tenantId: string;
  readonly tenantKey: string;
  readonly channel: NotificationOutboxChannel;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly recipientIdentityHash: string;
  readonly recipientRedacted: string;
  readonly payload: { [key: string]: NotificationOutboxJson };
  readonly payloadFingerprint: string;
  readonly availableAt: string;
  readonly maxAttempts: number;
}

export interface NotificationOutboxRecord extends NotificationOutboxEnvelope {
  readonly id: string;
  readonly state: NotificationOutboxState;
  readonly attemptCount: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly leaseFence: number;
  readonly lastErrorCode: string | null;
  readonly sentAt: string | null;
  readonly deadAt: string | null;
  readonly replayed: boolean;
}

export interface NotificationOutboxRpcError {
  readonly message: string;
  readonly code?: string;
}

export interface NotificationOutboxRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: NotificationOutboxRpcError | null }>;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function invalid(message: string): never {
  throw new NotificationOutboxError("invalid_input", message);
}

function normalizeUuid(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) invalid(`${field} must be a UUID`);
  return normalized;
}

export function parseNotificationOutboxTenantKey(value: string): {
  tenantKind: NotificationOutboxTenantKind;
  tenantId: string;
  tenantKey: string;
} {
  const normalized = value.trim().toLowerCase();
  const separator = normalized.indexOf(":");
  const tenantKind = normalized.slice(0, separator) as NotificationOutboxTenantKind;
  const tenantId = normalized.slice(separator + 1);
  if (
    separator < 1 ||
    !NOTIFICATION_OUTBOX_TENANT_KINDS.includes(tenantKind)
  ) {
    invalid("tenantKey must use personal:<uuid> or team:<uuid>");
  }
  const normalizedTenantId = normalizeUuid(tenantId, "tenantKey");
  return {
    tenantKind,
    tenantId: normalizedTenantId,
    tenantKey: `${tenantKind}:${normalizedTenantId}`,
  };
}

function normalizeTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) invalid(`${field} must be an ISO timestamp`);
  return new Date(milliseconds).toISOString();
}

function normalizeBoundedIdentifier(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    invalid(`${field} is invalid`);
  }
  return normalized;
}

function normalizeRecipientIdentity(
  channel: NotificationOutboxChannel,
  value: string,
): string {
  if (channel === "in_app") return normalizeUuid(value, "recipientIdentity");

  const trimmed = value.trim();
  if (channel === "email" || (channel === "imessage" && trimmed.includes("@"))) {
    const normalized = trimmed.toLowerCase();
    if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
      invalid("recipientIdentity must be a valid email address");
    }
    return normalized;
  }

  const normalized = trimmed.replace(/[\s().-]/g, "");
  if (!E164_PATTERN.test(normalized)) {
    invalid("recipientIdentity must use E.164 format");
  }
  return normalized;
}

function redactEmail(value: string): string {
  const [local, domain] = value.split("@");
  const domainParts = domain.split(".");
  const suffix = domainParts.length > 1 ? `.${domainParts.at(-1)}` : "";
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${suffix}`;
}

export function redactNotificationOutboxRecipient(
  channel: NotificationOutboxChannel,
  value: string,
): string {
  const normalized = normalizeRecipientIdentity(channel, value);
  if (channel === "in_app") {
    return `user:${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
  }
  if (normalized.includes("@")) return redactEmail(normalized);
  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

export function hashNotificationOutboxRecipient(
  channel: NotificationOutboxChannel,
  value: string,
): string {
  const normalized = normalizeRecipientIdentity(channel, value);
  return sha256(`${channel}\u0000${normalized}`);
}

export function hashNotificationProviderMessageId(
  provider: string,
  providerMessageId: string,
): string {
  const normalizedProvider = normalizeBoundedIdentifier(provider, "provider", 80);
  const normalizedMessageId = normalizeBoundedIdentifier(
    providerMessageId,
    "providerMessageId",
    500,
  );
  return sha256(`${normalizedProvider.toLowerCase()}\u0000${normalizedMessageId}`);
}

interface JsonBudget {
  nodes: number;
}

function normalizeJson(
  value: unknown,
  path: string,
  depth: number,
  budget: JsonBudget,
): NotificationOutboxJson {
  budget.nodes += 1;
  if (budget.nodes > MAX_PAYLOAD_NODES || depth > MAX_PAYLOAD_DEPTH) {
    throw new NotificationOutboxError(
      "payload_too_large",
      "Notification outbox payload is too complex",
    );
  }

  if (typeof value === "string") {
    if (!SAFE_PAYLOAD_SCALAR_PATTERN.test(value)) {
      throw new NotificationOutboxError(
        "sensitive_payload",
        `${path} contains URL or message material that must remain outside the outbox payload`,
      );
    }
    return value;
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(`${path} must contain finite numbers`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeJson(item, `${path}[${index}]`, depth + 1, budget),
    );
  }
  if (typeof value !== "object" || value === undefined) {
    invalid(`${path} must contain only JSON values`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid(`${path} must contain only plain JSON objects`);
  }

  const normalized: { [key: string]: NotificationOutboxJson } = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (SENSITIVE_PAYLOAD_KEY.test(key)) {
      throw new NotificationOutboxError(
        "sensitive_payload",
        `${path}.${key} contains recipient, bearer, or message material that must remain outside the outbox payload`,
      );
    }
    normalized[key] = normalizeJson(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
      depth + 1,
      budget,
    );
  }
  return normalized;
}

export function canonicalizeNotificationOutboxPayload(
  payload: Record<string, unknown>,
): { [key: string]: NotificationOutboxJson } {
  const normalized = normalizeJson(payload, "payload", 0, { nodes: 0 });
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
    invalid("payload must be a JSON object");
  }
  const bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new NotificationOutboxError(
      "payload_too_large",
      `Notification outbox payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
    );
  }
  return normalized as { [key: string]: NotificationOutboxJson };
}

function payloadFingerprintBasis(
  envelope: Omit<NotificationOutboxEnvelope, "payloadFingerprint" | "availableAt">,
): NotificationOutboxJson {
  return {
    schema_version: envelope.schemaVersion,
    tenant_kind: envelope.tenantKind,
    tenant_id: envelope.tenantId,
    channel: envelope.channel,
    event_type: envelope.eventType,
    recipient_identity_hash: envelope.recipientIdentityHash,
    recipient_redacted: envelope.recipientRedacted,
    payload: envelope.payload,
    max_attempts: envelope.maxAttempts,
  };
}

export function createNotificationOutboxEnvelope(
  draft: NotificationOutboxDraft,
  context: { now?: Date } = {},
): NotificationOutboxEnvelope {
  if (!NOTIFICATION_OUTBOX_CHANNELS.includes(draft.channel)) {
    invalid("channel is invalid");
  }
  const tenant = parseNotificationOutboxTenantKey(draft.tenantKey);
  const idempotencyKey = draft.idempotencyKey.trim().toLowerCase();
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    invalid("idempotencyKey must be 16-200 lowercase safe characters");
  }
  const eventType = draft.eventType.trim().toLowerCase();
  if (!EVENT_TYPE_PATTERN.test(eventType)) invalid("eventType is invalid");

  const maxAttempts =
    draft.maxAttempts ?? NOTIFICATION_OUTBOX_DEFAULT_MAX_ATTEMPTS;
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > NOTIFICATION_OUTBOX_MAX_ATTEMPTS
  ) {
    invalid(
      `maxAttempts must be between 1 and ${NOTIFICATION_OUTBOX_MAX_ATTEMPTS}`,
    );
  }

  const availableAt = normalizeTimestamp(
    draft.availableAt ?? (context.now ?? new Date()).toISOString(),
    "availableAt",
  );
  const payload = canonicalizeNotificationOutboxPayload(draft.payload);
  const recipientIdentityHash = hashNotificationOutboxRecipient(
    draft.channel,
    draft.recipientIdentity,
  );
  const recipientRedacted = redactNotificationOutboxRecipient(
    draft.channel,
    draft.recipientIdentity,
  );
  const fingerprintInput = {
    schemaVersion: NOTIFICATION_OUTBOX_SCHEMA_VERSION,
    tenantKind: tenant.tenantKind,
    tenantId: tenant.tenantId,
    tenantKey: tenant.tenantKey,
    channel: draft.channel,
    idempotencyKey,
    eventType,
    recipientIdentityHash,
    recipientRedacted,
    payload,
    maxAttempts,
  };

  return {
    ...fingerprintInput,
    payloadFingerprint: sha256(
      JSON.stringify(payloadFingerprintBasis(fingerprintInput)),
    ),
    availableAt,
  };
}

const ALLOWED_TRANSITIONS: Record<
  NotificationOutboxState,
  readonly NotificationOutboxState[]
> = {
  queued: ["leased"],
  leased: ["leased", "retry", "dead", "sent"],
  retry: ["leased"],
  dead: [],
  sent: [],
};

export function assertNotificationOutboxTransition(
  from: NotificationOutboxState,
  to: NotificationOutboxState,
): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new NotificationOutboxError(
      "invalid_transition",
      `Notification outbox cannot transition from ${from} to ${to}`,
    );
  }
}

export function assertNotificationOutboxLease(input: {
  readonly state: NotificationOutboxState;
  readonly leaseOwner: string | null;
  readonly expectedLeaseOwner: string;
  readonly leaseFence: number;
  readonly expectedLeaseFence: number;
  readonly leaseExpiresAt: string | null;
  readonly now: string;
}): void {
  if (
    input.state !== "leased" ||
    input.leaseOwner !== input.expectedLeaseOwner ||
    input.leaseFence !== input.expectedLeaseFence
  ) {
    throw new NotificationOutboxError(
      "stale_fence",
      "Notification outbox lease fencing token is stale",
    );
  }
  const now = normalizeTimestamp(input.now, "now");
  const leaseExpiresAt = input.leaseExpiresAt
    ? normalizeTimestamp(input.leaseExpiresAt, "leaseExpiresAt")
    : null;
  if (!leaseExpiresAt || Date.parse(leaseExpiresAt) <= Date.parse(now)) {
    throw new NotificationOutboxError(
      "lease_expired",
      "Notification outbox lease has expired",
    );
  }
}

export function notificationOutboxRetryAt(input: {
  readonly now: string;
  readonly attemptCount: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
}): string {
  const now = normalizeTimestamp(input.now, "now");
  if (!Number.isInteger(input.attemptCount) || input.attemptCount < 1) {
    invalid("attemptCount must be a positive integer");
  }
  const baseDelayMs = input.baseDelayMs ?? 30_000;
  const maxDelayMs = input.maxDelayMs ?? MAX_RETRY_DELAY_MS;
  if (
    !Number.isInteger(baseDelayMs) ||
    baseDelayMs < 1 ||
    !Number.isInteger(maxDelayMs) ||
    maxDelayMs < baseDelayMs ||
    maxDelayMs > MAX_RETRY_DELAY_MS
  ) {
    invalid("Retry delay bounds are invalid");
  }
  const delay = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.min(input.attemptCount - 1, 30),
  );
  return new Date(Date.parse(now) + delay).toISOString();
}

export function resolveNotificationOutboxFailure(input: {
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly retryable: boolean;
  readonly now: string;
  readonly retryAt?: string;
}): { state: "retry"; availableAt: string } | { state: "dead"; availableAt: null } {
  if (
    !Number.isInteger(input.attemptCount) ||
    !Number.isInteger(input.maxAttempts) ||
    input.attemptCount < 1 ||
    input.maxAttempts < 1 ||
    input.attemptCount > input.maxAttempts
  ) {
    invalid("Attempt bounds are invalid");
  }
  if (!input.retryable || input.attemptCount >= input.maxAttempts) {
    return { state: "dead", availableAt: null };
  }
  const now = normalizeTimestamp(input.now, "now");
  const availableAt = input.retryAt
    ? normalizeTimestamp(input.retryAt, "retryAt")
    : notificationOutboxRetryAt({
        now,
        attemptCount: input.attemptCount,
      });
  if (Date.parse(availableAt) <= Date.parse(now)) {
    invalid("retryAt must be later than now");
  }
  return {
    state: "retry",
    availableAt,
  };
}

export function notificationOutboxCanDispatchExternally(
  channel: Extract<NotificationOutboxChannel, "email" | "sms" | "imessage">,
): false {
  void channel;
  return NOTIFICATION_OUTBOX_EXTERNAL_DELIVERY_ENABLED;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NotificationOutboxError(
      "invalid_response",
      "Notification outbox RPC returned an invalid record",
    );
  }
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== "string" || !(row[key] as string)) {
    throw new NotificationOutboxError(
      "invalid_response",
      `Notification outbox RPC omitted ${key}`,
    );
  }
  return row[key] as string;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  if (row[key] === null || row[key] === undefined) return null;
  return requiredString(row, key);
}

function requiredInteger(row: Record<string, unknown>, key: string): number {
  if (typeof row[key] !== "number" || !Number.isInteger(row[key])) {
    throw new NotificationOutboxError(
      "invalid_response",
      `Notification outbox RPC omitted ${key}`,
    );
  }
  return row[key] as number;
}

function parseNotificationOutboxRecord(value: unknown): NotificationOutboxRecord {
  const row = asRecord(value);
  const channel = requiredString(row, "channel") as NotificationOutboxChannel;
  const state = requiredString(row, "status") as NotificationOutboxState;
  const tenantKind = requiredString(
    row,
    "tenant_kind",
  ) as NotificationOutboxTenantKind;
  if (!NOTIFICATION_OUTBOX_CHANNELS.includes(channel)) {
    throw new NotificationOutboxError("invalid_response", "RPC returned an invalid channel");
  }
  if (!NOTIFICATION_OUTBOX_STATES.includes(state)) {
    throw new NotificationOutboxError("invalid_response", "RPC returned an invalid status");
  }
  if (!NOTIFICATION_OUTBOX_TENANT_KINDS.includes(tenantKind)) {
    throw new NotificationOutboxError(
      "invalid_response",
      "RPC returned an invalid tenant kind",
    );
  }
  const tenantId = normalizeUuid(requiredString(row, "tenant_id"), "tenantId");
  const payload = canonicalizeNotificationOutboxPayload(
    asRecord(row.payload),
  );
  return {
    schemaVersion: NOTIFICATION_OUTBOX_SCHEMA_VERSION,
    id: normalizeUuid(requiredString(row, "outbox_id"), "outboxId"),
    tenantKind,
    tenantId,
    tenantKey: `${tenantKind}:${tenantId}`,
    channel,
    idempotencyKey: requiredString(row, "idempotency_key"),
    eventType: requiredString(row, "event_type"),
    recipientIdentityHash: requiredString(row, "recipient_identity_hash"),
    recipientRedacted: requiredString(row, "recipient_redacted"),
    payload,
    payloadFingerprint: requiredString(row, "payload_fingerprint"),
    state,
    attemptCount: requiredInteger(row, "attempt_count"),
    maxAttempts: requiredInteger(row, "max_attempts"),
    availableAt: requiredString(row, "available_at"),
    leaseOwner: nullableString(row, "lease_owner"),
    leaseExpiresAt: nullableString(row, "lease_expires_at"),
    leaseFence: requiredInteger(row, "lease_fence"),
    lastErrorCode: nullableString(row, "last_error_code"),
    sentAt: nullableString(row, "sent_at"),
    deadAt: nullableString(row, "dead_at"),
    replayed: row.replayed === true,
  };
}

function assertNotificationOutboxRecordAuthority(
  record: NotificationOutboxRecord,
  expected: {
    tenantKey: string;
    outboxId?: string;
    channel?: NotificationOutboxChannel;
    idempotencyKey?: string;
  },
) {
  if (
    record.tenantKey !== expected.tenantKey ||
    (expected.outboxId !== undefined && record.id !== expected.outboxId) ||
    (expected.channel !== undefined && record.channel !== expected.channel) ||
    (expected.idempotencyKey !== undefined &&
      record.idempotencyKey !== expected.idempotencyKey)
  ) {
    throw new NotificationOutboxError(
      "invalid_response",
      "Notification outbox RPC returned a record outside the requested authority",
    );
  }
  return record;
}

async function callOutboxRpc(
  client: NotificationOutboxRpcClient,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.rpc(functionName, parameters);
  if (result.error) {
    throw new NotificationOutboxError(
      "rpc_failed",
      `${functionName} failed: ${result.error.code ?? "database_error"}`,
    );
  }
  return result.data;
}

export async function enqueueNotificationOutbox(
  client: NotificationOutboxRpcClient,
  draft: NotificationOutboxDraft,
  context: { now?: Date } = {},
): Promise<NotificationOutboxRecord> {
  const envelope = createNotificationOutboxEnvelope(draft, context);
  const data = await callOutboxRpc(client, "enqueue_notification_outbox", {
    p_tenant_kind: envelope.tenantKind,
    p_tenant_id: envelope.tenantId,
    p_channel: envelope.channel,
    p_idempotency_key: envelope.idempotencyKey,
    p_event_type: envelope.eventType,
    p_recipient_identity_hash: envelope.recipientIdentityHash,
    p_recipient_redacted: envelope.recipientRedacted,
    p_payload: envelope.payload,
    p_available_at: envelope.availableAt,
    p_max_attempts: envelope.maxAttempts,
  });
  return assertNotificationOutboxRecordAuthority(
    parseNotificationOutboxRecord(data),
    {
      tenantKey: envelope.tenantKey,
      channel: envelope.channel,
      idempotencyKey: envelope.idempotencyKey,
    },
  );
}

export async function claimNotificationOutbox(
  client: NotificationOutboxRpcClient,
  input: {
    readonly tenantKey: string;
    readonly leaseOwner: string;
    readonly limit?: number;
    readonly leaseSeconds?: number;
  },
): Promise<NotificationOutboxRecord[]> {
  const tenant = parseNotificationOutboxTenantKey(input.tenantKey);
  const leaseOwner = normalizeBoundedIdentifier(input.leaseOwner, "leaseOwner", 160);
  const limit = input.limit ?? 20;
  const leaseSeconds = input.leaseSeconds ?? 60;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalid("limit must be between 1 and 100");
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
    invalid("leaseSeconds must be between 5 and 900");
  }
  const data = await callOutboxRpc(client, "claim_notification_outbox", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_lease_owner: leaseOwner,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (!Array.isArray(data)) {
    throw new NotificationOutboxError(
      "invalid_response",
      "claim_notification_outbox did not return a record list",
    );
  }
  return data.map((value) =>
    assertNotificationOutboxRecordAuthority(parseNotificationOutboxRecord(value), {
      tenantKey: tenant.tenantKey,
    }),
  );
}

export async function renewNotificationOutboxLease(
  client: NotificationOutboxRpcClient,
  input: {
    readonly tenantKey: string;
    readonly outboxId: string;
    readonly leaseOwner: string;
    readonly leaseFence: number;
    readonly leaseSeconds?: number;
  },
): Promise<NotificationOutboxRecord> {
  const tenant = parseNotificationOutboxTenantKey(input.tenantKey);
  const leaseSeconds = input.leaseSeconds ?? 60;
  if (!Number.isInteger(input.leaseFence) || input.leaseFence < 1) {
    invalid("leaseFence must be a positive integer");
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
    invalid("leaseSeconds must be between 5 and 900");
  }
  const data = await callOutboxRpc(client, "renew_notification_outbox_lease", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_outbox_id: normalizeUuid(input.outboxId, "outboxId"),
    p_lease_owner: normalizeBoundedIdentifier(input.leaseOwner, "leaseOwner", 160),
    p_lease_fence: input.leaseFence,
    p_lease_seconds: leaseSeconds,
  });
  return assertNotificationOutboxRecordAuthority(
    parseNotificationOutboxRecord(data),
    {
      tenantKey: tenant.tenantKey,
      outboxId: normalizeUuid(input.outboxId, "outboxId"),
    },
  );
}

export async function settleNotificationOutboxAttempt(
  client: NotificationOutboxRpcClient,
  input: {
    readonly tenantKey: string;
    readonly outboxId: string;
    readonly leaseOwner: string;
    readonly leaseFence: number;
    readonly outcome: NotificationOutboxSettlement;
    readonly retryAt?: string | null;
    readonly errorCode?: string | null;
    readonly provider?: string | null;
    readonly providerMessageId?: string | null;
  },
): Promise<NotificationOutboxRecord> {
  const tenant = parseNotificationOutboxTenantKey(input.tenantKey);
  if (!Number.isInteger(input.leaseFence) || input.leaseFence < 1) {
    invalid("leaseFence must be a positive integer");
  }
  if (!(["sent", "retry", "dead"] as const).includes(input.outcome)) {
    invalid("outcome is invalid");
  }
  const provider = input.provider
    ? normalizeBoundedIdentifier(input.provider, "provider", 80).toLowerCase()
    : null;
  if (input.providerMessageId && !provider) {
    invalid("provider is required with providerMessageId");
  }
  const errorCode = input.errorCode?.trim().toLowerCase() || null;
  if (errorCode && !SAFE_CODE_PATTERN.test(errorCode)) {
    invalid("errorCode is invalid");
  }
  const retryAt = input.retryAt
    ? normalizeTimestamp(input.retryAt, "retryAt")
    : null;
  const data = await callOutboxRpc(client, "settle_notification_outbox_attempt", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_outbox_id: normalizeUuid(input.outboxId, "outboxId"),
    p_lease_owner: normalizeBoundedIdentifier(input.leaseOwner, "leaseOwner", 160),
    p_lease_fence: input.leaseFence,
    p_outcome: input.outcome,
    p_retry_at: retryAt,
    p_error_code: errorCode,
    p_provider: provider,
    p_provider_message_id_hash:
      provider && input.providerMessageId
        ? hashNotificationProviderMessageId(provider, input.providerMessageId)
        : null,
  });
  return assertNotificationOutboxRecordAuthority(
    parseNotificationOutboxRecord(data),
    {
      tenantKey: tenant.tenantKey,
      outboxId: normalizeUuid(input.outboxId, "outboxId"),
    },
  );
}

import { createHash } from "node:crypto";

export const WEBHOOK_OUTBOX_SCHEMA_VERSION =
  "cco.webhook-outbox.v1" as const;
export const WEBHOOK_OUTBOX_STATES = [
  "queued",
  "leased",
  "retry",
  "dead",
  "sent",
] as const;
export const WEBHOOK_OUTBOX_DEFAULT_MAX_ATTEMPTS = 5;
export const WEBHOOK_OUTBOX_MAX_ATTEMPTS = 12;

const MAX_PAYLOAD_BYTES = 65_536;
const MAX_PAYLOAD_DEPTH = 16;
const MAX_PAYLOAD_NODES = 2_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[a-z0-9][a-z0-9._:-]{15,199}$/;
const EVENT_PATTERN = /^[a-z][a-z0-9_.-]{2,79}$/;
const SAFE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const SAFE_ERROR_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;

export type WebhookOutboxState = (typeof WEBHOOK_OUTBOX_STATES)[number];
export type WebhookOutboxSettlement = "sent" | "retry" | "dead";
export type WebhookOutboxJson =
  | null
  | boolean
  | number
  | string
  | WebhookOutboxJson[]
  | { [key: string]: WebhookOutboxJson };

export class WebhookOutboxError extends Error {
  readonly code:
    | "invalid_input"
    | "payload_too_large"
    | "invalid_transition"
    | "stale_fence"
    | "lease_expired"
    | "idempotency_conflict"
    | "rpc_failed"
    | "invalid_response";

  constructor(code: WebhookOutboxError["code"], message: string) {
    super(message);
    this.name = "WebhookOutboxError";
    this.code = code;
  }
}

export interface WebhookOutboxDraft {
  readonly webhookId: string;
  readonly expectedTeamId: string;
  readonly event: string;
  readonly idempotencyKey: string;
  readonly payload: Record<string, unknown>;
  readonly availableAt?: string;
  readonly maxAttempts?: number;
}

export interface WebhookOutboxEnvelope {
  readonly schemaVersion: typeof WEBHOOK_OUTBOX_SCHEMA_VERSION;
  readonly webhookId: string;
  readonly expectedTeamId: string;
  readonly event: string;
  readonly idempotencyKey: string;
  readonly payload: { [key: string]: WebhookOutboxJson };
  readonly payloadFingerprint: string;
  readonly availableAt: string;
  readonly maxAttempts: number;
}

export interface WebhookOutboxRecord extends WebhookOutboxEnvelope {
  readonly id: string;
  readonly state: WebhookOutboxState;
  readonly attemptCount: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly leaseFence: number;
  readonly responseCode: number | null;
  readonly durationMs: number | null;
  readonly lastErrorCode: string | null;
  readonly deliveredAt: string | null;
  readonly completedAt: string | null;
  readonly replayed: boolean;
}

export interface WebhookOutboxRpcError {
  readonly message: string;
  readonly code?: string;
}

export interface WebhookOutboxRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: WebhookOutboxRpcError | null }>;
}

interface JsonBudget {
  nodes: number;
}

function invalid(message: string): never {
  throw new WebhookOutboxError("invalid_input", message);
}

function normalizeUuid(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) invalid(`${field} must be a UUID`);
  return normalized;
}

function normalizeTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) invalid(`${field} must be an ISO timestamp`);
  return new Date(milliseconds).toISOString();
}

function normalizeSafeIdentifier(
  value: string,
  field: string,
  pattern: RegExp,
): string {
  const normalized = value.trim().toLowerCase();
  if (!pattern.test(normalized)) invalid(`${field} is invalid`);
  return normalized;
}

function canonicalJson(
  value: unknown,
  path: string,
  depth: number,
  budget: JsonBudget,
): WebhookOutboxJson {
  budget.nodes += 1;
  if (budget.nodes > MAX_PAYLOAD_NODES || depth > MAX_PAYLOAD_DEPTH) {
    throw new WebhookOutboxError(
      "payload_too_large",
      "Webhook outbox payload is too complex",
    );
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(`${path} must be a finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      canonicalJson(item, `${path}[${index}]`, depth + 1, budget),
    );
  }
  if (typeof value !== "object" || value === undefined) {
    invalid(`${path} must contain JSON values only`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalid(`${path} must be a plain object`);
  }
  const result: { [key: string]: WebhookOutboxJson } = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (!key || key.length > 120 || /[\u0000-\u001f\u007f]/.test(key)) {
      invalid(`${path} contains an invalid key`);
    }
    const child = (value as Record<string, unknown>)[key];
    if (child === undefined) invalid(`${path}.${key} cannot be undefined`);
    result[key] = canonicalJson(child, `${path}.${key}`, depth + 1, budget);
  }
  return result;
}

export function canonicalizeWebhookOutboxPayload(
  payload: Record<string, unknown>,
): { [key: string]: WebhookOutboxJson } {
  const canonical = canonicalJson(payload, "payload", 0, { nodes: 0 });
  if (!canonical || Array.isArray(canonical) || typeof canonical !== "object") {
    invalid("payload must be an object");
  }
  const bytes = Buffer.byteLength(JSON.stringify(canonical), "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new WebhookOutboxError(
      "payload_too_large",
      `Webhook outbox payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
    );
  }
  return canonical as { [key: string]: WebhookOutboxJson };
}

export function createWebhookOutboxEnvelope(
  draft: WebhookOutboxDraft,
  context: { now?: Date } = {},
): WebhookOutboxEnvelope {
  const webhookId = normalizeUuid(draft.webhookId, "webhookId");
  const expectedTeamId = normalizeUuid(draft.expectedTeamId, "expectedTeamId");
  const event = normalizeSafeIdentifier(draft.event, "event", EVENT_PATTERN);
  const idempotencyKey = normalizeSafeIdentifier(
    draft.idempotencyKey,
    "idempotencyKey",
    IDEMPOTENCY_PATTERN,
  );
  const maxAttempts =
    draft.maxAttempts ?? WEBHOOK_OUTBOX_DEFAULT_MAX_ATTEMPTS;
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > WEBHOOK_OUTBOX_MAX_ATTEMPTS
  ) {
    invalid(
      `maxAttempts must be between 1 and ${WEBHOOK_OUTBOX_MAX_ATTEMPTS}`,
    );
  }
  const payload = canonicalizeWebhookOutboxPayload(draft.payload);
  const availableAt = normalizeTimestamp(
    draft.availableAt ?? (context.now ?? new Date()).toISOString(),
    "availableAt",
  );
  const fingerprintBasis = JSON.stringify({
    schema_version: WEBHOOK_OUTBOX_SCHEMA_VERSION,
    webhook_id: webhookId,
    expected_team_id: expectedTeamId,
    event,
    payload: Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "timestamp"),
    ),
    max_attempts: maxAttempts,
  });
  return {
    schemaVersion: WEBHOOK_OUTBOX_SCHEMA_VERSION,
    webhookId,
    expectedTeamId,
    event,
    idempotencyKey,
    payload,
    payloadFingerprint: `sha256:${createHash("sha256")
      .update(fingerprintBasis, "utf8")
      .digest("hex")}`,
    availableAt,
    maxAttempts,
  };
}

const ALLOWED_TRANSITIONS: Record<
  WebhookOutboxState,
  readonly WebhookOutboxState[]
> = {
  queued: ["leased", "dead"],
  leased: ["leased", "retry", "dead", "sent"],
  retry: ["leased", "dead"],
  dead: [],
  sent: [],
};

export function assertWebhookOutboxTransition(
  from: WebhookOutboxState,
  to: WebhookOutboxState,
) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new WebhookOutboxError(
      "invalid_transition",
      `Webhook outbox cannot transition from ${from} to ${to}`,
    );
  }
}

export function assertWebhookOutboxLease(input: {
  readonly state: WebhookOutboxState;
  readonly leaseOwner: string | null;
  readonly expectedLeaseOwner: string;
  readonly leaseFence: number;
  readonly expectedLeaseFence: number;
  readonly leaseExpiresAt: string | null;
  readonly now: string;
}) {
  if (
    input.state !== "leased" ||
    input.leaseOwner !== input.expectedLeaseOwner ||
    input.leaseFence !== input.expectedLeaseFence
  ) {
    throw new WebhookOutboxError(
      "stale_fence",
      "Webhook outbox lease fencing token is stale",
    );
  }
  const now = normalizeTimestamp(input.now, "now");
  const expiresAt = input.leaseExpiresAt
    ? normalizeTimestamp(input.leaseExpiresAt, "leaseExpiresAt")
    : null;
  if (!expiresAt || Date.parse(expiresAt) <= Date.parse(now)) {
    throw new WebhookOutboxError(
      "lease_expired",
      "Webhook outbox lease has expired",
    );
  }
}

export function webhookOutboxRetryAt(input: {
  readonly now: string;
  readonly attemptCount: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
}) {
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WebhookOutboxError(
      "invalid_response",
      "Webhook outbox RPC returned an invalid record",
    );
  }
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, key: string) {
  if (typeof row[key] !== "string" || !row[key]) {
    throw new WebhookOutboxError(
      "invalid_response",
      `Webhook outbox RPC omitted ${key}`,
    );
  }
  return row[key] as string;
}

function nullableString(row: Record<string, unknown>, key: string) {
  if (row[key] === null || row[key] === undefined) return null;
  return requiredString(row, key);
}

function nullableTimestamp(row: Record<string, unknown>, key: string) {
  const value = nullableString(row, key);
  return value === null ? null : normalizeTimestamp(value, key);
}

function nullableInteger(row: Record<string, unknown>, key: string) {
  if (row[key] === null || row[key] === undefined) return null;
  return requiredInteger(row, key);
}

function requiredInteger(row: Record<string, unknown>, key: string) {
  if (typeof row[key] !== "number" || !Number.isInteger(row[key])) {
    throw new WebhookOutboxError(
      "invalid_response",
      `Webhook outbox RPC omitted ${key}`,
    );
  }
  return row[key] as number;
}

function invalidRpcRecord(message: string): never {
  throw new WebhookOutboxError("invalid_response", message);
}

function parseWebhookOutboxRecord(value: unknown): WebhookOutboxRecord {
  const row = asRecord(value);
  const state = requiredString(row, "status") as WebhookOutboxState;
  const payloadFingerprint = requiredString(row, "payload_fingerprint");
  if (!WEBHOOK_OUTBOX_STATES.includes(state)) {
    throw new WebhookOutboxError(
      "invalid_response",
      "Webhook outbox RPC returned an invalid state",
    );
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(payloadFingerprint)) {
    throw new WebhookOutboxError(
      "invalid_response",
      "Webhook outbox RPC returned an invalid payload fingerprint",
    );
  }
  if (typeof row.replayed !== "boolean") {
    invalidRpcRecord("Webhook outbox RPC omitted replayed");
  }
  const leaseOwnerValue = nullableString(row, "lease_owner");
  const leaseOwner = leaseOwnerValue
    ? normalizeSafeIdentifier(
        leaseOwnerValue,
        "leaseOwner",
        SAFE_IDENTIFIER_PATTERN,
      )
    : null;
  const errorCodeValue = nullableString(row, "error_code");
  const lastErrorCode = errorCodeValue
    ? normalizeSafeIdentifier(errorCodeValue, "errorCode", SAFE_ERROR_PATTERN)
    : null;
  const record: WebhookOutboxRecord = {
    schemaVersion: WEBHOOK_OUTBOX_SCHEMA_VERSION,
    id: normalizeUuid(requiredString(row, "delivery_id"), "deliveryId"),
    webhookId: normalizeUuid(requiredString(row, "webhook_id"), "webhookId"),
    expectedTeamId: normalizeUuid(
      requiredString(row, "expected_team_id"),
      "expectedTeamId",
    ),
    event: normalizeSafeIdentifier(
      requiredString(row, "event"),
      "event",
      EVENT_PATTERN,
    ),
    idempotencyKey: normalizeSafeIdentifier(
      requiredString(row, "idempotency_key"),
      "idempotencyKey",
      IDEMPOTENCY_PATTERN,
    ),
    payload: canonicalizeWebhookOutboxPayload(asRecord(row.payload)),
    payloadFingerprint,
    state,
    attemptCount: requiredInteger(row, "attempt_count"),
    maxAttempts: requiredInteger(row, "max_attempts"),
    availableAt: normalizeTimestamp(
      requiredString(row, "available_at"),
      "availableAt",
    ),
    leaseOwner,
    leaseExpiresAt: nullableTimestamp(row, "lease_expires_at"),
    leaseFence: requiredInteger(row, "lease_fence"),
    responseCode: nullableInteger(row, "response_code"),
    durationMs: nullableInteger(row, "duration_ms"),
    lastErrorCode,
    deliveredAt: nullableTimestamp(row, "delivered_at"),
    completedAt: nullableTimestamp(row, "completed_at"),
    replayed: row.replayed,
  };
  if (
    record.attemptCount < 0 ||
    record.maxAttempts < 1 ||
    record.maxAttempts > WEBHOOK_OUTBOX_MAX_ATTEMPTS ||
    record.attemptCount > record.maxAttempts ||
    record.leaseFence < record.attemptCount ||
    (record.responseCode !== null &&
      (record.responseCode < 100 || record.responseCode > 599)) ||
    (record.durationMs !== null && record.durationMs < 0)
  ) {
    invalidRpcRecord("Webhook outbox RPC returned invalid counters");
  }
  if (
    (record.state === "queued" && record.attemptCount !== 0) ||
    (record.state === "retry" &&
      (record.attemptCount < 1 || record.attemptCount >= record.maxAttempts)) ||
    ((record.state === "leased" || record.state === "sent") &&
      record.attemptCount < 1)
  ) {
    invalidRpcRecord("Webhook outbox RPC returned an invalid state counter");
  }
  if (
    (record.state === "leased" &&
      (!record.leaseOwner || !record.leaseExpiresAt)) ||
    (record.state !== "leased" &&
      (record.leaseOwner !== null || record.leaseExpiresAt !== null))
  ) {
    invalidRpcRecord("Webhook outbox RPC returned an invalid lease shape");
  }
  if (
    (record.state === "sent" &&
      (record.responseCode === null ||
        record.responseCode < 200 ||
        record.responseCode > 299 ||
        record.lastErrorCode !== null ||
        record.deliveredAt === null ||
        record.completedAt === null)) ||
    (record.state === "dead" &&
      (record.lastErrorCode === null ||
        record.deliveredAt !== null ||
        record.completedAt === null)) ||
    ((record.state === "queued" ||
      record.state === "leased" ||
      record.state === "retry") &&
      (record.deliveredAt !== null || record.completedAt !== null))
  ) {
    invalidRpcRecord("Webhook outbox RPC returned an invalid terminal shape");
  }
  return record;
}

async function callOutboxRpc(
  client: WebhookOutboxRpcClient,
  functionName: string,
  parameters: Record<string, unknown>,
) {
  const result = await client.rpc(functionName, parameters);
  if (result.error) {
    const message = result.error.message;
    const code = message.includes("webhook_outbox_stale_fence")
      ? "stale_fence"
      : message.includes("webhook_outbox_lease_expired")
        ? "lease_expired"
        : message.includes("webhook_outbox_idempotency_conflict") ||
            message.includes("webhook_outbox_settlement_conflict") ||
            result.error.code === "23505"
          ? "idempotency_conflict"
          : "rpc_failed";
    throw new WebhookOutboxError(
      code,
      `${functionName} failed: ${result.error.code ?? "database_error"}`,
    );
  }
  return result.data;
}

export async function enqueueWebhookOutboxDelivery(
  client: WebhookOutboxRpcClient,
  draft: WebhookOutboxDraft,
  context: { now?: Date } = {},
) {
  const envelope = createWebhookOutboxEnvelope(draft, context);
  const data = await callOutboxRpc(client, "enqueue_webhook_delivery", {
    p_webhook_id: envelope.webhookId,
    p_expected_team_id: envelope.expectedTeamId,
    p_event: envelope.event,
    p_payload: envelope.payload,
    p_idempotency_key: envelope.idempotencyKey,
    p_available_at: envelope.availableAt,
    p_max_attempts: envelope.maxAttempts,
  });
  const record = parseWebhookOutboxRecord(data);
  if (
    record.webhookId !== envelope.webhookId ||
    record.expectedTeamId !== envelope.expectedTeamId ||
    record.event !== envelope.event ||
    record.idempotencyKey !== envelope.idempotencyKey ||
    record.maxAttempts !== envelope.maxAttempts ||
    JSON.stringify(record.payload) !== JSON.stringify(envelope.payload)
  ) {
    throw new WebhookOutboxError(
      "invalid_response",
      "Webhook outbox RPC returned a record outside the requested authority",
    );
  }
  return record;
}

export async function claimWebhookOutboxDeliveries(
  client: WebhookOutboxRpcClient,
  input: {
    readonly leaseOwner: string;
    readonly limit?: number;
    readonly leaseSeconds?: number;
  },
) {
  const leaseOwner = normalizeSafeIdentifier(
    input.leaseOwner,
    "leaseOwner",
    SAFE_IDENTIFIER_PATTERN,
  );
  const limit = input.limit ?? 20;
  const leaseSeconds = input.leaseSeconds ?? 60;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalid("limit must be between 1 and 100");
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) {
    invalid("leaseSeconds must be between 15 and 900");
  }
  const data = await callOutboxRpc(client, "claim_webhook_deliveries", {
    p_lease_owner: leaseOwner,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (!Array.isArray(data)) {
    throw new WebhookOutboxError(
      "invalid_response",
      "claim_webhook_deliveries did not return a record list",
    );
  }
  return data.map(parseWebhookOutboxRecord);
}

export async function renewWebhookOutboxLease(
  client: WebhookOutboxRpcClient,
  input: {
    readonly deliveryId: string;
    readonly leaseOwner: string;
    readonly leaseFence: number;
    readonly leaseSeconds?: number;
  },
) {
  const deliveryId = normalizeUuid(input.deliveryId, "deliveryId");
  const leaseOwner = normalizeSafeIdentifier(
    input.leaseOwner,
    "leaseOwner",
    SAFE_IDENTIFIER_PATTERN,
  );
  if (!Number.isInteger(input.leaseFence) || input.leaseFence < 1) {
    invalid("leaseFence must be a positive integer");
  }
  const leaseSeconds = input.leaseSeconds ?? 60;
  if (
    !Number.isInteger(leaseSeconds) ||
    leaseSeconds < 15 ||
    leaseSeconds > 900
  ) {
    invalid("leaseSeconds must be between 15 and 900");
  }
  const data = await callOutboxRpc(client, "renew_webhook_delivery_lease", {
    p_delivery_id: deliveryId,
    p_lease_owner: leaseOwner,
    p_lease_fence: input.leaseFence,
    p_lease_seconds: leaseSeconds,
  });
  const record = parseWebhookOutboxRecord(data);
  if (
    record.id !== deliveryId ||
    record.state !== "leased" ||
    record.leaseOwner !== leaseOwner ||
    record.leaseFence !== input.leaseFence ||
    record.leaseExpiresAt === null
  ) {
    throw new WebhookOutboxError(
      "invalid_response",
      "Webhook outbox RPC returned the wrong renewed lease",
    );
  }
  return record;
}

export async function settleWebhookOutboxDelivery(
  client: WebhookOutboxRpcClient,
  input: {
    readonly deliveryId: string;
    readonly leaseOwner: string;
    readonly leaseFence: number;
    readonly outcome: WebhookOutboxSettlement;
    readonly responseCode?: number | null;
    readonly durationMs?: number | null;
    readonly errorCode?: string | null;
    readonly availableAt?: string | null;
  },
) {
  const deliveryId = normalizeUuid(input.deliveryId, "deliveryId");
  const leaseOwner = normalizeSafeIdentifier(
    input.leaseOwner,
    "leaseOwner",
    SAFE_IDENTIFIER_PATTERN,
  );
  if (!Number.isInteger(input.leaseFence) || input.leaseFence < 1) {
    invalid("leaseFence must be a positive integer");
  }
  if (!(["sent", "retry", "dead"] as const).includes(input.outcome)) {
    invalid("outcome is invalid");
  }
  if (
    input.responseCode !== undefined &&
    input.responseCode !== null &&
    (!Number.isInteger(input.responseCode) ||
      input.responseCode < 100 ||
      input.responseCode > 599)
  ) {
    invalid("responseCode is invalid");
  }
  if (
    input.durationMs !== undefined &&
    input.durationMs !== null &&
    (!Number.isInteger(input.durationMs) || input.durationMs < 0)
  ) {
    invalid("durationMs is invalid");
  }
  const errorCode = input.errorCode
    ? normalizeSafeIdentifier(input.errorCode, "errorCode", SAFE_ERROR_PATTERN)
    : null;
  const availableAt = input.availableAt
    ? normalizeTimestamp(input.availableAt, "availableAt")
    : null;
  const responseCode = input.responseCode ?? null;
  if (
    (input.outcome === "sent" &&
      (responseCode === null ||
        responseCode < 200 ||
        responseCode > 299 ||
        errorCode !== null ||
        availableAt !== null)) ||
    (input.outcome === "retry" &&
      (errorCode === null || availableAt === null)) ||
    (input.outcome === "dead" &&
      (errorCode === null || availableAt !== null))
  ) {
    invalid("settlement fields do not match outcome");
  }
  const data = await callOutboxRpc(client, "settle_webhook_delivery", {
    p_delivery_id: deliveryId,
    p_lease_owner: leaseOwner,
    p_lease_fence: input.leaseFence,
    p_outcome: input.outcome,
    p_response_code: responseCode,
    p_duration_ms: input.durationMs ?? null,
    p_error_code: errorCode,
    p_available_at: availableAt,
  });
  const record = parseWebhookOutboxRecord(data);
  if (record.id !== deliveryId) {
    throw new WebhookOutboxError(
      "invalid_response",
      "Webhook outbox RPC returned the wrong delivery",
    );
  }
  return record;
}

import { createHash, randomUUID } from "node:crypto";

export const COLLABORATION_API_VERSION = "2026-07-14" as const;
export const MAX_EVENT_READ_LIMIT = 100;
export const DEFAULT_EVENT_READ_LIMIT = 50;

export type CollaborationCapability =
  | "events.read"
  | "thread.create"
  | "thread.reply"
  | "thread.moderate"
  | "presence.write";

export interface CollaborationScope {
  tenantId: string;
  projectId: string;
  assetId: string;
  assetVersionId: string;
}

export interface CollaborationPrincipal {
  actorId: string;
  tenantId: string;
  authorizationVersion: string;
  capabilities: readonly CollaborationCapability[];
}

export interface CollaborationResourceBinding extends CollaborationScope {
  currentAssetVersionId: string;
  authorizationVersion: string;
  allowedCapabilities: readonly CollaborationCapability[];
}

export type CollaborationCommandType =
  | "thread.create"
  | "thread.reply"
  | "thread.resolve"
  | "thread.reopen"
  | "presence.join"
  | "presence.leave";

export interface CollaborationCommand {
  apiVersion: typeof COLLABORATION_API_VERSION;
  commandId: string;
  idempotencyKey: string;
  expectedSequence: number;
  scope: CollaborationScope;
  type: CollaborationCommandType;
  payload: Record<string, unknown>;
}

export type CollaborationEventType =
  | "thread.created"
  | "thread.replied"
  | "thread.resolved"
  | "thread.reopened"
  | "presence.joined"
  | "presence.left";

export interface CollaborationEvent {
  eventId: string;
  apiVersion: typeof COLLABORATION_API_VERSION;
  type: CollaborationEventType;
  sequence: number;
  scope: CollaborationScope;
  actorId: string;
  commandId: string;
  traceId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface CollaborationReceipt {
  receiptId: string;
  commandId: string;
  idempotencyKey: string;
  traceId: string;
  duplicate: boolean;
  acceptedAt: string;
  authorizationVersion: string;
  scope: CollaborationScope;
  event: CollaborationEvent;
  audit: {
    actorId: string;
    capability: CollaborationCapability;
    outcome: "accepted";
  };
}

export interface CollaborationProblem {
  code:
    | "invalid_request"
    | "unauthorized_scope"
    | "permission_denied"
    | "authorization_stale"
    | "asset_version_stale"
    | "idempotency_conflict"
    | "sequence_conflict"
    | "thread_not_found"
    | "thread_state_conflict"
    | "read_limit_exceeded";
  status: number;
  message: string;
  recovery: string;
  traceId: string;
  retryable: boolean;
  expectedSequence?: number;
}

export type ControlPlaneResult<T> =
  | { ok: true; value: T }
  | { ok: false; problem: CollaborationProblem };

interface StoredIdempotency {
  fingerprint: string;
  receipt: CollaborationReceipt;
}

export interface CollaborationEventStore {
  currentSequence(scope: CollaborationScope): number;
  append(event: CollaborationEvent, expectedSequence: number): boolean;
  events(scope: CollaborationScope, afterSequence: number, limit: number): CollaborationEvent[];
  idempotency(key: string): StoredIdempotency | undefined;
  rememberIdempotency(key: string, value: StoredIdempotency): void;
}

function canonicalScope(scope: CollaborationScope) {
  return [scope.tenantId, scope.projectId, scope.assetId, scope.assetVersionId].join("\u001f");
}

function sameScope(left: CollaborationScope, right: CollaborationScope) {
  return canonicalScope(left) === canonicalScope(right);
}

export class InMemoryCollaborationEventStore implements CollaborationEventStore {
  readonly #events = new Map<string, CollaborationEvent[]>();
  readonly #idempotency = new Map<string, StoredIdempotency>();

  currentSequence(scope: CollaborationScope) {
    return this.#events.get(canonicalScope(scope))?.at(-1)?.sequence ?? 0;
  }

  append(event: CollaborationEvent, expectedSequence: number) {
    const key = canonicalScope(event.scope);
    const events = this.#events.get(key) ?? [];
    if ((events.at(-1)?.sequence ?? 0) !== expectedSequence) return false;
    events.push(structuredClone(event));
    this.#events.set(key, events);
    return true;
  }

  events(scope: CollaborationScope, afterSequence: number, limit: number) {
    return (this.#events.get(canonicalScope(scope)) ?? [])
      .filter((event) => event.sequence > afterSequence)
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }

  idempotency(key: string) {
    const stored = this.#idempotency.get(key);
    return stored ? structuredClone(stored) : undefined;
  }

  rememberIdempotency(key: string, value: StoredIdempotency) {
    this.#idempotency.set(key, structuredClone(value));
  }
}

interface ControlPlaneDependencies {
  store?: CollaborationEventStore;
  now?: () => string;
  id?: () => string;
}

interface ThreadState {
  exists: boolean;
  status: "open" | "resolved";
  revision: number;
}

const CAPABILITY_BY_COMMAND: Record<CollaborationCommandType, CollaborationCapability> = {
  "thread.create": "thread.create",
  "thread.reply": "thread.reply",
  "thread.resolve": "thread.moderate",
  "thread.reopen": "thread.moderate",
  "presence.join": "presence.write",
  "presence.leave": "presence.write",
};

const EVENT_BY_COMMAND: Record<CollaborationCommandType, CollaborationEventType> = {
  "thread.create": "thread.created",
  "thread.reply": "thread.replied",
  "thread.resolve": "thread.resolved",
  "thread.reopen": "thread.reopened",
  "presence.join": "presence.joined",
  "presence.leave": "presence.left",
};

export class CollaborationControlPlane {
  readonly #store: CollaborationEventStore;
  readonly #now: () => string;
  readonly #id: () => string;

  constructor({ store, now, id }: ControlPlaneDependencies = {}) {
    this.#store = store ?? new InMemoryCollaborationEventStore();
    this.#now = now ?? (() => new Date().toISOString());
    this.#id = id ?? randomUUID;
  }

  execute(
    command: CollaborationCommand,
    principal: CollaborationPrincipal,
    resource: CollaborationResourceBinding,
    traceId = this.#id(),
  ): ControlPlaneResult<CollaborationReceipt> {
    // Keep the domain boundary fail-closed even when it is called without the
    // HTTP adapter (jobs and realtime transports may call it directly later).
    const parsed = parseCollaborationCommand(command, traceId);
    if (!parsed.ok) return parsed;
    command = parsed.value;

    const capability = CAPABILITY_BY_COMMAND[command.type];
    const authorization = authorize(command.scope, principal, resource, capability, traceId);
    if (!authorization.ok) return authorization;

    const fingerprint = commandFingerprint(command);
    const idempotencyKey = `${canonicalScope(command.scope)}\u001f${principal.actorId}\u001f${command.idempotencyKey}`;
    const previous = this.#store.idempotency(idempotencyKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return failure(
          "idempotency_conflict",
          409,
          "The idempotency key was already used for a different command.",
          traceId,
          false,
        );
      }
      return {
        ok: true,
        value: { ...previous.receipt, duplicate: true },
      };
    }

    const currentSequence = this.#store.currentSequence(command.scope);
    if (command.expectedSequence !== currentSequence) {
      return failure(
        "sequence_conflict",
        409,
        "The collaboration stream advanced. Refresh before retrying with a new command.",
        traceId,
        true,
        currentSequence,
      );
    }

    const eventData = this.#eventData(command, principal, traceId);
    if (!eventData.ok) return eventData;

    const acceptedAt = this.#now();
    const event: CollaborationEvent = {
      eventId: this.#id(),
      apiVersion: COLLABORATION_API_VERSION,
      type: EVENT_BY_COMMAND[command.type],
      sequence: currentSequence + 1,
      scope: { ...command.scope },
      actorId: principal.actorId,
      commandId: command.commandId,
      traceId,
      occurredAt: acceptedAt,
      data: eventData.value,
    };

    if (!this.#store.append(event, currentSequence)) {
      return failure(
        "sequence_conflict",
        409,
        "The collaboration stream advanced while the command was being accepted.",
        traceId,
        true,
        this.#store.currentSequence(command.scope),
      );
    }

    const receipt: CollaborationReceipt = {
      receiptId: this.#id(),
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      traceId,
      duplicate: false,
      acceptedAt,
      authorizationVersion: resource.authorizationVersion,
      scope: { ...command.scope },
      event,
      audit: {
        actorId: principal.actorId,
        capability,
        outcome: "accepted",
      },
    };
    this.#store.rememberIdempotency(idempotencyKey, { fingerprint, receipt });
    return { ok: true, value: receipt };
  }

  readEvents(
    scope: CollaborationScope,
    afterSequence: number,
    limit: number,
    principal: CollaborationPrincipal,
    resource: CollaborationResourceBinding,
    traceId = this.#id(),
  ): ControlPlaneResult<{
    items: CollaborationEvent[];
    nextSequence: number;
    hasMore: boolean;
    traceId: string;
  }> {
    const authorization = authorize(scope, principal, resource, "events.read", traceId);
    if (!authorization.ok) return authorization;
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      return failure(
        "invalid_request",
        400,
        "afterSequence must be a non-negative safe integer.",
        traceId,
        false,
      );
    }
    if (!Number.isSafeInteger(limit) || limit < 1) {
      return failure("invalid_request", 400, "limit must be a positive safe integer.", traceId, false);
    }
    if (limit > MAX_EVENT_READ_LIMIT) {
      return failure(
        "read_limit_exceeded",
        400,
        `limit cannot exceed ${MAX_EVENT_READ_LIMIT}.`,
        traceId,
        false,
      );
    }

    const items = this.#store.events(scope, afterSequence, limit);
    const nextSequence = items.at(-1)?.sequence ?? afterSequence;
    return {
      ok: true,
      value: {
        items,
        nextSequence,
        hasMore: this.#store.currentSequence(scope) > nextSequence,
        traceId,
      },
    };
  }

  #eventData(
    command: CollaborationCommand,
    principal: CollaborationPrincipal,
    traceId: string,
  ): ControlPlaneResult<Record<string, unknown>> {
    if (command.type === "thread.create") {
      return {
        ok: true,
        value: {
          threadId: `thr_${createHash("sha256").update(command.commandId).digest("hex").slice(0, 24)}`,
          body: command.payload.body,
          timecodeMs: command.payload.timecodeMs ?? null,
          position: command.payload.position ?? null,
          threadRevision: 1,
        },
      };
    }

    if (command.type === "presence.join" || command.type === "presence.leave") {
      return {
        ok: true,
        value: {
          participantId: principal.actorId,
          presenceRevision: command.payload.presenceRevision,
          state: command.type === "presence.join" ? "present" : "left",
        },
      };
    }

    const threadId = command.payload.threadId as string;
    const thread = this.#threadState(command.scope, threadId);
    if (!thread.exists) {
      return failure("thread_not_found", 404, "The collaboration thread was not found.", traceId, false);
    }

    if (command.type === "thread.reply") {
      if (thread.status !== "open") {
        return failure(
          "thread_state_conflict",
          409,
          "Replies require an open collaboration thread.",
          traceId,
          false,
        );
      }
      return {
        ok: true,
        value: {
          threadId,
          body: command.payload.body,
          threadRevision: thread.revision + 1,
        },
      };
    }

    const expectedThreadRevision = command.payload.expectedThreadRevision as number;
    if (expectedThreadRevision !== thread.revision) {
      return failure(
        "thread_state_conflict",
        409,
        "The thread changed. Refresh before changing its state.",
        traceId,
        true,
      );
    }
    if (command.type === "thread.resolve" && thread.status !== "open") {
      return failure("thread_state_conflict", 409, "The thread is already resolved.", traceId, false);
    }
    if (command.type === "thread.reopen" && thread.status !== "resolved") {
      return failure("thread_state_conflict", 409, "Only a resolved thread can be reopened.", traceId, false);
    }
    return {
      ok: true,
      value: {
        threadId,
        previousState: thread.status,
        state: command.type === "thread.resolve" ? "resolved" : "open",
        reason: command.payload.reason ?? null,
        threadRevision: thread.revision + 1,
      },
    };
  }

  #threadState(scope: CollaborationScope, threadId: string): ThreadState {
    const events = this.#store.events(scope, 0, Number.MAX_SAFE_INTEGER);
    let state: ThreadState = { exists: false, status: "open", revision: 0 };
    for (const event of events) {
      if (event.data.threadId !== threadId) continue;
      if (event.type === "thread.created") state = { exists: true, status: "open", revision: 1 };
      else if (event.type === "thread.resolved") {
        state = { exists: true, status: "resolved", revision: event.data.threadRevision as number };
      } else if (event.type === "thread.reopened") {
        state = { exists: true, status: "open", revision: event.data.threadRevision as number };
      } else if (event.type === "thread.replied") {
        state = { ...state, revision: event.data.threadRevision as number };
      }
    }
    return state;
  }
}

function authorize(
  scope: CollaborationScope,
  principal: CollaborationPrincipal,
  resource: CollaborationResourceBinding,
  capability: CollaborationCapability,
  traceId: string,
): ControlPlaneResult<true> {
  if (scope.tenantId !== principal.tenantId || !sameScope(scope, resource)) {
    return failure(
      "unauthorized_scope",
      404,
      "The collaboration resource was not found in the authorized scope.",
      traceId,
      false,
    );
  }
  if (scope.assetVersionId !== resource.currentAssetVersionId) {
    return failure(
      "asset_version_stale",
      409,
      "Writes and live reads must target the current asset version.",
      traceId,
      true,
    );
  }
  if (principal.authorizationVersion !== resource.authorizationVersion) {
    return failure(
      "authorization_stale",
      409,
      "Membership or permission state changed. Re-authorize before retrying.",
      traceId,
      true,
    );
  }
  if (
    !principal.capabilities.includes(capability) ||
    !resource.allowedCapabilities.includes(capability)
  ) {
    return failure(
      "permission_denied",
      403,
      "The authenticated participant cannot perform this collaboration action.",
      traceId,
      false,
    );
  }
  return { ok: true, value: true };
}

function failure(
  code: CollaborationProblem["code"],
  status: number,
  message: string,
  traceId: string,
  retryable: boolean,
  expectedSequence?: number,
): ControlPlaneResult<never> {
  return {
    ok: false,
    problem: {
      code,
      status,
      message,
      recovery: recoveryGuidance(code),
      traceId,
      retryable,
      expectedSequence,
    },
  };
}

function recoveryGuidance(code: CollaborationProblem["code"]) {
  switch (code) {
    case "invalid_request":
      return "Correct the named request fields and submit a new request.";
    case "unauthorized_scope":
      return "Return to an authorized workspace and select the project, asset, and version again.";
    case "permission_denied":
      return "Ask a workspace administrator for the required collaboration permission.";
    case "authorization_stale":
      return "Refresh your workspace session so current membership and permissions can be checked.";
    case "asset_version_stale":
      return "Refresh the asset and retry against its current version.";
    case "idempotency_conflict":
      return "Keep the original key only for an identical retry; use a new key for a new command.";
    case "sequence_conflict":
      return "Read the latest events, apply them locally, and retry with the returned sequence.";
    case "thread_not_found":
      return "Refresh collaboration events and select an existing thread in this asset version.";
    case "thread_state_conflict":
      return "Refresh the thread, review its latest state, and submit a new command if still needed.";
    case "read_limit_exceeded":
      return `Reduce the requested limit to ${MAX_EVENT_READ_LIMIT} or fewer events.`;
  }
}

function commandFingerprint(command: CollaborationCommand) {
  return createHash("sha256").update(stableJson(command)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isBody(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 4_000;
}

export function parseCollaborationScope(value: unknown): ControlPlaneResult<CollaborationScope> {
  const traceId = "validation";
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ["tenantId", "projectId", "assetId", "assetVersionId"]) ||
    !isId(value.tenantId) ||
    !isId(value.projectId) ||
    !isId(value.assetId) ||
    !isId(value.assetVersionId)
  ) {
    return failure(
      "invalid_request",
      400,
      "scope requires valid tenantId, projectId, assetId, and assetVersionId values.",
      traceId,
      false,
    );
  }
  return {
    ok: true,
    value: {
      tenantId: value.tenantId,
      projectId: value.projectId,
      assetId: value.assetId,
      assetVersionId: value.assetVersionId,
    },
  };
}

export function parseCollaborationCommand(
  value: unknown,
  traceId = "validation",
): ControlPlaneResult<CollaborationCommand> {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, [
      "apiVersion",
      "commandId",
      "idempotencyKey",
      "expectedSequence",
      "scope",
      "type",
      "payload",
    ]) ||
    value.apiVersion !== COLLABORATION_API_VERSION ||
    !isId(value.commandId) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_PATTERN.test(value.idempotencyKey) ||
    !Number.isSafeInteger(value.expectedSequence) ||
    (value.expectedSequence as number) < 0 ||
    !isObject(value.payload)
  ) {
    return failure(
      "invalid_request",
      400,
      "The collaboration command envelope is invalid or uses an unsupported API version.",
      traceId,
      false,
    );
  }

  const scope = parseCollaborationScope(value.scope);
  if (!scope.ok) return { ok: false, problem: { ...scope.problem, traceId } };

  const type = value.type;
  if (typeof type !== "string" || !Object.hasOwn(CAPABILITY_BY_COMMAND, type)) {
    return failure("invalid_request", 400, "The collaboration command type is unsupported.", traceId, false);
  }

  if (!validPayload(type as CollaborationCommandType, value.payload)) {
    return failure("invalid_request", 400, "The collaboration command payload is invalid.", traceId, false);
  }

  return {
    ok: true,
    value: {
      apiVersion: COLLABORATION_API_VERSION,
      commandId: value.commandId,
      idempotencyKey: value.idempotencyKey,
      expectedSequence: value.expectedSequence as number,
      scope: scope.value,
      type: type as CollaborationCommandType,
      payload: normalizedPayload(type as CollaborationCommandType, value.payload),
    },
  };
}

function validPayload(type: CollaborationCommandType, payload: Record<string, unknown>) {
  if (type === "thread.create") {
    if (!hasOnlyKeys(payload, ["body", "timecodeMs", "position"]) || !isBody(payload.body)) return false;
    if (
      payload.timecodeMs !== undefined &&
      (!Number.isSafeInteger(payload.timecodeMs) || (payload.timecodeMs as number) < 0)
    ) return false;
    if (payload.position !== undefined) {
      if (!isObject(payload.position) || !hasOnlyKeys(payload.position, ["x", "y"])) return false;
      const { x, y } = payload.position;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (x < 0 || x > 1 || y < 0 || y > 1) return false;
    }
    return true;
  }
  if (type === "thread.reply") {
    return hasOnlyKeys(payload, ["threadId", "body"]) && isId(payload.threadId) && isBody(payload.body);
  }
  if (type === "thread.resolve" || type === "thread.reopen") {
    return (
      hasOnlyKeys(payload, ["threadId", "expectedThreadRevision", "reason"]) &&
      isId(payload.threadId) &&
      Number.isSafeInteger(payload.expectedThreadRevision) &&
      (payload.expectedThreadRevision as number) > 0 &&
      (payload.reason === undefined ||
        (typeof payload.reason === "string" && payload.reason.trim().length > 0 && payload.reason.length <= 500))
    );
  }
  return (
    hasOnlyKeys(payload, ["presenceRevision"]) &&
    Number.isSafeInteger(payload.presenceRevision) &&
    (payload.presenceRevision as number) > 0
  );
}

function normalizedPayload(type: CollaborationCommandType, payload: Record<string, unknown>) {
  if (type === "thread.create" || type === "thread.reply") {
    return { ...payload, body: (payload.body as string).trim() };
  }
  if (type === "thread.resolve" || type === "thread.reopen") {
    return {
      ...payload,
      ...(typeof payload.reason === "string" ? { reason: payload.reason.trim() } : {}),
    };
  }
  return { ...payload };
}

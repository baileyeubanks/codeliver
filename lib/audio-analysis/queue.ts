import {
  bindVerifiedSourceChecksum,
  sha256Canonical,
  type MediaIntelligenceScope,
  type SourceChecksumAuthority,
} from "../transcript/durable.ts";
import {
  deterministicUuid,
  isSameTranscriptSource,
  type TranscriptSourceBinding,
} from "../transcript/core.ts";

export const MEDIA_INTELLIGENCE_QUEUE_SCHEMA = "cco.media-intelligence-queue.v1" as const;

const QUEUE_GENESIS_HASH = "0".repeat(64);
const MAX_LEASE_MS = 15 * 60_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60_000;

export type MediaIntelligenceJobKind = "transcript" | "analysis";
export type MediaIntelligenceJobStatus =
  | "queued"
  | "leased"
  | "cancel_requested"
  | "succeeded"
  | "cancelled"
  | "dead_lettered";
export type MediaIntelligenceQueueEventType =
  | "enqueued"
  | "leased"
  | "lease_renewed"
  | "retry_scheduled"
  | "cancel_requested"
  | "cancelled"
  | "completed"
  | "dead_lettered";

export class MediaIntelligenceQueueError extends Error {
  readonly code:
    | "invalid_job"
    | "checksum_required"
    | "backpressure"
    | "idempotency_conflict"
    | "job_conflict"
    | "job_not_found"
    | "invalid_transition"
    | "lease_expired"
    | "stale_fence"
    | "cancellation_pending"
    | "replay_mismatch";

  constructor(code: MediaIntelligenceQueueError["code"], message: string) {
    super(message);
    this.name = "MediaIntelligenceQueueError";
    this.code = code;
  }
}

export interface MediaIntelligenceExecutionPolicy {
  readonly providerId: string;
  readonly providerMode: "demo" | "external" | "local";
  readonly networkAccess: "none" | "required";
  readonly paid: boolean;
  readonly estimatedCostMicrounits: number;
  readonly budgetReservationId: string | null;
}

export interface MediaIntelligenceJobSpec {
  readonly jobId: string;
  readonly kind: MediaIntelligenceJobKind;
  readonly scope: MediaIntelligenceScope;
  readonly source: TranscriptSourceBinding;
  readonly inputSha256: string;
  readonly inputReplayDigest: string;
  readonly expectedOutputReplayDigest: string | null;
  readonly execution: MediaIntelligenceExecutionPolicy;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly notBefore: string;
  readonly sourceAccessUntil: string;
  readonly createdAt: string;
}

export interface MediaIntelligenceQueueEvent {
  readonly schemaVersion: typeof MEDIA_INTELLIGENCE_QUEUE_SCHEMA;
  readonly jobId: string;
  readonly sequence: number;
  readonly eventId: string;
  readonly type: MediaIntelligenceQueueEventType;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly attempt: number;
  readonly notBefore: string | null;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: string | null;
  readonly resultSha256: string | null;
  readonly reasonCode: string | null;
  readonly previousEventSha256: string;
  readonly eventSha256: string;
}

export interface MediaIntelligenceJobSnapshot {
  readonly spec: MediaIntelligenceJobSpec;
  readonly sourceChecksumReceiptId: string;
  readonly status: MediaIntelligenceJobStatus;
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: string | null;
  readonly resultSha256: string | null;
  readonly terminalReason: string | null;
  readonly latestEventSha256: string;
  readonly idempotentReplay: boolean;
}

export interface MediaIntelligenceCompletion {
  readonly inputSha256: string;
  readonly sourceSha256: string;
  readonly outputSha256: string;
  readonly outputReplayDigest: string;
}

export interface MediaIntelligenceQueueLimits {
  readonly maxOutstandingPerOrganization: number;
  readonly maxActiveLeasesPerOrganization: number;
}

export const DEFAULT_MEDIA_INTELLIGENCE_QUEUE_LIMITS: MediaIntelligenceQueueLimits = Object.freeze({
  maxOutstandingPerOrganization: 1_000,
  maxActiveLeasesPerOrganization: 16,
});

interface StoredJob {
  readonly spec: MediaIntelligenceJobSpec;
  readonly sourceChecksumReceiptId: string;
  readonly events: readonly MediaIntelligenceQueueEvent[];
  readonly specSha256: string;
}

interface QueueIdempotencyReceipt {
  readonly jobId: string;
  readonly specSha256: string;
}

export type InMemoryQueueFaultPoint = "before_enqueue_commit" | "before_transition_commit";

export interface MediaIntelligenceQueue {
  get(jobId: string): MediaIntelligenceJobSnapshot | null;
  history(jobId: string): readonly MediaIntelligenceQueueEvent[];
  enqueue(input: {
    readonly spec: MediaIntelligenceJobSpec;
    readonly idempotencyKey: string;
    readonly actorId: string;
  }): Promise<MediaIntelligenceJobSnapshot>;
  claim(input: {
    readonly workerId: string;
    readonly now: string;
    readonly leaseMs: number;
  }): Promise<MediaIntelligenceJobSnapshot | null>;
  renew(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
    readonly leaseMs: number;
  }): Promise<MediaIntelligenceJobSnapshot>;
  complete(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
    readonly result: MediaIntelligenceCompletion;
  }): Promise<MediaIntelligenceJobSnapshot>;
  fail(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
    readonly reasonCode: string;
    readonly retryable: boolean;
  }): Promise<MediaIntelligenceJobSnapshot>;
  requestCancellation(input: {
    readonly jobId: string;
    readonly actorId: string;
    readonly now: string;
    readonly reasonCode: string;
  }): Promise<MediaIntelligenceJobSnapshot>;
  acknowledgeCancellation(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
  }): Promise<MediaIntelligenceJobSnapshot>;
  reapExpired(input: {
    readonly jobId: string;
    readonly actorId: string;
    readonly now: string;
  }): Promise<MediaIntelligenceJobSnapshot>;
}

function assertIdentifier(value: string, field: string): void {
  if (!value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new MediaIntelligenceQueueError("invalid_job", `${field} is invalid`);
  }
}

function assertSha256(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new MediaIntelligenceQueueError("invalid_job", `${field} must be a lowercase SHA-256 digest`);
  }
}

function normalizedTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new MediaIntelligenceQueueError("invalid_job", `${field} must be an ISO timestamp`);
  }
  return new Date(milliseconds).toISOString();
}

function cloneFrozen<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    Object.freeze(candidate);
    for (const child of Object.values(candidate as Record<string, unknown>)) freeze(child);
  };
  freeze(clone);
  return clone;
}

function scopeKey(scope: MediaIntelligenceScope): string {
  return `${scope.organizationId}\u0000${scope.projectId}\u0000${scope.assetId}\u0000${scope.versionId}`;
}

function queueEventBasis(
  event: Omit<MediaIntelligenceQueueEvent, "eventSha256">,
): unknown {
  return event;
}

function validateSpec(spec: MediaIntelligenceJobSpec): MediaIntelligenceJobSpec {
  assertIdentifier(spec.jobId, "jobId");
  assertIdentifier(spec.scope.organizationId, "organizationId");
  assertIdentifier(spec.scope.projectId, "projectId");
  assertIdentifier(spec.scope.assetId, "assetId");
  assertIdentifier(spec.scope.versionId, "versionId");
  assertIdentifier(spec.execution.providerId, "providerId");
  if (spec.source.assetId !== spec.scope.assetId || spec.source.versionId !== spec.scope.versionId) {
    throw new MediaIntelligenceQueueError("invalid_job", "Job source does not match its asset/version scope");
  }
  if (spec.source.mediaSha256 === null) {
    throw new MediaIntelligenceQueueError("checksum_required", "Queued work requires a checksum-bound source");
  }
  assertSha256(spec.source.mediaSha256, "source.mediaSha256");
  assertSha256(spec.inputSha256, "inputSha256");
  assertIdentifier(spec.inputReplayDigest, "inputReplayDigest");
  if (spec.expectedOutputReplayDigest !== null) {
    assertIdentifier(spec.expectedOutputReplayDigest, "expectedOutputReplayDigest");
  }
  if (!Number.isInteger(spec.maxAttempts) || spec.maxAttempts < 1 || spec.maxAttempts > 10) {
    throw new MediaIntelligenceQueueError("invalid_job", "maxAttempts must be between 1 and 10");
  }
  if (!Number.isInteger(spec.retryDelayMs) || spec.retryDelayMs < 0 || spec.retryDelayMs > MAX_RETRY_DELAY_MS) {
    throw new MediaIntelligenceQueueError("invalid_job", "retryDelayMs is outside the supported range");
  }
  if (
    !Number.isInteger(spec.execution.estimatedCostMicrounits) ||
    spec.execution.estimatedCostMicrounits < 0
  ) {
    throw new MediaIntelligenceQueueError("invalid_job", "Estimated cost must be a non-negative integer");
  }
  if (spec.execution.paid && !spec.execution.budgetReservationId) {
    throw new MediaIntelligenceQueueError("invalid_job", "Paid work requires a budget reservation");
  }
  if (!spec.execution.paid && spec.execution.estimatedCostMicrounits !== 0) {
    throw new MediaIntelligenceQueueError("invalid_job", "Unpaid work cannot declare a non-zero cost");
  }
  if (spec.execution.networkAccess === "required" && spec.execution.providerMode === "demo") {
    throw new MediaIntelligenceQueueError("invalid_job", "Demo providers cannot require network access");
  }
  const createdAt = normalizedTimestamp(spec.createdAt, "createdAt");
  const notBefore = normalizedTimestamp(spec.notBefore, "notBefore");
  const sourceAccessUntil = normalizedTimestamp(spec.sourceAccessUntil, "sourceAccessUntil");
  if (Date.parse(notBefore) < Date.parse(createdAt)) {
    throw new MediaIntelligenceQueueError("invalid_job", "notBefore cannot precede job creation");
  }
  if (Date.parse(sourceAccessUntil) < Date.parse(notBefore)) {
    throw new MediaIntelligenceQueueError("invalid_job", "Source access expires before the job can run");
  }
  return cloneFrozen({ ...spec, createdAt, notBefore, sourceAccessUntil });
}

function eventFor(
  stored: StoredJob,
  input: {
    readonly type: MediaIntelligenceQueueEventType;
    readonly actorId: string;
    readonly occurredAt: string;
    readonly attempt: number;
    readonly notBefore?: string | null;
    readonly leaseToken?: string | null;
    readonly leaseExpiresAt?: string | null;
    readonly resultSha256?: string | null;
    readonly reasonCode?: string | null;
  },
): MediaIntelligenceQueueEvent {
  assertIdentifier(input.actorId, "queue event actorId");
  const occurredAt = normalizedTimestamp(input.occurredAt, "queue event occurredAt");
  const previousEventSha256 = stored.events.at(-1)?.eventSha256 ?? QUEUE_GENESIS_HASH;
  const sequence = stored.events.length + 1;
  const basis: Omit<MediaIntelligenceQueueEvent, "eventSha256"> = {
    schemaVersion: MEDIA_INTELLIGENCE_QUEUE_SCHEMA,
    jobId: stored.spec.jobId,
    sequence,
    eventId: deterministicUuid({
      kind: "media-intelligence-queue-event",
      jobId: stored.spec.jobId,
      sequence,
      type: input.type,
      occurredAt,
      previousEventSha256,
    }),
    type: input.type,
    actorId: input.actorId,
    occurredAt,
    attempt: input.attempt,
    notBefore: input.notBefore ?? null,
    leaseToken: input.leaseToken ?? null,
    leaseExpiresAt: input.leaseExpiresAt ?? null,
    resultSha256: input.resultSha256 ?? null,
    reasonCode: input.reasonCode ?? null,
    previousEventSha256,
  };
  return cloneFrozen({
    ...basis,
    eventSha256: sha256Canonical(queueEventBasis(basis)),
  });
}

export function verifyQueueHistory(
  jobId: string,
  events: readonly MediaIntelligenceQueueEvent[],
): readonly string[] {
  const errors: string[] = [];
  let previous = QUEUE_GENESIS_HASH;
  let previousTimestamp = -Infinity;
  events.forEach((event, index) => {
    if (event.jobId !== jobId) errors.push(`Queue event ${event.eventId} job mismatch`);
    if (event.sequence !== index + 1) errors.push(`Queue event ${event.eventId} sequence mismatch`);
    if (event.previousEventSha256 !== previous) errors.push(`Queue event ${event.eventId} chain mismatch`);
    const basis = Object.fromEntries(
      Object.entries(event).filter(([key]) => key !== "eventSha256"),
    );
    if (event.eventSha256 !== sha256Canonical(queueEventBasis(basis as Omit<MediaIntelligenceQueueEvent, "eventSha256">))) {
      errors.push(`Queue event ${event.eventId} checksum mismatch`);
    }
    const timestamp = Date.parse(event.occurredAt);
    if (!Number.isFinite(timestamp) || timestamp < previousTimestamp) {
      errors.push(`Queue event ${event.eventId} timestamp regression`);
    }
    previousTimestamp = timestamp;
    previous = event.eventSha256;
  });
  return Object.freeze(errors);
}

function reduceJob(stored: StoredJob, idempotentReplay = false): MediaIntelligenceJobSnapshot {
  const chainErrors = verifyQueueHistory(stored.spec.jobId, stored.events);
  if (chainErrors.length > 0) {
    throw new MediaIntelligenceQueueError(
      "invalid_transition",
      `Queue history is invalid: ${chainErrors.join("; ")}`,
    );
  }
  let status: MediaIntelligenceJobStatus = "queued";
  let attempts = 0;
  let nextAttemptAt = stored.spec.notBefore;
  let leaseToken: string | null = null;
  let leaseExpiresAt: string | null = null;
  let resultSha256: string | null = null;
  let terminalReason: string | null = null;

  for (const event of stored.events) {
    if (event.type === "leased") {
      status = "leased";
      attempts = event.attempt;
      leaseToken = event.leaseToken;
      leaseExpiresAt = event.leaseExpiresAt;
    } else if (event.type === "lease_renewed") {
      leaseToken = event.leaseToken;
      leaseExpiresAt = event.leaseExpiresAt;
    } else if (event.type === "retry_scheduled") {
      status = "queued";
      nextAttemptAt = event.notBefore ?? nextAttemptAt;
      leaseToken = null;
      leaseExpiresAt = null;
      terminalReason = event.reasonCode;
    } else if (event.type === "cancel_requested") {
      status = "cancel_requested";
      terminalReason = event.reasonCode;
    } else if (event.type === "cancelled") {
      status = "cancelled";
      leaseToken = null;
      leaseExpiresAt = null;
      terminalReason = event.reasonCode;
    } else if (event.type === "completed") {
      status = "succeeded";
      leaseToken = null;
      leaseExpiresAt = null;
      resultSha256 = event.resultSha256;
      terminalReason = null;
    } else if (event.type === "dead_lettered") {
      status = "dead_lettered";
      leaseToken = null;
      leaseExpiresAt = null;
      terminalReason = event.reasonCode;
    }
  }
  return cloneFrozen({
    spec: stored.spec,
    sourceChecksumReceiptId: stored.sourceChecksumReceiptId,
    status,
    attempts,
    nextAttemptAt,
    leaseToken,
    leaseExpiresAt,
    resultSha256,
    terminalReason,
    latestEventSha256: stored.events.at(-1)?.eventSha256 ?? QUEUE_GENESIS_HASH,
    idempotentReplay,
  });
}

export class InMemoryMediaIntelligenceQueue implements MediaIntelligenceQueue {
  private jobs = new Map<string, StoredJob>();
  private idempotency = new Map<string, QueueIdempotencyReceipt>();
  private readonly checksumAuthority: SourceChecksumAuthority;
  private readonly faultInjector: ((point: InMemoryQueueFaultPoint) => void | Promise<void>) | undefined;
  private readonly limits: MediaIntelligenceQueueLimits;

  constructor(
    checksumAuthority: SourceChecksumAuthority,
    faultInjector?: (point: InMemoryQueueFaultPoint) => void | Promise<void>,
    limits: MediaIntelligenceQueueLimits = DEFAULT_MEDIA_INTELLIGENCE_QUEUE_LIMITS,
  ) {
    this.checksumAuthority = checksumAuthority;
    this.faultInjector = faultInjector;
    if (
      !Number.isInteger(limits.maxOutstandingPerOrganization) ||
      limits.maxOutstandingPerOrganization < 1 ||
      !Number.isInteger(limits.maxActiveLeasesPerOrganization) ||
      limits.maxActiveLeasesPerOrganization < 1 ||
      limits.maxActiveLeasesPerOrganization > limits.maxOutstandingPerOrganization
    ) {
      throw new MediaIntelligenceQueueError("invalid_job", "Queue limits are invalid");
    }
    this.limits = Object.freeze({ ...limits });
  }

  get(jobId: string): MediaIntelligenceJobSnapshot | null {
    const stored = this.jobs.get(jobId);
    return stored ? reduceJob(stored) : null;
  }

  history(jobId: string): readonly MediaIntelligenceQueueEvent[] {
    const stored = this.jobs.get(jobId);
    return stored ? cloneFrozen([...stored.events]) : Object.freeze([]);
  }

  async enqueue(input: {
    readonly spec: MediaIntelligenceJobSpec;
    readonly idempotencyKey: string;
    readonly actorId: string;
  }): Promise<MediaIntelligenceJobSnapshot> {
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    assertIdentifier(input.actorId, "actorId");
    const spec = validateSpec(input.spec);
    const specSha256 = sha256Canonical(spec);
    const idempotencyKey = `${scopeKey(spec.scope)}\u0000${sha256Canonical(input.idempotencyKey)}`;
    const replay = this.idempotency.get(idempotencyKey);
    if (replay) {
      if (replay.specSha256 !== specSha256) {
        throw new MediaIntelligenceQueueError(
          "idempotency_conflict",
          "Queue idempotency key was already used for a different job specification",
        );
      }
      const storedReplay = this.jobs.get(replay.jobId);
      if (!storedReplay) throw new MediaIntelligenceQueueError("job_not_found", "Replayed queue job is missing");
      return reduceJob(storedReplay, true);
    }
    if (this.jobs.has(spec.jobId)) {
      throw new MediaIntelligenceQueueError("job_conflict", "Queue job id already exists");
    }
    const outstanding = this.outstandingForOrganization(spec.scope.organizationId);
    if (outstanding >= this.limits.maxOutstandingPerOrganization) {
      throw new MediaIntelligenceQueueError(
        "backpressure",
        "Organization media-intelligence queue is saturated",
      );
    }

    const receipt = await this.checksumAuthority.verify({ scope: spec.scope, source: spec.source });
    if (!receipt) {
      throw new MediaIntelligenceQueueError("checksum_required", "Trusted source checksum receipt is unavailable");
    }
    const rebound = bindVerifiedSourceChecksum(spec.source, receipt);
    if (!isSameTranscriptSource(rebound, spec.source)) {
      throw new MediaIntelligenceQueueError("checksum_required", "Trusted source checksum receipt is stale");
    }
    const concurrentReplay = this.idempotency.get(idempotencyKey);
    if (concurrentReplay || this.jobs.has(spec.jobId)) {
      return this.enqueue(input);
    }
    if (this.outstandingForOrganization(spec.scope.organizationId) >= this.limits.maxOutstandingPerOrganization) {
      throw new MediaIntelligenceQueueError(
        "backpressure",
        "Organization media-intelligence queue is saturated",
      );
    }

    const provisional: StoredJob = Object.freeze({
      spec,
      sourceChecksumReceiptId: receipt.receiptId,
      events: Object.freeze([]),
      specSha256,
    });
    const enqueued = eventFor(provisional, {
      type: "enqueued",
      actorId: input.actorId,
      occurredAt: spec.createdAt,
      attempt: 0,
      notBefore: spec.notBefore,
    });
    const stored = cloneFrozen({ ...provisional, events: Object.freeze([enqueued]) });
    const nextJobs = new Map(this.jobs);
    nextJobs.set(spec.jobId, stored);
    const nextIdempotency = new Map(this.idempotency);
    nextIdempotency.set(idempotencyKey, { jobId: spec.jobId, specSha256 });
    const expectedJobs = this.jobs;
    const expectedIdempotency = this.idempotency;

    await this.faultInjector?.("before_enqueue_commit");
    if (this.jobs !== expectedJobs || this.idempotency !== expectedIdempotency) {
      return this.enqueue(input);
    }
    this.jobs = nextJobs;
    this.idempotency = nextIdempotency;
    return reduceJob(stored);
  }

  async claim(input: {
    readonly workerId: string;
    readonly now: string;
    readonly leaseMs: number;
  }): Promise<MediaIntelligenceJobSnapshot | null> {
    assertIdentifier(input.workerId, "workerId");
    const now = normalizedTimestamp(input.now, "claim time");
    if (!Number.isInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > MAX_LEASE_MS) {
      throw new MediaIntelligenceQueueError("invalid_job", "leaseMs is outside the supported range");
    }
    const available = [...this.jobs.values()]
      .map((stored) => ({ stored, snapshot: reduceJob(stored) }))
      .filter(({ snapshot }) =>
        snapshot.status === "queued" &&
        Date.parse(snapshot.nextAttemptAt) <= Date.parse(now) &&
        Date.parse(snapshot.spec.sourceAccessUntil) >= Date.parse(now) &&
        [...this.jobs.values()].filter((candidate) => {
          const candidateSnapshot = reduceJob(candidate);
          return (
            candidate.spec.scope.organizationId === snapshot.spec.scope.organizationId &&
            (candidateSnapshot.status === "leased" || candidateSnapshot.status === "cancel_requested")
          );
        }).length < this.limits.maxActiveLeasesPerOrganization
      )
      .sort((left, right) =>
        left.snapshot.nextAttemptAt.localeCompare(right.snapshot.nextAttemptAt) ||
        left.snapshot.spec.jobId.localeCompare(right.snapshot.spec.jobId)
      )[0];
    if (!available) return null;

    const attempt = available.snapshot.attempts + 1;
    const leaseExpiresAt = new Date(Date.parse(now) + input.leaseMs).toISOString();
    const leaseToken = deterministicUuid({
      kind: "media-intelligence-lease",
      jobId: available.stored.spec.jobId,
      workerId: input.workerId,
      attempt,
      now,
      latestEventSha256: available.snapshot.latestEventSha256,
    });
    return this.transition(available.stored.spec.jobId, {
      type: "leased",
      actorId: input.workerId,
      occurredAt: now,
      attempt,
      leaseToken,
      leaseExpiresAt,
    }, available.snapshot.latestEventSha256);
  }

  async renew(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
    readonly leaseMs: number;
  }): Promise<MediaIntelligenceJobSnapshot> {
    const { stored, snapshot, now } = this.requireActiveLease(input);
    if (!Number.isInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > MAX_LEASE_MS) {
      throw new MediaIntelligenceQueueError("invalid_job", "leaseMs is outside the supported range");
    }
    if (snapshot.status === "cancel_requested") {
      throw new MediaIntelligenceQueueError("cancellation_pending", "Cancelled work cannot renew its lease");
    }
    return this.transition(stored.spec.jobId, {
      type: "lease_renewed",
      actorId: input.workerId,
      occurredAt: now,
      attempt: snapshot.attempts,
      leaseToken: input.leaseToken,
      leaseExpiresAt: new Date(Date.parse(now) + input.leaseMs).toISOString(),
    }, snapshot.latestEventSha256);
  }

  async complete(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
    readonly result: MediaIntelligenceCompletion;
  }): Promise<MediaIntelligenceJobSnapshot> {
    const { stored, snapshot, now } = this.requireActiveLease(input);
    if (snapshot.status === "cancel_requested") {
      throw new MediaIntelligenceQueueError("cancellation_pending", "Completion is blocked after cancellation");
    }
    assertSha256(input.result.inputSha256, "completion inputSha256");
    assertSha256(input.result.sourceSha256, "completion sourceSha256");
    assertSha256(input.result.outputSha256, "completion outputSha256");
    if (
      input.result.inputSha256 !== stored.spec.inputSha256 ||
      input.result.sourceSha256 !== stored.spec.source.mediaSha256
    ) {
      throw new MediaIntelligenceQueueError("replay_mismatch", "Completion input/source replay binding is stale");
    }
    if (
      stored.spec.expectedOutputReplayDigest !== null &&
      input.result.outputReplayDigest !== stored.spec.expectedOutputReplayDigest
    ) {
      throw new MediaIntelligenceQueueError("replay_mismatch", "Completion replay digest does not match the plan");
    }
    return this.transition(stored.spec.jobId, {
      type: "completed",
      actorId: input.workerId,
      occurredAt: now,
      attempt: snapshot.attempts,
      resultSha256: input.result.outputSha256,
    }, snapshot.latestEventSha256);
  }

  async fail(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
    readonly reasonCode: string;
    readonly retryable: boolean;
  }): Promise<MediaIntelligenceJobSnapshot> {
    const { stored, snapshot, now } = this.requireActiveLease(input);
    assertIdentifier(input.reasonCode, "failure reasonCode");
    if (snapshot.status === "cancel_requested") {
      return this.transition(stored.spec.jobId, {
        type: "cancelled",
        actorId: input.workerId,
        occurredAt: now,
        attempt: snapshot.attempts,
        reasonCode: "worker_acknowledged_cancellation",
      }, snapshot.latestEventSha256);
    }
    if (input.retryable && snapshot.attempts < stored.spec.maxAttempts) {
      const notBefore = new Date(Date.parse(now) + stored.spec.retryDelayMs).toISOString();
      return this.transition(stored.spec.jobId, {
        type: "retry_scheduled",
        actorId: input.workerId,
        occurredAt: now,
        attempt: snapshot.attempts,
        notBefore,
        reasonCode: input.reasonCode,
      }, snapshot.latestEventSha256);
    }
    return this.transition(stored.spec.jobId, {
      type: "dead_lettered",
      actorId: input.workerId,
      occurredAt: now,
      attempt: snapshot.attempts,
      reasonCode: input.reasonCode,
    }, snapshot.latestEventSha256);
  }

  async requestCancellation(input: {
    readonly jobId: string;
    readonly actorId: string;
    readonly now: string;
    readonly reasonCode: string;
  }): Promise<MediaIntelligenceJobSnapshot> {
    assertIdentifier(input.actorId, "actorId");
    assertIdentifier(input.reasonCode, "cancellation reasonCode");
    const stored = this.requireJob(input.jobId);
    const snapshot = reduceJob(stored);
    const now = normalizedTimestamp(input.now, "cancellation time");
    if (snapshot.status === "cancelled" || snapshot.status === "succeeded" || snapshot.status === "dead_lettered") {
      return snapshot;
    }
    if (snapshot.status === "cancel_requested") return snapshot;
    if (snapshot.status === "queued") {
      return this.transition(stored.spec.jobId, {
        type: "cancelled",
        actorId: input.actorId,
        occurredAt: now,
        attempt: snapshot.attempts,
        reasonCode: input.reasonCode,
      }, snapshot.latestEventSha256);
    }
    return this.transition(stored.spec.jobId, {
      type: "cancel_requested",
      actorId: input.actorId,
      occurredAt: now,
      attempt: snapshot.attempts,
      leaseToken: snapshot.leaseToken,
      leaseExpiresAt: snapshot.leaseExpiresAt,
      reasonCode: input.reasonCode,
    }, snapshot.latestEventSha256);
  }

  async acknowledgeCancellation(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
  }): Promise<MediaIntelligenceJobSnapshot> {
    const { stored, snapshot, now } = this.requireActiveLease(input);
    if (snapshot.status !== "cancel_requested") {
      throw new MediaIntelligenceQueueError("invalid_transition", "Job has no pending cancellation");
    }
    return this.transition(stored.spec.jobId, {
      type: "cancelled",
      actorId: input.workerId,
      occurredAt: now,
      attempt: snapshot.attempts,
      reasonCode: "worker_acknowledged_cancellation",
    }, snapshot.latestEventSha256);
  }

  async reapExpired(input: {
    readonly jobId: string;
    readonly actorId: string;
    readonly now: string;
  }): Promise<MediaIntelligenceJobSnapshot> {
    assertIdentifier(input.actorId, "actorId");
    const stored = this.requireJob(input.jobId);
    const snapshot = reduceJob(stored);
    const now = normalizedTimestamp(input.now, "lease reaper time");
    if (snapshot.status !== "leased" && snapshot.status !== "cancel_requested") {
      throw new MediaIntelligenceQueueError("invalid_transition", "Job has no active lease to reap");
    }
    if (!snapshot.leaseExpiresAt || Date.parse(now) < Date.parse(snapshot.leaseExpiresAt)) {
      throw new MediaIntelligenceQueueError("invalid_transition", "Lease has not expired");
    }
    if (snapshot.status === "cancel_requested") {
      return this.transition(stored.spec.jobId, {
        type: "cancelled",
        actorId: input.actorId,
        occurredAt: now,
        attempt: snapshot.attempts,
        reasonCode: "cancelled_after_lease_expiry",
      }, snapshot.latestEventSha256);
    }
    if (snapshot.attempts >= stored.spec.maxAttempts) {
      return this.transition(stored.spec.jobId, {
        type: "dead_lettered",
        actorId: input.actorId,
        occurredAt: now,
        attempt: snapshot.attempts,
        reasonCode: "lease_expired",
      }, snapshot.latestEventSha256);
    }
    return this.transition(stored.spec.jobId, {
      type: "retry_scheduled",
      actorId: input.actorId,
      occurredAt: now,
      attempt: snapshot.attempts,
      notBefore: new Date(Date.parse(now) + stored.spec.retryDelayMs).toISOString(),
      reasonCode: "lease_expired",
    }, snapshot.latestEventSha256);
  }

  private requireJob(jobId: string): StoredJob {
    assertIdentifier(jobId, "jobId");
    const stored = this.jobs.get(jobId);
    if (!stored) throw new MediaIntelligenceQueueError("job_not_found", "Queue job was not found");
    return stored;
  }

  private outstandingForOrganization(organizationId: string): number {
    return [...this.jobs.values()].filter((stored) => {
      const snapshot = reduceJob(stored);
      return (
        stored.spec.scope.organizationId === organizationId &&
        (snapshot.status === "queued" ||
          snapshot.status === "leased" ||
          snapshot.status === "cancel_requested")
      );
    }).length;
  }

  private requireActiveLease(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseToken: string;
    readonly now: string;
  }): { stored: StoredJob; snapshot: MediaIntelligenceJobSnapshot; now: string } {
    assertIdentifier(input.workerId, "workerId");
    assertIdentifier(input.leaseToken, "leaseToken");
    const stored = this.requireJob(input.jobId);
    const snapshot = reduceJob(stored);
    const now = normalizedTimestamp(input.now, "worker transition time");
    if (snapshot.status !== "leased" && snapshot.status !== "cancel_requested") {
      throw new MediaIntelligenceQueueError("invalid_transition", "Job is not actively leased");
    }
    if (snapshot.leaseToken !== input.leaseToken) {
      throw new MediaIntelligenceQueueError("stale_fence", "Worker lease fencing token is stale");
    }
    if (!snapshot.leaseExpiresAt || Date.parse(now) >= Date.parse(snapshot.leaseExpiresAt)) {
      throw new MediaIntelligenceQueueError("lease_expired", "Worker lease has expired");
    }
    return { stored, snapshot, now };
  }

  private async transition(
    jobId: string,
    eventInput: Parameters<typeof eventFor>[1],
    expectedLatestEventSha256: string,
  ): Promise<MediaIntelligenceJobSnapshot> {
    const stored = this.requireJob(jobId);
    if (reduceJob(stored).latestEventSha256 !== expectedLatestEventSha256) {
      throw new MediaIntelligenceQueueError("job_conflict", "Queue job changed concurrently");
    }
    const priorTimestamp = Date.parse(stored.events.at(-1)?.occurredAt ?? eventInput.occurredAt);
    if (Date.parse(eventInput.occurredAt) < priorTimestamp) {
      throw new MediaIntelligenceQueueError("invalid_transition", "Queue event timestamps cannot move backward");
    }
    const event = eventFor(stored, eventInput);
    const nextStored = cloneFrozen({ ...stored, events: Object.freeze([...stored.events, event]) });
    const nextJobs = new Map(this.jobs);
    nextJobs.set(jobId, nextStored);
    await this.faultInjector?.("before_transition_commit");
    const current = this.requireJob(jobId);
    if (reduceJob(current).latestEventSha256 !== expectedLatestEventSha256) {
      throw new MediaIntelligenceQueueError("job_conflict", "Queue job changed concurrently");
    }
    this.jobs = nextJobs;
    return reduceJob(nextStored);
  }
}

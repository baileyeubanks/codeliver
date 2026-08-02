import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMediaIntelligenceQueue,
  verifyQueueHistory,
  type MediaIntelligenceJobSpec,
  type MediaIntelligenceQueueEvent,
} from "../lib/audio-analysis/queue.ts";
import {
  type MediaIntelligenceScope,
  type SourceChecksumAuthority,
} from "../lib/transcript/durable.ts";
import { buildTranscriptSourceBinding } from "../lib/transcript/core.ts";

const SOURCE_SHA256 = "a".repeat(64);
const INPUT_SHA256 = "b".repeat(64);
const OUTPUT_SHA256 = "c".repeat(64);
const START = "2026-07-15T00:00:00.000Z";

const scope: MediaIntelligenceScope = Object.freeze({
  organizationId: "org-queue",
  projectId: "project-queue",
  assetId: "00000000-0000-4000-8000-000000000401",
  versionId: "00000000-0000-4000-8000-000000000402",
});

function source(mediaSha256: string | null = SOURCE_SHA256) {
  return buildTranscriptSourceBinding({
    assetId: scope.assetId,
    versionId: scope.versionId,
    versionNumber: 1,
    versionCreatedAt: "2026-07-14T20:00:00.000Z",
    durationMs: 22_000,
    fileSizeBytes: 48_000_000,
    mediaSha256,
  });
}

function authority(): SourceChecksumAuthority {
  return {
    async verify() {
      return {
        receiptId: "queue-source-receipt",
        assetId: scope.assetId,
        versionId: scope.versionId,
        sha256: SOURCE_SHA256,
        sizeBytes: 48_000_000,
        verifiedAt: "2026-07-14T20:01:00.000Z",
        verifier: "storage-inspection",
      };
    },
  };
}

function spec(overrides: Partial<MediaIntelligenceJobSpec> = {}): MediaIntelligenceJobSpec {
  return {
    jobId: "00000000-0000-5000-8000-000000000403",
    kind: "analysis",
    scope,
    source: source(),
    inputSha256: INPUT_SHA256,
    inputReplayDigest: "fnv1a64:input-replay",
    expectedOutputReplayDigest: "fnv1a64:output-replay",
    execution: {
      providerId: "local-analysis",
      providerMode: "local",
      networkAccess: "none",
      paid: false,
      estimatedCostMicrounits: 0,
      budgetReservationId: null,
    },
    maxAttempts: 2,
    retryDelayMs: 0,
    notBefore: START,
    sourceAccessUntil: "2026-07-16T00:00:00.000Z",
    createdAt: START,
    ...overrides,
  };
}

async function enqueue(queue: InMemoryMediaIntelligenceQueue, value = spec(), key = "queue-key") {
  return queue.enqueue({ spec: value, idempotencyKey: key, actorId: "user-queue" });
}

function completion() {
  return {
    inputSha256: INPUT_SHA256,
    sourceSha256: SOURCE_SHA256,
    outputSha256: OUTPUT_SHA256,
    outputReplayDigest: "fnv1a64:output-replay",
  };
}

test("queue requires a trusted checksum and a reservation for paid work", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  await assert.rejects(
    enqueue(queue, spec({ source: source(null) }), "missing-checksum"),
    /checksum-bound source/i,
  );
  await assert.rejects(
    enqueue(queue, spec({
      execution: {
        providerId: "paid-provider",
        providerMode: "external",
        networkAccess: "required",
        paid: true,
        estimatedCostMicrounits: 100,
        budgetReservationId: null,
      },
    }), "missing-reservation"),
    /requires a budget reservation/i,
  );
  assert.equal(queue.history(spec().jobId).length, 0);
});

test("concurrent enqueue replay appends one event and conflicting reuse is rejected", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  const value = spec();
  const [first, second] = await Promise.all([
    enqueue(queue, value, "same-key"),
    enqueue(queue, value, "same-key"),
  ]);

  assert.deepEqual([first.idempotentReplay, second.idempotentReplay].sort(), [false, true]);
  assert.equal(queue.history(value.jobId).length, 1);
  await assert.rejects(
    enqueue(queue, spec({ maxAttempts: 3 }), "same-key"),
    /different job specification/i,
  );
});

test("organization queue depth and active leases enforce backpressure", async () => {
  const saturated = new InMemoryMediaIntelligenceQueue(
    authority(),
    undefined,
    { maxOutstandingPerOrganization: 1, maxActiveLeasesPerOrganization: 1 },
  );
  await enqueue(saturated, spec(), "capacity-one");
  await assert.rejects(
    enqueue(saturated, spec({
      jobId: "00000000-0000-5000-8000-000000000404",
    }), "capacity-two"),
    /queue is saturated/i,
  );

  const leaseBounded = new InMemoryMediaIntelligenceQueue(
    authority(),
    undefined,
    { maxOutstandingPerOrganization: 2, maxActiveLeasesPerOrganization: 1 },
  );
  await enqueue(leaseBounded, spec(), "lease-one");
  await enqueue(leaseBounded, spec({
    jobId: "00000000-0000-5000-8000-000000000405",
  }), "lease-two");
  assert.ok(await leaseBounded.claim({ workerId: "worker-1", now: START, leaseMs: 10_000 }));
  assert.equal(await leaseBounded.claim({ workerId: "worker-2", now: START, leaseMs: 10_000 }), null);
});

test("completion is fenced to the exact input, source checksum, and replay plan", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  await enqueue(queue);
  const claimed = await queue.claim({ workerId: "worker-1", now: START, leaseMs: 10_000 });
  assert.ok(claimed?.leaseToken);
  await assert.rejects(
    queue.complete({
      jobId: claimed.spec.jobId,
      workerId: "worker-1",
      leaseToken: claimed.leaseToken,
      now: "2026-07-15T00:00:01.000Z",
      result: { ...completion(), outputReplayDigest: "fnv1a64:forged" },
    }),
    /replay digest does not match/i,
  );
  const completed = await queue.complete({
    jobId: claimed.spec.jobId,
    workerId: "worker-1",
    leaseToken: claimed.leaseToken,
    now: "2026-07-15T00:00:02.000Z",
    result: completion(),
  });
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.resultSha256, OUTPUT_SHA256);
  assert.deepEqual(verifyQueueHistory(completed.spec.jobId, queue.history(completed.spec.jobId)), []);
});

test("queued cancellation is terminal and replay-safe", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  const queued = await enqueue(queue);
  const cancelled = await queue.requestCancellation({
    jobId: queued.spec.jobId,
    actorId: "user-queue",
    now: "2026-07-15T00:00:01.000Z",
    reasonCode: "user_cancelled",
  });
  const replay = await queue.requestCancellation({
    jobId: queued.spec.jobId,
    actorId: "user-queue",
    now: "2026-07-15T00:00:02.000Z",
    reasonCode: "user_cancelled",
  });

  assert.equal(cancelled.status, "cancelled");
  assert.equal(replay.status, "cancelled");
  assert.equal(queue.history(queued.spec.jobId).length, 2);
  assert.equal(await queue.claim({ workerId: "worker-1", now: START, leaseMs: 10_000 }), null);
});

test("leased cancellation blocks completion until worker acknowledgement", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  await enqueue(queue);
  const claimed = await queue.claim({ workerId: "worker-1", now: START, leaseMs: 10_000 });
  assert.ok(claimed?.leaseToken);
  const requested = await queue.requestCancellation({
    jobId: claimed.spec.jobId,
    actorId: "user-queue",
    now: "2026-07-15T00:00:01.000Z",
    reasonCode: "user_cancelled",
  });
  assert.equal(requested.status, "cancel_requested");
  await assert.rejects(
    queue.complete({
      jobId: claimed.spec.jobId,
      workerId: "worker-1",
      leaseToken: claimed.leaseToken,
      now: "2026-07-15T00:00:02.000Z",
      result: completion(),
    }),
    /blocked after cancellation/i,
  );
  const cancelled = await queue.acknowledgeCancellation({
    jobId: claimed.spec.jobId,
    workerId: "worker-1",
    leaseToken: claimed.leaseToken,
    now: "2026-07-15T00:00:03.000Z",
  });
  assert.equal(cancelled.status, "cancelled");
});

test("expired leases requeue with a new fence and reject the stale worker", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  await enqueue(queue);
  const first = await queue.claim({ workerId: "worker-1", now: START, leaseMs: 1_000 });
  assert.ok(first?.leaseToken);
  const requeued = await queue.reapExpired({
    jobId: first.spec.jobId,
    actorId: "queue-reaper",
    now: "2026-07-15T00:00:01.000Z",
  });
  assert.equal(requeued.status, "queued");
  const second = await queue.claim({
    workerId: "worker-2",
    now: "2026-07-15T00:00:01.000Z",
    leaseMs: 10_000,
  });
  assert.ok(second?.leaseToken);
  assert.notEqual(second.leaseToken, first.leaseToken);
  await assert.rejects(
    queue.complete({
      jobId: first.spec.jobId,
      workerId: "worker-1",
      leaseToken: first.leaseToken,
      now: "2026-07-15T00:00:02.000Z",
      result: completion(),
    }),
    /fencing token is stale/i,
  );
  const completed = await queue.complete({
    jobId: second.spec.jobId,
    workerId: "worker-2",
    leaseToken: second.leaseToken,
    now: "2026-07-15T00:00:02.000Z",
    result: completion(),
  });
  assert.equal(completed.status, "succeeded");
});

test("attempt exhaustion dead-letters and cannot be claimed again", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  await enqueue(queue, spec({ maxAttempts: 1 }), "one-attempt");
  const claimed = await queue.claim({ workerId: "worker-1", now: START, leaseMs: 10_000 });
  assert.ok(claimed?.leaseToken);
  const failed = await queue.fail({
    jobId: claimed.spec.jobId,
    workerId: "worker-1",
    leaseToken: claimed.leaseToken,
    now: "2026-07-15T00:00:01.000Z",
    reasonCode: "detector_failed",
    retryable: true,
  });
  assert.equal(failed.status, "dead_lettered");
  assert.equal(await queue.claim({ workerId: "worker-2", now: START, leaseMs: 10_000 }), null);
});

test("concurrent claims cannot produce two active leases", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority(), async (point) => {
    if (point === "before_transition_commit") await new Promise((resolve) => setTimeout(resolve, 1));
  });
  await enqueue(queue);
  const outcomes = await Promise.allSettled([
    queue.claim({ workerId: "worker-1", now: START, leaseMs: 10_000 }),
    queue.claim({ workerId: "worker-2", now: START, leaseMs: 10_000 }),
  ]);
  const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
  const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(String((rejected[0] as PromiseRejectedResult).reason), /changed concurrently/i);
  assert.equal(queue.history(spec().jobId).filter((event) => event.type === "leased").length, 1);
});

test("queue event tampering breaks the append-only integrity chain", async () => {
  const queue = new InMemoryMediaIntelligenceQueue(authority());
  const queued = await enqueue(queue);
  const history = queue.history(queued.spec.jobId);
  const forged = [{ ...history[0], actorId: "forged-actor" }] as MediaIntelligenceQueueEvent[];

  assert.ok(verifyQueueHistory(queued.spec.jobId, forged).some((error) => error.includes("checksum mismatch")));
});

test("fault before enqueue commit leaves no job or idempotency claim", async () => {
  let fail = true;
  const queue = new InMemoryMediaIntelligenceQueue(authority(), (point) => {
    if (point === "before_enqueue_commit" && fail) {
      fail = false;
      throw new Error("injected enqueue fault");
    }
  });
  const value = spec();
  await assert.rejects(enqueue(queue, value, "fault-key"), /injected enqueue fault/i);
  assert.equal(queue.get(value.jobId), null);
  const retry = await enqueue(queue, value, "fault-key");
  assert.equal(retry.idempotentReplay, false);
  assert.equal(retry.status, "queued");
});

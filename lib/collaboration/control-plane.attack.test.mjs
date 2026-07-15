import test from "node:test";
import assert from "node:assert/strict";
import {
  COLLABORATION_API_VERSION,
  CollaborationControlPlane,
  InMemoryCollaborationEventStore,
  MAX_EVENT_READ_LIMIT,
  parseCollaborationCommand,
} from "./control-plane.ts";

const scope = {
  tenantId: "tenant-1",
  projectId: "project-1",
  assetId: "asset-1",
  assetVersionId: "version-2",
};

const allCapabilities = [
  "events.read",
  "thread.create",
  "thread.reply",
  "thread.moderate",
  "presence.write",
];

function principal(overrides = {}) {
  return {
    actorId: "actor-1",
    tenantId: scope.tenantId,
    authorizationVersion: "membership-7",
    capabilities: allCapabilities,
    ...overrides,
  };
}

function resource(overrides = {}) {
  return {
    ...scope,
    currentAssetVersionId: scope.assetVersionId,
    authorizationVersion: "membership-7",
    allowedCapabilities: allCapabilities,
    ...overrides,
  };
}

function command(type, payload, sequence = 0, overrides = {}) {
  return {
    apiVersion: COLLABORATION_API_VERSION,
    commandId: `cmd-${type}-${sequence}`,
    idempotencyKey: `idem-${type}-${sequence}`,
    expectedSequence: sequence,
    scope,
    type,
    payload,
    ...overrides,
  };
}

function plane() {
  let id = 0;
  return new CollaborationControlPlane({
    store: new InMemoryCollaborationEventStore(),
    now: () => "2026-07-14T12:00:00.000Z",
    id: () => `generated-${++id}`,
  });
}

function expectProblem(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.problem.code, code);
  return result.problem;
}

test("accepts a version-bound command and returns an auditable receipt", () => {
  const controlPlane = plane();
  const result = controlPlane.execute(
    command("thread.create", { body: "  Fix this frame  ", timecodeMs: 1_250 }),
    principal(),
    resource(),
    "trace-happy",
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.event.sequence, 1);
  assert.equal(result.value.event.scope.assetVersionId, "version-2");
  assert.equal(result.value.event.data.body, "Fix this frame");
  assert.deepEqual(result.value.audit, {
    actorId: "actor-1",
    capability: "thread.create",
    outcome: "accepted",
  });
  assert.equal(result.value.authorizationVersion, "membership-7");
});

test("rejects cross-tenant injection without disclosing the foreign resource", () => {
  const controlPlane = plane();
  const foreignScope = { ...scope, tenantId: "tenant-2" };
  const result = controlPlane.execute(
    command("thread.create", { body: "Injected" }, 0, { scope: foreignScope }),
    principal(),
    resource({ ...foreignScope }),
    "trace-tenant",
  );

  const problem = expectProblem(result, "unauthorized_scope");
  assert.equal(problem.status, 404);
  assert.doesNotMatch(problem.message, /tenant-2/);
});

test("returns the original receipt for replay and rejects key reuse with changed intent", () => {
  const controlPlane = plane();
  const original = command("thread.create", { body: "First" });
  const accepted = controlPlane.execute(original, principal(), resource(), "trace-first");
  const replayed = controlPlane.execute(original, principal(), resource(), "trace-replay");
  const collision = controlPlane.execute(
    { ...original, payload: { body: "Different" } },
    principal(),
    resource(),
    "trace-collision",
  );

  assert.equal(accepted.ok, true);
  assert.equal(replayed.ok, true);
  assert.equal(replayed.value.duplicate, true);
  assert.equal(replayed.value.receiptId, accepted.value.receiptId);
  assert.equal(replayed.value.event.eventId, accepted.value.event.eventId);
  expectProblem(collision, "idempotency_conflict");
});

test("rejects stale asset-version writes and stale membership authorization", () => {
  const controlPlane = plane();
  const staleVersion = controlPlane.execute(
    command("thread.create", { body: "Old cut" }),
    principal(),
    resource({ currentAssetVersionId: "version-3" }),
    "trace-version",
  );
  const staleMembership = controlPlane.execute(
    command("thread.create", { body: "Old grant" }),
    principal(),
    resource({ authorizationVersion: "membership-8" }),
    "trace-membership",
  );

  assert.equal(expectProblem(staleVersion, "asset_version_stale").retryable, true);
  assert.equal(expectProblem(staleMembership, "authorization_stale").retryable, true);
});

test("rejects global ordering conflicts with a recovery sequence", () => {
  const controlPlane = plane();
  const first = controlPlane.execute(
    command("thread.create", { body: "First" }),
    principal(),
    resource(),
  );
  const conflicted = controlPlane.execute(
    command("thread.create", { body: "Second" }, 0, {
      commandId: "cmd-second",
      idempotencyKey: "idem-second",
    }),
    principal(),
    resource(),
    "trace-sequence",
  );

  assert.equal(first.ok, true);
  const problem = expectProblem(conflicted, "sequence_conflict");
  assert.equal(problem.expectedSequence, 1);
  assert.equal(problem.retryable, true);
});

test("derives presence participant from the principal and enforces capability", () => {
  const controlPlane = plane();
  const denied = controlPlane.execute(
    command("presence.join", { presenceRevision: 1 }),
    principal({ capabilities: ["events.read"] }),
    resource(),
    "trace-presence-denied",
  );
  expectProblem(denied, "permission_denied");

  const accepted = controlPlane.execute(
    command("presence.join", { presenceRevision: 1 }),
    principal(),
    resource(),
    "trace-presence",
  );
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.event.data.participantId, "actor-1");
});

test("validates malformed, unbounded, and identity-spoofing payloads fail closed", () => {
  const base = command("thread.create", { body: "Valid" });
  const malformed = [
    { ...base, apiVersion: "latest" },
    { ...base, unexpected: true },
    { ...base, idempotencyKey: "short" },
    { ...base, payload: { body: "" } },
    { ...base, payload: { body: "x".repeat(4_001) } },
    { ...base, payload: { body: "Valid", position: { x: 2, y: 0.5 } } },
    { ...base, type: "__proto__" },
    command("presence.join", { presenceRevision: 1, participantId: "actor-2" }),
    command("thread.resolve", { threadId: "thread-1", expectedThreadRevision: 0 }),
  ];

  for (const candidate of malformed) {
    expectProblem(parseCollaborationCommand(candidate, "trace-invalid"), "invalid_request");
  }
});

test("thread resolution is reversible only at the expected thread revision", () => {
  const controlPlane = plane();
  const created = controlPlane.execute(
    command("thread.create", { body: "Resolve me" }),
    principal(),
    resource(),
  );
  assert.equal(created.ok, true);
  const threadId = created.value.event.data.threadId;

  const resolved = controlPlane.execute(
    command("thread.resolve", { threadId, expectedThreadRevision: 1, reason: "Addressed" }, 1),
    principal(),
    resource(),
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.value.event.data.previousState, "open");
  assert.equal(resolved.value.event.data.state, "resolved");

  const staleReopen = controlPlane.execute(
    command("thread.reopen", { threadId, expectedThreadRevision: 1 }, 2),
    principal(),
    resource(),
  );
  expectProblem(staleReopen, "thread_state_conflict");

  const reopened = controlPlane.execute(
    command("thread.reopen", { threadId, expectedThreadRevision: 2 }, 2, {
      commandId: "cmd-reopen-correct",
      idempotencyKey: "idem-reopen-correct",
    }),
    principal(),
    resource(),
  );
  assert.equal(reopened.ok, true);
  assert.equal(reopened.value.event.data.previousState, "resolved");
  assert.equal(reopened.value.event.data.state, "open");
});

test("event reads are authorized, cursor-bounded, and report continuation", () => {
  const controlPlane = plane();
  for (let sequence = 0; sequence < 3; sequence += 1) {
    const result = controlPlane.execute(
      command("presence.join", { presenceRevision: sequence + 1 }, sequence, {
        commandId: `cmd-presence-${sequence}`,
        idempotencyKey: `idem-presence-${sequence}`,
      }),
      principal(),
      resource(),
    );
    assert.equal(result.ok, true);
  }

  const firstPage = controlPlane.readEvents(scope, 0, 2, principal(), resource(), "trace-read");
  assert.equal(firstPage.ok, true);
  assert.deepEqual(firstPage.value.items.map((event) => event.sequence), [1, 2]);
  assert.equal(firstPage.value.nextSequence, 2);
  assert.equal(firstPage.value.hasMore, true);

  const nextPage = controlPlane.readEvents(scope, 2, 2, principal(), resource());
  assert.equal(nextPage.ok, true);
  assert.deepEqual(nextPage.value.items.map((event) => event.sequence), [3]);
  assert.equal(nextPage.value.hasMore, false);

  expectProblem(
    controlPlane.readEvents(scope, 0, MAX_EVENT_READ_LIMIT + 1, principal(), resource()),
    "read_limit_exceeded",
  );
  expectProblem(
    controlPlane.readEvents(
      scope,
      0,
      10,
      principal({ capabilities: ["thread.create"] }),
      resource(),
    ),
    "permission_denied",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_ENTERPRISE_POLICY_VERSION,
  ENTERPRISE_AUTHORIZATION_SCHEMA,
  PREVIOUS_ENTERPRISE_POLICY_VERSION,
  computeEnterpriseIdempotencyKey,
  evaluateEnterpriseAuthorization,
  parseEnterpriseAuthorizationRequest,
} from "./authorization.ts";

const NOW = "2026-07-14T12:00:00.000Z";
const REQUEST_ID = "attack-proof-request";

function request(overrides = {}) {
  const base = {
    schemaVersion: ENTERPRISE_AUTHORIZATION_SCHEMA,
    tenantId: "tenant-alpha",
    policyVersion: ACTIVE_ENTERPRISE_POLICY_VERSION,
    action: "tenant.read",
    target: { kind: "tenant", tenantId: "tenant-alpha" },
    ...overrides,
  };
  return {
    ...base,
    idempotencyKey: computeEnterpriseIdempotencyKey(base),
  };
}

function actor(overrides = {}) {
  return {
    id: "subject-one",
    tenantId: "tenant-alpha",
    role: "viewer",
    ...overrides,
  };
}

function decide(input, subject = actor(), context = {}) {
  return evaluateEnterpriseAuthorization(input, subject, {
    requestId: REQUEST_ID,
    evaluatedAt: NOW,
    ...context,
  });
}

test("allows the least-privileged tenant read and binds tenant plus policy", () => {
  const decision = decide(request());
  assert.equal(decision.effect, "allow");
  assert.equal(decision.reason, "ALLOWED");
  assert.equal(decision.binding.tenantId, "tenant-alpha");
  assert.equal(decision.binding.policyVersion, ACTIVE_ENTERPRISE_POLICY_VERSION);
});

test("denies a cross-tenant target even for an owner", () => {
  const input = request({
    target: { kind: "tenant", tenantId: "tenant-bravo" },
  });
  const decision = decide(input, actor({ role: "owner" }));
  assert.equal(decision.effect, "deny");
  assert.equal(decision.reason, "TENANT_MISMATCH");
});

test("denies a stale policy version and permits an explicit operator rollback", () => {
  const stale = request({ policyVersion: PREVIOUS_ENTERPRISE_POLICY_VERSION });
  assert.equal(decide(stale).reason, "STALE_POLICY_VERSION");

  const rollbackDecision = decide(stale, actor(), {
    activePolicyVersion: PREVIOUS_ENTERPRISE_POLICY_VERSION,
  });
  assert.equal(rollbackDecision.effect, "allow");
  assert.equal(
    rollbackDecision.binding.policyVersion,
    PREVIOUS_ENTERPRISE_POLICY_VERSION,
  );
});

test("denies an admin role-escalation attempt", () => {
  const escalation = request({
    action: "identity.role.change",
    target: {
      kind: "identity",
      tenantId: "tenant-alpha",
      subjectId: "subject-two",
      requestedRole: "admin",
    },
  });
  const decision = decide(escalation, actor({ role: "admin" }));
  assert.equal(decision.effect, "deny");
  assert.equal(decision.reason, "PERMISSION_DENIED");
});

test("denies even an owner attempting to mutate their own role", () => {
  const selfMutation = request({
    action: "identity.role.change",
    target: {
      kind: "identity",
      tenantId: "tenant-alpha",
      subjectId: "subject-one",
      requestedRole: "viewer",
    },
  });
  const decision = decide(selfMutation, actor({ role: "owner" }));
  assert.equal(decision.effect, "deny");
  assert.equal(decision.reason, "OWNER_SELF_MUTATION");
});

test("makes an identical replay safe and deterministic", () => {
  const input = request();
  const first = decide(input);
  const replay = decide(structuredClone(input));
  assert.equal(first.decisionId, replay.decisionId);
  assert.deepEqual(first, replay);
});

test("rejects reuse of an idempotency key with a changed action", () => {
  const original = request();
  const replay = {
    ...original,
    action: "governance.policy.change",
  };
  const decision = decide(replay, actor({ role: "owner" }));
  assert.equal(decision.effect, "deny");
  assert.equal(decision.reason, "IDEMPOTENCY_KEY_MISMATCH");
});

test("rejects malformed and privilege-bearing unknown input", () => {
  const malformed = {
    ...request(),
    actorRole: "owner",
    target: {
      kind: "identity",
      tenantId: "tenant-alpha",
      subjectId: "subject-two",
      requestedRole: "owner",
    },
  };
  const parsed = parseEnterpriseAuthorizationRequest(malformed);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.issues.join("\n"), /actorRole is not allowed/);
    assert.match(parsed.issues.join("\n"), /requestedRole/);
  }
});

test("requires target shape to match the requested action", () => {
  const mismatched = request({
    action: "identity.read",
    target: { kind: "tenant", tenantId: "tenant-alpha" },
  });
  const decision = decide(mismatched, actor({ role: "admin" }));
  assert.equal(decision.effect, "deny");
  assert.equal(decision.reason, "TARGET_ACTION_MISMATCH");
});

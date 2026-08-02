import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNotificationOutboxLease,
  assertNotificationOutboxTransition,
  claimNotificationOutbox,
  createNotificationOutboxEnvelope,
  enqueueNotificationOutbox,
  hashNotificationProviderMessageId,
  NOTIFICATION_OUTBOX_EXTERNAL_DELIVERY_ENABLED,
  NotificationOutboxError,
  notificationOutboxCanDispatchExternally,
  notificationOutboxRetryAt,
  parseNotificationOutboxTenantKey,
  renewNotificationOutboxLease,
  resolveNotificationOutboxFailure,
  settleNotificationOutboxAttempt,
  type NotificationOutboxRpcClient,
} from "../lib/notifications/outbox.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260715212000_notification_outbox.sql",
  ),
  "utf8",
);
const implementation = readFileSync(
  resolve(repositoryRoot, "lib/notifications/outbox.ts"),
  "utf8",
);

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_KEY = `team:${TENANT_ID}`;
const OUTBOX_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-07-15T21:20:00.000Z");

function draft(overrides: Record<string, unknown> = {}) {
  return {
    tenantKey: TENANT_KEY,
    channel: "email" as const,
    idempotencyKey: "share-ready-request-0001",
    eventType: "share_link.ready",
    recipientIdentity: "Reviewer@Example.com",
    payload: {
      asset_id: "asset-a",
      intent_fingerprint: `sha256:${"3".repeat(64)}`,
      project_id: "project-a",
      schema_version: "cco.transactional-notification.v1",
    },
    availableAt: NOW.toISOString(),
    maxAttempts: 5,
    ...overrides,
  };
}

function rpcRecord(overrides: Record<string, unknown> = {}) {
  return {
    outbox_id: OUTBOX_ID,
    tenant_kind: "team",
    tenant_id: TENANT_ID,
    channel: "email",
    idempotency_key: "share-ready-request-0001",
    event_type: "share_link.ready",
    recipient_identity_hash: `sha256:${"1".repeat(64)}`,
    recipient_redacted: "r***@e***.com",
    payload: {
      asset_id: "asset-a",
      intent_fingerprint: `sha256:${"3".repeat(64)}`,
      project_id: "project-a",
      schema_version: "cco.transactional-notification.v1",
    },
    payload_fingerprint: `sha256:${"2".repeat(64)}`,
    status: "queued",
    attempt_count: 0,
    max_attempts: 5,
    available_at: NOW.toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    lease_fence: 0,
    last_error_code: null,
    sent_at: null,
    dead_at: null,
    replayed: false,
    ...overrides,
  };
}

test("outbox fingerprints are canonical and tenant/channel bound", () => {
  const first = createNotificationOutboxEnvelope(draft(), { now: NOW });
  const reordered = createNotificationOutboxEnvelope(
    draft({
      idempotencyKey: "share-ready-request-9999",
      recipientIdentity: "reviewer@example.com",
      payload: {
        schema_version: "cco.transactional-notification.v1",
        project_id: "project-a",
        intent_fingerprint: `sha256:${"3".repeat(64)}`,
        asset_id: "asset-a",
      },
    }),
    { now: NOW },
  );
  const otherTenant = createNotificationOutboxEnvelope(
    draft({ tenantKey: `team:${OTHER_TENANT_ID}` }),
    { now: NOW },
  );
  const personalTenant = createNotificationOutboxEnvelope(
    draft({ tenantKey: `personal:${TENANT_ID}` }),
    { now: NOW },
  );

  assert.equal(first.payloadFingerprint, reordered.payloadFingerprint);
  assert.notEqual(first.payloadFingerprint, otherTenant.payloadFingerprint);
  assert.notEqual(first.payloadFingerprint, personalTenant.payloadFingerprint);
  assert.equal(first.tenantKey, TENANT_KEY);
  assert.equal(first.tenantKind, "team");
  assert.match(first.payloadFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.recipientRedacted, "r***@e***.com");
  assert.doesNotMatch(JSON.stringify(first), /reviewer@example\.com/i);
});

test("tenant keys require an explicit personal or team authority", () => {
  assert.deepEqual(parseNotificationOutboxTenantKey(`personal:${TENANT_ID}`), {
    tenantKind: "personal",
    tenantId: TENANT_ID,
    tenantKey: `personal:${TENANT_ID}`,
  });
  assert.throws(
    () => parseNotificationOutboxTenantKey(TENANT_ID),
    (error: unknown) =>
      error instanceof NotificationOutboxError && error.code === "invalid_input",
  );
});

test("recipient identity fields cannot be smuggled into durable payloads", () => {
  assert.throws(
    () =>
      createNotificationOutboxEnvelope(
        draft({
          payload: {
            schema_version: "cco.transactional-notification.v1",
            delivery: { recipientEmail: "reviewer@example.com" },
          },
        }),
        { now: NOW },
      ),
    (error: unknown) =>
      error instanceof NotificationOutboxError &&
      error.code === "sensitive_payload",
  );
  assert.throws(
    () => createNotificationOutboxEnvelope(draft({ maxAttempts: 13 }), { now: NOW }),
    (error: unknown) =>
      error instanceof NotificationOutboxError && error.code === "invalid_input",
  );
  for (const payload of [
    { action_url: "/review/private-token" },
    { body: "Open https://co-videopro.com/review/private-token" },
    { share_token: "private-token" },
  ]) {
    assert.throws(
      () => createNotificationOutboxEnvelope(draft({ payload }), { now: NOW }),
      (error: unknown) =>
        error instanceof NotificationOutboxError &&
        error.code === "sensitive_payload",
    );
  }
});

test("URL and message values cannot hide under innocent payload keys", () => {
  for (const payload of [
    { metadata: "https://co-videopro.com/review/private-token" },
    { info: "https:co-videopro.com" },
    { details: { value: "/review/private-token?access=secret" } },
    { items: [{ note: "Open the review link for this client." }] },
  ]) {
    assert.throws(
      () => createNotificationOutboxEnvelope(draft({ payload }), { now: NOW }),
      (error: unknown) =>
        error instanceof NotificationOutboxError &&
        error.code === "sensitive_payload",
    );
  }
});

test("retry timing and attempt exhaustion are deterministic and bounded", () => {
  assert.equal(
    notificationOutboxRetryAt({ now: NOW.toISOString(), attemptCount: 1 }),
    "2026-07-15T21:20:30.000Z",
  );
  assert.equal(
    notificationOutboxRetryAt({ now: NOW.toISOString(), attemptCount: 4 }),
    "2026-07-15T21:24:00.000Z",
  );
  assert.deepEqual(
    resolveNotificationOutboxFailure({
      attemptCount: 4,
      maxAttempts: 5,
      retryable: true,
      now: NOW.toISOString(),
    }),
    { state: "retry", availableAt: "2026-07-15T21:24:00.000Z" },
  );
  assert.deepEqual(
    resolveNotificationOutboxFailure({
      attemptCount: 5,
      maxAttempts: 5,
      retryable: true,
      now: NOW.toISOString(),
    }),
    { state: "dead", availableAt: null },
  );
  assert.deepEqual(
    resolveNotificationOutboxFailure({
      attemptCount: 1,
      maxAttempts: 5,
      retryable: false,
      now: NOW.toISOString(),
    }),
    { state: "dead", availableAt: null },
  );
});

test("state transitions are explicit and stale or expired leases fail closed", () => {
  assert.doesNotThrow(() => assertNotificationOutboxTransition("queued", "leased"));
  assert.doesNotThrow(() => assertNotificationOutboxTransition("leased", "retry"));
  assert.doesNotThrow(() => assertNotificationOutboxTransition("leased", "sent"));
  assert.throws(
    () => assertNotificationOutboxTransition("sent", "retry"),
    (error: unknown) =>
      error instanceof NotificationOutboxError &&
      error.code === "invalid_transition",
  );

  assert.throws(
    () =>
      assertNotificationOutboxLease({
        state: "leased",
        leaseOwner: "worker-a",
        expectedLeaseOwner: "worker-a",
        leaseFence: 3,
        expectedLeaseFence: 2,
        leaseExpiresAt: "2026-07-15T21:21:00.000Z",
        now: NOW.toISOString(),
      }),
    (error: unknown) =>
      error instanceof NotificationOutboxError && error.code === "stale_fence",
  );
  assert.throws(
    () =>
      assertNotificationOutboxLease({
        state: "leased",
        leaseOwner: "worker-a",
        expectedLeaseOwner: "worker-a",
        leaseFence: 3,
        expectedLeaseFence: 3,
        leaseExpiresAt: NOW.toISOString(),
        now: NOW.toISOString(),
      }),
    (error: unknown) =>
      error instanceof NotificationOutboxError && error.code === "lease_expired",
  );
});

test("enqueue RPC receives only redacted recipient authority", async () => {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const client: NotificationOutboxRpcClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { data: rpcRecord(), error: null };
    },
  };

  const queued = await enqueueNotificationOutbox(client, draft(), { now: NOW });
  assert.equal(queued.state, "queued");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "enqueue_notification_outbox");
  assert.equal(calls[0].parameters.p_tenant_kind, "team");
  assert.equal(calls[0].parameters.p_tenant_id, TENANT_ID);
  assert.equal(calls[0].parameters.p_recipient_redacted, "r***@e***.com");
  assert.match(
    String(calls[0].parameters.p_recipient_identity_hash),
    /^sha256:[0-9a-f]{64}$/,
  );
  assert.doesNotMatch(JSON.stringify(calls[0]), /reviewer@example\.com/i);
});

test("RPC records cannot escape the requested tenant authority", async () => {
  const client: NotificationOutboxRpcClient = {
    async rpc() {
      return {
        data: rpcRecord({
          tenant_kind: "personal",
          tenant_id: OTHER_TENANT_ID,
        }),
        error: null,
      };
    },
  };

  await assert.rejects(
    () => enqueueNotificationOutbox(client, draft(), { now: NOW }),
    (error: unknown) =>
      error instanceof NotificationOutboxError &&
      error.code === "invalid_response",
  );
});

test("settlement hashes provider message IDs before the database boundary", async () => {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const client: NotificationOutboxRpcClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return {
        data: rpcRecord({
          status: "sent",
          attempt_count: 1,
          lease_fence: 1,
          sent_at: "2026-07-15T21:20:10.000Z",
        }),
        error: null,
      };
    },
  };

  await settleNotificationOutboxAttempt(client, {
    tenantKey: TENANT_KEY,
    outboxId: OUTBOX_ID,
    leaseOwner: "worker-a",
    leaseFence: 1,
    outcome: "sent",
    provider: "resend",
    providerMessageId: "provider-message-sensitive-0001",
  });

  assert.equal(calls[0].name, "settle_notification_outbox_attempt");
  assert.equal(
    calls[0].parameters.p_provider_message_id_hash,
    hashNotificationProviderMessageId("resend", "provider-message-sensitive-0001"),
  );
  assert.doesNotMatch(JSON.stringify(calls[0]), /provider-message-sensitive-0001/);
});

test("worker claims and lease renewal remain scoped to the canonical tenant", async () => {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const leasedRecord = rpcRecord({
    status: "leased",
    attempt_count: 1,
    lease_owner: "worker-a",
    lease_expires_at: "2026-07-15T21:21:00.000Z",
    lease_fence: 1,
  });
  const client: NotificationOutboxRpcClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return {
        data: name === "claim_notification_outbox" ? [leasedRecord] : leasedRecord,
        error: null,
      };
    },
  };

  const claimed = await claimNotificationOutbox(client, {
    tenantKey: TENANT_KEY,
    leaseOwner: "worker-a",
  });
  await renewNotificationOutboxLease(client, {
    tenantKey: TENANT_KEY,
    outboxId: OUTBOX_ID,
    leaseOwner: "worker-a",
    leaseFence: 1,
  });

  assert.equal(claimed.length, 1);
  for (const call of calls) {
    assert.equal(call.parameters.p_tenant_kind, "team");
    assert.equal(call.parameters.p_tenant_id, TENANT_ID);
  }
});

test("migration binds idempotency and queue state to one tenant and channel", () => {
  assert.match(
    migration,
    /UNIQUE \(tenant_kind, tenant_id, channel, idempotency_key\)/,
  );
  assert.match(migration, /tenant_kind text NOT NULL CHECK \(tenant_kind IN \('personal', 'team'\)\)/);
  assert.doesNotMatch(migration, /tenant_id uuid NOT NULL REFERENCES co_production\.teams/);
  assert.match(
    migration,
    /FOREIGN KEY \(outbox_id, tenant_kind, tenant_id\)[\s\S]*REFERENCES co_production\.notification_outbox\(id, tenant_kind, tenant_id\)/,
  );
  assert.match(
    migration,
    /status IN \('queued', 'leased', 'retry', 'dead', 'sent'\)/,
  );
  assert.match(migration, /attempt_count <= max_attempts/);
  assert.match(migration, /max_attempts BETWEEN 1 AND 12/);
  assert.match(migration, /available_at timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(migration, /lease_owner text/);
  assert.match(migration, /lease_expires_at timestamptz/);
  assert.match(migration, /lease_fence = attempt_count/);
  assert.match(migration, /payload_fingerprint text NOT NULL/);
  assert.match(
    migration,
    /token\|secret\|password\|authorization\|cookie\|url\|body\|message\|content\|text\|subject\|title/,
  );
  assert.match(
    migration,
    /payload jsonb NOT NULL CHECK \([\s\S]*notification_outbox_payload_is_safe\(payload\)/,
  );
  assert.match(
    migration,
    /OR NOT co_production_private\.notification_outbox_payload_is_safe\(p_payload\)/,
  );
  assert.match(migration, /notification_outbox_idempotency_conflict/);
});

test("migration recursively rejects unsafe JSON string scalars", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production_private\.notification_outbox_payload_is_safe/,
  );
  assert.match(migration, /pg_catalog\.jsonb_each\(p_value\)/);
  assert.match(migration, /pg_catalog\.jsonb_array_elements\(p_value\)/);
  assert.ok(
    migration.includes(
      "RETURN (p_value #>> '{}') ~ '^(sha256:[0-9a-f]{64}|[A-Za-z0-9][A-Za-z0-9._+-]{0,119})$';",
    ),
  );
});

test("claim, renew, and settle use locking plus monotonic fencing", () => {
  assert.match(migration, /FOR UPDATE SKIP LOCKED/g);
  assert.match(migration, /lease_fence = job\.lease_fence \+ 1/);
  assert.match(migration, /attempt_count = job\.attempt_count \+ 1/);
  assert.match(migration, /notification_outbox_stale_fence/);
  assert.match(migration, /notification_outbox_lease_expired/);
  assert.match(migration, /status = 'retry'/);
  assert.match(migration, /status = 'dead'/);
  assert.match(migration, /status = 'sent'/);
  assert.match(migration, /attempt_count >= v_job\.max_attempts/);
});

test("events and receipts are immutable, ordered, and replay-safe", () => {
  assert.match(migration, /UNIQUE \(outbox_id, event_sequence\)/);
  assert.match(migration, /previous_event_fingerprint text NOT NULL/);
  assert.match(migration, /event_fingerprint text NOT NULL UNIQUE/);
  assert.match(
    migration,
    /notification_outbox_receipts_one_per_fence[\s\S]*UNIQUE \(outbox_id, lease_fence\)/,
  );
  assert.match(migration, /receipt_fingerprint text NOT NULL UNIQUE/);
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.notification_outbox_events/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.notification_outbox_receipts/,
  );
  assert.match(migration, /BEFORE TRUNCATE ON co_production\.notification_outbox_events/);
  assert.match(migration, /BEFORE TRUNCATE ON co_production\.notification_outbox_receipts/);
  assert.match(migration, /notification_outbox_receipt_conflict/);
  assert.match(migration, /provider_message_id_hash text/);
  assert.doesNotMatch(migration, /provider_message_id text/);
});

test("database privileges expose enqueue separately from worker authority", () => {
  assert.match(
    migration,
    /REVOKE ALL ON TABLE[\s\S]*notification_outbox_receipts[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.enqueue_notification_outbox\([\s\S]*?\) TO authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.claim_notification_outbox\([\s\S]*?\) TO service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.renew_notification_outbox_lease\([\s\S]*?\) TO service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.settle_notification_outbox_attempt\([\s\S]*?\) TO service_role/,
  );
  assert.match(migration, /assert_notification_tenant_access\([\s\S]*?p_tenant_kind[\s\S]*?p_tenant_id/);
  assert.match(migration, /p_tenant_kind = 'personal'[\s\S]*?FROM auth\.users/);
  assert.match(migration, /p_tenant_kind = 'team'[\s\S]*?FROM co_production\.teams/);
  assert.match(migration, /p_tenant_kind = 'personal'[\s\S]*?auth\.uid\(\)[\s\S]*?p_tenant_id/);
  assert.match(migration, /has_team_role\(p_tenant_id, p_required_rank\)/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
});

test("external delivery remains disabled and no provider adapter is reachable", () => {
  assert.equal(NOTIFICATION_OUTBOX_EXTERNAL_DELIVERY_ENABLED, false);
  assert.equal(notificationOutboxCanDispatchExternally("email"), false);
  assert.equal(notificationOutboxCanDispatchExternally("sms"), false);
  assert.equal(notificationOutboxCanDispatchExternally("imessage"), false);
  assert.doesNotMatch(
    implementation,
    /notifications\/adapters|sendEmail|dispatchNotificationChannels|fetch\(/,
  );
  assert.doesNotMatch(migration, /net\.http|http_post|pg_net|webhook/i);
  assert.match(
    migration,
    /Queue authority only\. No external notification provider is enabled/,
  );
});

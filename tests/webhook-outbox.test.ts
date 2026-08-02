import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertWebhookOutboxLease,
  assertWebhookOutboxTransition,
  claimWebhookOutboxDeliveries,
  createWebhookOutboxEnvelope,
  enqueueWebhookOutboxDelivery,
  renewWebhookOutboxLease,
  settleWebhookOutboxDelivery,
  WebhookOutboxError,
  webhookOutboxRetryAt,
  type WebhookOutboxRpcClient,
} from "../lib/security/webhook-outbox.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260715224500_webhook_delivery_outbox.sql",
  ),
  "utf8",
);

const WEBHOOK_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const DELIVERY_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-07-15T22:45:00.000Z");

function draft(overrides: Record<string, unknown> = {}) {
  return {
    webhookId: WEBHOOK_ID,
    expectedTeamId: TEAM_ID,
    event: "asset.approved",
    idempotencyKey: "approval:11111111:approved",
    payload: {
      event: "asset.approved",
      timestamp: "2026-07-15T22:45:00.000Z",
      data: { asset_id: "asset-a", decision: "approved" },
    },
    availableAt: NOW.toISOString(),
    maxAttempts: 5,
    ...overrides,
  };
}

function rpcRecord(overrides: Record<string, unknown> = {}) {
  return {
    delivery_id: DELIVERY_ID,
    webhook_id: WEBHOOK_ID,
    expected_team_id: TEAM_ID,
    event: "asset.approved",
    idempotency_key: "approval:11111111:approved",
    payload: draft().payload,
    payload_fingerprint: `sha256:${"3".repeat(64)}`,
    status: "queued",
    attempt_count: 0,
    max_attempts: 5,
    available_at: NOW.toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    lease_fence: 0,
    response_code: null,
    duration_ms: null,
    error_code: null,
    delivered_at: null,
    completed_at: null,
    replayed: false,
    ...overrides,
  };
}

function rpcClient(
  handler: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => { data: unknown; error: null },
): WebhookOutboxRpcClient {
  return { rpc: async (functionName, parameters) => handler(functionName, parameters) };
}

test("webhook outbox fingerprints canonical payloads and ignores delivery timestamps", () => {
  const first = createWebhookOutboxEnvelope(draft(), { now: NOW });
  const reordered = createWebhookOutboxEnvelope(
    draft({
      payload: {
        data: { decision: "approved", asset_id: "asset-a" },
        timestamp: "2026-07-15T22:46:00.000Z",
        event: "asset.approved",
      },
    }),
    { now: NOW },
  );
  assert.equal(first.payloadFingerprint, reordered.payloadFingerprint);
  assert.deepEqual(Object.keys(first.payload), ["data", "event", "timestamp"]);
  assert.match(first.payloadFingerprint, /^sha256:[0-9a-f]{64}$/);
});

test("webhook outbox rejects weak authority and idempotency inputs", () => {
  assert.throws(
    () => createWebhookOutboxEnvelope(draft({ webhookId: "hook-a" })),
    (error: unknown) =>
      error instanceof WebhookOutboxError && error.code === "invalid_input",
  );
  assert.throws(
    () => createWebhookOutboxEnvelope(draft({ idempotencyKey: "short" })),
    (error: unknown) =>
      error instanceof WebhookOutboxError && error.code === "invalid_input",
  );
  assert.throws(
    () => createWebhookOutboxEnvelope(draft({ maxAttempts: 13 })),
    (error: unknown) =>
      error instanceof WebhookOutboxError && error.code === "invalid_input",
  );
});

test("retry timing and lease fencing are deterministic and fail closed", () => {
  assert.equal(
    webhookOutboxRetryAt({ now: NOW.toISOString(), attemptCount: 1 }),
    "2026-07-15T22:45:30.000Z",
  );
  assert.equal(
    webhookOutboxRetryAt({ now: NOW.toISOString(), attemptCount: 4 }),
    "2026-07-15T22:49:00.000Z",
  );
  assert.doesNotThrow(() => assertWebhookOutboxTransition("queued", "leased"));
  assert.doesNotThrow(() => assertWebhookOutboxTransition("leased", "retry"));
  assert.throws(
    () => assertWebhookOutboxTransition("sent", "retry"),
    (error: unknown) =>
      error instanceof WebhookOutboxError &&
      error.code === "invalid_transition",
  );
  assert.doesNotThrow(() =>
    assertWebhookOutboxLease({
      state: "leased",
      leaseOwner: "worker:one",
      expectedLeaseOwner: "worker:one",
      leaseFence: 2,
      expectedLeaseFence: 2,
      leaseExpiresAt: "2026-07-15T22:46:00.000Z",
      now: NOW.toISOString(),
    }),
  );
  assert.throws(
    () =>
      assertWebhookOutboxLease({
        state: "leased",
        leaseOwner: "worker:one",
        expectedLeaseOwner: "worker:two",
        leaseFence: 2,
        expectedLeaseFence: 2,
        leaseExpiresAt: "2026-07-15T22:46:00.000Z",
        now: NOW.toISOString(),
      }),
    (error: unknown) =>
      error instanceof WebhookOutboxError && error.code === "stale_fence",
  );
});

test("enqueue binds the RPC to webhook, event, payload, and idempotency", async () => {
  let call: { name: string; parameters: Record<string, unknown> } | null = null;
  const record = await enqueueWebhookOutboxDelivery(
    rpcClient((name, parameters) => {
      call = { name, parameters };
      return { data: rpcRecord(), error: null };
    }),
    draft(),
    { now: NOW },
  );
  assert.equal(record.id, DELIVERY_ID);
  assert.equal(record.state, "queued");
  assert.deepEqual(call, {
    name: "enqueue_webhook_delivery",
    parameters: {
      p_webhook_id: WEBHOOK_ID,
      p_expected_team_id: TEAM_ID,
      p_event: "asset.approved",
      p_payload: draft().payload,
      p_idempotency_key: "approval:11111111:approved",
      p_available_at: NOW.toISOString(),
      p_max_attempts: 5,
    },
  });
});

test("claim, renew, and settle preserve lease ownership and fencing", async () => {
  const calls: string[] = [];
  const client = rpcClient((name) => {
    calls.push(name);
    if (name === "claim_webhook_deliveries") {
      return {
        data: [
          rpcRecord({
            status: "leased",
            attempt_count: 1,
            lease_owner: "worker:one",
            lease_expires_at: "2026-07-15T22:46:00.000Z",
            lease_fence: 1,
          }),
        ],
        error: null,
      };
    }
    if (name === "renew_webhook_delivery_lease") {
      return {
        data: rpcRecord({
          status: "leased",
          attempt_count: 1,
          lease_owner: "worker:one",
          lease_expires_at: "2026-07-15T22:47:00.000Z",
          lease_fence: 1,
        }),
        error: null,
      };
    }
    return {
      data: rpcRecord({
        status: "sent",
        attempt_count: 1,
        lease_fence: 1,
        response_code: 204,
        duration_ms: 42,
        delivered_at: "2026-07-15T22:45:10.000Z",
        completed_at: "2026-07-15T22:45:10.000Z",
      }),
      error: null,
    };
  });
  const [leased] = await claimWebhookOutboxDeliveries(client, {
    leaseOwner: "worker:one",
  });
  assert.equal(leased.state, "leased");
  const renewed = await renewWebhookOutboxLease(client, {
    deliveryId: leased.id,
    leaseOwner: "worker:one",
    leaseFence: leased.leaseFence,
    leaseSeconds: 120,
  });
  assert.equal(renewed.leaseExpiresAt, "2026-07-15T22:47:00.000Z");
  const sent = await settleWebhookOutboxDelivery(client, {
    deliveryId: leased.id,
    leaseOwner: "worker:one",
    leaseFence: leased.leaseFence,
    outcome: "sent",
    responseCode: 204,
    durationMs: 42,
  });
  assert.equal(sent.state, "sent");
  assert.deepEqual(calls, [
    "claim_webhook_deliveries",
    "renew_webhook_delivery_lease",
    "settle_webhook_delivery",
  ]);
});

test("worker RPC failures preserve stale, expired, and conflicting meanings", async () => {
  for (const [message, expectedCode] of [
    ["webhook_outbox_stale_fence", "stale_fence"],
    ["webhook_outbox_lease_expired", "lease_expired"],
    ["webhook_outbox_settlement_conflict", "idempotency_conflict"],
  ] as const) {
    const client: WebhookOutboxRpcClient = {
      rpc: async () => ({ data: null, error: { message, code: "P0001" } }),
    };
    await assert.rejects(
      () =>
        renewWebhookOutboxLease(client, {
          deliveryId: DELIVERY_ID,
          leaseOwner: "worker:one",
          leaseFence: 1,
        }),
      (error: unknown) =>
        error instanceof WebhookOutboxError && error.code === expectedCode,
    );
  }
});

test("settlement validates outcome-specific fields before touching the RPC", async () => {
  let called = false;
  const client = rpcClient(() => {
    called = true;
    return { data: rpcRecord(), error: null };
  });
  await assert.rejects(
    () =>
      settleWebhookOutboxDelivery(client, {
        deliveryId: DELIVERY_ID,
        leaseOwner: "worker:one",
        leaseFence: 1,
        outcome: "retry",
        errorCode: "network_error",
      }),
    (error: unknown) =>
      error instanceof WebhookOutboxError && error.code === "invalid_input",
  );
  assert.equal(called, false);
});

test("migration enqueues before delivery and restricts worker mutations", () => {
  assert.match(migration, /UNIQUE \(webhook_id, idempotency_key\)/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /webhook_outbox_stale_fence/);
  assert.match(
    migration,
    /webhook_outbox_legacy_payload_requires_manual_remediation/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(webhook_id, team_id\)[\s\S]*ON DELETE RESTRICT/,
  );
  assert.match(migration, /ADD CONSTRAINT webhooks_id_team_key UNIQUE \(id, team_id\)/);
  assert.match(migration, /'expected_team_id', delivery\.team_id/);
  assert.match(migration, /system:legacy-backfill/);
  assert.match(
    migration,
    /EXCEPTION WHEN unique_violation[\s\S]*append_webhook_delivery_event\([\s\S]*'replayed'/,
  );
  assert.match(migration, /status IN \('queued', 'leased', 'retry', 'dead', 'sent'\)/);
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*webhook_deliveries/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.claim_webhook_deliveries[\s\S]*TO service_role/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.renew_webhook_delivery_lease[\s\S]*TO service_role/,
  );
  assert.match(migration, /CREATE TABLE co_production\.webhook_delivery_receipts/);
  assert.match(
    migration,
    /SELECT delivery\.\*[\s\S]*FOR UPDATE;[\s\S]*SELECT receipt\.\*[\s\S]*webhook_outbox_settlement_conflict/,
  );
  assert.match(migration, /event_type IN \([\s\S]*'lease_renewed'/);
  assert.match(
    migration,
    /JOIN co_production\.webhooks AS webhook[\s\S]*webhook\.active = true[\s\S]*FOR UPDATE OF delivery SKIP LOCKED/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE ON co_production\.webhook_deliveries[\s\S]*guard_webhook_delivery_update/,
  );
  assert.match(
    migration,
    /octet_length\([\s\S]*convert_to\(payload::text, 'UTF8'\)[\s\S]*webhook_outbox_payload_node_count\(payload\)/,
  );
  assert.doesNotMatch(migration, /CREATE INDEX webhook_delivery_events_delivery_idx/);
  assert.match(migration, /does not install or schedule a[\s\S]*worker/i);
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.webhook_delivery_events/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.webhook_delivery_events/,
  );
  assert.doesNotMatch(migration, /http_post|net\.http|pg_net/);
});

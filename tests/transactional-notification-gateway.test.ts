import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DataSupabaseClient } from "../lib/supabase.ts";
import type { NotificationAdapter } from "../lib/notifications/authority.ts";
import type {
  NotificationOutboxDraft,
  NotificationOutboxRecord,
} from "../lib/notifications/outbox.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  dispatchTransactionalNotification,
  notificationChannelStatus,
} = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/notifications/transactional.ts")).href
);

function baseInput(client: DataSupabaseClient) {
  return {
    client,
    tenantId: "tenant-a",
    actorId: "actor-a",
    actorName: "Content Co-op Producer",
    eventType: "approval_requested",
    idempotencyKey: "approval-request:approval-a",
    channels: ["email"] as const,
    recipient: { email: "reviewer@example.com" },
    message: {
      title: "Review requested",
      body: "A new version is ready for approval.",
      actionUrl: "/review/token-a",
    },
    projectId: "project-a",
    assetId: "asset-a",
  };
}

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const RECIPIENT_ID = "22222222-2222-4222-8222-222222222222";
const OUTBOX_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_KEY = `team:${TENANT_ID}`;

function queueClient({
  suppressed = false,
  suppressionError = null,
}: {
  suppressed?: boolean;
  suppressionError?: { message: string } | null;
} = {}) {
  return {
    from(table: string) {
      assert.equal(table, "activity_log");
      return {
        select() { return this; },
        eq() { return this; },
        contains() { return this; },
        limit() { return this; },
        async maybeSingle() {
          return {
            data: suppressed ? { id: "suppression-a" } : null,
            error: suppressionError,
          };
        },
      };
    },
  } as unknown as DataSupabaseClient;
}

function outboxRecord(
  overrides: Partial<NotificationOutboxRecord> = {},
): NotificationOutboxRecord {
  return {
    schemaVersion: "cco.notification-outbox.v1",
    id: OUTBOX_ID,
    tenantKind: "team",
    tenantId: TENANT_ID,
    tenantKey: TENANT_KEY,
    channel: "email",
    idempotencyKey: "approval-request:approval-a",
    eventType: "approval_requested",
    recipientIdentityHash: `sha256:${"1".repeat(64)}`,
    recipientRedacted: "r***@e***.com",
    payload: {},
    payloadFingerprint: `sha256:${"2".repeat(64)}`,
    state: "queued",
    attemptCount: 0,
    maxAttempts: 5,
    availableAt: "2026-07-15T21:20:00.000Z",
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseFence: 0,
    lastErrorCode: null,
    sentAt: null,
    deadAt: null,
    replayed: false,
    ...overrides,
  };
}

const emailAdapter: NotificationAdapter = {
  channel: "email",
  provider: "test-email",
  configured: true,
  async send() {
    return { status: "sent", providerMessageId: "message-a" };
  },
};

test("transactional notifications enter the audited dispatcher with explicit authority", async () => {
  let captured: Parameters<
    NonNullable<Parameters<typeof dispatchTransactionalNotification>[1]["dispatch"]>
  >[0] | null = null;
  const result = await dispatchTransactionalNotification(
    baseInput({} as DataSupabaseClient),
    {
      dataSchema: "public",
      adapters: [emailAdapter],
      async dispatch(input) {
        captured = input;
        return {
          ok: true,
          mode: "send",
          deduplicated: false,
          receipts: [
            {
              channel: "email",
              status: "sent",
              provider: "test-email",
              providerMessageId: "message-a",
              attemptedProviders: ["test-email"],
              errorCode: null,
            },
          ],
          audit: { status: "recorded", receipt_id: "receipt-a" },
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(captured?.request.tenantId, "tenant-a");
  assert.equal(captured?.request.confirmedLiveSend, true);
  assert.equal(captured?.request.idempotencyKey, "approval-request:approval-a");
  assert.equal(captured?.preferenceEnabled.email, true);
  assert.equal(notificationChannelStatus(result, "email"), "sent");
});

test("recipient preference checks fail closed and default email to off", async () => {
  const client = {
    from(table: string) {
      assert.equal(table, "notification_preferences");
      return {
        select() { return this; },
        eq() { return this; },
        limit() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
      };
    },
  } as unknown as DataSupabaseClient;
  let preferenceEnabled: Record<string, boolean> | undefined;

  const result = await dispatchTransactionalNotification(
    {
      ...baseInput(client),
      channels: ["in_app", "email"],
      recipient: { userId: "owner-a", email: "owner@example.com" },
      preferenceMode: "recipient",
    },
    {
      dataSchema: "public",
      adapters: [emailAdapter],
      async dispatch(input) {
        preferenceEnabled = input.preferenceEnabled as Record<string, boolean>;
        return {
          ok: true,
          mode: "send",
          deduplicated: false,
          receipts: [],
          audit: { status: "recorded", receipt_id: "receipt-b" },
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(preferenceEnabled, { in_app: true, email: false });
});

test("foreign action URLs are rejected before notification dispatch", async () => {
  let dispatched = false;
  const result = await dispatchTransactionalNotification(
    {
      ...baseInput({} as DataSupabaseClient),
      message: {
        title: "Review requested",
        body: "Open the review.",
        actionUrl: "https://attacker.example/phish",
      },
    },
    {
      dataSchema: "public",
      adapters: [emailAdapter],
      async dispatch() {
        dispatched = true;
        throw new Error("should not dispatch");
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(dispatched, false);
  assert.equal(notificationChannelStatus(result, "email"), "authority_failed");
});

test("co-production records external notification authority in the durable outbox only", async () => {
  let dispatched = false;
  let capturedDraft: NotificationOutboxDraft | null = null;
  const result = await dispatchTransactionalNotification(
    {
      ...baseInput(queueClient()),
      tenantId: TENANT_KEY,
    },
    {
      dataSchema: "co_production",
      async enqueue(_client, draft) {
        capturedDraft = draft;
        return outboxRecord();
      },
      async dispatch() {
        dispatched = true;
        throw new Error("external adapters must not run");
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.mode, "queued");
  assert.equal(notificationChannelStatus(result, "email"), "queued");
  assert.equal(dispatched, false);
  assert.equal(capturedDraft?.tenantKey, TENANT_KEY);
  assert.equal(capturedDraft?.idempotencyKey, "approval-request:approval-a");
  assert.equal(capturedDraft?.recipientIdentity, "reviewer@example.com");
  const intentFingerprint = `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        action_url: "/review/token-a",
        body: "A new version is ready for approval.",
        title: "Review requested",
      }),
      "utf8",
    )
    .digest("hex")}`;
  assert.deepEqual(capturedDraft?.payload, {
    schema_version: "cco.transactional-notification.v1",
    intent_fingerprint: intentFingerprint,
    resolver_contract: "authoritative-resource-lookup-v1",
    purpose: "transactional",
    project_id: "project-a",
    asset_id: "asset-a",
  });
  assert.doesNotMatch(JSON.stringify(capturedDraft?.payload), /token-a|ready for approval/i);
  assert.doesNotMatch(JSON.stringify(result), /reviewer@example\.com/i);
});

test("durable notification payloads bind a validated source authority receipt", async () => {
  let capturedDraft: NotificationOutboxDraft | null = null;
  const scopeFingerprint = `sha256:${"4".repeat(64)}`;
  const result = await dispatchTransactionalNotification(
    {
      ...baseInput(queueClient()),
      tenantId: TENANT_KEY,
      authorityReference: {
        kind: "share_manifest_created",
        id: "receipt:share-a",
        scopeFingerprint,
      },
    },
    {
      dataSchema: "co_production",
      async enqueue(_client, draft) {
        capturedDraft = draft;
        return outboxRecord();
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    capturedDraft?.payload && {
      authority_kind: capturedDraft.payload.authority_kind,
      authority_id: capturedDraft.payload.authority_id,
      authority_scope_fingerprint:
        capturedDraft.payload.authority_scope_fingerprint,
    },
    {
      authority_kind: "share_manifest_created",
      authority_id: "receipt:share-a",
      authority_scope_fingerprint: scopeFingerprint,
    },
  );
});

test("invalid durable notification authority never reaches the queue", async () => {
  let enqueued = false;
  const result = await dispatchTransactionalNotification(
    {
      ...baseInput(queueClient()),
      tenantId: TENANT_KEY,
      authorityReference: {
        kind: "share_manifest_created",
        id: "receipt with spaces",
        scopeFingerprint: `sha256:${"5".repeat(64)}`,
      },
    },
    {
      dataSchema: "co_production",
      async enqueue() {
        enqueued = true;
        return outboxRecord();
      },
    },
  );

  assert.equal(enqueued, false);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    code: "notification_queue_unavailable",
    error:
      "Notification queue authority is unavailable; no external notification was sent",
  });
});

test("co-production queues before preserving the synchronous in-app notification", async () => {
  const order: string[] = [];
  let inAppChannels: string[] = [];
  const result = await dispatchTransactionalNotification(
    {
      ...baseInput(queueClient()),
      tenantId: TENANT_KEY,
      channels: ["in_app", "email"],
      recipient: {
        userId: RECIPIENT_ID,
        email: "owner@example.com",
      },
    },
    {
      dataSchema: "co_production",
      async enqueue() {
        order.push("outbox");
        return outboxRecord();
      },
      async dispatch(input) {
        order.push("in_app");
        inAppChannels = input.request.channels;
        return {
          ok: true,
          mode: "send",
          deduplicated: false,
          receipts: [
            {
              channel: "in_app",
              status: "sent",
              provider: "supabase-notifications",
              providerMessageId: "notification-a",
              attemptedProviders: ["supabase-notifications"],
              errorCode: null,
            },
          ],
          audit: { status: "recorded", receipt_id: "receipt-a" },
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(order, ["outbox", "in_app"]);
  assert.deepEqual(inAppChannels, ["in_app"]);
  assert.deepEqual(
    result.ok ? result.receipts.map((receipt) => [receipt.channel, receipt.status]) : [],
    [
      ["in_app", "sent"],
      ["email", "queued"],
    ],
  );
});

test("co-production queue failures are stable, redacted, and fail closed", async () => {
  const result = await dispatchTransactionalNotification(
    {
      ...baseInput(queueClient()),
      tenantId: TENANT_KEY,
    },
    {
      dataSchema: "co_production",
      async enqueue() {
        throw new Error("secret database policy for reviewer@example.com");
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    code: "notification_queue_unavailable",
    error:
      "Notification queue authority is unavailable; no external notification was sent",
  });
  assert.doesNotMatch(JSON.stringify(result), /secret|policy|reviewer@example\.com/i);
  assert.equal(notificationChannelStatus(result, "email"), "authority_failed");
});

test("co-production suppression prevents queue mutation without exposing the recipient", async () => {
  let enqueued = false;
  const result = await dispatchTransactionalNotification(
    {
      ...baseInput(queueClient({ suppressed: true })),
      tenantId: TENANT_KEY,
    },
    {
      dataSchema: "co_production",
      async enqueue() {
        enqueued = true;
        return outboxRecord();
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(enqueued, false);
  assert.equal(notificationChannelStatus(result, "email"), "suppressed");
  assert.doesNotMatch(JSON.stringify(result), /reviewer@example\.com/i);
});

test("application routes no longer call the raw email provider", () => {
  const routes = [
    "app/api/teams/invites/route.ts",
    "app/api/assets/[id]/approvals/route.ts",
    "app/api/approvals/notify/route.ts",
    "app/api/assets/[id]/comments/route.ts",
    "app/api/review/[token]/comments/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(resolve(repositoryRoot, route), "utf8");
    assert.doesNotMatch(source, /\bsendEmail\b/, route);
    assert.match(source, /dispatchTransactionalNotification/, route);
    assert.match(source, /notification_queue_unavailable/, route);
  }

  const notificationSend = readFileSync(
    resolve(repositoryRoot, "app/api/notifications/send/route.ts"),
    "utf8",
  );
  assert.match(notificationSend, /getSupabaseDataSchema\(\) === CO_PRODUCTION_DATA_SCHEMA/);
  assert.match(notificationSend, /dispatchDurableNotification/);
});

test("route idempotency is derived from immutable notification records", () => {
  const routeExpectations = new Map([
    ["app/api/teams/invites/route.ts", /team-invite:\$\{invite\.id\}/],
    ["app/api/approvals/notify/route.ts", /approval-notify:\$\{reviewInvite\.id\}/],
    ["app/api/assets/[id]/approvals/route.ts", /approval-request:\$\{data\.id\}/],
    ["app/api/assets/[id]/comments/route.ts", /comment-owner:\$\{data\.id\}/],
    [
      "app/api/review/[token]/comments/route.ts",
      /review-comment-owner:\$\{data\.id\}/,
    ],
  ]);

  for (const [route, expectation] of routeExpectations) {
    assert.match(readFileSync(resolve(repositoryRoot, route), "utf8"), expectation, route);
  }

  const publicComments = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts"),
    "utf8",
  );
  assert.match(publicComments, /projectTenantAuthority\(project\.data\)\.key/);
  assert.doesNotMatch(publicComments, /body\.(?:tenant|tenant_id)/);
});

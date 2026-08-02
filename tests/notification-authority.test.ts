import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchNotificationChannels,
  evaluateFixedWindowRateLimit,
  fingerprintNotificationRequest,
  parseNotificationRequest,
  type NotificationAdapter,
} from "../lib/notifications/authority.ts";

const NOW = new Date("2026-07-14T18:00:00.000Z");

function notification(overrides: Record<string, unknown> = {}) {
  return {
    action: "preview",
    tenant_id: "tenant-a",
    event_type: "share_link_ready",
    purpose: "transactional",
    channels: ["email"],
    recipient: { email: "reviewer@example.com" },
    message: {
      title: "Review ready",
      body: "A version is ready.",
      action_url: "https://deliver.example/review/token",
    },
    ...overrides,
  };
}

test("preview authority never requires or implies live-send confirmation", () => {
  const parsed = parseNotificationRequest(notification(), {
    authenticatedTenantId: "tenant-a",
    allowedOrigin: "https://deliver.example",
    now: NOW,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.action, "preview");
  assert.equal(parsed.value.confirmedLiveSend, false);
  assert.equal(parsed.value.idempotencyKey, null);
});

test("forced previews strip live-send authority from an otherwise authorized payload", () => {
  const parsed = parseNotificationRequest(
    notification({
      action: "send",
      confirm_live_send: true,
      idempotency_key: "notification-request-0000",
    }),
    {
      authenticatedTenantId: "tenant-a",
      allowedOrigin: "https://deliver.example",
      forcePreview: true,
      now: NOW,
    },
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.action, "preview");
  assert.equal(parsed.value.confirmedLiveSend, false);
  assert.equal(parsed.value.idempotencyKey, null);
});

test("live sends require explicit confirmation and an idempotency key", () => {
  const missingConfirmation = parseNotificationRequest(notification({ action: "send" }), {
    authenticatedTenantId: "tenant-a",
    allowedOrigin: "https://deliver.example",
    now: NOW,
  });
  assert.equal(missingConfirmation.ok, false);
  if (!missingConfirmation.ok) assert.match(missingConfirmation.error, /confirm_live_send/);

  const authorized = parseNotificationRequest(
    notification({
      action: "send",
      confirm_live_send: true,
      idempotency_key: "notification-request-0001",
    }),
    {
      authenticatedTenantId: "tenant-a",
      allowedOrigin: "https://deliver.example",
      now: NOW,
    },
  );
  assert.equal(authorized.ok, true);
});

test("SMS and iMessage live sends require channel-specific consent evidence", () => {
  const noConsent = parseNotificationRequest(
    notification({
      action: "send",
      channels: ["sms"],
      recipient: { phone: "+12145550199" },
      confirm_live_send: true,
      idempotency_key: "notification-request-0002",
    }),
    { authenticatedTenantId: "tenant-a", now: NOW },
  );
  assert.equal(noConsent.ok, false);
  if (!noConsent.ok) assert.match(noConsent.error, /recorded consent/);

  const consented = parseNotificationRequest(
    notification({
      action: "send",
      channels: ["sms", "imessage"],
      recipient: { phone: "+12145550199", imessage_handle: "reviewer@example.com" },
      consent: {
        sms: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
        imessage: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
      },
      confirm_live_send: true,
      idempotency_key: "notification-request-0003",
    }),
    { authenticatedTenantId: "tenant-a", now: NOW },
  );
  assert.equal(consented.ok, true);
});

test("notification previews reject cross-tenant and phishing action URLs", () => {
  const crossTenant = parseNotificationRequest(notification({ tenant_id: "tenant-b" }), {
    authenticatedTenantId: "tenant-a",
    allowedOrigin: "https://deliver.example",
    now: NOW,
  });
  assert.equal(crossTenant.ok, false);

  const foreignUrl = parseNotificationRequest(
    notification({
      message: {
        title: "Review ready",
        body: "A version is ready.",
        action_url: "https://attacker.example/login",
      },
    }),
    {
      authenticatedTenantId: "tenant-a",
      allowedOrigin: "https://deliver.example",
      now: NOW,
    },
  );
  assert.equal(foreignUrl.ok, false);
  if (!foreignUrl.ok) assert.match(foreignUrl.error, /same-origin/);
});

test("unconfigured channels fail closed without calling an adapter", async () => {
  const parsed = parseNotificationRequest(
    notification({
      action: "send",
      confirm_live_send: true,
      idempotency_key: "notification-request-0004",
    }),
    { authenticatedTenantId: "tenant-a", now: NOW },
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  let called = false;
  const adapter: NotificationAdapter = {
    channel: "email",
    provider: "disabled",
    configured: false,
    async send() {
      called = true;
      return { status: "sent" };
    },
  };
  const receipts = await dispatchNotificationChannels({ request: parsed.value, adapters: [adapter] });
  assert.equal(called, false);
  assert.equal(receipts[0].status, "not_configured");
});

test("provider failover only advances after retryable failure", async () => {
  const parsed = parseNotificationRequest(
    notification({
      action: "send",
      confirm_live_send: true,
      idempotency_key: "notification-request-0005",
    }),
    { authenticatedTenantId: "tenant-a", now: NOW },
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const attempts: string[] = [];
  const adapters: NotificationAdapter[] = [
    {
      channel: "email",
      provider: "primary",
      configured: true,
      async send() {
        attempts.push("primary");
        return { status: "failed", retryable: true, errorCode: "timeout" };
      },
    },
    {
      channel: "email",
      provider: "secondary",
      configured: true,
      async send({ idempotencyKey }) {
        attempts.push(`secondary:${idempotencyKey}`);
        return { status: "sent", providerMessageId: "provider-message-1" };
      },
    },
  ];
  const receipts = await dispatchNotificationChannels({ request: parsed.value, adapters });
  assert.deepEqual(attempts, ["primary", "secondary:notification-request-0005"]);
  assert.equal(receipts[0].status, "sent");
  assert.deepEqual(receipts[0].attemptedProviders, ["primary", "secondary"]);
});

test("fixed-window rate limits account for the requested channel cost", () => {
  assert.equal(
    evaluateFixedWindowRateLimit({ attemptsInWindow: 18, requestedAttempts: 2, limit: 20 }).allowed,
    true,
  );
  assert.equal(
    evaluateFixedWindowRateLimit({ attemptsInWindow: 19, requestedAttempts: 2, limit: 20 }).allowed,
    false,
  );
});

test("notification fingerprints bind idempotency to normalized recipients and messages", () => {
  const first = parseNotificationRequest(
    notification({
      action: "send",
      channels: ["sms", "imessage"],
      recipient: { phone: "+12145550199", imessage_handle: "reviewer@example.com" },
      consent: {
        sms: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
        imessage: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
      },
      confirm_live_send: true,
      idempotency_key: "notification-request-0007",
    }),
    { authenticatedTenantId: "tenant-a", now: NOW },
  );
  const equivalent = parseNotificationRequest(
    notification({
      action: "send",
      channels: ["imessage", "sms"],
      recipient: { phone: "+12145550199", imessage_handle: "reviewer@example.com" },
      consent: {
        imessage: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
        sms: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
      },
      confirm_live_send: true,
      idempotency_key: "notification-request-0007",
    }),
    { authenticatedTenantId: "tenant-a", now: NOW },
  );
  const repurposed = parseNotificationRequest(
    notification({
      action: "send",
      channels: ["sms", "imessage"],
      recipient: { phone: "+12145550199", imessage_handle: "reviewer@example.com" },
      message: {
        title: "Different review",
        body: "A different version is ready.",
        action_url: "https://deliver.example/review/other-token",
      },
      consent: {
        sms: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
        imessage: { granted: true, source: "client-record", recorded_at: NOW.toISOString() },
      },
      confirm_live_send: true,
      idempotency_key: "notification-request-0007",
    }),
    { authenticatedTenantId: "tenant-a", now: NOW },
  );

  assert.equal(first.ok, true);
  assert.equal(equivalent.ok, true);
  assert.equal(repurposed.ok, true);
  if (!first.ok || !equivalent.ok || !repurposed.ok) return;
  assert.equal(
    fingerprintNotificationRequest(first.value),
    fingerprintNotificationRequest(equivalent.value),
  );
  assert.notEqual(
    fingerprintNotificationRequest(first.value),
    fingerprintNotificationRequest(repurposed.value),
  );
});

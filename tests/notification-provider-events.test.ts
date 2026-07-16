import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProviderDeliveryEvent,
  providerEventSuppressesRecipient,
  providerReceiptMatchesEvent,
  signProviderEvent,
  verifyProviderEventSignature,
} from "../lib/notifications/provider-events.ts";

test("provider event signatures are exact and timing-safe comparable", () => {
  const rawBody = JSON.stringify({ event_id: "provider-event-0001" });
  const signature = signProviderEvent(rawBody, "test-secret");
  assert.equal(verifyProviderEventSignature(rawBody, signature, "test-secret"), true);
  assert.equal(verifyProviderEventSignature(`${rawBody} `, signature, "test-secret"), false);
  assert.equal(verifyProviderEventSignature(rawBody, null, "test-secret"), false);
});

test("bounce and complaint events become durable suppression authority", () => {
  for (const type of ["bounced", "complained"] as const) {
    const parsed = parseProviderDeliveryEvent({
      event_id: `provider-event-${type}`,
      provider: "resend",
      channel: "email",
      type,
      recipient: "Reviewer@Example.com",
      provider_message_id: "message-1",
      occurred_at: "2026-07-14T18:00:00.000Z",
      reason_code: "policy",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) continue;
    assert.equal(parsed.value.recipient, "reviewer@example.com");
    assert.equal(providerEventSuppressesRecipient(parsed.value.type), true);
  }
  assert.equal(providerEventSuppressesRecipient("delivered"), false);
});

test("provider events reject malformed recipients and unsupported types", () => {
  const invalid = parseProviderDeliveryEvent({
    event_id: "provider-event-0002",
    provider: "resend",
    channel: "sms",
    type: "opened",
    recipient: "not-a-phone",
    occurred_at: "2026-07-14T18:00:00.000Z",
  });
  assert.equal(invalid.ok, false);
});

test("provider events require and match a recorded sent-provider receipt", () => {
  const missingMessage = parseProviderDeliveryEvent({
    event_id: "provider-event-0003",
    provider: "resend",
    channel: "email",
    type: "bounced",
    recipient: "reviewer@example.com",
    occurred_at: "2026-07-14T18:00:00.000Z",
  });
  assert.equal(missingMessage.ok, false);

  const parsed = parseProviderDeliveryEvent({
    event_id: "provider-event-0004",
    provider: "resend",
    channel: "email",
    type: "bounced",
    recipient: "reviewer@example.com",
    provider_message_id: "message-4",
    occurred_at: "2026-07-14T18:00:00.000Z",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(
    providerReceiptMatchesEvent(
      [
        {
          channel: "email",
          status: "sent",
          provider: "resend",
          providerMessageId: "message-4",
        },
      ],
      parsed.value,
    ),
    true,
  );
  assert.equal(
    providerReceiptMatchesEvent(
      [
        {
          channel: "email",
          status: "failed",
          provider: "resend",
          providerMessageId: "message-4",
        },
      ],
      parsed.value,
    ),
    false,
  );
});

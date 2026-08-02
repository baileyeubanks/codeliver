import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import type {
  AuthorizedNotificationRequest,
  NotificationAdapter,
} from "../lib/notifications/authority.ts";
import { fingerprintNotificationRequest } from "../lib/notifications/authority.ts";
import {
  createIMessageRelayAdapter,
  IMESSAGE_RELAY_RECEIPT_PROTOCOL,
  IMESSAGE_RELAY_REQUEST_PROTOCOL,
  IMessageRelayTransportError,
  normalizeIMessageHandle,
  signIMessageRelayBody,
  type IMessageRelayConfig,
  type IMessageRelayRequestEnvelope,
  type IMessageRelayTransport,
  type IMessageRelayTransportRequest,
  type IMessageRelayTransportResponse,
} from "../lib/notifications/imessage-relay.ts";

const NOW = new Date("2026-07-14T18:00:00.000Z");
const ENDPOINT = "https://m2-relay.test/v1/imessage";
const REQUEST_SECRET = `request-${"a".repeat(40)}`;
const RECEIPT_SECRET = `receipt-${"b".repeat(40)}`;

function relayConfig(overrides: Partial<IMessageRelayConfig> = {}): IMessageRelayConfig {
  return {
    enabled: true,
    endpoint: ENDPOINT,
    relayId: "m2-messages-primary",
    allowedOrigins: ["https://m2-relay.test"],
    allowedHosts: ["m2-relay.test"],
    requestKeyId: "request-key-v1",
    requestSigningSecret: REQUEST_SECRET,
    receiptKeyId: "receipt-key-v1",
    receiptVerificationSecret: RECEIPT_SECRET,
    timeoutMs: 100,
    maxReceiptAgeMs: 60_000,
    ...overrides,
  };
}

function notification(
  overrides: Partial<AuthorizedNotificationRequest> = {},
): AuthorizedNotificationRequest {
  return {
    action: "send",
    tenantId: "tenant-a",
    eventType: "share_link_ready",
    purpose: "transactional",
    channels: ["imessage"],
    recipient: {
      userId: null,
      name: "Reviewer",
      email: "reviewer@example.com",
      phone: null,
      imessageHandle: "reviewer@example.com",
    },
    message: {
      title: "Review ready",
      body: "A version is ready.",
      actionUrl: "https://deliver.example/review/token",
    },
    consent: {
      imessage: {
        granted: true,
        source: "client-record",
        recordedAt: NOW.toISOString(),
      },
    },
    idempotencyKey: "notification-request-1001",
    confirmedLiveSend: true,
    ...overrides,
  };
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function acceptedResponse(
  transportRequest: IMessageRelayTransportRequest,
  receiptOverrides: Record<string, unknown> = {},
  options: {
    signatureSecret?: string;
    status?: number;
    url?: string;
    headerOverrides?: Record<string, string>;
  } = {},
): IMessageRelayTransportResponse {
  const request = JSON.parse(transportRequest.body) as IMessageRelayRequestEnvelope;
  const receipt = {
    protocol: IMESSAGE_RELAY_RECEIPT_PROTOCOL,
    relay_id: request.relay_id,
    receipt_id: `receipt-${request.request_nonce}`,
    request_id: request.request_id,
    request_nonce: request.request_nonce,
    request_sha256: sha256(transportRequest.body),
    idempotency_key: request.idempotency_key,
    recipient: request.recipient,
    status: "accepted",
    provider_message_id: "m2-message-00000001",
    occurred_at: NOW.toISOString(),
    error_code: null,
    ...receiptOverrides,
  };
  const body = JSON.stringify(receipt);
  return {
    status: options.status ?? 202,
    url: options.url ?? transportRequest.url,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-codeliver-relay-receipt-key-id": "receipt-key-v1",
      "x-codeliver-relay-receipt-signature": signIMessageRelayBody(
        body,
        options.signatureSecret ?? RECEIPT_SECRET,
      ),
      ...options.headerOverrides,
    },
    body,
  };
}

function adapter(
  transport: IMessageRelayTransport | undefined,
  options: {
    config?: IMessageRelayConfig;
    createNonce?: () => string;
  } = {},
): NotificationAdapter {
  return createIMessageRelayAdapter({
    config: options.config ?? relayConfig(),
    transport,
    fingerprintRequest: fingerprintNotificationRequest,
    now: () => new Date(NOW),
    createNonce: options.createNonce ?? (() => "A".repeat(32)),
  });
}

function send(
  relayAdapter: NotificationAdapter,
  request = notification(),
  input: { address?: string; idempotencyKey?: string } = {},
) {
  return relayAdapter.send({
    request,
    address: input.address ?? "reviewer@example.com",
    idempotencyKey: input.idempotencyKey ?? "notification-request-1001",
  });
}

test("iMessage handle normalization accepts only email or E.164 destinations", () => {
  assert.equal(normalizeIMessageHandle(" Reviewer@Example.com "), "reviewer@example.com");
  assert.equal(normalizeIMessageHandle("+1 (214) 555-0199"), "+12145550199");
  assert.equal(normalizeIMessageHandle("214-555-0199"), null);
  assert.equal(normalizeIMessageHandle("not-an-imessage-handle"), null);
});

test("default-off, missing-prerequisite, and preview adapters cannot invoke transport", async () => {
  let calls = 0;
  const transport: IMessageRelayTransport = {
    async send(request) {
      calls += 1;
      return acceptedResponse(request);
    },
  };

  const disabled = adapter(transport, { config: relayConfig({ enabled: false }) });
  assert.equal(disabled.configured, false);
  assert.deepEqual(await send(disabled), {
    status: "failed",
    retryable: false,
    errorCode: "provider_not_configured",
  });

  const missingSecret = adapter(transport, {
    config: relayConfig({ receiptVerificationSecret: null }),
  });
  assert.equal(missingSecret.configured, false);
  assert.deepEqual(await send(missingSecret), {
    status: "failed",
    retryable: false,
    errorCode: "provider_not_configured",
  });

  const missingTransport = adapter(undefined);
  assert.equal(missingTransport.configured, false);
  assert.deepEqual(await send(missingTransport), {
    status: "failed",
    retryable: false,
    errorCode: "provider_not_configured",
  });

  const unallowlistedHost = adapter(transport, {
    config: relayConfig({ allowedHosts: ["other-relay.test"] }),
  });
  assert.equal(unallowlistedHost.configured, false);
  assert.deepEqual(await send(unallowlistedHost), {
    status: "failed",
    retryable: false,
    errorCode: "provider_not_configured",
  });

  const active = adapter(transport);
  const preview = notification({
    action: "preview",
    confirmedLiveSend: false,
    idempotencyKey: null,
    consent: {},
  });
  assert.deepEqual(await send(active, preview), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_send_not_authorized",
  });
  assert.equal(calls, 0);
});

test("an allowlisted fake transport can return a fully bound signed receipt", async () => {
  let calls = 0;
  const transport: IMessageRelayTransport = {
    async send(request) {
      calls += 1;
      assert.equal(request.url, ENDPOINT);
      assert.equal(request.method, "POST");
      assert.equal(request.redirect, "error");
      assert.equal(request.headers["x-codeliver-relay-protocol"], IMESSAGE_RELAY_REQUEST_PROTOCOL);
      assert.equal(
        request.headers["x-codeliver-relay-signature"],
        signIMessageRelayBody(request.body, REQUEST_SECRET),
      );
      const body = JSON.parse(request.body) as IMessageRelayRequestEnvelope;
      assert.equal(body.recipient, "reviewer@example.com");
      assert.equal(body.idempotency_key, "notification-request-1001");
      assert.equal(body.consent.granted, true);
      return acceptedResponse(request);
    },
  };

  const result = await send(adapter(transport), notification(), {
    address: "Reviewer@Example.com",
  });
  assert.deepEqual(result, {
    status: "sent",
    providerMessageId: "m2-message-00000001",
    retryable: false,
  });
  assert.equal(calls, 1);
});

test("missing consent, request idempotency mismatch, and recipient mismatch fail before transport", async () => {
  let calls = 0;
  const transport: IMessageRelayTransport = {
    async send(request) {
      calls += 1;
      return acceptedResponse(request);
    },
  };
  const relayAdapter = adapter(transport);

  assert.equal(
    (await send(relayAdapter, notification({ consent: {} }))).errorCode,
    "imessage_consent_missing",
  );
  assert.equal(
    (await send(relayAdapter, notification(), { idempotencyKey: "notification-request-9999" }))
      .errorCode,
    "imessage_idempotency_mismatch",
  );
  assert.equal(
    (await send(relayAdapter, notification(), { address: "+12145550199" })).errorCode,
    "imessage_recipient_mismatch",
  );
  assert.equal(calls, 0);
});

test("forged and request-mismatched relay receipts never claim a send", async () => {
  const forged = adapter({
    async send(request) {
      return acceptedResponse(request, {}, { signatureSecret: `forged-${"x".repeat(40)}` });
    },
  });
  assert.deepEqual(await send(forged), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_receipt_untrusted",
  });

  const mismatched = adapter({
    async send(request) {
      return acceptedResponse(request, { request_id: "different-request-0001" });
    },
  });
  assert.deepEqual(await send(mismatched), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_receipt_mismatch",
  });

  const redirected = adapter({
    async send(request) {
      return acceptedResponse(request, {}, { url: "https://other-relay.test/v1/imessage" });
    },
  });
  assert.deepEqual(await send(redirected), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_receipt_untrusted",
  });
});

test("a signed receipt for another recipient fails closed", async () => {
  const relayAdapter = adapter({
    async send(request) {
      return acceptedResponse(request, { recipient: "+12145550199" });
    },
  });

  assert.deepEqual(await send(relayAdapter), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_recipient_mismatch",
  });
});

test("timeouts are bounded and treated as delivery-indeterminate", async () => {
  let calls = 0;
  const relayAdapter = adapter(
    {
      async send() {
        calls += 1;
        return new Promise<IMessageRelayTransportResponse>(() => undefined);
      },
    },
    { config: relayConfig({ timeoutMs: 25 }) },
  );

  const started = Date.now();
  assert.deepEqual(await send(relayAdapter), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_timeout",
  });
  assert.equal(calls, 1);
  assert.ok(Date.now() - started < 500);
});

test("a previously signed receipt cannot be replayed for a new nonce", async () => {
  let captured: IMessageRelayTransportResponse | null = null;
  let calls = 0;
  const nonces = ["A".repeat(32), "B".repeat(32)];
  const relayAdapter = adapter(
    {
      async send(request) {
        calls += 1;
        if (!captured) captured = acceptedResponse(request);
        return captured;
      },
    },
    { createNonce: () => nonces.shift() ?? "C".repeat(32) },
  );

  assert.equal((await send(relayAdapter)).status, "sent");
  assert.deepEqual(await send(relayAdapter), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_receipt_replayed",
  });
  assert.equal(calls, 2);
});

test("only confirmed not-sent or signed transient failures are retryable", async () => {
  const notSent = adapter({
    async send() {
      throw new IMessageRelayTransportError("not_sent");
    },
  });
  assert.deepEqual(await send(notSent), {
    status: "failed",
    retryable: true,
    errorCode: "imessage_relay_transport_unavailable",
  });

  const unknown = adapter({
    async send() {
      throw new Error(`transport leaked ${REQUEST_SECRET} reviewer@example.com`);
    },
  });
  const unknownResult = await send(unknown);
  assert.deepEqual(unknownResult, {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_delivery_indeterminate",
  });
  assert.equal(JSON.stringify(unknownResult).includes(REQUEST_SECRET), false);
  assert.equal(JSON.stringify(unknownResult).includes("reviewer@example.com"), false);

  const malformed = adapter({
    async send() {
      return undefined as unknown as IMessageRelayTransportResponse;
    },
  });
  assert.deepEqual(await send(malformed), {
    status: "failed",
    retryable: false,
    errorCode: "imessage_relay_receipt_invalid",
  });

  const signedBusy = adapter({
    async send(request) {
      return acceptedResponse(
        request,
        {
          status: "rejected",
          provider_message_id: null,
          error_code: "relay_busy",
        },
        { status: 503 },
      );
    },
  });
  assert.deepEqual(await send(signedBusy), {
    status: "failed",
    retryable: true,
    errorCode: "imessage_relay_busy",
  });
});

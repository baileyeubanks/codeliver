import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertSafeWebhookUrl,
  deliverSignedWebhook,
  isRetryableWebhookResponse,
  isPublicWebhookAddress,
  normalizeWebhookEvents,
  signWebhookPayload,
} from "../lib/security/webhook-delivery.ts";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  persistedWebhookSecretFields,
  recoverWebhookSecret,
  withoutPersistedWebhookSecrets,
} from "../lib/security/webhook-secret.ts";

const KEY = Buffer.alloc(32, 11).toString("base64url");
const SECRET = "whsec_test_0123456789";
const webhookRoute = readFileSync(
  new URL("../app/api/webhooks/route.ts", import.meta.url),
  "utf8",
);
const approvalDecisions = readFileSync(
  new URL("../lib/approval-decisions.ts", import.meta.url),
  "utf8",
);

test("webhook secrets are encrypted for isolated persistence and recoverable for signing", () => {
  const first = encryptWebhookSecret(SECRET, KEY);
  const second = encryptWebhookSecret(SECRET, KEY);
  assert.notEqual(first, second);
  assert.equal(first.includes(SECRET), false);
  assert.equal(decryptWebhookSecret(first, KEY), SECRET);
  assert.deepEqual(persistedWebhookSecretFields(SECRET, "public", KEY), {
    secret: SECRET,
  });
  const isolated = persistedWebhookSecretFields(SECRET, "co_production", KEY);
  assert.deepEqual(Object.keys(isolated), ["secret_ciphertext"]);
  assert.equal(recoverWebhookSecret(isolated, KEY), SECRET);
  assert.deepEqual(
    withoutPersistedWebhookSecrets({ id: "hook-1", ...isolated }),
    { id: "hook-1" },
  );
});

test("webhook secret envelopes reject tampering and incorrect keys", () => {
  const encrypted = encryptWebhookSecret(SECRET, KEY);
  const segments = encrypted.split(".");
  segments[2] = `${segments[2].startsWith("A") ? "B" : "A"}${segments[2].slice(1)}`;
  assert.throws(() => decryptWebhookSecret(segments.join("."), KEY));
  assert.throws(() =>
    decryptWebhookSecret(encrypted, Buffer.alloc(32, 12).toString("base64url")),
  );
});

test("event subscriptions accept only the supported bounded vocabulary", () => {
  assert.deepEqual(normalizeWebhookEvents(undefined), { ok: true, events: [] });
  assert.deepEqual(
    normalizeWebhookEvents(["asset.approved", "asset.approved", "review.completed"]),
    { ok: true, events: ["asset.approved", "review.completed"] },
  );
  assert.equal(normalizeWebhookEvents(["database.dump"]).ok, false);
  assert.equal(normalizeWebhookEvents("asset.approved").ok, false);
});

test("webhook egress rejects local, private, reserved, and mixed-resolution targets", async () => {
  for (const address of [
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.51.100.4",
    "203.0.113.8",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ]) {
    assert.equal(isPublicWebhookAddress(address), false, address);
  }
  assert.equal(isPublicWebhookAddress("1.1.1.1"), true);
  assert.equal(isPublicWebhookAddress("2606:4700:4700::1111"), true);

  const publicLookup = async () => [{ address: "1.1.1.1", family: 4 }];
  assert.equal(
    await assertSafeWebhookUrl("https://hooks.example.com/v1", publicLookup),
    "https://hooks.example.com/v1",
  );
  await assert.rejects(() =>
    assertSafeWebhookUrl("http://hooks.example.com/v1", publicLookup),
  );
  await assert.rejects(() =>
    assertSafeWebhookUrl("https://localhost/v1", publicLookup),
  );
  await assert.rejects(() =>
    assertSafeWebhookUrl("https://user:pass@hooks.example.com/v1", publicLookup),
  );
  await assert.rejects(() =>
    assertSafeWebhookUrl("https://hooks.example.com:8443/v1", publicLookup),
  );
  await assert.rejects(() =>
    assertSafeWebhookUrl("https://hooks.example.com/v1", async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  );
});

test("deliveries use timestamped HMAC signatures and refuse redirects", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ input: String(input), init });
    return new Response(null, { status: 204 });
  };
  const result = await deliverSignedWebhook({
    url: "https://hooks.example.com/events",
    secret: SECRET,
    event: "asset.approved",
    deliveryId: "delivery:asset-approved:0001",
    attempt: 2,
    payload: { asset_id: "asset-1" },
    fetchImpl,
    addressLookup: async () => [{ address: "1.1.1.1", family: 4 }],
    now: () => 1_720_000_000_000,
  });
  assert.equal(result.success, true);
  assert.equal(result.responseCode, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.redirect, "error");

  const headers = new Headers(calls[0].init?.headers);
  const timestamp = "1720000000";
  const body = JSON.stringify({ asset_id: "asset-1" });
  const expected = `v2=${createHmac("sha256", SECRET)
    .update(`${timestamp}.delivery:asset-approved:0001.2.${body}`, "utf8")
    .digest("hex")}`;
  assert.equal(headers.get("X-Co-Production-Timestamp"), timestamp);
  assert.equal(
    headers.get("X-Co-Production-Delivery-Id"),
    "delivery:asset-approved:0001",
  );
  assert.equal(headers.get("X-Co-Production-Delivery-Attempt"), "2");
  assert.equal(headers.get("X-Co-Production-Signature-Version"), "v2");
  assert.equal(headers.get("X-Co-Production-Signature"), expected);
  assert.equal(headers.get("X-CoDeliver-Signature"), expected);
  assert.equal(String(calls[0].init?.body), body);
  assert.equal(JSON.stringify(calls[0]).includes(SECRET), false);
  assert.equal(
    signWebhookPayload({
      secret: SECRET,
      timestamp,
      deliveryId: "delivery:asset-approved:0001",
      attempt: 2,
      body,
    }),
    expected,
  );
  assert.equal(isRetryableWebhookResponse(429), true);
  assert.equal(isRetryableWebhookResponse(503), true);
  assert.equal(isRetryableWebhookResponse(422), false);
});

test("webhook API and approval emissions use encrypted storage and the guarded transport", () => {
  assert.match(
    webhookRoute,
    /\.\.\.persistedWebhookSecretFields\(secret, dataSchema\)/,
  );
  assert.match(webhookRoute, /serializeWebhook\(/);
  assert.match(webhookRoute, /withoutPersistedWebhookSecrets\(/);
  assert.match(webhookRoute, /assertSafeWebhookUrl\(/);
  assert.match(webhookRoute, /deliverSignedWebhook\(/);
  assert.match(webhookRoute, /enqueueWebhookOutboxDelivery\(/);
  assert.match(webhookRoute, /Idempotency-Key is required/);
  assert.match(webhookRoute, /readJsonObject\(request\)/);
  assert.match(webhookRoute, /contentLength > 65_536/);
  assert.ok(
    webhookRoute.indexOf(
      'const check = await requireTeamRole(team_id, user.id, "admin")',
    ) < webhookRoute.indexOf("safeUrl = await assertSafeWebhookUrl(url)"),
    "creation authorization must happen before the outbound DNS safety probe",
  );
  assert.match(approvalDecisions, /recoverWebhookSecret\(/);
  assert.match(approvalDecisions, /deliverSignedWebhook\(/);
  assert.doesNotMatch(
    approvalDecisions,
    /["']X-CoDeliver-Signature["']:\s*webhook\.secret/,
  );
  assert.doesNotMatch(webhookRoute, /return NextResponse\.json\(data/);
});

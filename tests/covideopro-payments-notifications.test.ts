import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildMilestonesForApproval,
  createMockCheckoutProvider,
  createStripeCheckoutProvider,
  formatCents,
  mockCheckoutUrl,
  PaymentsNotConfiguredError,
} from "../lib/covideopro/payments.ts";
import { transitionPaymentMilestone } from "../lib/covideopro/transitions.ts";
import {
  buildReviewLinkDrafts,
  dedupeOutboxDrafts,
  dispatchOutboxDraft,
  normalizeE164,
  notificationIdempotencyKey,
} from "../lib/covideopro/notifications.ts";
import type { EstimateLine } from "../lib/covideopro/record.ts";

/* ------------------------------ Payments ----------------------------------- */

const lines: EstimateLine[] = [
  { id: "l1", category: "crew", description: "DP", quantity: 2, unit_rate: 1000, markup_pct: 0, optional: false },
  { id: "l2", category: "post", description: "Edit", quantity: 1, unit_rate: 500, markup_pct: 0, optional: true },
];

test("milestones split the required estimate into 30% deposit + balance", () => {
  const milestones = buildMilestonesForApproval({ title: "Film", estimate_lines: lines });
  assert.equal(milestones.length, 2);
  assert.equal(milestones[0].kind, "deposit");
  assert.equal(milestones[0].amount_cents, 60000, "30% of $2,000 (optional line excluded)");
  assert.equal(milestones[1].amount_cents, 140000);
  assert.equal(milestones[0].amount_cents + milestones[1].amount_cents, 200000);
  assert.equal(buildMilestonesForApproval({ title: "Empty", estimate_lines: [] }).length, 0);
});

test("milestone transitions: checkout flow vs manual offline payment", () => {
  const pending = { status: "pending" as const };
  assert.equal(transitionPaymentMilestone(pending, "checkout_created").ok, false, "checkout method required");
  assert.deepEqual(transitionPaymentMilestone(pending, "checkout_created", { method: "checkout" }), { ok: true });
  assert.deepEqual(transitionPaymentMilestone(pending, "paid", { method: "manual" }), { ok: true });
  assert.equal(transitionPaymentMilestone(pending, "paid", { method: "checkout" }).ok, false, "no checkout yet");
  assert.deepEqual(transitionPaymentMilestone({ status: "checkout_created" }, "paid", { method: "checkout" }), { ok: true });
  assert.equal(transitionPaymentMilestone({ status: "paid" }, "void").ok, false);
});

test("mock checkout is deterministic and offline; stripe refuses without rk_ key", async () => {
  assert.equal(
    mockCheckoutUrl("pm-deposit-abc123", 60000, "USD"),
    "https://checkout.mock.covideopro.local/mock_cs_pmdepositabc123?amount=60000&currency=USD",
  );
  const mock = createMockCheckoutProvider();
  const session = await mock.createSession({
    milestoneId: "pm-x", label: "Deposit", amountCents: 100, currency: "USD",
    customerEmail: null, successUrl: "https://app.test/ok", cancelUrl: "https://app.test/no",
  });
  assert.equal(session.provider, "mock");
  assert.match(session.url, /^https:\/\/checkout\.mock\.covideopro\.local\//);

  const stripe = createStripeCheckoutProvider({});
  await assert.rejects(
    () => stripe.createSession({ milestoneId: "pm-x", label: "Deposit", amountCents: 100, currency: "USD", customerEmail: null, successUrl: "https://app.test/ok", cancelUrl: "https://app.test/no" }),
    PaymentsNotConfiguredError,
    "no live call without a restricted key",
  );
  const stripeBadKey = createStripeCheckoutProvider({ STRIPE_RESTRICTED_KEY: "sk_live_should_not_be_used" });
  await assert.rejects(
    () => stripeBadKey.createSession({ milestoneId: "pm-x", label: "Deposit", amountCents: 100, currency: "USD", customerEmail: null, successUrl: "https://app.test/ok", cancelUrl: "https://app.test/no" }),
    PaymentsNotConfiguredError,
    "secret keys are refused; restricted rk_ keys only",
  );
});

test("money formatting is cents-exact", () => {
  assert.equal(formatCents(307650), "$3,076.50");
  assert.equal(formatCents(99), "$0.99");
});

/* ---------------------------- Notifications --------------------------------- */

test("client-reachable notification helpers do not import Node-only modules", () => {
  const notificationsSource = readFileSync(
    new URL("../lib/covideopro/notifications.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    notificationsSource,
    /(?:from\s+|import\s*\()\s*["']node:/,
    "Node-only imports break the browser bundle and leave the login surface unhydrated",
  );
});

test("E.164 normalization accepts plausible numbers and rejects the rest", () => {
  assert.equal(normalizeE164("(555) 123-4567"), "+15551234567");
  assert.equal(normalizeE164("5551234567"), "+15551234567");
  assert.equal(normalizeE164("1-555-123-4567"), "+15551234567");
  assert.equal(normalizeE164("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizeE164("123"), null);
  assert.equal(normalizeE164("+1234567890123456789"), null);
  assert.equal(normalizeE164("not a phone"), null);
});

test("review-link drafts are per-channel with stable idempotency and dedupe", () => {
  const input = {
    projectId: "ica",
    linkId: "share-1",
    message: "Review: Charles Drummond_v5",
    reviewerEmail: "review@ica.example",
    reviewerPhone: "+15551234567",
    channels: ["email", "sms", "email"] as const,
    publicUrl: "/review/demo?share=x",
  };
  const drafts = buildReviewLinkDrafts(input);
  assert.equal(drafts.length, 3, "one draft per supplied channel entry (caller dedupes channels)");
  assert.equal(drafts[0].recipient, "review@ica.example");
  assert.equal(drafts[1].recipient, "+15551234567");
  assert.notEqual(drafts[0].recipient, drafts[1].recipient, "client channels stay distinct");

  const keyA = notificationIdempotencyKey(drafts[0]);
  const keyB = notificationIdempotencyKey({ ...drafts[0] });
  assert.equal(
    keyA,
    "10f349e645550a8c7d018f8c5e80c83a",
    "browser-safe hashing must preserve the existing SHA-256 idempotency contract",
  );
  assert.equal(keyA, keyB, "same intent ⇒ same key");
  assert.equal(notificationIdempotencyKey(drafts[2]), keyA, "duplicate channel ⇒ same key");
  const remaining = dedupeOutboxDrafts(drafts, [{ idempotency_key: keyA }]);
  assert.deepEqual(remaining.map((draft) => draft.channel), ["sms"]);
});

test("browser-safe idempotency hashing preserves SHA-256 for Unicode and multi-block messages", () => {
  assert.equal(
    notificationIdempotencyKey({
      projectId: "ica",
      intent: "review_link",
      channel: "sms",
      recipient: "+15551234567",
      subject: "Cut review — versión 3 🎬",
      body: `Frame notes: ${"🎬 café ".repeat(32)}`,
    }),
    "e37826049bf0d46a35a7fa7f8b3dce06",
  );
  assert.equal(
    notificationIdempotencyKey({
      projectId: "ica",
      intent: "x",
      channel: "email",
      recipient: "A@EXAMPLE.COM",
      subject: "",
      body: "a".repeat(130),
    }),
    "7063c9a57ce6b25423bdf4008d807bf5",
  );
});

test("dry-run dispatch: never live, unconfigured providers go pending", () => {
  const context = { emailConfigured: true, smsConfigured: false, imessageConfigured: false };
  assert.deepEqual(
    dispatchOutboxDraft({ channel: "email", recipient: "review@ica.example" }, context),
    { status: "dry_run_sent", provider: "dry-run", error: null },
  );
  assert.deepEqual(
    dispatchOutboxDraft({ channel: "sms", recipient: "+15551234567" }, context),
    { status: "pending_provider", provider: null, error: "provider_not_configured" },
  );
  assert.deepEqual(
    dispatchOutboxDraft({ channel: "sms", recipient: "not-a-phone" }, context),
    { status: "failed", provider: null, error: "invalid_e164_recipient" },
  );
  const nothingConfigured = dispatchOutboxDraft(
    { channel: "email", recipient: "review@ica.example" },
    { emailConfigured: false, smsConfigured: false, imessageConfigured: false },
  );
  assert.equal(nothingConfigured.status, "pending_provider", "missing credentials degrade, never claim delivery");
});

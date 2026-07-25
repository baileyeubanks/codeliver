import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildMilestonesForApproval,
  createStripeCheckoutProvider as createClientStripeCheckoutProvider,
  PaymentsNotConfiguredError,
} from "../lib/covideopro/payments.ts";

const paymentsPath = new URL("../lib/covideopro/payments.ts", import.meta.url);
const serverPaymentsPath = new URL("../lib/covideopro/payments.server.ts", import.meta.url);
const checkoutRoutePath = new URL("../app/api/billing/checkout/route.ts", import.meta.url);
const proxyPath = new URL("../proxy.ts", import.meta.url);

test("client payment module contains only calculation and offline checkout behavior", async () => {
  const source = await readFile(paymentsPath, "utf8");

  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /STRIPE_RESTRICTED_KEY/);
  assert.doesNotMatch(source, /api\.stripe\.com/);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer/);

  const milestones = buildMilestonesForApproval({
    title: "Security test",
    estimate_lines: [{
      id: "line-1",
      category: "crew",
      description: "Camera",
      quantity: 1,
      unit_rate: 1000,
      markup_pct: 0,
      optional: false,
    }],
  });
  assert.deepEqual(milestones.map((milestone) => milestone.amount_cents), [30000, 70000]);

  const clientProvider = createClientStripeCheckoutProvider({
    STRIPE_RESTRICTED_KEY: "rk_test_client_input_is_not_used",
  });
  await assert.rejects(
    () => clientProvider.createSession({
      milestoneId: "pm-security",
      label: "Deposit",
      amountCents: 100,
      currency: "USD",
      customerEmail: null,
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    }),
    PaymentsNotConfiguredError,
  );
});

test("Stripe secret handling and checkout network call are isolated to the Node-only module", async () => {
  const source = await readFile(serverPaymentsPath, "utf8");

  assert.match(source, /from "node:process"/);
  assert.match(source, /STRIPE_RESTRICTED_KEY/);
  assert.match(source, /https:\/\/api\.stripe\.com\/v1\/checkout\/sessions/);
  assert.doesNotMatch(source, /payment_method_types/);

  const { createStripeCheckoutProvider } = await import("../lib/covideopro/payments.server.ts");
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ id: "cs_security", url: "https://checkout.stripe.test/cs_security" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const session = await createStripeCheckoutProvider({
      STRIPE_RESTRICTED_KEY: "rk_test_server_only_boundary",
    }).createSession({
      milestoneId: "pm-security",
      label: "Deposit",
      amountCents: 100,
      currency: "USD",
      customerEmail: "billing@example.test",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
    });

    assert.deepEqual(session, {
      sessionId: "cs_security",
      url: "https://checkout.stripe.test/cs_security",
      provider: "stripe",
    });
    assert.equal(request?.url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(request?.headers.get("authorization"), "Bearer rk_test_server_only_boundary");
    assert.equal(request?.headers.get("stripe-version"), "2026-05-27.dahlia");
    assert.equal(request?.headers.get("idempotency-key"), "cco-checkout-pm-security");
    assert.equal((await request?.text())?.includes("payment_method_types"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the production checkout route is server-authoritative and launch-gated to the admin surface", async () => {
  const [routeSource, proxySource] = await Promise.all([
    readFile(checkoutRoutePath, "utf8"),
    readFile(proxyPath, "utf8"),
  ]);

  assert.match(routeSource, /handleBillingCheckout/);
  assert.match(routeSource, /requireAuth/);
  assert.match(routeSource, /payment_milestones/);
  assert.match(routeSource, /requireProjectAdmin/);
  assert.match(routeSource, /reserve_checkout_rate_limit/);
  assert.match(routeSource, /createStripeCheckoutProvider/);
  assert.doesNotMatch(routeSource, /body\.(?:amount|currency|success|cancel)/);
  assert.match(proxySource, /\^\\\/api\\\/billing\\\/checkout\$/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  handleBillingCheckout,
  type BillingCheckoutDependencies,
  type BillingCheckoutMilestone,
} from "../lib/covideopro/checkout.server.ts";
import {
  PaymentsNotConfiguredError,
  type CheckoutSessionRequest,
} from "../lib/covideopro/payments.ts";

const MILESTONE_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

const pendingMilestone: BillingCheckoutMilestone = {
  id: MILESTONE_ID,
  project_id: PROJECT_ID,
  label: "Deposit — Acme launch film",
  amount_cents: 125_000,
  currency: "USD",
  status: "pending",
  checkout_url: null,
  checkout_provider: null,
};

function request(body: string) {
  return new Request("https://admin.contentco-op.com/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function dependencies(
  overrides: Partial<BillingCheckoutDependencies> = {},
): BillingCheckoutDependencies {
  return {
    authenticate: async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      email: "producer@example.test",
    }),
    loadMilestone: async () => pendingMilestone,
    authorizeProject: async () => true,
    reserveRateLimit: async () => ({
      allowed: true,
      retryAfterSeconds: 60,
    }),
    createSession: async () => ({
      sessionId: "cs_authoritative",
      url: "https://checkout.stripe.test/c/pay/cs_authoritative",
      provider: "stripe",
    }),
    saveSession: async () => true,
    getSiteUrl: () => "https://admin.contentco-op.com",
    ...overrides,
  };
}

test("checkout authenticates before parsing any request body", async () => {
  let milestoneReads = 0;
  let providerCalls = 0;
  const response = await handleBillingCheckout(
    request("{"),
    dependencies({
      authenticate: async () => null,
      loadMilestone: async () => {
        milestoneReads += 1;
        return pendingMilestone;
      },
      createSession: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      },
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authentication required",
    code: "AUTH_REQUIRED",
  });
  assert.equal(milestoneReads, 0);
  assert.equal(providerCalls, 0);
});

test("checkout reports unavailable authentication without leaking provider detail", async () => {
  const response = await handleBillingCheckout(
    request(JSON.stringify({ milestone_id: MILESTONE_ID })),
    dependencies({
      authenticate: async () => {
        throw new Error("private auth endpoint and credentials");
      },
    }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Authentication service is unavailable",
    code: "AUTH_UNAVAILABLE",
  });
});

test("checkout accepts only a milestone id and rejects client-controlled money or redirects", async () => {
  for (const body of [
    "{",
    JSON.stringify({
      milestone_id: MILESTONE_ID,
      amount_cents: 1,
    }),
    JSON.stringify({
      milestone_id: MILESTONE_ID,
      success_url: "https://attacker.test/paid",
    }),
  ]) {
    let providerCalls = 0;
    const response = await handleBillingCheckout(
      request(body),
      dependencies({
        createSession: async () => {
          providerCalls += 1;
          throw new Error("provider must not run");
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(providerCalls, 0);
  }
});

test("checkout sends only database-authoritative values and canonical return URLs to Stripe", async () => {
  let providerRequest: CheckoutSessionRequest | null = null;
  let saved:
    | {
        milestoneId: string;
        projectId: string;
        provider: string;
        url: string;
      }
    | undefined;

  const response = await handleBillingCheckout(
    request(JSON.stringify({ milestone_id: MILESTONE_ID })),
    dependencies({
      createSession: async (input) => {
        providerRequest = input;
        return {
          sessionId: "cs_authoritative",
          url: "https://checkout.stripe.test/c/pay/cs_authoritative",
          provider: "stripe",
        };
      },
      saveSession: async (input) => {
        saved = input;
        return true;
      },
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(providerRequest, {
    milestoneId: MILESTONE_ID,
    label: pendingMilestone.label,
    amountCents: pendingMilestone.amount_cents,
    currency: pendingMilestone.currency,
    customerEmail: "producer@example.test",
    successUrl:
      `https://admin.contentco-op.com/projects/${PROJECT_ID}?checkout=success&milestone_id=${MILESTONE_ID}`,
    cancelUrl:
      `https://admin.contentco-op.com/projects/${PROJECT_ID}?checkout=cancelled&milestone_id=${MILESTONE_ID}`,
  });
  assert.deepEqual(saved, {
    milestoneId: MILESTONE_ID,
    projectId: PROJECT_ID,
    provider: "stripe",
    url: "https://checkout.stripe.test/c/pay/cs_authoritative",
  });
  assert.deepEqual(await response.json(), {
    checkout: {
      milestone_id: MILESTONE_ID,
      provider: "stripe",
      url: "https://checkout.stripe.test/c/pay/cs_authoritative",
      reused: false,
    },
  });
});

test("checkout denies insufficient project authority before rate or provider work", async () => {
  let rateCalls = 0;
  let providerCalls = 0;
  const response = await handleBillingCheckout(
    request(JSON.stringify({ milestone_id: MILESTONE_ID })),
    dependencies({
      authorizeProject: async () => false,
      reserveRateLimit: async () => {
        rateCalls += 1;
        return { allowed: true, retryAfterSeconds: 60 };
      },
      createSession: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      },
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Project administrator access required",
    code: "PROJECT_ADMIN_REQUIRED",
  });
  assert.equal(rateCalls, 0);
  assert.equal(providerCalls, 0);
});

test("checkout rate limiting fails closed before provider work", async () => {
  let providerCalls = 0;
  const response = await handleBillingCheckout(
    request(JSON.stringify({ milestone_id: MILESTONE_ID })),
    dependencies({
      reserveRateLimit: async () => ({
        allowed: false,
        retryAfterSeconds: 42,
      }),
      createSession: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      },
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.deepEqual(await response.json(), {
    error: "Checkout creation rate exceeded",
    code: "CHECKOUT_RATE_LIMITED",
  });
  assert.equal(providerCalls, 0);
});

test("completed checkout creation reuses the persisted URL without another provider call", async () => {
  let rateCalls = 0;
  let providerCalls = 0;
  const response = await handleBillingCheckout(
    request(JSON.stringify({ milestone_id: MILESTONE_ID })),
    dependencies({
      loadMilestone: async () => ({
        ...pendingMilestone,
        status: "checkout_created",
        checkout_provider: "stripe",
        checkout_url: "https://checkout.stripe.test/c/pay/cs_existing",
      }),
      reserveRateLimit: async () => {
        rateCalls += 1;
        return { allowed: true, retryAfterSeconds: 60 };
      },
      createSession: async () => {
        providerCalls += 1;
        throw new Error("provider must not run");
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    checkout: {
      milestone_id: MILESTONE_ID,
      provider: "stripe",
      url: "https://checkout.stripe.test/c/pay/cs_existing",
      reused: true,
    },
  });
  assert.equal(rateCalls, 0);
  assert.equal(providerCalls, 0);
});

test("missing Stripe authority returns a stable unavailable response", async () => {
  const response = await handleBillingCheckout(
    request(JSON.stringify({ milestone_id: MILESTONE_ID })),
    dependencies({
      createSession: async () => {
        throw new PaymentsNotConfiguredError("Stripe");
      },
    }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Checkout is not configured",
    code: "PAYMENTS_NOT_CONFIGURED",
  });
});

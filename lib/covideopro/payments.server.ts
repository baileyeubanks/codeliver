import { env } from "node:process";

import {
  type CheckoutProvider,
  type CheckoutSessionRequest,
  type CheckoutSessionResult,
  PaymentsNotConfiguredError,
} from "./payments.ts";

export interface StripeCheckoutEnv {
  STRIPE_RESTRICTED_KEY?: string;
}

/**
 * Node-only Stripe Checkout Sessions provider. `node:process` keeps this
 * module out of client bundles; it must only be imported by server code.
 */
export function createStripeCheckoutProvider(
  stripeEnv: StripeCheckoutEnv = { STRIPE_RESTRICTED_KEY: env.STRIPE_RESTRICTED_KEY },
): CheckoutProvider {
  return {
    name: "stripe",
    async createSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult> {
      const key = stripeEnv.STRIPE_RESTRICTED_KEY;
      if (!key || !key.startsWith("rk_")) {
        throw new PaymentsNotConfiguredError("Stripe");
      }

      const idempotencyKey = `cco-checkout-${request.milestoneId
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 200)}`;
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": idempotencyKey,
          "Stripe-Version": "2026-05-27.dahlia",
        },
        signal: AbortSignal.timeout(15_000),
        body: new URLSearchParams({
          mode: "payment",
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": request.currency.toLowerCase(),
          "line_items[0][price_data][unit_amount]": String(request.amountCents),
          "line_items[0][price_data][product_data][name]": request.label,
          ...(request.customerEmail ? { customer_email: request.customerEmail } : {}),
          "metadata[milestone_id]": request.milestoneId,
        }),
      });
      if (!response.ok) {
        throw new Error(`Stripe checkout session failed (${response.status}).`);
      }

      const session = (await response.json()) as { id?: string; url?: string };
      let checkoutUrl: URL | null = null;
      try {
        checkoutUrl = session.url ? new URL(session.url) : null;
      } catch {
        checkoutUrl = null;
      }
      if (
        !session.id ||
        !checkoutUrl ||
        checkoutUrl.protocol !== "https:"
      ) {
        throw new Error("Stripe checkout session returned no URL.");
      }
      return {
        sessionId: session.id,
        url: checkoutUrl.toString(),
        provider: "stripe",
      };
    },
  };
}

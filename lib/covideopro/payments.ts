/**
 * Co-VideoPro — payment milestones and checkout provider abstraction.
 *
 * Guidance source: stripe-best-practices skill (Checkout Sessions for one-time
 * payments; never pass payment_method_types; restricted `rk_` keys).
 *
 * Safety: no live charges from this codebase without an explicit environment
 * key. The mock provider is the default everywhere except explicitly
 * configured production deployments.
 */

import {
  proposalEstimateTotal,
  type PaymentMilestone,
  type PaymentMilestoneKind,
  type Proposal,
} from "./record.ts";

/* --------------------------- Milestone math -------------------------------- */

export const DEPOSIT_BPS = 3000; // 30%

export interface MilestoneSpec {
  kind: PaymentMilestoneKind;
  label: string;
  amount_cents: number;
}

/** Deposit (30%) + balance, derived from the proposal's required estimate. */
export function buildMilestonesForApproval(proposal: Pick<Proposal, "title" | "estimate_lines">): MilestoneSpec[] {
  const totalCents = Math.round(proposalEstimateTotal(proposal.estimate_lines) * 100);
  if (totalCents <= 0) return [];
  const depositCents = Math.round((totalCents * DEPOSIT_BPS) / 10000);
  return [
    { kind: "deposit", label: `Deposit (30%) — ${proposal.title}`, amount_cents: depositCents },
    { kind: "balance", label: `Balance — ${proposal.title}`, amount_cents: totalCents - depositCents },
  ];
}

/* ------------------------- Checkout provider ------------------------------- */

export interface CheckoutSessionRequest {
  milestoneId: string;
  label: string;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
  provider: string;
}

export interface CheckoutProvider {
  readonly name: string;
  createSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult>;
}

export class PaymentsNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} checkout is not configured in this environment.`);
    this.name = "PaymentsNotConfiguredError";
  }
}

/** Deterministic offline checkout URL (no network). Used by the demo runtime. */
export function mockCheckoutUrl(milestoneId: string, amountCents: number, currency: string): string {
  const sessionId = `mock_cs_${milestoneId.replace(/[^a-zA-Z0-9]/g, "").slice(-16) || "test"}`;
  return `https://checkout.mock.covideopro.local/${sessionId}?amount=${amountCents}&currency=${encodeURIComponent(currency)}`;
}

/** Deterministic offline provider for local dev, demos, and tests. No network. */
export function createMockCheckoutProvider(): CheckoutProvider {
  return {
    name: "mock",
    async createSession(request) {
      const sessionId = `mock_cs_${request.milestoneId.replace(/[^a-zA-Z0-9]/g, "").slice(-16) || "test"}`;
      return { sessionId, url: mockCheckoutUrl(request.milestoneId, request.amountCents, request.currency), provider: "mock" };
    },
  };
}

export type StripeCheckoutEnv = Record<string, string | undefined>;

/**
 * Stripe Checkout Sessions provider. Requires a restricted key (`rk_`); the
 * not-configured guard is the only path exercised in tests. Per the Stripe
 * guidance: Checkout Sessions, no payment_method_types (dynamic methods).
 */
export function createStripeCheckoutProvider(env: StripeCheckoutEnv = process.env): CheckoutProvider {
  return {
    name: "stripe",
    async createSession(request) {
      const key = env.STRIPE_RESTRICTED_KEY;
      if (!key || !key.startsWith("rk_")) {
        throw new PaymentsNotConfiguredError("Stripe");
      }
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
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
      if (!session.id || !session.url) {
        throw new Error("Stripe checkout session returned no URL.");
      }
      return { sessionId: session.id, url: session.url, provider: "stripe" };
    },
  };
}

/** Money formatting shared by UI surfaces. */
export function formatCents(amountCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

export function milestoneIsActionable(milestone: Pick<PaymentMilestone, "status">): boolean {
  return milestone.status === "pending" || milestone.status === "checkout_created";
}

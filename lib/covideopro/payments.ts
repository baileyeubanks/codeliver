/**
 * Co-VideoPro — payment milestones and checkout provider abstraction.
 *
 * Guidance source: stripe-best-practices skill (Checkout Sessions for one-time
 * payments; never pass payment_method_types).
 *
 * Safety: no live charges from this codebase without an explicit environment
 * key. Live Stripe integration stays in payments.server.ts so this module can
 * safely be imported by client code.
 */

import {
  proposalTotals,
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

/** Deposit (30%) + balance, derived from the proposal's required estimate
 * after whole-proposal adjustments (discount, then tax — proposalTotals). */
export function buildMilestonesForApproval(
  proposal: Pick<Proposal, "title" | "estimate_lines"> & Partial<Pick<Proposal, "discount_pct" | "tax_pct">>,
): MilestoneSpec[] {
  const totalCents = proposalTotals(proposal).totalCents;
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

/**
 * Client-compatible guard for the historical provider export. The live Stripe
 * provider is intentionally server-only; import it from payments.server.ts in
 * a server execution context.
 */
export function createStripeCheckoutProvider(_env: Record<string, string | undefined> = {}): CheckoutProvider {
  void _env;
  return {
    name: "stripe",
    async createSession() {
      throw new PaymentsNotConfiguredError("Stripe");
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

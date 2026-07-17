import assert from "node:assert/strict";
import test from "node:test";

import {
  documentTotals,
  escapeHtml,
  formatDocDate,
  invoiceReference,
  quoteReference,
  renderInvoice,
  renderQuoteCover,
} from "../lib/covideopro/documents.ts";
import { mockCheckoutUrl } from "../lib/covideopro/payments.ts";
import type { Contact, Organization, PaymentMilestone, Proposal } from "../lib/covideopro/record.ts";

/* Fixtures mirror the demo seed (ICA roadshow) — one estimate, one truth. */

const proposal: Proposal = {
  id: "prop-ica-v2",
  project_id: "ica",
  version: 2,
  status: "approved",
  title: "ICA Roadshow 2026 — Opening Film Package",
  narrative: "Two production days, interview package, and post through final delivery.",
  estimate_lines: [
    { id: "el-1", category: "crew", description: "DP + audio, 2 shoot days", quantity: 4, unit_rate: 850, markup_pct: 10, optional: false },
    { id: "el-2", category: "post", description: "Edit, mix, color (master)", quantity: 1, unit_rate: 3200, markup_pct: 15, optional: false },
    { id: "el-3", category: "post", description: "Spanish subtitles", quantity: 1, unit_rate: 450, markup_pct: 0, optional: true },
  ],
  discount_pct: 0,
  tax_pct: 0,
  valid_until: "2026-08-15",
  approved_by: "morgan@ica.example",
  approved_at: "2026-03-01T17:20:00.000Z",
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  created_by: "bailey",
};

const organization: Organization = {
  id: "org-ica",
  name: "Industrial Contractors Association",
  industry: "Association / Energy",
  website: "https://ica.example",
  notes: null,
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  created_by: "bailey",
};

const contact: Contact = {
  id: "contact-morgan-ica",
  organization_id: "org-ica",
  name: "Morgan Lee",
  email: "morgan@ica.example",
  role: "Director of Communications",
  is_primary: true,
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
  created_by: "bailey",
};

function milestone(partial: Partial<PaymentMilestone>): PaymentMilestone {
  return {
    id: "pm-ica-balance",
    project_id: "ica",
    proposal_id: proposal.id,
    kind: "balance",
    label: "Balance — ICA Roadshow 2026 — Opening Film Package",
    amount_cents: 519400,
    currency: "USD",
    status: "pending",
    method: null,
    checkout_url: null,
    checkout_provider: null,
    paid_at: null,
    created_at: "2026-03-01T17:25:00.000Z",
    updated_at: "2026-03-01T17:25:00.000Z",
    created_by: "bailey",
    ...partial,
  };
}

const totals = documentTotals(proposal); // required $7,420.00, optional $450.00
const quoteInput = { proposal, organization, contact, issueDate: "2026-07-17", totals };

/* ------------------------------ Quote cover -------------------------------- */

test("quote cover renders title, parties, dates, and version from the proposal record", () => {
  const html = renderQuoteCover(quoteInput);
  assert.match(html, /ICA Roadshow 2026/);
  assert.match(html, /Opening Film Package/);
  assert.ok(html.includes(organization.name), "bill-to organization");
  assert.ok(html.includes("Morgan Lee"), "bill-to contact");
  assert.ok(html.includes("15 AUG 2026"), "valid-until date");
  assert.ok(html.includes("17 JUL 2026"), "issue date");
  assert.ok(html.includes("Field Paper No. 02"), "version in the chrome");
  assert.ok(html.includes("Q-002"), "quote reference");
  assert.ok(html.includes("V2"), "version in the meta grid");
  assert.ok(html.includes("Content Co-op"), "studio identity");
});

test("quote cover foot is the inverted white bar with the computed total", () => {
  const html = renderQuoteCover(quoteInput);
  assert.ok(html.includes("Total Investment"), "condensed label");
  assert.ok(html.includes("$7,420.00"), "required total from the estimate lines");
  assert.ok(html.includes("background: #ffffff;"), "inverted white bar");
  assert.ok(html.includes("background: #07090c;"), "near-black cover stock");
  assert.ok(html.includes("print-color-adjust: exact"), "cover keeps black in print");
  assert.ok(html.includes("+$450.00"), "optional add-ons disclosed, not summed");
});

/* -------------------------------- Invoice ---------------------------------- */

test("invoice renders TOTAL DUE NOW against the milestone, staged against the quote", () => {
  const balance = milestone({ checkout_url: "https://checkout.stripe.com/c/pay/cs_test_ABC123" });
  const html = renderInvoice({ proposal, milestone: balance, organization, contact, totals });
  assert.match(html, /Invoice/);
  assert.ok(html.includes("INV-002-B"), "invoice number in blue masthead");
  assert.ok(html.includes("Total Due Now"), "ink-black band");
  assert.ok(html.includes("$5,194.00"), "milestone amount, not the quote total");
  assert.ok(html.includes("$7,420.00"), "quote total shown for reference");
  assert.ok(html.includes("Due on receipt"), "terms");
  assert.ok(html.includes("Q-002"), "against-quote reference");
  assert.ok(html.includes("2 of 2"), "balance is stage 2 of 2");
  assert.match(html, /Two ways to pay/i);
  assert.match(html, /SDI \/ PO routing/i, "procurement block");
  assert.ok(html.includes("https://checkout.stripe.com/c/pay/cs_test_ABC123"), "checkout url chip from the milestone");
  assert.ok(html.includes(">01<") && html.includes(">02<"), "numbered line items");
  assert.ok(html.includes("DP + audio, 2 shoot days"), "line item copy from the estimate");
  assert.ok(html.includes("OPTIONAL — NOT INVOICED"), "optional line excluded from the bill");
});

test("invoice falls back to the deterministic mock checkout url; deposit is stage 1 of 2", () => {
  const deposit = milestone({
    id: "pm-ica-deposit",
    kind: "deposit",
    label: "Deposit (30%) — ICA Roadshow 2026 — Opening Film Package",
    amount_cents: 222600,
    status: "paid",
    method: "manual",
  });
  const html = renderInvoice({ proposal, milestone: deposit, organization, contact, totals });
  assert.ok(html.includes("INV-002-A"), "deposit invoice number");
  assert.ok(html.includes("1 of 2"), "deposit stage");
  assert.ok(html.includes("$2,226.00"), "deposit amount");
  const expectedMock = mockCheckoutUrl(deposit.id, deposit.amount_cents, deposit.currency);
  assert.ok(html.includes(escapeHtml(expectedMock)), "mock checkout url chip, escaped");
});

/* -------------------------------- Guards ----------------------------------- */

test("all interpolated text is escaped", () => {
  const evilOrg: Organization = { ...organization, name: 'ICA <script>alert("xss")</script>' };
  const evilTitle: Proposal = { ...proposal, title: 'Film "Final" <cut> & friends' };
  const cover = renderQuoteCover({ ...quoteInput, organization: evilOrg, proposal: evilTitle });
  const invoice = renderInvoice({ proposal: evilTitle, milestone: milestone({}), organization: evilOrg, contact, totals });
  for (const html of [cover, invoice]) {
    assert.ok(!html.includes('<script>alert("xss")</script>'), "no raw script tag");
    assert.ok(html.includes("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"), "org name escaped");
  }
  // The headline splits the title into two styled lines; the contiguous
  // escaped string survives in the document <title>.
  assert.ok(cover.includes("<title>Q-002 — Film &quot;Final&quot; &lt;cut&gt; &amp; friends</title>"), "title escaped");
  assert.ok(cover.includes("Film &quot;Final&quot; &lt;cut&gt;"), "headline segment escaped");
  assert.ok(!cover.includes('Film "Final" <cut>'), "no raw title text");
});

test("renderers are pure and deterministic; references and dates are stable", () => {
  assert.equal(renderQuoteCover(quoteInput), renderQuoteCover(quoteInput));
  const balance = milestone({});
  assert.equal(
    renderInvoice({ proposal, milestone: balance, organization, contact, totals }),
    renderInvoice({ proposal, milestone: balance, organization, contact, totals }),
  );
  assert.equal(quoteReference(proposal), "Q-002");
  assert.equal(invoiceReference(proposal, { kind: "deposit" }), "INV-002-A");
  assert.equal(invoiceReference(proposal, { kind: "balance" }), "INV-002-B");
  assert.equal(formatDocDate("2026-08-15"), "15 AUG 2026");
  assert.equal(formatDocDate("not-a-date"), "not-a-date");
});

test("documentTotals delegates to the record money math (per-line rounding, discount, tax)", () => {
  assert.deepEqual(documentTotals(proposal), { requiredCents: 742000, optionalCents: 45000, currency: "USD" });
  const adjusted = documentTotals({ ...proposal, discount_pct: 10, tax_pct: 8.25 });
  assert.equal(adjusted.requiredCents, 722894, "10% discount then 8.25% tax on the discounted amount");
});

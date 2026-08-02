/**
 * Co-VideoPro — document layer over the estimate record (Gen‑3 port).
 *
 * Doctrine: one estimate, one truth, two views. These renderers read the SAME
 * Proposal / PaymentMilestone records the cockpit edits — there is no second
 * editor and no duplicated money math beyond the shared `proposalEstimateTotal`.
 * Output is a self-contained HTML string (inline styles, no external CSS) for
 * an iframe srcDoc preview and print-to-PDF.
 *
 * Design source: docs/COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md §P — Gen‑3 dark
 * cinematic quote cover + invoice one-pager. Procurement-legible, no cream, no
 * Fraunces; white sans interior for the invoice. Print: letter size; the cover
 * keeps its black background via print-color-adjust: exact.
 */

import {
  estimateLineTotal,
  proposalTotals,
  type Contact,
  type EstimateLine,
  type Organization,
  type PaymentMilestone,
  type Proposal,
} from "./record.ts";
import { formatCents, mockCheckoutUrl } from "./payments.ts";

/* ------------------------------- Chrome ----------------------------------- */

const ELECTRIC = "#2e7dff"; // electric blue accent (the ONE blue line / totals)
const COVER_BG = "#07090c"; // near-black cover stock
const COVER_INK = "#eceff4";
const COVER_MUTE = "#98a2b3";
const COVER_LINE = "#26303f"; // hairlines on the cover
const INK = "#0c0e12"; // interior ink
const MUTE = "#5c6675";
const LINE = "#d9dfe7"; // hairlines on white interiors

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const CONDENSED = `'Arial Narrow', 'HelveticaNeue-CondensedBold', 'Roboto Condensed', 'Segoe UI', sans-serif`;

/** Print contract: letter, zero page margin, white base; only the cover keeps
 * its black stock (print-color-adjust on the cover sheet itself). */
const BASE_CSS = [
  "@page { size: letter; margin: 0; }",
  "* { box-sizing: border-box; }",
  "html, body { margin: 0; padding: 0; }",
  "@media print {",
  "  body { background: #ffffff !important; }",
  "  .sheet { margin: 0 !important; box-shadow: none !important; width: 100% !important; }",
  "}",
].join("\n");

/* ------------------------------- Helpers ----------------------------------- */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DOC_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** Deterministic, locale-free: "2026-08-15" → "15 AUG 2026". */
export function formatDocDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  if (!year || !month || month < 1 || month > 12 || !day) return escapeHtml(isoDate);
  return `${String(day).padStart(2, "0")} ${DOC_MONTHS[month - 1]} ${year}`;
}

export interface DocumentTotals {
  requiredCents: number;
  optionalCents: number;
  currency: string;
}

/** Money is integer cents via the record's own `proposalTotals` (per-line
 * rounding, then discount, then tax) — the document layer never re-derives. */
export function documentTotals(
  proposal: Pick<Proposal, "estimate_lines"> & Partial<Pick<Proposal, "discount_pct" | "tax_pct">>,
  currency = "USD",
): DocumentTotals {
  const requiredCents = proposalTotals(proposal).totalCents;
  const withOptionalCents = proposalTotals(proposal, { includeOptional: true }).totalCents;
  return { requiredCents, optionalCents: withOptionalCents - requiredCents, currency };
}

export function quoteReference(proposal: Pick<Proposal, "version">): string {
  return `Q-${String(proposal.version).padStart(3, "0")}`;
}

export function invoiceReference(
  proposal: Pick<Proposal, "version">,
  milestone: Pick<PaymentMilestone, "kind">,
): string {
  return `INV-${String(proposal.version).padStart(3, "0")}-${milestone.kind === "deposit" ? "A" : "B"}`;
}

/** Deposit invoices are stage 1 of the deposit+balance pair; balance is 2. */
function stageLabel(milestone: Pick<PaymentMilestone, "kind">): string {
  return milestone.kind === "deposit" ? "1 of 2" : "2 of 2";
}

/** Split the title so exactly one headline line is electric blue: the last
 * em-dash/colon segment, or the back half of the words when there is no dash. */
function splitHeadline(title: string): [string, string] {
  const segments = title.split(/\s+[—:]\s+/).map((part) => part.trim()).filter(Boolean);
  if (segments.length >= 2) {
    return [segments.slice(0, -1).join(" — "), segments[segments.length - 1]];
  }
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return ["", words[0] ?? ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/** Tracked small-caps chrome used across both documents. */
const TRACKED = "text-transform: uppercase; letter-spacing: 0.32em;";
const TRACKED_TIGHT = "text-transform: uppercase; letter-spacing: 0.22em;";

function sheetDocument(title: string, sheet: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${BASE_CSS}</style>`,
    "</head>",
    `<body style="margin: 0; background: #34383f; font-family: ${SANS};">`,
    sheet,
    "</body>",
    "</html>",
  ].join("\n");
}

/* ------------------------------ Quote cover -------------------------------- */

export interface QuoteCoverInput {
  proposal: Proposal;
  organization: Organization | null;
  contact: Contact | null;
  /** ISO date (YYYY-MM-DD) the cover is issued. */
  issueDate: string;
  totals: DocumentTotals;
}

export function renderQuoteCover(input: QuoteCoverInput): string {
  const { proposal, organization, contact, totals } = input;
  const [headlineWhite, headlineBlue] = splitHeadline(proposal.title);
  const quoteRef = quoteReference(proposal);
  const categories = [...new Set(proposal.estimate_lines.filter((line) => !line.optional).map((line) => line.category))];

  const chip = (label: string) =>
    `<span style="display: inline-block; padding: 6px 12px; border: 1px solid ${COVER_LINE}; border-radius: 999px; color: ${COVER_MUTE}; font-size: 8pt; font-weight: 600; ${TRACKED_TIGHT}">${escapeHtml(label.toUpperCase())}</span>`;

  const metaCell = (label: string, value: string) =>
    `<div style="padding: 12px 14px; border-left: 1px solid ${COVER_LINE};">` +
    `<div style="color: ${COVER_MUTE}; font-size: 7pt; font-weight: 700; ${TRACKED}">${label}</div>` +
    `<div style="margin-top: 6px; color: ${COVER_INK}; font-size: 9.5pt; font-weight: 600;">${value}</div>` +
    `</div>`;

  const partyBlock = (label: string, lines: string[]) =>
    `<div>` +
    `<div style="color: ${COVER_MUTE}; font-size: 7pt; font-weight: 700; ${TRACKED}">${label}</div>` +
    lines
      .filter(Boolean)
      .map(
        (line, index) =>
          `<div style="margin-top: 6px; color: ${index === 0 ? COVER_INK : COVER_MUTE}; font-size: ${index === 0 ? "11pt" : "8.5pt"}; font-weight: ${index === 0 ? 700 : 400};">${line}</div>`,
      )
      .join("") +
    `</div>`;

  const sheet = `
<div class="sheet" style="width: 8.5in; min-height: 11in; margin: 24px auto; padding: 0.6in 0.62in 0.5in; display: flex; flex-direction: column; background: ${COVER_BG}; color: ${COVER_INK}; box-shadow: 0 24px 64px rgba(0,0,0,0.5); -webkit-print-color-adjust: exact; print-color-adjust: exact;">
  <div style="display: flex; justify-content: space-between; align-items: baseline;">
    <span style="color: ${COVER_MUTE}; font-size: 7.5pt; font-weight: 700; ${TRACKED}">Content Co-op · Field Paper No. ${String(proposal.version).padStart(2, "0")}</span>
    <span style="color: ${COVER_MUTE}; font-size: 7.5pt; font-weight: 700; ${TRACKED}">Quotation</span>
  </div>
  <div style="margin-top: 14px; height: 1px; background: ${ELECTRIC};"></div>

  <h1 style="margin: 0.62in 0 0; font-family: ${CONDENSED}; font-stretch: condensed; font-size: 62pt; line-height: 0.94; font-weight: 700; text-transform: uppercase; letter-spacing: 0.01em;">
    ${headlineWhite ? `<span style="display: block; color: ${COVER_INK};">${escapeHtml(headlineWhite)}</span>` : ""}
    <span style="display: block; color: ${ELECTRIC};">${escapeHtml(headlineBlue)}</span>
  </h1>

  ${proposal.narrative ? `<p style="margin: 0.3in 0 0; max-width: 5.6in; color: ${COVER_MUTE}; font-size: 10pt; line-height: 1.6;">${escapeHtml(proposal.narrative)}</p>` : ""}

  <div style="margin-top: 0.28in; display: flex; flex-wrap: wrap; gap: 8px;">
    ${categories.map(chip).join("")}
  </div>

  <div style="margin-top: 0.34in; display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid ${COVER_LINE}; border-bottom: 1px solid ${COVER_LINE};">
    ${metaCell("Issue", formatDocDate(input.issueDate))}
    ${metaCell("Valid", proposal.valid_until ? formatDocDate(proposal.valid_until) : "—")}
    ${metaCell("Payment", "30% deposit · balance on delivery")}
    ${metaCell("Quote", `${quoteRef} · V${proposal.version}`)}
  </div>

  <div style="margin-top: 0.34in; display: grid; grid-template-columns: 1fr 1fr; gap: 0.4in;">
    ${partyBlock("From", ["Content Co-op", "Field production · Post · Delivery", "billing@contentco-op.com"])}
    ${partyBlock("Bill to", [
      organization ? escapeHtml(organization.name) : "—",
      organization?.industry ? escapeHtml(organization.industry) : "",
      contact ? `${escapeHtml(contact.name)}${contact.role ? ` · ${escapeHtml(contact.role)}` : ""}` : "",
      contact ? escapeHtml(contact.email) : "",
    ])}
  </div>

  <div style="margin-top: auto; padding-top: 0.4in;">
    ${totals.optionalCents > 0 ? `<div style="margin-bottom: 10px; color: ${COVER_MUTE}; font-size: 8pt;">Optional add-ons available: +${escapeHtml(formatCents(totals.optionalCents, totals.currency))} — not included below.</div>` : ""}
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0.24in 0.3in; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
      <span style="color: #000000; font-family: ${CONDENSED}; font-stretch: condensed; font-size: 20pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;">Total Investment</span>
      <span style="color: ${ELECTRIC}; font-family: ${CONDENSED}; font-stretch: condensed; font-size: 40pt; font-weight: 700; line-height: 1;">${escapeHtml(formatCents(totals.requiredCents, totals.currency))}</span>
    </div>
  </div>
</div>`;

  return sheetDocument(`${quoteRef} — ${proposal.title}`, sheet);
}

/* ------------------------------ Invoice ------------------------------------ */

export interface InvoiceInput {
  proposal: Proposal;
  milestone: PaymentMilestone;
  organization: Organization | null;
  contact: Contact | null;
  totals: DocumentTotals;
}

export function renderInvoice(input: InvoiceInput): string {
  const { proposal, milestone, organization, contact, totals } = input;
  const quoteRef = quoteReference(proposal);
  const invoiceRef = invoiceReference(proposal, milestone);
  const checkoutUrl = milestone.checkout_url ?? mockCheckoutUrl(milestone.id, milestone.amount_cents, milestone.currency);
  const requiredLines = proposal.estimate_lines.filter((line) => !line.optional);
  const optionalLines = proposal.estimate_lines.filter((line) => line.optional);

  const lineTotal = (line: EstimateLine) =>
    formatCents(Math.round(estimateLineTotal(line) * 100), totals.currency);

  const lineRow = (line: EstimateLine, index: number) =>
    `<tr>` +
    `<td style="padding: 9px 10px; border-bottom: 1px solid ${LINE}; color: ${MUTE}; font-size: 8pt; font-weight: 700;">${String(index + 1).padStart(2, "0")}</td>` +
    `<td style="padding: 9px 10px; border-bottom: 1px solid ${LINE}; color: ${INK}; font-size: 9pt;">${escapeHtml(line.description)}<div style="color: ${MUTE}; font-size: 7.5pt; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.14em;">${escapeHtml(line.category)}</div></td>` +
    `<td style="padding: 9px 10px; border-bottom: 1px solid ${LINE}; color: ${MUTE}; font-size: 8.5pt; white-space: nowrap;">${line.quantity} × ${escapeHtml(formatCents(Math.round(line.unit_rate * 100), totals.currency))}${line.markup_pct ? ` +${line.markup_pct}%` : ""}</td>` +
    `<td style="padding: 9px 10px; border-bottom: 1px solid ${LINE}; color: ${INK}; font-size: 9pt; font-weight: 650; text-align: right;">${escapeHtml(lineTotal(line))}</td>` +
    `</tr>`;

  const metaCell = (label: string, value: string) =>
    `<div style="padding: 10px 12px; border-left: 1px solid ${LINE};">` +
    `<div style="color: ${MUTE}; font-size: 6.5pt; font-weight: 700; ${TRACKED}">${label}</div>` +
    `<div style="margin-top: 5px; color: ${INK}; font-size: 9pt; font-weight: 650;">${value}</div>` +
    `</div>`;

  const sheet = `
<div class="sheet" style="width: 8.5in; min-height: 11in; margin: 24px auto; padding: 0.6in 0.62in 0.5in; display: flex; flex-direction: column; background: #ffffff; color: ${INK}; box-shadow: 0 24px 64px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: baseline;">
    <span style="color: ${MUTE}; font-size: 7.5pt; font-weight: 700; ${TRACKED}">Content Co-op · Accounts Receivable</span>
    <span style="color: ${MUTE}; font-size: 7.5pt; font-weight: 700; ${TRACKED}">Against ${quoteRef}</span>
  </div>
  <div style="margin-top: 14px; height: 1px; background: ${ELECTRIC};"></div>

  <h1 style="margin: 0.42in 0 0; font-family: ${CONDENSED}; font-stretch: condensed; font-size: 74pt; line-height: 0.92; font-weight: 700; text-transform: uppercase; letter-spacing: 0.01em; color: ${INK};">
    Invoice <span style="color: ${ELECTRIC}; font-size: 30pt; vertical-align: 26pt;">${invoiceRef}</span>
  </h1>

  <div style="margin-top: 0.3in; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid ${LINE}; border-bottom: 1px solid ${LINE};">
    ${metaCell("Terms", "Due on receipt")}
    ${metaCell("Against quote", quoteRef)}
    ${metaCell("Stage", stageLabel(milestone))}
  </div>

  <div style="margin-top: 0.3in; display: grid; grid-template-columns: 1fr 1fr; gap: 0.4in;">
    <div>
      <div style="color: ${MUTE}; font-size: 6.5pt; font-weight: 700; ${TRACKED}">From</div>
      <div style="margin-top: 6px; color: ${INK}; font-size: 10.5pt; font-weight: 700;">Content Co-op</div>
      <div style="margin-top: 4px; color: ${MUTE}; font-size: 8.5pt;">Field production · Post · Delivery</div>
      <div style="margin-top: 2px; color: ${MUTE}; font-size: 8.5pt;">billing@contentco-op.com</div>
    </div>
    <div>
      <div style="color: ${MUTE}; font-size: 6.5pt; font-weight: 700; ${TRACKED}">Bill to</div>
      <div style="margin-top: 6px; color: ${INK}; font-size: 10.5pt; font-weight: 700;">${organization ? escapeHtml(organization.name) : "—"}</div>
      ${organization?.industry ? `<div style="margin-top: 4px; color: ${MUTE}; font-size: 8.5pt;">${escapeHtml(organization.industry)}</div>` : ""}
      ${contact ? `<div style="margin-top: 2px; color: ${MUTE}; font-size: 8.5pt;">${escapeHtml(contact.name)}${contact.role ? ` · ${escapeHtml(contact.role)}` : ""} — ${escapeHtml(contact.email)}</div>` : ""}
    </div>
  </div>

  <table style="margin-top: 0.34in; width: 100%; border-collapse: collapse;">
    <thead>
      <tr>
        <th style="padding: 7px 10px; border-bottom: 2px solid ${INK}; color: ${MUTE}; font-size: 6.5pt; font-weight: 700; text-align: left; ${TRACKED}">No.</th>
        <th style="padding: 7px 10px; border-bottom: 2px solid ${INK}; color: ${MUTE}; font-size: 6.5pt; font-weight: 700; text-align: left; ${TRACKED}">Line item</th>
        <th style="padding: 7px 10px; border-bottom: 2px solid ${INK}; color: ${MUTE}; font-size: 6.5pt; font-weight: 700; text-align: left; ${TRACKED}">Basis</th>
        <th style="padding: 7px 10px; border-bottom: 2px solid ${INK}; color: ${MUTE}; font-size: 6.5pt; font-weight: 700; text-align: right; ${TRACKED}">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${requiredLines.map(lineRow).join("")}
      ${optionalLines
        .map(
          (line) =>
            `<tr><td style="padding: 9px 10px; border-bottom: 1px solid ${LINE}; color: ${MUTE}; font-size: 8pt;">—</td><td colspan="2" style="padding: 9px 10px; border-bottom: 1px solid ${LINE}; color: ${MUTE}; font-size: 8.5pt;">${escapeHtml(line.description)} <span style="font-size: 7pt; font-weight: 700; letter-spacing: 0.14em;">OPTIONAL — NOT INVOICED</span></td><td style="padding: 9px 10px; border-bottom: 1px solid ${LINE}; color: ${MUTE}; font-size: 8.5pt; text-align: right;">${escapeHtml(lineTotal(line))}</td></tr>`,
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="padding: 10px; color: ${MUTE}; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em;">Quote total (${quoteRef})</td>
        <td style="padding: 10px; color: ${INK}; font-size: 10pt; font-weight: 700; text-align: right;">${escapeHtml(formatCents(totals.requiredCents, totals.currency))}</td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top: 0.26in; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0.22in 0.3in; background: ${INK}; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
    <div>
      <div style="color: #ffffff; font-family: ${CONDENSED}; font-stretch: condensed; font-size: 20pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;">Total Due Now</div>
      <div style="margin-top: 4px; color: #9aa3b2; font-size: 8pt;">${escapeHtml(milestone.label)} · Stage ${stageLabel(milestone)}</div>
    </div>
    <span style="color: #ffffff; font-family: ${CONDENSED}; font-stretch: condensed; font-size: 40pt; font-weight: 700; line-height: 1;">${escapeHtml(formatCents(milestone.amount_cents, milestone.currency))}</span>
  </div>

  <div style="margin-top: 0.3in; border: 1px solid ${LINE}; border-radius: 8px; overflow: hidden;">
    <div style="padding: 10px 14px; border-bottom: 1px solid ${LINE}; color: ${INK}; font-size: 8pt; font-weight: 700; ${TRACKED}">Two ways to pay</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr;">
      <div style="padding: 14px; border-right: 1px solid ${LINE};">
        <div style="color: ${MUTE}; font-size: 6.5pt; font-weight: 700; ${TRACKED}">Card — Secure link</div>
        <div style="margin-top: 8px;">
          <a href="${escapeHtml(checkoutUrl)}" style="display: inline-block; max-width: 100%; padding: 7px 12px; border-radius: 6px; background: #e8f1ff; color: #1557d6; font-size: 8pt; font-weight: 600; text-decoration: none; word-break: break-all;">${escapeHtml(checkoutUrl)}</a>
        </div>
        <div style="margin-top: 8px; color: ${MUTE}; font-size: 7.5pt;">Hosted checkout — card, no account needed.</div>
      </div>
      <div style="padding: 14px;">
        <div style="color: ${MUTE}; font-size: 6.5pt; font-weight: 700; ${TRACKED}">SDI / PO routing</div>
        <div style="margin-top: 8px; color: ${INK}; font-size: 8.5pt; line-height: 1.55;">
          Reference <strong>${invoiceRef}</strong> on your purchase order. Route through your procurement desk; remit to Content Co-op Accounts Receivable — billing@contentco-op.com. Net terms on approved PO only.
        </div>
      </div>
    </div>
  </div>

  <div style="margin-top: auto; padding-top: 0.3in; color: ${MUTE}; font-size: 7.5pt; line-height: 1.6;">
    Rendered from Proposal v${proposal.version} (${quoteRef}) — one estimate, one truth. This invoice bills the ${milestone.kind === "deposit" ? "deposit" : "balance"} milestone only; the remaining milestone invoices separately.
  </div>
</div>`;

  return sheetDocument(`${invoiceRef} — ${milestone.label}`, sheet);
}

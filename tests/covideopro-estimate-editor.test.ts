import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { register, registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

register("./typescript-resolver.mjs", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

import { proposalTotals, type EstimateLine, type RateItem } from "../lib/covideopro/record.ts";
import { lineFromRateItem } from "../lib/covideopro/bid.ts";

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;

async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

test.beforeEach(async () => {
  const { resetDemoWorkspace } = await store();
  resetDemoWorkspace();
});

/* --------------------------- proposalTotals math ---------------------------- */

const lines: EstimateLine[] = [
  { id: "l1", category: "crew", description: "DP", quantity: 2, unit_rate: 1000, markup_pct: 10, optional: false },
  { id: "l2", category: "post", description: "Edit", quantity: 3, unit_rate: 95, markup_pct: 0, optional: false },
  { id: "l3", category: "travel", description: "Lodging", quantity: 1, unit_rate: 480, markup_pct: 0, optional: true },
];

test("proposalTotals: markup per line first, then discount, then tax on the discounted amount", () => {
  // Subtotal: 2×$1000×1.10 + 3×$95 = $2,200 + $285 = $2,485.00 (optional excluded).
  // Discount 10% → $248.50; discounted $2,236.50; tax 8.25% → $184.51125 → $184.51.
  const totals = proposalTotals({ estimate_lines: lines, discount_pct: 10, tax_pct: 8.25 });
  assert.deepEqual(totals, {
    subtotalCents: 248500,
    discountCents: 24850,
    taxCents: 18451,
    totalCents: 242101,
  });
});

test("proposalTotals: zero adjustments pass the subtotal through", () => {
  const totals = proposalTotals({ estimate_lines: lines, discount_pct: 0, tax_pct: 0 });
  assert.equal(totals.discountCents, 0);
  assert.equal(totals.taxCents, 0);
  assert.equal(totals.totalCents, totals.subtotalCents);
  assert.equal(totals.totalCents, 248500);
});

test("proposalTotals: 100% markup doubles the line; optional lines excluded by default", () => {
  const doubled = proposalTotals({
    estimate_lines: [{ id: "m", category: "crew", description: "Rush", quantity: 1, unit_rate: 500, markup_pct: 100, optional: false }],
  });
  assert.equal(doubled.subtotalCents, 100000);

  const withOptional = proposalTotals({ estimate_lines: lines }, { includeOptional: true });
  assert.equal(withOptional.subtotalCents, 248500 + 48000);
  assert.equal(proposalTotals({ estimate_lines: lines }).subtotalCents, 248500);
});

test("proposalTotals: integer cents throughout, half-cent fractions round deterministically", () => {
  const totals = proposalTotals({
    estimate_lines: [{ id: "r", category: "post", description: "Edit", quantity: 1, unit_rate: 19.99, markup_pct: 15, optional: false }],
    discount_pct: 33,
    tax_pct: 10,
  });
  // Line: $19.99 × 1.15 = $22.9885 → 2299¢. Discount 33% of 2299 = 758.67 → 759¢.
  // Tax 10% of (2299 − 759 = 1540) = 154¢.
  assert.equal(totals.subtotalCents, 2299);
  assert.equal(totals.discountCents, 759);
  assert.equal(totals.taxCents, 154);
  assert.equal(totals.totalCents, 2299 - 759 + 154);
  for (const value of Object.values(totals)) assert.equal(Number.isInteger(value), true);
});

test("proposalTotals: empty estimate is zero, not NaN", () => {
  assert.deepEqual(proposalTotals({ estimate_lines: [], discount_pct: 10, tax_pct: 10 }), {
    subtotalCents: 0,
    discountCents: 0,
    taxCents: 0,
    totalCents: 0,
  });
});

/* ----------------------------- catalog append -------------------------------- */

test("lineFromRateItem maps a catalog item to an estimate line at the card rate", () => {
  const item: RateItem = {
    id: "ri-edit-hour",
    rate_card_id: "rc-standard-2026",
    code: "edit-hour",
    category: "post",
    description: "Edit",
    unit: "hour",
    unit_rate_cents: 9500,
    active: true,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    created_by: "user-bailey",
  };
  assert.deepEqual(lineFromRateItem(item, "el-new-1"), {
    id: "el-new-1",
    category: "post",
    description: "Edit",
    quantity: 1,
    unit_rate: 95,
    markup_pct: 0,
    optional: false,
  });
});

/* -------------------- saveProposal adjustment carry-over --------------------- */

test("saveProposal stores discount/tax and carries them across versions unless overridden", async () => {
  const { saveProposal, getDemoWorkspaceSnapshot } = await store();
  const line: EstimateLine = { id: "el-t1", category: "post", description: "Edit", quantity: 1, unit_rate: 1000, markup_pct: 0, optional: false };

  const first = saveProposal({
    projectId: "bp",
    title: "Rodeo Recap — Adjusted",
    narrative: "",
    estimateLines: [line],
    discountPct: 10,
    taxPct: 8,
  });
  if (!first.ok) assert.fail(first.reason);
  const firstId = first.id;

  const versionsOf = () =>
    getDemoWorkspaceSnapshot()
      .proposals.filter((proposal) => proposal.id === firstId)
      .sort((a, b) => a.version - b.version);

  const v1 = versionsOf().find((proposal) => proposal.version === 1);
  assert.equal(v1?.discount_pct, 10);
  assert.equal(v1?.tax_pct, 8);
  assert.equal(v1?.status, "draft");

  // Revision without adjustment inputs preserves the current version's values.
  const second = saveProposal({ projectId: "bp", title: "Rodeo Recap — Adjusted", narrative: "", estimateLines: [line] });
  if (!second.ok) assert.fail(second.reason);
  const v2 = versionsOf().find((proposal) => proposal.version === 2);
  assert.equal(v2?.discount_pct, 10, "discount carries forward");
  assert.equal(v2?.tax_pct, 8, "tax carries forward");

  // Explicit input overrides — including back down to zero.
  const third = saveProposal({
    projectId: "bp",
    title: "Rodeo Recap — Adjusted",
    narrative: "",
    estimateLines: [line],
    discountPct: 0,
  });
  if (!third.ok) assert.fail(third.reason);
  const v3 = versionsOf().find((proposal) => proposal.version === 3);
  assert.equal(v3?.discount_pct, 0, "explicit zero overrides the carry-over");
  assert.equal(v3?.tax_pct, 8, "untouched adjustment still carries forward");
  assert.equal(versionsOf().length, 3, "each save drafts a new version");
});

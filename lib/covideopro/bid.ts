/**
 * Webster — Brief-to-Bid compiler (Agent 1: Line Producer, FORM only).
 *
 * Deterministic compilation: deliverable kinds → resource bundles, priced
 * from the ACTIVE rate card. No LLM arithmetic — the operator owns scope
 * and price; the compiler proposes lines with rule provenance attached.
 */

import type { EstimateCategory, EstimateLine, RateCard, RateItem } from "./record.ts";

export type DeliverableKind = "hero_film" | "cutdown" | "social" | "captions" | "stills" | "podcast" | "recap";

export interface BidRule {
  kind: DeliverableKind;
  /** Keywords that map free-text deliverables to this kind. */
  keywords: string[];
  /** Resource bundles as rate codes with quantity per deliverable unit. */
  resources: Array<{ code: string; quantity: number }>;
}

export const BID_RULES: readonly BidRule[] = [
  {
    kind: "hero_film",
    keywords: ["hero", "film", "feature", "opening", "brand story", "customer story"],
    resources: [
      { code: "dp-day", quantity: 2 },
      { code: "audio-day", quantity: 2 },
      { code: "gear-day", quantity: 2 },
      { code: "travel-flat", quantity: 1 },
      { code: "edit-hour", quantity: 24 },
      { code: "color-hour", quantity: 6 },
    ],
  },
  {
    kind: "cutdown",
    keywords: ["cutdown", "cut down", "30-second", "30s", "45-second", "short version"],
    resources: [{ code: "edit-hour", quantity: 6 }],
  },
  {
    kind: "social",
    keywords: ["social", "9:16", "vertical", "reel", "tiktok", "shorts"],
    resources: [
      { code: "edit-hour", quantity: 5 },
      { code: "caption-pass", quantity: 1 },
    ],
  },
  {
    kind: "captions",
    keywords: ["caption", "subtitle"],
    resources: [{ code: "caption-pass", quantity: 1 }],
  },
  {
    kind: "stills",
    keywords: ["still", "photo"],
    resources: [{ code: "photo-day", quantity: 1 }],
  },
  {
    kind: "podcast",
    keywords: ["podcast", "episode"],
    resources: [
      { code: "audio-day", quantity: 1 },
      { code: "edit-hour", quantity: 10 },
    ],
  },
  {
    kind: "recap",
    keywords: ["recap", "highlight", "aftermovie"],
    resources: [
      { code: "dp-day", quantity: 1 },
      { code: "edit-hour", quantity: 12 },
    ],
  },
] as const;

/** Map free-text deliverables notes to (kind, quantity) pairs. */
export function parseDeliverableKinds(notes: string): Array<{ kind: DeliverableKind; quantity: number; evidence: string }> {
  const found: Array<{ kind: DeliverableKind; quantity: number; evidence: string }> = [];
  const lower = notes.toLowerCase();
  const qtyMatch = lower.match(/(\d+)\s*[x×]?\s*(?:[a-z0-9: -]*)/);
  void qtyMatch;
  for (const rule of BID_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        const countMatch = new RegExp(`(\\d+)\\s*(?:x|×)?\\s*${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?`).exec(lower);
        const quantity = countMatch ? Math.max(1, Number(countMatch[1])) : 1;
        found.push({ kind: rule.kind, quantity, evidence: keyword });
        break;
      }
    }
  }
  return found;
}

export interface CompiledLine extends EstimateLine {
  rule: string;
  evidence: string;
}

/** Compile a brief's deliverables into suggested estimate lines priced by the card. */
export function compileBid(input: {
  deliverablesNotes: string;
  rateItems: RateItem[];
  markupPct?: number;
}): CompiledLine[] {
  const kinds = parseDeliverableKinds(input.deliverablesNotes);
  const byCode = new Map(input.rateItems.filter((item) => item.active).map((item) => [item.code, item]));
  const lines: CompiledLine[] = [];
  let index = 0;

  for (const found of kinds) {
    const rule = BID_RULES.find((candidate) => candidate.kind === found.kind);
    if (!rule) continue;
    for (const resource of rule.resources) {
      const rate = byCode.get(resource.code);
      if (!rate) continue;
      index += 1;
      lines.push({
        id: `bid-${index}`,
        category: rate.category as EstimateCategory,
        description: `${rate.description} — ${found.kind.replace("_", " ")}`,
        quantity: resource.quantity * found.quantity,
        unit_rate: rate.unit_rate_cents / 100,
        markup_pct: input.markupPct ?? 10,
        optional: false,
        rule: found.kind,
        evidence: `keyword "${found.evidence}" · rate card v* ${rate.code}`,
      });
    }
  }
  return lines;
}

/** The active version of a rate card set (active status wins). */
export function activeRateCard(cards: RateCard[]): RateCard | null {
  return cards.filter((card) => card.status === "active").sort((a, b) => b.version - a.version)[0] ?? null;
}

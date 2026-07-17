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

import { activeRateCard, compileBid, parseDeliverableKinds } from "../lib/covideopro/bid.ts";
import { proposalEstimateTotal } from "../lib/covideopro/record.ts";

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;
async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

test.beforeEach(async () => {
  (await store()).resetDemoWorkspace();
});

test("deliverable kinds parse from free text with evidence", () => {
  const kinds = parseDeliverableKinds("3-minute hero + 30-second cutdown; captions; Spanish subtitles if budget allows.");
  const names = kinds.map((kind) => kind.kind);
  assert.ok(names.includes("hero_film"));
  assert.ok(names.includes("cutdown"));
  assert.ok(names.includes("captions"));
  assert.ok(kinds.every((kind) => kind.evidence.length > 0), "every match cites its keyword");
  assert.deepEqual(parseDeliverableKinds("no matching content here"), []);
});

test("compiler prices resources from the active card, deterministically", async () => {
  const { getDemoWorkspaceSnapshot } = await store();
  const workspace = getDemoWorkspaceSnapshot();
  const card = activeRateCard(workspace.rateCards);
  assert.equal(card?.name, "CCo Standard 2026");

  const items = workspace.rateItems.filter((item) => item.rate_card_id === card?.id);
  const notes = "3-minute hero + 30-second cutdown; captions.";
  const first = compileBid({ deliverablesNotes: notes, rateItems: items });
  const second = compileBid({ deliverablesNotes: notes, rateItems: items });

  assert.deepEqual(first, second, "same inputs, same lines — no LLM arithmetic");
  assert.ok(first.some((line) => line.description.includes("DP / camera operator")));
  assert.ok(first.some((line) => line.description.includes("Edit")));
  assert.ok(first.some((line) => line.description.includes("Caption pass")));
  assert.ok(first.every((line) => line.rule && line.evidence), "provenance on every line");

  const total = proposalEstimateTotal(first);
  assert.ok(total > 0);
  // DP day $850 ×2 ×1.1 + audio $550 ×2 ×1.1 + gear $600 ×2 ×1.1 + travel $480 ×1.1 + edit $95 ×24 ×1.1 + color $110 ×6 ×1.1 + edit $95 ×6 ×1.1 + captions $450 ×1.1
  const expected = (850 * 2 + 550 * 2 + 600 * 2 + 480 + 95 * 24 + 110 * 6 + 95 * 6 + 450) * 1.1;
  assert.ok(Math.abs(total - expected) < 0.01, `deterministic total ${total} ≈ ${expected}`);
});

test("Line Producer compiles into a new proposal version with narrative provenance", async () => {
  const { compileBidToProposal, getDemoWorkspaceSnapshot } = await store();

  const result = compileBidToProposal("conexon");
  assert.equal(result.ok, true);

  const workspace = getDemoWorkspaceSnapshot();
  const proposal = workspace.proposals.find((candidate) => candidate.id === result.id);
  assert.equal(proposal?.status, "draft");
  assert.ok((proposal?.estimate_lines.length ?? 0) > 0);
  assert.match(proposal?.narrative ?? "", /compiled by the Line Producer \(Agent 1\)/);
  assert.match(proposal?.narrative ?? "", /the operator owns scope and price/);
  assert.equal(workspace.activity[0]?.action, "compiled_bid");

  // The seeded sent proposal (v1) is preserved within the same lineage (versions share the id).
  const lineage = workspace.proposals.filter((candidate) => candidate.id === "prop-conexon-v1");
  assert.equal(lineage.find((candidate) => candidate.version === 1)?.status, "sent");
  assert.equal(lineage.find((candidate) => candidate.version === 2)?.status, "draft");
});

test("compile refuses without a brief and reports empty matches honestly", async () => {
  const { compileBidToProposal, saveBrief, getDemoWorkspaceSnapshot } = await store();

  assert.equal(compileBidToProposal("bp").ok, false, "bp has no brief");

  saveBrief({ projectId: "bp", objectives: "o", audience: "a", message: "m", deliverablesNotes: "nothing mappable zzz" });
  const result = compileBidToProposal("bp");
  assert.equal(result.ok, false);
  assert.match(result.reason, /didn't match any compiler rules/);

  void getDemoWorkspaceSnapshot;
});

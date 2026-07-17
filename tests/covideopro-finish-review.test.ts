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

import { implementationForFinishOutcome } from "../lib/covideopro/transitions.ts";

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;
async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

test.beforeEach(async () => {
  (await store()).resetDemoWorkspace();
});

test("finish review writes a durable decision with comment provenance", async () => {
  const { finishDemoReview, getDemoWorkspaceSnapshot } = await store();

  const result = finishDemoReview({
    assetId: "charles-drummond-v5",
    reviewerName: "Alex Rivera",
    reviewerEmail: "alex@ica.example",
    outcome: "changes_requested",
    note: "Lower thirds still rush the answers.",
  });
  assert.equal(result.ok, true);

  const workspace = getDemoWorkspaceSnapshot();
  const decision = workspace.decisions.find((candidate) => candidate.id === result.id);
  assert.equal(decision?.subject, "Changes requested: Charles Drummond_v5");
  assert.equal(decision?.decided_by, "alex@ica.example");
  assert.equal(decision?.source, "review");
  assert.deepEqual(decision?.comment_ids.sort(), ["comment-charles-1", "comment-charles-2"].sort(), "open comments attach as provenance");
  assert.equal(decision?.implementation_status, "pending");
  assert.equal(decision?.supersedes_id, null);
  assert.equal(workspace.activity[0]?.action, "finish_review_changes_requested");
});

test("outcome maps to implementation state; approval finishes done", async () => {
  const { finishDemoReview, getDemoWorkspaceSnapshot } = await store();
  assert.equal(implementationForFinishOutcome("changes_requested"), "pending");
  assert.equal(implementationForFinishOutcome("approved"), "done");
  assert.equal(implementationForFinishOutcome("notes_only"), "done");

  const result = finishDemoReview({
    assetId: "denie-mcdonald-v4",
    reviewerName: "Morgan Lee",
    outcome: "approved",
  });
  assert.equal(result.ok, true);
  assert.equal(
    getDemoWorkspaceSnapshot().decisions.find((candidate) => candidate.id === result.id)?.implementation_status,
    "done",
  );
});

test("finish review requires the reviewer name (guest identity is real)", async () => {
  const { finishDemoReview } = await store();
  const result = finishDemoReview({ assetId: "denie-mcdonald-v4", reviewerName: "  ", outcome: "approved" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /reviewer name/);
});

test("implementation transitions follow the ledger state machine", async () => {
  const { finishDemoReview, setDecisionImplementation, getDemoWorkspaceSnapshot } = await store();

  const result = finishDemoReview({
    assetId: "charles-drummond-v5",
    reviewerName: "Alex Rivera",
    outcome: "changes_requested",
  });
  assert.equal(result.ok, true);

  assert.equal(setDecisionImplementation(result.id, "wont_do").ok, true, "pending can be waived");
  assert.equal(setDecisionImplementation(result.id, "done").ok, false, "wont_do cannot complete");
  assert.equal(setDecisionImplementation(result.id, "pending").ok, true, "wont_do can reopen");
  assert.equal(setDecisionImplementation(result.id, "in_progress").ok, true);
  assert.equal(setDecisionImplementation(result.id, "done").ok, true);
  assert.equal(setDecisionImplementation(result.id, "pending").ok, false, "done is terminal");

  const decision = getDemoWorkspaceSnapshot().decisions.find((candidate) => candidate.id === result.id);
  assert.equal(decision?.implementation_status, "done");
});

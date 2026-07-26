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

test("seed carries a submitted request, an in_progress request, and its work order", async () => {
  const { getDemoWorkspaceSnapshot } = await store();
  const workspace = getDemoWorkspaceSnapshot();
  const cutdown = workspace.requests.find((request) => request.id === "request-ceo-cutdown");
  assert.equal(cutdown?.status, "submitted");
  assert.equal(cutdown?.kind, "social_cutdown");
  const captions = workspace.requests.find((request) => request.id === "request-denie-captions");
  assert.equal(captions?.status, "in_progress");
  assert.equal(captions?.work_order_id, "workorder-denie-captions");
  assert.ok(workspace.workOrders.some((order) => order.id === "workorder-denie-captions"));
  // Seed thread includes a team-only internal note.
  assert.ok(
    workspace.requestMessages.some(
      (message) => message.request_id === "request-ceo-cutdown" && message.visibility === "internal",
    ),
  );
});

test("submitDemoRequest validates, records, and links the source asset", async () => {
  const { submitDemoRequest, getDemoWorkspaceSnapshot } = await store();
  const invalid = submitDemoRequest({
    kind: "social_cutdown",
    title: "",
    priority: "standard",
    requestedDueDate: "soon",
    sourceAssetId: null,
    platform: null,
    durationSeconds: null,
    aspectRatios: [],
    assetReference: null,
    notes: "",
  });
  assert.equal(invalid.ok, false);

  const result = submitDemoRequest({
    kind: "social_cutdown",
    title: "Short vertical for the keynote",
    priority: "rush",
    requestedDueDate: "2026-08-01",
    sourceAssetId: "ica-ceo-hero-v1",
    platform: "instagram",
    durationSeconds: 30,
    aspectRatios: [],
    assetReference: null,
    notes: "Hook first.",
    requesterName: "Morgan Lee",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const request = getDemoWorkspaceSnapshot().requests.find((candidate) => candidate.id === result.id);
  assert.ok(request);
  assert.equal(request.status, "submitted");
  assert.equal(request.source_asset_title, "ICA CEO Hero Cut_v1");
  assert.equal(request.requester_name, "Morgan Lee");
});

test("acceptDemoRequest converts to a linked local-preview work order", async () => {
  const { acceptDemoRequest, getDemoWorkspaceSnapshot } = await store();
  const result = acceptDemoRequest("request-ceo-cutdown", { projectId: "ica" });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const workspace = getDemoWorkspaceSnapshot();
  const request = workspace.requests.find((candidate) => candidate.id === "request-ceo-cutdown");
  assert.equal(request?.status, "accepted");
  assert.equal(request?.work_order_id, result.id);

  const order = workspace.workOrders.find((candidate) => candidate.id === result.id);
  assert.ok(order);
  assert.equal(order.status, "local_preview");
  assert.equal(order.project_id, "ica");
  assert.deepEqual(
    order.deliverables.map((deliverable) => deliverable.aspectRatio),
    ["9:16", "1:1", "16:9"],
  );

  // Accepting twice is rejected.
  assert.equal(acceptDemoRequest("request-ceo-cutdown").ok, false);
});

test("declineDemoRequest requires a note and auto-triages submitted requests", async () => {
  const { declineDemoRequest, getDemoWorkspaceSnapshot } = await store();
  assert.equal(declineDemoRequest("request-ceo-cutdown", "   ").ok, false);

  const result = declineDemoRequest("request-ceo-cutdown", "Covered by the roadshow package.");
  assert.equal(result.ok, true);
  const request = getDemoWorkspaceSnapshot().requests.find(
    (candidate) => candidate.id === "request-ceo-cutdown",
  );
  assert.equal(request?.status, "declined");
  assert.equal(request?.decline_note, "Covered by the roadshow package.");

  // Declined is terminal.
  assert.equal(declineDemoRequest("request-ceo-cutdown", "again").ok, false);
});

test("advanceDemoRequest walks accepted → in_progress → delivered → closed only", async () => {
  const { advanceDemoRequest, acceptDemoRequest } = await store();
  // Cannot advance a submitted request.
  assert.equal(advanceDemoRequest("request-ceo-cutdown", "in_progress").ok, false);
  assert.equal(acceptDemoRequest("request-ceo-cutdown").ok, true);
  assert.equal(advanceDemoRequest("request-ceo-cutdown", "delivered").ok, false);
  assert.equal(advanceDemoRequest("request-ceo-cutdown", "in_progress").ok, true);
  assert.equal(advanceDemoRequest("request-ceo-cutdown", "delivered").ok, true);
  assert.equal(advanceDemoRequest("request-ceo-cutdown", "closed").ok, true);
  assert.equal(advanceDemoRequest("request-ceo-cutdown", "in_progress").ok, false);
});

test("addDemoRequestMessage forces client posts to the client-visible channel", async () => {
  const { addDemoRequestMessage, getDemoWorkspaceSnapshot } = await store();
  assert.equal(
    addDemoRequestMessage("request-ceo-cutdown", {
      authorRole: "team",
      visibility: "client",
      body: "",
    }).ok,
    false,
  );

  const internal = addDemoRequestMessage("request-ceo-cutdown", {
    authorRole: "team",
    visibility: "internal",
    body: "Check capacity before committing.",
  });
  assert.equal(internal.ok, true);

  // A client author asking for "internal" still lands client-visible.
  const clientPost = addDemoRequestMessage("request-ceo-cutdown", {
    authorRole: "client",
    visibility: "internal",
    body: "Thank you!",
  });
  assert.equal(clientPost.ok, true);
  if (!clientPost.ok) return;
  const message = getDemoWorkspaceSnapshot().requestMessages.find(
    (candidate) => candidate.id === clientPost.id,
  );
  assert.equal(message?.visibility, "client");
});

test("request state persists through restoreDemoWorkspace", async () => {
  const { acceptDemoRequest, getDemoWorkspaceSnapshot, restoreDemoWorkspace } = await store();
  assert.equal(acceptDemoRequest("request-ceo-cutdown", { projectId: "ica" }).ok, true);
  const serialized = JSON.stringify(getDemoWorkspaceSnapshot());
  const restored = restoreDemoWorkspace(serialized);
  const request = restored.requests.find((candidate) => candidate.id === "request-ceo-cutdown");
  assert.equal(request?.status, "accepted");
  assert.ok(request?.work_order_id);
  assert.ok(restored.workOrders.some((order) => order.id === request?.work_order_id));
});

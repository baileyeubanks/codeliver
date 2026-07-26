import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultRequestInput,
  kindRequiresPlatform,
  kindRequiresSourceAsset,
  REQUEST_KINDS,
  REQUEST_PRIORITIES,
  validateRequestInput,
  type ClientRequestInput,
} from "../lib/requests/model.ts";
import {
  canTransitionRequest,
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  transitionRequestStatus,
} from "../lib/requests/lifecycle.ts";
import { shapeWorkOrder } from "../lib/requests/work-order.ts";
import { filterQueueRows, queueRowsFrom, visibleRequestMessages } from "../lib/requests/views.ts";

function validInput(overrides: Partial<ClientRequestInput> = {}): ClientRequestInput {
  return {
    ...defaultRequestInput("edit"),
    title: "Trim the CEO hero",
    priority: "standard",
    requestedDueDate: "2026-08-01",
    sourceAssetId: "ica-ceo-hero-v1",
    ...overrides,
  };
}

/* ── Type system ───────────────────────────────────────────────────────── */

test("request type system exposes the seven founder-spec kinds", () => {
  assert.deepEqual(REQUEST_KINDS, [
    "new_project",
    "edit",
    "resize",
    "caption_update",
    "social_cutdown",
    "content_refresh",
    "asset_retrieval",
  ]);
  assert.deepEqual(REQUEST_PRIORITIES, ["rush", "standard", "flexible"]);
});

test("source-asset requirement follows the kind", () => {
  assert.equal(kindRequiresSourceAsset("new_project"), false);
  assert.equal(kindRequiresSourceAsset("asset_retrieval"), false);
  for (const kind of ["edit", "resize", "caption_update", "social_cutdown", "content_refresh"] as const) {
    assert.equal(kindRequiresSourceAsset(kind), true, kind);
  }
  assert.equal(kindRequiresPlatform("resize"), true);
  assert.equal(kindRequiresPlatform("social_cutdown"), true);
  assert.equal(kindRequiresPlatform("edit"), false);
});

/* ── Validation per kind ───────────────────────────────────────────────── */

test("a complete edit request validates and normalizes", () => {
  const result = validateRequestInput(validInput({ title: "  Trim it  ", notes: "  keep pace  " }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.title, "Trim it");
    assert.equal(result.value.notes, "keep pace");
  }
});

test("title, priority, and a real due date are always required", () => {
  const noTitle = validateRequestInput(validInput({ title: "   " }));
  assert.equal(noTitle.ok, false);
  if (!noTitle.ok) assert.ok(noTitle.errors.some((error) => /title/i.test(error)));

  const badDate = validateRequestInput(validInput({ requestedDueDate: "next friday" }));
  assert.equal(badDate.ok, false);

  const impossibleDate = validateRequestInput(validInput({ requestedDueDate: "2026-02-30" }));
  assert.equal(impossibleDate.ok, false);

  const badPriority = validateRequestInput(validInput({ priority: "urgent" as never }));
  assert.equal(badPriority.ok, false);
});

test("edit, caption_update and content_refresh require a source asset", () => {
  for (const kind of ["edit", "caption_update", "content_refresh"] as const) {
    const result = validateRequestInput(validInput({ kind, sourceAssetId: null }));
    assert.equal(result.ok, false, kind);
    if (!result.ok) assert.ok(result.errors.some((error) => /source asset/i.test(error)));
  }
});

test("resize requires platform and at least one known aspect ratio", () => {
  const noPlatform = validateRequestInput(
    validInput({ kind: "resize", platform: null, aspectRatios: ["9:16"] }),
  );
  assert.equal(noPlatform.ok, false);

  const noRatios = validateRequestInput(
    validInput({ kind: "resize", platform: "instagram", aspectRatios: [] }),
  );
  assert.equal(noRatios.ok, false);

  const badRatio = validateRequestInput(
    validInput({ kind: "resize", platform: "instagram", aspectRatios: ["21:9"] }),
  );
  assert.equal(badRatio.ok, false);

  const good = validateRequestInput(
    validInput({ kind: "resize", platform: "instagram", aspectRatios: ["9:16", "1:1"] }),
  );
  assert.equal(good.ok, true);
});

test("social_cutdown requires source asset, platform, and a positive duration", () => {
  const base = validInput({
    kind: "social_cutdown",
    sourceAssetId: "ica-ceo-hero-v1",
    platform: "instagram",
    durationSeconds: 30,
  });
  assert.equal(validateRequestInput(base).ok, true);

  assert.equal(validateRequestInput({ ...base, durationSeconds: null }).ok, false);
  assert.equal(validateRequestInput({ ...base, durationSeconds: 0 }).ok, false);
  assert.equal(validateRequestInput({ ...base, durationSeconds: -15 }).ok, false);
  assert.equal(validateRequestInput({ ...base, durationSeconds: Number.NaN }).ok, false);
  assert.equal(validateRequestInput({ ...base, platform: null }).ok, false);
  assert.equal(validateRequestInput({ ...base, sourceAssetId: null }).ok, false);
});

test("asset_retrieval requires a free-text reference instead of an asset id", () => {
  const missing = validateRequestInput(
    validInput({ kind: "asset_retrieval", sourceAssetId: null, assetReference: "  " }),
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.some((error) => /reference|describe/i.test(error)));

  const good = validateRequestInput(
    validInput({
      kind: "asset_retrieval",
      sourceAssetId: null,
      assetReference: "The roadshow sizzle reel from March",
    }),
  );
  assert.equal(good.ok, true);
});

test("new_project needs only the shared fields", () => {
  const result = validateRequestInput(
    validInput({ kind: "new_project", sourceAssetId: null, title: "Q4 brand anthem" }),
  );
  assert.equal(result.ok, true);
});

/* ── Lifecycle matrix ──────────────────────────────────────────────────── */

test("lifecycle exposes exactly the specced statuses", () => {
  assert.deepEqual(REQUEST_STATUSES, [
    "submitted",
    "triaged",
    "accepted",
    "declined",
    "in_progress",
    "delivered",
    "closed",
  ]);
});

test("every legal transition is accepted, every illegal one rejected", () => {
  for (const from of REQUEST_STATUSES) {
    for (const to of REQUEST_STATUSES) {
      const legal = (REQUEST_TRANSITIONS[from] as readonly string[]).includes(to);
      assert.equal(canTransitionRequest(from, to), legal, `${from} → ${to}`);
    }
  }
  assert.deepEqual(REQUEST_TRANSITIONS.declined, []);
  assert.deepEqual(REQUEST_TRANSITIONS.closed, []);
});

test("transitionRequestStatus walks the happy path", () => {
  let request = { status: "submitted" as const, decline_note: null };
  for (const to of ["triaged", "accepted", "in_progress", "delivered", "closed"] as const) {
    const result = transitionRequestStatus(request, to);
    assert.equal(result.ok, true, `→ ${to}`);
    if (result.ok) request = result.value;
  }
  assert.equal(request.status, "closed");
});

test("declining requires a note and records it", () => {
  const triaged = { status: "triaged" as const, decline_note: null };
  const withoutNote = transitionRequestStatus(triaged, "declined");
  assert.equal(withoutNote.ok, false);

  const blankNote = transitionRequestStatus(triaged, "declined", { note: "   " });
  assert.equal(blankNote.ok, false);

  const withNote = transitionRequestStatus(triaged, "declined", { note: "Out of scope this quarter." });
  assert.equal(withNote.ok, true);
  if (withNote.ok) {
    assert.equal(withNote.value.status, "declined");
    assert.equal(withNote.value.decline_note, "Out of scope this quarter.");
  }
});

test("illegal jumps are rejected with a reason", () => {
  const request = { status: "submitted" as const, decline_note: null };
  assert.equal(transitionRequestStatus(request, "in_progress").ok, false);
  assert.equal(transitionRequestStatus(request, "closed").ok, false);
  const declined = transitionRequestStatus(
    { status: "triaged" as const, decline_note: null },
    "declined",
    { note: "No capacity." },
  );
  assert.equal(declined.ok, true);
  if (declined.ok) assert.equal(transitionRequestStatus(declined.value, "accepted").ok, false);
});

/* ── Work-order shaping ────────────────────────────────────────────────── */

test("social_cutdown scopes 9:16 + 1:1 + 16:9 variants of the source asset", () => {
  const order = shapeWorkOrder({
    id: "req-1",
    kind: "social_cutdown",
    title: "CEO hero cutdown",
    priority: "rush",
    requestedDueDate: "2026-08-01",
    sourceAssetId: "ica-ceo-hero-v1",
    sourceAssetTitle: "ICA CEO Hero Cut_v1",
    platform: "instagram",
    durationSeconds: 30,
    aspectRatios: [],
    assetReference: null,
    notes: "",
  });
  assert.equal(order.deliverables.length, 3);
  assert.deepEqual(
    order.deliverables.map((deliverable) => deliverable.aspectRatio),
    ["9:16", "1:1", "16:9"],
  );
  for (const deliverable of order.deliverables) {
    assert.equal(deliverable.sourceAssetId, "ica-ceo-hero-v1");
    assert.equal(deliverable.platform, "instagram");
    assert.equal(deliverable.durationSeconds, 30);
    assert.match(deliverable.title, /ICA CEO Hero Cut_v1/);
  }
  assert.equal(order.priority, "rush");
  assert.equal(order.dueDate, "2026-08-01");
  assert.equal(order.projectId, null);
});

test("resize scopes one deliverable per requested aspect ratio", () => {
  const order = shapeWorkOrder({
    id: "req-2",
    kind: "resize",
    title: "Resize the sizzle",
    priority: "standard",
    requestedDueDate: "2026-08-03",
    sourceAssetId: "asset-9",
    sourceAssetTitle: "Sizzle Reel",
    platform: "linkedin",
    durationSeconds: null,
    aspectRatios: ["4:5", "16:9"],
    assetReference: null,
    notes: "",
  });
  assert.deepEqual(
    order.deliverables.map((deliverable) => deliverable.aspectRatio),
    ["4:5", "16:9"],
  );
  assert.equal(order.deliverables[0].sourceAssetId, "asset-9");
});

test("edit, caption_update and content_refresh scope a single asset deliverable", () => {
  for (const kind of ["edit", "caption_update", "content_refresh"] as const) {
    const order = shapeWorkOrder({
      id: "req-3",
      kind,
      title: "Work on the hero",
      priority: "flexible",
      requestedDueDate: "2026-08-05",
      sourceAssetId: "asset-1",
      sourceAssetTitle: "Hero Cut",
      platform: null,
      durationSeconds: null,
      aspectRatios: [],
      assetReference: null,
      notes: "",
    });
    assert.equal(order.deliverables.length, 1, kind);
    assert.equal(order.deliverables[0].sourceAssetId, "asset-1");
    assert.match(order.deliverables[0].title, /Hero Cut/);
  }
});

test("asset_retrieval scopes a locate-and-deliver item from the free-text reference", () => {
  const order = shapeWorkOrder({
    id: "req-4",
    kind: "asset_retrieval",
    title: "Find the March sizzle",
    priority: "standard",
    requestedDueDate: "2026-08-02",
    sourceAssetId: null,
    sourceAssetTitle: null,
    platform: null,
    durationSeconds: null,
    aspectRatios: [],
    assetReference: "March sizzle reel",
    notes: "",
  });
  assert.equal(order.deliverables.length, 1);
  assert.match(order.deliverables[0].title, /March sizzle reel/);
  assert.equal(order.deliverables[0].sourceAssetId, null);
});

test("new_project scopes a kickoff deliverable and honors the conversion target", () => {
  const order = shapeWorkOrder(
    {
      id: "req-5",
      kind: "new_project",
      title: "Q4 brand anthem",
      priority: "standard",
      requestedDueDate: "2026-09-01",
      sourceAssetId: null,
      sourceAssetTitle: null,
      platform: null,
      durationSeconds: null,
      aspectRatios: [],
      assetReference: null,
      notes: "Anthem film plus cutdowns",
    },
    { projectId: "ica" },
  );
  assert.equal(order.deliverables.length, 1);
  assert.match(order.deliverables[0].title, /Q4 brand anthem/);
  assert.equal(order.projectId, "ica");
  assert.match(order.scopeNote, /brand anthem/i);
});

/* ── Queue views + message visibility ──────────────────────────────────── */

test("internal notes never surface to the client audience", () => {
  const messages = [
    { id: "m1", visibility: "client" as const, body: "Thanks!" },
    { id: "m2", visibility: "internal" as const, body: "Rush fee applies." },
  ];
  assert.deepEqual(
    visibleRequestMessages(messages, "client").map((message) => message.id),
    ["m1"],
  );
  assert.deepEqual(
    visibleRequestMessages(messages, "team").map((message) => message.id),
    ["m1", "m2"],
  );
});

test("library cutdown requests merge into the queue as submitted intake rows", () => {
  const rows = queueRowsFrom({
    requests: [
      {
        id: "req-a",
        kind: "edit" as const,
        title: "Trim the hero",
        priority: "rush" as const,
        status: "triaged" as const,
        requester_name: "Morgan Lee",
        requested_due_date: "2026-08-01",
        platform: null,
        created_at: "2026-07-15T10:00:00.000Z",
      },
    ],
    libraryCutdowns: [
      {
        id: "cutdown-b",
        asset_id: "ica-roadshow-final",
        asset_title: "ICA_ROADSHOW_x_FINAL",
        platform: "instagram",
        duration_seconds: 30,
        note: "",
        status: "recorded" as const,
        created_at: "2026-07-15T12:00:00.000Z",
      },
    ],
  });
  assert.equal(rows.length, 2);
  const libraryRow = rows.find((row) => row.origin === "library_cutdown");
  assert.ok(libraryRow);
  assert.equal(libraryRow.kind, "social_cutdown");
  assert.equal(libraryRow.status, "submitted");
  assert.match(libraryRow.title, /ICA_ROADSHOW_x_FINAL/);
  // Newest first.
  assert.equal(rows[0].id, "cutdown-b");
});

test("queue rows filter by status, kind, and priority", () => {
  const rows = queueRowsFrom({
    requests: [
      {
        id: "req-a",
        kind: "edit" as const,
        title: "A",
        priority: "rush" as const,
        status: "submitted" as const,
        requester_name: "X",
        requested_due_date: "2026-08-01",
        platform: null,
        created_at: "2026-07-15T10:00:00.000Z",
      },
      {
        id: "req-b",
        kind: "resize" as const,
        title: "B",
        priority: "standard" as const,
        status: "accepted" as const,
        requester_name: "Y",
        requested_due_date: "2026-08-02",
        platform: "instagram",
        created_at: "2026-07-15T11:00:00.000Z",
      },
    ],
    libraryCutdowns: [],
  });
  assert.deepEqual(filterQueueRows(rows, { status: "submitted", kind: "all", priority: "all" }).map((row) => row.id), ["req-a"]);
  assert.deepEqual(filterQueueRows(rows, { status: "all", kind: "resize", priority: "all" }).map((row) => row.id), ["req-b"]);
  assert.deepEqual(filterQueueRows(rows, { status: "all", kind: "all", priority: "rush" }).map((row) => row.id), ["req-a"]);
  assert.equal(filterQueueRows(rows, { status: "declined", kind: "all", priority: "all" }).length, 0);
});

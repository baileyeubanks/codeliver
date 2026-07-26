import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VIEWPORT_ZOOM,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  clampZoom,
  panViewport,
  rotationForId,
  screenToWorld,
  snapPointToGrid,
  snapToGrid,
  worldToScreen,
  zoomViewportAt,
  type WhiteboardViewport,
} from "../lib/whiteboard/geometry.ts";
import {
  PHASE_CARD_GAP,
  PHASE_CARD_WIDTH,
  WHITEBOARD_PHASES,
  WHITEBOARD_PHASE_IDS,
  buildPhaseFlow,
  liveEdges,
  mapStageToPhase,
  type WhiteboardBoardContent,
} from "../lib/whiteboard/model.ts";
import {
  WHITEBOARD_TEMPLATES,
  applyTemplate,
  undoTemplateApplication,
} from "../lib/whiteboard/templates.ts";
import {
  arrowHeadPoints,
  connectorArrowHead,
  elbowConnectorPath,
} from "../lib/whiteboard/connectors.ts";

/* ------------------------------ viewport math ------------------------------ */

test("screenToWorld and worldToScreen round-trip", () => {
  const viewport: WhiteboardViewport = { originX: 120, originY: -40, zoom: 1.5 };
  const world = screenToWorld(viewport, { x: 300, y: 210 });
  const screen = worldToScreen(viewport, world);
  assert.ok(Math.abs(screen.x - 300) < 1e-9);
  assert.ok(Math.abs(screen.y - 210) < 1e-9);
});

test("panViewport translates the origin in world units, scaled by zoom", () => {
  const viewport: WhiteboardViewport = { originX: 100, originY: 50, zoom: 2 };
  const panned = panViewport(viewport, 40, -20);
  // Dragging right by 40 screen px at 2x moves the origin 20 world units left.
  assert.equal(panned.originX, 80);
  assert.equal(panned.originY, 60);
  assert.equal(panned.zoom, 2);
});

test("zoomViewportAt keeps the world point under the cursor anchored", () => {
  const viewport: WhiteboardViewport = { originX: 10, originY: 20, zoom: 1 };
  const anchor = { x: 400, y: 300 };
  const before = screenToWorld(viewport, anchor);

  const zoomed = zoomViewportAt(viewport, anchor, 1.25);
  assert.equal(zoomed.zoom, 1.25);
  const after = screenToWorld(zoomed, anchor);
  assert.ok(Math.abs(after.x - before.x) < 1e-9);
  assert.ok(Math.abs(after.y - before.y) < 1e-9);

  // Zooming back out restores the original screen mapping of the anchor.
  const restored = zoomViewportAt(zoomed, anchor, 1 / 1.25);
  const roundTrip = worldToScreen(restored, before);
  assert.ok(Math.abs(roundTrip.x - anchor.x) < 1e-6);
  assert.ok(Math.abs(roundTrip.y - anchor.y) < 1e-6);
});

test("clampZoom enforces the zoom range and survives bad input", () => {
  assert.equal(clampZoom(0.01), MIN_VIEWPORT_ZOOM);
  assert.equal(clampZoom(99), MAX_VIEWPORT_ZOOM);
  assert.equal(clampZoom(1.2), 1.2);
  assert.equal(clampZoom(Number.NaN), DEFAULT_VIEWPORT_ZOOM);

  const viewport: WhiteboardViewport = { originX: 0, originY: 0, zoom: MAX_VIEWPORT_ZOOM };
  const clamped = zoomViewportAt(viewport, { x: 10, y: 10 }, 2);
  assert.equal(clamped.zoom, MAX_VIEWPORT_ZOOM);
});

/* -------------------------------- grid snap -------------------------------- */

test("snapToGrid snaps to the nearest grid multiple", () => {
  assert.equal(snapToGrid(0), 0);
  assert.equal(snapToGrid(7), 0);
  assert.equal(snapToGrid(8), 16);
  assert.equal(snapToGrid(23), 16);
  assert.equal(snapToGrid(-9), -16);
  assert.equal(snapToGrid(20, 10), 20);
  assert.equal(snapToGrid(Number.NaN), 0);
});

test("snapPointToGrid snaps both axes independently", () => {
  assert.deepEqual(snapPointToGrid({ x: 9, y: 31 }), { x: 16, y: 32 });
});

/* ------------------------------ hand-drawn tilt ----------------------------- */

test("rotationForId is deterministic, bounded, and varied", () => {
  assert.equal(rotationForId("card-a"), rotationForId("card-a"));
  const tilts = new Set(
    ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"].map((id) => rotationForId(id)),
  );
  assert.ok(tilts.size > 1, "different ids should get different tilts");
  for (const tilt of tilts) {
    assert.ok(Math.abs(tilt) <= 1.6, `tilt ${tilt} within ±1.6°`);
  }
});

/* ------------------------------ stage → phase ------------------------------ */

test("mapStageToPhase maps every lifecycle stage onto the five phases", () => {
  assert.equal(mapStageToPhase("inquiry"), "strategy");
  assert.equal(mapStageToPhase("intake"), "strategy");
  assert.equal(mapStageToPhase("development"), "strategy");
  assert.equal(mapStageToPhase("preproduction"), "preproduction");
  assert.equal(mapStageToPhase("production"), "production");
  assert.equal(mapStageToPhase("post"), "post");
  // The ICA demo project sits at "review" — truthfully inside Post.
  assert.equal(mapStageToPhase("review"), "post");
  assert.equal(mapStageToPhase("delivery"), "delivery");
  assert.equal(mapStageToPhase("archived"), "delivery");
  assert.equal(mapStageToPhase("unexpected"), "strategy");
});

/* -------------------------------- phase flow -------------------------------- */

test("buildPhaseFlow lays out five cards in order with a truthful current phase", () => {
  const flow = buildPhaseFlow("review");
  assert.equal(flow.length, 5);
  assert.deepEqual(
    flow.map((card) => card.phase.id),
    [...WHITEBOARD_PHASE_IDS],
  );

  flow.forEach((card, index) => {
    assert.equal(card.x, 64 + index * (PHASE_CARD_WIDTH + PHASE_CARD_GAP));
    assert.equal(card.y, flow[0]?.y);
  });

  assert.equal(flow.find((card) => card.isCurrent)?.phase.id, "post");
  assert.deepEqual(
    flow.filter((card) => card.isComplete).map((card) => card.phase.id),
    ["strategy", "preproduction", "production"],
  );
  assert.equal(flow.at(-1)?.isComplete, false);
});

test("buildPhaseFlow for a delivery-stage project marks all earlier phases complete", () => {
  const flow = buildPhaseFlow("delivery");
  assert.equal(flow.filter((card) => card.isComplete).length, WHITEBOARD_PHASES.length - 1);
  assert.equal(flow.at(-1)?.isCurrent, true);
});

/* --------------------------------- templates -------------------------------- */

function sequentialIds() {
  let counter = 0;
  return (prefix: string) => `${prefix}-${(counter += 1)}`;
}

test("applyTemplate appends grid-snapped cards and edges for both templates", () => {
  assert.equal(WHITEBOARD_TEMPLATES.length, 2);
  const empty: WhiteboardBoardContent = { nodes: [], edges: [] };

  for (const template of WHITEBOARD_TEMPLATES) {
    const applied = applyTemplate(empty, template.id, { x: 100, y: 300 }, sequentialIds());
    assert.ok(applied.nodes.length >= 5, `${template.id} lays out a full arrangement`);
    assert.equal(applied.edges.length, applied.nodes.length - 1);

    for (const node of applied.nodes) {
      assert.equal(node.kind, "card");
      assert.equal(node.x % 16, 0);
      assert.equal(node.y % 16, 0);
      assert.ok(WHITEBOARD_PHASE_IDS.includes(node.phase));
    }
    for (const edge of applied.edges) {
      assert.ok(applied.nodes.some((node) => node.id === edge.from));
      assert.ok(applied.nodes.some((node) => node.id === edge.to));
    }
  }
});

test("applyTemplate preserves existing content and mints unique ids", () => {
  const existing: WhiteboardBoardContent = {
    nodes: [{
      id: "sticky-1",
      kind: "sticky",
      phase: "post",
      title: "",
      body: "Existing note",
      x: 32,
      y: 480,
      width: 176,
      height: 144,
    }],
    edges: [],
  };
  const applied = applyTemplate(existing, "brand-film", { x: 64, y: 640 }, sequentialIds());
  assert.equal(applied.nodes[0]?.id, "sticky-1");
  assert.equal(applied.nodes.length, 6);
  const ids = new Set([...applied.nodes.map((node) => node.id), ...applied.edges.map((e) => e.id)]);
  assert.equal(ids.size, applied.nodes.length + applied.edges.length);
});

test("undoTemplateApplication restores the pre-apply snapshot exactly", () => {
  const empty: WhiteboardBoardContent = { nodes: [], edges: [] };
  const applied = applyTemplate(empty, "social-campaign", { x: 0, y: 400 }, sequentialIds());
  assert.ok(applied.nodes.length > 0);

  const undone = undoTemplateApplication(empty);
  assert.deepEqual(undone, { nodes: [], edges: [] });
  // The snapshot is not aliased — mutating the undo result can't corrupt it.
  undone.nodes.push({
    id: "x",
    kind: "sticky",
    phase: "strategy",
    title: "",
    body: "",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
  assert.equal(empty.nodes.length, 0);
});

/* --------------------------------- connectors ------------------------------- */

test("elbowConnectorPath routes rightward with a midpoint jog", () => {
  const from = { x: 0, y: 0, width: 100, height: 50 };
  const to = { x: 300, y: 100, width: 100, height: 50 };
  const path = elbowConnectorPath(from, to);
  assert.equal(
    path,
    "M 100 25 L 200 25 L 200 125 L 300 125",
  );
});

test("elbowConnectorPath routes leftward when the target sits left", () => {
  const from = { x: 300, y: 0, width: 100, height: 50 };
  const to = { x: 0, y: 100, width: 100, height: 50 };
  const path = elbowConnectorPath(from, to);
  assert.equal(
    path,
    "M 300 25 L 200 25 L 200 125 L 100 125",
  );
});

test("elbowConnectorPath falls back to a symmetric elbow for overlapping cards", () => {
  const from = { x: 0, y: 0, width: 100, height: 50 };
  const to = { x: 110, y: 200, width: 100, height: 50 };
  const path = elbowConnectorPath(from, to);
  assert.equal(path, "M 100 25 L 105 25 L 105 225 L 110 225");
});

test("connectorArrowHead points into the target edge", () => {
  const from = { x: 0, y: 0, width: 100, height: 50 };
  const to = { x: 300, y: 100, width: 100, height: 50 };
  const head = connectorArrowHead(from, to);
  assert.deepEqual(head.tip, { x: 300, y: 125 });
  assert.equal(head.left.x, 288);
  assert.equal(head.left.y, 120.5);
  assert.equal(head.right.y, 129.5);
  assert.equal(arrowHeadPoints(head), "300,125 288,120.5 288,129.5");

  const backward = connectorArrowHead(to, from);
  assert.deepEqual(backward.tip, { x: 100, y: 25 });
  assert.equal(backward.left.x, 112);
});

test("liveEdges drops edges whose endpoints no longer exist", () => {
  const content: WhiteboardBoardContent = {
    nodes: [{
      id: "a",
      kind: "card",
      phase: "strategy",
      title: "A",
      body: "",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }],
    edges: [
      { id: "e1", from: "a", to: "gone" },
      { id: "e2", from: "gone", to: "a" },
    ],
  };
  assert.equal(liveEdges(content).length, 0);
});

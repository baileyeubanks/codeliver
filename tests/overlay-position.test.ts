import assert from "node:assert/strict";
import test from "node:test";
import { computeOverlayPosition } from "../components/overlay/overlay-position.ts";

const VIEWPORT = { width: 1440, height: 900 };

test("opens below the anchor, aligned to its end edge, when there is room", () => {
  const position = computeOverlayPosition({
    anchor: { top: 40, left: 1200, width: 38, height: 38 },
    overlay: { width: 280, height: 200 },
    viewport: VIEWPORT,
    align: "end",
    offset: 10,
  });
  assert.equal(position.side, "bottom");
  assert.equal(position.top, 88); // 40 + 38 + 10
  assert.equal(position.left, 958); // 1200 + 38 - 280
});

test("flips above the anchor when the overlay would clip the viewport bottom", () => {
  const position = computeOverlayPosition({
    anchor: { top: 850, left: 1300, width: 28, height: 28 },
    overlay: { width: 190, height: 160 },
    viewport: VIEWPORT,
    align: "end",
    offset: 6,
    padding: 8,
  });
  assert.equal(position.side, "top");
  assert.equal(position.top, 684); // 850 - 160 - 6
  assert.ok(position.top + 160 <= VIEWPORT.height - 8);
});

test("keeps the preferred side when the flip side has even less room", () => {
  const position = computeOverlayPosition({
    anchor: { top: 20, left: 100, width: 40, height: 20 },
    overlay: { width: 200, height: 300 },
    viewport: { width: 1440, height: 200 },
    side: "bottom",
    align: "start",
    padding: 8,
  });
  // Neither side fits a 300px overlay in a 200px viewport; below has more
  // room (140 vs 20), so it stays bottom and clamps to the padding edge.
  assert.equal(position.side, "bottom");
  assert.equal(position.top, 8); // clamped to the padding edge (overflow is unavoidable)
});

test("shifts horizontally into the viewport when the anchor hugs the left edge", () => {
  const position = computeOverlayPosition({
    anchor: { top: 40, left: 4, width: 38, height: 38 },
    overlay: { width: 280, height: 200 },
    viewport: VIEWPORT,
    align: "end",
    padding: 8,
  });
  assert.equal(position.left, 8); // clamped to viewport padding instead of -234
});

test("shifts horizontally into the viewport when the anchor hugs the right edge", () => {
  const position = computeOverlayPosition({
    anchor: { top: 40, left: 1420, width: 38, height: 38 },
    overlay: { width: 120, height: 100 },
    viewport: VIEWPORT,
    align: "start",
    padding: 8,
  });
  assert.equal(position.left, VIEWPORT.width - 120 - 8);
});

test("clamps an anchor that is already outside the viewport back inside", () => {
  const position = computeOverlayPosition({
    anchor: { top: 40, left: -140, width: 100, height: 38 },
    overlay: { width: 280, height: 200 },
    viewport: VIEWPORT,
    align: "start",
    padding: 8,
  });
  assert.ok(position.left >= 8);
  assert.ok(position.left + 280 <= VIEWPORT.width - 8);
});

test("flips a top-preferred overlay downward when there is no room above", () => {
  const position = computeOverlayPosition({
    anchor: { top: 10, left: 600, width: 40, height: 30 },
    overlay: { width: 120, height: 200 },
    viewport: VIEWPORT,
    side: "top",
    align: "start",
    offset: 8,
    padding: 8,
  });
  assert.equal(position.side, "bottom");
  assert.equal(position.top, 48); // 10 + 30 + 8
});

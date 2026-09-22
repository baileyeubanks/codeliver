import assert from "node:assert/strict";
import test from "node:test";
import { clampCalloutDrag, leaderEndpoint } from "../lib/review/callout-geometry.ts";

test("leader ends on the nearest card edge while the frame point stays fixed", () => {
  assert.deepEqual(leaderEndpoint({ x: 100, y: 100 }, { left: 140, top: 80, right: 320, bottom: 220 }), { x: 40, y: 0 });
  assert.deepEqual(leaderEndpoint({ x: 200, y: 50 }, { left: 140, top: 80, right: 320, bottom: 220 }), { x: 0, y: 30 });
});

test("card drag cannot carry the card outside the viewport", () => {
  assert.deepEqual(
    clampCalloutDrag({ x: 0, y: 0 }, { x: -300, y: 500 }, { left: 16, top: 40, right: 240, bottom: 180 }, { width: 400, height: 300 }),
    { x: -8, y: 112 },
  );
});

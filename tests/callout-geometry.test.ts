import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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


test("callout drag handles claim touch input before the page can scroll", () => {
  const styles = readFileSync(resolve(import.meta.dirname, "../app/globals.css"), "utf8");
  assert.match(styles, /\.review-inline-comment-drag\s*\{[^}]*touch-action\s*:\s*none/);
  assert.match(styles, /\.review-anchored-comment-drag\s*\{[^}]*touch-action\s*:\s*none/);
});

test("existing desktop card moves inside a narrowed phone viewport without moving its frame anchor", () => {
  assert.deepEqual(clampCalloutDrag({ x: 0, y: 0 }, { x: 0, y: 0 },
    { left: 195, top: 286, right: 525, bottom: 723 }, { width: 390, height: 843 }),
  { x: -143, y: 0 });
});

test("keyboard and panned visual viewport keep the card header reachable", () => {
  assert.deepEqual(clampCalloutDrag({ x: 0, y: 0 }, { x: 0, y: 0 },
    { left: 30, top: 286, right: 360, bottom: 723 }, { width: 390, height: 300, top: 100 }),
  { x: 0, y: -178 });
});

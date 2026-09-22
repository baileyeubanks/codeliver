import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_FREEHAND_COORDINATES,
  MAX_REVIEW_ANNOTATIONS,
  MIN_STROKE_SPAN,
  REPLAY_TOLERANCE_SECONDS,
  annotationPath,
  arrowHeadPoints,
  beginStroke,
  canAppendReviewAnnotation,
  clamp01,
  endStroke,
  isNearTimecode,
  moveStroke,
  normalizePoint,
  prepareReviewAnnotations,
} from "../lib/review/annotation.ts";
import type { AnnotationData } from "../lib/types/codeliver.ts";

test("clamp01 confines values to the normalized range", () => {
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(-0.2), 0);
  assert.equal(clamp01(1.7), 1);
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(1), 1);
  assert.equal(clamp01(Number.NaN), 0);
});

test("normalizePoint maps local pixels into 0-1 and clamps overflow", () => {
  assert.deepEqual(normalizePoint(50, 25, 100, 100), { x: 0.5, y: 0.25 });
  assert.deepEqual(normalizePoint(150, -10, 100, 100), { x: 1, y: 0 });
  assert.deepEqual(normalizePoint(0, 0, 100, 100), { x: 0, y: 0 });
});

test("normalizePoint refuses a zero-sized surface", () => {
  assert.equal(normalizePoint(10, 10, 0, 100), null);
  assert.equal(normalizePoint(10, 10, 100, 0), null);
  assert.equal(normalizePoint(10, 10, -5, 100), null);
});

test("beginStroke seeds each tool shape at the anchor point", () => {
  assert.deepEqual(beginStroke("arrow", { x: 0.2, y: 0.3 }), {
    kind: "arrow",
    points: [0.2, 0.3, 0.2, 0.3],
  });
  assert.deepEqual(beginStroke("rectangle", { x: 0.2, y: 0.3 }), {
    kind: "rectangle",
    x: 0.2,
    y: 0.3,
    width: 0,
    height: 0,
  });
  assert.deepEqual(beginStroke("freehand", { x: 0.2, y: 0.3 }), {
    kind: "freehand",
    points: [0.2, 0.3],
  });
});

test("moveStroke tracks the drag for arrow and rectangle, appends for freehand", () => {
  const arrow = moveStroke(beginStroke("arrow", { x: 0.1, y: 0.1 }), { x: 0.6, y: 0.4 });
  assert.deepEqual(arrow, { kind: "arrow", points: [0.1, 0.1, 0.6, 0.4] });

  const rect = moveStroke(beginStroke("rectangle", { x: 0.5, y: 0.5 }), { x: 0.25, y: 0.75 });
  assert.deepEqual(rect, { kind: "rectangle", x: 0.5, y: 0.5, width: -0.25, height: 0.25 });

  const freehand = moveStroke(beginStroke("freehand", { x: 0.1, y: 0.1 }), { x: 0.2, y: 0.2 });
  assert.deepEqual(freehand, { kind: "freehand", points: [0.1, 0.1, 0.2, 0.2] });
});

test("endStroke rejects empty and degenerate strokes", () => {
  // Freehand with a single point never drew anything.
  assert.equal(endStroke(beginStroke("freehand", { x: 0.5, y: 0.5 })), null);
  // Freehand whose whole path is shorter than the minimum span is a mis-tap.
  const scribble = moveStroke(beginStroke("freehand", { x: 0.5, y: 0.5 }), {
    x: 0.5 + MIN_STROKE_SPAN / 4,
    y: 0.5,
  });
  assert.equal(endStroke(scribble), null);
  // Zero-area rectangle.
  assert.equal(endStroke(beginStroke("rectangle", { x: 0.5, y: 0.5 })), null);
  const thinRect = moveStroke(beginStroke("rectangle", { x: 0.5, y: 0.5 }), {
    x: 0.9,
    y: 0.5 + MIN_STROKE_SPAN / 4,
  });
  assert.equal(endStroke(thinRect), null);
  // Arrow with no reach.
  assert.equal(endStroke(beginStroke("arrow", { x: 0.5, y: 0.5 })), null);
});

test("endStroke normalizes a rectangle dragged up-left into positive size", () => {
  const rect = moveStroke(beginStroke("rectangle", { x: 0.75, y: 0.75 }), { x: 0.25, y: 0.25 });
  assert.deepEqual(endStroke(rect), {
    kind: "rectangle",
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
});

test("endStroke keeps valid arrow and freehand strokes", () => {
  const arrow = moveStroke(beginStroke("arrow", { x: 0.1, y: 0.1 }), { x: 0.5, y: 0.5 });
  assert.deepEqual(endStroke(arrow), { kind: "arrow", points: [0.1, 0.1, 0.5, 0.5] });

  let freehand = beginStroke("freehand", { x: 0.1, y: 0.1 });
  freehand = moveStroke(freehand, { x: 0.3, y: 0.1 });
  freehand = moveStroke(freehand, { x: 0.3, y: 0.4 });
  assert.deepEqual(endStroke(freehand), {
    kind: "freehand",
    points: [0.1, 0.1, 0.3, 0.1, 0.3, 0.4],
  });
});

test("ordinary long freehand input stays within the persistence limit without flattening its path", () => {
  const sampleCount = 420;
  let stroke: AnnotationData = beginStroke("freehand", { x: 0, y: 0.5 });

  for (let index = 1; index < sampleCount; index += 1) {
    const x = index / (sampleCount - 1);
    const y = 0.5 + Math.sin(x * Math.PI * 4) * 0.3;
    stroke = moveStroke(stroke, { x, y });
    assert.equal(stroke.kind, "freehand");
    assert.ok(
      stroke.points.length <= MAX_FREEHAND_COORDINATES,
      `sample ${index} grew to ${stroke.points.length} coordinates`,
    );
  }

  const finished = endStroke(stroke);
  assert.ok(finished && finished.kind === "freehand");
  assert.ok(finished.points.length <= MAX_FREEHAND_COORDINATES);
  assert.deepEqual(finished.points.slice(0, 2), [0, 0.5]);
  assert.equal(finished.points.at(-2), 1);
  assert.ok(Math.abs((finished.points.at(-1) ?? 0) - 0.5) < 1e-12);

  const yCoordinates = finished.points.filter((_, index) => index % 2 === 1);
  assert.ok(Math.max(...yCoordinates) > 0.79, "upper turns remain visible");
  assert.ok(Math.min(...yCoordinates) < 0.21, "lower turns remain visible");
});

test("review annotation preparation rejects an extra stroke before transport", () => {
  const strokes: AnnotationData[] = Array.from(
    { length: MAX_REVIEW_ANNOTATIONS },
    (_, index) => ({
      kind: "arrow",
      points: [0, 0, (index + 1) / MAX_REVIEW_ANNOTATIONS, 1],
    }),
  );

  assert.equal(canAppendReviewAnnotation(strokes.length - 1), true);
  assert.equal(canAppendReviewAnnotation(strokes.length), false);

  const accepted = prepareReviewAnnotations(strokes);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.ok ? accepted.annotations.length : 0, MAX_REVIEW_ANNOTATIONS);

  assert.deepEqual(
    prepareReviewAnnotations([...strokes, strokes[0]]),
    { ok: false, reason: "too_many_strokes" },
  );
});

test("arrowHeadPoints returns two symmetric barbs behind the tip", () => {
  const [left, right] = arrowHeadPoints(0, 0, 1, 0, 0.1);
  // Tip at (1, 0) pointing along +x: barbs sit behind the tip and mirror in y.
  assert.ok(left.x < 1 && right.x < 1);
  assert.ok(Math.abs(left.y + right.y) < 1e-9, `expected symmetric y, got ${left.y} / ${right.y}`);
  assert.ok(Math.abs(left.y) > 0);
  // Barb endpoints sit at the requested head length from the tip.
  const dist = (p: { x: number; y: number }) => Math.hypot(p.x - 1, p.y - 0);
  assert.ok(Math.abs(dist(left) - 0.1) < 1e-9);
  assert.ok(Math.abs(dist(right) - 0.1) < 1e-9);
});

test("annotationPath builds SVG paths in normalized space", () => {
  const freehand = annotationPath({ kind: "freehand", points: [0.1, 0.1, 0.3, 0.1, 0.3, 0.4] });
  assert.match(freehand, /^M 0\.1 0\.1 L 0\.3 0\.1 L 0\.3 0\.4$/);

  const rect = annotationPath({ kind: "rectangle", x: 0.2, y: 0.3, width: 0.4, height: 0.1 });
  assert.equal(rect, "M 0.2 0.3 h 0.4 v 0.1 h -0.4 Z");

  const arrow = annotationPath({ kind: "arrow", points: [0.1, 0.1, 0.5, 0.5] });
  // Shaft plus two head barbs → three move/line pairs.
  assert.equal(arrow.split("M ").length - 1, 3);
  assert.match(arrow, /^M 0\.1 0\.1 L 0\.5 0\.5 /);
});

test("annotationPath guards empty and non-path shapes", () => {
  assert.equal(annotationPath({ kind: "freehand", points: [] }), "");
  assert.equal(annotationPath({ kind: "freehand", points: [0.5] }), "");
  assert.equal(annotationPath({ kind: "pin", x: 0.5, y: 0.5 }), "");
  assert.equal(annotationPath({ kind: "text", x: 0.5, y: 0.5, text: "hi" }), "");
  assert.equal(annotationPath({ kind: "arrow", points: [0.5, 0.5, 0.5, 0.5] }), "");
});

test("isNearTimecode gates replay to the tolerance window", () => {
  assert.equal(REPLAY_TOLERANCE_SECONDS, 0.5);
  assert.equal(isNearTimecode(2, 2.4), true);
  assert.equal(isNearTimecode(2, 2.5), true);
  assert.equal(isNearTimecode(2, 2.6), false);
  assert.equal(isNearTimecode(2, 1.5), true);
  assert.equal(isNearTimecode(null, 2), false);
  assert.equal(isNearTimecode(2, 2.15, 0.1), false);
  assert.equal(isNearTimecode(2, 2.05, 0.1), true);
});

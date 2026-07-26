import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_PLAYBACK_RATES,
  buildCommentChapters,
  isLoopClosed,
  loopWrapTarget,
  nextLoopRegion,
  nextShuttleRate,
  resolveReviewFrameRate,
  stepFrames,
} from "../lib/review/frame-review.ts";

test("frame steps move exactly 1/fps and clamp to the media range", () => {
  assert.equal(stepFrames(2, 1, 24, 5), 2 + 1 / 24);
  assert.equal(stepFrames(2, -1, 24, 5), 2 - 1 / 24);
  assert.equal(stepFrames(2, 10, 24, 5), 2 + 10 / 24);
  assert.equal(stepFrames(0.01, -1, 24, 5), 0);
  assert.equal(stepFrames(4.99, 1, 24, 5), 5);
  // Unknown duration still steps (clamped only at zero).
  assert.equal(stepFrames(100, 1, 24), 100 + 1 / 24);
  assert.equal(stepFrames(Number.NaN, 1, 24, 5), 1 / 24);
});

test("fractional frame rates are honored without drift-inducing rounding", () => {
  const ntsc = 24000 / 1001; // 23.976 — the demo preview's real rate
  assert.ok(Math.abs(stepFrames(1, 1, ntsc, 5) - (1 + 1001 / 24000)) < 1e-12);
  assert.equal(resolveReviewFrameRate(ntsc), ntsc);
  assert.equal(resolveReviewFrameRate(undefined), 24);
  assert.equal(resolveReviewFrameRate(null), 24);
  assert.equal(resolveReviewFrameRate(0), 24);
  assert.equal(resolveReviewFrameRate(Number.NaN), 24);
  assert.equal(resolveReviewFrameRate(-30), 24);
});

test("shuttle steps through the preset ladder and clamps at both ends", () => {
  assert.deepEqual(REVIEW_PLAYBACK_RATES, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]);
  assert.equal(nextShuttleRate(1, 1), 1.25);
  assert.equal(nextShuttleRate(1.25, 1), 1.5);
  assert.equal(nextShuttleRate(2, 1), 2);
  assert.equal(nextShuttleRate(1, -1), 0.75);
  assert.equal(nextShuttleRate(0.25, -1), 0.25);
  // Off-ladder rates snap to the nearest preset before stepping.
  assert.equal(nextShuttleRate(1.1, 1), 1.25);
  assert.equal(nextShuttleRate(1.1, -1), 0.75);
});

test("A/B loop cycles set-in → set-out → clear and sorts inverted points", () => {
  let region = { inPoint: null, outPoint: null };
  region = nextLoopRegion(region, 1.5);
  assert.deepEqual(region, { inPoint: 1.5, outPoint: null });
  assert.equal(isLoopClosed(region), false);
  region = nextLoopRegion(region, 1.0); // out pressed before the in point
  assert.deepEqual(region, { inPoint: 1.0, outPoint: 1.5 });
  assert.equal(isLoopClosed(region), true);
  region = nextLoopRegion(region, 3.0);
  assert.deepEqual(region, { inPoint: null, outPoint: null });
});

test("loop wrap only triggers past the out point of a closed region", () => {
  const closed = { inPoint: 1, outPoint: 2.5 };
  assert.equal(loopWrapTarget(closed, 2.49), null);
  assert.equal(loopWrapTarget(closed, 2.5), 1);
  assert.equal(loopWrapTarget(closed, 3), 1);
  assert.equal(loopWrapTarget({ inPoint: 1, outPoint: null }, 9), null);
  assert.equal(loopWrapTarget({ inPoint: null, outPoint: null }, 9), null);
  // Degenerate zero-length region never loops.
  assert.equal(loopWrapTarget({ inPoint: 2, outPoint: 2 }, 2), null);
});

test("chapters model sorts timed comments and derives cue ranges", () => {
  const comments = [
    { id: "c-late", timecode_seconds: 4.1, status: "open", body: "Later note" },
    { id: "c-untimed", timecode_seconds: null, status: "open", body: "General" },
    { id: "c-early", timecode_seconds: 1.2, status: "resolved", body: " Early note " },
    { id: "c-mid", timecode_seconds: 3.1, status: "open", body: "Middle" },
    { id: "c-bad", timecode_seconds: Number.NaN, status: "open", body: "Broken" },
  ];
  const cues = buildCommentChapters(comments, 5, 24);

  assert.deepEqual(cues.map((cue) => cue.comment.id), ["c-early", "c-mid", "c-late"]);
  assert.deepEqual(
    cues.map((cue) => [cue.startSeconds, cue.endSeconds]),
    [[1.2, 3.1], [3.1, 4.1], [4.1, 5]],
  );
  // 0-based integer frames (Frame.io model), floor-based like the SMPTE chip.
  assert.deepEqual(cues.map((cue) => cue.startFrame), [28, 74, 98]);
  assert.equal(cues[0].label, "Early note");
  assert.equal(cues[0].status, "resolved");
});

test("chapters fall back to the cue start when duration is unknown", () => {
  const cues = buildCommentChapters(
    [{ timecode_seconds: 2, status: "open", body: "Note" }],
    0,
  );
  assert.equal(cues.length, 1);
  assert.equal(cues[0].endSeconds, 2);
});

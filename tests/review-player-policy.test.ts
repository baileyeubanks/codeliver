import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeReviewSeekStep,
  normalizeReviewShortcutKey,
  projectPointIntoMedia,
  shouldIgnoreReviewShortcut,
} from "../lib/review/player-policy.ts";

test("point coordinates ignore letterbox space and remain relative to source media", () => {
  assert.deepEqual(
    projectPointIntoMedia({
      localX: 800,
      localY: 450,
      containerWidth: 1600,
      containerHeight: 900,
      mediaWidth: 1920,
      mediaHeight: 1080,
    }),
    { x: 50, y: 50 },
  );

  assert.equal(
    projectPointIntoMedia({
      localX: 100,
      localY: 450,
      containerWidth: 1600,
      containerHeight: 900,
      mediaWidth: 1440,
      mediaHeight: 1080,
    }),
    null,
  );
});

test("seek intervals are finite, whole seconds, and bounded", () => {
  assert.equal(normalizeReviewSeekStep(Number.NaN), 1);
  assert.equal(normalizeReviewSeekStep(-4), 1);
  assert.equal(normalizeReviewSeekStep(4.6), 5);
  assert.equal(normalizeReviewSeekStep(40), 10);
});

test("review shortcut keys normalize browser space names", () => {
  assert.equal(normalizeReviewShortcutKey(" "), " ");
  assert.equal(normalizeReviewShortcutKey("Space"), " ");
  assert.equal(normalizeReviewShortcutKey("Spacebar"), " ");
  assert.equal(normalizeReviewShortcutKey("k"), "k");
});

test("review shortcuts do not intercept controls, modifiers, composition, or repeats", () => {
  const base = {
    key: "ArrowRight",
    insideControl: false,
    defaultPrevented: false,
    isComposing: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
  };

  assert.equal(shouldIgnoreReviewShortcut(base), false);
  assert.equal(shouldIgnoreReviewShortcut({ ...base, insideControl: true }), true);
  assert.equal(shouldIgnoreReviewShortcut({ ...base, metaKey: true }), true);
  assert.equal(shouldIgnoreReviewShortcut({ ...base, isComposing: true }), true);
  assert.equal(shouldIgnoreReviewShortcut({ ...base, key: "ArrowDown", repeat: true }), true);
  assert.equal(shouldIgnoreReviewShortcut({ ...base, key: "Space", repeat: true }), true);
});

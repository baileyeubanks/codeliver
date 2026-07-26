import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TIMECODE_FPS,
  formatSmpteTimecode,
} from "../components/player/timecode.ts";

test("formats zero and whole seconds as HH:MM:SS:FF", () => {
  assert.equal(formatSmpteTimecode(0), "00:00:00:00");
  assert.equal(formatSmpteTimecode(5), "00:00:05:00");
  assert.equal(formatSmpteTimecode(65), "00:01:05:00");
  assert.equal(formatSmpteTimecode(3661), "01:01:01:00");
});

test("frame component floors fractional seconds instead of rounding", () => {
  // At 24fps, 1.999s is frame 23 of second 1 — it must not roll into 00:00:02:00.
  assert.equal(formatSmpteTimecode(1.999), "00:00:01:23");
  assert.equal(formatSmpteTimecode(0.5), "00:00:00:12");
  assert.equal(formatSmpteTimecode(3661.5), "01:01:01:12");
});

test("honors non-default frame rates", () => {
  assert.equal(formatSmpteTimecode(1.5, 30), "00:00:01:15");
  assert.equal(formatSmpteTimecode(0.999, 60), "00:00:00:59");
});

test("non-finite and negative input degrades to zero", () => {
  assert.equal(formatSmpteTimecode(Number.NaN), "00:00:00:00");
  assert.equal(formatSmpteTimecode(Number.POSITIVE_INFINITY), "00:00:00:00");
  assert.equal(formatSmpteTimecode(-3), "00:00:00:00");
});

test("invalid fps falls back to the default frame rate", () => {
  assert.equal(DEFAULT_TIMECODE_FPS, 24);
  assert.equal(formatSmpteTimecode(0.5, 0), "00:00:00:12");
  assert.equal(formatSmpteTimecode(0.5, Number.NaN), "00:00:00:12");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  captionsFilename,
  segmentsToSrt,
  segmentsToVtt,
  type CaptionSegment,
} from "../lib/covideopro/captions.ts";

const SEGMENTS: CaptionSegment[] = [
  { id: "seg-2", start_seconds: 14, end_seconds: 22.5, speaker: "Dana Whitfield", text: "The short answer is trust." },
  { id: "seg-1", start_seconds: 6, end_seconds: 14, speaker: "Host", text: "Why did it start?" },
];

test("SRT: ordered, indexed, comma timecodes, plain text", () => {
  const srt = segmentsToSrt(SEGMENTS);
  const blocks = srt.trim().split("\n\n");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], "1\n00:00:06,000 --> 00:00:14,000\nHost: Why did it start?");
  assert.equal(blocks[1], "2\n00:00:14,000 --> 00:00:22,500\nDana Whitfield: The short answer is trust.");
  assert.ok(srt.endsWith("\n"));
});

test("VTT: WEBVTT header, dot timecodes, voice tags", () => {
  const vtt = segmentsToVtt(SEGMENTS);
  assert.ok(vtt.startsWith("WEBVTT\n\n"));
  assert.match(vtt, /00:00:06\.000 --> 00:00:14\.000/);
  assert.match(vtt, /<v Host>Why did it start\?<\/v>/);
});

test("millisecond rounding and filename safety", () => {
  const srt = segmentsToSrt([{ id: "x", start_seconds: 0.0004, end_seconds: 1.9996, speaker: "A", text: "edge" }]);
  assert.match(srt, /00:00:00,000 --> 00:00:02,000/);
  assert.equal(captionsFilename("McLaren Podcast — radio cut", "srt"), "mclaren-podcast-radio-cut.srt");
  assert.equal(captionsFilename("***", "vtt"), "captions.vtt");
  assert.deepEqual(segmentsToSrt([]), "");
});

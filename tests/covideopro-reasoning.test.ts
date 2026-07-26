import assert from "node:assert/strict";
import test from "node:test";

import {
  proposeRadioCut,
  rankSegments,
  scoreSegment,
  segmentFeatures,
  type ReasoningSegment,
} from "../lib/covideopro/reasoning.ts";

const SEGMENTS: ReasoningSegment[] = [
  { id: "s1", start_seconds: 0, end_seconds: 10, speaker: "Host", text: "So tell me, what happened in Nashville?" },
  { id: "s2", start_seconds: 10, end_seconds: 32, speaker: "Guest", text: "Nashville was forty trucks, six cranes, and one weekend that could not slip. Everyone knew the number, and when the last load cleared the gate at 4 a.m., that is when the partnership stopped being a contract and became trust." },
  { id: "s3", start_seconds: 32, end_seconds: 36, speaker: "Guest", text: "Um, yeah." },
  { id: "s4", start_seconds: 36, end_seconds: 58, speaker: "Guest", text: "We had failed a lift plan the year before and nobody wanted to repeat it, so every crew treated our freight like their own steel." },
];

test("segment features compute pace, questions, numbers, emotional hits", () => {
  const features = segmentFeatures(SEGMENTS[1]);
  assert.equal(features.duration, 22);
  assert.equal(features.hasNumber, true);
  assert.equal(features.hasQuestion, false);
  assert.ok(features.emotionalHits.includes("trust"));
  assert.ok(features.wordsPerSecond > 1 && features.wordsPerSecond < 3);
});

test("scoring rewards the strong story beat and punishes fragments and questions", () => {
  const story = scoreSegment(SEGMENTS[1]);
  const fragment = scoreSegment(SEGMENTS[2]);
  const question = scoreSegment(SEGMENTS[0]);
  const failure = scoreSegment(SEGMENTS[3]);

  assert.ok(story.score > question.score, `story ${story.score} should beat question ${question.score}`);
  assert.ok(story.score > fragment.score, "story should beat fragment");
  assert.ok(fragment.rationale.some((reason) => reason.includes("fragment") || reason.includes("filler")));
  assert.ok(question.rationale.includes("question (likely host)"));
  assert.ok(failure.score >= 40, "failure-with-growth beat scores respectably");
});

test("ranking sorts strongest first; radio cut fits target and keeps source order", () => {
  const ranked = rankSegments(SEGMENTS);
  assert.equal(ranked[0].segmentId, "s2");

  const cut = proposeRadioCut(SEGMENTS, 60);
  assert.ok(cut.segmentIds.includes("s2"));
  assert.ok(!cut.segmentIds.includes("s1"), "host question excluded");
  assert.ok(!cut.segmentIds.includes("s3"), "filler fragment excluded");
  const starts = cut.segmentIds.map((id) => SEGMENTS.find((segment) => segment.id === id)?.start_seconds ?? 0);
  assert.deepEqual([...starts].sort((a, b) => a - b), starts, "chronological order preserved");
  assert.ok(cut.totalSeconds <= 60 * 1.01, `respects target: ${cut.totalSeconds}`);
  assert.ok(cut.score > 0);
  assert.ok(cut.rationale.every((line) => /^s\d+:/.test(line)), "every rationale cites a segment id");
});

test("empty and hostile input stays safe", () => {
  assert.deepEqual(proposeRadioCut([], 30), { segmentIds: [], totalSeconds: 0, score: 0, rationale: [] });
  const zeroDuration = proposeRadioCut(
    [{ id: "z", start_seconds: 5, end_seconds: 5, speaker: "X", text: "zero duration segment" }],
    30,
  );
  assert.equal(Number.isFinite(zeroDuration.totalSeconds), true);
});

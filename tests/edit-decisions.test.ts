import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEditDecisionInput,
  parseExternalReviewEditDecision,
} from "../lib/edit-decisions.ts";

const requestId = "ff5d7612-f8f6-4f75-8f69-a16498187ef2";

test("accepts an idempotent keyboard cut at an exact timeline position", () => {
  const result = parseEditDecisionInput({
    decision_type: "cut",
    source: "keyboard",
    start_seconds: 12.345,
    end_seconds: null,
    label: "  Cut  ",
    confidence: null,
    client_request_id: requestId,
    metadata: { input: "ArrowDown" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.start_seconds, 12.345);
  assert.equal(result.value.label, "Cut");
  assert.equal(result.value.client_request_id, requestId);
});

test("rejects non-finite, negative, and unbounded timeline positions", () => {
  for (const startSeconds of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 604801]) {
    const result = parseEditDecisionInput({
      decision_type: "cut",
      source: "keyboard",
      start_seconds: startSeconds,
      client_request_id: requestId,
    });

    assert.equal(result.ok, false);
  }
});

test("requires ranged decisions to have a non-empty forward range", () => {
  const missingRange = parseEditDecisionInput({
    decision_type: "remove_silence",
    source: "silence_scan",
    start_seconds: 3,
    client_request_id: requestId,
  });
  const reversedRange = parseEditDecisionInput({
    decision_type: "remove_filler",
    source: "filler_scan",
    start_seconds: 4,
    end_seconds: 3,
    client_request_id: requestId,
  });

  assert.equal(missingRange.ok, false);
  assert.equal(reversedRange.ok, false);
});

test("rejects malformed idempotency keys and oversized metadata", () => {
  const malformedId = parseEditDecisionInput({
    decision_type: "cut",
    source: "manual",
    start_seconds: 1,
    client_request_id: "not-a-uuid",
  });
  const oversizedMetadata = parseEditDecisionInput({
    decision_type: "cut",
    source: "manual",
    start_seconds: 1,
    client_request_id: requestId,
    metadata: { payload: "x".repeat(5000) },
  });

  assert.equal(malformedId.ok, false);
  assert.equal(oversizedMetadata.ok, false);
});

test("external reviewers can propose manual cuts but cannot invoke automated editing", () => {
  const manualCut = parseExternalReviewEditDecision({
    decision_type: "cut",
    source: "manual",
    start_seconds: 2,
    client_request_id: requestId,
  });
  const automatedRemoval = parseExternalReviewEditDecision({
    decision_type: "remove_silence",
    source: "silence_scan",
    start_seconds: 2,
    end_seconds: 3,
    client_request_id: requestId,
  });

  assert.equal(manualCut.ok, true);
  assert.equal(automatedRemoval.ok, false);
});

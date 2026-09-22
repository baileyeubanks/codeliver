import assert from "node:assert/strict";
import test from "node:test";

import {
  canOperateExactInternalReviewVersion,
  runWhenInternalReviewVersionIsAvailable,
} from "../lib/review/internal-version-operations.ts";

test("an unsupported live historical URL cannot invoke a review mutation", async () => {
  const available = canOperateExactInternalReviewVersion({
    demoMode: false,
    requestedVersionId: "historical-v1",
    activeDemoVersionId: null,
  });
  let fetchCalls = 0;

  await runWhenInternalReviewVersionIsAvailable(available, async () => {
    fetchCalls += 1;
  });

  assert.equal(available, false);
  assert.equal(fetchCalls, 0);
});

test("only a resolved demo version re-enables exact-cut operations", () => {
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "source-version-aayush-v1",
    activeDemoVersionId: "source-version-aayush-v1",
  }), true);
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "missing-v1",
    activeDemoVersionId: null,
  }), false);
});

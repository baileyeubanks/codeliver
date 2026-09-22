import assert from "node:assert/strict";
import test from "node:test";

import { reviewCommentDraftKey } from "../lib/review/internal-version-operations.ts";

test("unsent review text has a separate identity for each asset version", () => {
  const drafts: Record<string, string> = {
    [reviewCommentDraftKey("aayush", "v1")]: "V1 framing note",
    [reviewCommentDraftKey("aayush", "v2")]: "V2 audio note",
  };

  assert.equal(drafts[reviewCommentDraftKey("aayush", "v1")], "V1 framing note");
  assert.equal(drafts[reviewCommentDraftKey("aayush", "v2")], "V2 audio note");
  assert.notEqual(reviewCommentDraftKey("aayush", "v1"), reviewCommentDraftKey("aayush", "v2"));
});

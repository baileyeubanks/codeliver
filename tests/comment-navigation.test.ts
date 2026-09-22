import assert from "node:assert/strict";
import test from "node:test";
import { adjacentTimedComment, orderedTimedComments } from "../lib/review/comment-navigation.ts";

const comments = orderedTimedComments([
  { id: "later", timecode_seconds: 12, created_at: "2026-09-22T10:00:01.000Z" },
  { id: "same-b", timecode_seconds: 4, created_at: "2026-09-22T10:00:00.000Z" },
  { id: "untimed", timecode_seconds: null, created_at: "2026-09-22T09:00:00.000Z" },
  { id: "same-a", timecode_seconds: 4, created_at: "2026-09-22T10:00:00.000Z" },
]);

test("timeline navigation is version-local, time ordered, and deterministic at one frame", () => {
  assert.deepEqual(comments.map((comment) => comment.id), ["same-a", "same-b", "later"]);
  assert.equal(adjacentTimedComment(comments, "same-b", 1)?.id, "later");
  assert.equal(adjacentTimedComment(comments, "same-a", -1)?.id, "later");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = readFileSync(
  resolve(repositoryRoot, "components/review/PublicReviewPage.tsx"),
  "utf8",
);

test("public review passes write callbacks only when the admitted link can comment", () => {
  assert.match(pageSource, /onReplySubmit=\{canComment\s+\?/);
  assert.match(pageSource, /canReact=\{canComment\}/);
  assert.match(pageSource, /canReplyTo=\{/);
  assert.doesNotMatch(pageSource, /<CommentList[\s\S]*?onDelete=/);
});

test("demo edit and resolution use exact persisted comment bindings", () => {
  assert.match(pageSource, /editDemoPublicReviewComment\(\{/);
  assert.match(pageSource, /setDemoPublicReviewCommentResolved\(\{/);
  assert.match(pageSource, /projectId: localReviewBinding\.projectId/);
  assert.match(pageSource, /versionId: localReviewBinding\.versionId/);
  assert.match(pageSource, /reviewInviteId: localReviewBinding\.reviewInviteId/);
  assert.match(pageSource, /localReviewCommentIds\.has\(comment\.id\)/);
});

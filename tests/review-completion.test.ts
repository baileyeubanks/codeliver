import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_COMPLETION_NOTE_MAX_LENGTH,
  REVIEWER_NAME_MAX_LENGTH,
  canInviteCompleteReview,
  normalizeReviewCompletionReviewerName,
  parseReviewCompletionRequest,
  toPublicReviewCompletion,
} from "../lib/review/completion.ts";

test("only named comment or approval invitees can finish a review", () => {
  assert.equal(
    canInviteCompleteReview({
      permissions: "view",
      reviewer_name: "Client Reviewer",
      reviewer_email: "client@example.com",
    }),
    false,
  );
  assert.equal(
    canInviteCompleteReview({
      permissions: "comment",
      reviewer_name: "Client Reviewer",
      reviewer_email: null,
    }),
    false,
  );
  assert.equal(
    canInviteCompleteReview({
      permissions: "approve",
      reviewer_name: null,
      reviewer_email: "client@example.com",
    }),
    true,
  );
});

test("review completion uses a bounded display name without trusting arbitrary fields", () => {
  assert.equal(
    normalizeReviewCompletionReviewerName({
      requestedReviewerName: "  Jordan Client  ",
      invite: { reviewer_name: "Assigned reviewer", reviewer_email: "client@example.com" },
    }),
    "Jordan Client",
  );
  assert.equal(
    normalizeReviewCompletionReviewerName({
      requestedReviewerName: "   ",
      invite: { reviewer_name: null, reviewer_email: "client@example.com" },
    }),
    "client@example.com",
  );
  assert.equal(
    normalizeReviewCompletionReviewerName({
      requestedReviewerName: "a".repeat(REVIEWER_NAME_MAX_LENGTH + 1),
      invite: { reviewer_name: null, reviewer_email: null },
    }).length,
    REVIEWER_NAME_MAX_LENGTH,
  );
});

test("completion request validation keeps the note optional and bounded", () => {
  assert.deepEqual(parseReviewCompletionRequest({ reviewer_name: "  Client  ", note: "  Done.  " }), {
    ok: true,
    reviewerName: "Client",
    note: "Done.",
  });
  assert.deepEqual(parseReviewCompletionRequest({}), {
    ok: true,
    reviewerName: "",
    note: null,
  });
  assert.deepEqual(parseReviewCompletionRequest(null), {
    ok: false,
    error: "Invalid review completion request",
  });
  assert.deepEqual(
    parseReviewCompletionRequest({ note: "a".repeat(REVIEW_COMPLETION_NOTE_MAX_LENGTH + 1) }),
    {
      ok: false,
      error: `Completion note must be ${REVIEW_COMPLETION_NOTE_MAX_LENGTH} characters or fewer`,
    },
  );
});

test("public completion DTO does not expose invite, asset, version, or reviewer email", () => {
  const completion = toPublicReviewCompletion({
    id: "completion-1",
    review_invite_id: "invite-1",
    asset_id: "asset-1",
    version_id: "version-1",
    reviewer_name: "Client Reviewer",
    reviewer_email: "client@example.com",
    note: "Looks good.",
    completed_at: "2026-07-16T18:00:00.000Z",
  });

  assert.deepEqual(completion, {
    reviewer_name: "Client Reviewer",
    note: "Looks good.",
    completed_at: "2026-07-16T18:00:00.000Z",
  });
  assert.deepEqual(Object.keys(completion).sort(), ["completed_at", "note", "reviewer_name"]);
});

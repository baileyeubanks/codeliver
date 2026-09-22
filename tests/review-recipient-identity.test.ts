import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  hashReviewRecipientEmail,
  reviewRecipientHashForConfirmedUser,
  reviewRecipientHashMatches,
} from "../lib/review/recipient-identity.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("recipient binding accepts only a confirmed, normalized provider email", () => {
  const expected = digest("reviewer@example.test");

  assert.equal(hashReviewRecipientEmail(" Reviewer@Example.test "), expected);
  assert.equal(hashReviewRecipientEmail(" \t "), null);
  assert.equal(
    reviewRecipientHashForConfirmedUser({
      email: "reviewer@example.test",
      email_confirmed_at: null,
    }),
    null,
  );
  assert.equal(
    reviewRecipientHashForConfirmedUser({
      email: " Reviewer@Example.test ",
      email_confirmed_at: "2026-09-22T00:00:00.000Z",
    }),
    expected,
  );
  assert.equal(reviewRecipientHashMatches(expected, expected), true);
  assert.equal(reviewRecipientHashMatches(expected, digest("other@example.test")), false);
});

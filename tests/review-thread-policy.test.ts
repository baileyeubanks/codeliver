import assert from "node:assert/strict";
import test from "node:test";

import {
  canReplyToReviewThread,
  isExternalReviewThreadForInvite,
  replyAudienceFromParent,
  replySourceFromParent,
} from "../lib/review/thread-policy.ts";

test("external review thread membership requires the exact invite", () => {
  assert.equal(
    isExternalReviewThreadForInvite({
      audience: "external",
      reviewInviteId: "invite-a",
      inviteId: "invite-a",
    }),
    true,
  );
  assert.equal(
    isExternalReviewThreadForInvite({
      audience: "external",
      reviewInviteId: "invite-b",
      inviteId: "invite-a",
    }),
    false,
  );
  assert.equal(
    isExternalReviewThreadForInvite({
      audience: "external",
      reviewInviteId: null,
      inviteId: "invite-a",
    }),
    false,
  );
  assert.equal(
    isExternalReviewThreadForInvite({
      audience: "internal",
      reviewInviteId: "invite-a",
      inviteId: "invite-a",
    }),
    false,
  );
});

test("thread reply authority keeps internal and external audiences distinct", () => {
  assert.equal(canReplyToReviewThread({ audience: "internal", actorRole: "reviewer" }), true);
  assert.equal(canReplyToReviewThread({ audience: "external", actorRole: "reviewer" }), false);
  assert.equal(canReplyToReviewThread({ audience: "external", actorRole: "editor" }), true);
  assert.deepEqual(
    replyAudienceFromParent({ visibility: "external", reviewInviteId: "invite-a" }),
    { visibility: "external", reviewInviteId: "invite-a" },
  );
  assert.deepEqual(replyAudienceFromParent({ visibility: "internal", reviewInviteId: "invite-a" }), {
    visibility: "internal",
    reviewInviteId: null,
  });
});

test("a reply inherits its parent moment without creating another frame pin", () => {
  assert.deepEqual(replySourceFromParent({ timecodeSeconds: 12.5 }), {
    timecodeSeconds: 12.5,
    pinX: null,
    pinY: null,
  });
  assert.deepEqual(replySourceFromParent({ timecodeSeconds: null }), {
    timecodeSeconds: null,
    pinX: null,
    pinY: null,
  });
});

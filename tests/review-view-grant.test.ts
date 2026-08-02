import assert from "node:assert/strict";
import test from "node:test";

import {
  createReviewViewGrant,
  hasValidReviewViewGrant,
} from "../lib/security/review-view-grant.ts";
import { hashOpaqueToken } from "../lib/security/opaque-token.ts";

const keyValue = Buffer.alloc(32, 11).toString("base64url");
const token = "opaque-review-token-that-must-not-appear-in-the-cookie";
const inviteId = "00000000-0000-4000-8000-000000000011";
const claimId = "00000000-0000-4000-8000-000000000012";
const requestId = "00000000-0000-4000-8000-000000000013";
const now = new Date("2026-07-15T12:00:00.000Z");

test("review view grants bind the claimed token, invite, claim, request, and expiry", () => {
  const grant = createReviewViewGrant({
    token,
    inviteId,
    claimId,
    requestId,
    inviteExpiresAt: "2026-07-15T13:00:00.000Z",
    now,
    keyValue,
  });
  const request = new Request("https://co-videopro.com/api/review/token/media", {
    headers: { cookie: `${grant.name}=${grant.value}` },
  });

  assert.equal(grant.maxAge, 3_600);
  assert.equal(grant.name.includes(token), false);
  assert.equal(grant.value.includes(token), false);
  const payload = JSON.parse(
    Buffer.from(grant.value.split(".")[0], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  assert.equal("token" in payload, false);
  assert.equal(JSON.stringify(payload).includes(hashOpaqueToken(token)), false);
  assert.equal(
    hasValidReviewViewGrant(request, {
      token,
      inviteId,
      now: new Date("2026-07-15T12:30:00.000Z"),
      keyValue,
    }),
    true,
  );
  assert.equal(
    hasValidReviewViewGrant(request, {
      token: `${token}-different`,
      inviteId,
      now,
      keyValue,
    }),
    false,
  );
  assert.equal(
    hasValidReviewViewGrant(request, {
      token,
      inviteId: "00000000-0000-4000-8000-000000000099",
      now,
      keyValue,
    }),
    false,
  );
  assert.equal(
    hasValidReviewViewGrant(request, {
      token,
      inviteId,
      now: new Date("2026-07-15T13:00:01.000Z"),
      keyValue,
    }),
    false,
  );
});

test("tampered or malformed review view grants fail closed", () => {
  const grant = createReviewViewGrant({
    token,
    inviteId,
    claimId,
    requestId,
    now,
    keyValue,
  });
  const tampered = new Request("https://co-videopro.com/api/review/token/media", {
    headers: { cookie: `${grant.name}=${grant.value.slice(0, -1)}x` },
  });

  assert.equal(
    hasValidReviewViewGrant(tampered, { token, inviteId, now, keyValue }),
    false,
  );
  assert.throws(
    () =>
      createReviewViewGrant({
        token,
        inviteId,
        claimId: "not-a-claim-id",
        requestId,
        now,
        keyValue,
      }),
    /authority is invalid/,
  );
});

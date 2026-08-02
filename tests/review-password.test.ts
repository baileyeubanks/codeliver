import assert from "node:assert/strict";
import test from "node:test";

import {
  createReviewAccessGrant,
  hashReviewPassword,
  hasValidReviewAccessGrant,
  verifyReviewPassword,
} from "../lib/security/review-password.ts";

const keyValue = Buffer.alloc(32, 7).toString("base64url");
const now = new Date("2026-07-15T12:00:00.000Z");

test("review passwords use randomized scrypt hashes and constant-time verification", async () => {
  const first = await hashReviewPassword("correct horse battery staple");
  const second = await hashReviewPassword("correct horse battery staple");

  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$v1\$/);
  assert.equal(first.includes("correct horse battery staple"), false);
  assert.equal(await verifyReviewPassword("correct horse battery staple", first), true);
  assert.equal(await verifyReviewPassword("wrong password", first), false);
  assert.equal(await verifyReviewPassword("correct horse battery staple", "invalid"), false);
});

test("review password hashing rejects secrets outside the API boundary", async () => {
  await assert.rejects(() => hashReviewPassword("short"), /8-128 characters/);
  await assert.rejects(() => hashReviewPassword("x".repeat(129)), /8-128 characters/);
});

test("signed review access grants bind token, invite, password hash, and expiry", async () => {
  const passwordHash = await hashReviewPassword("frame-accurate-secret");
  const grant = createReviewAccessGrant({
    token: "opaque-review-token-1234567890",
    inviteId: "00000000-0000-4000-8000-000000000001",
    passwordHash,
    inviteExpiresAt: "2026-07-15T13:00:00.000Z",
    now,
    keyValue,
  });
  const request = new Request("https://co-videopro.com/api/review/token", {
    headers: { cookie: `${grant.name}=${grant.value}` },
  });

  assert.equal(grant.maxAge, 3_600);
  assert.equal(
    hasValidReviewAccessGrant(request, {
      token: "opaque-review-token-1234567890",
      inviteId: "00000000-0000-4000-8000-000000000001",
      passwordHash,
      now: new Date("2026-07-15T12:30:00.000Z"),
      keyValue,
    }),
    true,
  );
  assert.equal(
    hasValidReviewAccessGrant(request, {
      token: "different-review-token-1234567890",
      inviteId: "00000000-0000-4000-8000-000000000001",
      passwordHash,
      now,
      keyValue,
    }),
    false,
  );
  assert.equal(
    hasValidReviewAccessGrant(request, {
      token: "opaque-review-token-1234567890",
      inviteId: "00000000-0000-4000-8000-000000000002",
      passwordHash,
      now,
      keyValue,
    }),
    false,
  );
  assert.equal(
    hasValidReviewAccessGrant(request, {
      token: "opaque-review-token-1234567890",
      inviteId: "00000000-0000-4000-8000-000000000001",
      passwordHash,
      now: new Date("2026-07-15T13:00:01.000Z"),
      keyValue,
    }),
    false,
  );
});

test("tampered review access grants fail closed", async () => {
  const passwordHash = await hashReviewPassword("another-secure-password");
  const grant = createReviewAccessGrant({
    token: "opaque-review-token-abcdefghijk",
    inviteId: "00000000-0000-4000-8000-000000000003",
    passwordHash,
    now,
    keyValue,
  });
  const request = new Request("https://co-videopro.com/api/review/token", {
    headers: {
      cookie: `${grant.name}=${grant.value.slice(0, -1)}x`,
    },
  });

  assert.equal(
    hasValidReviewAccessGrant(request, {
      token: "opaque-review-token-abcdefghijk",
      inviteId: "00000000-0000-4000-8000-000000000003",
      passwordHash,
      now,
      keyValue,
    }),
    false,
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  findReviewAdmissionCookie,
  issueReviewAdmissionGrant,
  reviewAdmissionCookieName,
  serializeReviewAdmissionCookie,
  verifyReviewAdmissionGrant,
  verifyReviewAdmissionMediaGrant,
} from "../lib/review/admission-grant.ts";

const signingKey = Buffer.alloc(32, 7).toString("base64url");
const token = "opaque-review-token-with-enough-entropy-000000000001";
const now = 1_785_000_000;

const claims = {
  admissionId: "11111111-1111-4111-8111-111111111111",
  inviteId: "22222222-2222-4222-8222-222222222222",
  assetId: "33333333-3333-4333-8333-333333333333",
  versionId: "44444444-4444-4444-8444-444444444444",
  issuedAt: now,
  expiresAt: now + 15 * 60,
  admissionExpiresAt: now + 8 * 60 * 60,
};

test("a review admission grant is exact-token-bound and round trips without exposing the token", () => {
  const grant = issueReviewAdmissionGrant(
    { token, ...claims },
    signingKey,
  );

  assert.deepEqual(
    verifyReviewAdmissionGrant(grant, {
      token,
      now: now + 30,
      keyValue: signingKey,
    }),
    claims,
  );
  assert.equal(grant.includes(token), false);
  assert.equal(
    verifyReviewAdmissionGrant(grant, {
      token: `${token}-other`,
      now: now + 30,
      keyValue: signingKey,
    }),
    null,
  );
});

test("tampered, expired, future-issued, overlong, and wrong-key grants fail closed", () => {
  const grant = issueReviewAdmissionGrant(
    { token, ...claims },
    signingKey,
  );
  const replacement = grant.endsWith("A") ? "B" : "A";
  const tampered = `${grant.slice(0, -1)}${replacement}`;

  for (const candidate of [
    tampered,
    "",
    "v1.invalid.invalid",
    "v2.invalid.invalid",
  ]) {
    assert.equal(
      verifyReviewAdmissionGrant(candidate, {
        token,
        now: now + 30,
        keyValue: signingKey,
      }),
      null,
    );
  }

  assert.equal(
    verifyReviewAdmissionGrant(grant, {
      token,
      now: claims.expiresAt,
      keyValue: signingKey,
    }),
    null,
  );
  assert.deepEqual(
    verifyReviewAdmissionGrant(grant, {
      token,
      now: claims.expiresAt,
      keyValue: signingKey,
      allowExpiredForRefresh: true,
    }),
    claims,
  );
  assert.equal(
    verifyReviewAdmissionGrant(grant, {
      token,
      now: claims.admissionExpiresAt,
      keyValue: signingKey,
      allowExpiredForRefresh: true,
    }),
    null,
  );
  assert.equal(
    verifyReviewAdmissionGrant(grant, {
      token,
      now: now - 31,
      keyValue: signingKey,
    }),
    null,
  );
  assert.equal(
    verifyReviewAdmissionGrant(grant, {
      token,
      now: now + 30,
      keyValue: Buffer.alloc(32, 8).toString("base64url"),
    }),
    null,
  );
  assert.throws(
    () =>
      issueReviewAdmissionGrant(
        {
          token,
          ...claims,
          expiresAt: claims.issuedAt + 15 * 60 + 1,
        },
        signingKey,
      ),
    /lifetime/i,
  );
});

test("the admission cookie is host-only, secure, HTTP-only, same-site, bounded, and token-isolated", () => {
  const grant = issueReviewAdmissionGrant(
    { token, ...claims },
    signingKey,
  );
  const cookieName = reviewAdmissionCookieName(claims.admissionId);
  const cookie = serializeReviewAdmissionCookie({
    admissionId: claims.admissionId,
    grant,
    admissionExpiresAt: claims.admissionExpiresAt,
    now,
  });

  assert.match(cookieName, /^__Host-cvp_review_admission_[a-f0-9]{16}$/);
  assert.equal(cookieName.includes(token), false);
  assert.match(cookie, new RegExp(`^${cookieName}=`));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(cookie, /; Max-Age=28800(?:;|$)/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(cookie.includes(token), false);
  assert.notEqual(
    reviewAdmissionCookieName("55555555-5555-4555-8555-555555555555"),
    cookieName,
  );
});

test("a valid max-view session is not hidden by earlier review-cookie candidates", () => {
  const grant = issueReviewAdmissionGrant(
    { token, ...claims },
    signingKey,
  );
  const decoys = Array.from(
    { length: 40 },
    (_, index) =>
      `__Host-cvp_review_admission_${index.toString(16).padStart(16, "0")}=invalid`,
  );
  const request = new Request("https://client.contentco-op.com/api/review/x", {
    headers: {
      Cookie: [
        ...decoys,
        `${reviewAdmissionCookieName(claims.admissionId)}=${grant}`,
      ].join("; "),
    },
  });

  assert.deepEqual(
    findReviewAdmissionCookie(request, token, {
      now: now + 1,
      keyValue: signingKey,
    }),
    { grant, claims },
  );
});

test("key rotation signs only with the active key and verifies explicitly retained predecessors", () => {
  const previousKey = Buffer.alloc(32, 6).toString("base64url");
  const activeKey = Buffer.alloc(32, 7).toString("base64url");
  const futureKey = Buffer.alloc(32, 8).toString("base64url");
  const oldGrant = issueReviewAdmissionGrant(
    { token, ...claims },
    previousKey,
  );
  const activeGrant = issueReviewAdmissionGrant(
    { token, ...claims },
    {
      activeKey,
      verificationKeys: [previousKey],
    },
  );

  assert.deepEqual(
    verifyReviewAdmissionGrant(oldGrant, {
      token,
      now: now + 1,
      keyValue: {
        activeKey,
        verificationKeys: [previousKey],
      },
    }),
    claims,
  );
  assert.equal(
    verifyReviewAdmissionGrant(oldGrant, {
      token,
      now: now + 1,
      keyValue: { activeKey, verificationKeys: [] },
    }),
    null,
  );
  assert.deepEqual(
    verifyReviewAdmissionGrant(activeGrant, {
      token,
      now: now + 1,
      keyValue: { activeKey: futureKey, verificationKeys: [activeKey] },
    }),
    claims,
  );
  assert.equal(
    verifyReviewAdmissionGrant(activeGrant, {
      token,
      now: now + 1,
      keyValue: { activeKey: futureKey, verificationKeys: [] },
    }),
    null,
  );
});

test("token-free media verification recovers only the signed token hash for live database re-authorization", () => {
  const grant = issueReviewAdmissionGrant(
    { token, ...claims },
    signingKey,
  );
  const verified = verifyReviewAdmissionMediaGrant(grant, {
    admissionId: claims.admissionId,
    now: now + 1,
    keyValue: signingKey,
  });

  assert.deepEqual(verified, {
    claims,
    tokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
  });
  assert.equal(
    verifyReviewAdmissionMediaGrant(grant, {
      admissionId: "55555555-5555-4555-8555-555555555555",
      now: now + 1,
      keyValue: signingKey,
    }),
    null,
  );
  assert.equal(Object.hasOwn(claims, "tokenHash"), false);
});

test("token-free media can authenticate an expired short grant only inside its durable refresh window", () => {
  const expiredGrant = issueReviewAdmissionGrant(
    {
      token,
      ...claims,
      issuedAt: now - 16 * 60,
      expiresAt: now - 60,
      admissionExpiresAt: now + 7 * 60 * 60,
    },
    signingKey,
  );

  assert.equal(
    verifyReviewAdmissionMediaGrant(expiredGrant, {
      admissionId: claims.admissionId,
      now,
      keyValue: signingKey,
    }),
    null,
  );
  assert.match(
    verifyReviewAdmissionMediaGrant(expiredGrant, {
      admissionId: claims.admissionId,
      now,
      keyValue: signingKey,
      allowExpiredForRefresh: true,
    })?.tokenHash ?? "",
    /^[0-9a-f]{64}$/,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  REVIEW_RESPONSE_HEADERS,
  readReviewJsonObject,
  reviewAdmissionNetworkBucket,
  validateReviewMutationRequest,
  validateReviewReadRequest,
} from "../lib/review/request-boundary.ts";

const origin = "https://client.contentco-op.com";
const signingKey = Buffer.alloc(32, 9).toString("base64url");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function mutationRequest(
  overrides: Record<string, string> = {},
  url = `${origin}/api/review/opaque-token/admission`,
) {
  return new Request(url, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": "2",
      "Sec-Fetch-Site": "same-origin",
      ...overrides,
    },
    body: "{}",
  });
}

test("review mutations require exact-origin JSON before authority or body work", () => {
  assert.deepEqual(validateReviewMutationRequest(mutationRequest()), {
    ok: true,
  });

  const rejected = [
    mutationRequest({ Origin: "https://admin.contentco-op.com" }),
    mutationRequest({ Origin: "https://client.contentco-op.com.evil.test" }),
    mutationRequest({ Origin: "https://client.contentco-op.com/" }),
    mutationRequest({ Origin: "https://client.contentco-op.com/review" }),
    mutationRequest({ Origin: "null" }),
    mutationRequest({ Origin: "" }),
    mutationRequest({ Origin: "https://client.contentco-op.com:444" }),
    mutationRequest({ "Sec-Fetch-Site": "same-site" }),
    mutationRequest({ "Sec-Fetch-Site": "cross-site" }),
    mutationRequest({ "Sec-Fetch-Site": "none" }),
  ];
  for (const request of rejected) {
    assert.deepEqual(validateReviewMutationRequest(request), {
      ok: false,
      status: 403,
      code: "REVIEW_ORIGIN_FORBIDDEN",
    });
  }

  for (const contentType of [
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "",
  ]) {
    assert.deepEqual(
      validateReviewMutationRequest(
        mutationRequest({ "Content-Type": contentType }),
      ),
      {
        ok: false,
        status: 415,
        code: "REVIEW_JSON_REQUIRED",
      },
    );
  }
  assert.deepEqual(
    validateReviewMutationRequest(
      mutationRequest({ "Content-Length": "2049" }),
    ),
    {
      ok: false,
      status: 413,
      code: "REVIEW_REQUEST_TOO_LARGE",
    },
  );
});

test("review JSON parsing distinguishes malformed input from a chunked oversized body", async () => {
  const oversized = mutationRequest(
    {
      "Content-Length": "",
    },
  );
  const oversizedBody = new Request(oversized.url, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify({ body: "x".repeat(2_100) }),
  });
  assert.deepEqual(await readReviewJsonObject(oversizedBody), {
    ok: false,
    status: 413,
    code: "REVIEW_REQUEST_TOO_LARGE",
  });

  assert.deepEqual(
    await readReviewJsonObject(
      new Request(`${origin}/api/review/token/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    ),
    {
      ok: false,
      status: 400,
      code: "REVIEW_JSON_INVALID",
    },
  );
});

test("review body parsing cancels a bounded stream instead of buffering an untrusted body", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "lib/review/request-boundary.ts"),
    "utf8",
  );
  assert.match(source, /request\.body\?\.getReader\(\)/);
  assert.match(source, /reader\.cancel\(\)/);
  assert.doesNotMatch(source, /await request\.text\(\)/);
});

test("admitted reads tolerate non-browser clients but reject contradictory browser origin metadata", () => {
  assert.deepEqual(
    validateReviewReadRequest(new Request(`${origin}/api/review/token`)),
    { ok: true },
  );
  assert.deepEqual(
    validateReviewReadRequest(
      new Request(`${origin}/api/review/token`, {
        headers: {
          Origin: origin,
          "Sec-Fetch-Site": "same-origin",
        },
      }),
    ),
    { ok: true },
  );
  for (const headers of [
    { Origin: "https://admin.contentco-op.com" },
    { "Sec-Fetch-Site": "same-site" },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    assert.deepEqual(
      validateReviewReadRequest(
        new Request(`${origin}/api/review/token`, { headers }),
      ),
      {
        ok: false,
        status: 403,
        code: "REVIEW_ORIGIN_FORBIDDEN",
      },
    );
  }
});

test("network rate buckets use only a configured trusted ingress header and never expose the address", () => {
  const request = mutationRequest({
    "cf-connecting-ip": "198.51.100.27",
  });
  const bucket = reviewAdmissionNetworkBucket(request, {
    trustedHeader: "cf-connecting-ip",
    keyValue: signingKey,
  });
  assert.match(bucket, /^[0-9a-f]{64}$/);
  assert.equal(bucket.includes("198.51.100.27"), false);
  assert.notEqual(
    bucket,
    reviewAdmissionNetworkBucket(
      mutationRequest({ "cf-connecting-ip": "198.51.100.28" }),
      {
        trustedHeader: "cf-connecting-ip",
        keyValue: signingKey,
      },
    ),
  );
  assert.throws(
    () =>
      reviewAdmissionNetworkBucket(request, {
        trustedHeader: "x-forwarded-for",
        keyValue: signingKey,
      }),
    /trusted ingress/i,
  );
  assert.throws(
    () =>
      reviewAdmissionNetworkBucket(
        mutationRequest({ "cf-connecting-ip": "not-an-ip" }),
        {
          trustedHeader: "cf-connecting-ip",
          keyValue: signingKey,
        },
      ),
    /client address/i,
  );
});

test("all review responses carry the same private same-origin policy", () => {
  assert.deepEqual(REVIEW_RESPONSE_HEADERS, {
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  });
});

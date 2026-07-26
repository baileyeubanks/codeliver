import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  issueReviewAdmissionGrant,
  reviewAdmissionCookieName,
} from "../lib/review/admission-grant.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = resolve(
  repositoryRoot,
  "app/api/review/[token]/admission/route.ts",
);
const signingKey = Buffer.alloc(32, 12).toString("base64url");
process.env.CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY = signingKey;
process.env.CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER =
  "cf-connecting-ip";

const token = "review_token_opaque_1234567890";
const ids = {
  admissionId: "11111111-1111-4111-8111-111111111111",
  inviteId: "22222222-2222-4222-8222-222222222222",
  assetId: "33333333-3333-4333-8333-333333333333",
  versionId: "44444444-4444-4444-8444-444444444444",
};

type RouteState = typeof globalThis & {
  __cvpAdmissionRouteCalls: Array<Record<string, unknown>>;
  __cvpAdmissionRouteResult: Record<string, unknown>;
};
const state = globalThis as RouteState;

const authorityStub = `data:text/javascript,${encodeURIComponent(`
  export async function admitReviewInvite(input) {
    globalThis.__cvpAdmissionRouteCalls.push(input);
    return globalThis.__cvpAdmissionRouteResult;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/review/admission-authority") {
      return nextResolve(authorityStub, context);
    }
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

function request(
  headers: Record<string, string> = {},
  cookie?: string,
) {
  return new Request(
    `https://client.contentco-op.com/api/review/${token}/admission`,
    {
      method: "POST",
      headers: {
        Origin: "https://client.contentco-op.com",
        "Content-Type": "application/json",
        "Content-Length": "2",
        "Sec-Fetch-Site": "same-origin",
        "cf-connecting-ip": "198.51.100.31",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: "{}",
    },
  );
}

test("cross-origin admission is rejected before network or database authority", async () => {
  state.__cvpAdmissionRouteCalls = [];
  state.__cvpAdmissionRouteResult = { ok: true };
  const { POST } = await import(pathToFileURL(routePath).href);
  const response = await POST(
    request({ Origin: "https://admin.contentco-op.com" }),
    { params: Promise.resolve({ token }) },
  );

  assert.equal(response.status, 403);
  assert.deepEqual(state.__cvpAdmissionRouteCalls, []);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
});

test("valid admission sets a bounded opaque grant only after durable authority", async () => {
  const now = Math.floor(Date.now() / 1_000);
  state.__cvpAdmissionRouteCalls = [];
  state.__cvpAdmissionRouteResult = {
    ok: true,
    admission: {
      ...ids,
      expiresAt: now + 8 * 60 * 60,
      viewCount: 1,
      maxViews: 1,
    },
  };
  const { POST } = await import(pathToFileURL(routePath).href);
  const response = await POST(request(), {
    params: Promise.resolve({ token }),
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.admission_id, ids.admissionId);
  assert.equal(payload.view_count, 1);
  assert.equal(payload.max_views, 1);
  assert.deepEqual(Object.keys(payload).sort(), [
    "admission_id",
    "expires_at",
    "grant_expires_at",
    "max_views",
    "view_count",
  ]);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(
    cookie,
    new RegExp(`^${reviewAdmissionCookieName(ids.admissionId)}=`),
  );
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(cookie.includes(token), false);
  assert.equal(JSON.stringify(payload).includes(token), false);
  assert.equal(state.__cvpAdmissionRouteCalls.length, 1);
  assert.match(
    String(state.__cvpAdmissionRouteCalls[0]?.admissionId),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.match(
    String(state.__cvpAdmissionRouteCalls[0]?.networkBucket),
    /^[0-9a-f]{64}$/,
  );
});

test("an expired short grant renews the same live admission without consuming another view", async () => {
  const now = Math.floor(Date.now() / 1_000);
  const expiredGrant = issueReviewAdmissionGrant({
    token,
    ...ids,
    issuedAt: now - 16 * 60,
    expiresAt: now - 60,
    admissionExpiresAt: now + 7 * 60 * 60,
  });
  state.__cvpAdmissionRouteCalls = [];
  state.__cvpAdmissionRouteResult = {
    ok: true,
    admission: {
      ...ids,
      expiresAt: now + 7 * 60 * 60,
      viewCount: 1,
      maxViews: 1,
    },
  };
  const { POST } = await import(pathToFileURL(routePath).href);
  const response = await POST(
    request(
      {},
      `${reviewAdmissionCookieName(ids.admissionId)}=${expiredGrant}`,
    ),
    { params: Promise.resolve({ token }) },
  );

  assert.equal(response.status, 200);
  assert.equal(
    state.__cvpAdmissionRouteCalls[0]?.admissionId,
    ids.admissionId,
  );
});

test("rate and ingress authority failure set no grant and fail closed", async () => {
  const { POST } = await import(pathToFileURL(routePath).href);
  state.__cvpAdmissionRouteCalls = [];
  state.__cvpAdmissionRouteResult = {
    ok: false,
    status: 429,
    code: "REVIEW_ADMISSION_RATE_LIMITED",
    retryAfterSeconds: 23,
  };
  let response = await POST(request(), {
    params: Promise.resolve({ token }),
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "23");
  assert.equal(response.headers.get("set-cookie"), null);

  const previousHeader =
    process.env.CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER;
  delete process.env.CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER;
  state.__cvpAdmissionRouteCalls = [];
  response = await POST(request(), {
    params: Promise.resolve({ token }),
  });
  process.env.CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER =
    previousHeader;
  assert.equal(response.status, 503);
  assert.deepEqual(state.__cvpAdmissionRouteCalls, []);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("malformed rotation configuration fails before a view can be consumed", async () => {
  const { POST } = await import(pathToFileURL(routePath).href);
  const previousVerificationKeys =
    process.env.CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS;
  process.env.CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS =
    "not-a-32-byte-key";
  state.__cvpAdmissionRouteCalls = [];
  state.__cvpAdmissionRouteResult = {
    ok: true,
    admission: {
      ...ids,
      expiresAt: Math.floor(Date.now() / 1_000) + 8 * 60 * 60,
      viewCount: 1,
      maxViews: 1,
    },
  };

  try {
    const response = await POST(request(), {
      params: Promise.resolve({ token }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(state.__cvpAdmissionRouteCalls, []);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    if (previousVerificationKeys === undefined) {
      delete process.env
        .CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS;
    } else {
      process.env.CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS =
        previousVerificationKeys;
    }
  }
});

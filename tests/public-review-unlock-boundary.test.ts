import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewInviteStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getReviewInviteByToken(token) {
    const state = globalThis.__publicReviewUnlockBoundaryState;
    state.lookupCalls.push(token);
    return state.inviteLookup;
  }
`)}`;
const reviewPasswordStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const REVIEW_PASSWORD_MAX_LENGTH = 128;
  export async function verifyReviewPassword(password, passwordHash) {
    const state = globalThis.__publicReviewUnlockBoundaryState;
    state.verifyCalls.push({ password, passwordHash });
    return state.passwordMatches;
  }
  export function createReviewAccessGrant(input) {
    const state = globalThis.__publicReviewUnlockBoundaryState;
    state.grantCalls.push(input);
    return state.grant;
  }
`)}`;
const analyticsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function extractClientAddress(request) {
    const state = globalThis.__publicReviewUnlockBoundaryState;
    state.addressCalls.push(request);
    return state.clientAddress;
  }
  export function hashViewerAddress(input) {
    const state = globalThis.__publicReviewUnlockBoundaryState;
    state.hashCalls.push(input);
    return state.viewerHash;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__publicReviewUnlockBoundaryState.supabase;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/review-invites") {
      return nextResolve(reviewInviteStubUrl, context);
    }
    if (specifier === "@/lib/security/review-password") {
      return nextResolve(reviewPasswordStubUrl, context);
    }
    if (specifier === "@/lib/sharing/share-analytics") {
      return nextResolve(analyticsStubUrl, context);
    }
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    return nextResolve(specifier, context);
  },
});

interface UnlockBoundaryState {
  lookupCalls: string[];
  inviteLookup: {
    ok: true;
    invite: {
      id: string;
      asset_id: string;
      password_hash: string;
      expires_at: string;
      assets: { projects: { id: string } };
    };
  };
  verifyCalls: Array<{ password: string; passwordHash: string }>;
  passwordMatches: boolean;
  grantCalls: Array<Record<string, unknown>>;
  grant: { name: string; value: string; maxAge: number };
  addressCalls: Request[];
  clientAddress: string;
  hashCalls: Array<{ address: string; inviteId: string }>;
  viewerHash: string;
  failedAttempts: number;
  rateLimitError: { message: string } | null;
  auditError: { message: string } | null;
  rateQueries: Array<{
    operation: string;
    args: unknown[];
  }>;
  auditRows: Array<Record<string, unknown>>;
  supabase: unknown;
}

const runtime = globalThis as typeof globalThis & {
  __publicReviewUnlockBoundaryState: UnlockBoundaryState;
};
const TOKEN = "opaque-password-review-token";
const PASSWORD_HASH = "scrypt$v1$stored-hash-material";
const SECRET = "client-only-secret";

function createSupabase(state: UnlockBoundaryState) {
  return {
    from(table: string) {
      assert.equal(table, "activity_log");
      const query = {
        select(...args: unknown[]) {
          state.rateQueries.push({ operation: "select", args });
          return query;
        },
        eq(...args: unknown[]) {
          state.rateQueries.push({ operation: "eq", args });
          return query;
        },
        gte(...args: unknown[]) {
          state.rateQueries.push({ operation: "gte", args });
          return query;
        },
        contains(...args: unknown[]) {
          state.rateQueries.push({ operation: "contains", args });
          return query;
        },
        insert(value: Record<string, unknown>) {
          state.auditRows.push(value);
          return Promise.resolve({ error: state.auditError });
        },
        then<TResult1 = { count: number; error: { message: string } | null }>(
          onFulfilled?:
            | ((value: { count: number; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
            | null,
          onRejected?: ((reason: unknown) => unknown) | null,
        ) {
          return Promise.resolve({
            count: state.failedAttempts,
            error: state.rateLimitError,
          }).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };
}

function resetState() {
  const state: UnlockBoundaryState = {
    lookupCalls: [],
    inviteLookup: {
      ok: true,
      invite: {
        id: "invite-password-1",
        asset_id: "asset-password-1",
        password_hash: PASSWORD_HASH,
        expires_at: "2026-07-16T12:00:00.000Z",
        assets: { projects: { id: "project-password-1" } },
      },
    },
    verifyCalls: [],
    passwordMatches: true,
    grantCalls: [],
    grant: { name: "cvp_review_access", value: "signed-grant", maxAge: 600 },
    addressCalls: [],
    clientAddress: "203.0.113.25",
    hashCalls: [],
    viewerHash: "viewer-address-hash",
    failedAttempts: 0,
    rateLimitError: null,
    auditError: null,
    rateQueries: [],
    auditRows: [],
    supabase: null,
  };
  state.supabase = createSupabase(state);
  runtime.__publicReviewUnlockBoundaryState = state;
  return state;
}

function jsonRequest(password: string) {
  return new Request(
    `https://co-videopro.com/api/review/${TOKEN}/unlock`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.25",
      },
      body: JSON.stringify({ password }),
    },
  );
}

async function unlockPost(request: Request) {
  const routeModule = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/review/[token]/unlock/route.ts"),
    ).href
  );
  return routeModule.POST(request, { params: Promise.resolve({ token: TOKEN }) });
}

test("unlock bounds both request bytes and password length before verification", async (t) => {
  await t.test("oversized request", async () => {
    const state = resetState();
    const response = await unlockPost(
      new Request(
        `https://co-videopro.com/api/review/${TOKEN}/unlock`,
        {
          method: "POST",
          headers: { "Content-Length": "2049" },
        },
      ),
    );

    assert.equal(response.status, 413);
    assert.equal(state.lookupCalls.length, 0);
    assert.equal(state.verifyCalls.length, 0);
  });

  await t.test("oversized password", async () => {
    const state = resetState();
    const response = await unlockPost(jsonRequest("x".repeat(129)));

    assert.equal(response.status, 400);
    assert.equal(state.lookupCalls.length, 1);
    assert.equal(state.verifyCalls.length, 0);
    assert.equal(state.auditRows.length, 0);
  });
});

test("unlock enforces a durable per-viewer failure window before password work", async () => {
  const state = resetState();
  state.failedAttempts = 8;

  const response = await unlockPost(jsonRequest(SECRET));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "900");
  assert.equal(state.verifyCalls.length, 0);
  assert.equal(state.auditRows.length, 0);
  assert.ok(
    state.rateQueries.some(
      (entry) =>
        entry.operation === "eq" &&
        entry.args[0] === "action" &&
        entry.args[1] === "review_password_attempt",
    ),
  );
  assert.ok(
    state.rateQueries.some(
      (entry) =>
        entry.operation === "contains" &&
        entry.args[0] === "details" &&
        JSON.stringify(entry.args[1]) ===
          JSON.stringify({
            review_invite_id: "invite-password-1",
            outcome: "failed",
          }),
    ),
  );
  assert.ok(
    state.rateQueries.some(
      (entry) =>
        entry.operation === "contains" &&
        entry.args[0] === "details" &&
        JSON.stringify(entry.args[1]) ===
          JSON.stringify({ viewer_address_hash: "viewer-address-hash" }),
    ),
  );
  assert.ok(state.rateQueries.some((entry) => entry.operation === "gte"));
});

test("successful unlock audits only derived facts and sets a signed HttpOnly SameSite cookie", async () => {
  const state = resetState();
  const response = await unlockPost(jsonRequest(SECRET));
  const payloadText = await response.text();
  const cookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 200);
  assert.equal(payloadText.includes(SECRET), false);
  assert.deepEqual(state.verifyCalls, [
    { password: SECRET, passwordHash: PASSWORD_HASH },
  ]);
  assert.deepEqual(state.grantCalls, [
    {
      token: TOKEN,
      inviteId: "invite-password-1",
      passwordHash: PASSWORD_HASH,
      inviteExpiresAt: "2026-07-16T12:00:00.000Z",
    },
  ]);
  assert.match(cookie, /^cvp_review_access=signed-grant;/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=600/i);
  assert.equal(state.auditRows.length, 1);
  assert.deepEqual(state.auditRows[0], {
    project_id: "project-password-1",
    asset_id: "asset-password-1",
    actor_id: null,
    actor_name: "External reviewer",
    action: "review_password_attempt",
    details: {
      review_invite_id: "invite-password-1",
      viewer_address_hash: "viewer-address-hash",
      outcome: "succeeded",
    },
  });
  assert.equal(JSON.stringify(state.auditRows[0]).includes(SECRET), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(state.auditRows[0], "password"),
    false,
  );
});

test("failed unlock attempts are audited without creating a grant", async () => {
  const state = resetState();
  state.passwordMatches = false;

  const response = await unlockPost(jsonRequest(SECRET));

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(state.grantCalls.length, 0);
  assert.equal(state.auditRows.length, 1);
  assert.equal(
    (state.auditRows[0].details as Record<string, unknown>).outcome,
    "failed",
  );
  assert.equal(JSON.stringify(state.auditRows[0]).includes(SECRET), false);
});

test("unlock source has no password logging or password-bearing audit fields", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/unlock/route.ts"),
    "utf8",
  );
  const recordAttemptStart = source.indexOf("async function recordAttempt");
  const handlerStart = source.indexOf("export async function POST");
  const recordAttemptSource = source.slice(recordAttemptStart, handlerStart);

  assert.ok(recordAttemptStart >= 0 && handlerStart > recordAttemptStart);
  assert.doesNotMatch(source, /console\.(?:debug|log|info|warn|error)\s*\(/);
  assert.doesNotMatch(source, /\b(?:logger|log)\.(?:debug|info|warn|error)\s*\(/);
  assert.doesNotMatch(recordAttemptSource, /\bpassword\s*:/);
  assert.doesNotMatch(recordAttemptSource, /\bpassword_hash\b/);
  assert.match(
    recordAttemptSource,
    /details:\s*\{[\s\S]*?review_invite_id:\s*inviteId,[\s\S]*?viewer_address_hash:\s*viewerHash,[\s\S]*?outcome,[\s\S]*?\}/,
  );
});

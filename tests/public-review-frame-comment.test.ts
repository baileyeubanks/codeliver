import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

type PinState = typeof globalThis & {
  __ccoPublicPinInserts: Array<{
    table: string;
    payload: Record<string, unknown>;
  }>;
  __ccoPublicReviewAuthorityCalls: Array<{
    kind: "authorize" | "reserve";
    input: unknown;
  }>;
  __ccoPublicReviewAuthorityResult: Record<string, unknown>;
  __ccoPublicReviewRateResult: Record<string, unknown>;
};
const state = globalThis as PinState;
state.__ccoPublicPinInserts = [];
state.__ccoPublicReviewAuthorityCalls = [];

const admittedInvite = {
  id: "invite-a",
  asset_id: "asset-a",
  version_id: "version-a",
  reviewer_name: "External reviewer",
  reviewer_email: "private-reviewer@example.test",
  permissions: "comment",
  password_hash: null,
  expires_at: null,
  watermark_enabled: false,
  watermark_text: null,
  download_enabled: false,
  view_count: 1,
  max_views: 1,
  last_viewed_at: null,
  active: true,
};
const admittedClaims = {
  admissionId: "11111111-1111-4111-8111-111111111111",
  inviteId: "22222222-2222-4222-8222-222222222222",
  assetId: "33333333-3333-4333-8333-333333333333",
  versionId: "44444444-4444-4444-8444-444444444444",
  issuedAt: 1_785_060_000,
  expiresAt: 1_785_060_900,
  admissionExpiresAt: 1_785_088_800,
};
state.__ccoPublicReviewAuthorityResult = {
  ok: true,
  invite: admittedInvite,
  claims: admittedClaims,
  setCookie:
    "__Host-cvp-review-admission-test=renewed; Path=/; HttpOnly; Secure; SameSite=Strict",
};
state.__ccoPublicReviewRateResult = { ok: true };

const accessStub = dataModule(`
  export async function getAssetComment() {
    return { ok: false, status: 404, error: "Comment not found" };
  }
`);

const emailStub = dataModule(`
  export async function sendEmail() {}
  export function getBaseUrl() { return "https://client.contentco-op.com"; }
  export const emailTemplates = {
    commentNotification() { return { subject: "Comment", html: "Comment" }; }
  };
`);

const reviewInviteStub = dataModule(`
  export function inviteCanComment(invite) {
    return invite.permissions === "comment";
  }
  export async function getReviewInviteByToken() {
    throw new Error("raw-token lookup must not authorize admitted actions");
  }
`);

const admissionAuthorityStub = dataModule(`
  export async function authorizeAdmittedReviewInvite(request, token) {
    globalThis.__ccoPublicReviewAuthorityCalls.push({
      kind: "authorize",
      input: { url: request.url, token }
    });
    return globalThis.__ccoPublicReviewAuthorityResult;
  }
  export async function reserveReviewActionRate(input) {
    globalThis.__ccoPublicReviewAuthorityCalls.push({
      kind: "reserve",
      input
    });
    return globalThis.__ccoPublicReviewRateResult;
  }
`);

const versionsStub = dataModule(`
  export async function resolveAssetVersion() {
    return { ok: true, version: { id: "version-a" } };
  }
`);

const demoStub = dataModule(`
  export const demoReviewPayload = {
    invite: { id: "demo-invite" },
    asset: { id: "demo-asset" },
    reviewer_name: "Demo reviewer",
    reviewer_email: "demo@example.test"
  };
`);

const supabaseStub = dataModule(`
  class Query {
    constructor(table) {
      this.table = table;
      this.payload = null;
    }
    select() { return this; }
    eq() { return this; }
    update(payload) {
      this.payload = payload;
      return this;
    }
    insert(payload) {
      this.payload = payload;
      globalThis.__ccoPublicPinInserts.push({ table: this.table, payload });
      return this;
    }
    async single() {
      if (this.table === "comments") {
        return {
          data: {
            id: "comment-a",
            ...this.payload,
            review_id: "private-review-id",
            rich_body: "<script>private</script>",
            frame_number: 120,
            mentions: ["private-user-id"],
            status: "open",
            resolved_by: "private-user-id",
            resolved_at: null,
            created_at: "2026-07-26T11:30:00.000Z",
            updated_at: "2026-07-26T11:30:00.000Z"
          },
          error: null
        };
      }
      if (this.table === "assets") {
        return {
          data: { project_id: "project-a", title: "Launch film" },
          error: null
        };
      }
      if (this.table === "projects") {
        return { data: { owner_id: "owner-a" }, error: null };
      }
      return { data: null, error: null };
    }
    then(resolve, reject) {
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }
  }

  export function getSupabase() {
    return {
      from(table) {
        return new Query(table);
      },
      auth: {
        admin: {
          async getUserById() {
            return { data: { user: null }, error: null };
          }
        }
      }
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStub, context);
    if (specifier === "@/lib/email") return nextResolve(emailStub, context);
    if (specifier === "@/lib/review-invites") {
      return nextResolve(reviewInviteStub, context);
    }
    if (specifier === "@/lib/review/admission-authority") {
      return nextResolve(admissionAuthorityStub, context);
    }
    if (specifier === "@/lib/versions") return nextResolve(versionsStub, context);
    if (specifier === "@/lib/review/demoReview") {
      return nextResolve(demoStub, context);
    }
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStub, context);
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

const context = { params: Promise.resolve({ token: "opaque-token" }) };

function request(body: Record<string, unknown>) {
  return new Request(
    "https://client.contentco-op.com/api/review/opaque-token/comments",
    {
      method: "POST",
      headers: {
        Origin: "https://client.contentco-op.com",
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(body),
    },
  );
}

test("anonymous public review persists a 0-100 frame pin and returns a safe projection", async () => {
  state.__ccoPublicPinInserts = [];
  state.__ccoPublicReviewAuthorityCalls = [];
  state.__ccoPublicReviewAuthorityResult = {
    ok: true,
    invite: admittedInvite,
    claims: admittedClaims,
    setCookie:
      "__Host-cvp-review-admission-test=renewed; Path=/; HttpOnly; Secure; SameSite=Strict",
  };
  state.__ccoPublicReviewRateResult = { ok: true };
  const { POST } = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts"),
    ).href
  );

  const response = await POST(
    request({
      body: "Pin this exact frame",
      author_name: "External reviewer",
      timecode_seconds: 4.25,
      pin_x: 25,
      pin_y: 75,
    }),
    context,
  );

  assert.equal(response.status, 201);
  assert.equal(
    response.headers.get("set-cookie"),
    state.__ccoPublicReviewAuthorityResult.setCookie,
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(
    state.__ccoPublicReviewAuthorityCalls.map((call) => call.kind),
    ["authorize", "reserve"],
  );
  assert.equal(
    (
      state.__ccoPublicReviewAuthorityCalls[1]?.input as {
        action?: string;
      }
    )?.action,
    "comment",
  );
  const commentWrite = state.__ccoPublicPinInserts.find(
    (write) => write.table === "comments",
  );
  assert.deepEqual(
    [commentWrite?.payload.pin_x, commentWrite?.payload.pin_y],
    [25, 75],
  );
  assert.equal(commentWrite?.payload.version_id, "version-a");
  assert.equal(commentWrite?.payload.visibility, "external");

  const payload = await response.json();
  assert.deepEqual([payload.pin_x, payload.pin_y], [25, 75]);
  assert.equal(payload.asset_id, "asset-a");
  assert.equal(payload.version_id, "version-a");
  assert.doesNotMatch(
    JSON.stringify(payload),
    /author_email|author_id|review_invite_id|review_id|rich_body|mentions|resolved_by|private-reviewer|private-user-id/,
  );
});

test("anonymous public review rejects incomplete and out-of-range pins before any write", async () => {
  const { POST } = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts"),
    ).href
  );

  for (const coordinates of [
    { pin_x: 50, pin_y: null },
    { pin_x: -0.01, pin_y: 50 },
    { pin_x: 50, pin_y: 100.01 },
  ]) {
    state.__ccoPublicPinInserts = [];
    const response = await POST(
      request({ body: "Invalid pin", ...coordinates }),
      context,
    );
    assert.equal(response.status, 400);
    assert.equal(state.__ccoPublicPinInserts.length, 0);
  }
});

test("anonymous public review rejects a missing live admission before rate authority or writes", async () => {
  const { POST } = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts"),
    ).href
  );
  state.__ccoPublicPinInserts = [];
  state.__ccoPublicReviewAuthorityCalls = [];
  state.__ccoPublicReviewAuthorityResult = {
    ok: false,
    status: 404,
    code: "REVIEW_ADMISSION_INVALID",
  };
  state.__ccoPublicReviewRateResult = { ok: true };

  const response = await POST(
    request({
      body: "This cannot cross the admission boundary",
      timecode_seconds: 4.25,
      pin_x: 25,
      pin_y: 75,
    }),
    context,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(
    state.__ccoPublicReviewAuthorityCalls.map((call) => call.kind),
    ["authorize"],
  );
  assert.equal(state.__ccoPublicPinInserts.length, 0);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

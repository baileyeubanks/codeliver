import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewInviteStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAuthorizedReviewInvite(request, token, options) {
    const state = globalThis.__publicReviewClaimRouteState;
    state.authorizationCalls.push({ request, token, options });
    return state.authorizationQueue.length
      ? state.authorizationQueue.shift()
      : state.inviteLookup;
  }
  export function createInviteReviewAccessGrant(token, invite) {
    const state = globalThis.__publicReviewClaimRouteState;
    state.compatibilityCookieCalls.push({ token, invite });
    return { name: "cvp_review_access_test", value: "signed-access", maxAge: 3600 };
  }
  export function getExternalApprovalState() {
    return { approvals: [], activeApprovalIds: [], approvalAccessMessage: null };
  }
  export function reviewInviteErrorPayload(result) {
    return result.passwordRequired
      ? { error: result.error, password_required: true }
      : { error: result.error };
  }
`)}`;
const reviewPasswordStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createReviewAccessGrant(input) {
    const state = globalThis.__publicReviewClaimRouteState;
    state.replayGrantCalls.push(input);
    return { name: "cvp_review_access_replay", value: "signed-replay", maxAge: 3600 };
  }
`)}`;
const reviewViewGrantStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createReviewViewGrant(input) {
    const state = globalThis.__publicReviewClaimRouteState;
    state.viewGrantCalls.push(input);
    return { name: "cvp_review_view_test", value: "signed-view", maxAge: 3600 };
  }
`)}`;
const shareClaimsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function usesAtomicShareLinkViewClaims() {
    return globalThis.__publicReviewClaimRouteState.atomicClaims;
  }
  export function reviewViewClaimRequestId(request) {
    return request.headers.get("x-review-view-claim-id");
  }
  export async function claimShareLinkView(input) {
    const state = globalThis.__publicReviewClaimRouteState;
    state.claimCalls.push(input);
    return state.claimQueue.length ? state.claimQueue.shift() : state.claimResult;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.updating = false;
    }
    select() { return this; }
    eq() { return this; }
    is() { return this; }
    or() { return this; }
    order() { return this; }
    update(payload) {
      const state = globalThis.__publicReviewClaimRouteState;
      state.legacyUpdateCalls.push(payload);
      this.updating = true;
      return this;
    }
    result() {
      const state = globalThis.__publicReviewClaimRouteState;
      if (this.updating && this.table === "review_invites") {
        return state.legacyUpdateResult;
      }
      return state.tableResults[this.table] ?? { data: [], error: null };
    }
    maybeSingle() { return Promise.resolve(this.result()); }
    then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); }
  }
  export function getSupabase() {
    return {
      from(table) {
        globalThis.__publicReviewClaimRouteState.tableCalls.push(table);
        return new QueryBuilder(table);
      },
    };
  }
`)}`;
const versionStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function resolveAssetVersion(input) {
    const state = globalThis.__publicReviewClaimRouteState;
    state.versionCalls.push(input);
    return state.versionLookup;
  }
`)}`;
const shareIntentStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function deriveShareIntent() { return "client_review"; }
`)}`;
const publicDtoStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function toPublicEditDecision(value) { return value; }
  export function toPublicReviewComment(value) { return value; }
  export function toPublicReviewAsset(asset, mediaUrl) {
    return { id: asset.id, title: asset.title, file_type: asset.file_type, file_url: mediaUrl, status: asset.status, projects: { name: asset.projects.name } };
  }
  export function toPublicReviewVersion(version, mediaUrl) {
    return { ...version, file_url: mediaUrl };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    const stubs = new Map([
      ["@/lib/review-invites", reviewInviteStubUrl],
      ["@/lib/security/review-password", reviewPasswordStubUrl],
      ["@/lib/security/review-view-grant", reviewViewGrantStubUrl],
      ["@/lib/sharing/share-claims", shareClaimsStubUrl],
      ["@/lib/supabase", supabaseStubUrl],
      ["@/lib/versions", versionStubUrl],
      ["@/lib/sharing/share-intent", shareIntentStubUrl],
      ["@/lib/review/public-dto", publicDtoStubUrl],
    ]);
    const stub = stubs.get(specifier);
    if (stub) return nextResolve(stub, context);
    if (specifier.startsWith("@/")) {
      const candidate = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(candidate)
        ? candidate
        : existsSync(`${candidate}.ts`)
          ? `${candidate}.ts`
          : `${candidate}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const TOKEN = "opaque-public-review-token";
const REQUEST_ID = "00000000-0000-4000-8000-000000000031";
const PROJECT_ID = "00000000-0000-4000-8000-000000000032";
const ASSET_ID = "00000000-0000-4000-8000-000000000033";
const INVITE_ID = "00000000-0000-4000-8000-000000000034";
const VERSION_ID = "00000000-0000-4000-8000-000000000035";
const CLAIM_ID = "00000000-0000-4000-8000-000000000036";

function successfulInvite() {
  return {
    ok: true as const,
    accessGranted: true,
    invite: {
      id: INVITE_ID,
      asset_id: ASSET_ID,
      version_id: VERSION_ID,
      reviewer_name: "Client Reviewer",
      reviewer_email: "reviewer@example.com",
      permissions: "comment",
      password_hash: null,
      expires_at: "2026-07-16T12:00:00.000Z",
      watermark_enabled: false,
      watermark_text: null,
      download_enabled: false,
      view_count: 1,
      max_views: 1,
      last_viewed_at: "2026-07-15T12:00:00.000Z",
      assets: {
        id: ASSET_ID,
        title: "Final client cut",
        file_type: "video/mp4",
        status: "in_review",
        projects: { id: PROJECT_ID, name: "Client project" },
      },
    },
  };
}

function successfulClaim(replayed = false) {
  return {
    ok: true as const,
    mode: "atomic" as const,
    claim: {
      claimId: CLAIM_ID,
      projectId: PROJECT_ID,
      assetId: ASSET_ID,
      inviteId: INVITE_ID,
      versionId: VERSION_ID,
      requestId: REQUEST_ID,
      viewCount: 1,
      maxViews: 1,
      claimedAt: "2026-07-15T12:00:00.000Z",
      replayed,
    },
  };
}

interface RouteState {
  atomicClaims: boolean;
  authorizationCalls: Array<{ request: Request; token: string; options: unknown }>;
  authorizationQueue: unknown[];
  claimCalls: Array<{ token: string; requestId: string | null }>;
  claimQueue: unknown[];
  claimResult: unknown;
  compatibilityCookieCalls: unknown[];
  replayGrantCalls: unknown[];
  viewGrantCalls: unknown[];
  legacyUpdateCalls: unknown[];
  legacyUpdateResult: { data: { view_count: number } | null; error: unknown };
  tableCalls: string[];
  tableResults: Record<string, { data: unknown; error: unknown }>;
  versionCalls: unknown[];
  versionLookup: { ok: true; version: Record<string, unknown> };
  inviteLookup: unknown;
}

const runtime = globalThis as typeof globalThis & {
  __publicReviewClaimRouteState: RouteState;
};

function resetState() {
  const state: RouteState = {
    atomicClaims: true,
    authorizationCalls: [],
    authorizationQueue: [],
    claimCalls: [],
    claimQueue: [],
    claimResult: successfulClaim(),
    compatibilityCookieCalls: [],
    replayGrantCalls: [],
    viewGrantCalls: [],
    legacyUpdateCalls: [],
    legacyUpdateResult: { data: { view_count: 1 }, error: null },
    tableCalls: [],
    tableResults: {
      comments: { data: [], error: null },
      approvals: { data: [], error: null },
      approval_workflows: { data: { id: "workflow", mode: "sequential", status: "active" }, error: null },
      edit_decisions: { data: [], error: null },
    },
    versionCalls: [],
    versionLookup: {
      ok: true,
      version: {
        id: VERSION_ID,
        asset_id: ASSET_ID,
        version_number: 1,
        file_url: "private/original.mp4",
      },
    },
    inviteLookup: successfulInvite(),
  };
  runtime.__publicReviewClaimRouteState = state;
  return state;
}

async function reviewGet(headers: HeadersInit = {}) {
  const route = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/route.ts")).href
  );
  return route.GET(
    new Request(`https://co-videopro.com/api/review/${TOKEN}`, { headers }),
    { params: Promise.resolve({ token: TOKEN }) },
  );
}

test("atomic review claims replay once and issue both access and media grants", async () => {
  const state = resetState();
  state.claimResult = successfulClaim(true);
  const response = await reviewGet({ "X-Review-View-Claim-Id": REQUEST_ID });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.invite.view_count, 1);
  assert.equal(payload.invite.max_views, 1);
  assert.deepEqual(state.claimCalls, [{ token: TOKEN, requestId: REQUEST_ID }]);
  assert.equal(state.legacyUpdateCalls.length, 0);
  assert.equal(state.viewGrantCalls.length, 1);
  const cookies = response.headers.get("set-cookie") ?? "";
  assert.match(cookies, /cvp_review_access_test=signed-access/);
  assert.match(cookies, /cvp_review_view_test=signed-view/);
  assert.equal("token" in payload.invite, false);
  assert.equal("token_hash" in payload.invite, false);
  assert.equal("claim_id" in payload.invite, false);
});

test("a lost final-view response is recovered with the same committed request ID", async () => {
  const state = resetState();
  state.authorizationQueue.push(
    { ok: false, status: 410, error: "This review link has reached its view limit" },
    successfulInvite(),
  );
  state.claimResult = successfulClaim(true);

  const response = await reviewGet({ "X-Review-View-Claim-Id": REQUEST_ID });

  assert.equal(response.status, 200);
  assert.equal(state.authorizationCalls.length, 2);
  assert.match(
    state.authorizationCalls[1].request.headers.get("cookie") ?? "",
    /cvp_review_access_replay=signed-replay/,
  );
  assert.equal(state.replayGrantCalls.length, 1);
  assert.deepEqual(state.claimCalls, [{ token: TOKEN, requestId: REQUEST_ID }]);
});

test("an exhausted atomic claim is rejected before review data is read", async () => {
  const state = resetState();
  state.claimResult = {
    ok: false,
    mode: "atomic",
    status: 410,
    code: "exhausted",
    error: "This review link has reached its view limit",
  };

  const response = await reviewGet({ "X-Review-View-Claim-Id": REQUEST_ID });

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    error: "This review link has reached its view limit",
  });
  assert.equal(state.tableCalls.length, 0);
  assert.equal(state.versionCalls.length, 0);
  assert.equal(state.viewGrantCalls.length, 0);
});

test("password authorization happens before an isolated view is claimed", async () => {
  const state = resetState();
  state.inviteLookup = {
    ok: false,
    status: 401,
    error: "Password required",
    passwordRequired: true,
  };

  const response = await reviewGet({ "X-Review-View-Claim-Id": REQUEST_ID });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Password required",
    password_required: true,
  });
  assert.equal(state.claimCalls.length, 0);
  assert.equal(state.tableCalls.length, 0);
});

test("legacy reviews preserve the existing counter path without claim headers", async () => {
  const state = resetState();
  state.atomicClaims = false;
  const invite = successfulInvite();
  invite.accessGranted = false;
  invite.invite.view_count = 0;
  state.inviteLookup = invite;

  const response = await reviewGet();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.invite.view_count, 1);
  assert.equal(state.claimCalls.length, 0);
  assert.equal(state.legacyUpdateCalls.length, 1);
  assert.equal(state.viewGrantCalls.length, 0);
});

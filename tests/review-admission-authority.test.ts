import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  issueReviewAdmissionGrant,
  reviewAdmissionCookieName,
} from "../lib/review/admission-grant.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const signingKey = Buffer.alloc(32, 11).toString("base64url");
process.env.CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY = signingKey;

type RpcResult = { data: unknown; error: unknown };
type AuthorityState = typeof globalThis & {
  __cvpReviewAuthorityCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  __cvpReviewAuthorityResults: Record<string, RpcResult>;
};
const state = globalThis as AuthorityState;

const supabaseStub = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return {
      async rpc(name, args) {
        globalThis.__cvpReviewAuthorityCalls.push({ name, args });
        return globalThis.__cvpReviewAuthorityResults[name] ?? {
          data: null,
          error: { message: "missing RPC stub" }
        };
      }
    };
  }
`)}`;
const dataAuthorityStub = `data:text/javascript,${encodeURIComponent(`
  export const CO_PRODUCTION_DATA_SCHEMA = "co_production";
  export function getSupabaseDataSchema() {
    return "co_production";
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStub, context);
    }
    if (specifier === "@/lib/data-authority") {
      return nextResolve(dataAuthorityStub, context);
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, `${specifier.slice(2)}.ts`)).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const token = "review_token_opaque_1234567890";
const now = Math.floor(Date.now() / 1_000);
const ids = {
  admissionId: "11111111-1111-4111-8111-111111111111",
  inviteId: "22222222-2222-4222-8222-222222222222",
  assetId: "33333333-3333-4333-8333-333333333333",
  versionId: "44444444-4444-4444-8444-444444444444",
};

function admissionRow(overrides: Record<string, unknown> = {}) {
  return {
    admission_status: "admitted",
    admission_id: ids.admissionId,
    invite_id: ids.inviteId,
    asset_id: ids.assetId,
    version_id: ids.versionId,
    admission_expires_at: new Date((now + 8 * 60 * 60) * 1_000).toISOString(),
    view_count: 1,
    max_views: 1,
    retry_after_seconds: null,
    ...overrides,
  };
}

function authorityRow(overrides: Record<string, unknown> = {}) {
  return {
    admission_id: ids.admissionId,
    invite_id: ids.inviteId,
    asset_id: ids.assetId,
    version_id: ids.versionId,
    admission_expires_at: new Date((now + 8 * 60 * 60) * 1_000).toISOString(),
    reviewer_name: "External reviewer",
    reviewer_email: "reviewer@example.test",
    permissions: "approve",
    invite_expires_at: null,
    watermark_enabled: false,
    watermark_text: null,
    download_enabled: false,
    view_count: 1,
    max_views: 1,
    asset_title: "Launch film",
    asset_file_type: "video",
    asset_status: "in_review",
    project_id: "55555555-5555-4555-8555-555555555555",
    project_name: "Launch",
    ...overrides,
  };
}

function grantCookie() {
  const grant = issueReviewAdmissionGrant({
    token,
    ...ids,
    issuedAt: now,
    expiresAt: now + 15 * 60,
    admissionExpiresAt: now + 8 * 60 * 60,
  });
  return `${reviewAdmissionCookieName(ids.admissionId)}=${grant}`;
}

test("atomic admission passes only hashed token, server admission id, and keyed network bucket", async () => {
  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    admit_review_invite: { data: [admissionRow()], error: null },
  };
  const { admitReviewInvite } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );
  const result = await admitReviewInvite({
    token,
    admissionId: ids.admissionId,
    networkBucket: "a".repeat(64),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.admission.viewCount, 1);
  assert.equal(result.admission.maxViews, 1);
  assert.deepEqual(state.__cvpReviewAuthorityCalls, [{
    name: "admit_review_invite",
    args: {
      p_token_hash:
        createHash("sha256").update(token, "utf8").digest("hex"),
      p_admission_id: ids.admissionId,
      p_network_bucket: "a".repeat(64),
    },
  }]);
  assert.equal(
    JSON.stringify(state.__cvpReviewAuthorityCalls).includes(token),
    false,
  );
});

test("admission rate exhaustion and authority failure fail closed", async () => {
  const { admitReviewInvite } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );

  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    admit_review_invite: {
      data: [admissionRow({
        admission_status: "rate_limited",
        admission_id: null,
        retry_after_seconds: 17,
      })],
      error: null,
    },
  };
  assert.deepEqual(
    await admitReviewInvite({
      token,
      admissionId: ids.admissionId,
      networkBucket: "b".repeat(64),
    }),
    {
      ok: false,
      status: 429,
      code: "REVIEW_ADMISSION_RATE_LIMITED",
      retryAfterSeconds: 17,
    },
  );

  state.__cvpReviewAuthorityResults = {
    admit_review_invite: {
      data: null,
      error: { message: "private database detail" },
    },
  };
  assert.deepEqual(
    await admitReviewInvite({
      token,
      admissionId: ids.admissionId,
      networkBucket: "b".repeat(64),
    }),
    {
      ok: false,
      status: 503,
      code: "REVIEW_ADMISSION_UNAVAILABLE",
    },
  );
});

test("admission rejects a count above max while preserving equality for the admitted viewer", async () => {
  const { admitReviewInvite } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );

  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    admit_review_invite: {
      data: [admissionRow({ view_count: 2, max_views: 1 })],
      error: null,
    },
  };
  assert.deepEqual(
    await admitReviewInvite({
      token,
      admissionId: ids.admissionId,
      networkBucket: "b".repeat(64),
    }),
    {
      ok: false,
      status: 503,
      code: "REVIEW_ADMISSION_UNAVAILABLE",
    },
  );
});

test("payload and reviewer actions reuse the admitted max-view session and compare every signed identity", async () => {
  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    authorize_review_admission: {
      data: [authorityRow()],
      error: null,
    },
  };
  const { authorizeAdmittedReviewInvite } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );
  const request = new Request(
    `https://client.contentco-op.com/api/review/${token}`,
    { headers: { Cookie: grantCookie() } },
  );
  const result = await authorizeAdmittedReviewInvite(request, token);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.invite.view_count, 1);
  assert.equal(result.invite.max_views, 1);
  assert.equal(result.invite.version_id, ids.versionId);
  assert.equal(result.invite.assets?.projects?.name, "Launch");
  assert.equal(result.invite.password_hash, null);

  state.__cvpReviewAuthorityResults = {
    authorize_review_admission: {
      data: [authorityRow({ version_id: "66666666-6666-4666-8666-666666666666" })],
      error: null,
    },
  };
  assert.deepEqual(
    await authorizeAdmittedReviewInvite(request, token),
    {
      ok: false,
      status: 404,
      code: "REVIEW_ADMISSION_INVALID",
    },
  );
});

test("review action throttles are exact-admission-bound and fail closed", async () => {
  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    reserve_review_action_rate_limit: {
      data: [{
        action_status: "allowed",
        admission_id: ids.admissionId,
        invite_id: ids.inviteId,
        asset_id: ids.assetId,
        version_id: ids.versionId,
        retry_after_seconds: null,
      }],
      error: null,
    },
  };
  const { reserveReviewActionRate } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );
  const claims = {
    ...ids,
    issuedAt: now,
    expiresAt: now + 15 * 60,
    admissionExpiresAt: now + 8 * 60 * 60,
  };
  assert.deepEqual(
    await reserveReviewActionRate({
      token,
      claims,
      action: "comment",
    }),
    { ok: true },
  );
  assert.deepEqual(state.__cvpReviewAuthorityCalls, [{
    name: "reserve_review_action_rate_limit",
    args: {
      p_admission_id: ids.admissionId,
      p_token_hash:
        createHash("sha256").update(token, "utf8").digest("hex"),
      p_action: "comment",
    },
  }]);
  assert.equal(
    JSON.stringify(state.__cvpReviewAuthorityCalls).includes(token),
    false,
  );

  state.__cvpReviewAuthorityResults = {
    reserve_review_action_rate_limit: {
      data: [{
        action_status: "rate_limited",
        admission_id: ids.admissionId,
        invite_id: ids.inviteId,
        asset_id: ids.assetId,
        version_id: ids.versionId,
        retry_after_seconds: 9,
      }],
      error: null,
    },
  };
  assert.deepEqual(
    await reserveReviewActionRate({
      token,
      claims,
      action: "comment",
    }),
    {
      ok: false,
      status: 429,
      code: "REVIEW_ACTION_RATE_LIMITED",
      retryAfterSeconds: 9,
    },
  );

  state.__cvpReviewAuthorityResults = {
    reserve_review_action_rate_limit: {
      data: [{
        action_status: "allowed",
        admission_id: ids.admissionId,
        invite_id: ids.inviteId,
        asset_id: "88888888-8888-4888-8888-888888888888",
        version_id: ids.versionId,
        retry_after_seconds: null,
      }],
      error: null,
    },
  };
  assert.deepEqual(
    await reserveReviewActionRate({
      token,
      claims,
      action: "comment",
    }),
    {
      ok: false,
      status: 404,
      code: "REVIEW_ADMISSION_INVALID",
    },
  );
});

test("an expired short grant must renew through admission before payload or action authority", async () => {
  const admissionExpiresAt = now + 7 * 60 * 60;
  const expiredGrant = issueReviewAdmissionGrant({
    token,
    ...ids,
    issuedAt: now - 16 * 60,
    expiresAt: now - 60,
    admissionExpiresAt,
  });
  const request = new Request(
    `https://client.contentco-op.com/api/review/${token}`,
    {
      headers: {
        Cookie:
          `${reviewAdmissionCookieName(ids.admissionId)}=${expiredGrant}`,
      },
    },
  );
  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    authorize_review_admission: {
      data: [authorityRow({
        admission_expires_at: new Date(
          admissionExpiresAt * 1_000,
        ).toISOString(),
      })],
      error: null,
    },
  };
  const { authorizeAdmittedReviewInvite } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );
  const result = await authorizeAdmittedReviewInvite(request, token);

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    code: "REVIEW_ADMISSION_INVALID",
  });
  assert.deepEqual(state.__cvpReviewAuthorityCalls, []);
});

test("token-free media authority recovers the signed token hash and rejects receipt identity drift", async () => {
  const mediaRow = {
    admission_id: ids.admissionId,
    invite_id: ids.inviteId,
    asset_id: ids.assetId,
    version_id: ids.versionId,
    admission_expires_at: new Date((now + 8 * 60 * 60) * 1_000).toISOString(),
    download_enabled: false,
    watermark_enabled: false,
    file_size: 10,
    source_upload_id: "77777777-7777-4777-8777-777777777777",
    storage_provider: "local",
    storage_object_key: "tenants/a/objects/b/v1/master.mov",
    storage_sha256: "c".repeat(64),
    storage_provider_version_id: `fs-v1:${"d".repeat(64)}`,
    storage_committed_at: new Date(now * 1_000).toISOString(),
    original_filename: "master.mov",
    mime_type: "video/quicktime",
  };
  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    authorize_review_media: { data: [mediaRow], error: null },
  };
  const { authorizeReviewMedia } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );
  const request = new Request(
    `https://client.contentco-op.com/api/review/media/${ids.admissionId}`,
    { headers: { Cookie: grantCookie() } },
  );
  const result = await authorizeReviewMedia(request, ids.admissionId);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.media.version_id, ids.versionId);
  assert.equal(result.media.storage_object_key, mediaRow.storage_object_key);
  assert.equal(state.__cvpReviewAuthorityCalls[0]?.name, "authorize_review_media");
  assert.equal(
    state.__cvpReviewAuthorityCalls[0]?.args.p_admission_id,
    ids.admissionId,
  );
  assert.match(
    String(state.__cvpReviewAuthorityCalls[0]?.args.p_token_hash),
    /^[0-9a-f]{64}$/,
  );

  state.__cvpReviewAuthorityResults = {
    authorize_review_media: {
      data: [{ ...mediaRow, asset_id: "88888888-8888-4888-8888-888888888888" }],
      error: null,
    },
  };
  assert.deepEqual(
    await authorizeReviewMedia(request, ids.admissionId),
    {
      ok: false,
      status: 404,
      code: "REVIEW_MEDIA_NOT_FOUND",
    },
  );
});

test("token-free media rejects an expired grant until admission renews it", async () => {
  const admissionExpiresAt = now + 7 * 60 * 60;
  const expiredGrant = issueReviewAdmissionGrant({
    token,
    ...ids,
    issuedAt: now - 16 * 60,
    expiresAt: now - 60,
    admissionExpiresAt,
  });
  const mediaRow = {
    admission_id: ids.admissionId,
    invite_id: ids.inviteId,
    asset_id: ids.assetId,
    version_id: ids.versionId,
    admission_expires_at: new Date(
      admissionExpiresAt * 1_000,
    ).toISOString(),
    download_enabled: false,
    watermark_enabled: false,
    file_size: 10,
    source_upload_id: "77777777-7777-4777-8777-777777777777",
    storage_provider: "local",
    storage_object_key: "tenants/a/objects/b/v1/master.mov",
    storage_sha256: "c".repeat(64),
    storage_provider_version_id: `fs-v1:${"d".repeat(64)}`,
    storage_committed_at: new Date(now * 1_000).toISOString(),
    original_filename: "master.mov",
    mime_type: "video/quicktime",
  };
  state.__cvpReviewAuthorityCalls = [];
  state.__cvpReviewAuthorityResults = {
    authorize_review_media: { data: [mediaRow], error: null },
  };
  const { authorizeReviewMedia } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review/admission-authority.ts"))
      .href
  );
  const request = new Request(
    `https://client.contentco-op.com/api/review/media/${ids.admissionId}`,
    {
      headers: {
        Cookie:
          `${reviewAdmissionCookieName(ids.admissionId)}=${expiredGrant}`,
      },
    },
  );
  const result = await authorizeReviewMedia(request, ids.admissionId);

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    code: "REVIEW_MEDIA_NOT_FOUND",
  });
  assert.deepEqual(state.__cvpReviewAuthorityCalls, []);
});

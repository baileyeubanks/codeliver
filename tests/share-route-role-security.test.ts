import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stub(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const authStubUrl = stub(`
  export async function requireAuth() {
    return globalThis.__ccoShareRouteUser ?? null;
  }
`);

const accessStubUrl = stub(`
  export const PROJECT_ROLE_RANK = {
    viewer: 10,
    reviewer: 30,
    member: 50,
    editor: 60,
    producer: 70,
    admin: 80,
    owner: 100,
  };

  export async function getAssetAccess(assetId, userId, minimumRole) {
    globalThis.__ccoShareRouteAccessCalls.push({ assetId, userId, minimumRole });
    const access = globalThis.__ccoShareRouteAccess;
    if (!access || access.rank < PROJECT_ROLE_RANK[minimumRole]) {
      return { ok: false, status: 404, error: "Asset not found" };
    }
    return {
      ok: true,
      data: { access_role: access.role, access_rank: access.rank },
    };
  }
`);

const emailStubUrl = stub(`
  export function getBaseUrl() {
    return "https://client.contentco-op.com";
  }
`);

const notificationStubUrl = stub(`
  export function getExternalNotificationAdapters() {
    return {};
  }
`);

const tokenStubUrl = stub(`
  export function recoverOpaqueToken(row) {
    globalThis.__ccoShareRouteRecoveryCalls.push(row.id);
    return row.token ?? "recovered-token";
  }

  export function withoutPersistedTokenSecrets(row) {
    const safe = { ...row };
    delete safe.token_hash;
    delete safe.token_ciphertext;
    return safe;
  }
`);

const shareApiStubUrl = stub(`
  export async function executeShareManifest(input) {
    globalThis.__ccoShareRouteCreateCalls.push(input);
    return {
      status: 201,
      body: { token: "created-token", invite: { id: "invite-created" } },
    };
  }

  export function singleShareResponseBody(body) {
    return body;
  }
`);

const shareManifestStubUrl = stub(`
  export function parseSingleShareRequest(body, context) {
    globalThis.__ccoShareRouteParseCalls.push({ body, context });
    return { ok: true, value: { manifestId: "manifest-a", items: [] } };
  }
`);

const shareServiceStubUrl = stub(`
  export function deriveShareIntentFromRow() {
    return "client_review";
  }

  export async function rotateShareLink(input) {
    globalThis.__ccoShareRouteRotateCalls.push(input);
    return { ok: true, invite: { id: "invite-rotated", token: "rotated-token" } };
  }

  export async function revokeShareLink(input) {
    globalThis.__ccoShareRouteRevokeCalls.push(input);
    return { ok: true, revoked: true };
  }
`);

const supabaseStubUrl = stub(`
  export function getSupabase() {
    return globalThis.__ccoShareRouteSupabase;
  }
`);

const versionsStubUrl = stub(`
  export async function resolveAssetVersion({ versionId }) {
    return {
      ok: true,
      version: { id: versionId, version_number: 4, is_current: true },
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/email") return nextResolve(emailStubUrl, context);
    if (specifier === "@/lib/notifications/adapters") {
      return nextResolve(notificationStubUrl, context);
    }
    if (specifier === "@/lib/security/opaque-token") return nextResolve(tokenStubUrl, context);
    if (specifier === "@/lib/sharing/share-api") return nextResolve(shareApiStubUrl, context);
    if (specifier === "@/lib/sharing/share-manifest") {
      return nextResolve(shareManifestStubUrl, context);
    }
    if (specifier === "@/lib/sharing/share-service") {
      return nextResolve(shareServiceStubUrl, context);
    }
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier === "@/lib/versions") return nextResolve(versionsStubUrl, context);
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;

type ShareRouteTestState = typeof globalThis & {
  __ccoShareRouteUser?: { id: string; email: string } | null;
  __ccoShareRouteAccess?: { role: string; rank: number };
  __ccoShareRouteAccessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
  }>;
  __ccoShareRouteRecoveryCalls: string[];
  __ccoShareRouteCreateCalls: Row[];
  __ccoShareRouteParseCalls: Row[];
  __ccoShareRouteRotateCalls: Row[];
  __ccoShareRouteRevokeCalls: Row[];
  __ccoShareRouteSupabase: {
    from(table: string): {
      select(): unknown;
      eq(column: string, value: unknown): unknown;
      order(column: string, options: { ascending: boolean }): Promise<{
        data: Row[];
        error: null;
      }>;
    };
  };
};

const state = globalThis as ShareRouteTestState;

const storedInvite: Row = {
  id: "invite-a",
  asset_id: "asset-a",
  version_id: "version-a",
  token: "legacy-bearer-token",
  token_hash: "stored-token-hash",
  token_ciphertext: "stored-token-ciphertext",
  password_hash: "stored-password-hash",
  reviewer_email: "recipient@example.test",
  reviewer_name: "Recipient Name",
  permissions: "comment",
  expires_at: "2099-01-01T00:00:00.000Z",
  watermark_enabled: true,
  watermark_text: "Recipient Name / recipient@example.test",
  download_enabled: false,
  max_views: 10,
  view_count: 2,
  created_at: "2026-07-15T00:00:00.000Z",
};

function configure(role = "member", rank = 50) {
  state.__ccoShareRouteUser = { id: "user-a", email: "user-a@example.test" };
  state.__ccoShareRouteAccess = { role, rank };
  state.__ccoShareRouteAccessCalls = [];
  state.__ccoShareRouteRecoveryCalls = [];
  state.__ccoShareRouteCreateCalls = [];
  state.__ccoShareRouteParseCalls = [];
  state.__ccoShareRouteRotateCalls = [];
  state.__ccoShareRouteRevokeCalls = [];
  state.__ccoShareRouteSupabase = {
    from(table: string) {
      assert.equal(table, "review_invites");
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        async order() {
          return { data: [{ ...storedInvite }], error: null };
        },
      };
      return query;
    },
  };
}

async function routeModule() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/[id]/share/route.ts")).href
  );
}

function request(method: string, body?: unknown) {
  return new Request("https://admin.contentco-op.com/api/assets/asset-a/share", {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "asset-a" }) };

test.beforeEach(() => configure());

test("member share listings never recover or expose bearer credentials and recipient PII", async () => {
  const { GET } = await routeModule();

  const response = await GET(request("GET"), context);
  const body = (await response.json()) as { items: Row[] };

  assert.equal(response.status, 200);
  assert.equal(body.items.length, 1);
  assert.deepEqual(state.__ccoShareRouteRecoveryCalls, []);
  assert.deepEqual(state.__ccoShareRouteAccessCalls, [
    { assetId: "asset-a", userId: "user-a", minimumRole: "member" },
  ]);

  const item = body.items[0];
  assert.equal(item.id, "invite-a");
  assert.equal(item.permissions, "comment");
  assert.equal(item.authority_status, "active");
  for (const field of [
    "token",
    "token_hash",
    "token_ciphertext",
    "password_hash",
    "reviewer_email",
    "reviewer_name",
    "watermark_text",
  ]) {
    assert.equal(field in item, false, `${field} must be omitted`);
  }
  assert.doesNotMatch(
    JSON.stringify(body),
    /legacy-bearer-token|stored-token|stored-password|recipient@example\.test|Recipient Name/,
  );
});

test("owner listings preserve recoverable links while omitting persisted secrets", async () => {
  configure("owner", 100);
  const { GET } = await routeModule();

  const response = await GET(request("GET"), context);
  const body = (await response.json()) as { items: Row[] };
  const item = body.items[0];

  assert.equal(response.status, 200);
  assert.equal(item.token, "legacy-bearer-token");
  assert.equal(item.reviewer_email, "recipient@example.test");
  assert.equal(item.reviewer_name, "Recipient Name");
  assert.equal(item.watermark_text, "Recipient Name / recipient@example.test");
  assert.deepEqual(state.__ccoShareRouteRecoveryCalls, ["invite-a"]);
  assert.equal("token_hash" in item, false);
  assert.equal("token_ciphertext" in item, false);
  assert.equal("password_hash" in item, false);
});

test("members cannot rotate or revoke share links", async () => {
  const { DELETE, PATCH } = await routeModule();

  const rotateResponse = await PATCH(
    request("PATCH", {
      action: "rotate",
      id: "invite-a",
      request_id: "rotation-request-0001",
    }),
    context,
  );
  const revokeResponse = await DELETE(request("DELETE", { id: "invite-a" }), context);

  assert.equal(rotateResponse.status, 404);
  assert.equal(revokeResponse.status, 404);
  assert.deepEqual(state.__ccoShareRouteAccessCalls, [
    { assetId: "asset-a", userId: "user-a", minimumRole: "admin" },
    { assetId: "asset-a", userId: "user-a", minimumRole: "admin" },
  ]);
  assert.deepEqual(state.__ccoShareRouteRotateCalls, []);
  assert.deepEqual(state.__ccoShareRouteRevokeCalls, []);
});

test("owners retain rotate and revoke lifecycle behavior", async () => {
  configure("owner", 100);
  const { DELETE, PATCH } = await routeModule();

  const rotateResponse = await PATCH(
    request("PATCH", {
      action: "rotate",
      id: "invite-a",
      request_id: "rotation-request-0001",
    }),
    context,
  );
  const revokeResponse = await DELETE(request("DELETE", { id: "invite-a" }), context);

  assert.equal(rotateResponse.status, 200);
  assert.equal(revokeResponse.status, 200);
  assert.equal(state.__ccoShareRouteRotateCalls.length, 1);
  assert.equal(state.__ccoShareRouteRevokeCalls.length, 1);
  assert.equal(state.__ccoShareRouteRotateCalls[0].assetId, "asset-a");
  assert.equal(state.__ccoShareRouteRevokeCalls[0].inviteId, "invite-a");
});

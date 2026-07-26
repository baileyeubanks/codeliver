import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type ReviewInviteSchema = "public" | "co_production";
type ReviewInviteRow = Record<string, unknown>;

type ReviewInviteTestState = typeof globalThis & {
  __ccoReviewInviteSchema?: ReviewInviteSchema;
  __ccoReviewInviteRow?: ReviewInviteRow | null;
  __ccoReviewInviteSelect?: string;
};

const state = globalThis as ReviewInviteTestState;

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const authorityStub = dataModule(`
  export const CO_PRODUCTION_DATA_SCHEMA = "co_production";
  export function getSupabaseDataSchema() {
    return globalThis.__ccoReviewInviteSchema || "public";
  }
`);

const opaqueTokenStub = dataModule(`
  export function opaqueTokenLookup(token) {
    return globalThis.__ccoReviewInviteSchema === "co_production"
      ? { column: "token_hash", value: "hashed-" + token }
      : { column: "token", value: token };
  }

  export function withoutPersistedTokenSecrets(row) {
    const safe = { ...row };
    delete safe.token;
    delete safe.token_hash;
    delete safe.token_ciphertext;
    return safe;
  }

  export function persistedOpaqueTokenFields() {
    throw new Error("invite creation is outside this test");
  }
`);

const versionsStub = dataModule(`
  export async function resolveAssetVersion() {
    throw new Error("version resolution is outside this test");
  }
`);

const supabaseStub = dataModule(`
  class Query {
    select(columns) {
      globalThis.__ccoReviewInviteSelect = columns;
      return this;
    }
    eq() {
      return this;
    }
    async maybeSingle() {
      return {
        data: globalThis.__ccoReviewInviteRow ?? null,
        error: null
      };
    }
  }

  export function getSupabase() {
    return {
      from(table) {
        if (table !== "review_invites") {
          throw new Error("unexpected table: " + table);
        }
        return new Query();
      }
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/data-authority") {
      return nextResolve(authorityStub, context);
    }
    if (specifier === "@/lib/security/opaque-token") {
      return nextResolve(opaqueTokenStub, context);
    }
    if (specifier === "@/lib/versions") {
      return nextResolve(versionsStub, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStub, context);
    }
    return nextResolve(specifier, context);
  },
});

function inviteRow(overrides: ReviewInviteRow = {}): ReviewInviteRow {
  return {
    id: "invite-a",
    asset_id: "asset-a",
    version_id: "version-a",
    reviewer_name: "External reviewer",
    reviewer_email: "reviewer@example.test",
    permissions: "comment",
    password_hash: null,
    expires_at: null,
    watermark_enabled: false,
    watermark_text: null,
    download_enabled: false,
    view_count: 0,
    max_views: null,
    last_viewed_at: null,
    assets: {
      id: "asset-a",
      title: "Launch film",
      file_type: "video",
      file_url: null,
      status: "in_review",
      deleted_at: null,
      projects: { id: "project-a", name: "Launch" },
    },
    ...overrides,
  };
}

async function reviewInvitesModule() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "lib/review-invites.ts")).href
  );
}

test.afterEach(() => {
  state.__ccoReviewInviteSchema = undefined;
  state.__ccoReviewInviteRow = undefined;
  state.__ccoReviewInviteSelect = undefined;
});

test("isolated review authority rejects an inactive invite", async () => {
  state.__ccoReviewInviteSchema = "co_production";
  state.__ccoReviewInviteRow = inviteRow({ active: false });
  const { getReviewInviteByToken } = await reviewInvitesModule();

  assert.deepEqual(await getReviewInviteByToken("opaque-token"), {
    ok: false,
    status: 410,
    error: "Invalid or expired review link",
  });
  assert.match(state.__ccoReviewInviteSelect ?? "", /\bactive\b/);
  assert.match(state.__ccoReviewInviteSelect ?? "", /\bpassword_hash\b/);
});

test("isolated review authority requires an explicit active=true row", async () => {
  state.__ccoReviewInviteSchema = "co_production";
  state.__ccoReviewInviteRow = inviteRow();
  const { getReviewInviteByToken } = await reviewInvitesModule();

  assert.deepEqual(await getReviewInviteByToken("opaque-token"), {
    ok: false,
    status: 410,
    error: "Invalid or expired review link",
  });
});

test("review authority rejects an invite whose asset is missing or soft-deleted", async () => {
  state.__ccoReviewInviteSchema = "co_production";
  const { getReviewInviteByToken } = await reviewInvitesModule();

  state.__ccoReviewInviteRow = inviteRow({
    active: true,
    assets: {
      id: "asset-a",
      title: "Launch film",
      file_type: "video",
      file_url: null,
      status: "in_review",
      deleted_at: "2026-07-26T00:00:00.000Z",
      projects: { id: "project-a", name: "Launch" },
    },
  });
  assert.deepEqual(await getReviewInviteByToken("opaque-token"), {
    ok: false,
    status: 410,
    error: "Invalid or expired review link",
  });

  state.__ccoReviewInviteRow = inviteRow({
    active: true,
    assets: null,
  });
  assert.deepEqual(await getReviewInviteByToken("opaque-token"), {
    ok: false,
    status: 410,
    error: "Invalid or expired review link",
  });
  assert.match(state.__ccoReviewInviteSelect ?? "", /\bdeleted_at\b/);
});

test("password-protected review links fail closed without server-side proof", async () => {
  state.__ccoReviewInviteSchema = "co_production";
  state.__ccoReviewInviteRow = inviteRow({
    active: true,
    password_hash: "server-only-password-hash",
  });
  const { getReviewInviteByToken } = await reviewInvitesModule();

  assert.deepEqual(await getReviewInviteByToken("opaque-token"), {
    ok: false,
    status: 403,
    error: "Password verification is required for this review link",
  });
});

test("legacy review authority remains compatible while protected rows fail closed", async () => {
  state.__ccoReviewInviteSchema = "public";
  state.__ccoReviewInviteRow = inviteRow();
  const { getReviewInviteByToken } = await reviewInvitesModule();

  const open = await getReviewInviteByToken("legacy-token");
  assert.equal(open.ok, true);
  assert.equal(open.ok && open.invite.password_hash, null);
  assert.doesNotMatch(state.__ccoReviewInviteSelect ?? "", /\bactive\b/);
  assert.match(state.__ccoReviewInviteSelect ?? "", /\bpassword_hash\b/);

  state.__ccoReviewInviteRow = inviteRow({
    password_hash: "legacy-password-hash",
  });
  assert.deepEqual(await getReviewInviteByToken("legacy-token"), {
    ok: false,
    status: 403,
    error: "Password verification is required for this review link",
  });
});

test("admitted invite records never retain token or password secrets", async () => {
  state.__ccoReviewInviteSchema = "co_production";
  state.__ccoReviewInviteRow = inviteRow({
    active: true,
    token_hash: "private-token-hash",
    token_ciphertext: "private-token-ciphertext",
  });
  const { getReviewInviteByToken } = await reviewInvitesModule();

  const result = await getReviewInviteByToken("opaque-token");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.invite.password_hash, null);
  assert.equal(result.ok && "token_hash" in result.invite, false);
  assert.equal(result.ok && "token_ciphertext" in result.invite, false);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoClientReviewInboxUser ?? null;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    const client = globalThis.__ccoClientReviewInboxSupabase;
    if (!client) throw new Error("Missing client review Supabase stub");
    return client;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
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

const { buildClientReviewInbox } = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/client-review-inbox.ts")).href
);
const { GET: getClientReviews } = await import(
  pathToFileURL(resolve(repositoryRoot, "app/api/client/reviews/route.ts")).href
);

type StubUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  app_metadata: Record<string, unknown>;
} | null;

interface QueryFilter {
  operator: "eq" | "is";
  column: string;
  value: unknown;
}

interface QueryCall {
  table: string;
  operation: "select" | "update" | null;
  values?: unknown;
  projection?: string;
  filters: QueryFilter[];
  order?: { column: string; options: unknown };
  limit?: number;
}

interface SupabaseStubOptions {
  rows?: Record<string, unknown>[];
  claimError?: unknown;
  readError?: unknown;
}

const runtimeState = globalThis as typeof globalThis & {
  __ccoClientReviewInboxUser?: StubUser;
  __ccoClientReviewInboxSupabase?: unknown;
};

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function inboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-open",
    asset_id: "asset-1",
    version_id: "version-1",
    reviewer_name: "Review Client",
    reviewer_email: "reviewer@example.com",
    reviewer_user_id: "client-user-1",
    permissions: "approve",
    expires_at: "2099-07-20T12:00:00.000Z",
    active: true,
    view_count: 1,
    max_views: 5,
    created_at: "2026-07-10T12:00:00.000Z",
    token: "review-token/open",
    token_ciphertext: "must-not-leak",
    assets: {
      id: "asset-1",
      title: "Campaign rough cut",
      status: "in_review",
      projects: { id: "project-1", name: "Campaign" },
    },
    ...overrides,
  };
}

function createSupabaseStub(options: SupabaseStubOptions = {}) {
  const calls: QueryCall[] = [];
  const client = {
    from(table: string) {
      const call: QueryCall = { table, operation: null, filters: [] };
      calls.push(call);

      const chain = {
        update(values: unknown) {
          call.operation = "update";
          call.values = values;
          return chain;
        },
        select(projection: string) {
          call.operation = "select";
          call.projection = projection;
          return chain;
        },
        is(column: string, value: unknown) {
          call.filters.push({ operator: "is", column, value });
          return chain;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ operator: "eq", column, value });
          if (call.operation === "update") {
            return { error: options.claimError ?? null };
          }
          return chain;
        },
        order(column: string, orderOptions: unknown) {
          call.order = { column, options: orderOptions };
          return chain;
        },
        limit(value: number) {
          call.limit = value;
          return {
            data: options.rows ?? [],
            error: options.readError ?? null,
          };
        },
      };

      return chain;
    },
  };

  return { calls, client };
}

test("client review helper emits bounded DTOs and keeps closed assignments inert", () => {
  const recoveredIds: string[] = [];
  const inbox = buildClientReviewInbox(
    [
      inboxRow({
        reviewer_email: " REVIEWER@Example.com ",
      }),
      inboxRow({
        id: "invite-expired",
        permissions: "comment",
        expires_at: "2026-07-14T12:00:00.000Z",
        created_at: "2026-07-14T12:00:00.000Z",
      }),
      inboxRow({
        id: "invite-revoked",
        permissions: "view",
        active: false,
        created_at: "2026-07-13T12:00:00.000Z",
      }),
      inboxRow({
        id: "invite-view-limit",
        permissions: "approve",
        view_count: 5,
        max_views: 5,
        created_at: "2026-07-12T12:00:00.000Z",
      }),
    ],
    "reviewer@example.com",
    {
      now: Date.parse("2026-07-15T12:00:00.000Z"),
      recoverToken(row) {
        recoveredIds.push(String(row.id));
        return `review-token/${String(row.id)}`;
      },
    },
  );

  assert.deepEqual(recoveredIds, ["invite-open"]);
  assert.deepEqual(inbox.summary, {
    total: 4,
    open: 1,
    history: 3,
    approvals: 1,
  });
  assert.deepEqual(
    inbox.items.map(({ id, accessStatus, reviewHref }) => ({
      id,
      accessStatus,
      reviewHref,
    })),
    [
      {
        id: "invite-open",
        accessStatus: "open",
        reviewHref: "/review/review-token%2Finvite-open",
      },
      { id: "invite-expired", accessStatus: "expired", reviewHref: null },
      { id: "invite-revoked", accessStatus: "revoked", reviewHref: null },
      {
        id: "invite-view-limit",
        accessStatus: "view_limit_reached",
        reviewHref: null,
      },
    ],
  );
  assert.deepEqual(inbox.items[0], {
    id: "invite-open",
    assetId: "asset-1",
    versionId: "version-1",
    assetTitle: "Campaign rough cut",
    assetStatus: "in_review",
    projectId: "project-1",
    projectName: "Campaign",
    reviewerName: "Review Client",
    permission: "approve",
    createdAt: "2026-07-10T12:00:00.000Z",
    expiresAt: "2099-07-20T12:00:00.000Z",
    accessStatus: "open",
    reviewHref: "/review/review-token%2Finvite-open",
  });
});

test("client review helper fails closed on identity, row, and credential drift", () => {
  assert.throws(
    () => buildClientReviewInbox([], "  "),
    /invalid client review inbox identity/i,
  );
  assert.throws(
    () =>
      buildClientReviewInbox(
        [inboxRow({ reviewer_email: "other@example.com" })],
        "reviewer@example.com",
      ),
    /identity mismatch/i,
  );
  assert.throws(
    () =>
      buildClientReviewInbox(
        [inboxRow({ permissions: "edit" })],
        "reviewer@example.com",
      ),
    /invalid client review inbox permission/i,
  );
  assert.throws(
    () =>
      buildClientReviewInbox(
        [inboxRow({ assets: null })],
        "reviewer@example.com",
      ),
    /invalid client review inbox asset/i,
  );
  assert.throws(
    () =>
      buildClientReviewInbox(
        [inboxRow({ created_at: "not-a-date" })],
        "reviewer@example.com",
      ),
    /invalid client review inbox creation time/i,
  );
  assert.throws(
    () =>
      buildClientReviewInbox([inboxRow()], "reviewer@example.com", {
        recoverToken: () => "",
      }),
    /invalid client review inbox credential/i,
  );
});

test("client review API binds and reads the exact verified reviewer principal", async () => {
  const stub = createSupabaseStub({ rows: [inboxRow()] });
  runtimeState.__ccoClientReviewInboxUser = {
    id: "client-user-1",
    email: " Reviewer@Example.COM ",
    email_confirmed_at: "2026-07-15T12:00:00.000Z",
    app_metadata: { content_coop_role: "client" },
  };
  runtimeState.__ccoClientReviewInboxSupabase = stub.client;

  const response = await getClientReviews();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.deepEqual(await response.json(), {
    items: [
      {
        id: "invite-open",
        assetId: "asset-1",
        versionId: "version-1",
        assetTitle: "Campaign rough cut",
        assetStatus: "in_review",
        projectId: "project-1",
        projectName: "Campaign",
        reviewerName: "Review Client",
        permission: "approve",
        createdAt: "2026-07-10T12:00:00.000Z",
        expiresAt: "2099-07-20T12:00:00.000Z",
        accessStatus: "open",
        reviewHref: "/review/review-token%2Fopen",
      },
    ],
    summary: { total: 1, open: 1, history: 0, approvals: 1 },
  });

  assert.deepEqual(stub.calls.map((call) => call.table), [
    "review_invites",
    "review_invites",
  ]);
  assert.deepEqual(stub.calls[0], {
    table: "review_invites",
    operation: "update",
    values: { reviewer_user_id: "client-user-1" },
    filters: [
      { operator: "is", column: "reviewer_user_id", value: null },
      { operator: "eq", column: "reviewer_email", value: "reviewer@example.com" },
    ],
  });
  assert.equal(stub.calls[1].operation, "select");
  assert.match(stub.calls[1].projection ?? "", /reviewer_user_id/);
  assert.doesNotMatch(stub.calls[1].projection ?? "", /^\s*\*\s*$/);
  assert.deepEqual(stub.calls[1].filters, [
    { operator: "eq", column: "reviewer_user_id", value: "client-user-1" },
  ]);
  assert.deepEqual(stub.calls[1].order, {
    column: "created_at",
    options: { ascending: false },
  });
  assert.equal(stub.calls[1].limit, 100);
});

test("client review API rejects unverified identities and data-authority drift", async () => {
  for (const { user, status, error } of [
    { user: null, status: 401, error: "Unauthorized" },
    {
      user: {
        id: "staff-user-1",
        email: "staff@example.com",
        email_confirmed_at: "2026-07-15T12:00:00.000Z",
        app_metadata: { content_coop_role: "staff" },
      },
      status: 403,
      error: "Forbidden",
    },
    {
      user: {
        id: "client-user-1",
        email: "reviewer@example.com",
        app_metadata: { content_coop_role: "client" },
      },
      status: 403,
      error: "Verified client email required",
    },
  ] as const) {
    const stub = createSupabaseStub();
    runtimeState.__ccoClientReviewInboxUser = user;
    runtimeState.__ccoClientReviewInboxSupabase = stub.client;

    const response = await getClientReviews();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
    assert.deepEqual(stub.calls, []);
  }

  runtimeState.__ccoClientReviewInboxUser = {
    id: "client-user-1",
    email: "reviewer@example.com",
    email_confirmed_at: "2026-07-15T12:00:00.000Z",
    app_metadata: { content_coop_role: "client" },
  };

  for (const options of [
    { claimError: new Error("claim failed") },
    { readError: new Error("read failed") },
    { rows: [inboxRow({ reviewer_email: "other@example.com" })] },
  ]) {
    const stub = createSupabaseStub(options);
    runtimeState.__ccoClientReviewInboxSupabase = stub.client;

    const response = await getClientReviews();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "Client reviews are temporarily unavailable",
    });
  }
});

test("client inbox component fails closed and never fetches project or asset APIs", () => {
  const componentSource = source("components/review/ClientReviewInbox.tsx");
  const helperSource = source("lib/client-review-inbox.ts");
  const apiSource = source("app/api/client/reviews/route.ts");
  const fetchTargets = Array.from(
    componentSource.matchAll(/fetch\(\s*(["'`])([^"'`]+)\1/g),
    (match) => match[2],
  );
  const fromTargets = Array.from(
    apiSource.matchAll(/\.from\(\s*(["'])\s*([^"']+)\s*\1\s*\)/g),
    (match) => match[2],
  );

  assert.deepEqual(fetchTargets, ["/api/client/reviews"]);
  assert.deepEqual(fromTargets, ["review_invites", "review_invites"]);
  assert.doesNotMatch(
    `${componentSource}\n${helperSource}`,
    /\/api\/(?:projects|assets)(?:\/|["'`])/,
  );
  assert.match(componentSource, /if \(!response\.ok\) throw new Error\(/);
  assert.match(
    componentSource,
    /if \(!isInboxPayload\(payload\)\) throw new Error\(/,
  );
  assert.match(
    componentSource,
    /\.catch\(\(\) => \{[\s\S]*?setInbox\(null\);[\s\S]*?setLoadState\("error"\);/,
  );
  assert.match(
    componentSource,
    /item\.accessStatus === "open" && isSameOriginReviewHref\(item\.reviewHref\)/,
  );
  assert.match(
    componentSource,
    /resolved\.origin === base\.origin && resolved\.pathname\.startsWith\("\/review\/"\)/,
  );
});

test("client reviewer migration binds auth users behind a restrictive staff policy", () => {
  const migration = source(
    "supabase/migrations/20260715190000_client_review_principal_binding.sql",
  );

  assert.match(
    migration,
    /ALTER TABLE co_production\.review_invites\s+ADD COLUMN IF NOT EXISTS reviewer_user_id uuid\s+REFERENCES auth\.users\(id\) ON DELETE SET NULL;/i,
  );
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS review_invites_reviewer_principal_idx\s+ON co_production\.review_invites\(reviewer_user_id, active, created_at DESC\)\s+WHERE reviewer_user_id IS NOT NULL;/i,
  );
  assert.match(
    migration,
    /coalesce\(auth\.jwt\(\) -> 'app_metadata' ->> 'content_coop_role', ''\) = 'staff'/,
  );
  assert.match(migration, /WHERE schemaname = 'co_production'/);
  assert.match(
    migration,
    /CREATE POLICY co_videopro_staff_surface_boundary ON %I\.%I AS RESTRICTIVE FOR ALL TO authenticated USING \(co_production_private\.is_staff_surface\(\)\) WITH CHECK \(co_production_private\.is_staff_surface\(\)\)/,
  );
});

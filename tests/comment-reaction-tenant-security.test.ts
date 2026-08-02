import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__commentReactionUser ?? null;
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAssetComment(commentId, assetId, client) {
    globalThis.__commentReactionCommentCalls.push({
      commentId,
      assetId,
      sameClient: client === globalThis.__commentReactionSupabase,
    });
    return globalThis.__commentReactionCommentAccess;
  }

  export async function getAssetAccess(assetId, userId, minimumRole, client) {
    globalThis.__commentReactionAssetCalls.push({
      assetId,
      userId,
      minimumRole,
      sameClient: client === globalThis.__commentReactionSupabase,
    });
    return globalThis.__commentReactionAssetAccess;
  }
`)}`;

const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    if (!globalThis.__commentReactionSupabase) {
      throw new Error("Missing comment reaction test provider");
    }
    return globalThis.__commentReactionSupabase;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessStubUrl, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    return nextResolve(specifier, context);
  },
});

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_COMMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VERSION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown };
type QueryResult = {
  data: Row[] | Row | null;
  error: { message: string } | null;
};
type Mutation = {
  table: string;
  operation: "upsert" | "delete";
  payload: Row | null;
  options: Record<string, unknown> | null;
  filters: Filter[];
};

class FakeQuery {
  private readonly database: FakeSupabase;
  private readonly table: string;
  private readonly filters: Filter[] = [];
  private operation: "select" | "upsert" | "delete" = "select";
  private payload: Row | null = null;
  private options: Record<string, unknown> | null = null;

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  upsert(payload: Row, options: Record<string, unknown>) {
    this.operation = "upsert";
    this.payload = { ...payload };
    this.options = { ...options };
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    const failure = this.failure();
    if (failure) return failure;
    const row = this.matchingRows()[0];
    return { data: row ? { ...row } : null, error: null };
  }

  async order(): Promise<QueryResult> {
    return this.execute();
  }

  then(
    onfulfilled?: (value: QueryResult) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matchingRows() {
    return (this.database.tables[this.table] ?? []).filter((row) =>
      this.filters.every(({ column, value }) => row[column] === value),
    );
  }

  private failure(): QueryResult | null {
    const message = this.database.failures[`${this.table}:${this.operation}`];
    return message ? { data: null, error: { message } } : null;
  }

  private async execute(): Promise<QueryResult> {
    const failure = this.failure();
    if (failure) return failure;

    if (this.operation === "select") {
      return {
        // Return complete fake rows so the route must explicitly allowlist output.
        data: this.matchingRows().map((row) => ({ ...row })),
        error: null,
      };
    }

    this.database.mutations.push({
      table: this.table,
      operation: this.operation,
      payload: this.payload ? { ...this.payload } : null,
      options: this.options ? { ...this.options } : null,
      filters: this.filters.map((filter) => ({ ...filter })),
    });

    if (this.operation === "upsert" && this.payload) {
      const rows = (this.database.tables[this.table] ??= []);
      const duplicate = rows.some(
        (row) =>
          row.comment_id === this.payload?.comment_id &&
          row.user_id === this.payload?.user_id &&
          row.emoji === this.payload?.emoji,
      );
      if (!duplicate) {
        rows.push({
          id: `reaction-${rows.length + 1}`,
          created_at: "2026-07-15T12:00:00.000Z",
          tenant_secret: "must-not-leak",
          ...this.payload,
        });
      }
    }

    if (this.operation === "delete") {
      const rows = this.database.tables[this.table] ?? [];
      this.database.tables[this.table] = rows.filter(
        (row) =>
          !this.filters.every(({ column, value }) => row[column] === value),
      );
    }

    return { data: null, error: null };
  }
}

class FakeSupabase {
  readonly failures: Record<string, string> = {};
  readonly mutations: Mutation[] = [];
  readonly tableCalls: string[] = [];
  readonly tables: Record<string, Row[]>;

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  from(table: string) {
    this.tableCalls.push(table);
    return new FakeQuery(this, table);
  }
}

type AccessSuccess = {
  ok: true;
  data: {
    id: string;
    asset_id: string;
    version_id: string | null;
    visibility: "internal" | "external";
  };
};
type AccessFailure = { ok: false; status: number; error: string };
type AssetAccess =
  | { ok: true; data: { id: string; access_role: string; access_rank: number } }
  | AccessFailure;
type CommentCall = {
  commentId: string;
  assetId: string;
  sameClient: boolean;
};
type AssetCall = {
  assetId: string;
  userId: string;
  minimumRole: string;
  sameClient: boolean;
};
type TestGlobals = typeof globalThis & {
  __commentReactionUser?: { id: string } | null;
  __commentReactionSupabase?: FakeSupabase;
  __commentReactionCommentAccess?: AccessSuccess | AccessFailure;
  __commentReactionAssetAccess?: AssetAccess;
  __commentReactionCommentCalls: CommentCall[];
  __commentReactionAssetCalls: AssetCall[];
};

const globals = globalThis as TestGlobals;

function configure() {
  globals.__commentReactionUser = { id: USER_A };
  globals.__commentReactionSupabase = new FakeSupabase({
    comments: [{ id: COMMENT_ID, asset_id: ASSET_ID, version_id: VERSION_ID }],
    comment_reactions: [],
  });
  globals.__commentReactionCommentAccess = {
    ok: true,
    data: {
      id: COMMENT_ID,
      asset_id: ASSET_ID,
      version_id: VERSION_ID,
      visibility: "internal",
    },
  };
  globals.__commentReactionAssetAccess = {
    ok: true,
    data: { id: ASSET_ID, access_role: "viewer", access_rank: 10 },
  };
  globals.__commentReactionCommentCalls = [];
  globals.__commentReactionAssetCalls = [];
}

function database() {
  assert.ok(globals.__commentReactionSupabase);
  return globals.__commentReactionSupabase;
}

function reactionRequest(method: "POST" | "DELETE", body: unknown) {
  return new Request("https://deliver.contentco-op.com/api/comments/reactions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(commentId = COMMENT_ID) {
  return new Request(
    `https://deliver.contentco-op.com/api/comments/reactions?comment_id=${encodeURIComponent(commentId)}`,
  );
}

async function reactionRoutes() {
  return import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/comments/reactions/route.ts"),
    ).href
  );
}

test.beforeEach(configure);

test("every reaction method authenticates before parsing or database access", async () => {
  globals.__commentReactionUser = null;
  const { GET, POST, DELETE } = await reactionRoutes();

  const responses = await Promise.all([
    GET(getRequest()),
    POST(reactionRequest("POST", { comment_id: COMMENT_ID, emoji: "👍" })),
    DELETE(
      reactionRequest("DELETE", { comment_id: COMMENT_ID, emoji: "👍" }),
    ),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [401, 401, 401],
  );
  assert.deepEqual(database().tableCalls, []);
  assert.deepEqual(globals.__commentReactionCommentCalls, []);
  assert.deepEqual(globals.__commentReactionAssetCalls, []);
});

test("comment IDs and reaction emoji are validated before lookup", async () => {
  const { GET, POST, DELETE } = await reactionRoutes();

  const responses = await Promise.all([
    GET(getRequest("not-a-uuid")),
    POST(reactionRequest("POST", { comment_id: "not-a-uuid", emoji: "👍" })),
    POST(reactionRequest("POST", { comment_id: COMMENT_ID, emoji: "<script>" })),
    DELETE(reactionRequest("DELETE", { comment_id: COMMENT_ID, emoji: "👍👍" })),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [400, 400, 400, 400],
  );
  assert.deepEqual(database().tableCalls, []);
});

test("cross-tenant access is denied before reaction rows or mutations are touched", async () => {
  globals.__commentReactionAssetAccess = {
    ok: false,
    status: 404,
    error: "Asset belongs to tenant beta",
  };
  const { GET, POST, DELETE } = await reactionRoutes();

  const responses = [
    await GET(getRequest()),
    await POST(
      reactionRequest("POST", { comment_id: COMMENT_ID, emoji: "👍" }),
    ),
    await DELETE(
      reactionRequest("DELETE", { comment_id: COMMENT_ID, emoji: "👍" }),
    ),
  ];

  assert.deepEqual(
    responses.map((response) => response.status),
    [404, 404, 404],
  );
  for (const response of responses) {
    assert.deepEqual(await response.json(), { error: "Comment not found" });
  }
  assert.equal(database().tableCalls.includes("comment_reactions"), false);
  assert.deepEqual(database().mutations, []);
  assert.equal(globals.__commentReactionCommentCalls.length, 3);
  assert.deepEqual(
    globals.__commentReactionAssetCalls.map(
      ({ assetId, userId, minimumRole, sameClient }) => ({
        assetId,
        userId,
        minimumRole,
        sameClient,
      }),
    ),
    Array.from({ length: 3 }, () => ({
      assetId: ASSET_ID,
      userId: USER_A,
      minimumRole: "viewer",
      sameClient: true,
    })),
  );
});

test("GET resolves the comment asset and version then returns safe aggregates", async () => {
  database().tables.comment_reactions.push(
    {
      id: "raw-a",
      comment_id: COMMENT_ID,
      user_id: USER_A,
      emoji: "👍",
      tenant_secret: "alpha-secret",
    },
    {
      id: "raw-b",
      comment_id: COMMENT_ID,
      user_id: USER_B,
      emoji: "👍",
      tenant_secret: "beta-secret",
    },
    {
      id: "raw-c",
      comment_id: COMMENT_ID,
      user_id: USER_B,
      emoji: "❤️",
    },
    {
      id: "legacy-unsafe",
      comment_id: COMMENT_ID,
      user_id: USER_B,
      emoji: "<script>",
    },
    {
      id: "other-comment",
      comment_id: OTHER_COMMENT_ID,
      user_id: USER_A,
      emoji: "🔥",
    },
  );
  const { GET } = await reactionRoutes();

  const response = await GET(getRequest());
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    reactions: [
      { emoji: "👍", count: 2, reacted_by_me: true },
      { emoji: "❤️", count: 1, reacted_by_me: false },
    ],
  });
  assert.doesNotMatch(JSON.stringify(payload), /raw-|user_id|tenant_secret|secret/);
  assert.deepEqual(globals.__commentReactionCommentCalls, [
    { commentId: COMMENT_ID, assetId: ASSET_ID, sameClient: true },
  ]);
  assert.deepEqual(globals.__commentReactionAssetCalls, [
    {
      assetId: ASSET_ID,
      userId: USER_A,
      minimumRole: "viewer",
      sameClient: true,
    },
  ]);
  assert.equal(
    globals.__commentReactionCommentAccess?.ok &&
      globals.__commentReactionCommentAccess.data.version_id,
    VERSION_ID,
  );
});

test("POST ignores spoofed ownership and returns only the new safe aggregate", async () => {
  database().tables.comment_reactions.push({
    id: "existing",
    comment_id: COMMENT_ID,
    user_id: USER_B,
    emoji: "🔥",
    tenant_secret: "beta-secret",
  });
  const { POST } = await reactionRoutes();

  const response = await POST(
    reactionRequest("POST", {
      comment_id: COMMENT_ID,
      emoji: "🔥",
      user_id: USER_B,
      asset_id: "attacker-selected-asset",
      version_id: "attacker-selected-version",
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(payload, {
    reaction: { emoji: "🔥", count: 2, reacted_by_me: true },
  });
  assert.doesNotMatch(JSON.stringify(payload), /user_id|tenant_secret|beta-secret/);
  assert.deepEqual(database().mutations, [
    {
      table: "comment_reactions",
      operation: "upsert",
      payload: {
        comment_id: COMMENT_ID,
        user_id: USER_A,
        emoji: "🔥",
      },
      options: { onConflict: "comment_id,user_id,emoji" },
      filters: [],
    },
  ]);
});

test("DELETE is bound to the authenticated user, comment, and emoji", async () => {
  database().tables.comment_reactions.push(
    {
      id: "mine",
      comment_id: COMMENT_ID,
      user_id: USER_A,
      emoji: "✅",
    },
    {
      id: "theirs",
      comment_id: COMMENT_ID,
      user_id: USER_B,
      emoji: "✅",
      tenant_secret: "beta-secret",
    },
  );
  const { DELETE } = await reactionRoutes();

  const response = await DELETE(
    reactionRequest("DELETE", {
      comment_id: COMMENT_ID,
      emoji: "✅",
      user_id: USER_B,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    reaction: { emoji: "✅", count: 1, reacted_by_me: false },
  });
  assert.deepEqual(database().mutations, [
    {
      table: "comment_reactions",
      operation: "delete",
      payload: null,
      options: null,
      filters: [
        { column: "comment_id", value: COMMENT_ID },
        { column: "user_id", value: USER_A },
        { column: "emoji", value: "✅" },
      ],
    },
  ]);
  assert.deepEqual(
    database().tables.comment_reactions.map((row) => row.user_id),
    [USER_B],
  );
  assert.doesNotMatch(JSON.stringify(payload), /user_id|tenant_secret|beta-secret/);
});

test("provider and access failures return generic errors", async () => {
  const { GET } = await reactionRoutes();
  database().failures["comments:select"] =
    "relation co_production.comments exposed tenant alpha";

  const lookupFailure = await GET(getRequest());
  assert.equal(lookupFailure.status, 500);
  assert.deepEqual(await lookupFailure.json(), {
    error: "Unable to process reaction request",
  });

  configure();
  globals.__commentReactionCommentAccess = {
    ok: false,
    status: 500,
    error: "private schema leaked tenant beta",
  };
  const helperFailure = await GET(getRequest());
  const helperPayload = await helperFailure.json();
  assert.equal(helperFailure.status, 500);
  assert.deepEqual(helperPayload, { error: "Unable to process reaction request" });
  assert.doesNotMatch(JSON.stringify(helperPayload), /tenant|schema|beta/i);
  assert.equal(database().tableCalls.includes("comment_reactions"), false);
});

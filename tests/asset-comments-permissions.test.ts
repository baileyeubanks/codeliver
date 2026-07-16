import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoCommentUser ?? null;
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
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
    globalThis.__ccoCommentAccessCalls.push({ assetId, userId, minimumRole });
    return globalThis.__ccoCommentAccess;
  }

  export async function getAssetComment(commentId, assetId) {
    globalThis.__ccoCommentParentCalls.push({ commentId, assetId });
    return globalThis.__ccoCommentParent;
  }
`)}`;

const emailStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function sendEmail() {}
  export function getBaseUrl() { return "https://client.contentco-op.com"; }
  export const emailTemplates = {
    commentNotification() { return { subject: "Comment", html: "Comment" }; },
  };
`)}`;

const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__ccoCommentSupabase;
  }
`)}`;

const versionsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function resolveAssetVersion(input) {
    globalThis.__ccoCommentVersionCalls.push(input);
    return globalThis.__ccoCommentVersion;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/email") return nextResolve(emailStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier === "@/lib/versions") return nextResolve(versionsStubUrl, context);
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown };

interface RecordedWrite {
  table: string;
  payload: Row;
  filters: Filter[];
}

class FakeQuery {
  private readonly filters: Filter[] = [];
  private operation: "select" | "insert" | "update" = "select";
  private payload: Row = {};
  private readonly database: FakeSupabase;
  private readonly table: string;

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

  insert(payload: Row) {
    this.operation = "insert";
    this.payload = { ...payload };
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = { ...payload };
    return this;
  }

  async order(column: string, options?: { ascending?: boolean }) {
    const rows = this.matchingRows();
    rows.sort((left, right) => {
      const result = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
      return options?.ascending === false ? -result : result;
    });
    return { data: rows.map((row) => ({ ...row })), error: null };
  }

  async single() {
    return this.executeSingle();
  }

  async maybeSingle() {
    return this.executeSingle();
  }

  private matchingRows() {
    return (this.database.tables[this.table] ?? []).filter((row) =>
      this.filters.every(({ column, value }) => row[column] === value),
    );
  }

  private async executeSingle() {
    if (this.operation === "insert") {
      const row = {
        id: this.payload.id ?? `${this.table}-${this.database.inserts.length + 1}`,
        status: "open",
        ...this.payload,
      };
      this.database.tables[this.table] ??= [];
      this.database.tables[this.table].push(row);
      this.database.inserts.push({
        table: this.table,
        payload: { ...this.payload },
        filters: [...this.filters],
      });
      return { data: { ...row }, error: null };
    }

    if (this.operation === "update") {
      const row = this.matchingRows()[0];
      this.database.updates.push({
        table: this.table,
        payload: { ...this.payload },
        filters: [...this.filters],
      });
      if (!row) return { data: null, error: null };
      Object.assign(row, this.payload);
      return { data: { ...row }, error: null };
    }

    const row = this.matchingRows()[0];
    return { data: row ? { ...row } : null, error: null };
  }
}

class FakeSupabase {
  readonly inserts: RecordedWrite[] = [];
  readonly updates: RecordedWrite[] = [];
  readonly tables: Record<string, Row[]>;
  readonly auth = {
    admin: {
      getUserById: async () => ({ data: { user: null }, error: null }),
    },
  };

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

type CommentTestState = typeof globalThis & {
  __ccoCommentUser?: { id: string; email: string } | null;
  __ccoCommentAccess?:
    | { ok: true; data: { access_role: string; access_rank: number } }
    | { ok: false; status: number; error: string };
  __ccoCommentAccessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
  }>;
  __ccoCommentParent?:
    | {
        ok: true;
        data: { id: string; asset_id: string; version_id: string; visibility: string };
      }
    | { ok: false; status: number; error: string };
  __ccoCommentParentCalls: Array<{ commentId: string; assetId: string }>;
  __ccoCommentSupabase?: FakeSupabase;
  __ccoCommentVersion?:
    | { ok: true; version: { id: string } }
    | { ok: false; status: number; error: string };
  __ccoCommentVersionCalls: Array<{ assetId: string; versionId?: string | null }>;
};

const state = globalThis as CommentTestState;

function configure({
  role = "reviewer",
  rank = 30,
  comments = [],
}: {
  role?: string;
  rank?: number;
  comments?: Row[];
} = {}) {
  state.__ccoCommentUser = { id: "user-a", email: "user-a@example.test" };
  state.__ccoCommentAccess = {
    ok: true,
    data: { access_role: role, access_rank: rank },
  };
  state.__ccoCommentAccessCalls = [];
  state.__ccoCommentParent = {
    ok: true,
    data: {
      id: "parent-a",
      asset_id: "asset-a",
      version_id: "version-a",
      visibility: "internal",
    },
  };
  state.__ccoCommentParentCalls = [];
  state.__ccoCommentSupabase = new FakeSupabase({ comments, assets: [], projects: [] });
  state.__ccoCommentVersion = { ok: true, version: { id: "version-a" } };
  state.__ccoCommentVersionCalls = [];
}

async function routeModule() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/[id]/comments/route.ts")).href
  );
}

function request(method: string, body?: unknown, versionId?: string) {
  const url = new URL("https://admin.contentco-op.com/api/assets/asset-a/comments");
  if (versionId) url.searchParams.set("version_id", versionId);
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "asset-a" }) };

test.beforeEach(() => configure());

test("GET grants collaborator reads at viewer privilege and stays version-bound", async () => {
  configure({
    role: "viewer",
    rank: 10,
    comments: [
      {
        id: "comment-a",
        asset_id: "asset-a",
        version_id: "version-a",
        visibility: "internal",
        created_at: "2026-07-15T01:00:00.000Z",
      },
      {
        id: "comment-old",
        asset_id: "asset-a",
        version_id: "version-old",
        visibility: "internal",
        created_at: "2026-07-14T01:00:00.000Z",
      },
    ],
  });
  const { GET } = await routeModule();

  const response = await GET(request("GET", undefined, "version-a"), context);

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items.map((item: Row) => item.id), ["comment-a"]);
  assert.deepEqual(state.__ccoCommentAccessCalls, [
    { assetId: "asset-a", userId: "user-a", minimumRole: "viewer" },
  ]);
  assert.deepEqual(state.__ccoCommentVersionCalls, [
    { assetId: "asset-a", versionId: "version-a" },
  ]);
});

test("POST requires reviewer privilege and always creates an internal version-bound comment", async () => {
  const { POST } = await routeModule();

  const response = await POST(
    request("POST", {
      body: "  Keep this internal  ",
      version_id: "version-a",
      visibility: "external",
      author_id: "different-user",
    }),
    context,
  );

  assert.equal(response.status, 201);
  assert.deepEqual(state.__ccoCommentAccessCalls, [
    { assetId: "asset-a", userId: "user-a", minimumRole: "reviewer" },
  ]);
  const write = state.__ccoCommentSupabase?.inserts[0];
  assert.equal(write?.table, "comments");
  assert.equal(write?.payload.body, "Keep this internal");
  assert.equal(write?.payload.version_id, "version-a");
  assert.equal(write?.payload.visibility, "internal");
  assert.equal(write?.payload.author_id, "user-a");
  assert.equal(write?.payload.review_invite_id, null);
});

test("POST cannot join an external thread or cross the parent version boundary", async () => {
  const { POST } = await routeModule();
  state.__ccoCommentParent = {
    ok: true,
    data: {
      id: "external-parent",
      asset_id: "asset-a",
      version_id: "version-a",
      visibility: "external",
    },
  };

  const externalResponse = await POST(
    request("POST", { body: "Internal reply", parent_id: "external-parent" }),
    context,
  );
  assert.equal(externalResponse.status, 400);
  assert.equal(state.__ccoCommentSupabase?.inserts.length, 0);

  state.__ccoCommentParent = {
    ok: true,
    data: {
      id: "old-parent",
      asset_id: "asset-a",
      version_id: "version-old",
      visibility: "internal",
    },
  };
  const crossVersionResponse = await POST(
    request("POST", { body: "Cross-version reply", parent_id: "old-parent" }),
    context,
  );
  assert.equal(crossVersionResponse.status, 400);
  assert.equal(state.__ccoCommentSupabase?.inserts.length, 0);
});

test("a reviewer can edit their own comment without changing audience, author, or version", async () => {
  const comment = {
    id: "comment-a",
    asset_id: "asset-a",
    version_id: "version-a",
    author_id: "user-a",
    visibility: "internal",
    body: "Original",
    status: "open",
  };
  configure({ comments: [comment] });
  const { PATCH } = await routeModule();

  const response = await PATCH(
    request("PATCH", {
      id: "comment-a",
      version_id: "version-a",
      body: "  Revised by author  ",
      status: "resolved",
      visibility: "external",
      author_id: "different-user",
    }),
    context,
  );

  assert.equal(response.status, 200);
  assert.equal(comment.body, "Revised by author");
  assert.equal(comment.status, "resolved");
  assert.equal(comment.visibility, "internal");
  assert.equal(comment.author_id, "user-a");
  assert.equal(comment.version_id, "version-a");

  const write = state.__ccoCommentSupabase?.updates[0];
  assert.equal(write?.payload.body, "Revised by author");
  assert.equal(write?.payload.status, "resolved");
  assert.equal("visibility" in (write?.payload ?? {}), false);
  assert.equal("author_id" in (write?.payload ?? {}), false);
  assert.equal("version_id" in (write?.payload ?? {}), false);
  assert.deepEqual(write?.filters, [
    { column: "id", value: "comment-a" },
    { column: "asset_id", value: "asset-a" },
    { column: "version_id", value: "version-a" },
    { column: "author_id", value: "user-a" },
  ]);
});

test("one reviewer cannot edit or resolve another reviewer's comment", async () => {
  configure({
    comments: [
      {
        id: "comment-b",
        asset_id: "asset-a",
        version_id: "version-a",
        author_id: "user-b",
        visibility: "internal",
        body: "Another reviewer",
        status: "open",
      },
    ],
  });
  const { PATCH } = await routeModule();

  const response = await PATCH(
    request("PATCH", { id: "comment-b", status: "resolved" }),
    context,
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "You cannot edit this comment" });
  assert.equal(state.__ccoCommentSupabase?.updates.length, 0);
});

test("editors can moderate external comments but cannot rewrite another author's text", async () => {
  const externalComment = {
    id: "comment-external",
    asset_id: "asset-a",
    version_id: "version-a",
    author_id: "user-a",
    visibility: "external",
    body: "Client wording",
    status: "open",
  };
  configure({ role: "editor", rank: 60, comments: [externalComment] });
  const { PATCH } = await routeModule();

  const moderationResponse = await PATCH(
    request("PATCH", { id: "comment-external", status: "resolved" }),
    context,
  );
  assert.equal(moderationResponse.status, 200);
  assert.equal(externalComment.status, "resolved");
  assert.equal(externalComment.visibility, "external");
  assert.equal(
    state.__ccoCommentSupabase?.updates[0]?.filters.some(
      (filter) => filter.column === "author_id",
    ),
    false,
  );

  const rewriteResponse = await PATCH(
    request("PATCH", { id: "comment-external", body: "Producer rewrite" }),
    context,
  );
  assert.equal(rewriteResponse.status, 403);
  assert.equal(externalComment.body, "Client wording");
  assert.equal(state.__ccoCommentSupabase?.updates.length, 1);
});

test("PATCH cannot target a comment from another media version", async () => {
  configure({
    comments: [
      {
        id: "comment-old",
        asset_id: "asset-a",
        version_id: "version-old",
        author_id: "user-a",
        visibility: "internal",
        body: "Old version",
        status: "open",
      },
    ],
  });
  state.__ccoCommentVersion = { ok: true, version: { id: "version-a" } };
  const { PATCH } = await routeModule();

  const response = await PATCH(
    request("PATCH", { id: "comment-old", status: "resolved", version_id: "version-a" }),
    context,
  );

  assert.equal(response.status, 404);
  assert.equal(state.__ccoCommentSupabase?.updates.length, 0);
});

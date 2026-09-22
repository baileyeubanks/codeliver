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

type DatabaseCall = {
  table: string;
  operation: "delete" | "insert" | "select";
  payload?: unknown;
  filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>;
};

type PersistenceState = typeof globalThis & {
  __ccoAnnotationCalls: DatabaseCall[];
  __ccoAnnotationComments: Array<Record<string, unknown>>;
  __ccoAnnotationRows: Array<Record<string, unknown>>;
  __ccoAnnotationInsertFails: boolean;
  __ccoAnnotationDeleteFails: boolean;
};

const state = globalThis as PersistenceState;

function resetState() {
  state.__ccoAnnotationCalls = [];
  state.__ccoAnnotationComments = [];
  state.__ccoAnnotationRows = [];
  state.__ccoAnnotationInsertFails = false;
  state.__ccoAnnotationDeleteFails = false;
}

resetState();

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
  assets: {
    id: "asset-a",
    title: "Launch film",
    file_type: "video",
    file_url: "/private/media.mov",
    status: "in_review",
    projects: { id: "project-a", name: "Launch" },
  },
};

const accessStub = dataModule(`
  export async function getAssetComment() {
    return { ok: false, status: 404, error: "Comment not found" };
  }
`);

const admissionStub = dataModule(`
  export async function authorizeAdmittedReviewInvite() {
    return {
      ok: true,
      invite: ${JSON.stringify(admittedInvite)},
      claims: {
        admissionId: "11111111-1111-4111-8111-111111111111",
        inviteId: "invite-a",
        assetId: "asset-a",
        versionId: "version-a",
        issuedAt: 1,
        expiresAt: 2,
        admissionExpiresAt: 3
      },
      setCookie: "__Host-cvp-review-admission-test=renewed; Path=/; HttpOnly; Secure; SameSite=Strict"
    };
  }
  export async function reserveReviewActionRate() {
    return { ok: true };
  }
`);

const emailStub = dataModule(`
  export async function sendEmail() {}
  export const emailTemplates = {
    commentNotification() { return { subject: "Comment", html: "Comment" }; }
  };
`);

const surfaceStub = dataModule(`
  export function getReviewSiteUrl() { return "https://co-videopro.com"; }
`);

const inviteStub = dataModule(`
  export function inviteCanComment(invite) {
    return invite.permissions === "comment" || invite.permissions === "approve";
  }
  export function getExternalApprovalState() {
    return { approvals: [], activeApprovalIds: [], approvalAccessMessage: null };
  }
`);

const versionsStub = dataModule(`
  export async function resolveAssetVersion() {
    return {
      ok: true,
      version: {
        id: "version-a",
        asset_id: "asset-a",
        version_number: 2,
        file_url: "/private/media.mov",
        file_size: 100,
        thumbnail_url: null,
        duration_seconds: 10,
        resolution: "1920x1080",
        is_current: true,
        notes: null,
        uploaded_by: "private-user",
        created_at: "2026-09-21T12:00:00.000Z"
      }
    };
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

const sharingStub = dataModule(`
  export function deriveShareIntent() { return "client_review"; }
`);

const supabaseStub = dataModule(`
  class Query {
    constructor(table) {
      this.table = table;
      this.operation = "select";
      this.payload = undefined;
      this.filters = [];
    }
    select() { return this; }
    eq(column, value) {
      this.filters.push({ kind: "eq", column, value });
      return this;
    }
    in(column, value) {
      this.filters.push({ kind: "in", column, value });
      return this;
    }
    or() { return this; }
    order() { return this; }
    update(payload) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }
    insert(payload) {
      this.operation = "insert";
      this.payload = payload;
      globalThis.__ccoAnnotationCalls.push({
        table: this.table,
        operation: "insert",
        payload,
        filters: this.filters,
      });
      return this;
    }
    delete() {
      this.operation = "delete";
      return this;
    }
    async single() {
      if (this.table === "comments" && this.operation === "insert") {
        const row = {
          id: "comment-a",
          ...this.payload,
          frame_number: 120,
          status: "open",
          created_at: "2026-09-21T12:01:00.000Z",
          updated_at: "2026-09-21T12:01:00.000Z",
        };
        globalThis.__ccoAnnotationComments = [row];
        return { data: row, error: null };
      }
      if (this.table === "assets") return { data: null, error: null };
      return { data: null, error: null };
    }
    async maybeSingle() {
      if (this.table === "approval_workflows") return { data: null, error: null };
      return { data: null, error: null };
    }
    result() {
      if (this.operation === "delete") {
        return {
          data: null,
          error: globalThis.__ccoAnnotationDeleteFails
            ? { message: "comment compensation failed" }
            : null,
        };
      }
      if (this.table === "annotations" && this.operation === "insert") {
        if (globalThis.__ccoAnnotationInsertFails) {
          return { data: null, error: { message: "annotation insert failed" } };
        }
        const rows = this.payload.map((row, index) => ({
          id: "annotation-" + (index + 1),
          ...row,
          created_at: "2026-09-21T12:01:00.000Z",
        }));
        globalThis.__ccoAnnotationRows = rows;
        return { data: rows, error: null };
      }
      if (this.table === "comments") {
        return { data: globalThis.__ccoAnnotationComments, error: null };
      }
      if (this.table === "annotations") {
        return { data: globalThis.__ccoAnnotationRows, error: null };
      }
      if (this.table === "approval_workflows") return { data: null, error: null };
      return { data: [], error: null };
    }
    then(resolve, reject) {
      if (this.operation === "delete") {
        globalThis.__ccoAnnotationCalls.push({
          table: this.table,
          operation: "delete",
          filters: this.filters,
        });
      } else if (this.operation === "select") {
        globalThis.__ccoAnnotationCalls.push({
          table: this.table,
          operation: "select",
          filters: this.filters,
        });
      }
      return Promise.resolve(this.result()).then(resolve, reject);
    }
  }

  export function getSupabase() {
    return {
      from(table) { return new Query(table); },
      auth: { admin: { async getUserById() { return { data: { user: null }, error: null }; } } }
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStub, context);
    if (specifier === "@/lib/email") return nextResolve(emailStub, context);
    if (specifier === "@/lib/surface-origins") return nextResolve(surfaceStub, context);
    if (specifier === "@/lib/review/admission-authority") return nextResolve(admissionStub, context);
    if (specifier === "@/lib/review-invites") return nextResolve(inviteStub, context);
    if (specifier === "@/lib/versions") return nextResolve(versionsStub, context);
    if (specifier === "@/lib/review/demoReview") return nextResolve(demoStub, context);
    if (specifier === "@/lib/sharing/share-intent") return nextResolve(sharingStub, context);
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

function commentRequest(body: Record<string, unknown>) {
  return new Request(
    "https://co-videopro.com/api/review/opaque-token/comments",
    {
      method: "POST",
      headers: {
        Origin: "https://co-videopro.com",
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify(body),
    },
  );
}

const context = { params: Promise.resolve({ token: "opaque-token" }) };
const validAnnotations = [
  { kind: "arrow", points: [0.1, 0.2, 0.8, 0.7] },
  { kind: "rectangle", x: 0.2, y: 0.3, width: 0.4, height: 0.2 },
] as const;

test("admitted frame annotations persist on the server-authoritative comment, asset, and version", async () => {
  resetState();
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts")).href
  );

  const response = await POST(
    commentRequest({
      body: "Move this title and crop the frame",
      author_name: "External reviewer",
      timecode_seconds: 4.25,
      pin_x: 25,
      pin_y: 75,
      annotations: validAnnotations,
      drawing: "https://attacker.example/frame.webp",
      attachments: [{ file_url: "https://attacker.example/reference.webp" }],
      comment_id: "attacker-comment",
      asset_id: "attacker-asset",
      version_id: "attacker-version",
    }),
    context,
  );

  assert.equal(response.status, 201);
  const annotationWrite = state.__ccoAnnotationCalls.find(
    (call) => call.table === "annotations" && call.operation === "insert",
  );
  assert.ok(annotationWrite);
  assert.deepEqual(
    annotationWrite.payload,
    validAnnotations.map((data) => ({
      comment_id: "comment-a",
      asset_id: "asset-a",
      version_id: "version-a",
      type: data.kind,
      data,
      frame_number: 120,
      created_by: null,
    })),
  );

  const payload = await response.json();
  assert.equal(payload.id, "comment-a");
  assert.deepEqual(
    payload.annotations.map((annotation: Record<string, unknown>) => annotation.data),
    validAnnotations,
  );
  assert.doesNotMatch(
    JSON.stringify(payload),
    /created_by|attacker-|attacker\.example|private-reviewer/,
  );
  assert.equal(
    state.__ccoAnnotationCalls.some((call) => call.table === "comment_attachments"),
    false,
  );

  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/route.ts")).href
  );
  const reloadResponse = await GET(
    new Request("https://co-videopro.com/api/review/opaque-token", {
      headers: { "Sec-Fetch-Site": "same-origin" },
    }),
    context,
  );
  assert.equal(reloadResponse.status, 200);
  const reloaded = await reloadResponse.json();
  assert.deepEqual(
    reloaded.comments[0].annotations.map(
      (annotation: Record<string, unknown>) => annotation.data,
    ),
    validAnnotations,
  );
  assert.doesNotMatch(JSON.stringify(reloaded.comments), /created_by|attacker-|private-reviewer/);
});

test("malformed annotation shapes fail before any comment or annotation write", async () => {
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts")).href
  );
  const invalidAnnotations = [
    [{ kind: "arrow", points: [0.1, 0.2, 1.1, 0.7] }],
    [{ kind: "rectangle", x: 0.8, y: 0.3, width: 0.4, height: 0.2 }],
    [{ kind: "freehand", points: [0.1, 0.2, Number.NaN, 0.4] }],
    [{ kind: "script", points: [0.1, 0.2, 0.8, 0.7] }],
    { kind: "arrow", points: [0.1, 0.2, 0.8, 0.7] },
  ];

  for (const annotations of invalidAnnotations) {
    resetState();
    const response = await POST(
      commentRequest({
        body: "Do not persist this",
        timecode_seconds: 4.25,
        pin_x: 25,
        pin_y: 75,
        annotations,
      }),
      context,
    );
    assert.equal(response.status, 400, JSON.stringify(annotations));
    assert.equal(
      state.__ccoAnnotationCalls.some((call) => call.operation === "insert"),
      false,
    );
  }
});

test("annotation storage failure stays 503 and attempts exact comment compensation", async () => {
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts")).href
  );

  for (const deleteFails of [false, true]) {
    resetState();
    state.__ccoAnnotationInsertFails = true;
    state.__ccoAnnotationDeleteFails = deleteFails;
    const response = await POST(
      commentRequest({
        body: "This must not become a text-only success",
        timecode_seconds: 4.25,
        pin_x: 25,
        pin_y: 75,
        annotations: validAnnotations,
      }),
      context,
    );

    assert.equal(response.status, 503);
    const deleteCall = state.__ccoAnnotationCalls.find(
      (call) => call.table === "comments" && call.operation === "delete",
    );
    assert.ok(deleteCall);
    assert.deepEqual(deleteCall.filters, [
      { kind: "eq", column: "id", value: "comment-a" },
      { kind: "eq", column: "asset_id", value: "asset-a" },
      { kind: "eq", column: "version_id", value: "version-a" },
      { kind: "eq", column: "review_invite_id", value: "invite-a" },
    ]);
  }
});

test("admitted review reload returns only valid annotations bound to its comments and version", async () => {
  resetState();
  state.__ccoAnnotationComments = [
    {
      id: "comment-a",
      asset_id: "asset-a",
      version_id: "version-a",
      parent_id: null,
      author_name: "External reviewer",
      body: "Move this title",
      timecode_seconds: 4.25,
      frame_number: 120,
      pin_x: 25,
      pin_y: 75,
      status: "open",
      visibility: "external",
      created_at: "2026-09-21T12:01:00.000Z",
      updated_at: "2026-09-21T12:01:00.000Z",
    },
  ];
  state.__ccoAnnotationRows = [
    {
      id: "annotation-good",
      comment_id: "comment-a",
      asset_id: "asset-a",
      version_id: "version-a",
      type: "arrow",
      data: validAnnotations[0],
      frame_number: 120,
      created_by: "private-user",
      created_at: "2026-09-21T12:01:00.000Z",
    },
    {
      id: "annotation-foreign-version",
      comment_id: "comment-a",
      asset_id: "asset-a",
      version_id: "version-old",
      type: "rectangle",
      data: validAnnotations[1],
      frame_number: 120,
      created_at: "2026-09-21T12:01:00.000Z",
    },
    {
      id: "annotation-invalid-data",
      comment_id: "comment-a",
      asset_id: "asset-a",
      version_id: "version-a",
      type: "arrow",
      data: { kind: "arrow", points: [0, 0, 2, 2] },
      frame_number: 120,
      created_at: "2026-09-21T12:01:00.000Z",
    },
  ];

  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/review/[token]/route.ts")).href
  );
  const response = await GET(
    new Request("https://co-videopro.com/api/review/opaque-token", {
      headers: { "Sec-Fetch-Site": "same-origin" },
    }),
    context,
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.comments.length, 1);
  assert.deepEqual(payload.comments[0].annotations, [
    {
      id: "annotation-good",
      comment_id: "comment-a",
      asset_id: "asset-a",
      version_id: "version-a",
      type: "arrow",
      data: validAnnotations[0],
      frame_number: 120,
      created_at: "2026-09-21T12:01:00.000Z",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(payload.comments), /created_by|foreign-version|invalid-data/);

  const annotationRead = state.__ccoAnnotationCalls.find(
    (call) => call.table === "annotations" && call.operation === "select",
  );
  assert.ok(annotationRead);
  assert.deepEqual(annotationRead.filters, [
    { kind: "eq", column: "asset_id", value: "asset-a" },
    { kind: "eq", column: "version_id", value: "version-a" },
    { kind: "in", column: "comment_id", value: ["comment-a"] },
  ]);
});

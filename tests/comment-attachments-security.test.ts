import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__commentAttachmentUser ?? null;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    if (!globalThis.__commentAttachmentSupabase) {
      throw new Error("Missing comment attachment test provider");
    }
    return globalThis.__commentAttachmentSupabase;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier.startsWith("@/")) {
      const candidate = resolve(repositoryRoot, specifier.slice(2));
      for (const path of [
        `${candidate}.ts`,
        `${candidate}.tsx`,
        join(candidate, "index.ts"),
      ]) {
        if (existsSync(path)) return nextResolve(pathToFileURL(path).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTACHMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LEGACY_ATTACHMENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PRIVATE_PATH = `${USER_A}/${PROJECT_ID}/${ASSET_ID}/${COMMENT_ID}/attachment-safe.png`;

type Attachment = {
  id: string;
  comment_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  uploaded_by?: string | null;
};

type FakeState = {
  comments: Map<string, { id: string; asset_id: string }>;
  assets: Map<string, { id: string; project_id: string }>;
  projects: Map<string, { id: string; owner_id: string }>;
  attachments: Attachment[];
  tableCalls: string[];
  uploads: Array<{
    bucket: string;
    path: string;
    bytes: number;
    options: { contentType?: string; upsert?: boolean };
  }>;
  signedUrls: Array<{ bucket: string; path: string; ttl: number }>;
  publicUrlCalls: number;
  uploadError: { message: string } | null;
  signedUrlError: { message: string } | null;
};

type TestGlobals = typeof globalThis & {
  __commentAttachmentUser?: { id: string } | null;
  __commentAttachmentSupabase?: ReturnType<typeof createFakeSupabase>;
};

const globals = globalThis as TestGlobals;

function createState(ownerId = USER_A): FakeState {
  return {
    comments: new Map([
      [COMMENT_ID, { id: COMMENT_ID, asset_id: ASSET_ID }],
    ]),
    assets: new Map([
      [ASSET_ID, { id: ASSET_ID, project_id: PROJECT_ID }],
    ]),
    projects: new Map([
      [PROJECT_ID, { id: PROJECT_ID, owner_id: ownerId }],
    ]),
    attachments: [],
    tableCalls: [],
    uploads: [],
    signedUrls: [],
    publicUrlCalls: 0,
    uploadError: null,
    signedUrlError: null,
  };
}

class FakeQuery {
  private readonly table: string;
  private readonly state: FakeState;
  private readonly filters = new Map<string, unknown>();
  private insertValue: Record<string, unknown> | null = null;

  constructor(table: string, state: FakeState) {
    this.table = table;
    this.state = state;
  }

  select(columns: string) {
    void columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  insert(value: Record<string, unknown>) {
    this.insertValue = value;
    return this;
  }

  async maybeSingle() {
    if (this.table === "comments") {
      return {
        data: this.state.comments.get(String(this.filters.get("id"))) ?? null,
        error: null,
      };
    }

    if (this.table === "assets") {
      return {
        data: this.state.assets.get(String(this.filters.get("id"))) ?? null,
        error: null,
      };
    }

    if (this.table === "projects") {
      const project = this.state.projects.get(String(this.filters.get("id")));
      const ownerId = this.filters.get("owner_id");
      return {
        data: project && project.owner_id === ownerId ? { id: project.id } : null,
        error: null,
      };
    }

    throw new Error(`Unexpected maybeSingle table: ${this.table}`);
  }

  async order(column: string, options: { ascending: boolean }) {
    void column;
    void options;
    if (this.table !== "comment_attachments") {
      throw new Error(`Unexpected ordered table: ${this.table}`);
    }

    const commentId = this.filters.get("comment_id");
    return {
      data: this.state.attachments.filter(
        (attachment) => attachment.comment_id === commentId,
      ),
      error: null,
    };
  }

  async single() {
    if (this.table !== "comment_attachments" || !this.insertValue) {
      throw new Error(`Unexpected insert table: ${this.table}`);
    }

    const attachment = {
      id: ATTACHMENT_ID,
      created_at: "2026-07-15T05:00:00.000Z",
      ...this.insertValue,
    } as Attachment;
    this.state.attachments.push(attachment);
    return { data: attachment, error: null };
  }
}

function createFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      state.tableCalls.push(table);
      return new FakeQuery(table, state);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(
            path: string,
            bytes: Uint8Array,
            options: { contentType?: string; upsert?: boolean },
          ) {
            state.uploads.push({ bucket, path, bytes: bytes.byteLength, options });
            return { data: null, error: state.uploadError };
          },
          async createSignedUrl(path: string, ttl: number) {
            state.signedUrls.push({ bucket, path, ttl });
            if (state.signedUrlError) {
              return { data: null, error: state.signedUrlError };
            }
            return {
              data: {
                signedUrl: `https://storage.test/storage/v1/object/sign/${bucket}/${encodeURIComponent(path)}?token=short-lived`,
              },
              error: null,
            };
          },
          getPublicUrl() {
            state.publicUrlCalls += 1;
            return {
              data: {
                publicUrl: `https://storage.test/storage/v1/object/public/${bucket}/forbidden`,
              },
            };
          },
        };
      },
    },
  };
}

function useState(state: FakeState, userId: string | null = USER_A) {
  globals.__commentAttachmentUser = userId ? { id: userId } : null;
  globals.__commentAttachmentSupabase = createFakeSupabase(state);
}

function attachmentRequest(
  file: File,
  commentId = COMMENT_ID,
): Request {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("comment_id", commentId);

  return {
    headers: new Headers(),
    formData: async () => formData,
  } as Request;
}

async function attachmentRoutes() {
  return import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/comments/attachments/route.ts"),
    ).href
  );
}

test("list and upload require authentication", async () => {
  const state = createState();
  useState(state, null);
  const { GET, POST } = await attachmentRoutes();

  const listResponse = await GET(
    new Request(
      `https://deliver.contentco-op.com/api/comments/attachments?comment_id=${COMMENT_ID}`,
    ),
  );
  const uploadResponse = await POST(
    attachmentRequest(new File(["safe"], "safe.png", { type: "image/png" })),
  );

  assert.equal(listResponse.status, 401);
  assert.equal(uploadResponse.status, 401);
  assert.deepEqual(state.tableCalls, []);
  assert.deepEqual(state.uploads, []);
});

test("cross-tenant comment list and upload are denied before attachment access", async () => {
  const state = createState(USER_B);
  useState(state);
  const { GET, POST } = await attachmentRoutes();

  const listResponse = await GET(
    new Request(
      `https://deliver.contentco-op.com/api/comments/attachments?comment_id=${COMMENT_ID}`,
    ),
  );
  const uploadResponse = await POST(
    attachmentRequest(new File(["safe"], "safe.png", { type: "image/png" })),
  );

  assert.equal(listResponse.status, 404);
  assert.equal(uploadResponse.status, 404);
  assert.equal(state.tableCalls.includes("comment_attachments"), false);
  assert.deepEqual(state.uploads, []);
  assert.deepEqual(state.signedUrls, []);
});

test("missing asset or project ownership fails closed", async () => {
  const state = createState();
  state.projects.clear();
  useState(state);
  const { GET, POST } = await attachmentRoutes();

  const listResponse = await GET(
    new Request(
      `https://deliver.contentco-op.com/api/comments/attachments?comment_id=${COMMENT_ID}`,
    ),
  );
  const uploadResponse = await POST(
    attachmentRequest(new File(["safe"], "safe.pdf", { type: "application/pdf" })),
  );

  assert.equal(listResponse.status, 404);
  assert.equal(uploadResponse.status, 404);
  assert.deepEqual(state.uploads, []);
  assert.deepEqual(state.signedUrls, []);
});

test("uploads sanitize names and reject unsafe types and oversized files", async () => {
  const state = createState();
  useState(state);
  const { POST } = await attachmentRoutes();

  const safeResponse = await POST(
    attachmentRequest(
      new File(["image"], "../../<script> Q2.HTML", { type: "image/png" }),
    ),
  );
  assert.equal(safeResponse.status, 201);
  const safeBody = await safeResponse.json();
  assert.equal(safeBody.attachment.file_name, "script-Q2.png");
  assert.match(safeBody.attachment.file_url, /\/storage\/v1\/object\/sign\//);
  assert.doesNotMatch(JSON.stringify(safeBody), /storage:\/\/|\/object\/public\//);

  assert.equal(state.uploads.length, 1);
  const upload = state.uploads[0];
  assert.equal(upload.bucket, "comment-attachments");
  assert.equal(upload.options.contentType, "image/png");
  assert.equal(upload.options.upsert, false);
  assert.ok(upload.path.startsWith(`${USER_A}/${PROJECT_ID}/${ASSET_ID}/${COMMENT_ID}/`));
  assert.doesNotMatch(upload.path, /\.\.|[<>\\]|\/\//);
  assert.match(upload.path, /-script-Q2\.png$/);

  const unsafeTypeResponse = await POST(
    attachmentRequest(
      new File(["<script>alert(1)</script>"], "payload.html", {
        type: "text/html",
      }),
    ),
  );
  assert.equal(unsafeTypeResponse.status, 415);

  const oversized = new File(["x"], "huge.pdf", { type: "application/pdf" });
  Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
  const oversizedResponse = await POST(attachmentRequest(oversized));
  assert.equal(oversizedResponse.status, 413);

  assert.equal(state.uploads.length, 1);
  assert.equal(state.publicUrlCalls, 0);
});

test("authorized lists return only short-lived signed access", async () => {
  const state = createState();
  state.attachments.push(
    {
      id: ATTACHMENT_ID,
      comment_id: COMMENT_ID,
      file_url: `storage://comment-attachments/${PRIVATE_PATH}`,
      file_name: "attachment-safe.png",
      file_type: "image/png",
      file_size: 5,
      created_at: "2026-07-15T05:00:00.000Z",
      storage_bucket: "comment-attachments",
      storage_path: PRIVATE_PATH,
      uploaded_by: USER_A,
    },
    {
      id: LEGACY_ATTACHMENT_ID,
      comment_id: COMMENT_ID,
      file_url: `https://project.supabase.co/storage/v1/object/public/deliverables/comments/${COMMENT_ID}/legacy.pdf`,
      file_name: "legacy.pdf",
      file_type: "application/pdf",
      file_size: 12,
      created_at: "2026-07-15T05:01:00.000Z",
    },
  );
  useState(state);
  const { GET } = await attachmentRoutes();

  const response = await GET(
    new Request(
      `https://deliver.contentco-op.com/api/comments/attachments?comment_id=${COMMENT_ID}`,
    ),
  );
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.attachments.length, 2);
  for (const attachment of body.attachments) {
    assert.match(attachment.file_url, /\/storage\/v1\/object\/sign\//);
    assert.equal(typeof attachment.url_expires_at, "string");
    assert.equal("storage_bucket" in attachment, false);
    assert.equal("storage_path" in attachment, false);
  }
  assert.doesNotMatch(JSON.stringify(body), /storage:\/\/|\/object\/public\//);
  assert.deepEqual(state.signedUrls, [
    { bucket: "comment-attachments", path: PRIVATE_PATH, ttl: 300 },
    {
      bucket: "deliverables",
      path: `comments/${COMMENT_ID}/legacy.pdf`,
      ttl: 300,
    },
  ]);
  assert.equal(state.publicUrlCalls, 0);
});

test("provider failures are generic and never expose provider details", async () => {
  const state = createState();
  state.uploadError = { message: "S3 AccessDenied: private-provider-detail" };
  useState(state);
  const { POST } = await attachmentRoutes();

  const response = await POST(
    attachmentRequest(new File(["safe"], "safe.png", { type: "image/png" })),
  );
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.doesNotMatch(body, /AccessDenied|provider-detail|S3/);
  assert.match(body, /Backend service is unavailable/);
  assert.equal(state.publicUrlCalls, 0);
});

test("private attachment migration is scoped and leaves legacy objects untouched", () => {
  const migration = readFileSync(
    resolve(
      repositoryRoot,
      "supabase/migrations/20260715053128_private_comment_attachments.sql",
    ),
    "utf8",
  );

  assert.match(migration, /'comment-attachments'[\s\S]*?false[\s\S]*?26214400/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS storage_path text/);
  assert.match(migration, /projects\.owner_id = auth\.uid\(\)/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.doesNotMatch(migration, /DELETE FROM storage\.objects/i);
  assert.doesNotMatch(migration, /UPDATE storage\.objects/i);
  assert.doesNotMatch(migration, /bucket_id\s*=\s*'deliverables'/i);
});

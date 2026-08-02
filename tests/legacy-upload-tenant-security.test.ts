import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__legacyUploadTenantState.user;
  }
`)}`;
const accessControlStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess(...args) {
    return globalThis.__legacyUploadTenantState.getProjectAccess(...args);
  }
`)}`;
const hostSurfaceStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function resolveTrustedSurfaceRole(user) {
    return user?.app_metadata?.content_coop_role === "staff" ? "staff" : null;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__legacyUploadTenantState.supabase;
  }
`)}`;
const tusStoreStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createUpload(params) {
    return globalThis.__legacyUploadTenantState.store.createUpload(params);
  }
  export function getUpload(uploadId) {
    return globalThis.__legacyUploadTenantState.store.getUpload(uploadId);
  }
  export function appendChunk(uploadId, data, offset) {
    return globalThis.__legacyUploadTenantState.store.appendChunk(uploadId, data, offset);
  }
  export async function finalizeUpload(uploadId) {
    return globalThis.__legacyUploadTenantState.store.finalizeUpload(uploadId);
  }
  export function deleteUpload(uploadId) {
    return globalThis.__legacyUploadTenantState.store.deleteUpload(uploadId);
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessControlStubUrl, context);
    }
    if (specifier === "@/lib/auth/host-surface") {
      return nextResolve(hostSurfaceStubUrl, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier === "@/lib/tus/store") {
      return nextResolve(tusStoreStubUrl, context);
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

type TestUser = {
  id: string;
  app_metadata?: { content_coop_role?: string };
};

type UploadMeta = {
  id: string;
  filename: string;
  filetype: string;
  size: number;
  offset: number;
  projectId?: string;
  folderId?: string;
  userId: string;
  createdAt: string;
  completed: boolean;
};

type TestState = {
  user: TestUser | null;
  accessAllowed: boolean;
  accessCalls: Array<[string, string, string, unknown]>;
  folderRow: { id: string; project_id: string } | null;
  assetRow: Record<string, unknown>;
  folderError: { message: string } | null;
  assetError: { message: string } | null;
  selects: Array<{ table: string; columns: string }>;
  inserts: Array<{ table: string; value: Record<string, unknown> }>;
  getProjectAccess: (
    projectId: string,
    userId: string,
    role: string,
    client: unknown
  ) => Promise<Record<string, unknown>>;
  supabase: ReturnType<typeof createSupabaseClient>;
  store: ReturnType<typeof createTusStore>;
};

function createSupabaseClient(state: TestState) {
  return {
    from(table: string) {
      const filters = new Map<string, unknown>();
      let inserted: Record<string, unknown> | null = null;
      const query = {
        select(columns: string) {
          state.selects.push({ table, columns });
          return query;
        },
        insert(value: Record<string, unknown>) {
          inserted = value;
          state.inserts.push({ table, value });
          return query;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        async maybeSingle() {
          assert.equal(table, "folders");
          if (state.folderError) {
            return { data: null, error: state.folderError };
          }
          const row = state.folderRow;
          const matches =
            row &&
            row.id === filters.get("id") &&
            row.project_id === filters.get("project_id");
          return { data: matches ? row : null, error: null };
        },
        async single() {
          assert.equal(table, "assets");
          assert.ok(inserted);
          return {
            data: state.assetError ? null : state.assetRow,
            error: state.assetError,
          };
        },
      };
      return query;
    },
  };
}

function createTusStore() {
  const store = {
    upload: null as UploadMeta | null,
    createCalls: [] as Array<Record<string, unknown>>,
    appendCalls: 0,
    finalizeCalls: 0,
    deleteCalls: 0,
    onAppend: null as (() => void) | null,
    createUpload(params: Record<string, unknown>) {
      store.createCalls.push(params);
      store.upload = {
        id: "upload-1",
        filename: String(params.filename),
        filetype: String(params.filetype),
        size: Number(params.size),
        offset: 0,
        projectId: params.projectId as string | undefined,
        folderId: params.folderId as string | undefined,
        userId: String(params.userId),
        createdAt: new Date().toISOString(),
        completed: false,
      };
      return store.upload;
    },
    getUpload(uploadId: string) {
      return store.upload?.id === uploadId ? store.upload : null;
    },
    appendChunk(uploadId: string, data: Uint8Array, offset: number) {
      assert.equal(uploadId, store.upload?.id);
      assert.equal(offset, store.upload?.offset);
      assert.ok(store.upload);
      store.appendCalls += 1;
      store.upload.offset += data.byteLength;
      store.upload.completed = store.upload.offset === store.upload.size;
      store.onAppend?.();
      return { offset: store.upload.offset, complete: store.upload.completed };
    },
    async finalizeUpload(uploadId: string) {
      assert.equal(uploadId, store.upload?.id);
      store.finalizeCalls += 1;
      return { relativePath: "project-a/clip.mp4", streamUrl: "/stream", asset: null };
    },
    deleteUpload(uploadId: string) {
      assert.equal(uploadId, store.upload?.id);
      store.deleteCalls += 1;
      return true;
    },
  };
  return store;
}

function resetState(): TestState {
  const state = {
    user: { id: "user-a", app_metadata: { content_coop_role: "staff" } },
    accessAllowed: true,
    accessCalls: [],
    folderRow: null,
    assetRow: {
      id: "asset-a",
      project_id: "project-a",
      folder_id: null,
      title: "clip",
      file_type: "video",
      file_url: "/stream",
      status: "in_review",
      nas_path: "project-a/clip.mp4",
      file_size: 4,
      uploaded_by: "user-a",
      created_at: "2026-07-15T00:00:00.000Z",
      private_metadata: "must-not-leak",
    },
    folderError: null,
    assetError: null,
    selects: [],
    inserts: [],
  } as unknown as TestState;
  state.getProjectAccess = async (projectId, userId, role, client) => {
    state.accessCalls.push([projectId, userId, role, client]);
    return state.accessAllowed
      ? {
          ok: true,
          data: {
            id: projectId,
            name: "Project",
            owner_id: userId,
            team_id: null,
            access_role: "editor",
            access_rank: 60,
          },
        }
      : { ok: false, status: 404, error: "Project not found" };
  };
  state.supabase = createSupabaseClient(state);
  state.store = createTusStore();
  (globalThis as typeof globalThis & { __legacyUploadTenantState: TestState })
    .__legacyUploadTenantState = state;
  return state;
}

function moduleUrl(path: string): string {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

async function multipartRequest(input: {
  projectId?: string;
  folderId?: string;
  folder?: string;
  serviceToken?: string;
}): Promise<NextRequest> {
  const form = new FormData();
  form.set("file", new File(["clip"], "clip.mp4", { type: "video/mp4" }));
  if (input.projectId) form.set("projectId", input.projectId);
  if (input.folderId) form.set("folderId", input.folderId);
  if (input.folder) form.set("folder", input.folder);

  const serialized = new Request("https://admin.contentco-op.com/api/media/upload", {
    method: "POST",
    body: form,
  });
  const body = Buffer.from(await serialized.arrayBuffer());
  const headers = new Headers(serialized.headers);
  headers.set("content-length", String(body.length));
  if (input.serviceToken) {
    headers.set("x-codeliver-media-worker-token", input.serviceToken);
  }
  return new NextRequest("https://admin.contentco-op.com/api/media/upload", {
    method: "POST",
    headers,
    body,
  });
}

function uploadMetadata(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
    .join(",");
}

function tusCreateRequest(
  metadata: Record<string, string>,
  serviceToken?: string
): NextRequest {
  const headers: Record<string, string> = {
    "tus-resumable": "1.0.0",
    "upload-length": "4",
    "upload-metadata": uploadMetadata({ filename: "clip.mp4", ...metadata }),
  };
  if (serviceToken) headers["x-codeliver-media-worker-token"] = serviceToken;
  return new NextRequest("https://admin.contentco-op.com/api/media/tus", {
    method: "POST",
    headers,
  });
}

function tusCreateWithUploadRequest(
  metadata: Record<string, string>
): NextRequest {
  return new NextRequest("https://admin.contentco-op.com/api/media/tus", {
    method: "POST",
    headers: {
      "content-type": "application/offset+octet-stream",
      "tus-resumable": "1.0.0",
      "upload-length": "4",
      "upload-metadata": uploadMetadata({ filename: "clip.mp4", ...metadata }),
    },
    body: Buffer.from("clip"),
  });
}

function tusPatchRequest(serviceToken?: string): NextRequest {
  const headers: Record<string, string> = {
    "tus-resumable": "1.0.0",
    "content-type": "application/offset+octet-stream",
    "upload-offset": "0",
  };
  if (serviceToken) headers["x-codeliver-media-worker-token"] = serviceToken;
  return new NextRequest(
    "https://admin.contentco-op.com/api/media/tus/upload-1",
    { method: "PATCH", headers, body: Buffer.from("clip") }
  );
}

test("legacy multipart binds bytes and returned rows to editor-authorized project scope", async () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-upload-tenant-"));
  const previousRoot = process.env.NAS_MEDIA_ROOT;
  const state = resetState();
  process.env.NAS_MEDIA_ROOT = root;

  try {
    const { POST } = await import(moduleUrl("app/api/media/upload/route.ts"));

    state.accessAllowed = false;
    const denied = await POST(await multipartRequest({ projectId: "project-b" }));
    assert.equal(denied.status, 403);
    assert.deepEqual(readdirSync(root), []);
    assert.equal(state.accessCalls.at(-1)?.[2], "editor");

    state.accessAllowed = true;
    state.folderRow = { id: "folder-a", project_id: "project-b" };
    const wrongFolder = await POST(
      await multipartRequest({ projectId: "project-a", folderId: "folder-a" })
    );
    assert.equal(wrongFolder.status, 403);
    assert.deepEqual(readdirSync(root), []);

    state.folderRow = { id: "folder-a", project_id: "project-a" };
    state.assetRow = {
      ...state.assetRow,
      folder_id: "folder-a",
      nas_path: "project-a/folder-a/clip.mp4",
    };
    const allowed = await POST(
      await multipartRequest({ projectId: "project-a", folderId: "folder-a" })
    );
    assert.equal(allowed.status, 200);
    const payload = await allowed.json();
    assert.equal(payload.asset.project_id, "project-a");
    assert.equal(payload.asset.folder_id, "folder-a");
    assert.equal("private_metadata" in payload.asset, false);
    assert.equal(state.inserts.at(-1)?.value.project_id, "project-a");
    assert.equal(state.inserts.at(-1)?.value.folder_id, "folder-a");
    assert.match(payload.relativePath, /^project-a\/folder-a\//);
    assert.ok(existsSync(join(root, payload.relativePath)));
    assert.ok(
      state.selects.some(
        ({ table, columns }) =>
          table === "assets" && !columns.includes("*") && columns.includes("project_id")
      )
    );
  } finally {
    if (previousRoot === undefined) delete process.env.NAS_MEDIA_ROOT;
    else process.env.NAS_MEDIA_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  }
});

test("projectless multipart ingestion is service-token-only", async () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-upload-service-"));
  const previousRoot = process.env.NAS_MEDIA_ROOT;
  const previousToken = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  const state = resetState();
  process.env.NAS_MEDIA_ROOT = root;
  process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = "service-secret";

  try {
    const { POST } = await import(moduleUrl("app/api/media/upload/route.ts"));
    const denied = await POST(await multipartRequest({ folder: "drop" }));
    assert.equal(denied.status, 403);
    assert.deepEqual(readdirSync(root), []);

    state.user = null;
    const allowed = await POST(
      await multipartRequest({ folder: "drop", serviceToken: "service-secret" })
    );
    assert.equal(allowed.status, 200);
    const payload = await allowed.json();
    assert.match(payload.relativePath, /^drop\//);
    assert.equal(payload.asset, null);

    const filesBeforeProjectImpersonation = readdirSync(root, {
      recursive: true,
    });
    const projectByServiceDenied = await POST(
      await multipartRequest({
        projectId: "project-a",
        serviceToken: "service-secret",
      })
    );
    assert.equal(projectByServiceDenied.status, 401);
    assert.deepEqual(
      readdirSync(root, { recursive: true }),
      filesBeforeProjectImpersonation
    );
  } finally {
    if (previousRoot === undefined) delete process.env.NAS_MEDIA_ROOT;
    else process.env.NAS_MEDIA_ROOT = previousRoot;
    if (previousToken === undefined) {
      delete process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
    } else {
      process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = previousToken;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy TUS creation rejects cross-tenant targets and persists authorized IDs", async () => {
  const previousToken = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  const state = resetState();
  process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = "service-secret";

  try {
    const { POST } = await import(moduleUrl("app/api/media/tus/route.ts"));

    state.accessAllowed = false;
    const denied = await POST(tusCreateRequest({ projectId: "project-b" }));
    assert.equal(denied.status, 403);
    assert.equal(state.store.createCalls.length, 0);

    state.accessAllowed = true;
    state.folderRow = { id: "folder-a", project_id: "project-b" };
    const wrongFolder = await POST(
      tusCreateRequest({ projectId: "project-a", folderId: "folder-a" })
    );
    assert.equal(wrongFolder.status, 403);
    assert.equal(state.store.createCalls.length, 0);

    state.folderRow = { id: "folder-a", project_id: "project-a" };
    const allowed = await POST(
      tusCreateRequest({ projectId: "project-a", folderId: "folder-a" })
    );
    assert.equal(allowed.status, 201);
    assert.deepEqual(
      {
        projectId: state.store.createCalls.at(-1)?.projectId,
        folderId: state.store.createCalls.at(-1)?.folderId,
        userId: state.store.createCalls.at(-1)?.userId,
      },
      { projectId: "project-a", folderId: "folder-a", userId: "user-a" }
    );

    const projectlessDenied = await POST(tusCreateRequest({}));
    assert.equal(projectlessDenied.status, 403);

    state.user = null;
    const projectlessAllowed = await POST(
      tusCreateRequest({}, "service-secret")
    );
    assert.equal(projectlessAllowed.status, 201);
    assert.deepEqual(
      {
        projectId: state.store.createCalls.at(-1)?.projectId,
        userId: state.store.createCalls.at(-1)?.userId,
      },
      { projectId: undefined, userId: "service:media-pipeline" }
    );

    const createCallsBeforeProjectImpersonation = state.store.createCalls.length;
    const projectByServiceDenied = await POST(
      tusCreateRequest({ projectId: "project-a" }, "service-secret")
    );
    assert.equal(projectByServiceDenied.status, 401);
    assert.equal(
      state.store.createCalls.length,
      createCallsBeforeProjectImpersonation
    );
  } finally {
    if (previousToken === undefined) {
      delete process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
    } else {
      process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = previousToken;
    }
  }
});

test("legacy TUS creation-with-upload rechecks authority before inline bytes", async () => {
  const state = resetState();
  const getProjectAccess = state.getProjectAccess;
  state.getProjectAccess = async (...args) => {
    const result = await getProjectAccess(...args);
    if (state.accessCalls.length === 1) state.accessAllowed = false;
    return result;
  };

  const { POST } = await import(moduleUrl("app/api/media/tus/route.ts"));
  const response = await POST(
    tusCreateWithUploadRequest({ projectId: "project-a" })
  );

  assert.equal(response.status, 403);
  assert.equal(state.store.createCalls.length, 1);
  assert.equal(state.store.appendCalls, 0);
  assert.equal(state.store.finalizeCalls, 0);
  assert.equal(state.accessCalls.length, 2);
  assert.ok(state.accessCalls.every((call) => call[2] === "editor"));
});

test("legacy TUS rechecks project editor authority before finalization", async () => {
  const state = resetState();
  state.store.upload = {
    id: "upload-1",
    filename: "clip.mp4",
    filetype: "video/mp4",
    size: 4,
    offset: 0,
    projectId: "project-a",
    userId: "user-a",
    createdAt: new Date().toISOString(),
    completed: false,
  };
  state.store.onAppend = () => {
    state.accessAllowed = false;
  };

  const { PATCH } = await import(
    moduleUrl("app/api/media/tus/[uploadId]/route.ts")
  );
  const response = await PATCH(tusPatchRequest(), {
    params: Promise.resolve({ uploadId: "upload-1" }),
  });

  assert.equal(response.status, 403);
  assert.equal(state.store.appendCalls, 1);
  assert.equal(state.store.finalizeCalls, 0);
  assert.equal(state.accessCalls.length, 3);
  assert.ok(state.accessCalls.every((call) => call[2] === "editor"));
});

test("legacy TUS rejects projectless byte appends without the service token", async () => {
  const previousToken = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  const state = resetState();
  process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = "service-secret";
  state.store.upload = {
    id: "upload-1",
    filename: "clip.mp4",
    filetype: "video/mp4",
    size: 8,
    offset: 0,
    userId: "service:media-pipeline",
    createdAt: new Date().toISOString(),
    completed: false,
  };

  try {
    const { PATCH } = await import(
      moduleUrl("app/api/media/tus/[uploadId]/route.ts")
    );
    const denied = await PATCH(tusPatchRequest(), {
      params: Promise.resolve({ uploadId: "upload-1" }),
    });
    assert.equal(denied.status, 403);
    assert.equal(state.store.appendCalls, 0);

    state.user = null;
    const allowed = await PATCH(tusPatchRequest("service-secret"), {
      params: Promise.resolve({ uploadId: "upload-1" }),
    });
    assert.equal(allowed.status, 204);
    assert.equal(state.store.appendCalls, 1);
  } finally {
    if (previousToken === undefined) {
      delete process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
    } else {
      process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = previousToken;
    }
  }
});

test("legacy upload persistence uses explicit return-field allowlists", () => {
  const multipartSource = readFileSync(
    resolve(repositoryRoot, "app/api/media/upload/route.ts"),
    "utf8"
  );
  const storeSource = readFileSync(
    resolve(repositoryRoot, "lib/tus/store.ts"),
    "utf8"
  );

  for (const source of [multipartSource, storeSource]) {
    assert.doesNotMatch(source, /\.select\(\s*\)/);
    assert.match(source, /select\(LEGACY_ASSET_RETURN_COLUMNS\)/);
    assert.match(source, /allowlistedAssetRow\(data\)/);
  }
  assert.match(storeSource, /filename: sanitizeMediaFilename\(params\.filename\)/);
  assert.match(storeSource, /let fileName = sanitizeMediaFilename\(meta\.filename\)/);
});

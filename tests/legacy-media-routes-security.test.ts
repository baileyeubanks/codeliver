import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { NextRequest } from "next/server.js";

import {
  resolveExistingMediaPath,
  SafeMediaPathError,
  sanitizeMediaFilename,
} from "../lib/storage/safe-media-path.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__legacyMediaRouteUser ?? null;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    throw new Error("Unexpected Supabase access in legacy media route test");
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
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

type MediaRouteUser = {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type MediaRouteTestState = typeof globalThis & {
  __legacyMediaRouteUser?: MediaRouteUser | null;
};

const state = globalThis as MediaRouteTestState;

function moduleUrl(path: string): string {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

async function browseGet(request: NextRequest): Promise<Response> {
  const { GET } = await import(moduleUrl("app/api/media/browse/route.ts"));
  return GET(request);
}

async function browsePost(request: NextRequest): Promise<Response> {
  const { POST } = await import(moduleUrl("app/api/media/browse/route.ts"));
  return POST(request);
}

async function streamGet(request: NextRequest): Promise<Response> {
  const { GET } = await import(moduleUrl("app/api/media/stream/route.ts"));
  return GET(request);
}

async function uploadPost(request: NextRequest): Promise<Response> {
  const { POST } = await import(moduleUrl("app/api/media/upload/route.ts"));
  return POST(request);
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function multipartRequest(
  filename: string,
  contents: string | Uint8Array,
  folder = ""
): Promise<NextRequest> {
  const formData = new FormData();
  formData.set("file", new File([contents], filename, { type: "video/mp4" }));
  if (folder) formData.set("folder", folder);

  const serialized = new Request("https://admin.contentco-op.com/api/media/upload", {
    method: "POST",
    body: formData,
  });
  const body = Buffer.from(await serialized.arrayBuffer());
  const headers = new Headers(serialized.headers);
  headers.set("content-length", String(body.length));

  return new NextRequest("https://admin.contentco-op.com/api/media/upload", {
    method: "POST",
    headers,
    body,
  });
}

function setRoot(root: string | undefined): string | undefined {
  const previous = process.env.NAS_MEDIA_ROOT;
  if (root === undefined) delete process.env.NAS_MEDIA_ROOT;
  else process.env.NAS_MEDIA_ROOT = root;
  return previous;
}

function restoreRoot(previous: string | undefined): void {
  if (previous === undefined) delete process.env.NAS_MEDIA_ROOT;
  else process.env.NAS_MEDIA_ROOT = previous;
}

test("canonical containment rejects sibling-prefix traversal and symlink escapes", async () => {
  const parent = mkdtempSync(join(tmpdir(), "legacy-media-containment-"));
  const root = join(parent, "media");
  const sibling = join(parent, "media-private");
  mkdirSync(root);
  mkdirSync(sibling);
  writeFileSync(join(sibling, "secret.mp4"), "secret");
  symlinkSync(sibling, join(root, "escape"), "dir");

  try {
    await assert.rejects(
      resolveExistingMediaPath("../media-private/secret.mp4", "file", root),
      (error) =>
        error instanceof SafeMediaPathError &&
        error.code === "MEDIA_PATH_INVALID"
    );
    await assert.rejects(
      resolveExistingMediaPath("escape/secret.mp4", "file", root),
      (error) =>
        error instanceof SafeMediaPathError &&
        error.code === "MEDIA_PATH_INVALID"
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("upload filenames collapse to one safe basename", () => {
  assert.equal(sanitizeMediaFilename("../../client-cut.mp4"), "client-cut.mp4");
  assert.equal(sanitizeMediaFilename("..\\..\\client-cut.mp4"), "client-cut.mp4");
  assert.equal(sanitizeMediaFilename(".."), "upload");

  const sanitized = sanitizeMediaFilename("folder/\u0000bad\nname.mp4");
  assert.doesNotMatch(sanitized, /[/\\\u0000-\u001f\u007f]/);
  assert.notEqual(sanitized, ".");
  assert.notEqual(sanitized, "..");
});

test("client and unclassified identities cannot use raw NAS operations", async () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-media-role-"));
  const previousRoot = setRoot(root);

  try {
    for (const user of [
      { app_metadata: { content_coop_role: "client" } },
      {
        app_metadata: {},
        user_metadata: { content_coop_role: "staff", role: "staff" },
      },
    ]) {
      state.__legacyMediaRouteUser = user;
      const responses = await Promise.all([
        browseGet(new NextRequest("https://admin.contentco-op.com/api/media/browse")),
        browsePost(
          jsonRequest("https://admin.contentco-op.com/api/media/browse", {
            folderName: "Denied",
          })
        ),
        streamGet(
          new NextRequest(
            "https://admin.contentco-op.com/api/media/stream?path=clip.mp4"
          )
        ),
        uploadPost(
          new NextRequest("https://admin.contentco-op.com/api/media/upload", {
            method: "POST",
            headers: { "content-length": "0" },
          })
        ),
      ]);

      assert.deepEqual(
        responses.map((response) => response.status),
        [403, 403, 403, 403]
      );
    }
  } finally {
    state.__legacyMediaRouteUser = null;
    restoreRoot(previousRoot);
    rmSync(root, { recursive: true, force: true });
  }
});

test("all raw NAS operations fail closed when NAS_MEDIA_ROOT is absent", async () => {
  const previousRoot = setRoot(undefined);
  state.__legacyMediaRouteUser = {
    app_metadata: { content_coop_role: "staff" },
  };

  try {
    const responses = await Promise.all([
      browseGet(new NextRequest("https://admin.contentco-op.com/api/media/browse")),
      browsePost(
        jsonRequest("https://admin.contentco-op.com/api/media/browse", {
          folderName: "MissingRoot",
        })
      ),
      streamGet(
        new NextRequest(
          "https://admin.contentco-op.com/api/media/stream?path=clip.mp4"
        )
      ),
      uploadPost(
        new NextRequest("https://admin.contentco-op.com/api/media/upload", {
          method: "POST",
          headers: { "content-length": "0" },
        })
      ),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 503);
      const body = await response.text();
      assert.doesNotMatch(body, /\/volume1\/media|NAS_MEDIA_ROOT|\/Users\//);
    }
  } finally {
    restoreRoot(previousRoot);
    state.__legacyMediaRouteUser = null;
  }
});

test("oversized legacy uploads are rejected before multipart buffering", async () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-media-limit-"));
  const previousRoot = setRoot(root);
  state.__legacyMediaRouteUser = {
    app_metadata: { content_coop_role: "staff" },
  };

  try {
    const response = await uploadPost(
      new NextRequest("https://admin.contentco-op.com/api/media/upload", {
        method: "POST",
        headers: { "content-length": String(27 * 1024 * 1024) },
      })
    );
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: "Legacy upload is limited to 25 MiB. Use the resumable upload endpoint.",
      code: "LEGACY_UPLOAD_TOO_LARGE",
      maxBytes: 25 * 1024 * 1024,
      resumableUploadUrl: "/api/media/tus",
    });

    const forgedLengthResponse = await uploadPost(
      new NextRequest("https://admin.contentco-op.com/api/media/upload", {
        method: "POST",
        headers: {
          "content-length": "1",
          "content-type": "multipart/form-data; boundary=untrusted",
        },
        body: Buffer.alloc(26 * 1024 * 1024 + 1),
      })
    );
    assert.equal(forgedLengthResponse.status, 413);
    const forgedLengthBody = await forgedLengthResponse.json();
    assert.equal(forgedLengthBody.code, "LEGACY_UPLOAD_TOO_LARGE");
    assert.equal(forgedLengthBody.resumableUploadUrl, "/api/media/tus");
  } finally {
    restoreRoot(previousRoot);
    state.__legacyMediaRouteUser = null;
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy uploads sanitize traversal names and never overwrite on races", async () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-media-upload-"));
  const previousRoot = setRoot(root);
  state.__legacyMediaRouteUser = {
    app_metadata: { content_coop_role: "staff" },
  };
  writeFileSync(join(root, "client-cut.mp4"), "original");

  try {
    const requests = await Promise.all([
      multipartRequest("../../client-cut.mp4", "first"),
      multipartRequest("..\\..\\client-cut.mp4", "second"),
    ]);
    const responses = await Promise.all(requests.map((request) => uploadPost(request)));
    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200]
    );

    const payloads = await Promise.all(responses.map((response) => response.json()));
    const uploadedNames = payloads.map((payload) => payload.fileName as string);
    assert.equal(new Set(uploadedNames).size, 2);
    assert.ok(uploadedNames.every((name) => !name.includes("/") && !name.includes("\\")));
    assert.ok(uploadedNames.every((name) => name !== "client-cut.mp4"));
    assert.equal(readFileSync(join(root, "client-cut.mp4"), "utf8"), "original");

    for (const payload of payloads) {
      assert.equal(payload.relativePath, payload.fileName);
      assert.ok(existsSync(join(root, payload.fileName)));
      assert.doesNotMatch(JSON.stringify(payload), /\/Users\/|legacy-media-upload-/);
    }
  } finally {
    restoreRoot(previousRoot);
    state.__legacyMediaRouteUser = null;
    rmSync(root, { recursive: true, force: true });
  }
});

test("browse and stream reject NAS symlinks without exposing their targets", async () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-media-symlink-root-"));
  const outside = mkdtempSync(join(tmpdir(), "legacy-media-symlink-outside-"));
  const previousRoot = setRoot(root);
  state.__legacyMediaRouteUser = {
    app_metadata: { content_coop_role: "staff" },
  };
  writeFileSync(join(outside, "secret.mp4"), "secret");
  symlinkSync(outside, join(root, "escape"), "dir");

  try {
    const browseResponse = await browseGet(
      new NextRequest("https://admin.contentco-op.com/api/media/browse")
    );
    assert.equal(browseResponse.status, 200);
    const listing = await browseResponse.json();
    assert.equal(listing.folders.some((folder: { name: string }) => folder.name === "escape"), false);

    const streamResponse = await streamGet(
      new NextRequest(
        "https://admin.contentco-op.com/api/media/stream?path=escape%2Fsecret.mp4"
      )
    );
    assert.equal(streamResponse.status, 403);
    const body = await streamResponse.text();
    assert.doesNotMatch(body, new RegExp(outside.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    restoreRoot(previousRoot);
    state.__legacyMediaRouteUser = null;
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !extname(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const values = new Map<string, string>();
let failWrites = false;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (failWrites) throw new Error("quota");
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    },
    addEventListener() {},
    removeEventListener() {},
  },
});

after(() => {
  Reflect.deleteProperty(globalThis, "window");
});

function moduleUrl(path: string) {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

test("local edit and resolution persist only for the exact review comment binding", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts"));
  const binding = {
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    reviewInviteId: "mutation-review",
    assetType: "video",
  };
  const root = workspace.addDemoReviewComment({
    ...binding,
    body: "Original local note.",
    timeSeconds: 18,
  });
  assert.ok(root);
  const reply = workspace.addDemoReviewComment({
    ...binding,
    parentId: root.id,
    body: "Local reply.",
    timeSeconds: 0,
  });
  assert.ok(reply);

  const scope = { ...binding, commentId: root.id };
  const edited = workspace.editDemoPublicReviewComment({
    ...scope,
    body: "  Updated local note.  ",
  });
  assert.equal(edited?.body, "Updated local note.");
  assert.ok(edited?.updated_at);

  const resolved = workspace.setDemoPublicReviewCommentResolved({
    ...scope,
    resolved: true,
  });
  assert.equal(resolved?.status, "resolved");
  assert.ok(resolved?.resolved_at);

  const restored = workspace.restoreDemoWorkspace(
    values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY),
  );
  const saved = restored.reviewComments.find((comment) => comment.id === root.id);
  assert.equal(saved?.body, "Updated local note.");
  assert.equal(saved?.status, "resolved");
  assert.ok(saved?.resolved_at);

  for (const wrongScope of [
    { projectId: "other-project" },
    { assetId: "other-asset" },
    { versionId: "demo-version-5" },
    { reviewInviteId: "other-invite" },
    { commentId: "missing-comment" },
  ]) {
    assert.equal(
      workspace.editDemoPublicReviewComment({
        ...scope,
        ...wrongScope,
        body: "Must not cross review scope.",
      }),
      null,
    );
    assert.equal(
      workspace.setDemoPublicReviewCommentResolved({
        ...scope,
        ...wrongScope,
        resolved: false,
      }),
      null,
    );
  }

  assert.equal(
    workspace.setDemoPublicReviewCommentResolved({
      ...binding,
      commentId: reply.id,
      resolved: true,
    }),
    null,
    "reply status cannot silently become a thread status",
  );
  assert.equal(
    workspace.editDemoPublicReviewComment({ ...scope, body: "   " }),
    null,
  );
  assert.equal(
    workspace.editDemoPublicReviewComment({ ...scope, body: "x".repeat(32 * 1024 + 1) }),
    null,
  );
});

test("failed browser persistence cannot report edit or resolution success", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts"));
  const binding = {
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    reviewInviteId: "failed-mutation-review",
    assetType: "video",
  };
  const root = workspace.addDemoReviewComment({
    ...binding,
    body: "Keep this unchanged.",
    timeSeconds: 28,
  });
  assert.ok(root);
  const scope = { ...binding, commentId: root.id };

  failWrites = true;
  try {
    assert.equal(
      workspace.editDemoPublicReviewComment({ ...scope, body: "Not durable." }),
      null,
    );
    assert.equal(
      workspace.setDemoPublicReviewCommentResolved({ ...scope, resolved: true }),
      null,
    );
  } finally {
    failWrites = false;
  }

  const inMemory = workspace
    .getDemoWorkspaceSnapshot()
    .reviewComments.find((comment) => comment.id === root.id);
  assert.equal(inMemory?.body, "Keep this unchanged.");
  assert.equal(inMemory?.status, "open");
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { AnnotationData } from "../lib/types/codeliver.ts";

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
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
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

test("demo vector annotations survive reload only in their exact review cut", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts"));
  const { submitReviewComment } = await import(
    moduleUrl("lib/review/submit-review-comment.ts")
  );

  const freehandPoints = Array.from({ length: 700 }, (_, index) =>
    index % 2 === 0
      ? (index / 2) / 349
      : 0.5 + Math.sin(((index - 1) / 2 / 349) * Math.PI * 4) * 0.3,
  );
  const submittedAnnotations: AnnotationData[] = [
    { kind: "arrow", points: [0.1, 0.2, 0.8, 0.7] },
    { kind: "rectangle", x: 0.2, y: 0.3, width: 0.4, height: 0.2 },
    { kind: "freehand", points: freehandPoints },
    { kind: "pin", x: 0.45, y: 0.55, label: "Logo" },
    { kind: "text", x: 0.3, y: 0.35, text: "Raise this title" },
  ];

  const comment = await submitReviewComment({
    token: "local-review-token",
    demoMode: true,
    assetId: "denie-mcdonald-v4",
    assetType: "video",
    reviewerName: "Vector Reviewer",
    body: "Keep every bounded stroke on this exact cut.",
    timecode: 12.5,
    pin: { x: 45, y: 55 },
    versionId: "demo-version-4",
    reviewInviteId: "share-exact-cut",
    drawing: `data:image/webp;base64,${"A".repeat(8_192)}`,
    annotations: submittedAnnotations,
  });

  const serialized = values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY) ?? "";
  assert.doesNotMatch(serialized, /data:image\/webp/);

  const restored = workspace.restoreDemoWorkspace(serialized);
  const persisted = restored.reviewComments.find((item) => item.id === comment.id);
  assert.ok(persisted);
  assert.equal(persisted.asset_id, "denie-mcdonald-v4");
  assert.equal(persisted.version_id, "demo-version-4");
  assert.equal(persisted.review_invite_id, "share-exact-cut");
  assert.equal(persisted.annotations?.length, submittedAnnotations.length);
  const persistedFreehand = persisted.annotations?.find(
    (annotation) => annotation.kind === "freehand",
  );
  assert.ok(persistedFreehand?.kind === "freehand");
  assert.ok(persistedFreehand.points.length <= 512);

  const { projectPersistedDemoReviewComment } = await import(
    moduleUrl("lib/review/demo-comment-projection.ts")
  );
  const binding = {
    projectId: "ica",
    assetId: "denie-mcdonald-v4",
    versionId: "demo-version-4",
    reviewInviteId: "share-exact-cut",
    assetType: "video",
  };
  const projected = projectPersistedDemoReviewComment(persisted, binding);
  assert.ok(projected);
  assert.deepEqual(
    projected.annotations?.map((annotation) => annotation.data),
    persisted.annotations,
  );
  assert.equal(projected.attachments, undefined);

  assert.equal(
    projectPersistedDemoReviewComment(persisted, {
      ...binding,
      versionId: "demo-version-5",
    }),
    null,
  );
  assert.equal(
    projectPersistedDemoReviewComment(persisted, {
      ...binding,
      reviewInviteId: "share-other-review",
    }),
    null,
  );
});

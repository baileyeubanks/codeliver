import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  reviewPinNormalizedToPercent,
  reviewPinPercentToNormalized,
} from "../lib/review/pin-coordinates.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
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

function moduleUrl(path: string, instance: string) {
  const url = pathToFileURL(resolve(repositoryRoot, path));
  url.searchParams.set("review-pin", instance);
  return url.href;
}

test("review pin coordinates cross the API boundary without changing display placement", () => {
  assert.equal(reviewPinPercentToNormalized(0), 0);
  assert.equal(reviewPinPercentToNormalized(25), 0.25);
  assert.equal(reviewPinPercentToNormalized(100), 1);
  assert.equal(reviewPinPercentToNormalized(null), null);

  assert.equal(reviewPinNormalizedToPercent(0), 0);
  assert.equal(reviewPinNormalizedToPercent(0.25), 25);
  assert.equal(reviewPinNormalizedToPercent(1), 100);
});

test("review pin normalization is bounded and legacy display coordinates remain readable", () => {
  assert.equal(reviewPinPercentToNormalized(-10), 0);
  assert.equal(reviewPinPercentToNormalized(125), 1);
  assert.equal(reviewPinNormalizedToPercent(25), 25);
  assert.equal(reviewPinNormalizedToPercent(Number.NaN), undefined);
  assert.equal(reviewPinNormalizedToPercent(125), undefined);
});

test("public review DTO renders canonical normalized pins as percentages and preserves legacy display pins", async () => {
  const { toPublicReviewComment } = await import(
    moduleUrl("lib/review/public-dto.ts", "dto"),
  );
  const base = {
    id: "comment-1",
    asset_id: "asset-1",
    author_name: "Reviewer",
    body: "Pinned note",
    status: "open",
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
  };

  const canonical = toPublicReviewComment({ ...base, pin_x: 0.25, pin_y: 0.75 });
  assert.deepEqual([canonical.pin_x, canonical.pin_y], [25, 75]);

  const legacy = toPublicReviewComment({ ...base, id: "comment-2", pin_x: 25, pin_y: 75 });
  assert.deepEqual([legacy.pin_x, legacy.pin_y], [25, 75]);
});

test("non-demo comment submissions send normalized pins while image comments omit timecodes", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "comment-1" }), { status: 201 });
  }) as typeof fetch;

  try {
    const { submitReviewComment } = await import(
      moduleUrl("lib/review/submit-review-comment.ts", "non-demo"),
    );
    const comment = await submitReviewComment({
      token: "public-token",
      demoMode: false,
      assetId: "asset-1",
      assetType: "image",
      reviewerName: "Reviewer",
      body: "Frame note",
      timecode: null,
      pin: { x: 25, y: 75 },
      parentId: "comment-root",
    });

    assert.equal(comment.id, "comment-1");
    assert.deepEqual(requestBody, {
      body: "Frame note",
      author_name: "Reviewer",
      parent_id: "comment-root",
      timecode_seconds: null,
      pin_x: 0.25,
      pin_y: 0.75,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("demo image comments retain display percentages and persist a safe numeric store time", async () => {
  const values = new Map<string, string>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
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

  try {
    const { submitReviewComment } = await import(
      moduleUrl("lib/review/submit-review-comment.ts", "demo-image"),
    );
    const comment = await submitReviewComment({
      token: "demo",
      demoMode: true,
      assetId: "demo-image-1",
      assetType: "image",
      reviewerName: "Reviewer",
      body: "Frame note",
      timecode: null,
      pin: { x: 25, y: 75 },
    });

    assert.equal(comment.timecode_seconds, null);
    assert.deepEqual([comment.pin_x, comment.pin_y], [25, 75]);
    const storedState = JSON.parse(Array.from(values.values())[0] ?? "{}") as {
      reviewComments?: Array<{ id: string; time_seconds: number; pin_x?: number; pin_y?: number }>;
    };
    const stored = storedState.reviewComments?.find((candidate) => candidate.id === comment.id);
    assert.deepEqual(
      stored && [stored.time_seconds, stored.pin_x, stored.pin_y],
      [0, 25, 75],
    );
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("non-demo public comment API rejects percentage pins before invite authorization", async () => {
  const { POST } = await import(
    moduleUrl("app/api/review/[token]/comments/route.ts", "non-demo-bounds"),
  );
  const response = await POST(
    new Request("http://localhost/api/review/public-token/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: "Pinned note",
        pin_x: 25,
        pin_y: 75,
      }),
    }),
    { params: Promise.resolve({ token: "public-token" }) },
  );

  assert.equal(response.status, 400);
});

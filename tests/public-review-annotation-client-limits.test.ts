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

const demoStoreStub = dataModule(`
  export function addDemoReviewComment() {
    throw new Error("demo persistence is outside this transport-boundary test");
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/demo/workspace-store") {
      return nextResolve(demoStoreStub, context);
    }
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

const { submitReviewComment } = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/review/submit-review-comment.ts")).href
);

function commentResponse() {
  return Response.json({
    comment: {
      id: "comment-client-limit",
      review_id: null,
      review_invite_id: "invite-client-limit",
      asset_id: "asset-client-limit",
      version_id: "version-client-limit",
      parent_id: null,
      author_name: "Reviewer",
      author_email: null,
      author_id: null,
      body: "Precise drawing note",
      rich_body: null,
      timecode_seconds: 4.2,
      frame_number: null,
      pin_x: 50,
      pin_y: 50,
      mentions: [],
      status: "open",
      visibility: "external",
      resolved_by: null,
      resolved_at: null,
      created_at: "2026-09-22T04:30:00.000Z",
      updated_at: "2026-09-22T04:30:00.000Z",
    },
  }, { status: 201 });
}

const baseInput = {
  token: "opaque-token",
  demoMode: false,
  assetId: "asset-client-limit",
  assetType: "video",
  reviewerName: "Reviewer",
  body: "Precise drawing note",
  timecode: 4.2,
  pin: { x: 50, y: 50 },
};

test("comment transport bounds a long freehand path before serializing it", async (t) => {
  let requestBody: Record<string, unknown> | null = null;
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return commentResponse();
  });

  const points = Array.from({ length: 700 }, (_, index) =>
    index % 2 === 0
      ? (index / 2) / 349
      : 0.5 + Math.sin(((index - 1) / 2 / 349) * Math.PI * 4) * 0.3,
  );
  const comment = await submitReviewComment({
    ...baseInput,
    annotations: [{ kind: "freehand", points }],
  });

  const annotations = requestBody?.annotations as Array<{
    kind: string;
    points: number[];
  }>;
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].kind, "freehand");
  assert.ok(annotations[0].points.length <= 512);
  assert.deepEqual(annotations[0].points.slice(0, 2), points.slice(0, 2));
  assert.deepEqual(annotations[0].points.slice(-2), points.slice(-2));

  const returned = comment.annotations?.[0]?.data;
  assert.ok(returned?.kind === "freehand");
  assert.deepEqual(returned.points, annotations[0].points);
});

test("comment transport rejects a twenty-first stroke before fetch with a recoverable message", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => commentResponse());
  const annotations = Array.from({ length: 21 }, () => ({
    kind: "rectangle" as const,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
  }));

  await assert.rejects(
    () => submitReviewComment({ ...baseInput, annotations }),
    /Clear the drawing and try again with 20 or fewer strokes\./,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

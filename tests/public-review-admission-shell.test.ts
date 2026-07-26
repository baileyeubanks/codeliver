import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("production review opens admission before payload and preserves browser privacy", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const priorFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (calls.length === 1) {
      return Response.json({
        admission_id: "11111111-1111-4111-8111-111111111111",
        expires_at: "2026-07-26T18:00:00.000Z",
        grant_expires_at: "2026-07-26T10:15:00.000Z",
        view_count: 1,
        max_views: 1,
      }, { status: 201 });
    }
    return Response.json({ asset: { id: "asset-a" } });
  }) as typeof fetch;

  try {
    const { loadAdmittedPublicReview } = await import(
      pathToFileURL(
        resolve(repositoryRoot, "lib/review/public-admission-client.ts"),
      ).href
    );
    const payload = await loadAdmittedPublicReview("opaque-token");

    assert.deepEqual(payload, { asset: { id: "asset-a" } });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.input, "/api/review/opaque-token/admission");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.deepEqual(calls[0]?.init?.headers, {
      "Content-Type": "application/json",
    });
    assert.equal(calls[0]?.init?.body, "{}");
    assert.equal(calls[0]?.init?.credentials, "same-origin");
    assert.equal(calls[0]?.init?.cache, "no-store");
    assert.equal(calls[0]?.init?.referrerPolicy, "no-referrer");
    assert.equal(calls[1]?.input, "/api/review/opaque-token");
    assert.equal(calls[1]?.init?.credentials, "same-origin");
    assert.equal(calls[1]?.init?.cache, "no-store");
    assert.equal(calls[1]?.init?.referrerPolicy, "no-referrer");
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("failed admission never attempts the review payload", async () => {
  const calls: string[] = [];
  const priorFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return Response.json(
      { error: "Review link is unavailable" },
      { status: 410 },
    );
  }) as typeof fetch;

  try {
    const { loadAdmittedPublicReview } = await import(
      pathToFileURL(
        resolve(repositoryRoot, "lib/review/public-admission-client.ts"),
      ).href
    );
    await assert.rejects(
      loadAdmittedPublicReview("opaque-token"),
      /Review link is unavailable/,
    );
    assert.deepEqual(calls, ["/api/review/opaque-token/admission"]);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("overlapping initial and renewal admission calls share one server admission", async () => {
  let releaseResponse: ((response: Response) => void) | undefined;
  const calls: string[] = [];
  const priorFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Promise<Response>((resolveResponse) => {
      releaseResponse = resolveResponse;
    });
  }) as typeof fetch;

  try {
    const { renewPublicReviewAdmission } = await import(
      pathToFileURL(
        resolve(repositoryRoot, "lib/review/public-admission-client.ts"),
      ).href
    );
    const first = renewPublicReviewAdmission("single-flight-token");
    const overlapping = renewPublicReviewAdmission("single-flight-token");
    await new Promise<void>((resolveImmediate) =>
      setImmediate(resolveImmediate)
    );
    assert.deepEqual(calls, [
      "/api/review/single-flight-token/admission",
    ]);
    releaseResponse?.(Response.json({
      admission_id: "11111111-1111-4111-8111-111111111111",
      expires_at: "2026-07-26T18:00:00.000Z",
      grant_expires_at: "2026-07-26T10:15:00.000Z",
    }));
    await Promise.all([first, overlapping]);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("production page defers invite authority to admission and renews long sessions", () => {
  const page = readFileSync(
    resolve(repositoryRoot, "app/review/[token]/page.tsx"),
    "utf8",
  );
  const client = readFileSync(
    resolve(repositoryRoot, "components/review/PublicReviewPage.tsx"),
    "utf8",
  );

  assert.doesNotMatch(page, /getReviewInviteByToken|BackendUnavailableError/);
  assert.match(page, /isOpaqueRouteToken\(token\)/);
  assert.match(page, /referrer:\s*"no-referrer"/);
  assert.match(client, /loadAdmittedPublicReview\(token\)/);
  assert.match(client, /renewPublicReviewAdmission\(token\)/);
  assert.match(client, /REVIEW_ADMISSION_RENEWAL_INTERVAL_MS/);
  assert.match(client, /visibilitychange/);
  assert.match(client, /window\.addEventListener\("focus"/);
});

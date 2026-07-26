import assert from "node:assert/strict";
import test from "node:test";

// Runtime status contract for P9 (D19/D20): dynamic routes must return real
// HTTP statuses, and demo share links must canonicalize to /review/<token>.
// These tests probe the live runtimes and skip when they are not running.
// Override targets with CO_PROD_BASE_URL / CO_DEMO_BASE_URL.

const PROD_BASE = (process.env.CO_PROD_BASE_URL ?? "http://127.0.0.1:4103").replace(/\/$/, "");
const DEMO_BASE = (process.env.CO_DEMO_BASE_URL ?? "http://localhost:4115").replace(/\/$/, "");

async function reachable(base: string): Promise<boolean> {
  try {
    await fetch(`${base}/api/health`, {
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch {
    return false;
  }
}

async function probe(url: string): Promise<{ status: number; location: string | null }> {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  return { status: response.status, location: response.headers.get("location") };
}

const prodUp = await reachable(PROD_BASE);
const demoUp = await reachable(DEMO_BASE);

test(
  "production public review routes return real 404 statuses for missing records",
  { skip: !prodUp && `production runtime not reachable at ${PROD_BASE}` },
  async () => {
    // Fails the opaque-token shape: notFound() before any database lookup.
    assert.equal((await probe(`${PROD_BASE}/review/bogus-token`)).status, 404);
    // Passes the token shape. With a live database the missing row is a
    // confirmed 404; with the backend absent the route must fail closed with
    // a server error instead of claiming "not found" (it cannot know).
    const backendDown =
      (await probe(`${PROD_BASE}/api/projects`)).status === 503;
    const opaque = (await probe(`${PROD_BASE}/review/bogus-token-1234567890`)).status;
    if (backendDown) {
      assert.ok(opaque >= 500, `expected fail-closed 5xx with backend down, got ${opaque}`);
    } else {
      assert.equal(opaque, 404);
    }
    // A demo-shaped token is not a production record.
    assert.equal((await probe(`${PROD_BASE}/review/demo-ica-final`)).status, 404);
  },
);

test(
  "demo runtime returns real 404 statuses for unknown dynamic routes",
  { skip: !demoUp && `demo runtime not reachable at ${DEMO_BASE}` },
  async () => {
    assert.equal((await probe(`${DEMO_BASE}/review/bogus-token?demo=1`)).status, 404);
    assert.equal((await probe(`${DEMO_BASE}/review/bogus-token-1234567890?demo=1`)).status, 404);
    assert.equal((await probe(`${DEMO_BASE}/review/ica?demo=1`)).status, 404);
    assert.equal((await probe(`${DEMO_BASE}/projects/does-not-exist?demo=1`)).status, 404);
  },
);

test(
  "demo short share URLs resolve and the long query form redirects to them",
  { skip: !demoUp && `demo runtime not reachable at ${DEMO_BASE}` },
  async () => {
    assert.equal((await probe(`${DEMO_BASE}/review/demo-ica-final?demo=1`)).status, 200);
    assert.equal((await probe(`${DEMO_BASE}/review/demo-ceraweek-cuts?demo=1`)).status, 200);

    const longForm = await probe(
      `${DEMO_BASE}/review/demo?demo=1&asset=ica-roadshow-final&intent=approval_needed&share=demo-ica-final`,
    );
    assert.equal(longForm.status, 308);
    assert.equal(
      new URL(longForm.location ?? "", DEMO_BASE).pathname + new URL(longForm.location ?? "", DEMO_BASE).search,
      "/review/demo-ica-final?demo=1",
    );

    // The proxy rewrite marks itself; the marked long form must not redirect-loop.
    const rewritten = await probe(
      `${DEMO_BASE}/review/demo?demo=1&share=demo-ica-final&demo-short=1`,
    );
    assert.equal(rewritten.status, 200);
  },
);

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
  "production review documents validate shape and admission rejects missing records",
  { skip: !prodUp && `production runtime not reachable at ${PROD_BASE}` },
  async () => {
    // Fails the opaque-token shape: notFound() before any database lookup.
    assert.equal((await probe(`${PROD_BASE}/review/bogus-token`)).status, 404);
    // Opaque tokens receive the privacy-preserving client shell. The document
    // must not look up or consume a grant before the admission request (including
    // a reviewer reopening their final allowed view).
    assert.equal((await probe(`${PROD_BASE}/review/bogus-token-1234567890`)).status, 200);
    const admission = await fetch(`${PROD_BASE}/api/review/bogus-token-1234567890/admission`, {
      method: "POST",
      headers: {
        Origin: new URL(PROD_BASE).origin,
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin",
      },
      body: "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    // A confirmed missing token is 404. A direct origin without the trusted
    // ingress identity, or unavailable authority, must instead fail closed.
    const payload = await admission.json();
    const directOriginDenied =
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(PROD_BASE).hostname) &&
      admission.status === 403 && payload.code === "REVIEW_ORIGIN_FORBIDDEN";
    assert.ok(directOriginDenied || [404, 503].includes(admission.status), `expected missing/unavailable admission, got ${admission.status}`);
    assert.equal(admission.headers.get("set-cookie"), null);
    assert.equal(payload.grant, undefined);
    assert.equal(payload.asset, undefined);
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

import assert from "node:assert/strict";
import test from "node:test";

import { hashOpaqueToken } from "../lib/security/opaque-token.ts";
import {
  claimShareLinkView,
  reviewViewClaimRequestId,
} from "../lib/sharing/share-claims.ts";

const token = "opaque-public-review-bearer";
const requestId = "00000000-0000-4000-8000-000000000021";
const claimed = {
  status: "claimed",
  replayed: false,
  claim_id: "00000000-0000-4000-8000-000000000022",
  project_id: "00000000-0000-4000-8000-000000000023",
  asset_id: "00000000-0000-4000-8000-000000000024",
  invite_id: "00000000-0000-4000-8000-000000000025",
  version_id: "00000000-0000-4000-8000-000000000026",
  view_count: 3,
  max_views: 3,
  claimed_at: "2026-07-15T12:00:00.000Z",
};

function rpcClient(data: unknown, error: unknown = null) {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      async rpc(name: string, parameters: Record<string, unknown>) {
        calls.push({ name, parameters });
        return { data, error };
      },
    },
  };
}

test("isolated claims send only the token hash and replay the stable request UUID", async () => {
  const firstRpc = rpcClient(claimed);
  const first = await claimShareLinkView(
    { token, requestId },
    { schema: "co_production", client: firstRpc.client },
  );
  const replayRpc = rpcClient({ ...claimed, replayed: true });
  const replay = await claimShareLinkView(
    { token, requestId },
    { schema: "co_production", client: replayRpc.client },
  );

  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  if (!first.ok || first.mode !== "atomic" || !replay.ok || replay.mode !== "atomic") {
    assert.fail("expected atomic claims");
  }
  assert.equal(first.claim.viewCount, 3);
  assert.equal(replay.claim.replayed, true);
  assert.equal(replay.claim.requestId, requestId);
  assert.deepEqual(firstRpc.calls, [
    {
      name: "claim_share_link_view",
      parameters: {
        p_token_hash: hashOpaqueToken(token),
        p_request_id: requestId,
      },
    },
  ]);
  assert.equal(JSON.stringify(firstRpc.calls).includes(token), false);
  assert.equal(JSON.stringify(first).includes(token), false);
});

test("claim policy outcomes map to stable public responses", async () => {
  const cases = [
    ["not_found", 404, "Invalid or expired review link"],
    ["revoked", 410, "This review link is no longer active"],
    ["expired", 410, "This review link has expired"],
    ["exhausted", 410, "This review link has reached its view limit"],
  ] as const;

  for (const [status, expectedStatus, expectedError] of cases) {
    const payload =
      status === "exhausted"
        ? { status, replayed: false, view_count: 2, max_views: 2 }
        : { status, replayed: false };
    const rpc = rpcClient(payload);
    const result = await claimShareLinkView(
      { token, requestId },
      { schema: "co_production", client: rpc.client },
    );

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected rejected claim");
    assert.equal(result.status, expectedStatus);
    assert.equal(result.code, status);
    assert.equal(result.error, expectedError);
  }
});

test("malformed or failed RPC responses fail closed without leaking authority", async () => {
  for (const [data, error] of [
    [{ ...claimed, claim_id: "malformed" }, null],
    [{ status: "claimed", replayed: true }, null],
    [{ status: "exhausted", replayed: false, view_count: 0, max_views: 2 }, null],
    [null, { message: `database failed for ${token}` }],
  ] as const) {
    const rpc = rpcClient(data, error);
    const result = await claimShareLinkView(
      { token, requestId },
      { schema: "co_production", client: rpc.client },
    );

    assert.deepEqual(result, {
      ok: false,
      mode: "atomic",
      status: 503,
      code: "unavailable",
      error: "Review access is temporarily unavailable",
    });
    assert.equal(JSON.stringify(result).includes(token), false);
  }
});

test("legacy links keep their existing path and do not require claim headers", async () => {
  const rpc = rpcClient(claimed);
  const result = await claimShareLinkView(
    { token, requestId: null },
    { schema: "public", client: rpc.client },
  );

  assert.deepEqual(result, { ok: true, mode: "legacy" });
  assert.equal(rpc.calls.length, 0);
});

test("claim request IDs are strict UUIDs and invalid isolated requests never reach RPC", async () => {
  const validRequest = new Request("https://co-videopro.com/review/token", {
    headers: { "X-Review-View-Claim-Id": requestId.toUpperCase() },
  });
  assert.equal(reviewViewClaimRequestId(validRequest), requestId);
  assert.equal(
    reviewViewClaimRequestId(
      new Request("https://co-videopro.com/review/token", {
        headers: { "X-Review-View-Claim-Id": "not-a-uuid" },
      }),
    ),
    null,
  );

  const rpc = rpcClient(claimed);
  const result = await claimShareLinkView(
    { token, requestId: null },
    { schema: "co_production", client: rpc.client },
  );
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("expected invalid request");
  assert.equal(result.status, 400);
  assert.equal(rpc.calls.length, 0);
});

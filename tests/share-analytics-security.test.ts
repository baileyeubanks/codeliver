import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const CO_PRODUCTION_DATA_SCHEMA = "co_production";
  export function getSupabaseDataSchema() {
    return globalThis.__ccoAnalyticsSchema || "co_production";
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/data-authority") {
      return nextResolve(authorityStubUrl, context);
    }
    return nextResolve(specifier, context);
  },
});

const analyticsModuleUrl = pathToFileURL(
  resolve(repositoryRoot, "lib/sharing/share-analytics.ts"),
).href;

const inviteId = "11111111-1111-4111-8111-111111111111";
const clientRequestId = "22222222-2222-4222-8222-222222222222";

function validPayload() {
  return {
    invite_id: inviteId,
    client_request_id: clientRequestId,
    duration_seconds: 42,
    actions: {
      event: "pause",
      position_seconds: 12.5,
      completion_percent: 30,
      session_id: "session_public_01",
      surface: "review",
      device: "desktop",
    },
  };
}

test("share analytics accepts a bounded event contract", async () => {
  const { normalizeShareAnalyticsInput } = await import(analyticsModuleUrl);
  const result = normalizeShareAnalyticsInput(validPayload());

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, {
    inviteId,
    clientRequestId,
    durationSeconds: 42,
    actions: validPayload().actions,
  });
});

test("share analytics rejects arbitrary action data and invalid ranges", async () => {
  const { normalizeShareAnalyticsInput } = await import(analyticsModuleUrl);
  const withPii = validPayload();
  Object.assign(withPii.actions, { reviewer_email: "person@example.test" });
  const invalidRange = validPayload();
  invalidRange.duration_seconds = 604_801;
  const unsupported = validPayload();
  unsupported.actions.event = "arbitrary_tracking_event";

  assert.deepEqual(normalizeShareAnalyticsInput(withPii), {
    ok: false,
    error: "actions contains an unsupported field",
  });
  assert.equal(normalizeShareAnalyticsInput(invalidRange).ok, false);
  assert.equal(normalizeShareAnalyticsInput(unsupported).ok, false);
});

test("review analytics requires one non-conflicting opaque token", async () => {
  const { extractReviewAnalyticsToken } = await import(analyticsModuleUrl);
  const bearer = new Request("https://client.contentco-op.com/api/sharing/analytics", {
    headers: { authorization: "Bearer abcdefghijklmnop" },
  });
  const conflict = new Request("https://client.contentco-op.com/api/sharing/analytics", {
    headers: { "x-co-production-review-token": "abcdefghijklmnop" },
  });

  assert.deepEqual(extractReviewAnalyticsToken(bearer, {}), {
    ok: true,
    token: "abcdefghijklmnop",
  });
  assert.equal(
    extractReviewAnalyticsToken(conflict, {
      review_token: "qrstuvwxyzABCDEF",
    }).ok,
    false,
  );
  assert.equal(extractReviewAnalyticsToken(new Request("https://example.test"), {}).ok, false);
});

test("viewer addresses are invite-scoped daily HMACs, never raw addresses", async () => {
  const { extractClientAddress, hashViewerAddress } = await import(analyticsModuleUrl);
  const key = Buffer.alloc(32, 7).toString("base64url");
  const request = new Request("https://client.contentco-op.com", {
    headers: {
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.10, 10.0.0.1",
    },
  });
  const address = extractClientAddress(request);
  const first = hashViewerAddress({
    address,
    inviteId,
    observedAt: new Date("2026-07-15T12:00:00.000Z"),
    keyValue: key,
  });
  const same = hashViewerAddress({
    address,
    inviteId,
    observedAt: new Date("2026-07-15T23:59:59.000Z"),
    keyValue: key,
  });
  const nextDay = hashViewerAddress({
    address,
    inviteId,
    observedAt: new Date("2026-07-16T00:00:00.000Z"),
    keyValue: key,
  });

  assert.equal(address, "203.0.113.10");
  assert.match(first ?? "", /^[0-9a-f]{64}$/);
  assert.equal(first, same);
  assert.notEqual(first, nextDay);
  assert.equal(first?.includes(address ?? ""), false);
});

test("the analytics route binds events to the review token and derives IP data server-side", () => {
  const route = readFileSync(
    resolve(repositoryRoot, "app/api/sharing/analytics/route.ts"),
    "utf8",
  );
  const migration = readFileSync(
    resolve(
      repositoryRoot,
      "supabase/migrations/20260715093300_fail_closed_co_production_authority.sql",
    ),
    "utf8",
  );

  assert.match(
    route,
    /getAuthorizedReviewInvite\(request,\s*tokenResult\.token\)/,
  );
  assert.match(route, /inviteResult\.invite\.id !== inputResult\.value\.inviteId/);
  assert.match(route, /extractClientAddress\(request\)/);
  assert.match(route, /getReviewInviteAccess\([\s\S]*"member"/);
  assert.doesNotMatch(route, /const\s*\{[^}]*viewer_ip_hash/);
  assert.match(migration, /client_request_id uuid NOT NULL/);
  assert.match(migration, /UNIQUE \(invite_id, client_request_id\)/);
});

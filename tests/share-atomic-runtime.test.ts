import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SHARE_POLICY_TEMPLATES } from "../lib/sharing/share-manifest.ts";
import type { PreparedShareManifest } from "../lib/sharing/share-service.ts";

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
    return nextResolve(specifier, context);
  },
});

const previousEncryptionKey = process.env.CO_PRODUCTION_TOKEN_ENCRYPTION_KEY;
process.env.CO_PRODUCTION_TOKEN_ENCRYPTION_KEY = "11".repeat(32);
test.after(() => {
  if (previousEncryptionKey === undefined) {
    delete process.env.CO_PRODUCTION_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.CO_PRODUCTION_TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
  }
});

const { createAtomicShareManifest } = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/sharing/share-transaction.ts")).href
);

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";
const INVITE_ID = "55555555-5555-4555-8555-555555555555";
const RECEIPT_ID = "66666666-6666-4666-8666-666666666666";
const OUTBOX_ID = "77777777-7777-4777-8777-777777777777";

function manifest(): PreparedShareManifest {
  return {
    operation: "create",
    manifestId: "share-manifest-runtime-0001",
    tenantId: `team:${TEAM_ID}`,
    items: [
      {
        assetId: ASSET_ID,
        versionId: VERSION_ID,
        shareIntent: "client_review",
        policy: {
          ...SHARE_POLICY_TEMPLATES["standard-review"],
          tenantId: `team:${TEAM_ID}`,
        },
        recipient: {
          name: "Client Reviewer",
          email: "reviewer@example.com",
          phone: null,
          imessageHandle: null,
        },
        permissions: "comment",
        expiresAt: "2026-07-20T18:00:00.000Z",
        watermarkEnabled: false,
        watermarkText: null,
        downloadEnabled: false,
        maxViews: null,
        password: null,
        asset: {
          id: ASSET_ID,
          project_id: PROJECT_ID,
          title: "Campaign master",
          file_type: "video/mp4",
          file_url: null,
          status: "in_review",
          duration_seconds: 12,
          tenant_authority: {
            kind: "team",
            id: TEAM_ID,
            key: `team:${TEAM_ID}`,
          },
          access_role: "producer",
          access_rank: 70,
        },
        version: {
          id: VERSION_ID,
          asset_id: ASSET_ID,
          version_number: 4,
          file_url: "https://media.example.com/campaign.mp4",
          file_size: 1024,
          notes: null,
          uploaded_by: null,
          is_current: true,
          thumbnail_url: null,
          duration_seconds: 12,
          resolution: "1920x1080",
          created_at: "2026-07-15T00:00:00.000Z",
          updated_at: "2026-07-15T00:00:00.000Z",
        },
        approvalRoute: null,
      },
    ],
    notification: {
      action: "send",
      channels: ["email"],
      confirm_live_send: true,
      idempotency_key: "share-email-runtime-0001",
    },
  };
}

function atomicClient() {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  let persistedInvite: Record<string, unknown> | null = null;
  let invocation = 0;
  const client = {
    async rpc(name: string, parameters: Record<string, unknown>) {
      invocation += 1;
      calls.push({ name, parameters });
      const items = parameters.p_items as Array<Record<string, unknown>>;
      if (!persistedInvite) {
        persistedInvite = {
          ...items[0],
          id: INVITE_ID,
          view_count: 0,
          last_viewed_at: null,
          created_at: "2026-07-15T00:00:00.000Z",
        };
      }
      return {
        data: {
          replayed: invocation > 1,
          receipt_id: RECEIPT_ID,
          manifest_id: parameters.p_manifest_id,
          manifest_fingerprint: parameters.p_manifest_fingerprint,
          invite_ids: [INVITE_ID],
          notifications: [
            {
              channel: "email",
              scope_fingerprint: `sha256:${"a".repeat(64)}`,
              status: "queued",
              outbox_id: OUTBOX_ID,
              replayed: invocation > 1,
            },
          ],
          rate_limit_remaining: 99,
        },
        error: null,
      };
    },
    from(table: string) {
      assert.equal(table, "review_invites");
      return {
        select(selection: string) {
          assert.equal(selection, "*");
          return {
            async in(column: string, values: string[]) {
              assert.equal(column, "id");
              assert.deepEqual(values, [INVITE_ID]);
              return { data: [persistedInvite], error: null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

test("managed share creation commits through one RPC and exact retry recovers the same link", async () => {
  const { client, calls } = atomicClient();
  let providerCalls = 0;
  const adapters = [
    {
      channel: "email" as const,
      provider: "must-not-run",
      configured: true,
      async send() {
        providerCalls += 1;
        throw new Error("Atomic share creation must never call a provider");
      },
    },
  ];
  const input = {
    manifest: manifest(),
    manifestFingerprint: "b".repeat(64),
    client: client as never,
    baseUrl: "https://client.co-videopro.com",
    adapters,
    now: new Date("2026-07-15T12:00:00.000Z"),
  };

  const created = await createAtomicShareManifest(input);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.replayed, false);
  assert.equal(created.items.length, 1);
  assert.equal(providerCalls, 0);

  const replayed = await createAtomicShareManifest(input);
  assert.equal(replayed.ok, true);
  if (!replayed.ok) return;
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.items[0].token, created.items[0].token);
  assert.equal(providerCalls, 0);

  assert.equal(calls.length, 2);
  assert.ok(
    calls.every((call) => call.name === "create_share_manifest_with_outbox"),
  );
  const parameters = calls[0].parameters;
  assert.equal(parameters.p_tenant_kind, "team");
  assert.equal(parameters.p_tenant_id, TEAM_ID);

  const inviteInputs = parameters.p_items as Array<Record<string, unknown>>;
  assert.match(String(inviteInputs[0].token_hash), /^[0-9a-f]{64}$/);
  assert.match(String(inviteInputs[0].token_ciphertext), /^v1\./);
  assert.equal("token" in inviteInputs[0], false);

  const notificationIntents = parameters.p_notification_intents as Array<
    Record<string, unknown>
  >;
  assert.equal(notificationIntents.length, 1);
  assert.match(
    String(notificationIntents[0].idempotency_key),
    /:[0-9a-f]{64}$/,
  );
  assert.match(
    String(notificationIntents[0].recipient_identity_hash),
    /^sha256:[0-9a-f]{64}$/,
  );
  assert.doesNotMatch(
    JSON.stringify(notificationIntents),
    /reviewer@example\.com|\/review\/|Campaign master/,
  );
});

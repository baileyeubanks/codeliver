import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CO_PRODUCTION_DATA_SCHEMA } from "../lib/data-authority.ts";
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
const {
  dispatchCreatedShareNotifications,
  summarizeShareDeliveryStatus,
} = await import(
  pathToFileURL(resolve(repositoryRoot, "lib/sharing/share-api.ts")).href
);
const shareApiSource = readFileSync(
  resolve(repositoryRoot, "lib/sharing/share-api.ts"),
  "utf8",
);
const transactionalSource = readFileSync(
  resolve(repositoryRoot, "lib/notifications/transactional.ts"),
  "utf8",
);
const shareTransactionSource = readFileSync(
  resolve(repositoryRoot, "lib/sharing/share-transaction.ts"),
  "utf8",
);
const shareNotificationsSource = readFileSync(
  resolve(repositoryRoot, "lib/sharing/share-notifications.ts"),
  "utf8",
);
const atomicMigration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260715230000_atomic_share_manifest_outbox.sql",
  ),
  "utf8",
);

function item(
  assetId: string,
  versionId: string,
  recipientEmail: string,
  title: string,
) {
  return {
    assetId,
    versionId,
    shareIntent: "client_review" as const,
    policy: { ...SHARE_POLICY_TEMPLATES["standard-review"], tenantId: "tenant-a" },
    recipient: {
      name: recipientEmail.split("@")[0],
      email: recipientEmail,
      phone: null,
      imessageHandle: null,
    },
    permissions: "comment" as const,
    expiresAt: "2026-07-20T18:00:00.000Z",
    watermarkEnabled: false,
    watermarkText: null,
    downloadEnabled: false,
    maxViews: null,
    password: null,
    asset: { id: assetId, title, project_id: "project-a" },
    version: {
      id: versionId,
      asset_id: assetId,
      version_number: 4,
      is_current: true,
    },
    approvalRoute: null,
  };
}

function manifest(): PreparedShareManifest {
  return {
    operation: "create",
    manifestId: "share-manifest-0001",
    tenantId: "tenant-a",
    items: [
      item("asset-a", "version-a", "reviewer@example.com", "Campaign A"),
      item("asset-b", "version-b", "reviewer@example.com", "Campaign B"),
      item("asset-c", "version-c", "producer@example.com", "Campaign C"),
    ],
    notification: {
      action: "send",
      channels: ["email"],
      confirm_live_send: true,
      idempotency_key: "share-notification-0001",
    },
  } as PreparedShareManifest;
}

const createdItems = [
  { asset_id: "asset-a", version_id: "version-a", token: "token-a" },
  { asset_id: "asset-b", version_id: "version-b", token: "token-b" },
  { asset_id: "asset-c", version_id: "version-c", token: "token-c" },
];

test("co-production share fanout records durable authority and never calls providers", async () => {
  const durableCalls: Array<Record<string, unknown>> = [];
  let auditedCalls = 0;
  const results = await dispatchCreatedShareNotifications({
    manifest: manifest(),
    createdItems,
    auditReceiptId: "receipt-a",
    baseUrl: "https://client.contentco-op.com",
    client: {} as never,
    adapters: [
      {
        channel: "email",
        provider: "must-not-run",
        configured: true,
        async send() {
          throw new Error("Managed share fanout must not call a provider adapter");
        },
      },
    ],
    user: { id: "user-a", email: "operator@example.com" },
    dependencies: {
      dataSchema: CO_PRODUCTION_DATA_SCHEMA,
      durableDispatch: (async (input: Record<string, unknown>) => {
        durableCalls.push(input);
        return {
          ok: true,
          mode: "queued",
          deduplicated: false,
          receipts: [],
          audit: { status: "outbox_recorded", outbox_ids: ["outbox-a"] },
        };
      }) as never,
      auditedDispatch: (async () => {
        auditedCalls += 1;
        throw new Error("Direct dispatch is forbidden in co-production");
      }) as never,
    },
  });

  assert.equal(results.length, 2);
  assert.equal(durableCalls.length, 2);
  assert.equal(auditedCalls, 0);
  assert.equal(summarizeShareDeliveryStatus(results), "queued");

  const references = durableCalls.map(
    (call) => call.authorityReference as Record<string, unknown>,
  );
  assert.deepEqual(
    references.map((reference) => [reference.kind, reference.id]),
    [
      ["share_manifest_created", "receipt-a"],
      ["share_manifest_created", "receipt-a"],
    ],
  );
  assert.match(String(references[0].scopeFingerprint), /^sha256:[0-9a-f]{64}$/);
  assert.match(String(references[1].scopeFingerprint), /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(references[0].scopeFingerprint, references[1].scopeFingerprint);
});

test("missing audit authority leaves created links in an honest delivery-pending state", async () => {
  const results = await dispatchCreatedShareNotifications({
    manifest: manifest(),
    createdItems,
    auditReceiptId: null,
    baseUrl: "https://client.contentco-op.com",
    client: {} as never,
    adapters: [],
    user: { id: "user-a" },
    dependencies: {
      dataSchema: CO_PRODUCTION_DATA_SCHEMA,
      durableDispatch: (async () => {
        throw new Error("Queueing cannot begin without an audit receipt");
      }) as never,
    },
  });
  assert.equal(results.length, 2);
  assert.equal(summarizeShareDeliveryStatus(results), "delivery_pending");
  assert.ok(
    results.every(
      (result) =>
        result &&
        typeof result === "object" &&
        "code" in result &&
        result.code === "share_audit_authority_unavailable",
    ),
  );
});

test("share source selects durable fanout only for co-production and exposes status", () => {
  assert.match(
    shareApiSource,
    /dataSchema === CO_PRODUCTION_DATA_SCHEMA[\s\S]*dispatchDurableNotification/,
  );
  assert.match(shareApiSource, /authorityReference:/);
  assert.match(shareApiSource, /delivery_status: summarizeShareDeliveryStatus/);
  assert.match(transactionalSource, /authority_scope_fingerprint/);
});

test("managed share creation uses one authenticated atomic RPC instead of split writes", () => {
  const managedBranch = shareApiSource.match(
    /if \(getSupabaseDataSchema\(\) === CO_PRODUCTION_DATA_SCHEMA\) \{[\s\S]*?\n  \}/,
  )?.[0];
  assert.ok(managedBranch, "missing managed share branch");
  assert.match(managedBranch, /createAtomicShareManifest/);
  assert.doesNotMatch(managedBranch, /createPreparedShareManifest/);
  assert.doesNotMatch(managedBranch, /dispatchCreatedShareNotifications/);
  assert.match(shareTransactionSource, /\.rpc\("create_share_manifest_with_outbox"/);
  assert.doesNotMatch(
    shareTransactionSource,
    /dispatchNotificationChannels|dispatchAuditedNotification|adapter\.send|fetch\(/,
  );
});

test("atomic share authority locks, validates, writes, audits, and enqueues together", () => {
  const rpc = atomicMigration.match(
    /CREATE OR REPLACE FUNCTION co_production\.create_share_manifest_with_outbox\([\s\S]*?\$create_share_manifest_with_outbox\$;/,
  )?.[0];
  assert.ok(rpc, "missing atomic share RPC");
  assert.match(rpc, /SECURITY DEFINER/);
  assert.match(rpc, /auth\.uid\(\)/);
  assert.match(rpc, /pg_advisory_xact_lock/);
  assert.match(rpc, /co_production_private\.has_asset_role\(asset\.id, 70\)/);
  assert.match(rpc, /share_manifest_tenant_mismatch/);
  assert.match(rpc, /INSERT INTO co_production\.review_invites/);
  assert.match(rpc, /INSERT INTO co_production\.activity_log/);
  assert.match(rpc, /INSERT INTO co_production\.share_manifest_receipts/);
  assert.match(rpc, /co_production\.enqueue_notification_outbox/);
  assert.match(rpc, /share_notification_recipient_hash_mismatch/);
  assert.match(rpc, /RETURN co_production_private\.share_manifest_transaction_snapshot/);
  assert.doesNotMatch(rpc, /http|webhook|send_email|provider/i);
});

test("managed share receipts are typed, immutable, and cannot be written directly", () => {
  assert.match(atomicMigration, /CREATE TABLE co_production\.share_manifest_receipts/);
  assert.match(atomicMigration, /CREATE TABLE co_production\.share_manifest_receipt_items/);
  assert.match(
    atomicMigration,
    /CREATE TABLE co_production\.share_manifest_notification_receipts/,
  );
  assert.match(atomicMigration, /share_manifest_receipts_actor_manifest_key/);
  assert.match(atomicMigration, /share_manifest_receipts_immutable/);
  assert.match(atomicMigration, /share_manifest_receipts_no_truncate/);
  assert.match(
    atomicMigration,
    /REVOKE ALL ON TABLE[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    atomicMigration,
    /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE[\s\S]*?TO authenticated/,
  );
});

test("share notification idempotency binds the complete recipient scope", () => {
  assert.match(
    shareNotificationsSource,
    /createHash\("sha256"\)\.update\(key\)\.digest\("hex"\)/,
  );
  assert.doesNotMatch(shareNotificationsSource, /digest\("hex"\)\.slice\(0, 12\)/);
  assert.match(
    shareNotificationsSource,
    /return `\$\{base\.trim\(\)\.slice\(0, 54\)\}:\$\{recipientKeySuffix\(key\)\}`/,
  );
});

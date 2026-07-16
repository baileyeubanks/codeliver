import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintShareManifest,
  parseBatchShareManifest,
  parseSingleShareRequest,
} from "../lib/sharing/share-manifest.ts";

const NOW = new Date("2026-07-14T18:00:00.000Z");

function single(overrides: Record<string, unknown> = {}) {
  return {
    operation: "create",
    manifest_id: "share-request-0001",
    version_id: "version-0001",
    share_intent: "client_review",
    expires_at: "2026-07-20T18:00:00.000Z",
    ...overrides,
  };
}

test("single shares bind to the requested immutable version", () => {
  const parsed = parseSingleShareRequest(single(), {
    authenticatedTenantId: "tenant-a",
    assetId: "asset-a",
    now: NOW,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.items[0].assetId, "asset-a");
  assert.equal(parsed.value.items[0].versionId, "version-0001");
  assert.equal(parsed.value.items[0].policy.tenantId, "tenant-a");
});

test("missing versions and cross-tenant policy requests fail before mutation", () => {
  const missingVersion = parseSingleShareRequest(single({ version_id: null }), {
    authenticatedTenantId: "tenant-a",
    assetId: "asset-a",
    now: NOW,
  });
  assert.equal(missingVersion.ok, false);
  if (!missingVersion.ok) assert.match(missingVersion.error, /version_id is required/);

  const crossTenant = parseSingleShareRequest(single({ tenant_id: "tenant-b" }), {
    authenticatedTenantId: "tenant-a",
    assetId: "asset-a",
    now: NOW,
  });
  assert.equal(crossTenant.ok, false);
  if (!crossTenant.ok) assert.match(crossTenant.error, /does not match/);
});

test("batch manifests reject duplicate asset-version pairs", () => {
  const parsed = parseBatchShareManifest(
    {
      operation: "preview",
      manifest_id: "batch-request-0001",
      share_intent: "client_review",
      items: [
        { asset_id: "asset-a", version_id: "version-a" },
        { asset_id: "asset-a", version_id: "version-a" },
      ],
    },
    { authenticatedTenantId: "tenant-a", now: NOW },
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error, /same asset version twice/);
});

test("batch manifests preserve each asset-version and its governing policy", () => {
  const parsed = parseBatchShareManifest(
    {
      operation: "preview",
      manifest_id: "batch-request-0002",
      items: [
        {
          asset_id: "asset-a",
          version_id: "version-a-2",
          share_intent: "client_review",
          policy_template_id: "standard-review",
          expires_at: "2026-07-20T18:00:00.000Z",
        },
        {
          asset_id: "asset-b",
          version_id: "version-b-7",
          share_intent: "final_delivery",
          policy_template_id: "final-delivery",
          download_enabled: true,
          expires_at: "2026-07-25T18:00:00.000Z",
        },
      ],
    },
    { authenticatedTenantId: "tenant-a", now: NOW },
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(
    parsed.value.items.map((item) => [item.assetId, item.versionId, item.policy.id]),
    [
      ["asset-a", "version-a-2", "standard-review"],
      ["asset-b", "version-b-7", "final-delivery"],
    ],
  );
});

test("regulated policy requires identity, watermark, no downloads, and short expiry", () => {
  const missingIdentity = parseSingleShareRequest(
    single({ policy_template_id: "regulated-review" }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  assert.equal(missingIdentity.ok, false);
  if (!missingIdentity.ok) assert.match(missingIdentity.error, /requires a recipient email/);

  const downloadEscape = parseSingleShareRequest(
    single({
      policy_template_id: "regulated-review",
      reviewer_email: "client@example.com",
      download_enabled: true,
    }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  assert.equal(downloadEscape.ok, false);
  if (!downloadEscape.ok) assert.match(downloadEscape.error, /forbids downloads/);

  const longExpiry = parseSingleShareRequest(
    single({
      policy_template_id: "regulated-review",
      reviewer_email: "client@example.com",
      expires_at: "2026-08-14T18:00:00.000Z",
    }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  assert.equal(longExpiry.ok, false);
  if (!longExpiry.ok) assert.match(longExpiry.error, /limits expiration/);
});

test("approval policy requires an email and cannot enable downloads", () => {
  const noEmail = parseSingleShareRequest(
    single({ share_intent: "approval_needed", permissions: "approve" }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  assert.equal(noEmail.ok, false);

  const download = parseSingleShareRequest(
    single({
      share_intent: "approval_needed",
      permissions: "approve",
      reviewer_email: "approver@example.com",
      download_enabled: true,
    }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  assert.equal(download.ok, false);
  if (!download.ok) assert.match(download.error, /forbids downloads/);
});

test("manifest idempotency fingerprints bind recipients and controls without request-key ordering drift", () => {
  const first = parseSingleShareRequest(
    single({
      reviewer_email: "reviewer@example.com",
      watermark_enabled: true,
      notification: {
        action: "send",
        channels: ["email"],
        idempotency_key: "notification-request-0006",
      },
    }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  const equivalent = parseSingleShareRequest(
    single({
      reviewer_email: "reviewer@example.com",
      watermark_enabled: true,
      notification: {
        idempotency_key: "notification-request-0006",
        channels: ["email"],
        action: "send",
      },
    }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  const repurposed = parseSingleShareRequest(
    single({
      reviewer_email: "other@example.com",
      watermark_enabled: false,
      notification: {
        action: "send",
        channels: ["email"],
        idempotency_key: "notification-request-0006",
      },
    }),
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );

  assert.equal(first.ok, true);
  assert.equal(equivalent.ok, true);
  assert.equal(repurposed.ok, true);
  if (!first.ok || !equivalent.ok || !repurposed.ok) return;

  assert.equal(fingerprintShareManifest(first.value), fingerprintShareManifest(equivalent.value));
  assert.notEqual(fingerprintShareManifest(first.value), fingerprintShareManifest(repurposed.value));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveShareIntent,
  formatShareIntentMeta,
  normalizeShareIntent,
  resolveShareIntentDefaults,
  SHARE_INTENTS,
} from "../lib/sharing/share-intent.ts";
import { parseSingleShareRequest } from "../lib/sharing/share-manifest.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

const NOW = new Date("2026-09-23T18:00:00.000Z");

// VA-018: the client handoff grammar is three named modes — Share for Review,
// Share for Approval, Share for Preview — each pinning the current version.

test("preview is a first-class view-only share intent that needs no recipient account", () => {
  assert.equal(normalizeShareIntent("preview"), "preview");
  assert.equal(normalizeShareIntent("view_only"), null);

  const defaults = resolveShareIntentDefaults("preview");
  assert.equal(defaults.permissions, "view");
  assert.equal(defaults.downloadEnabled, false);
  assert.equal(defaults.watermarkEnabled, false);
  assert.equal(defaults.requiresReviewerEmail, false);

  const meta = formatShareIntentMeta("preview");
  assert.equal(meta.label, "Preview");
  assert.equal(meta.permissionsLabel, "View-only access");

  assert.ok(SHARE_INTENTS.some((intent) => intent.value === "preview"));
});

test("view-permission rows derive preview unless the delivery file is attached", () => {
  assert.equal(
    deriveShareIntent({ permissions: "view", downloadEnabled: false, watermarkEnabled: false }),
    "preview",
  );
  assert.equal(
    deriveShareIntent({ permissions: "view", downloadEnabled: true, watermarkEnabled: false }),
    "final_delivery",
  );
  // Legacy rows without an explicit download flag keep their delivery reading.
  assert.equal(
    deriveShareIntent({ permissions: "view", watermarkEnabled: false }),
    "final_delivery",
  );
  assert.equal(
    deriveShareIntent({ permissions: "comment", downloadEnabled: false, watermarkEnabled: false }),
    "client_review",
  );
  assert.equal(
    deriveShareIntent({ permissions: "approve", downloadEnabled: false, watermarkEnabled: false }),
    "approval_needed",
  );
});

test("a preview manifest parses as a version-pinned view share with no recipient email", () => {
  const parsed = parseSingleShareRequest(
    {
      operation: "create",
      manifest_id: "share-preview-0001",
      version_id: "version-0001",
      share_intent: "preview",
      expires_at: "2026-09-29T18:00:00.000Z",
    },
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const item = parsed.value.items[0];
  assert.equal(item.shareIntent, "preview");
  assert.equal(item.versionId, "version-0001");
  assert.equal(item.permissions, "view");
  assert.equal(item.downloadEnabled, false);
  assert.equal(item.policy.id, "standard-review");
});

test("approval shares still require a named recipient while review and preview do not", () => {
  const approval = parseSingleShareRequest(
    {
      operation: "create",
      manifest_id: "share-approval-0001",
      version_id: "version-0001",
      share_intent: "approval_needed",
      expires_at: "2026-09-29T18:00:00.000Z",
    },
    { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
  );
  assert.equal(approval.ok, false);
  if (!approval.ok) assert.match(approval.error, /requires a recipient email/);

  for (const intent of ["client_review", "preview"]) {
    const parsed = parseSingleShareRequest(
      {
        operation: "create",
        manifest_id: `share-${intent}-0002`,
        version_id: "version-0001",
        share_intent: intent,
        expires_at: "2026-09-29T18:00:00.000Z",
      },
      { authenticatedTenantId: "tenant-a", assetId: "asset-a", now: NOW },
    );
    assert.equal(parsed.ok, true, intent);
  }
});

test("the review share menu names exactly Review, Approval, and Preview", () => {
  const menu = source("components/sharing/ReviewShareMenu.tsx");

  assert.match(menu, /label: "Share for Review"/);
  assert.match(menu, /label: "Share for Approval"/);
  assert.match(menu, /label: "Share for Preview"/);
  assert.match(menu, /intent: "client_review"/);
  assert.match(menu, /intent: "approval_needed"/);
  assert.match(menu, /intent: "preview"/);
  assert.match(menu, /role="menu"/);
});

test("the cockpit header offers the named share modes instead of a lone generic share", () => {
  const cockpit = source("components/projects/ProjectCockpit.tsx");

  assert.match(cockpit, /<ReviewShareMenu[\s\S]*?onSelect=\{\(intent\) => \{/);
  assert.match(cockpit, /openShareWithIntent\(intent\)/);
  assert.match(cockpit, /Share for Approval/);
  assert.match(cockpit, /initialShareIntent=\{approvalShareDefaults\?\.intent\}/);
});

test("both share sheets can render the preview mode", () => {
  const shareModal = source("components/sharing/ShareModal.tsx");
  const demoShareModal = source("components/demo/DemoShareModal.tsx");

  assert.match(shareModal, /preview: <Eye size=\{16\} \/>/);
  assert.match(shareModal, /preview: "Preview"/);
  assert.match(demoShareModal, /preview: Eye/);
  assert.match(demoShareModal, /initialShareIntent\?: ShareIntent/);
});

test("stored view-only rows read back as preview in the links hub", () => {
  const service = source("lib/sharing/share-service.ts");
  const linkList = source("components/sharing/ShareLinkList.tsx");

  assert.match(
    service,
    /row\.permissions === "view"[\s\S]*?download_enabled === false \? "preview" : "final_delivery"/,
  );
  assert.match(linkList, /shareIntent === "preview"/);
});

test("the /reviews recipient hub mirrors the Review, Approval, and Preview states", () => {
  const hub = source("app/(dashboard)/reviews/page.tsx");

  assert.match(hub, /if \(permission === "approve"\) return "Approval"/);
  assert.match(hub, /if \(permission === "comment"\) return "Review"/);
  assert.match(hub, /allowDownloads \? "Delivery" : "Preview"/);
});

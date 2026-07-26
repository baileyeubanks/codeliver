import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SHARE_LINK_SETTINGS,
  SHARE_LINK_NAME_MAX,
  SHARE_LINK_PASSWORD_MIN,
  hashShareLinkPassword,
  isShareLinkExpired,
  normalizeShareLinkSettings,
  shareExpiryCountdownLabel,
  validateShareLinkSettings,
  verifyShareLinkPassword,
} from "../lib/sharing/share-link-settings.ts";
import {
  SHARE_VIEW_RECEIPT_LIMIT,
  appendShareViewReceipt,
  createShareViewReceipt,
  summarizeShareViewReceipts,
} from "../lib/sharing/share-view-receipts.ts";
import { resolveShareLinkAccess } from "../lib/sharing/share-link-access.ts";

const NOW = new Date("2026-07-25T12:00:00.000Z");
const FUTURE = "2026-08-01T12:00:00.000Z";
const PAST = "2026-07-20T12:00:00.000Z";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Client review — roadshow final",
    allow_approvals: true,
    current_version_only: false,
    enable_downloading: false,
    expires_at: FUTURE,
    has_password: false,
    password: null,
    ...overrides,
  };
}

test("defaults are honest: open review link, no password, no expiry", () => {
  assert.deepEqual(DEFAULT_SHARE_LINK_SETTINGS, {
    name: "",
    allow_approvals: true,
    current_version_only: false,
    enable_downloading: false,
    expires_at: null,
    has_password: false,
    password_hash: null,
  });
});

test("a fully specified valid link validates and hashes the password", () => {
  const result = validateShareLinkSettings(
    validInput({ has_password: true, password: "cvp-review-2026" }),
    NOW,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.settings.name, "Client review — roadshow final");
  assert.equal(result.settings.allow_approvals, true);
  assert.equal(result.settings.enable_downloading, false);
  assert.equal(result.settings.expires_at, FUTURE);
  assert.equal(result.settings.has_password, true);
  assert.equal(typeof result.settings.password_hash, "string");
  assert.notEqual(result.settings.password_hash, "cvp-review-2026");
  // The plaintext password never survives into the stored record.
  assert.equal("password" in result.settings, false);
});

test("expiry must be a valid ISO date strictly in the future", () => {
  const past = validateShareLinkSettings(validInput({ expires_at: PAST }), NOW);
  assert.equal(past.ok, false);
  if (past.ok) return;
  assert.ok(past.errors.some((error) => /future/i.test(error)));

  const garbage = validateShareLinkSettings(validInput({ expires_at: "next friday" }), NOW);
  assert.equal(garbage.ok, false);

  const exactNow = validateShareLinkSettings(
    validInput({ expires_at: NOW.toISOString() }),
    NOW,
  );
  assert.equal(exactNow.ok, false);

  const noExpiry = validateShareLinkSettings(validInput({ expires_at: null }), NOW);
  assert.equal(noExpiry.ok, true);
});

test("password is required if and only if has_password is set", () => {
  const missing = validateShareLinkSettings(
    validInput({ has_password: true, password: null }),
    NOW,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) return;
  assert.ok(missing.errors.some((error) => /password/i.test(error)));

  const empty = validateShareLinkSettings(
    validInput({ has_password: true, password: "   " }),
    NOW,
  );
  assert.equal(empty.ok, false);

  const tooShort = validateShareLinkSettings(
    validInput({ has_password: true, password: "ab" }),
    NOW,
  );
  assert.equal(tooShort.ok, false);
  if (tooShort.ok) return;
  assert.ok(tooShort.errors.some((error) => /password/i.test(error)));

  const minLength = "x".repeat(SHARE_LINK_PASSWORD_MIN);
  const atMin = validateShareLinkSettings(
    validInput({ has_password: true, password: minLength }),
    NOW,
  );
  assert.equal(atMin.ok, true);

  // Editing a protected link can keep its current password: the form passes
  // the existing hash back instead of the plaintext it never sees.
  const kept = validateShareLinkSettings(
    validInput({
      has_password: true,
      password: null,
      existing_password_hash: hashShareLinkPassword("cvp-review-2026"),
    }),
    NOW,
  );
  assert.equal(kept.ok, true);
  if (!kept.ok) return;
  assert.equal(kept.settings.password_hash, hashShareLinkPassword("cvp-review-2026"));

  // Without has_password, any stray password is dropped, not stored.
  const stray = validateShareLinkSettings(
    validInput({ has_password: false, password: "leftover-secret" }),
    NOW,
  );
  assert.equal(stray.ok, true);
  if (!stray.ok) return;
  assert.equal(stray.settings.password_hash, null);
});

test("name is required, trimmed, and bounded", () => {
  const blank = validateShareLinkSettings(validInput({ name: "   " }), NOW);
  assert.equal(blank.ok, false);

  const tooLong = validateShareLinkSettings(
    validInput({ name: "n".repeat(SHARE_LINK_NAME_MAX + 1) }),
    NOW,
  );
  assert.equal(tooLong.ok, false);

  const padded = validateShareLinkSettings(validInput({ name: "  Q3 review  " }), NOW);
  assert.equal(padded.ok, true);
  if (!padded.ok) return;
  assert.equal(padded.settings.name, "Q3 review");
});

test("non-boolean toggles and non-object input are rejected", () => {
  const stringToggle = validateShareLinkSettings(
    validInput({ enable_downloading: "yes" }),
    NOW,
  );
  assert.equal(stringToggle.ok, false);

  for (const bad of [null, undefined, "link", 42, []]) {
    const result = validateShareLinkSettings(bad, NOW);
    assert.equal(result.ok, false);
  }
});

test("password hashing verifies the right password and rejects others", () => {
  const hash = hashShareLinkPassword("cvp-review-2026");
  // Deterministic, and plainly prefixed so nobody mistakes it for a real
  // credential hash.
  assert.equal(hash, hashShareLinkPassword("cvp-review-2026"));
  assert.match(hash, /^fnv1a:/);

  assert.equal(verifyShareLinkPassword({ has_password: true, password_hash: hash }, "cvp-review-2026"), true);
  assert.equal(verifyShareLinkPassword({ has_password: true, password_hash: hash }, "wrong"), false);
  // Tampered records (password flag on, hash missing) fail closed.
  assert.equal(verifyShareLinkPassword({ has_password: true, password_hash: null }, "cvp-review-2026"), false);
  // No password configured → any attempt verifies (gate should not render).
  assert.equal(verifyShareLinkPassword({ has_password: false, password_hash: null }, ""), true);
});

test("expiry checks treat the exact expiry instant as expired — no grace", () => {
  assert.equal(isShareLinkExpired({ expires_at: PAST }, NOW), true);
  assert.equal(isShareLinkExpired({ expires_at: NOW.toISOString() }, NOW), true);
  assert.equal(isShareLinkExpired({ expires_at: FUTURE }, NOW), false);
  assert.equal(isShareLinkExpired({ expires_at: null }, NOW), false);
  assert.equal(isShareLinkExpired({ expires_at: "not-a-date" }, NOW), true);
});

test("expiry countdown labels are truthful and human", () => {
  assert.equal(shareExpiryCountdownLabel(null, NOW), null);
  assert.equal(shareExpiryCountdownLabel(PAST, NOW), "Expired");
  assert.equal(
    shareExpiryCountdownLabel("2026-07-28T12:00:00.000Z", NOW),
    "Expires in 3 days",
  );
  assert.equal(
    shareExpiryCountdownLabel("2026-07-26T12:00:00.000Z", NOW),
    "Expires in 1 day",
  );
  assert.equal(
    shareExpiryCountdownLabel("2026-07-25T17:00:00.000Z", NOW),
    "Expires in 5 hours",
  );
  assert.equal(
    shareExpiryCountdownLabel("2026-07-25T13:00:00.000Z", NOW),
    "Expires in 1 hour",
  );
  assert.equal(
    shareExpiryCountdownLabel("2026-07-25T12:45:00.000Z", NOW),
    "Expires in 45 minutes",
  );
  assert.equal(
    shareExpiryCountdownLabel("2026-07-25T12:01:00.000Z", NOW),
    "Expires in 1 minute",
  );
  assert.equal(
    shareExpiryCountdownLabel("2026-07-25T12:00:20.000Z", NOW),
    "Expires in under a minute",
  );
  assert.equal(shareExpiryCountdownLabel("not-a-date", NOW), "Expired");
});

test("normalizeShareLinkSettings accepts its own output and rejects garbage", () => {
  const result = validateShareLinkSettings(validInput(), NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(normalizeShareLinkSettings(result.settings), result.settings);
  assert.equal(normalizeShareLinkSettings(null), null);
  assert.equal(normalizeShareLinkSettings({ name: 42 }), null);
  assert.equal(normalizeShareLinkSettings({ ...result.settings, expires_at: 7 }), null);
  assert.equal(normalizeShareLinkSettings({ ...result.settings, password_hash: 9 }), null);
});

test("view receipts capture a trimmed viewer label and timestamp", () => {
  const receipt = createShareViewReceipt({
    viewerLabel: "  Morgan (ICA) ",
    now: NOW,
    id: "receipt-1",
  });
  assert.deepEqual(receipt, {
    id: "receipt-1",
    viewer_label: "Morgan (ICA)",
    viewed_at: NOW.toISOString(),
  });

  const anonymous = createShareViewReceipt({ viewerLabel: "  ", now: NOW, id: "receipt-2" });
  assert.equal(anonymous.viewer_label, "Anonymous viewer");
});

test("receipts append newest-first and are capped at the retention limit", () => {
  let receipts = appendShareViewReceipt(
    [],
    createShareViewReceipt({ viewerLabel: "First", now: NOW, id: "r1" }),
  );
  receipts = appendShareViewReceipt(
    receipts,
    createShareViewReceipt({ viewerLabel: "Second", now: new Date("2026-07-25T13:00:00.000Z"), id: "r2" }),
  );
  assert.deepEqual(receipts.map((receipt) => receipt.viewer_label), ["Second", "First"]);

  let crowded: ReturnType<typeof createShareViewReceipt>[] = [];
  for (let index = 0; index < SHARE_VIEW_RECEIPT_LIMIT + 10; index += 1) {
    crowded = appendShareViewReceipt(
      crowded,
      createShareViewReceipt({
        viewerLabel: `Viewer ${index}`,
        now: new Date(NOW.getTime() + index * 1000),
        id: `bulk-${index}`,
      }),
    );
  }
  assert.equal(crowded.length, SHARE_VIEW_RECEIPT_LIMIT);
  assert.equal(crowded[0].viewer_label, `Viewer ${SHARE_VIEW_RECEIPT_LIMIT + 9}`);
});

test("receipt summary reports count and latest viewers without exposing more", () => {
  const empty = summarizeShareViewReceipts([]);
  assert.deepEqual(empty, { count: 0, latest: [], lastViewedAt: null });

  let receipts: ReturnType<typeof createShareViewReceipt>[] = [];
  for (let index = 0; index < 8; index += 1) {
    receipts = appendShareViewReceipt(
      receipts,
      createShareViewReceipt({
        viewerLabel: `Viewer ${index}`,
        now: new Date(NOW.getTime() + index * 60_000),
        id: `s-${index}`,
      }),
    );
  }
  const summary = summarizeShareViewReceipts(receipts);
  assert.equal(summary.count, 8);
  assert.equal(summary.latest.length, 5);
  assert.equal(summary.latest[0].viewer_label, "Viewer 7");
  assert.equal(summary.lastViewedAt, new Date(NOW.getTime() + 7 * 60_000).toISOString());
});

test("access resolution: expired beats password, password blocks until unlocked", () => {
  const open = { expires_at: FUTURE, has_password: false, password_hash: null };
  assert.equal(resolveShareLinkAccess(open, { now: NOW }), "admitted");
  assert.equal(resolveShareLinkAccess(null, { now: NOW }), "admitted");

  const expired = { expires_at: PAST, has_password: true, password_hash: "fnv1a:deadbeef" };
  // Expiry wins over the password prompt — no point gating a dead link.
  assert.equal(resolveShareLinkAccess(expired, { now: NOW }), "expired");
  assert.equal(resolveShareLinkAccess(expired, { unlocked: true, now: NOW }), "expired");

  const protectedLink = { expires_at: FUTURE, has_password: true, password_hash: "fnv1a:deadbeef" };
  assert.equal(resolveShareLinkAccess(protectedLink, { now: NOW }), "password");
  assert.equal(resolveShareLinkAccess(protectedLink, { unlocked: true, now: NOW }), "admitted");

  // Tampered record (password on, hash missing) fails closed at the gate.
  const tampered = { expires_at: FUTURE, has_password: true, password_hash: null };
  assert.equal(resolveShareLinkAccess(tampered, { now: NOW }), "password");
});

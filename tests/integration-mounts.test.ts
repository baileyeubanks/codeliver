import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * P19b integration mounts: the public review surface must actually wire the
 * P19 version UI and the P18/P20/P21/P22 review-surface components, not leave
 * them as orphaned lanes. Source-scan in the style of
 * tests/public-review-approval-truth.test.ts.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = readFileSync(
  resolve(repositoryRoot, "components/review/PublicReviewPage.tsx"),
  "utf8",
);

test("version switcher and A/B compare mount on the review stage", () => {
  assert.match(pageSource, /import VersionSwitcher from "@\/components\/review\/VersionSwitcher"/);
  assert.match(pageSource, /import VersionCompare from "@\/components\/review\/VersionCompare"/);
  assert.match(pageSource, /@\/lib\/versions\/versions/);
  assert.match(pageSource, /<VersionSwitcher/);
  assert.match(pageSource, /<VersionCompare/);
});

test("the ?v= version param is honored on load", () => {
  assert.match(pageSource, /searchParams\.get\("v"\)/);
  assert.match(pageSource, /resolveVersionParam/);
});

test("share access gate wraps the review content", () => {
  assert.match(
    pageSource,
    /import ShareLinkAccessGate from "@\/components\/sharing\/ShareLinkAccessGate"/,
  );
  assert.match(pageSource, /<ShareLinkAccessGate/);
});

test("share watermark mounts on the media stage", () => {
  assert.match(
    pageSource,
    /import ShareWatermark from "@\/components\/sharing\/ShareWatermark"/,
  );
  assert.match(pageSource, /<ShareWatermark/);
});

test("share settings dialog is reachable from the review surface", () => {
  assert.match(
    pageSource,
    /import ShareSettingsDialog from "@\/components\/sharing\/ShareSettingsDialog"/,
  );
  assert.match(pageSource, /<ShareSettingsDialog/);
});

test("current_version_only comes from the share-link record and scopes the switcher", () => {
  assert.match(pageSource, /readShareLinkRecord/);
  assert.match(pageSource, /current_version_only/);
  assert.match(pageSource, /currentVersionOnly/);
});

test("P20 ApprovalPanel replaces the per-step card on the public rail", () => {
  assert.match(
    pageSource,
    /import ApprovalPanel from "@\/components\/approvals\/ApprovalPanel"/,
  );
  assert.match(pageSource, /<ApprovalPanel/);
  assert.doesNotMatch(pageSource, /ApprovalStepCard/);
  // The demo approval mutation path is unchanged (P19b wires, P20 persists).
  assert.match(pageSource, /recordDemoPublicReviewApproval/);
});

test("the comments rail renders through P18 CommentList", () => {
  assert.match(
    pageSource,
    /import CommentList from "@\/components\/comments\/CommentList"/,
  );
  assert.match(pageSource, /<CommentList/);
  assert.match(pageSource, /onReplySubmit/);
});

test("a Summary rail tab mounts the P21 producer summary", () => {
  assert.match(
    pageSource,
    /import ProducerSummaryPanel from "@\/components\/summary\/ProducerSummaryPanel"/,
  );
  assert.match(pageSource, /<ProducerSummaryPanel/);
});

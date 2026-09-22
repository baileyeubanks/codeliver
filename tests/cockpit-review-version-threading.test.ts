import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);

test("the cockpit selects a requested demo version without falling back to current", () => {
  assert.match(cockpit, /const requestedVersionId = searchParams\.get\("version"\)/);
  assert.match(cockpit, /resolvePinnedDemoMediaVersion\(workspace\.mediaVersions, activeAsset\.id, requestedVersionId\)/);
  assert.match(cockpit, /requestedVersionId\s*\?\s*requestedDemoVersion\s*:\s*currentDemoMediaVersion/);
  assert.match(cockpit, /requestedLiveVersionUnavailable/);
  assert.match(cockpit, /requestedReviewVersionUnavailable/);
  assert.match(cockpit, /canOperateExactInternalReviewVersion\(\{/);
  assert.match(cockpit, /No newer cut was opened\./);
  assert.match(cockpit, /No substitute media was opened\./);
  assert.match(cockpit, /requestedAssetId,/);
  assert.match(cockpit, /activeAssetId: activeAsset\?\.id \?\? null,/);
});

test("the source-preview version selector changes only the exact cockpit route", () => {
  assert.match(cockpit, /aria-label="Review media version"/);
  assert.match(cockpit, /params\.set\("version", version\.id\)/);
  const selectVersion = cockpit.match(/function selectDemoReviewVersion\(versionId: string\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.doesNotMatch(selectVersion, /params\.set\("view", "review"\)/);
  assert.match(cockpit, /if \(demoMode && activeDemoVersionId\) params\.set\("version", activeDemoVersionId\)/);
  assert.match(cockpit, /comment\.version_id === activeDemoVersionId/);
  assert.match(cockpit, /marker\.version_id === activeDemoVersionId/);
  assert.match(cockpit, /activeAsset && activeDemoVersionId/);
  assert.match(cockpit, /historicalDemoVersion \? `Review V\$\{activeDemoVersion\?\.version_number\}`/);
  assert.match(cockpit, /Asset-level decisions are not applied to a historical cut\./);
});

test("an unavailable internal version cannot reach player or write handlers", () => {
  for (const handler of [
    "togglePlayback",
    "replayFromStart",
    "seekTo",
    "handleReviewFrameClick",
    "addCutDecision",
    "submitComment",
    "toggleCommentStatus",
  ]) {
    const body = cockpit.match(new RegExp(`(?:async )?function ${handler}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}`))?.[1] ?? "";
    assert.match(body, /if \(!reviewOperationsAllowed/);
  }
  const shortcutStart = cockpit.indexOf("function handleReviewShortcutEvent(");
  const shortcutEnd = cockpit.indexOf("function handleReviewShortcut(event", shortcutStart);
  const shortcutBody = cockpit.slice(shortcutStart, shortcutEnd);
  assert.match(shortcutBody, /if \(!reviewOperationsAllowed\) return false;/);
  assert.match(cockpit, /visibleExactInternalReviewRecords\(\s*reviewOperationsAllowed,/);
});

test("selecting an asset clears an explicit malformed version and keeps the selected asset in the URL", () => {
  const selectAsset = cockpit.match(/function selectAsset\(asset: MediaAsset\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(selectAsset, /if \(requestedVersionId !== null\)/);
  assert.match(selectAsset, /params\.set\("asset", asset\.id\)/);
  assert.match(selectAsset, /params\.delete\("version"\)/);
});

test("historical review details do not inherit current approval or contextual sharing", () => {
  assert.match(cockpit, /const contextualShareAllowed = Boolean\(activeAsset && !versionScopedReview\)/);
  assert.match(cockpit, /disabled: !contextualShareAllowed \|\| !canShare/);
  assert.match(cockpit, /versionScopedReview \? "Review context" : "Review status"/);
  assert.match(cockpit, /Current approval and share state are not applied here/);
  assert.match(cockpit, /new share links use the latest cut\./);
  const historicalDock = cockpit.match(/\{versionScopedReview \? \([\s\S]*?\) : \(\n\s*<>\n\s*<p className="cockpit-review-status"/ )?.[0] ?? "";
  assert.doesNotMatch(historicalDock, /setShareOpen\(true\)|Start review|Share readiness|Batch share/);
});

test("the active composer reads its draft from the exact asset and version", () => {
  assert.match(cockpit, /const \[commentDrafts, setCommentDrafts\] = useState<Record<string, string>>\(\{\}\)/);
  assert.match(cockpit, /reviewCommentDraftKey\(activeAsset\.id, demoMode \? activeDemoVersionId : null\)/);
  assert.match(cockpit, /commentDrafts\[activeCommentDraftKey\] \?\? ""/);
});

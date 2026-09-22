import assert from "node:assert/strict";
import test from "node:test";

import {
  canOperateExactInternalReviewVersion,
  resolveExactLiveInternalReviewVersion,
  runWhenInternalReviewVersionIsAvailable,
  shouldApplyLiveInternalReviewResponse,
  visibleExactInternalReviewRecords,
} from "../lib/review/internal-version-operations.ts";

const liveVersions = [
  { id: "live-v2", asset_id: "asset-a", version_number: 2, is_current: true },
  { id: "live-v1", asset_id: "asset-a", version_number: 1, is_current: false },
];

test("an unsupported live historical URL cannot invoke a review mutation", async () => {
  const available = canOperateExactInternalReviewVersion({
    demoMode: false,
    requestedVersionId: "historical-v1",
    activeDemoVersionId: null,
  });
  let fetchCalls = 0;

  await runWhenInternalReviewVersionIsAvailable(available, async () => {
    fetchCalls += 1;
  });

  assert.equal(available, false);
  assert.equal(fetchCalls, 0);
});

test("only a resolved demo version re-enables exact-cut operations", () => {
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "source-version-aayush-v1",
    activeDemoVersionId: "source-version-aayush-v1",
  }), true);
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "missing-v1",
    activeDemoVersionId: null,
  }), false);
});

test("an absent version permits ordinary review while an explicit empty version does not", () => {
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: false,
    requestedVersionId: null,
    activeDemoVersionId: null,
  }), true);
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "",
    activeDemoVersionId: "current-v2",
  }), false);
});

test("a versioned URL must match its resolved version and asset exactly", () => {
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "historical-v1",
    activeDemoVersionId: "current-v2",
    requestedAssetId: "asset-a",
    activeAssetId: "asset-a",
  }), false);
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "historical-v1",
    activeDemoVersionId: "historical-v1",
    requestedAssetId: "missing-asset",
    activeAssetId: "asset-a",
  }), false);
  assert.equal(canOperateExactInternalReviewVersion({
    demoMode: true,
    requestedVersionId: "historical-v1",
    activeDemoVersionId: "historical-v1",
    requestedAssetId: "asset-a",
    activeAssetId: "asset-a",
  }), true);
});

test("invalid version scope cannot display notes or markers from the current cut", () => {
  const currentNotes = [{ id: "current-note" }];
  const currentMarkers = [{ id: "current-marker" }];

  assert.deepEqual(visibleExactInternalReviewRecords(false, currentNotes), []);
  assert.deepEqual(visibleExactInternalReviewRecords(false, currentMarkers), []);
  assert.equal(visibleExactInternalReviewRecords(true, currentNotes), currentNotes);
  assert.equal(visibleExactInternalReviewRecords(true, currentMarkers), currentMarkers);
});

test("live review resolves only one exact requested version for its active asset", () => {
  assert.deepEqual(
    resolveExactLiveInternalReviewVersion({
      requestedAssetId: "asset-a",
      activeAssetId: "asset-a",
      requestedVersionId: "live-v1",
      versions: liveVersions,
    }),
    { status: "resolved", version: liveVersions[1] },
  );
  assert.equal(
    resolveExactLiveInternalReviewVersion({
      requestedAssetId: "asset-b",
      activeAssetId: "asset-a",
      requestedVersionId: "live-v1",
      versions: liveVersions,
    }).status,
    "unavailable",
  );
  assert.equal(
    resolveExactLiveInternalReviewVersion({
      requestedAssetId: "asset-a",
      activeAssetId: "asset-a",
      requestedVersionId: "missing",
      versions: liveVersions,
    }).status,
    "unavailable",
  );
});

test("live review selects the unique current version when no historical cut was requested", () => {
  assert.deepEqual(
    resolveExactLiveInternalReviewVersion({
      requestedAssetId: "asset-a",
      activeAssetId: "asset-a",
      requestedVersionId: null,
      versions: liveVersions,
    }),
    { status: "resolved", version: liveVersions[0] },
  );
});

test("a live asset without one explicit current marker fails closed", () => {
  assert.equal(
    resolveExactLiveInternalReviewVersion({
      requestedAssetId: "asset-a",
      activeAssetId: "asset-a",
      requestedVersionId: null,
      versions: liveVersions.map((version) => ({ ...version, is_current: false })),
    }).status,
    "unavailable",
  );
});

test("a duplicated live version identity is unavailable even when one row is current", () => {
  assert.equal(
    resolveExactLiveInternalReviewVersion({
      requestedAssetId: "asset-a",
      activeAssetId: "asset-a",
      requestedVersionId: null,
      versions: [
        { id: "live-v2", asset_id: "asset-a", version_number: 2, is_current: true },
        { id: "live-v2", asset_id: "asset-a", version_number: 1, is_current: false },
      ],
    }).status,
    "unavailable",
  );
});

test("a stale live version response cannot replace the selected asset state", () => {
  assert.equal(
    shouldApplyLiveInternalReviewResponse({
      requestId: 3,
      latestRequestId: 3,
      requestedAssetId: "asset-a",
      activeAssetId: "asset-a",
    }),
    true,
  );
  assert.equal(
    shouldApplyLiveInternalReviewResponse({
      requestId: 2,
      latestRequestId: 3,
      requestedAssetId: "asset-a",
      activeAssetId: "asset-a",
    }),
    false,
  );
  assert.equal(
    shouldApplyLiveInternalReviewResponse({
      requestId: 3,
      latestRequestId: 3,
      requestedAssetId: "asset-a",
      activeAssetId: "asset-b",
    }),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  currentDemoMediaVersion,
  isRevisionableDemoMedia,
  nextDemoMediaVersion,
  resolvePinnedDemoMediaVersion,
  sortDemoMediaVersions,
  toDemoReviewVersion,
  type DemoMediaVersion,
} from "../lib/demo/media-version-authority.ts";

function version(overrides: Partial<DemoMediaVersion> = {}): DemoMediaVersion {
  return {
    id: "local-version-v1",
    asset_id: "local-upload-cut",
    version_number: 1,
    media_blob_id: "local-version-v1",
    source_url: null,
    thumbnail_blob_id: null,
    file_name: "Schneider-cut-v1.mp4",
    file_type: "video",
    file_size: 1234,
    duration_seconds: 32.4,
    created_at: "2026-09-22T00:00:00.000Z",
    is_current: true,
    ...overrides,
  };
}

test("an explicit local replacement creates a new immutable version and preserves V1", () => {
  const v1 = version();
  const v2 = nextDemoMediaVersion({
    existing: [v1],
    assetId: v1.asset_id,
    versionId: "local-version-v2",
    mediaBlobId: "local-version-v2",
    thumbnailBlobId: "local-version-v2-poster",
    fileName: "Schneider-cut-v2.mp4",
    fileType: "video",
    fileSize: 2345,
    durationSeconds: 35.8,
    createdAt: "2026-09-22T01:00:00.000Z",
  });

  assert.equal(v2.ok, true);
  if (!v2.ok) return;
  assert.deepEqual(v2.versions.map((candidate) => [candidate.id, candidate.version_number, candidate.is_current]), [
    ["local-version-v1", 1, false],
    ["local-version-v2", 2, true],
  ]);
  assert.equal(v2.version.file_name, "Schneider-cut-v2.mp4");
  assert.equal(v1.file_name, "Schneider-cut-v1.mp4");
  assert.equal(currentDemoMediaVersion(v2.versions, v1.asset_id)?.id, "local-version-v2");
  assert.deepEqual(sortDemoMediaVersions(v2.versions).map((candidate) => candidate.id), ["local-version-v2", "local-version-v1"]);
});

test("a share pin never falls forward to the current version", () => {
  const versions = [version({ is_current: false }), version({
    id: "local-version-v2",
    version_number: 2,
    media_blob_id: "local-version-v2",
    file_name: "Schneider-cut-v2.mp4",
    is_current: true,
  })];

  assert.equal(
    resolvePinnedDemoMediaVersion(versions, "local-upload-cut", "local-version-v1")?.version_number,
    1,
  );
  assert.equal(
    resolvePinnedDemoMediaVersion(versions, "local-upload-cut", "missing-version"),
    null,
  );
});

test("ambiguous persisted current flags do not select a highest cut", () => {
  const v1 = version({ is_current: false });
  const v2 = version({
    id: "local-version-v2",
    version_number: 2,
    media_blob_id: "local-version-v2",
    is_current: false,
  });
  assert.equal(currentDemoMediaVersion([v1], v1.asset_id), null);
  assert.equal(currentDemoMediaVersion([v1, v2], v1.asset_id), null);
  assert.equal(currentDemoMediaVersion([{ ...v1, is_current: true }, { ...v2, is_current: true }], v1.asset_id), null);
});

test("a pinned browser-local V1 projects its own blob URL instead of the current cut", () => {
  const v1 = version({ is_current: false });
  const projected = toDemoReviewVersion(v1, "blob:schneider-v1", null);

  assert.deepEqual(
    [projected.id, projected.version_number, projected.file_url, projected.is_current],
    ["local-version-v1", 1, "blob:schneider-v1", false],
  );
});

test("an imported file needs its explicit measured base before it can receive a local revision", () => {
  assert.equal(isRevisionableDemoMedia([version()], "local-upload-cut", false), true);
  assert.equal(isRevisionableDemoMedia([version()], "local-upload-cut", true), false);
  const sourceBase = version({
    id: "source-version-source-aayush-v2",
    asset_id: "source-aayush-v2",
    media_blob_id: null,
    source_url: "/api/demo/source-media/source-aayush-v2?demo=1",
    source_label: "Imported file",
    file_name: null,
    file_size: 235_134_905,
  });
  assert.equal(isRevisionableDemoMedia([sourceBase], "source-aayush-v2", true), true);
  assert.equal(isRevisionableDemoMedia([], "source-aayush-v2", true), false);
  assert.equal(isRevisionableDemoMedia([], "seeded-demo", false), false);
});

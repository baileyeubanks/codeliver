import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { demoReviewPayload } from "../lib/review/demoReview.ts";
import { currentVersion, sortVersions } from "../lib/versions/versions.ts";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("demo review payload seeds exactly three versions for the demo asset", () => {
  assert.equal(demoReviewPayload.versions.length, 3);
  assert.ok(
    demoReviewPayload.versions.every((version) => version.asset_id === demoReviewPayload.asset.id),
  );
  assert.deepEqual(
    sortVersions(demoReviewPayload.versions).map((version) => version.version_number),
    [3, 2, 1],
  );
});

test("exactly one demo version is current, and it is V3", () => {
  const flagged = demoReviewPayload.versions.filter((version) => version.is_current);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0]?.version_number, 3);
  assert.equal(currentVersion(demoReviewPayload.versions)?.id, flagged[0]?.id);
  // The current version must match the asset's own file_url so the default
  // player source and the V3 selection are the same media.
  assert.equal(flagged[0]?.file_url, demoReviewPayload.asset.file_url);
});

test("every demo version file_url points at a real file under public/demo/", () => {
  for (const version of demoReviewPayload.versions) {
    assert.match(version.file_url, /^\/demo\//);
    const onDisk = join(repositoryRoot, "public", version.file_url);
    assert.ok(existsSync(onDisk), `missing demo media: ${version.file_url}`);
  }
  // V1/V2 must be visibly different media from the current cut so the
  // version switcher demonstrably swaps sources.
  const urls = new Set(demoReviewPayload.versions.map((version) => version.file_url));
  assert.equal(urls.size, demoReviewPayload.versions.length);
});

test("demo versions carry truthful notes and day-spread created_at ordering", () => {
  const ordered = [...demoReviewPayload.versions].sort(
    (left, right) => left.version_number - right.version_number,
  );
  assert.deepEqual(
    ordered.map((version) => version.notes),
    ["First assembly", "Client feedback round 1", "Final review cut"],
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = Date.parse(ordered[index - 1]!.created_at);
    const current = Date.parse(ordered[index]!.created_at);
    assert.ok(Number.isFinite(previous) && Number.isFinite(current));
    assert.ok(current > previous, "created_at must ascend with version_number");
  }
});

test("demo seed comments stay asset-level (version_id null = applies to all versions)", () => {
  assert.ok(demoReviewPayload.comments.length > 0);
  assert.ok(demoReviewPayload.comments.every((comment) => comment.version_id === null));
});

import assert from "node:assert/strict";
import test from "node:test";
import type { Version } from "../lib/types/codeliver.ts";
import {
  comparePair,
  currentVersion,
  resolveVersionParam,
  sortVersions,
  versionBadgeLabel,
} from "../lib/versions/versions.ts";

function makeVersion(
  versionNumber: number,
  overrides: Partial<Version> = {},
): Version {
  return {
    id: `version-${versionNumber}`,
    asset_id: "asset-1",
    version_number: versionNumber,
    file_url: `/demo/file-v${versionNumber}.mp4`,
    file_size: null,
    thumbnail_url: null,
    duration_seconds: null,
    resolution: "1920x1080",
    is_current: false,
    notes: null,
    uploaded_by: null,
    created_at: new Date(2026, 0, versionNumber).toISOString(),
    ...overrides,
  };
}

test("sortVersions orders by version_number descending and does not mutate input", () => {
  const input = [makeVersion(1), makeVersion(3), makeVersion(2)];
  const sorted = sortVersions(input);
  assert.deepEqual(
    sorted.map((version) => version.version_number),
    [3, 2, 1],
  );
  assert.deepEqual(
    input.map((version) => version.version_number),
    [1, 3, 2],
  );
});

test("sortVersions handles empty and single-version lists", () => {
  assert.deepEqual(sortVersions([]), []);
  const single = [makeVersion(7)];
  assert.deepEqual(sortVersions(single).map((version) => version.version_number), [7]);
});

test("sortVersions breaks version_number ties by created_at descending", () => {
  const older = makeVersion(2, { id: "older", created_at: "2026-01-01T00:00:00.000Z" });
  const newer = makeVersion(2, { id: "newer", created_at: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(
    sortVersions([older, newer]).map((version) => version.id),
    ["newer", "older"],
  );
});

test("currentVersion returns null for an empty list", () => {
  assert.equal(currentVersion([]), null);
});

test("currentVersion returns the only version for a single-version list", () => {
  const only = makeVersion(4);
  assert.equal(currentVersion([only])?.id, only.id);
});

test("currentVersion prefers is_current even when it is not the highest number", () => {
  const flagged = makeVersion(2, { is_current: true });
  const versions = [makeVersion(3), flagged, makeVersion(1)];
  assert.equal(currentVersion(versions)?.id, flagged.id);
});

test("currentVersion falls back to the highest number when nothing is flagged", () => {
  const versions = [makeVersion(1), makeVersion(3), makeVersion(2)];
  assert.equal(currentVersion(versions)?.version_number, 3);
});

test("currentVersion picks the highest-numbered flag when several are is_current", () => {
  const versions = [
    makeVersion(1, { is_current: true }),
    makeVersion(3, { is_current: true }),
    makeVersion(2),
  ];
  assert.equal(currentVersion(versions)?.version_number, 3);
});

test("resolveVersionParam treats null, undefined, and empty as the current version", () => {
  const current = makeVersion(2, { is_current: true });
  const versions = [makeVersion(3), current];
  assert.equal(resolveVersionParam(versions, null)?.id, current.id);
  assert.equal(resolveVersionParam(versions, undefined)?.id, current.id);
  assert.equal(resolveVersionParam(versions, "")?.id, current.id);
  assert.equal(resolveVersionParam(versions, "   ")?.id, current.id);
});

test("resolveVersionParam resolves 'latest' and 'current' aliases to the current version", () => {
  const current = makeVersion(2, { is_current: true });
  const versions = [makeVersion(3), current];
  assert.equal(resolveVersionParam(versions, "latest")?.id, current.id);
  assert.equal(resolveVersionParam(versions, "current")?.id, current.id);
  assert.equal(resolveVersionParam(versions, "LATEST")?.id, current.id);
});

test("resolveVersionParam resolves explicit numbers, with or without a v prefix", () => {
  const versions = [makeVersion(1), makeVersion(2), makeVersion(3)];
  assert.equal(resolveVersionParam(versions, "2")?.version_number, 2);
  assert.equal(resolveVersionParam(versions, "v2")?.version_number, 2);
  assert.equal(resolveVersionParam(versions, "V3")?.version_number, 3);
});

test("resolveVersionParam is null-safe for unknown numbers, garbage, and empty lists", () => {
  const versions = [makeVersion(1), makeVersion(2)];
  assert.equal(resolveVersionParam(versions, "9"), null);
  assert.equal(resolveVersionParam(versions, "0"), null);
  assert.equal(resolveVersionParam(versions, "-1"), null);
  assert.equal(resolveVersionParam(versions, "banana"), null);
  assert.equal(resolveVersionParam(versions, "v"), null);
  assert.equal(resolveVersionParam([], "1"), null);
  assert.equal(resolveVersionParam([], null), null);
});

test("versionBadgeLabel renders V-prefixed label and Current suffix", () => {
  const version = makeVersion(3);
  assert.equal(versionBadgeLabel(version, true), "V3 · Current");
  assert.equal(versionBadgeLabel(version, false), "V3");
});

test("versionBadgeLabel defaults the current flag to the version's own is_current", () => {
  assert.equal(versionBadgeLabel(makeVersion(3, { is_current: true })), "V3 · Current");
  assert.equal(versionBadgeLabel(makeVersion(1)), "V1");
});

test("comparePair defaults to the latest two versions, newest first", () => {
  const versions = [makeVersion(1), makeVersion(3), makeVersion(2)];
  const pair = comparePair(versions);
  assert.equal(pair?.a.version_number, 3);
  assert.equal(pair?.b.version_number, 2);
});

test("comparePair resolves explicit params in either order", () => {
  const versions = [makeVersion(1), makeVersion(2), makeVersion(3)];
  const pair = comparePair(versions, "1", "3");
  assert.equal(pair?.a.version_number, 1);
  assert.equal(pair?.b.version_number, 3);
  const swapped = comparePair(versions, "v2", "latest");
  assert.equal(swapped?.a.version_number, 2);
  assert.equal(swapped?.b.version_number, 3);
});

test("comparePair returns null when a pair cannot be formed", () => {
  assert.equal(comparePair([]), null);
  assert.equal(comparePair([makeVersion(1)]), null);
  const versions = [makeVersion(1), makeVersion(2)];
  assert.equal(comparePair(versions, "1", "1"), null);
  assert.equal(comparePair(versions, "1", "9"), null);
  assert.equal(comparePair(versions, "banana"), null);
});

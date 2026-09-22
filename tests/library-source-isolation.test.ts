import assert from "node:assert/strict";
import test from "node:test";

import { librarySurfaceData } from "../lib/assets/library-surface-data.ts";
import { filterLibraryAssets, parseLibraryQuery, toLibrarySearchRecord } from "../lib/assets/query.ts";
import type { LibraryAssetMeta, LibraryPackage } from "../lib/assets/types.ts";
import type { SourceCatalog } from "../lib/demo/source-catalog.ts";

const fixtureMeta: LibraryAssetMeta = {
  asset_id: "epw-v4",
  campaign: "ICA Roadshow",
  platforms: ["linkedin"],
  format: "hero film",
  orientation: "landscape",
  product: "Fixture product",
  talent: ["Fixture talent"],
  tags: ["mclaren"],
  rights: { kind: "unlimited", label: "Unlimited fixture usage", expires_at: null },
  resolution: "960x540",
  duration_seconds: 5,
  file_size_bytes: 7,
  formats: [],
};

const fixturePackages: LibraryPackage[] = [{
  id: "fixture-package",
  title: "ICA Roadshow package",
  campaign: "ICA Roadshow",
  description: "Illustrative only",
  asset_ids: ["epw-v4"],
}];

const catalog: SourceCatalog = {
  imported_at: "2026-09-22T00:00:00Z",
  projects: [{ id: "el-paso", name: "El Paso Water Customer Story" }],
  assets: [{
    id: "epw-v4",
    project_id: "el-paso",
    title: "EPW x SCHNEIDER v4",
    bytes: 1_108_016_434,
    duration_seconds: 354.312292,
    width: 1920,
    height: 1080,
    created_at: "2026-09-09T00:00:00Z",
  }],
};

test("source library ignores fixture packages and metadata even for an id collision", () => {
  const surface = librarySurfaceData(catalog, { "epw-v4": fixtureMeta }, fixturePackages);

  assert.equal(surface.isSourceCatalog, true);
  assert.deepEqual(surface.metaByAssetId, {});
  assert.deepEqual(surface.packages, []);
  assert.deepEqual(surface.sourceFactsByAssetId["epw-v4"], {
    assetId: "epw-v4",
    projectId: "el-paso",
    projectName: "El Paso Water Customer Story",
    durationSeconds: 354.312292,
    resolution: "1920 × 1080",
    sizeBytes: 1_108_016_434,
  });
});

test("source library search and project filtering use the configured catalog names", () => {
  const source = librarySurfaceData(catalog, { "epw-v4": fixtureMeta }, fixturePackages);
  const facts = source.sourceFactsByAssetId["epw-v4"];
  const record = toLibrarySearchRecord(
    { id: "epw-v4", title: "EPW x SCHNEIDER v4", created_at: "2026-09-09T00:00:00Z" },
    source.metaByAssetId["epw-v4"],
    false,
    { campaign: facts.projectName, searchTerms: [facts.projectName, facts.projectId] },
  );

  assert.deepEqual(filterLibraryAssets([record], parseLibraryQuery("El Paso Water")), [record]);
  assert.deepEqual(filterLibraryAssets([record], parseLibraryQuery('campaign:"El Paso Water Customer Story"')), [record]);
  assert.deepEqual(filterLibraryAssets([record], parseLibraryQuery("ICA Roadshow")), []);
  assert.equal(record.rights_kind, "unknown");
});

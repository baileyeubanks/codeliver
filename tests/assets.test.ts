import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { register } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

register("./typescript-resolver.mjs", import.meta.url);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const {
  filterLibraryAssets,
  matchesLibraryQuery,
  mergeFacets,
  parseLibraryQuery,
  toLibrarySearchRecord,
  tokenizeQueryText,
  facetValues,
} = await import("../lib/assets/query.ts");
const { clamp01, scrubFraction, scrubTimeSeconds, scrubTimeForPointer } = await import(
  "../lib/assets/scrub.ts"
);
const {
  NOT_PRODUCED_REASON,
  downloadableFormats,
  formatBytes,
  formatDurationSeconds,
  formatMatrixFor,
  shortChecksum,
} = await import("../lib/assets/formats.ts");
const { buildPackageManifest } = await import("../lib/assets/manifest.ts");
const { demoLibraryAssetMeta, demoLibraryMetaById, demoLibraryPackages, demoLibrarySeedAssets } =
  await import("../lib/assets/demo-library.ts");
const { LIBRARY_FORMAT_KEYS } = await import("../lib/assets/types.ts");

function record(partial: Record<string, unknown>) {
  return {
    id: "a1",
    title: "ICA_ROADSHOW_x_FINAL",
    tags: ["roadshow", "hero"],
    campaign: "ICA Roadshow",
    platforms: ["youtube", "linkedin"],
    format: "hero film",
    orientation: "landscape",
    product: "Roadshow hero",
    talent: ["Denie McDonald"],
    rights_kind: "unlimited",
    created_at: "2026-03-08T16:12:00.000Z",
    is_favorite: false,
    ...partial,
  } as Parameters<typeof matchesLibraryQuery>[0];
}

// ── Query engine: parse ────────────────────────────────────────

test("tokenizer keeps quoted phrases intact and splits bare words", () => {
  assert.deepEqual(tokenizeQueryText('roadshow "ICA Roadshow"  ceo'), [
    "roadshow",
    '"ICA Roadshow"',
    "ceo",
  ]);
  assert.deepEqual(tokenizeQueryText(""), []);
});

test("parseLibraryQuery separates free text from facet tokens", () => {
  const query = parseLibraryQuery('hero campaign:"ICA Roadshow" platform:linkedin after:2026-01-01');
  assert.deepEqual(query.textTokens, ["hero"]);
  assert.equal(query.facets.campaign, "ICA Roadshow");
  assert.equal(query.facets.platform, "linkedin");
  assert.equal(query.facets.dateFrom, "2026-01-01");
});

test("parseLibraryQuery maps fav/before/rights/talent keys and keeps unknown keys as text", () => {
  const query = parseLibraryQuery("fav:true before:2026-08-01 rights:paid_until talent:denie bogus:zzz");
  assert.equal(query.facets.favoritesOnly, true);
  assert.equal(query.facets.dateTo, "2026-08-01");
  assert.equal(query.facets.rights, "paid_until");
  assert.equal(query.facets.talent, "denie");
  assert.deepEqual(query.textTokens, ["bogus:zzz"]);
});

// ── Query engine: match + combine ──────────────────────────────

test("text matching is case-insensitive across title, tags, talent, and product", () => {
  const target = record({});
  assert.ok(matchesLibraryQuery(target, parseLibraryQuery("roadshow")));
  assert.ok(matchesLibraryQuery(target, parseLibraryQuery("DENIE")));
  assert.ok(matchesLibraryQuery(target, parseLibraryQuery('"roadshow hero"')));
  assert.ok(!matchesLibraryQuery(target, parseLibraryQuery("podcast")));
});

test("multiple text tokens AND-combine", () => {
  const target = record({});
  assert.ok(matchesLibraryQuery(target, parseLibraryQuery("roadshow denie")));
  assert.ok(!matchesLibraryQuery(target, parseLibraryQuery("roadshow podcast")));
});

test("facets combine with AND semantics across campaign, platform, orientation, rights", () => {
  const target = record({});
  assert.ok(
    matchesLibraryQuery(
      target,
      parseLibraryQuery("campaign:ica roadshow"),
    ) === false,
    "campaign equality is normalized but must actually match",
  );
  const query = parseLibraryQuery(
    'campaign:"ICA Roadshow" platform:linkedin orientation:landscape rights:unlimited',
  );
  assert.ok(matchesLibraryQuery(target, query));
  assert.ok(
    !matchesLibraryQuery(
      target,
      parseLibraryQuery('campaign:"ICA Roadshow" platform:tiktok'),
    ),
  );
});

test("date range facets bound created_at inclusively", () => {
  const target = record({ created_at: "2026-03-08T16:12:00.000Z" });
  assert.ok(
    matchesLibraryQuery(target, parseLibraryQuery("after:2026-03-08 before:2026-03-08")),
  );
  assert.ok(!matchesLibraryQuery(target, parseLibraryQuery("after:2026-03-09")));
  assert.ok(!matchesLibraryQuery(target, parseLibraryQuery("before:2026-03-07")));
});

test("talent facet matches partial names; favoritesOnly filters", () => {
  assert.ok(matchesLibraryQuery(record({}), parseLibraryQuery("talent:mcdonald")));
  assert.ok(!matchesLibraryQuery(record({ is_favorite: false }), parseLibraryQuery("fav:true")));
  assert.ok(matchesLibraryQuery(record({ is_favorite: true }), parseLibraryQuery("fav:true")));
});

test("filterLibraryAssets narrows a set under combined text + facets", () => {
  const records = [
    record({ id: "a1" }),
    record({ id: "a2", title: "Podcast_v3", campaign: "McLaren Podcast S1", tags: ["podcast"], platforms: ["youtube", "spotify"] }),
    record({ id: "a3", title: "Rodeo_v2", campaign: "BP Rodeo 2026", platforms: ["internal"] }),
  ];
  assert.deepEqual(
    filterLibraryAssets(records, parseLibraryQuery("platform:linkedin")).map((r) => r.id),
    ["a1"],
  );
  assert.deepEqual(
    filterLibraryAssets(records, parseLibraryQuery("podcast")).map((r) => r.id),
    ["a2"],
  );
  assert.deepEqual(filterLibraryAssets(records, parseLibraryQuery("")).length, 3);
});

test("mergeFacets lets the rail override parsed facets and ignores empty values", () => {
  const parsed = parseLibraryQuery("campaign:old platform:youtube").facets;
  const merged = mergeFacets(parsed, { campaign: "New Campaign", platform: "" });
  assert.equal(merged.campaign, "New Campaign");
  assert.equal(merged.platform, "youtube");
});

// ── Search records + facet options ─────────────────────────────

test("toLibrarySearchRecord joins asset, metadata, and favorite state", () => {
  const meta = demoLibraryMetaById["ica-ceo-hero-v1"];
  const joined = toLibrarySearchRecord(
    { id: "ica-ceo-hero-v1", title: "ICA CEO Hero Cut_v1", created_at: "2026-07-10T15:00:00.000Z" },
    meta,
    true,
  );
  assert.equal(joined.campaign, "ICA Roadshow");
  assert.equal(joined.rights_kind, "paid_until");
  assert.equal(joined.is_favorite, true);
  const unjoined = toLibrarySearchRecord(
    { id: "mystery", title: "Mystery", created_at: "2026-01-01T00:00:00.000Z" },
    undefined,
    false,
  );
  assert.equal(unjoined.rights_kind, "unknown");
  assert.deepEqual(unjoined.platforms, []);
});

test("facetValues returns distinct sorted options including array facets", () => {
  const records = demoLibraryAssetMeta.map((meta) =>
    toLibrarySearchRecord(
      { id: meta.asset_id, title: meta.asset_id, created_at: "2026-07-01T00:00:00.000Z" },
      meta,
      false,
    ),
  );
  const campaigns = facetValues(records, "campaign");
  assert.ok(campaigns.includes("ICA Roadshow"));
  assert.equal(new Set(campaigns).size, campaigns.length);
  assert.deepEqual([...campaigns].sort((a, b) => a.localeCompare(b)), campaigns);
  const platforms = facetValues(records, "platform");
  assert.ok(platforms.includes("linkedin"));
  assert.ok(platforms.includes("internal"));
});

// ── Hover-scrub mapping ────────────────────────────────────────

test("scrubFraction clamps the pointer into [0, 1]", () => {
  assert.equal(scrubFraction(50, 100, 200), 0);
  assert.equal(scrubFraction(200, 100, 200), 0.5);
  assert.equal(scrubFraction(300, 100, 200), 1);
  assert.equal(scrubFraction(-50, 0, 200), 0);
});

test("scrubFraction degenerates safely on zero/invalid width", () => {
  assert.equal(scrubFraction(10, 0, 0), 0);
  assert.equal(scrubFraction(10, 0, -5), 0);
  assert.equal(scrubFraction(Number.NaN, 0, 100), 0);
});

test("scrubTimeSeconds clamps to the duration and handles invalid durations", () => {
  assert.equal(scrubTimeSeconds(0.5, 60), 30);
  assert.equal(scrubTimeSeconds(2, 60), 60);
  assert.equal(scrubTimeSeconds(-1, 60), 0);
  assert.equal(scrubTimeSeconds(0.5, 0), 0);
  assert.equal(scrubTimeSeconds(0.5, Number.NaN), 0);
});

test("scrubTimeForPointer maps the right edge to the final frame, never beyond", () => {
  assert.equal(scrubTimeForPointer(400, 100, 300, 5.005), 5.005);
  assert.equal(scrubTimeForPointer(100, 100, 300, 5.005), 0);
  assert.ok(Math.abs(scrubTimeForPointer(250, 100, 300, 10) - 5) < 1e-9);
  assert.equal(clamp01(1.2), 1);
});

// ── Format matrix shaping ──────────────────────────────────────

test("formatMatrixFor emits one row per canonical format in order", () => {
  const rows = formatMatrixFor([
    {
      format: "master",
      available: true,
      href: "/demo/x.mp4",
      size_bytes: 10,
      sha256: "abc",
    },
  ]);
  assert.equal(rows.length, LIBRARY_FORMAT_KEYS.length);
  assert.deepEqual(rows.map((row) => row.format), [...LIBRARY_FORMAT_KEYS]);
  assert.equal(rows[0].available, true);
  assert.equal(rows[1].available, false);
  assert.equal(!rows[1].available && rows[1].reason, NOT_PRODUCED_REASON);
});

test("downloadableFormats only returns rows backed by a real file", () => {
  const rows = formatMatrixFor(demoLibraryMetaById["mclaren-podcast-v3"].formats);
  const downloadable = downloadableFormats(rows);
  assert.deepEqual(
    downloadable.map((entry) => entry.format),
    ["master", "thumbnail"],
  );
  for (const entry of downloadable) {
    assert.ok(entry.available);
    assert.ok(entry.href.startsWith("/demo/"));
  }
});

test("formatBytes and formatDurationSeconds format truthfully", () => {
  assert.equal(formatBytes(727_711), "711 KB");
  assert.equal(formatBytes(3_555_540), "3.4 MB");
  assert.equal(formatBytes(28_545_903), "27.2 MB");
  assert.equal(formatBytes(null), "");
  assert.equal(formatDurationSeconds(5.005), "0:05");
  assert.equal(formatDurationSeconds(71), "1:11");
  assert.equal(formatDurationSeconds(150), "2:30");
  assert.equal(formatDurationSeconds(undefined), "");
  assert.equal(shortChecksum("53300e99341e99cd", 8), "53300e99");
});

// ── Manifest shaping ───────────────────────────────────────────

test("buildPackageManifest lists only real files with sizes and checksums", () => {
  const pkg = demoLibraryPackages.find((candidate) => candidate.id === "pkg-ica-roadshow");
  assert.ok(pkg);
  const manifest = buildPackageManifest(
    pkg,
    [
      { id: "ica-roadshow-final", title: "ICA_ROADSHOW_x_FINAL" },
      { id: "ica-ceo-hero-v1", title: "ICA CEO Hero Cut_v1" },
    ],
    demoLibraryMetaById,
  );
  assert.equal(manifest.package_id, "pkg-ica-roadshow");
  assert.equal(manifest.file_count, manifest.files.length);
  assert.ok(manifest.file_count >= 2);
  for (const file of manifest.files) {
    assert.ok(file.href.startsWith("/demo/"));
    assert.ok(file.size_bytes > 0);
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.ok(file.file_name.length > 0);
  }
  assert.equal(
    manifest.total_bytes,
    manifest.files.reduce((sum, file) => sum + file.size_bytes, 0),
  );
  // The roadshow final has no produced master — the manifest must not invent one.
  assert.ok(
    !manifest.files.some(
      (file) => file.asset_id === "ica-roadshow-final" && file.format === "master",
    ),
  );
  assert.ok(
    manifest.files.some(
      (file) => file.asset_id === "ica-ceo-hero-v1" && file.format === "master",
    ),
  );
});

// ── Seed honesty: seeds match the real files on disk ───────────

test("every available format seed matches the real file's size and SHA-256", () => {
  let checked = 0;
  for (const meta of demoLibraryAssetMeta) {
    for (const entry of meta.formats) {
      if (!entry.available) continue;
      const filePath = resolve(repositoryRoot, "public", entry.href.replace(/^\//, ""));
      assert.ok(existsSync(filePath), `missing real file for ${meta.asset_id}: ${entry.href}`);
      const buffer = readFileSync(filePath);
      assert.equal(statSync(filePath).size, entry.size_bytes, `size drift for ${entry.href}`);
      assert.equal(
        createHash("sha256").update(buffer).digest("hex"),
        entry.sha256,
        `checksum drift for ${entry.href}`,
      );
      checked += 1;
    }
  }
  assert.ok(checked >= 6, "expected masters + thumbnails across the seed set");
});

test("seed packages reference only seeded assets with metadata", () => {
  const seededAssetIds = new Set(demoLibrarySeedAssets.map((asset) => asset.id));
  assert.ok(seededAssetIds.has("ica-ceo-hero-v1"));
  assert.ok(seededAssetIds.has("ambient-product-loop-v1"));
  for (const pkg of demoLibraryPackages) {
    assert.ok(pkg.asset_ids.length >= 2);
    for (const assetId of pkg.asset_ids) {
      assert.ok(demoLibraryMetaById[assetId], `package asset ${assetId} lacks metadata`);
    }
  }
});

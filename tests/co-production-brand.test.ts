import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(
  repositoryRoot,
  "components/brand/CoProductionBrand.tsx",
);
const stylesheetPath = resolve(
  repositoryRoot,
  "components/brand/CoProductionBrand.module.css",
);
const componentSource = readFileSync(componentPath, "utf8");
const stylesheetSource = readFileSync(stylesheetPath, "utf8");

const assets = {
  horizontal: {
    path: "/brand/co-production-pro-horizontal.png",
    filePath: resolve(
      repositoryRoot,
      "public/brand/co-production-pro-horizontal.png",
    ),
    sha256: "d7fa2c42da764c1536afd272844d0d253bbb4149bafce4919d3b0a5f1063a39f",
    width: 7296,
    height: 4096,
  },
  stacked: {
    path: "/brand/co-production-pro-stacked.png",
    filePath: resolve(
      repositoryRoot,
      "public/brand/co-production-pro-stacked.png",
    ),
    sha256: "daf990508e4811a7dd5e5e0263292e28ea239d9f6a580ae21dd76fc269f9ba00",
    width: 7296,
    height: 4096,
  },
} as const;

interface CropGeometry {
  className: "horizontal" | "stacked" | "compactMark";
  source: keyof typeof assets;
  crop: { x: number; y: number; width: number; height: number };
  artwork: { minX: number; minY: number; maxX: number; maxY: number };
  desktopWidth: number;
  mobileWidth: number;
}

const geometries: CropGeometry[] = [
  {
    className: "horizontal",
    source: "horizontal",
    crop: { x: 560, y: 1220, width: 6400, height: 1470 },
    artwork: { minX: 695, minY: 1331, maxX: 6815, maxY: 2579 },
    desktopWidth: 172,
    mobileWidth: 152,
  },
  {
    className: "stacked",
    source: "stacked",
    crop: { x: 1660, y: 965, width: 4050, height: 1975 },
    artwork: { minX: 1774, minY: 1075, maxX: 5598, maxY: 2831 },
    desktopWidth: 300,
    mobileWidth: 260,
  },
  {
    className: "compactMark",
    source: "horizontal",
    crop: { x: 620, y: 1240, width: 1560, height: 1430 },
    artwork: { minX: 695, minY: 1331, maxX: 2107, maxY: 2579 },
    desktopWidth: 44,
    mobileWidth: 40,
  },
];

function classRule(source: string, className: string) {
  const match = source.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing .${className} rule`);
  return match[1];
}

function customProperty(rule: string, property: string) {
  const match = rule.match(
    new RegExp(`--${property}:\\s*(-?[0-9.]+)(%|px)?\\s*;`),
  );
  assert.ok(match, `missing --${property}`);
  return { value: Number(match[1]), unit: match[2] ?? "" };
}

function assertClose(actual: number, expected: number, message: string) {
  assert.ok(
    Math.abs(actual - expected) < 0.001,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

test("supplied Co-Production Pro rasters remain byte-for-byte intact", () => {
  const pngSignature = "89504e470d0a1a0a";

  for (const asset of Object.values(assets)) {
    const contents = readFileSync(asset.filePath);
    assert.equal(contents.subarray(0, 8).toString("hex"), pngSignature);
    assert.equal(contents.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(contents.readUInt32BE(16), asset.width);
    assert.equal(contents.readUInt32BE(20), asset.height);
    assert.equal(createHash("sha256").update(contents).digest("hex"), asset.sha256);
  }
});

test("component variants use only the supplied raster artwork with an accessible label", () => {
  assert.match(componentSource, /import Image from "next\/image"/);
  assert.match(
    componentSource,
    /horizontal:\s*"\/brand\/co-production-pro-horizontal\.png"/,
  );
  assert.match(
    componentSource,
    /stacked:\s*"\/brand\/co-production-pro-stacked\.png"/,
  );
  assert.match(
    componentSource,
    /"compact-mark":\s*"\/brand\/co-production-pro-horizontal\.png"/,
  );
  assert.match(componentSource, /alt=\{label\}/);
  assert.match(componentSource, /unoptimized/);
  assert.match(componentSource, /Co-Production Pro by Content Co-op/);
  assert.doesNotMatch(componentSource, /<svg\b|data:image|font-family/i);
});

test("CSS crop geometry removes baked whitespace without clipping real artwork", () => {
  for (const geometry of geometries) {
    const rule = classRule(stylesheetSource, geometry.className);
    const source = assets[geometry.source];
    const crop = {
      x: customProperty(rule, "crop-x").value,
      y: customProperty(rule, "crop-y").value,
      width: customProperty(rule, "crop-width").value,
      height: customProperty(rule, "crop-height").value,
    };

    assert.deepEqual(crop, geometry.crop);
    assert.ok(geometry.artwork.minX > crop.x);
    assert.ok(geometry.artwork.minY > crop.y);
    assert.ok(geometry.artwork.maxX < crop.x + crop.width);
    assert.ok(geometry.artwork.maxY < crop.y + crop.height);

    const visibleWidth = geometry.artwork.maxX - geometry.artwork.minX + 1;
    const visibleHeight = geometry.artwork.maxY - geometry.artwork.minY + 1;
    assert.ok(visibleWidth / crop.width > 0.84);
    assert.ok(visibleHeight / crop.height > 0.84);

    assertClose(
      customProperty(rule, "image-width").value,
      (source.width / crop.width) * 100,
      `${geometry.className} image width`,
    );
    assertClose(
      customProperty(rule, "image-left").value,
      -(crop.x / crop.width) * 100,
      `${geometry.className} image left`,
    );
    assertClose(
      customProperty(rule, "image-top").value,
      -(crop.y / crop.height) * 100,
      `${geometry.className} image top`,
    );
  }
});

test("responsive dimensions fit the cockpit header and auth shell", () => {
  const brandRule = classRule(stylesheetSource, "brand");
  const imageRule = classRule(stylesheetSource, "image");
  assert.match(brandRule, /overflow:\s*hidden/);
  assert.match(brandRule, /max-width:\s*100%/);
  assert.match(brandRule, /aspect-ratio:\s*var\(--crop-width\)\s*\/\s*var\(--crop-height\)/);
  assert.match(imageRule, /max-width:\s*none/);
  assert.match(imageRule, /pointer-events:\s*none/);

  const mobileQueryStart = stylesheetSource.indexOf("@media (max-width: 480px)");
  assert.notEqual(mobileQueryStart, -1, "missing compact viewport sizing");
  const mobileRules = stylesheetSource.slice(mobileQueryStart);

  for (const geometry of geometries) {
    const desktopRule = classRule(stylesheetSource, geometry.className);
    const mobileRule = classRule(mobileRules, geometry.className);
    const desktopWidth = customProperty(
      desktopRule,
      "brand-default-width",
    );
    const mobileWidth = customProperty(mobileRule, "brand-default-width");
    assert.deepEqual(desktopWidth, { value: geometry.desktopWidth, unit: "px" });
    assert.deepEqual(mobileWidth, { value: geometry.mobileWidth, unit: "px" });

    const desktopHeight =
      geometry.desktopWidth * (geometry.crop.height / geometry.crop.width);
    const mobileHeight =
      geometry.mobileWidth * (geometry.crop.height / geometry.crop.width);
    assert.ok(desktopHeight > 36 && desktopHeight < 160);
    assert.ok(mobileHeight > 34 && mobileHeight < 140);
  }

  const horizontal = geometries[0];
  const compactMark = geometries[2];
  assert.equal(horizontal.desktopWidth, 224 - 2 * 26);
  assert.ok(
    horizontal.desktopWidth * (horizontal.crop.height / horizontal.crop.width) <=
      72 - 2 * 9,
  );
  assert.ok(compactMark.desktopWidth <= 64 - 2 * 8);
  assert.ok(
    compactMark.desktopWidth *
      (compactMark.crop.height / compactMark.crop.width) <=
      72 - 2 * 9,
  );
});

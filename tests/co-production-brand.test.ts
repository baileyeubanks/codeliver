import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentSource = readFileSync(
  resolve(repositoryRoot, "components/brand/CoProductionBrand.tsx"),
  "utf8",
);
const stylesheetSource = readFileSync(
  resolve(repositoryRoot, "components/brand/CoProductionBrand.module.css"),
  "utf8",
);
const canonicalAsset = readFileSync(
  resolve(repositoryRoot, "public/brand/co-videopro-canonical.png"),
);
const runtimeAsset = readFileSync(
  resolve(repositoryRoot, "public/brand/co-videopro-canonical-runtime.png"),
);
const horizontalAsset = readFileSync(
  resolve(repositoryRoot, "public/brand/co-videopro-blue-long.png"),
);
const suppliedColorAsset = readFileSync(
  resolve(repositoryRoot, "public/brand/co-videopro-color-supplied.png"),
);
const suppliedBlueAsset = readFileSync(
  resolve(repositoryRoot, "public/brand/co-videopro-blue-supplied.png"),
);
const brandSettingsSource = readFileSync(
  resolve(repositoryRoot, "components/auth/BrandSettings.tsx"),
  "utf8",
);

test("canonical Co-VideoPro raster remains byte-for-byte intact", () => {
  assert.equal(canonicalAsset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(canonicalAsset.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(canonicalAsset.readUInt32BE(16), 786);
  assert.equal(canonicalAsset.readUInt32BE(20), 565);
  assert.equal(
    createHash("sha256").update(canonicalAsset).digest("hex"),
    "7d7119adcb6a7e3bccc52148475154d4d1dcfe2614ebbed813271c765b4535f7",
  );
});

test("runtime brand raster preserves the supplied blue lockup exactly", () => {
  assert.equal(runtimeAsset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(runtimeAsset.readUInt32BE(16), 786);
  assert.equal(runtimeAsset.readUInt32BE(20), 565);
  assert.equal(
    createHash("sha256").update(runtimeAsset).digest("hex"),
    "7d7119adcb6a7e3bccc52148475154d4d1dcfe2614ebbed813271c765b4535f7",
  );
});

test("horizontal shell branding preserves the supplied wide lockup exactly", () => {
  assert.equal(horizontalAsset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(horizontalAsset.readUInt32BE(16), 730);
  assert.equal(horizontalAsset.readUInt32BE(20), 187);
  assert.equal(
    createHash("sha256").update(horizontalAsset).digest("hex"),
    "27c1b2e5d72b8c57d4016220bfb88305a1e349dfff9330c94c923367006e35ba",
  );
});

test("the supplied color and blue source rasters remain byte-for-byte intact", () => {
  assert.equal(suppliedColorAsset.readUInt32BE(16), 7296);
  assert.equal(suppliedColorAsset.readUInt32BE(20), 4096);
  assert.equal(
    createHash("sha256").update(suppliedColorAsset).digest("hex"),
    "9abeece51f42867ed3888e9ebda7c223378f54ff0709a8e195c2e1087ba9d7f7",
  );
  assert.equal(suppliedBlueAsset.readUInt32BE(16), 1360);
  assert.equal(suppliedBlueAsset.readUInt32BE(20), 1024);
  assert.equal(
    createHash("sha256").update(suppliedBlueAsset).digest("hex"),
    "17d129841f6c2b78ad1afac402fa5c389e4c6657278ecd133eecf6948218f788",
  );
});

test("shell branding uses the supplied horizontal lockup while centered variants keep the canonical crop", () => {
  assert.match(componentSource, /const CANONICAL_SOURCE = "\/brand\/co-videopro-color-supplied\.png"/);
  assert.match(componentSource, /const HORIZONTAL_SOURCE = "\/brand\/co-videopro-shell-lockup\.png"/);
  assert.match(componentSource, /const WORDMARK_SOURCE = "\/brand\/co-videopro-blue-wordmark\.png"/);
  assert.match(componentSource, /src=\{CANONICAL_SOURCE\}/);
  assert.match(componentSource, /width=\{7296\}/);
  assert.match(componentSource, /height=\{4096\}/);
  assert.match(componentSource, /src=\{HORIZONTAL_SOURCE\}/);
  assert.match(componentSource, /width=\{730\}/);
  assert.match(componentSource, /height=\{187\}/);
  assert.match(componentSource, /className=\{styles\.horizontalImage\}/);
  assert.match(componentSource, /role="img"/);
  assert.match(componentSource, /aria-label=\{label\}/);
  assert.match(componentSource, /Co-VideoPro production workspace/);
  assert.match(componentSource, /loading: priority \? "eager" as const : undefined/);
  assert.match(componentSource, /fetchPriority: priority \? "high" as const : undefined/);
  assert.match(componentSource, /unoptimized: true/);
  assert.match(componentSource, /source\?: string/);
  assert.match(componentSource, /\{source \? \([\s\S]*?src=\{source\}/);
  assert.doesNotMatch(componentSource, /source === CANONICAL_LOGO_PATH/);
  assert.doesNotMatch(componentSource, /<svg\b|data:image|font-family/i);
});

test("an explicitly governed shell lockup is rendered directly without asset substitution", () => {
  const explicitSourceBranch = componentSource.match(
    /\{source \? \([\s\S]*?\) : variant === "horizontal"/,
  )?.[0] ?? "";

  assert.match(explicitSourceBranch, /src=\{source\}/);
  assert.match(explicitSourceBranch, /className=\{styles\.customImage\}/);
  assert.doesNotMatch(explicitSourceBranch, /HORIZONTAL_SOURCE|MARK_SOURCE|CANONICAL_SOURCE/);
});

test("brand variants request derivatives that match their actual shell slots", () => {
  assert.match(componentSource, /horizontal: "\(max-width: 480px\) 152px, 172px"/);
  assert.match(componentSource, /wordmark: "\(max-width: 480px\) 148px, 184px"/);
  assert.match(componentSource, /stacked: "\(max-width: 480px\) 260px, 300px"/);
  assert.match(componentSource, /"compact-mark": "\(max-width: 480px\) 56px, 62px"/);
  assert.match(componentSource, /width=\{7296\}/);
  assert.match(componentSource, /height=\{4096\}/);
  assert.match(componentSource, /sizes=\{sizes \?\? SIZES_BY_VARIANT\[variant\]\}/);
});

test("brand composition stays bounded and responsive", () => {
  assert.match(stylesheetSource, /\.brand\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(stylesheetSource, /max-width:\s*100%/);
  assert.match(stylesheetSource, /aspect-ratio:\s*var\(--crop-width\)\s*\/\s*var\(--crop-height\)/);
  assert.match(stylesheetSource, /\.horizontalImage/);
  assert.match(stylesheetSource, /\.wordmarkImage/);
  assert.match(stylesheetSource, /object-fit:\s*contain/);
  assert.match(stylesheetSource, /\.horizontal\s*\{[\s\S]*?--crop-width:\s*172/);
  assert.match(stylesheetSource, /\.horizontal\s*\{[\s\S]*?--crop-height:\s*44/);
  assert.match(stylesheetSource, /\.wordmark\s*\{[\s\S]*?--crop-width:\s*620/);
  assert.match(stylesheetSource, /\.stacked\s*\{[\s\S]*?--crop-width:\s*3600/);
  assert.match(stylesheetSource, /\.compactMark\s*\{[\s\S]*?--crop-width:\s*3600/);
  assert.match(stylesheetSource, /@media \(max-width: 480px\)/);
  assert.match(stylesheetSource, /--brand-default-width:\s*152px/);
  assert.doesNotMatch(stylesheetSource, /border-radius:\s*(?:9|[1-9][0-9]+)px/);
});

test("governed brand previews use the canonical product crop and preserve customer rasters", () => {
  assert.match(
    brandSettingsSource,
    /value="\/brand\/co-videopro-color-supplied\.png">Co-VideoPro color lockup/,
  );
  assert.match(
    brandSettingsSource,
    /values\.logoPath\.startsWith\("\/brand\/co-videopro-"\)[\s\S]*?<CoProductionBrand[\s\S]*?variant="compact-mark"/,
  );
  assert.match(
    brandSettingsSource,
    /src=\{values\.logoPath\}[\s\S]*?width=\{34\}[\s\S]*?height=\{34\}[\s\S]*?unoptimized/,
  );
});

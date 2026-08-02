import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const overviewSource = readFileSync("components/projects/ProductionOverview.tsx", "utf8");
const overviewStyles = readFileSync("components/projects/ProductionOverview.module.css", "utf8");
const uploadDialogSource = readFileSync("components/projects/AuthoritativeUploadDialog.tsx", "utf8");
const uploadDialogStyles = readFileSync("components/projects/AuthoritativeUploadDialog.module.css", "utf8");
const projectsSource = readFileSync("app/(dashboard)/projects/page.tsx", "utf8");
const folderTreeSource = readFileSync("components/projects/FolderTree.tsx", "utf8");
const shellSource = readFileSync("components/Shell.tsx", "utf8");
const shellStyles = readFileSync("components/Shell.module.css", "utf8");
const brandSource = readFileSync("components/brand/CoProductionBrand.tsx", "utf8");
const canonicalMark = readFileSync("public/brand/co-videopro-canonical.png");
const runtimeMark = readFileSync("public/brand/co-videopro-canonical-runtime.png");
const suppliedMark = readFileSync("public/brand/co-videopro-color-supplied.png");
const suppliedBlueMark = readFileSync("public/brand/co-videopro-blue-supplied.png");

test("projects remain in the canonical bright shell with exact supplied Co-VideoPro assets", () => {
  assert.equal(suppliedMark.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(suppliedMark.readUInt32BE(16), 7296);
  assert.equal(suppliedMark.readUInt32BE(20), 4096);
  assert.equal(
    createHash("sha256").update(suppliedMark).digest("hex"),
    "9abeece51f42867ed3888e9ebda7c223378f54ff0709a8e195c2e1087ba9d7f7",
  );
  assert.equal(suppliedBlueMark.readUInt32BE(16), 1360);
  assert.equal(suppliedBlueMark.readUInt32BE(20), 1024);
  assert.equal(
    createHash("sha256").update(suppliedBlueMark).digest("hex"),
    "17d129841f6c2b78ad1afac402fa5c389e4c6657278ecd133eecf6948218f788",
  );
  assert.equal(canonicalMark.readUInt32BE(16), 786);
  assert.equal(canonicalMark.readUInt32BE(20), 565);
  assert.equal(
    createHash("sha256").update(canonicalMark).digest("hex"),
    "7d7119adcb6a7e3bccc52148475154d4d1dcfe2614ebbed813271c765b4535f7",
  );
  assert.equal(runtimeMark.readUInt32BE(16), 786);
  assert.equal(runtimeMark.readUInt32BE(20), 565);
  assert.equal(
    createHash("sha256").update(runtimeMark).digest("hex"),
    "7d7119adcb6a7e3bccc52148475154d4d1dcfe2614ebbed813271c765b4535f7",
  );
  assert.match(shellSource, /<CoProductionBrand/);
  assert.match(shellSource, /className=\{styles\.mobileWordmark\}[\s\S]*?>co-videopro<\/span>/);
  assert.match(shellStyles, /\.mobileWordmark\s*\{[\s\S]*?font-size:\s*1\.08rem/);
  assert.match(
    shellStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.brandLockup\s*\{[\s\S]*?display:\s*none[\s\S]*?\.mobileWordmark\s*\{[\s\S]*?display:\s*inline-block/,
  );
  assert.match(
    brandSource,
    /const CANONICAL_SOURCE = "\/brand\/co-videopro-color-supplied\.png"/,
  );
  assert.match(brandSource, /src=\{CANONICAL_SOURCE\}/);
  assert.match(brandSource, /unoptimized: true/);
  assert.match(brandSource, /loading: priority \? "eager"/);
  assert.match(brandSource, /fetchPriority: priority \? "high"/);
  assert.doesNotMatch(overviewSource, /heroArtwork|What will we create today\?|<svg\b|data:image/i);
});

test("default projects route exposes the locked project-first operating surface", () => {
  for (const marker of [
    "Active projects",
    "Production pipeline",
    "Latest versions",
    "Live activity",
    "Decision queue",
    "Studio controls",
  ]) {
    assert.match(overviewSource, new RegExp(marker.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  }

  assert.match(overviewSource, /className=\{styles\.desktopComposition\}/);
  assert.match(overviewSource, /className=\{styles\.mobileComposition\}/);
  assert.match(overviewSource, /setProjectFilter/);
  assert.match(overviewSource, /setProjectQuery/);
  assert.match(overviewSource, /setMobileView/);
  assert.match(projectsSource, /<ProductionOverview/);
  assert.match(projectsSource, /useSearchParams\(\)/);
  assert.match(projectsSource, /searchParams\.get\("project"\)/);
  assert.match(projectsSource, /searchParams\.get\("folder"\)/);
  assert.match(folderTreeSource, /onOverviewSelect/);
  assert.doesNotMatch(overviewSource, /Quick start|Recent projects|ProductionControlCenter/);
});

test("overview controls preserve exact routing and canonical URL-owned selection", () => {
  assert.match(overviewSource, /href=\{getMediaAssetHref\(asset, demoMode\)\}/);
  assert.match(overviewSource, /getMediaAssetHref\(latestAsset, demoMode\)/);
  assert.match(overviewSource, /projectHref\(project\.id, demoMode\)/);
  assert.match(overviewSource, /href=\{\`\/projects\/new/);
  assert.match(overviewSource, /href=\{\`\/reviews/);
  assert.match(overviewSource, /href=\{\`\/library/);
  assert.match(overviewSource, /section=security/);
  assert.match(overviewSource, /onClick=\{onUpload\}/);
  assert.match(overviewSource, /onOpenProject\(project\.id\)/);
  assert.match(overviewSource, /encodeURIComponent\(projectId\)/);
  assert.match(projectsSource, /function buildProjectCockpitHref\(projectId: string, demoMode: boolean\)/);
  assert.match(
    projectsSource,
    /router\.push\(buildProjectCockpitHref\(projectId, demoMode\), \{ scroll: false \}\)/,
  );
  assert.match(projectsSource, /router\.push\([\s\S]*buildProjectLibraryHref/);
  assert.match(projectsSource, /onSelectionChange=\{\(selection\) =>/);
  assert.doesNotMatch(projectsSource, /setActiveProject|useState\([^\n]*activeProject/);
});

test("overview and folder uploads use the same guarded ingest authority", () => {
  assert.match(projectsSource, /import AuthoritativeUploadDialog/);
  assert.match(projectsSource, /function requestOverviewUpload\(\)/);
  assert.match(projectsSource, /onUpload=\{requestOverviewUpload\}/);
  assert.match(projectsSource, /<AuthoritativeUploadDialog/);
  assert.match(uploadDialogSource, /import AssetUpload/);
  assert.match(uploadDialogSource, /<AssetUpload/);
  assert.match(uploadDialogSource, /projectId=\{projectId\}/);
  assert.match(uploadDialogSource, /Resumable transfer/);
  assert.match(uploadDialogStyles, /@media \(max-width: 760px\)/);

  assert.match(projectsSource, /const folderId = activeProjectId \? activeFolderId : null/);
  assert.match(projectsSource, /setUploadTarget\(\{ projectId, folderId: activeProjectId \? activeFolderId : null \}\)/);
  assert.match(projectsSource, /folderId=\{uploadTarget\.folderId \?\? undefined\}/);
  assert.match(projectsSource, /fileInputRef\.current\?\.click\(\)/);
  assert.doesNotMatch(projectsSource, /createSupabaseBrowser|\.getPublicUrl\(|\.from\("deliverables"\)/);
});

test("desktop and mobile use locked compositions without horizontal carousel overflow", () => {
  assert.match(overviewStyles, /grid-template-columns:\s*minmax\(0, 1fr\) 286px/);
  assert.match(overviewStyles, /grid-template-columns:\s*repeat\(5, minmax\(112px, 1fr\)\) auto/);
  assert.match(overviewStyles, /@media \(max-width: 760px\)/);
  assert.match(overviewStyles, /\.desktopComposition\s*\{[\s\S]*?display:\s*none/);
  assert.match(overviewStyles, /\.mobileComposition\s*\{[\s\S]*?display:\s*block/);
  assert.match(
    overviewStyles,
    /\.mobileSegmented\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    overviewStyles,
    /\.statusStrip > a:nth-child\(2\),[\s\S]*?\.statusStrip > a:nth-child\(3\)[\s\S]*?display:\s*none/,
  );
  assert.doesNotMatch(
    overviewStyles,
    /\.statusStrip > a:nth-child\(4\),[\s\S]*?\.statusStrip > a:nth-child\(5\)[\s\S]*?display:\s*none/,
  );
  assert.doesNotMatch(overviewStyles, /overflow-x:\s*auto/);
  assert.doesNotMatch(overviewSource, /workspace-shell|workspace-header|workspace-primary-nav/);
});

test("desktop and mobile share filtered projects and preserve eager-first thumbnail loading", () => {
  assert.match(overviewSource, /filteredSummaries\.map\([\s\S]*projectIndex/);
  assert.equal(
    overviewSource.match(/loading=\{projectIndex === 0 \? "eager" : "lazy"\}/g)?.length,
    2,
  );
  assert.equal(
    overviewSource.match(/fetchPriority=\{projectIndex === 0 \? "high" : "auto"\}/g)?.length,
    2,
  );
  assert.match(overviewSource, /\["projects", "Projects", filteredSummaries\.length\]/);
  assert.doesNotMatch(overviewSource, /\{summaries\.map\(/);
  assert.match(overviewSource, /recentAssets\.map\(\(asset, assetIndex\) =>/);
  assert.equal(
    overviewSource.match(/loading=\{assetIndex === 0 \? "eager" : "lazy"\}/g)?.length,
    1,
  );
  assert.equal(
    overviewSource.match(/fetchPriority=\{assetIndex === 0 \? "high" : "auto"\}/g)?.length,
    1,
  );
});

test("mobile tabs own labelled panels and project rows expose one open action", () => {
  for (const id of ["projects", "queue", "pipeline"]) {
    assert.match(overviewSource, new RegExp(`id="mobile-${id}-panel"`));
    assert.match(overviewSource, new RegExp(`aria-labelledby="mobile-${id}-tab"`));
  }
  assert.match(overviewSource, /id=\{`mobile-\$\{id\}-tab`\}/);
  assert.match(overviewSource, /aria-controls=\{`mobile-\$\{id\}-panel`\}/);
  assert.match(overviewSource, /tabIndex=\{mobileView === id \? 0 : -1\}/);
  assert.match(overviewSource, /onKeyDown=\{\(event\) => handleMobileTabKeyDown\(event, id\)\}/);
  assert.match(overviewSource, /event\.key === "ArrowRight"/);
  assert.match(overviewSource, /event\.key === "ArrowLeft"/);
  assert.match(
    overviewSource,
    /<span className=\{styles\.rowAction\} aria-hidden="true">/,
  );
  assert.doesNotMatch(
    overviewSource,
    /<button className=\{styles\.rowAction\}[\s\S]*?onOpenProject\(project\.id\)/,
  );
});

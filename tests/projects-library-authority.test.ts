import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const projectsPage = source("../app/(dashboard)/projects/page.tsx");
const uploadDialog = source("../components/projects/AuthoritativeUploadDialog.tsx");
const assetsRoute = source("../app/api/assets/route.ts");
const foldersRoute = source("../app/api/folders/route.ts");

test("production bulk sharing resolves current versions and uses the guarded batch route", () => {
  assert.match(projectsPage, /fetch\(`\/api\/assets\/\$\{encodeURIComponent\(asset\.id\)\}\/versions`/);
  assert.match(projectsPage, /versions\.find\(\(version\) => version\.is_current\) \?\? versions\[0\]/);
  assert.match(projectsPage, /fetch\("\/api\/assets\/batch-share", \{/);
  assert.match(projectsPage, /operation: "create"/);
  assert.match(projectsPage, /policy_template_id: "standard-review"/);
  assert.match(projectsPage, /notification: \{ action: "none", channels: \[\] \}/);
  assert.match(projectsPage, /createdItems\.length !== items\.length/);
});

test("demo sharing is gated and production never falls through to demo link creation", () => {
  assert.match(projectsPage, /\{demoMode && shareOpen \? \([\s\S]*?<DemoShareModal/);
  assert.match(projectsPage, /if \(demoMode\) \{[\s\S]*?setShareOpen\(true\);[\s\S]*?return;[\s\S]*?\}/);
  assert.match(projectsPage, /void shareLiveAssets\(\[assetId\]\)/);
  assert.doesNotMatch(
    projectsPage,
    /\{shareOpen \? \([\s\S]*?<DemoShareModal/,
    "the demo modal must never be selected solely by shareOpen",
  );
});

test("project and folder uploads freeze the exact guarded ingest target", () => {
  assert.match(projectsPage, /type UploadTarget = \{[\s\S]*?projectId: string;[\s\S]*?folderId: string \| null;/);
  assert.match(projectsPage, /setUploadTarget\(\{ projectId: resolvedUploadProjectId, folderId: null \}\)/);
  assert.match(projectsPage, /setUploadTarget\(\{ projectId, folderId: activeProjectId \? activeFolderId : null \}\)/);
  assert.match(projectsPage, /projectId=\{uploadTarget\.projectId\}/);
  assert.match(projectsPage, /folderId=\{uploadTarget\.folderId \?\? undefined\}/);
  assert.match(uploadDialog, /<AssetUpload[\s\S]*?projectId=\{projectId\}[\s\S]*?folderId=\{folderId\}/);
  assert.doesNotMatch(projectsPage, /createSupabaseBrowser|\.getPublicUrl\(|\.from\("deliverables"\)/);
});

test("inline project creation uses the idempotent API contract and surfaces failures", () => {
  assert.match(projectsPage, /request_id: crypto\.randomUUID\(\)/);
  assert.match(projectsPage, /credentials: "same-origin"/);
  assert.match(projectsPage, /Project creation returned an invalid receipt/);
  assert.match(projectsPage, /setCreatingProject\(true\)/);
  assert.match(projectsPage, /disabled=\{creatingProject\}/);
  assert.doesNotMatch(projectsPage, /catch \{\}/);
});

test("library refreshes are all-or-nothing, preserve snapshots, and expose retry", () => {
  assert.match(projectsPage, /Promise\.all\(\[[\s\S]*?loadCollection<Project>[\s\S]*?loadCollection<FolderNode>[\s\S]*?loadCollection<MediaAsset>/);
  assert.match(projectsPage, /if \(!response\.ok\) throw new Error/);
  assert.match(projectsPage, /setRemoteSnapshotReady\(true\)/);
  assert.match(projectsPage, /setLibraryError\("The project library could not be loaded\. Your last valid view was kept\."\)/);
  assert.match(projectsPage, /libraryError && !remoteSnapshotReady/);
  assert.match(projectsPage, /"Retry"/);
  assert.doesNotMatch(projectsPage, /r\.ok \? r\.json\(\) : \{ items: \[\] \}/);
  assert.doesNotMatch(projectsPage, /\.catch\(\(\) => \{\}\)/);
});

test("asset and folder list authority failures are bounded non-success responses", () => {
  for (const route of [assetsRoute, foldersRoute]) {
    assert.match(route, /getSupabaseDataSchema\(\) === "public"/);
    assert.match(route, /temporarily unavailable/);
    assert.match(route, /status: 503/);
    assert.match(route, /"Cache-Control": "no-store"/);
    assert.doesNotMatch(route, /catch[^]*?return NextResponse\.json\(\{ items: \[\] \}\)/);
  }
  assert.doesNotMatch(assetsRoute, /if \(error\)[^]*?NextResponse\.json\(\{ items: \[\] \}\)/);
  assert.doesNotMatch(foldersRoute, /if \(error\)[^]*?NextResponse\.json\(\{ items: \[\] \}\)/);
});

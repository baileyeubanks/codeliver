import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const projectsPage = source("../app/(dashboard)/projects/page.tsx");
const folderTree = source("../components/projects/FolderTree.tsx");
const overview = source("../components/projects/ProductionOverview.tsx");
const mediaCard = source("../components/projects/MediaCard.tsx");
const assetCollectionRoute = source("../app/api/projects/[id]/assets/route.ts");
const demoWorkspace = source("../lib/demo/workspace.ts");
const globalStyles = source("../app/globals.css");

test("project roots and folders keep separate identities and filters", () => {
  assert.match(folderTree, /project_id\?: string/);
  assert.match(folderTree, /kind\?: "project" \| "folder"/);
  assert.match(folderTree, /projectId: string;\s*folderId: string \| null;/s);
  assert.match(projectsPage, /asset\.project_id === activeProjectId/);
  assert.match(projectsPage, /asset\.folder_id === activeFolderId/);
  assert.doesNotMatch(projectsPage, /asset\.project_id === activeFolderId/);
  assert.match(demoWorkspace, /folder_id: "schneider-podcast"/);
  assert.match(demoWorkspace, /folder_id: "schneider-roadshow"/);
});

test("overview, project, and folder selection is URL-owned", () => {
  assert.match(projectsPage, /useSearchParams\(\)/);
  assert.match(projectsPage, /params\.set\("project", projectId\)/);
  assert.match(projectsPage, /params\.set\("folder", folderId\)/);
  assert.match(projectsPage, /router\.push\([\s\S]*buildProjectLibraryHref/);
  assert.match(projectsPage, /onSelectionChange=\{\(selection\) =>/);
  assert.doesNotMatch(projectsPage, /setActiveProject|useState\([^\n]*activeProject/);
  assert.match(projectsPage, /projects\.find\(\(project\) => project\.id === requestedProjectId\)/);
  assert.match(projectsPage, /router\.replace\([\s\S]*requestedProject\?\.id \?\? null/);
});

test("uploads use the folder owner project and persist only a validated folder", () => {
  assert.match(projectsPage, /const folderId = activeProjectId \? activeFolderId : null/);
  assert.match(projectsPage, /setUploadTarget\(\{ projectId, folderId: activeProjectId \? activeFolderId : null \}\)/);
  assert.match(projectsPage, /<AuthoritativeUploadDialog[\s\S]*?projectId=\{uploadTarget\.projectId\}/);
  assert.match(projectsPage, /folderId=\{uploadTarget\.folderId \?\? undefined\}/);
  assert.doesNotMatch(projectsPage, /createSupabaseBrowser|\.getPublicUrl\(|\.from\("deliverables"\)/);

  assert.match(
    assetCollectionRoute,
    /\.from\("folders"\)[\s\S]*\.eq\("id", requestedFolderId\)[\s\S]*\.eq\("project_id", id\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.match(assetCollectionRoute, /folder_id: folderId/);
  assert.match(assetCollectionRoute, /folder_id is invalid/);
  assert.match(assetCollectionRoute, /destination folder could not be verified/);
});

test("recent production cards target the exact asset review route", () => {
  assert.match(mediaCard, /encodeURIComponent\(asset\.project_id\)/);
  assert.match(mediaCard, /encodeURIComponent\(asset\.id\)/);
  assert.match(mediaCard, /`\/projects\/\$\{projectId\}\/assets\/\$\{assetId\}/);
  assert.match(overview, /getMediaAssetHref\(latestAsset, demoMode\)/);
});

test("the project library has one page scroller, a resizable desktop rail, and an overlay mobile rail", () => {
  assert.doesNotMatch(projectsPage, /100vh|projects-content flex-1 overflow-y-auto/);
  assert.match(globalStyles, /\.workspace-shell \.projects-content\s*\{[\s\S]*?overflow: visible;/);
  assert.match(globalStyles, /@media \(max-width: 768px\)[\s\S]*?\.workspace-shell \.projects-folder-rail\s*\{[\s\S]*?position: fixed;/);
  assert.match(globalStyles, /\.projects-folder-footer\s*\{[\s\S]*?flex: 0 0 auto;/);
  assert.match(folderTree, /className="projects-folder-backdrop"/);
  assert.match(folderTree, /className="projects-folder-scroll py-2"/);
  assert.match(folderTree, /className="projects-folder-footer/);
  assert.match(folderTree, /const \[railWidth, setRailWidth\] = useState\(272\)/);
  assert.match(folderTree, /Math\.max\(240, Math\.min\(360/);
  assert.match(folderTree, /className="projects-rail-resize"/);
  assert.match(folderTree, /className="projects-rail-reopen"/);
  assert.match(projectsPage, /data-sidebar-state=\{sidebarOverride === null \? "auto"/);
  assert.match(globalStyles, /transform: translateX\(-104%\)/);
  assert.match(globalStyles, /--project-rail-width/);
  assert.doesNotMatch(globalStyles, /\.projects-rail-reopen,\s*\.projects-rail-resize/);
});

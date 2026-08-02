import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

const cockpit = source("components/projects/ProjectCockpit.tsx");
const projectHome = source("components/projects/ProjectOverviewHome.tsx");
const projectPage = source("app/(dashboard)/projects/[id]/page.tsx");
const demoWorkspace = source("lib/demo/workspace.ts");
const demoStore = source("lib/demo/workspace-store.ts");

test("a bare project route opens the project home instead of choosing review media", () => {
  assert.match(cockpit, /assets\.find\(\(asset\) => asset\.id === requestedAssetId\)\?\.id \?\? ""/);
  assert.doesNotMatch(cockpit, /assets\.find\(\(asset\) => asset\.status === "in_review"\)\?\.id/);
  assert.match(cockpit, /activeAsset \? \([\s\S]*?<ProjectOverviewHome/);
  assert.match(cockpit, /params\.delete\("asset"\)/);
  assert.match(cockpit, /params\.set\("asset", asset\.id\)[\s\S]*?params\.set\("view", "review"\)/);
});

test("the project home exposes cover, folders, and asset-scoped review authority", () => {
  assert.match(projectHome, /src=\{coverPath\}/);
  assert.match(cockpit, /workspace\.settings\.brand\.coverPath/);
  assert.match(projectHome, /Project \/ Sequences/);
  assert.match(projectHome, /buildProjectSequences/);
  assert.match(projectHome, /Version \{asset\.version_count \?\? 1\}/);
  assert.match(projectHome, /asset\.comment_count \?\? 0/);
  assert.match(projectHome, /approvalCopy\(asset\)/);
  assert.match(projectHome, /ProjectSequenceLibrary/);
});

test("production and demo routes supply the sequence folder authority", () => {
  assert.match(projectPage, /fetch\(`\/api\/folders\?project_id=\$\{encodeURIComponent\(id\)\}`/);
  assert.match(projectPage, /folders=\{demoWorkspace\.folders\}/);
  assert.match(projectPage, /folders=\{remoteFolders\}/);
  assert.match(demoWorkspace, /id: "ica-executive-interviews"/);
  assert.match(demoWorkspace, /id: "ica-roadshow-master"/);
  assert.match(demoStore, /mergeSeededFolderTrees/);
  assert.match(demoStore, /folder_id: asset\.folder_id \?\? seededAssets\.get\(asset\.id\)\?\.folder_id \?\? null/);
});

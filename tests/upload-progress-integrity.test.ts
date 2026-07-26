import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectWorkspaceClientSource = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectWorkspaceClient.tsx"),
  "utf8",
);
const cockpitSource = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);

test("project uploads derive progress from stored bytes instead of timers", () => {
  assert.doesNotMatch(projectWorkspaceClientSource, /window\.setTimeout/);
  assert.doesNotMatch(projectWorkspaceClientSource, /const wait =/);
  assert.match(projectWorkspaceClientSource, /putDemoMediaBlob\([\s\S]*?onProgress:/);
  assert.match(projectWorkspaceClientSource, /bytesStored/);
  assert.match(projectWorkspaceClientSource, /bytesTotal/);
  assert.match(projectWorkspaceClientSource, /percent/);
  assert.match(projectWorkspaceClientSource, /formatFileSize/);
  assert.doesNotMatch(
    projectWorkspaceClientSource,
    /Preparing a browser-friendly review representation/,
  );
});

test("project uploads register inspected media instead of invented demo metadata", () => {
  assert.match(projectWorkspaceClientSource, /inspectSelectedMedia\(file\)/);
  assert.match(projectWorkspaceClientSource, /inspection\.kind/);
  assert.match(projectWorkspaceClientSource, /inspection\.duration\.status === "available"/);
  assert.match(projectWorkspaceClientSource, /demo_thumbnail_id/);
  assert.doesNotMatch(projectWorkspaceClientSource, /duration_seconds:\s*64/);
  assert.doesNotMatch(projectWorkspaceClientSource, /thumbnail_url:\s*"\/demo\//);
});

test("demo progress steps describe work the browser actually performs", () => {
  assert.match(cockpitSource, /Read selected media/);
  assert.match(cockpitSource, /Store local source/);
  assert.match(cockpitSource, /Register project record/);
  assert.doesNotMatch(
    cockpitSource,
    /uploadStatus\.mode === "demo" \? "Register local preview" : "Transfer to media storage"/,
  );
});

test("the terminal upload action opens the newly registered media", () => {
  assert.match(cockpitSource, /assetId\?: string/);
  assert.match(projectWorkspaceClientSource, /assetId: addedAssets\.at\(-1\)\?\.id/);
  assert.match(
    projectWorkspaceClientSource,
    /if \(uploadStatus\?\.phase === "complete" && uploadStatus\.assetId\)[\s\S]*?router\.push\(\s*buildInternalDemoAssetHref\(id, uploadStatus\.assetId\)/,
  );
});

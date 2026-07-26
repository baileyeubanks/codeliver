import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath: string) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

test("the production Projects library uses the canonical TUS uploader only", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");
  const uploader = source("components/assets/AssetUpload.tsx");

  assert.match(projectsPage, /import AssetUpload from "@\/components\/assets\/AssetUpload"/);
  assert.match(projectsPage, /<AssetUpload\b/);
  assert.match(projectsPage, /inputId=\{AUTHORITATIVE_UPLOAD_INPUT_ID\}/);
  assert.match(projectsPage, /onUploadComplete=\{refreshRemoteAssets\}/);
  assert.match(
    projectsPage,
    /remoteProjects\.some\(\(project\) => project\.id === activeProject\)/,
  );
  assert.match(projectsPage, /remoteProjects\.map\(\(project\) => \(\{/);
  assert.doesNotMatch(projectsPage, /fetch\(["']\/api\/folders["']/);
  assert.match(uploader, /endpoint:\s*"\/api\/upload\/tus"/);

  assert.doesNotMatch(projectsPage, /createSupabaseBrowser/);
  assert.doesNotMatch(projectsPage, /\.storage\b/);
  assert.doesNotMatch(projectsPage, /\.from\(["']deliverables["']\)/);
  assert.doesNotMatch(
    projectsPage,
    /fetch\(`\/api\/projects\/\$\{[^}]+\}\/assets`[\s\S]*?method:\s*"POST"/,
  );
});

test("asset-only project uploads and arbitrary-reference V2 writes are retired", () => {
  for (const [relativePath, retirement] of [
    [
      "app/api/projects/[id]/assets/route.ts",
      /legacyUploadRetiredResponse\(\)/,
    ],
    [
      "app/api/assets/[id]/versions/route.ts",
      /versionUploadRetiredResponse\(\)/,
    ],
  ] as const) {
    const route = source(relativePath);
    const postStart = route.indexOf("function POST");
    assert.notEqual(postStart, -1, `${relativePath} must expose a POST tombstone`);
    const postBlock = route.slice(postStart);

    assert.match(postBlock, retirement, relativePath);
    assert.doesNotMatch(postBlock, /\.from\(["']assets["']\)/, relativePath);
    assert.doesNotMatch(postBlock, /\.from\(["']versions["']\)/, relativePath);
    assert.doesNotMatch(postBlock, /\.insert\(|\.update\(/, relativePath);
    assert.doesNotMatch(postBlock, /\.json\(\)/, relativePath);
  }
});

test("asset readers retain JWT authority while using migration-compatible projections", () => {
  const collection = source("app/api/assets/route.ts");
  const scoped = source("app/api/projects/[id]/assets/route.ts");

  assert.doesNotMatch(collection, /\.select\(["']\*/);
  assert.match(collection, /SAFE_ASSET_COLUMNS/);
  assert.match(collection, /getSupabaseDataSchema\(\) === "co_production"/);
  assert.match(collection, /if \(!isolated\) \{/);
  assert.match(collection, /\.is\("deleted_at", null\)/);

  assert.match(
    scoped,
    /getProjectAccess\(\s*id,\s*user\.id,\s*"viewer",\s*authSupabase,\s*\)/,
  );
  assert.match(scoped, /authSupabase[\s\S]*?\.from\("assets"\)/);
  assert.doesNotMatch(scoped, /\bmetadata\b/);
  assert.match(scoped, /\.eq\("project_id", id\)[\s\S]*?\.is\("deleted_at", null\)/);

  const detail = source("app/api/assets/[id]/route.ts");
  assert.doesNotMatch(detail, /status, metadata, position/);
  assert.doesNotMatch(detail, /body\.metadata|updates\.metadata/);
});

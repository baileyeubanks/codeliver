import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routes = [
  "app/api/folders/route.ts",
  "app/api/projects/[id]/route.ts",
  "app/api/projects/[id]/assets/route.ts",
] as const;

test("projects and folders routes use stable no-store API responses", () => {
  for (const relativePath of routes) {
    const source = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
    assert.match(source, /@\/lib\/api\/responses/);
    assert.match(source, /backendUnavailable\(\)/);
    assert.match(source, /apiError\(/);
    assert.doesNotMatch(source, /NextResponse\.json/);
    assert.doesNotMatch(source, /error\.message/);
  }
});

test("folder mutations authorize and scoped asset reads preserve JWT authority", () => {
  const folders = readFileSync(resolve(repositoryRoot, routes[0]), "utf8");
  const assets = readFileSync(resolve(repositoryRoot, routes[2]), "utf8");

  assert.match(folders, /getProjectAccess\(project_id, user\.id, "editor", supabase\)/);
  assert.match(folders, /select\("project_id"\)/);
  assert.match(folders, /select\("parent_id, project_id"\)/);
  assert.match(
    assets,
    /getProjectAccess\(\s*id,\s*user\.id,\s*"viewer",\s*authSupabase,\s*\)/,
  );
  assert.match(assets, /legacyUploadRetiredResponse\(\)/);
  assert.doesNotMatch(assets, /\.from\("assets"\)\s*\.insert\(/);
});

test("confirmed missing records remain 404 while database failures are 503", () => {
  const folders = readFileSync(resolve(repositoryRoot, routes[0]), "utf8");
  const project = readFileSync(resolve(repositoryRoot, routes[1]), "utf8");

  assert.match(folders, /"FOLDER_NOT_FOUND", 404/);
  assert.match(project, /"PROJECT_NOT_FOUND", 404/);
  assert.match(folders, /if \(folderError\) return backendUnavailable\(\)/);
  assert.match(project, /if \(error\) return backendUnavailable\(\)/);
});

test("folder moves reject cycles and deletion is one atomic RPC", () => {
  const folders = readFileSync(resolve(repositoryRoot, routes[0]), "utf8");
  const migration = readFileSync(
    resolve(
      repositoryRoot,
      "supabase/migrations/20260725112000_folder_integrity_atomic_delete.sql",
    ),
    "utf8",
  );

  assert.match(folders, /A folder cannot be its own parent/);
  assert.match(folders, /A folder cannot be moved into one of its descendants/);
  assert.match(folders, /\.rpc\(\s*"delete_folder_atomically"/);
  assert.doesNotMatch(folders, /\.from\("folders"\)\s*\.update\(\{ parent_id:/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.delete_folder_atomically/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION co_production\.delete_folder_atomically/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /UPDATE co_production\.folders/);
  assert.match(migration, /UPDATE co_production\.assets/);
});

test("projects collection normalizes malformed bodies and every response path", () => {
  const projects = readFileSync(resolve(repositoryRoot, "app/api/projects/route.ts"), "utf8");

  assert.match(projects, /MAX_PROJECT_BODY_BYTES/);
  assert.match(projects, /Project body must be an object/, "malformed JSON is a stable 400");
  assert.match(projects, /Project body is too large/, "declared oversized payloads are rejected");
  assert.match(projects, /apiJson\(/);
  assert.match(projects, /apiError\(/);
  assert.match(projects, /backendUnavailable\(\)/);
  assert.doesNotMatch(projects, /NextResponse\.json/);
  assert.doesNotMatch(projects, /error\.message|error\.details|error\.hint/);
});
